import { Cause, Deferred, Effect, Option, Queue } from "effect";
import type { Behavior, BehaviorEffect } from "./behavior.js";
import type { ActorContext } from "./context.js";
import type { ActorEntry } from "./entry.js";
import { DeathPactException } from "./errors.js";
import type { Signal } from "./signal.js";
import { Signal as SignalNs } from "./signal.js";

// 한 메시지를 한 Behavior 에 적용해 _다음_ Behavior 계산.
// Setup/WithMailbox 는 spawn 0단계에서 풀려 도달 안 함 — 도달하면 invariant violation, 안전하게 그대로.
export const interpretStep = <Msg>(
  current: Behavior<Msg>,
  ctx: ActorContext<Msg>,
  msg: Msg,
): BehaviorEffect<Msg> => {
  switch (current._tag) {
    case "Same":
    case "Empty":
    case "Unhandled":
    case "Stopped":
      return Effect.succeed(current);
    case "Receive":
      return Effect.map(current.handle(ctx, msg), (next) =>
        next._tag === "Same" ? current : next,
      );
    case "Setup":
    case "WithMailbox":
      // spawn 0단계가 풀어줘야 하는 케이스 — 여기까지 오면 invariant violation. 안전 fallback.
      return Effect.succeed(current);
  }
};

// 한 신호를 한 Behavior 에 적용해 _다음_ Behavior 계산.
// M2 사이클 2: 기본 — onSignal 부착되면 호출, 미부착이면 current 그대로.
// M3 사이클 5: DeathPact 검출 — Terminated 가 _처리 안 됨_ (미부착 또는 Unhandled) 이면 fail.
export const interpretSignalStep = <Msg>(
  current: Behavior<Msg>,
  ctx: ActorContext<Msg>,
  signal: Signal,
): BehaviorEffect<Msg> => {
  if (current._tag === "Receive" && current.onSignal !== null) {
    return Effect.flatMap(current.onSignal(ctx, signal), (next) => {
      if (next._tag === "Unhandled" && signal._tag === "Terminated") {
        return Effect.fail(
          new DeathPactException({
            self: ctx.self.path,
            terminated: signal.path,
            terminatedUid: signal.uid,
          }),
        );
      }
      return Effect.succeed(next._tag === "Same" ? current : next);
    });
  }
  // onSignal 미부착 — Terminated 면 DeathPact, 다른 신호는 무시 (current 그대로)
  if (signal._tag === "Terminated") {
    return Effect.fail(
      new DeathPactException({
        self: ctx.self.path,
        terminated: signal.path,
        terminatedUid: signal.uid,
      }),
    );
  }
  return Effect.succeed(current);
};

// Setup 을 평가해 시작 behavior 를 얻는다 (init 한 번만 실행).
const evaluateInitial = <Msg>(
  initial: Behavior<Msg>,
  ctx: ActorContext<Msg>,
): BehaviorEffect<Msg> => {
  if (initial._tag === "Setup") {
    return initial.init(ctx);
  }
  return Effect.succeed(initial);
};

type Inbox<Msg> =
  | { readonly _tag: "Sig"; readonly signal: Signal }
  | { readonly _tag: "Msg"; readonly msg: Msg };

// signal 우선 폴링 (ADR-009, ARCHITECTURE §3.3):
// 1) signalQueue 가 즉시 가용하면 그것 먼저 — _이미 도착한 signal_ 우선.
// 2) 비어 있으면 race — 둘 중 먼저 도착하는 것.
const takeNext = <Msg>(entry: ActorEntry<Msg>): Effect.Effect<Inbox<Msg>> =>
  Effect.gen(function* () {
    const sigOpt = yield* Queue.poll(entry.cell.signalQueue);
    if (Option.isSome(sigOpt)) {
      return { _tag: "Sig", signal: sigOpt.value } satisfies Inbox<Msg>;
    }
    return yield* Effect.race(
      Queue.take(entry.cell.signalQueue).pipe(
        Effect.map((s): Inbox<Msg> => ({ _tag: "Sig", signal: s })),
      ),
      Queue.take(entry.cell.mailbox).pipe(
        Effect.map((m): Inbox<Msg> => ({ _tag: "Msg", msg: m })),
      ),
    );
  });

