import type { Duration, Effect, Fiber } from "effect";
import type { Behavior } from "./behavior.js";
import type { AskTimeout } from "./errors.js";
import type { ActorRef, ActorSystemHandle } from "./ref.js";

// ActorContext — Behavior handler 안에서 외부와 상호작용하는 통로 (ADR-007).
// M1 사이클 5: spawn 추가.
// M3 사이클 1: stop 추가 (graceful cascade — ADR-031).
// M5 사이클 3: fork + scheduleOnce 추가 (ADR-039).

export interface ActorContext<Msg> {
  readonly self: ActorRef<Msg>;
  readonly system: ActorSystemHandle;
  readonly spawn: <ChildMsg>(
    behavior: Behavior<ChildMsg>,
    name: string,
  ) => Effect.Effect<ActorRef<ChildMsg>>;
  readonly stop: <ChildMsg>(
    child: ActorRef<ChildMsg>,
  ) => Effect.Effect<void>;
  // M3 사이클 2: watch / watchWith / unwatch (ADR-022).
  // watch — other 가 죽으면 self.signalQueue 에 Terminated 발사
  // watchWith — other 가 죽으면 self.mailbox 에 사용자 정의 msg 발사 (signal 아님)
  // unwatch — 감시 취소
  readonly watch: <Other>(other: ActorRef<Other>) => Effect.Effect<void>;
  readonly watchWith: <Other>(
    other: ActorRef<Other>,
    msg: Msg,
  ) => Effect.Effect<void>;
  readonly unwatch: <Other>(other: ActorRef<Other>) => Effect.Effect<void>;
  // M3 사이클 3: Effect 형태 termination await (ADR-030).
  readonly watchTerminated: <Other>(
    other: ActorRef<Other>,
  ) => Effect.Effect<void>;
  // M3 사이클 4: ask 패턴 (ADR-029) — Akka 정통 시그너처.
  // 임시 actor spawn → target.tell(make(replyTo)) → race(reply, timeout).
  // typed reply err 는 사용자 측 wrapper (ADR-029 §결정).
  readonly ask: <TargetMsg, Resp>(
    target: ActorRef<TargetMsg>,
    make: (replyTo: ActorRef<Resp>) => TargetMsg,
    timeout: Duration.DurationInput,
  ) => Effect.Effect<Resp, AskTimeout>;
  // M5 사이클 3 (ADR-039): instance scope 안 fork — restart/stop 시 자동 interrupt.
  // Behaviors.withTimers / ctx.scheduleOnce 도 내부적으로 이 fork 사용.
  // 사용자가 직접 timer/loop 만들 때 표면.
  readonly fork: <A, E>(
    eff: Effect.Effect<A, E>,
  ) => Effect.Effect<Fiber.RuntimeFiber<A, E>>;
  // M5 사이클 3 (ADR-039): delay 후 다른 액터에 tell (fire-and-forget).
  // ctx.fork(sleep + target.tell) 헬퍼. fork 안이라 restart/stop 시 자동 cancel.
  readonly scheduleOnce: <M>(
    delay: Duration.DurationInput,
    target: ActorRef<M>,
    msg: M,
  ) => Effect.Effect<void>;
}

const make = <Msg>(args: {
  readonly self: ActorRef<Msg>;
  readonly system: ActorSystemHandle;
  readonly spawn: <ChildMsg>(
    behavior: Behavior<ChildMsg>,
    name: string,
  ) => Effect.Effect<ActorRef<ChildMsg>>;
  readonly stop: <ChildMsg>(
    child: ActorRef<ChildMsg>,
  ) => Effect.Effect<void>;
  readonly watch: <Other>(other: ActorRef<Other>) => Effect.Effect<void>;
  readonly watchWith: <Other>(
    other: ActorRef<Other>,
    msg: Msg,
  ) => Effect.Effect<void>;
  readonly unwatch: <Other>(other: ActorRef<Other>) => Effect.Effect<void>;
  readonly watchTerminated: <Other>(
    other: ActorRef<Other>,
  ) => Effect.Effect<void>;
  readonly ask: <TargetMsg, Resp>(
    target: ActorRef<TargetMsg>,
    make: (replyTo: ActorRef<Resp>) => TargetMsg,
    timeout: Duration.DurationInput,
  ) => Effect.Effect<Resp, AskTimeout>;
  readonly fork: <A, E>(
    eff: Effect.Effect<A, E>,
  ) => Effect.Effect<Fiber.RuntimeFiber<A, E>>;
  readonly scheduleOnce: <M>(
    delay: Duration.DurationInput,
    target: ActorRef<M>,
    msg: M,
  ) => Effect.Effect<void>;
}): ActorContext<Msg> => ({
  self: args.self,
  system: args.system,
  spawn: args.spawn,
  stop: args.stop,
  watch: args.watch,
  watchWith: args.watchWith,
  unwatch: args.unwatch,
  watchTerminated: args.watchTerminated,
  ask: args.ask,
  fork: args.fork,
  scheduleOnce: args.scheduleOnce,
});

export const ActorContext = {
  make,
};
