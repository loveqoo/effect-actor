import { randomUUID } from "node:crypto";
import {
  Effect,
  Exit,
  Fiber,
  HashSet,
  Option,
  Queue,
  STM,
  Scope,
  TRef,
} from "effect";
import type { Behavior } from "./behavior.js";
import { unwrapMeta } from "./behavior.js";
import { ActorContext } from "./context.js";
import { ActorEntry } from "./entry.js";
import type { ActorEntry as ActorEntryT } from "./entry.js";
import { Cell } from "./mailbox.js";
import { runInterpreter } from "./interpreter.js";
import { ActorPath } from "./path.js";
import { Registry } from "./registry.js";
import type { Registry as RegistryT } from "./registry.js";
import { ActorRef } from "./ref.js";
import type { ActorSystemHandle } from "./ref.js";

// ActorSystem<RootMsg> — Akka Typed 정통 (ADR-026).
// 사이클 4: root only spawn. 사이클 5: ctx.spawn (자식) 추가.
export interface ActorSystem<RootMsg> extends ActorSystemHandle {
  readonly name: string;
  readonly registry: RegistryT;
  readonly root: ActorRef<RootMsg>;
  readonly shutdown: Effect.Effect<void>;
}

interface SpawnContext {
  readonly registry: RegistryT;
  readonly handle: ActorSystemHandle;
}

// spawnInternal — root + child 공통 흐름 (ARCHITECTURE.md §3.1, ADR-016/017/019/021/026).
const spawnInternal = <Msg>(
  spawnCtx: SpawnContext,
  args: {
    readonly path: ActorPath;
    readonly behavior: Behavior<Msg>;
    // root 면 null. 자식이면 parent entry — children TMap 갱신용.
    readonly parentEntry: ActorEntryT<unknown> | null;
  },
): Effect.Effect<{
  readonly ref: ActorRef<Msg>;
  readonly entry: ActorEntryT<Msg>;
}> =>
  Effect.gen(function* () {
    // 0. 메타 추출 (ADR-026)
    const meta = unwrapMeta(args.behavior);

    // 2. UID (ADR-016)
    const uid = randomUUID();

    // 3. Cell (ADR-019)
    const cell = yield* Cell.make<Msg>(meta.mailboxPolicy);

    // 4. Instance Scope (ADR-021)
    const scope = yield* Scope.make();

    // 5,6,7. ActorEntry + Registry.register + parent.children 갱신 — _한 STM tx_ (ADR-017)
    const entry = yield* STM.commit(
      STM.gen(function* () {
        const e = yield* ActorEntry.makeStm<Msg>({
          path: args.path,
          uid,
          cell,
          scope,
        });
        yield* Registry.register(spawnCtx.registry, e);
        if (args.parentEntry !== null) {
          yield* TRef.update(args.parentEntry.children, (s) =>
            HashSet.add(s, args.path),
          );
        }
        return e;
      }),
    );

    // 8. ActorRef + ActorContext (자기 spawn 함수 포함)
    const self = ActorRef.make<Msg>({
      path: args.path,
      uid,
      cell,
      system: spawnCtx.handle,
    });

    const ctx = makeChildContext<Msg>(spawnCtx, self, entry);

    // 9. Fiber.fork — instance Scope 안에서 (ADR-021 자동 cleanup).
    const fiber = yield* Effect.forkIn(
      runInterpreter(meta.inner, entry, ctx),
      scope,
    );

    // 10. entry.fiber 갱신 (STM tx)
    yield* STM.commit(TRef.set(entry.fiber, Option.some(fiber)));

    return { ref: self, entry };
  });

// 자식 spawn 을 노출하는 ctx 만든다. ctx.spawn 이 spawnInternal 을 parent entry 와 함께 호출.
const makeChildContext = <Msg>(
  spawnCtx: SpawnContext,
  self: ActorRef<Msg>,
  selfEntry: ActorEntryT<Msg>,
): ActorContext<Msg> =>
  ActorContext.make<Msg>({
    self,
    system: spawnCtx.handle,
    spawn: <ChildMsg>(behavior: Behavior<ChildMsg>, name: string) =>
      Effect.map(
        spawnInternal<ChildMsg>(spawnCtx, {
          path: ActorPath.child(self.path, name),
          behavior,
          parentEntry: selfEntry as ActorEntryT<unknown>,
        }),
        ({ ref }) => ref,
      ),
  });

// ActorSystem.tell — STM read-only tx (uid + status 검증) → cell.mailbox.offer (ADR-019).
const tellViaSystem =
  (registry: RegistryT) =>
  <Msg>(ref: ActorRef<Msg>, msg: Msg): Effect.Effect<void> =>
    Effect.gen(function* () {
      const validation = yield* STM.commit(
        STM.gen(function* () {
          const found = yield* Registry.resolve<Msg>(registry, ref.path);
          if (Option.isNone(found)) return false;
          const entry = found.value;
          if (entry.uid !== ref.uid) return false; // IncarnationMismatch
          const status = yield* TRef.get(entry.status);
          return status === "running";
        }),
      );
      if (!validation) {
        // best-effort delivery — silent dead letter (ADR-019)
        return;
      }
      yield* Queue.offer(ref.cell.mailbox, msg);
    });

// system.shutdown — status=stopped → scope close (자식 fiber 자동 cleanup) → fiber.await → unregister.
// 자식 actor 들의 cleanup 은 부모 scope 가 _아니라 자기 instance scope_ — Akka Typed 기본은 parent stop 시 children cascade stop.
// 사이클 5 단계는 root 만 stop — 자식들은 _자기 fiber 가 mailbox 가 닫혀_ catchAllCause 로 정리. 깨끗한 cascade 는 사이클 6 또는 M2.
const shutdownSystem = <Msg>(args: {
  readonly registry: RegistryT;
  readonly rootEntry: ActorEntryT<Msg>;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* STM.commit(TRef.set(args.rootEntry.status, "stopped"));
    yield* Queue.shutdown(args.rootEntry.cell.mailbox);
    yield* Queue.shutdown(args.rootEntry.cell.signalQueue);
    yield* Scope.close(args.rootEntry.scope, Exit.void);
    const fiberOpt = yield* STM.commit(TRef.get(args.rootEntry.fiber));
    if (Option.isSome(fiberOpt)) {
      yield* Fiber.await(fiberOpt.value);
    }
    yield* STM.commit(Registry.unregister(args.registry, args.rootEntry.path));
  });

const create = <RootMsg>(
  rootBehavior: Behavior<RootMsg>,
  name: string,
): Effect.Effect<ActorSystem<RootMsg>> =>
  Effect.gen(function* () {
    const registry = yield* Registry.make();

    // ActorRef 가 system handle 보유, system 이 root ref 보유 — cyclic.
    // handleRef 슬롯 먼저 만들고 root spawn 후 채움 (모두 sync 안에서 race-free).
    const handleRef: { ref: ActorSystemHandle | null } = { ref: null };
    const tellFn = tellViaSystem(registry);
    handleRef.ref = { name, tell: tellFn };

    const spawnCtx: SpawnContext = {
      registry,
      handle: handleRef.ref,
    };

    const { ref: rootRef, entry: rootEntry } = yield* spawnInternal<RootMsg>(
      spawnCtx,
      {
        path: ActorPath.root(name),
        behavior: rootBehavior,
        parentEntry: null,
      },
    );

    const sys: ActorSystem<RootMsg> = {
      name,
      registry,
      root: rootRef,
      tell: tellFn,
      shutdown: shutdownSystem({ registry, rootEntry }),
    };

    return sys;
  });

export const ActorSystem = {
  create,
};
