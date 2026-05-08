import { Effect } from "effect";
import type { ActorRef, ActorSystemHandle } from "../src/ref.js";

// 사이클 4 이전의 단위 테스트가 ActorRef 만들 때 쓰는 stub.
// tell 은 noop — 단위 테스트는 system dispatch 검증 X.
export const stubSystem: ActorSystemHandle = {
  name: "test-sys",
  tell: <Msg>(_ref: ActorRef<Msg>, _msg: Msg) => Effect.void,
};
