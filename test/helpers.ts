import { Effect } from "effect";
import type { Behavior } from "../src/behavior.js";
import type { ActorRef, ActorSystemHandle } from "../src/ref.js";

// 단위 테스트용 stub system.
// tell / spawn 은 noop / die — 단위 테스트는 system dispatch 검증 X.
export const stubSystem: ActorSystemHandle = {
  name: "test-sys",
  tell: <Msg>(_ref: ActorRef<Msg>, _msg: Msg) => Effect.void,
};

export const stubSpawn = <ChildMsg>(
  _behavior: Behavior<ChildMsg>,
  _name: string,
): Effect.Effect<ActorRef<ChildMsg>> =>
  Effect.die("stub spawn invoked in unit test");
