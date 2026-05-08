import {
  Effect,
  Fiber,
  HashSet,
  Option,
  STM,
  Scope,
  TMap,
  TRef,
} from "effect";
import type { Cell } from "./mailbox.js";
import { Cell as CellNs, MailboxPolicy } from "./mailbox.js";
import type { ActorPath } from "./path.js";
import type { WatchKey, WatchMessage } from "./signal.js";
import type { ActorStatus } from "./status.js";

// ActorEntry — Registry 의 한 항목 (ADR-017, ADR-022).
// invariant (ARCHITECTURE.md §2.3):
// - cell 인스턴스는 entry 수명 내내 동일 (restart 해도 보존)
// - fiber 는 restart 시 교체
// - scope 는 instance lifetime — restart 시 닫고 새로
export interface ActorEntry<Msg> {
  readonly path: ActorPath;
  readonly uid: string;
  readonly cell: Cell<Msg>;
  readonly children: TRef.TRef<HashSet.HashSet<ActorPath>>;
  readonly watchers: TMap.TMap<WatchKey, WatchMessage>;
  readonly watching: TMap.TMap<WatchKey, WatchMessage>;
  readonly fiber: TRef.TRef<Option.Option<Fiber.Fiber<unknown, never>>>;
  readonly status: TRef.TRef<ActorStatus>;
  readonly scope: Scope.CloseableScope;
}

// STM 안에서 entry 의 변경 가능 부분 (TRef/TMap) 초기화.
// cell/scope 는 외부에서 미리 만들어 주입 — STM 밖 자원이라 이 단계에 함께 못 만듬.
const makeStm = <Msg>(args: {
  readonly path: ActorPath;
  readonly uid: string;
  readonly cell: Cell<Msg>;
  readonly scope: Scope.CloseableScope;
}): STM.STM<ActorEntry<Msg>> =>
  STM.gen(function* () {
    const children = yield* TRef.make(HashSet.empty<ActorPath>());
    const watchers = yield* TMap.empty<WatchKey, WatchMessage>();
    const watching = yield* TMap.empty<WatchKey, WatchMessage>();
    const fiber = yield* TRef.make(
      Option.none<Fiber.Fiber<unknown, never>>(),
    );
    const status = yield* TRef.make<ActorStatus>("running");
    return {
      path: args.path,
      uid: args.uid,
      cell: args.cell,
      children,
      watchers,
      watching,
      fiber,
      status,
      scope: args.scope,
    };
  });

// 통합 생성 — Cell + Scope + STM 초기화를 한 Effect 로.
const create = <Msg>(args: {
  readonly path: ActorPath;
  readonly uid: string;
  readonly mailboxPolicy?: MailboxPolicy;
}): Effect.Effect<ActorEntry<Msg>> =>
  Effect.gen(function* () {
    const cell = yield* CellNs.make<Msg>(
      args.mailboxPolicy ?? MailboxPolicy.unbounded,
    );
    const scope = yield* Scope.make();
    const entry = yield* STM.commit(
      makeStm<Msg>({
        path: args.path,
        uid: args.uid,
        cell,
        scope,
      }),
    );
    return entry;
  });

export const ActorEntry = {
  makeStm,
  create,
};
