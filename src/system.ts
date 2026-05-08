import { randomUUID } from "node:crypto";
import { Effect, Exit, Fiber, Option, Queue, STM, Scope, TRef } from "effect";
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
// 사이클 4: root only spawn. 자식 spawn (ctx.spawn) 은 사이클 5 또는 M2.
export interface ActorSystem<RootMsg> extends ActorSystemHandle {
  readonly name: string;
  readonly registry: RegistryT;
  readonly root: ActorRef<RootMsg>;
  readonly shutdown: Effect.Effect<void>;
}

// spawn 흐름 (ARCHITECTURE.md §3.1, ADR-016/017/019/021/026).
// root spawn 만 — 자식 spawn 은 ctx.spawn 으로 사이클 5 에서.
const spawnRoot = <Msg>(args: {
  readonly registry: RegistryT;
  readonly systemName: string;
  readonly behavior: Behavior<Msg>;
  readonly handleRef: { ref: ActorSystemHandle | null };
}): Effect.Effect<{
  readonly ref: ActorRef<Msg>;
  readonly entry: ActorEntryT<Msg>;
}> =>
  Effect.gen(function* () {
    // 0. 메타 추출 (ADR-026)
    const meta = unwrapMeta(args.behavior);

    // 1. path
    const path = ActorPath.root(args.systemName);

    // 2. UID (ADR-016)
    const uid = randomUUID();

    // 3. Cell (ADR-019)
    const cell = yield* Cell.make<Msg>(meta.mailboxPolicy);

    // 4. Instance Scope (ADR-021)
    const scope = yield* Scope.make();

    // 5. ActorEntry — STM 안에서 TRef/TMap 초기화
    // 6. Registry 등록 — 같은 STM tx
    const entry = yield* STM.commit(
      STM.gen(function* () {
        const e = yield* ActorEntry.makeStm<Msg>({ path, uid, cell, scope });
        yield* Registry.register(args.registry, e);
        return e;
      }),
    );

    // 7. ActorRef 생성 (system handle 은 caller 가 채움)
    if (args.handleRef.ref === null) {
      // defensive — caller 가 setup
      yield* Effect.die("system handle not initialized");
    }
    const self = ActorRef.make<Msg>({
      path,
      uid,
      cell,
      system: args.handleRef.ref!,
    });

    // 8. ActorContext
    const ctx = ActorContext.make<Msg>({
      self,
      system: args.handleRef.ref!,
    });

    // 9. Fiber.fork — instance Scope 안에서. runInterpreter 가 Setup 평가 + loop.
    const fiber = yield* Effect.forkIn(
      runInterpreter(meta.inner, entry, ctx),
      scope,
    );

    // 10. entry.fiber 갱신 (STM tx)
    yield* STM.commit(TRef.set(entry.fiber, Option.some(fiber)));

    return { ref: self, entry };
  });

// ActorSystem.tell — STM read-only tx (uid + status 검증) → cell.mailbox.offer (ADR-019).
const tellViaSystem = (registry: RegistryT) =>
  <Msg>(ref: ActorRef<Msg>, msg: Msg): Effect.Effect<void> =>
    Effect.gen(function* () {
      // STM read-only tx
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

// system.shutdown — status=stopped → scope close (fiber 자동 interrupt + cleanup) → fiber.await → unregister.
// _shutdown 의 Effect 가 끝나면 fiber 가 정말 종료된 상태_ 보장 (Fiber.await).
const shutdownSystem = <Msg>(args: {
  readonly registry: RegistryT;
  readonly rootEntry: ActorEntryT<Msg>;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    // 1. status = stopped (이후 들어오는 tell 은 dead letter)
    yield* STM.commit(TRef.set(args.rootEntry.status, "stopped"));

    // 2. mailbox / signalQueue 종료 — 대기중인 take 풀림
    yield* Queue.shutdown(args.rootEntry.cell.mailbox);
    yield* Queue.shutdown(args.rootEntry.cell.signalQueue);

    // 3. instance Scope 닫기 — forkIn(scope) 의 fiber 자동 interrupt + cleanup (ADR-021)
    yield* Scope.close(args.rootEntry.scope, Exit.void);

    // 4. fiber 가 진짜 종료될 때까지 대기 — shutdown 끝 = fiber 끝 보장
    const fiberOpt = yield* STM.commit(TRef.get(args.rootEntry.fiber));
    if (Option.isSome(fiberOpt)) {
      yield* Fiber.await(fiberOpt.value);
    }

    // 5. registry unregister
    yield* STM.commit(Registry.unregister(args.registry, args.rootEntry.path));
  });

const create = <RootMsg>(
  rootBehavior: Behavior<RootMsg>,
  name: string,
): Effect.Effect<ActorSystem<RootMsg>> =>
  Effect.gen(function* () {
    const registry = yield* Registry.make();

    // ActorRef 가 system handle 을 보유해야 하는데 system 자체는 root spawn 결과로 만들어짐.
    // 닭과 달걀: handleRef 로 _참조 슬롯_ 만 먼저 만들고 root spawn 후 채움.
    const handleRef: { ref: ActorSystemHandle | null } = { ref: null };
    const tellFn = tellViaSystem(registry);
    handleRef.ref = {
      name,
      tell: tellFn,
    };

    const { ref: rootRef, entry: rootEntry } = yield* spawnRoot<RootMsg>({
      registry,
      systemName: name,
      behavior: rootBehavior,
      handleRef,
    });

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
