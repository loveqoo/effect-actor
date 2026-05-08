import type { ActorRef, ActorSystemHandle } from "./ref.js";

// ActorContext — Behavior handler 안에서 외부와 상호작용하는 통로 (ADR-007).
// 사이클 3: self / system 만. spawn / watch / log 등은 사이클 4 (ActorSystem dispatch) 에서 채움.

export interface ActorContext<Msg> {
  readonly self: ActorRef<Msg>;
  readonly system: ActorSystemHandle;
}

const make = <Msg>(args: {
  readonly self: ActorRef<Msg>;
  readonly system: ActorSystemHandle;
}): ActorContext<Msg> => ({
  self: args.self,
  system: args.system,
});

export const ActorContext = {
  make,
};
