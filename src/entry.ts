import {
  Chunk,
  Effect,
  Fiber,
  HashMap,
  Option,
  STM,
  Scope,
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
//
// 구현 노트: watchers/watching 은 원래 TMap 으로 두려 했으나 Effect 3.21.2 의
// TMap.remove/removeAll 가 partition 술어를 잘못 다뤄 (registry.ts 주석 참고)
// hash 충돌 bucket 의 다른 키들이 한꺼번에 사라진다. WatchKey 도 같은 prefix
// path 를 공유해 충돌이 잦으므로 TRef<HashMap> 으로 우회.
export interface ActorEntry<Msg> {
  readonly path: ActorPath;
  readonly uid: string;
  readonly cell: Cell<Msg>;
  // M3.1: HashSet → Chunk — insertion order 보존 (LIFO cascade 보장, ADR-031 보강).
  readonly children: TRef.TRef<Chunk.Chunk<ActorPath>>;
  readonly watchers: TRef.TRef<HashMap.HashMap<WatchKey, WatchMessage>>;
  readonly watching: TRef.TRef<HashMap.HashMap<WatchKey, WatchMessage>>;
  readonly fiber: TRef.TRef<Option.Option<Fiber.Fiber<void, never>>>;
  readonly status: TRef.TRef<ActorStatus>;
  readonly scope: Scope.CloseableScope;
}

// STM 안에서 entry 의 변경 가능 부분 (TRef) 초기화.
// cell/scope 는 외부에서 미리 만들어 주입 — STM 밖 자원이라 이 단계에 함께 못 만듬.
const makeStm = <Msg>(args: {
  readonly path: ActorPath;
  readonly uid: string;
  readonly cell: Cell<Msg>;
  readonly scope: Scope.CloseableScope;
}): STM.STM<ActorEntry<Msg>> =>
  STM.gen(function* () {
    const children = yield* TRef.make(Chunk.empty<ActorPath>());
    const watchers = yield* TRef.make(
      HashMap.empty<WatchKey, WatchMessage>(),
    );
    const watching = yield* TRef.make(
      HashMap.empty<WatchKey, WatchMessage>(),
    );
    const fiber = yield* TRef.make(Option.none<Fiber.Fiber<void, never>>());
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
