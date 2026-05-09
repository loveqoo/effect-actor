import { Effect, type Duration } from "effect";
import type { Behavior } from "../src/behavior.js";
import type { AskTimeout } from "../src/errors.js";
import type { ActorRef, ActorSystemHandle } from "../src/ref.js";

// 단위 테스트용 stub system.
// tell / spawn / stop 은 noop / die — 단위 테스트는 system dispatch 검증 X.
export const stubSystem: ActorSystemHandle = {
  name: "test-sys",
  tell: <Msg>(_ref: ActorRef<Msg>, _msg: Msg) => Effect.void,
};

export const stubSpawn = <ChildMsg>(
  _behavior: Behavior<ChildMsg>,
  _name: string,
): Effect.Effect<ActorRef<ChildMsg>> =>
  Effect.die("stub spawn invoked in unit test");

export const stubStop = <ChildMsg>(
  _child: ActorRef<ChildMsg>,
): Effect.Effect<void> => Effect.void;

export const stubWatch = <Other>(
  _other: ActorRef<Other>,
): Effect.Effect<void> => Effect.void;

export const stubWatchWith = <Other, M>(
  _other: ActorRef<Other>,
  _msg: M,
): Effect.Effect<void> => Effect.void;

export const stubUnwatch = <Other>(
  _other: ActorRef<Other>,
): Effect.Effect<void> => Effect.void;

export const stubWatchTerminated = <Other>(
  _other: ActorRef<Other>,
): Effect.Effect<void> => Effect.void;

export const stubAsk = <TargetMsg, Resp>(
  _target: ActorRef<TargetMsg>,
  _make: (replyTo: ActorRef<Resp>) => TargetMsg,
  _timeout: Duration.DurationInput,
): Effect.Effect<Resp, AskTimeout> => Effect.die("stub ask invoked in unit test");
