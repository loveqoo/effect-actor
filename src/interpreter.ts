import { Cause, Clock, Deferred, Duration, Effect, Exit, Option, Queue } from "effect";
import type { Behavior, BehaviorEffect } from "./behavior.js";
import type { ActorContext } from "./context.js";
import type { ActorEntry } from "./entry.js";
import { DeathPactException, RestartLimitExceeded } from "./errors.js";
import type { Signal } from "./signal.js";
import { Signal as SignalNs } from "./signal.js";
import type {
  BackoffConfig,
  RestartLimit,
  SupervisorRule,
} from "./supervision.js";
import { computeBackoffDelay, pickStrategy } from "./supervision.js";

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
    case "Supervise":
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
//   - 자발 Stopped → 마지막 active Receive 의 onSignal(PostStop) 자동 호출
//   - 외부 signalQueue.offer(PostStop) → 마지막 active Receive 의 onSignal 호출 후 fiber 자발 종료
//   - 두 케이스 모두 _한 번만_ PostStop 처리 (postStopHandled 플래그)
// M3.1: optional startedLatch — Setup 평가 후 succeed → spawn 의 happens-before contract.
// M4 사이클 2 (ADR-034): step-level supervisor 분기. step fail 시 pickStrategy → Resume 면 current 그대로 continue.
//   Stop / 미매치 = fail propagate (외부 catchAllCause 가 hook).
//   PostStop step 은 supervision 밖 — 최후 정리 의미. Resume 으로 PostStop 무시되면 액터 영구 살아 있어 의미상 불가.
// M4 사이클 3 (ADR-020/035): Restart 흐름 — outer (restart) + inner (message) 두 loop.
//   PreRestart 신호 → 현재 Behavior 가 처리 → onRestart 콜백 (자식 cascade + instanceScope 교체) → initial 재평가 → loop 재진입.
//   같은 fiber 안에서 재진입 — ref/uid/cell/cellScope 모두 보존, instanceScope 만 새로.
// M4.1 사이클 2: 자발 Stopped / supervisor stop 강등 시 onSelfTermination 콜백 호출
//   (watcher 알림 + registry unregister). PostStop hook 도 supervisor stop 강등에서 발사.
// M5 사이클 1 (ADR-037): restart.withLimit 한도 초과 → stop 강등 (RestartLimitExceeded cause).
//   PreRestart 재실패 (의제 3) → stop 강등 (PreRestart 의 cause). 둘 다 기존 stop 강등 경로 재사용.
const messageLoop = <Msg>(
  initial: Behavior<Msg>,
  entry: ActorEntry<Msg>,
  ctx: ActorContext<Msg>,
  supervisor: ReadonlyArray<SupervisorRule>,
  startedLatch?: Deferred.Deferred<void, never>,
  onRestart?: () => Effect.Effect<void>,
  onSelfTermination?: () => Effect.Effect<void>,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    let firstStart = true;
    let postStopHandled = false;
    // PostStop emit 시 사용 — outer 마지막 active 보존
    let lastActive: Behavior<Msg> = initial;

    // M5 사이클 1: restart 시도 timestamp (한 fiber lifetime 내 sliding window).
    // 가장 최근 fail 의 RestartLimit 를 기준으로 윈도우 적용.
    const restartHistory: number[] = [];

    // outer: restart loop. continue = restart 재시작. break/return = 종료.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // (Re)start: Setup 재평가 (Setup 이면 init 재실행, 아니면 initial 그대로).
      let current = yield* evaluateInitial(initial, ctx);
      lastActive = current;

      if (firstStart && startedLatch) {
        // M3.1 happens-before contract — 첫 spawn 직후만. restart 후엔 latch 이미 succeed.
        yield* Deferred.succeed(startedLatch, void 0 as void);
      }
      firstStart = false;

      // inner: message loop. 한 incarnation 동안.
      let needRestart = false;
      let needStop = false;
      let stopCause: Cause.Cause<unknown> | null = null;
      // M5 사이클 1: restart 분기 진입 시점의 limit (한도 검사 입력).
      let pendingRestartLimit: RestartLimit | null = null;
      // M5 사이클 2: restart 분기 진입 시점의 backoff (sleep 입력).
      let pendingRestartBackoff: BackoffConfig | null = null;

      while (
        current._tag !== "Stopped" &&
        !postStopHandled &&
        !needRestart &&
        !needStop
      ) {
        const inbox = yield* takeNext(entry);

        // 외부 PostStop — supervision 밖에서 처리 후 자발 종료. lastActive 가 받음.
        if (inbox._tag === "Sig" && inbox.signal._tag === "PostStop") {
          yield* interpretSignalStep(lastActive, ctx, inbox.signal);
          postStopHandled = true;
          continue;
        }

        const stepEffect: BehaviorEffect<Msg> =
          inbox._tag === "Sig"
            ? interpretSignalStep(current, ctx, inbox.signal)
            : interpretStep(current, ctx, inbox.msg);

        const exit = yield* Effect.exit(stepEffect);
        if (Exit.isSuccess(exit)) {
          current = exit.value;
          if (current._tag !== "Stopped") lastActive = current;
          continue;
        }

        // step fail — supervisor 분기.
        const strategy = pickStrategy(supervisor, exit.cause);
        if (strategy._tag === "Resume") {
          continue;
        }
        if (strategy._tag === "Restart") {
          needRestart = true;
          pendingRestartLimit = strategy.limit;
          pendingRestartBackoff = strategy.backoff;
          break;
        }
        // Stop / 미매치
        needStop = true;
        stopCause = exit.cause;
        break;
      }

      if (postStopHandled || current._tag === "Stopped") {
        // 정상 종료 (외부 PostStop 또는 자발 Stopped)
        break;
      }

      if (needRestart) {
        // M5 사이클 1+2 (ADR-037, ADR-038): restart 시도 카운트 — 한도 검사 + backoff attemptIndex 둘 다 입력.
        // _항상_ push (limit 무관). limit 있을 때만 윈도우 슬라이드. backoff 만 있어도 attemptIndex 정상 증가.
        const now = yield* Clock.currentTimeMillis;
        let windowMs = 0;
        if (pendingRestartLimit !== null) {
          windowMs = Duration.toMillis(
            Duration.decode(pendingRestartLimit.withinTimeRange),
          );
          while (
            restartHistory.length > 0 &&
            now - restartHistory[0]! > windowMs
          ) {
            restartHistory.shift();
          }
        }
        restartHistory.push(now);

        // 한도 검사 (limit 있을 때만).
        if (
          pendingRestartLimit !== null &&
          restartHistory.length > pendingRestartLimit.maxNrOfRetries
        ) {
          // 한도 초과 → stop 강등. cause = RestartLimitExceeded (defect).
          needRestart = false;
          needStop = true;
          stopCause = Cause.die(
            new RestartLimitExceeded({
              path: ctx.self.path,
              maxNrOfRetries: pendingRestartLimit.maxNrOfRetries,
              windowMillis: windowMs,
              attemptCount: restartHistory.length,
            }),
          );
        }

        if (needRestart) {
          // M5 사이클 2 (ADR-038): backoff sleep — 한도 검사 통과 후 PreRestart 전.
          // attemptIndex = restartHistory.length - 1 (push 후 length, 0-based 변환).
          // sleep 도중 mailbox 는 그대로 — 새 incarnation 이 처리 (Akka 동일).
          if (pendingRestartBackoff !== null) {
            const attemptIndex = Math.max(0, restartHistory.length - 1);
            const delay = computeBackoffDelay(
              attemptIndex,
              pendingRestartBackoff,
            );
            yield* Effect.sleep(delay);
          }

          // M5 사이클 1 (의제 3): PreRestart 재실패 → stop 강등.
          // PreRestart 의 fail 을 캡처 — 외부 propagate 대신 cleanup 통일 경로로.
          const preRestartExit = yield* Effect.exit(
            interpretSignalStep(lastActive, ctx, SignalNs.PreRestart),
          );
          if (Exit.isFailure(preRestartExit)) {
            needRestart = false;
            needStop = true;
            stopCause = preRestartExit.cause;
          } else {
            // 자식 cascade stop + instanceScope 교체 (system.ts 가 콜백으로 제공).
            if (onRestart) yield* onRestart();
            // outer loop 재진입 — initial 재평가 + 새 incarnation.
            continue;
          }
        }
      }

      if (needStop) {
        // M4.1 사이클 2 (의제 1): supervisor stop 강등도 PostStop hook 발사 — 자발 Stopped 흐름과 정합.
        // M5 사이클 1: restart 한도 초과 / PreRestart 재실패도 같은 경로 (ADR-037 통일).
        // PostStop hook 의 fail 은 무시 (cleanup 단계, 원본 cause propagate 가 우선).
        // onSelfTermination 도 호출 (watcher 알림 + registry unregister).
        yield* Effect.ignore(
          interpretSignalStep(lastActive, ctx, SignalNs.PostStop),
        );
        if (onSelfTermination) yield* onSelfTermination();
        return yield* Effect.failCause(
          stopCause ?? Cause.die(new Error("supervision: unknown cause")),
        );
      }
    }

    // 자발 Stopped — 자동 PostStop emit (외부 PostStop 케이스가 아니면). supervision 밖.
    if (!postStopHandled) {
      yield* interpretSignalStep(lastActive, ctx, SignalNs.PostStop);
    }
    // M4.1 사이클 2 (의제 2): 자발 Stopped + 외부 PostStop 둘 다 onSelfTermination 호출.
    // 외부 stopActor 가 호출한 경우는 stopActor 자체가 watchers 알림 등 이미 처리하므로 _이중_ 위험 — 그러나
    // notifyWatchersOnSelfTermination 안 STM 갱신은 모두 idempotent (registry 이미 unregister 면 skip 등) 이라 안전.
    if (onSelfTermination) yield* onSelfTermination();
  });

