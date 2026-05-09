// effect-actor — EffectTS 기반 Akka Typed 스타일 Actor
//
// M1 완성: spawn / tell / receive + setup + ctx.spawn + supervision 외피 default stop.
// M2 부터 PostStop / 도그푸딩, M3 부터 watch / ask, M4 supervision strategies, M5 backoff/stash/timer.

// 식별자
export { ActorPath } from "./path.js";

// 신호 + watch
export { Signal, WatchKey, WatchMessage } from "./signal.js";
export { ActorStatus } from "./status.js";

// 메일박스
export { Cell, MailboxPolicy } from "./mailbox.js";

// 에러 (Tagged)
export {
  ActorNotFound,
  AskTimeout,
  DeathPactException,
  IncarnationMismatch,
  MailboxFull,
} from "./errors.js";

// 내부 자료구조 (사용자 직접 접근은 거의 없음)
export { ActorEntry } from "./entry.js";
export { Registry } from "./registry.js";

// ref / context
export { ActorRef } from "./ref.js";
export type { ActorSystemHandle } from "./ref.js"; // internal handle (사용자 표면 X)
export { ActorContext } from "./context.js";

// behavior + 해석기
export type { Behavior, BehaviorEffect, BehaviorMeta } from "./behavior.js";
export { Behaviors, unwrapMeta } from "./behavior.js";
export { interpretStep, runInterpreter } from "./interpreter.js";

// system (사용자 entry point)
export { ActorSystem } from "./system.js";
