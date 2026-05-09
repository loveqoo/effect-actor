import { Cause, Chunk, Option } from "effect";

// Supervision strategy ADT + 매처 + cause→error squash + rule 순회 (ADR-034, M4).
// 사이클 1: ADT + 빌더. 사이클 2: pickStrategy 추가 (Resume 동작 분기 입력).
// 사이클 3: Restart 분기에서 그대로 재사용.
// 사이클 4: 매처 헬퍼 (matchTag, matchInstance 등) + 더 정교한 cause squash.

// Strategy ADT — Akka Typed 의 SupervisorStrategy.{resume, restart, stop} 매핑.
// (M5 에서 restartWithBackoff + withLimit 추가 예정.)
export type Strategy =
  | { readonly _tag: "Resume" }
  | { readonly _tag: "Restart" }
  | { readonly _tag: "Stop" };

// 종결자 같은 패턴 — 참조 동일성 유지 (매번 새 객체 만들 필요 없음).
const RESUME: Strategy = { _tag: "Resume" };
const RESTART: Strategy = { _tag: "Restart" };
const STOP: Strategy = { _tag: "Stop" };

// 매처 헬퍼 (ADR-036, M4 사이클 4) — Akka 의 `[E]` 타입 매칭 표면을 TS 로 옮긴 합성 함수.
// matchInstance — class instanceof 매칭 (가장 일반적).
// 생성자 args 는 lenient 하게 — builtin Error (message?: string, options?), Tagged 등
// 다양한 시그너처 모두 받기 위해 `any[]` 채택. `ReadonlyArray<unknown>` 은 builtin Error 의 옵셔널
// 인자 시그너처와 호환 X (TS 의 contravariant arg 검사).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtor<T> = new (...args: any[]) => T;
const matchInstance =
  <T>(Ctor: AnyCtor<T>): ErrorMatcher =>
  (e: unknown): boolean =>
    e instanceof Ctor;

// matchTag — Effect.TaggedError / Data.tagged / 사용자 tagged ADT 매칭. error 객체 + _tag === tag.
const matchTag =
  (tag: string): ErrorMatcher =>
  (e: unknown): boolean =>
    typeof e === "object" &&
    e !== null &&
    "_tag" in e &&
    (e as { _tag: unknown })._tag === tag;

// matchAll — catch-all. () => true.
const matchAll: ErrorMatcher = (_e) => true;

export const Strategies = {
  resume: RESUME,
  restart: RESTART,
  stop: STOP,
  matchInstance,
  matchTag,
  matchAll,
};

// 예외 매처 — runInterpreter 의 catchAllCause 에서 squash 한 error 에 적용.
// 사이클 4 에서 헬퍼 (matchTag, matchInstance 등) 추가 예정.
export type ErrorMatcher = (error: unknown) => boolean;

// 한 supervisor 규칙 — matcher + strategy 쌍. SupervisedBehavior.rules 의 원소.
export interface SupervisorRule {
  readonly match: ErrorMatcher;
  readonly strategy: Strategy;
}

// cause → error 추출 (사이클 2). cause 가 fail 이면 그 값, defect 면 첫 defect, 그 외 (interrupted 등) 는 cause 자체.
// 사이클 4 에서 multi-cause / nested cause 의 정교한 처리 검토.
const extractError = (cause: Cause.Cause<unknown>): unknown => {
  const failOpt = Cause.failureOption(cause);
  if (Option.isSome(failOpt)) return failOpt.value;
  const defects = Cause.defects(cause);
  if (Chunk.size(defects) > 0) return Chunk.unsafeHead(defects);
  return cause;
};

// pickStrategy — supervisor rules sequential 순회, 첫 매치 strategy 채택. 미매치 또는 빈 rules = 기본 stop.
// _체인 순서 = 매처 순회 순서_ (ADR-034). 빌더에서 _뒤에 append_ → 가장 안쪽 (먼저 호출) 이 가장 specific.
export const pickStrategy = (
  rules: ReadonlyArray<SupervisorRule>,
  cause: Cause.Cause<unknown>,
): Strategy => {
  if (rules.length === 0) return STOP;
  const error = extractError(cause);
  for (const rule of rules) {
    if (rule.match(error)) return rule.strategy;
  }
  return STOP;
};
