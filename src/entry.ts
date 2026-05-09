import {
  Chunk,
  Effect,
  ExecutionStrategy,
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

// ActorEntry — Registry 의 한 항목 (ADR-017, ADR-022, ADR-035).
// invariant (ARCHITECTURE.md §2.3):
// - cell 인스턴스는 entry 수명 내내 동일 (restart 해도 보존)
// - cellScope 는 actor _전체 lifetime_ (interpreter fiber 가 여기 fork). spawn~stop 1회.
// - instanceScope 는 actor _instance lifetime_ (사용자 fork/timer/scoped resource). restart 시 닫고 새로 — TRef 로 mutable.
// - fiber 는 spawn 시 1회 fork, restart 거쳐도 _같은 fiber_ (ADR-020).
//
// 구현 노트: watchers/watching 은 원래 TMap 으로 두려 했으나 Effect 3.21.2 의
// TMap.remove/removeAll 가 partition 술어를 잘못 다뤄 (registry.ts 주석 참고)
// hash 충돌 bucket 의 다른 키들이 한꺼번에 사라진다. WatchKey 도 같은 prefix
// path 를 공유해 충돌이 잦으므로 TRef<HashMap> 으로 우회.
// upstream issue: https://github.com/Effect-TS/effect/issues/6225
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
  // ADR-035: lifetime / instance 분리.
  // cellScope close → instanceScope 도 자동 close (parent-child 관계).
  readonly cellScope: Scope.CloseableScope;
  readonly instanceScope: TRef.TRef<Scope.CloseableScope>;
}

// STM 안에서 entry 의 변경 가능 부분 (TRef) 초기화.
// cell/scopes 는 외부에서 미리 만들어 주입 — STM 밖 자원이라 이 단계에 함께 못 만듬.
const makeStm = <Msg>(args: {
  readonly path: ActorPath;
  readonly uid: string;
  readonly cell: Cell<Msg>;
  readonly cellScope: Scope.CloseableScope;
  readonly instanceScope: Scope.CloseableScope;
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
    const instanceScope = yield* TRef.make(args.instanceScope);
    return {
      path: args.path,
      uid: args.uid,
      cell: args.cell,
      children,
      watchers,
      watching,
      fiber,
      status,
      cellScope: args.cellScope,
      instanceScope,
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
    const cellScope = yield* Scope.make();
    const instanceScope = yield* Scope.fork(
      cellScope,
      ExecutionStrategy.sequential,
    );
    const entry = yield* STM.commit(
      makeStm<Msg>({
        path: args.path,
        uid: args.uid,
        cell,
        cellScope,
        instanceScope,
      }),
    );
    return entry;
  });

export const ActorEntry = {
  makeStm,
  create,
};
