import { Data } from "effect";
import type { ActorPath } from "./path.js";

// ARCHITECTURE.md §4.5 — 최상위 에러 종류 (ADR-012).
// 구체 메시지 어휘는 사이클별로 채움.

// path 가 registry 에 없을 때 (tell/ask 등).
export class ActorNotFound extends Data.TaggedError("ActorNotFound")<{
  readonly path: ActorPath;
}> {}

// tell hot path 에서 entry.uid !== ref.uid 일 때 (ADR-016 ABA 차단).
// dead letter 자동 처리 — 사용자 캐치 거의 없음.
export class IncarnationMismatch extends Data.TaggedError(
  "IncarnationMismatch",
)<{
  readonly path: ActorPath;
  readonly expectedUid: string;
  readonly actualUid: string;
}> {}

// bounded mailbox + overflow=fail 일 때.
export class MailboxFull extends Data.TaggedError("MailboxFull")<{
  readonly path: ActorPath;
  readonly capacity: number;
}> {}

// ask 패턴 — target 이 timeout 안에 응답 안 함 (ADR-029).
export class AskTimeout extends Data.TaggedError("AskTimeout")<{
  readonly path: ActorPath;
  readonly timeoutMillis: number;
}> {}

// DeathPact — watch 한 target 의 Terminated 신호를 _처리 안 함_ (onSignal 미부착 또는 Unhandled 반환).
// Akka Typed 의 unhandled signal 정책: 자살 → 부모가 ChildFailed 로 받음 (ADR-022).
export class DeathPactException extends Data.TaggedError("DeathPactException")<{
  readonly self: ActorPath;
  readonly terminated: ActorPath;
  readonly terminatedUid: string;
}> {}

// M5 사이클 1 (ADR-037) — restart 시도 한도 초과 시 stop 강등의 cause 표시.
// Akka 의 _Failed too many times_ 와 같은 의미. supervise 외피 _안쪽_ 이라 사용자 onFailure 에 다시 안 잡힘.
// onSelfTermination + PostStop hook + watcher 알림 정상 발사.
export class RestartLimitExceeded extends Data.TaggedError(
  "RestartLimitExceeded",
)<{
  readonly path: ActorPath;
  readonly maxNrOfRetries: number;
  readonly windowMillis: number;
  readonly attemptCount: number;
}> {}

// M5 사이클 4 (ADR-040) — withStash buffer 용량 초과 시 stash() 가 fail.
// 사용자가 catch 안 하면 step fail → supervision 분기 (Strategies.matchTag("StashOverflow") 등으로 제어).
export class StashOverflow extends Data.TaggedError("StashOverflow")<{
  readonly path: ActorPath;
  readonly capacity: number;
}> {}
