import type { Effect } from "effect";
import type { Behavior } from "./behavior.js";
import type { ActorRef, ActorSystemHandle } from "./ref.js";

// ActorContext — Behavior handler 안에서 외부와 상호작용하는 통로 (ADR-007).
// 사이클 5: spawn 추가. watch / log 등은 M3 에서.

export interface ActorContext<Msg> {
  readonly self: ActorRef<Msg>;
  readonly system: ActorSystemHandle;
  readonly spawn: <ChildMsg>(
    behavior: Behavior<ChildMsg>,
    name: string,
  ) => Effect.Effect<ActorRef<ChildMsg>>;
}

const make = <Msg>(args: {
  readonly self: ActorRef<Msg>;
  readonly system: ActorSystemHandle;
  readonly spawn: <ChildMsg>(
    behavior: Behavior<ChildMsg>,
    name: string,
  ) => Effect.Effect<ActorRef<ChildMsg>>;
}): ActorContext<Msg> => ({
  self: args.self,
  system: args.system,
  spawn: args.spawn,
});

export const ActorContext = {
  make,
};