// messageLoop — 액터의 메인 루프.
// M2 사이클 3 (ADR-021 §3.8): PostStop hook 자동 emit.
// - 자발 Stopped → 마지막 active Receive 의 onSignal(PostStop) 자동 호출
// - 외부 signalQueue.offer(PostStop) → 마지막 active Receive 의 onSignal 호출 후 fiber 자발 종료
// - 두 케이스 모두 _한 번만_ PostStop 처리 (postStopHandled 플래그)
// M3.1: optional startedLatch — Setup 평가 후 succeed → spawn 의 happens-before contract.
const messageLoop = <Msg>(
  initial: Behavior<Msg>,
  entry: ActorEntry<Msg>,
  ctx: ActorContext<Msg>,
  startedLatch?: Deferred.Deferred<void, never>,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    let current = yield* evaluateInitial(initial, ctx);
    if (startedLatch) {
      yield* Deferred.succeed(startedLatch, void 0 as void);
    }
    let lastActive = current;
    let postStopHandled = false;

    while (current._tag !== "Stopped" && !postStopHandled) {
      const inbox = yield* takeNext(entry);
      if (inbox._tag === "Sig") {
        if (inbox.signal._tag === "PostStop") {
          // 외부 PostStop — 처리 후 자발 종료. lastActive 가 받음.
          yield* interpretSignalStep(lastActive, ctx, inbox.signal);
          postStopHandled = true;
        } else {
          current = yield* interpretSignalStep(current, ctx, inbox.signal);
        }
      } else {
        current = yield* interpretStep(current, ctx, inbox.msg);
      }
      if (current._tag !== "Stopped") {
        lastActive = current;
      }
    }

    // 자발 Stopped — 자동 PostStop emit (외부 PostStop 케이스가 아니면)
    if (!postStopHandled) {
      yield* interpretSignalStep(lastActive, ctx, SignalNs.PostStop);
    }
  });

// 액터의 메인 루프 (ARCHITECTURE §3.3).
// Supervision 외피 (ADR-020): default strategy = stop. catchAllCause 로 fail + defect 모두 흡수.
// M3 사이클 5: optional onFailure hook — supervision 외피가 부모에게 ChildFailed 알림 통로.
// 정상 종료 (자발 Stopped) 시 hook 호출 안 됨.
// M3.1: optional startedLatch — spawn 의 happens-before contract (Setup 평가 후 spawn Effect 끝).
//       Setup 평가 도중 fail 해도 supervision 외피가 흡수 → spawn 의 Deferred.await 영원 X (catchAllCause 안에서 succeed).
export const runInterpreter = <Msg>(
  initial: Behavior<Msg>,
  entry: ActorEntry<Msg>,
  ctx: ActorContext<Msg>,
  options?: {
    readonly onFailure?: (cause: Cause.Cause<unknown>) => Effect.Effect<void>;
    readonly startedLatch?: Deferred.Deferred<void, never>;
  },
): Effect.Effect<void> =>
  Effect.catchAllCause(
    messageLoop(initial, entry, ctx, options?.startedLatch),
    (cause) => {
      // Setup 평가 도중 fail 시 startedLatch 가 아직 안 끝남 → spawn 의 await 영원. 여기서 succeed 보장.
      const latchEnsure = options?.startedLatch
        ? Deferred.succeed(options.startedLatch, void 0 as void).pipe(
            Effect.asVoid,
          )
        : Effect.void;
      const hook = options?.onFailure;
      return latchEnsure.pipe(
        Effect.flatMap(() => (hook ? hook(cause) : Effect.void)),
      );
    },
  );
