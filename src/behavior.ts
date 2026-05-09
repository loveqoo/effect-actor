import type { Effect } from "effect";
import type { ActorContext } from "./context.js";
import { MailboxPolicy } from "./mailbox.js";
import type { Signal } from "./signal.js";
import type {
  ErrorMatcher,
  Strategy,
  SupervisorRule,
} from "./supervision.js";

// Behavior<Msg> ADT — 액터의 _다음 동작_ 을 표현하는 불변 값.
// 사이클 2: ADT + 빌더 + 메타 추출 (sync 부분). 해석기는 사이클 3.
// M2 사이클 1: Receive 에 onSignal 추가 + receiveSignal fluent 빌더.

// handler 의 fail 채널은 unknown — supervision 외피 (ADR-020) 가 catchAllCause 로 받음.
export type BehaviorEffect<Msg> = Effect.Effect<Behavior<Msg>, unknown>;

// Receive 케이스 — fluent receiveSignal 메서드 포함 (Akka Typed Behaviors.receive(...).receiveSignal(...) 모양).
// onSignal 은 _명시 null_ — 신호 핸들러 미부착.
export interface ReceiveBehavior<Msg> {
  readonly _tag: "Receive";
  readonly handle: (ctx: ActorContext<Msg>, msg: Msg) => BehaviorEffect<Msg>;
  readonly onSignal:
    | ((ctx: ActorContext<Msg>, signal: Signal) => BehaviorEffect<Msg>)
    | null;
  readonly receiveSignal: (
    handle: (ctx: ActorContext<Msg>, signal: Signal) => BehaviorEffect<Msg>,
  ) => ReceiveBehavior<Msg>;
}

// Supervise 래퍼 — fluent onFailure 체이닝 (Akka Typed Behaviors.supervise(b).onFailure(...) 모양, ADR-034).
// rules 순서 = 체인 순서 = 가장 안쪽 (먼저 호출) 이 가장 specific. 사이클 4 에서 sequential 순회.
export interface SupervisedBehavior<Msg> {
  readonly _tag: "Supervise";
  readonly inner: Behavior<Msg>;
  readonly rules: ReadonlyArray<SupervisorRule>;
  readonly onFailure: (
    match: ErrorMatcher,
    strategy: Strategy,
  ) => SupervisedBehavior<Msg>;
}

export type Behavior<Msg> =
  | { readonly _tag: "Same" }
  | { readonly _tag: "Stopped" }
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Unhandled" }
  | ReceiveBehavior<Msg>
  | {
      readonly _tag: "Setup";
      readonly init: (ctx: ActorContext<Msg>) => BehaviorEffect<Msg>;
    }
  | {
      readonly _tag: "WithMailbox";
      readonly inner: Behavior<Msg>;
      readonly policy: MailboxPolicy;
    }
  | SupervisedBehavior<Msg>;

const SAME: Behavior<never> = { _tag: "Same" };
const STOPPED: Behavior<never> = { _tag: "Stopped" };
const EMPTY: Behavior<never> = { _tag: "Empty" };
const UNHANDLED: Behavior<never> = { _tag: "Unhandled" };

const makeReceive = <Msg>(
  handle: (ctx: ActorContext<Msg>, msg: Msg) => BehaviorEffect<Msg>,
  onSignal:
    | ((ctx: ActorContext<Msg>, signal: Signal) => BehaviorEffect<Msg>)
    | null,
): ReceiveBehavior<Msg> => ({
  _tag: "Receive",
  handle,
  onSignal,
  receiveSignal: (next) => makeReceive(handle, next),
});

// makeSupervise — Supervise 래퍼 생성. rules 는 _뒤에 append_ (체인 순서 = 매처 순회 순서, ADR-034).
const makeSupervise = <Msg>(
  inner: Behavior<Msg>,
  rules: ReadonlyArray<SupervisorRule>,
): SupervisedBehavior<Msg> => ({
  _tag: "Supervise",
  inner,
  rules,
  onFailure: (match, strategy) =>
    makeSupervise(inner, [...rules, { match, strategy }]),
});

export const Behaviors = {
  same: <Msg>(): Behavior<Msg> => SAME,
  stopped: <Msg>(): Behavior<Msg> => STOPPED,
  empty: <Msg>(): Behavior<Msg> => EMPTY,
  unhandled: <Msg>(): Behavior<Msg> => UNHANDLED,

  receive: <Msg>(
    handle: (ctx: ActorContext<Msg>, msg: Msg) => BehaviorEffect<Msg>,
  ): ReceiveBehavior<Msg> => makeReceive(handle, null),

  receiveMessage: <Msg>(
    handle: (msg: Msg) => BehaviorEffect<Msg>,
  ): ReceiveBehavior<Msg> => makeReceive((_ctx, msg) => handle(msg), null),

  setup: <Msg>(
    init: (ctx: ActorContext<Msg>) => BehaviorEffect<Msg>,
  ): Behavior<Msg> => ({ _tag: "Setup", init }),

  // Mailbox 정책을 부착한 래퍼 (ADR-018, ADR-026).
  // spawn 0단계에서 unwrapMeta 가 벗기고 정책 추출.
  withMailbox: <Msg>(
    inner: Behavior<Msg>,
    policy: MailboxPolicy,
  ): Behavior<Msg> => ({ _tag: "WithMailbox", inner, policy }),

  // Supervisor strategy 부착 빌더 (ADR-034, M4 사이클 1).
  // supervise(b).onFailure(matcher, strategy) 체이닝 — 가장 안쪽이 가장 specific.
  // unwrapMeta 가 rules 추출 → interpreter 의 catchAllCause 가 사이클 2/3 에서 사용.
  supervise: <Msg>(inner: Behavior<Msg>): SupervisedBehavior<Msg> =>
    makeSupervise(inner, []),
};

// 메타 추출 결과 (ADR-026/034, ARCHITECTURE.md §3.1 의 0단계 sync 부분).
// Setup 평가 (init 실행) 는 ctx 의존이라 spawn 흐름에서.
export interface BehaviorMeta<Msg> {
  readonly mailboxPolicy: MailboxPolicy;
  readonly supervisor: ReadonlyArray<SupervisorRule>; // 빈 배열 = 기본 stop (사이클 2/3 에서 사용)
  readonly inner: Behavior<Msg>;
}

// 외곽 래퍼 _가장 바깥_ 것만 채택 (ADR-026/034 Akka semantics).
// _다른 종류_ 래퍼 (WithMailbox + Supervise) 는 양쪽 모두 추출 (어느 순서로 와도). 같은 종류 nested 는 가장 바깥만.
// 구현: 두 종류 각각 _최대 1회_ 벗김 (loop 최대 2회).
export const unwrapMeta = <Msg>(behavior: Behavior<Msg>): BehaviorMeta<Msg> => {
  let mailboxPolicy: MailboxPolicy | null = null;
  let supervisor: ReadonlyArray<SupervisorRule> | null = null;
  let inner: Behavior<Msg> = behavior;

  // 두 종류 래퍼를 어떤 순서로도 잡기 위해 최대 2회 — 같은 종류는 한 번만 벗김.
  for (let i = 0; i < 2; i++) {
    if (inner._tag === "WithMailbox" && mailboxPolicy === null) {
      mailboxPolicy = inner.policy;
      inner = inner.inner;
      continue;
    }
    if (inner._tag === "Supervise" && supervisor === null) {
      supervisor = inner.rules;
      inner = inner.inner;
      continue;
    }
    break;
  }

  return {
    mailboxPolicy: mailboxPolicy ?? MailboxPolicy.unbounded,
    supervisor: supervisor ?? [],
    inner,
  };
};
