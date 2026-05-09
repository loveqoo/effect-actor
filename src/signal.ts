import { Data, type Deferred } from "effect";
import type { ActorPath } from "./path.js";

// 시스템 신호 — 사용자 메시지보다 우선 처리 (ADR-009)
export type Signal =
  | { readonly _tag: "PreRestart" }
  | { readonly _tag: "PostStop" }
  | {
      readonly _tag: "Terminated";
      readonly path: ActorPath;
      readonly uid: string;
    }
  | {
      readonly _tag: "ChildFailed";
      readonly path: ActorPath;
      readonly uid: string;
      readonly cause: unknown;
    };

export const Signal = {
  PreRestart: { _tag: "PreRestart" } as const satisfies Signal,
  PostStop: { _tag: "PostStop" } as const satisfies Signal,
  Terminated: (path: ActorPath, uid: string): Signal => ({
    _tag: "Terminated",
    path,
    uid,
  }),
  ChildFailed: (path: ActorPath, uid: string, cause: unknown): Signal => ({
    _tag: "ChildFailed",
    path,
    uid,
    cause,
  }),
};

// Watch 식별자 — (path, uid) 조합 (ADR-016, ADR-022). TMap 키로 쓰이므로 Equal/Hash 자동 필요.
export interface WatchKey {
  readonly path: ActorPath;
  readonly uid: string;
}

export const WatchKey = {
  make: (path: ActorPath, uid: string): WatchKey => Data.struct({ path, uid }),
};

// watch / watchWith / watchTerminated 의 변환 메시지 (ADR-022, ADR-030)
// - Terminated: signalQueue 에 발사
// - Custom: mailbox 에 사용자 메시지로 발사
// - Deferred: Effect 형태 노출용 (ctx.watchTerminated). target stop 시 Deferred.succeed.
export type WatchMessage =
  | { readonly _tag: "Terminated" }
  | { readonly _tag: "Custom"; readonly msg: unknown }
  | {
      readonly _tag: "Deferred";
      readonly deferred: Deferred.Deferred<void, never>;
    };

export const WatchMessage = {
  Terminated: { _tag: "Terminated" } as const satisfies WatchMessage,
  Custom: (msg: unknown): WatchMessage => ({ _tag: "Custom", msg }),
  Deferred: (
    deferred: Deferred.Deferred<void, never>,
  ): WatchMessage => ({ _tag: "Deferred", deferred }),
};
