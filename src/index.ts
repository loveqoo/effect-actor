// effect-actor — EffectTS 기반 Akka Typed 스타일 Actor
//
// M1 사이클 1 (현재): 핵심 자료구조 — identity 와 컨테이너만.
// 동작 (Behavior 해석기, spawn, tell dispatch) 은 다음 사이클부터.

export type { ActorPath } from "./path.js";
export { ActorPath as ActorPathOps } from "./path.js";

export type { Signal, WatchKey, WatchMessage } from "./signal.js";
export {
  Signal as SignalOps,
  WatchKey as WatchKeyOps,
  WatchMessage as WatchMessageOps,
} from "./signal.js";

export type { ActorStatus } from "./status.js";
export { ActorStatus as ActorStatusOps } from "./status.js";

export type { Cell, MailboxPolicy } from "./mailbox.js";
export { Cell as CellOps, MailboxPolicy as MailboxPolicyOps } from "./mailbox.js";

export {
  ActorNotFound,
  IncarnationMismatch,
  MailboxFull,
} from "./errors.js";

export type { ActorEntry } from "./entry.js";
export { ActorEntry as ActorEntryOps } from "./entry.js";

export type { Registry } from "./registry.js";
export { Registry as RegistryOps } from "./registry.js";

export type { ActorRef, ActorSystemHandle } from "./ref.js";
export { ActorRef as ActorRefOps } from "./ref.js";

export type { ActorContext } from "./context.js";
export { ActorContext as ActorContextOps } from "./context.js";

export type { Behavior, BehaviorEffect, BehaviorMeta } from "./behavior.js";
export { Behaviors, unwrapMeta } from "./behavior.js";

export { interpretStep, runInterpreter } from "./interpreter.js";