// 액터의 메인 루프 (ARCHITECTURE §3.3).
// Supervision 외피 (ADR-020): default strategy = stop. catchAllCause 로 fail + defect 모두 흡수.
// M3 사이클 5: optional onFailure hook — supervision 외피가 부모에게 ChildFailed 알림 통로.
// 정상 종료 (자발 Stopped) 시 hook 호출 안 됨.
// M3.1: optional startedLatch — spawn 의 happens-before contract (Setup 평가 후 spawn Effect 끝).
//       Setup 평가 도중 fail 해도 supervision 외피가 흡수 → spawn 의 Deferred.await 영원 X (catchAllCause 안에서 succeed).
// M4 사이클 2 (ADR-034): optional supervisor rules — messageLoop 가 step-level 분기. 빈 배열이면 기본 stop (현재 default).
//   외부 catchAllCause 는 _최종 stop 강등_ 한정 — Resume / Restart 는 messageLoop 안에서 흡수, hook 호출 X.
// M4 사이클 3 (ADR-020/035): optional onRestart — Restart strategy 발동 시 messageLoop 가 호출 (자식 cascade + instanceScope 교체).
// M4.1 사이클 2: optional onSelfTermination — 자발 Stopped / supervisor stop 강등 시 호출 (watcher 알림 + registry unregister).
export const runInterpreter = <Msg>(
  initial: Behavior<Msg>,
  entry: ActorEntry<Msg>,
  ctx: ActorContext<Msg>,
  options?: {
    readonly onFailure?: (cause: Cause.Cause<unknown>) => Effect.Effect<void>;
    readonly startedLatch?: Deferred.Deferred<void, never>;
    readonly supervisor?: ReadonlyArray<SupervisorRule>;
    readonly onRestart?: () => Effect.Effect<void>;
    readonly onSelfTermination?: () => Effect.Effect<void>;
  },
): Effect.Effect<void> =>
  Effect.catchAllCause(
    messageLoop(
      initial,
      entry,
      ctx,
      options?.supervisor ?? [],
      options?.startedLatch,
      options?.onRestart,
      options?.onSelfTermination,
    ),
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
