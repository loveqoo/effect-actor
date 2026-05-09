import type { Duration, Effect } from "effect";
import type { Behavior } from "./behavior.js";
import type { AskTimeout } from "./errors.js";
import type { ActorRef, ActorSystemHandle } from "./ref.js";

// ActorContext — Behavior handler 안에서 외부와 상호작용하는 통로 (ADR-007).
// M1 사이클 5: spawn 추가.
// M3 사이클 1: stop 추가 (graceful cascade — ADR-031).

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
});

export const ActorContext = {
  make,
};
