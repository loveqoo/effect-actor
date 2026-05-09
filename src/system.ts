import { randomUUID } from "node:crypto";
import {
  Cause,
  Chunk,
  Deferred,
  Duration,
  Effect,
  Equal,
  ExecutionStrategy,
  Exit,
  Fiber,
  HashMap,
  Option,
  Queue,
  STM,
  Scope,
  TRef,
} from "effect";
import type { Behavior } from "./behavior.js";
import { Behaviors, unwrapMeta } from "./behavior.js";
import { AskTimeout } from "./errors.js";
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
import { Signal, WatchKey, WatchMessage } from "./signal.js";

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

    // 4. Scope 두 개 (ADR-035): cellScope = lifetime (interpreter fiber 여기 fork),
    //    instanceScope = instance (사용자 fork/timer). instanceScope 는 cellScope 의 child.
    const cellScope = yield* Scope.make();
    const instanceScope = yield* Scope.fork(
      cellScope,
      ExecutionStrategy.sequential,
    );

    // 5,6,7. ActorEntry + Registry.register + parent.children 갱신 — _한 STM tx_ (ADR-017)
    const entry = yield* STM.commit(
      STM.gen(function* () {
        const e = yield* ActorEntry.makeStm<Msg>({
          path: args.path,
          uid,
          cell,
          cellScope,
          instanceScope,
        });
        yield* Registry.register(spawnCtx.registry, e);
        if (args.parentEntry !== null) {
          // Chunk.append — insertion order 보존 (LIFO cascade 의 전제, M3.1)
          yield* TRef.update(args.parentEntry.children, (c) =>
            Chunk.append(c, args.path),
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

    // M3.1: spawn happens-before contract — child fiber 가 _Setup 평가_ 까지 끝낸 후 spawn 의 Effect 끝.
    // Latch 로 동기 — runInterpreter 가 evaluateInitial 후 latch.succeed.
    // 도그푸딩 #2 사이클 5 의 race 해결. 사용자 setup 안 ctx.spawn 들도 같은 보장 → 재귀 happens-before.
    const startedLatch = yield* Deferred.make<void, never>();

    // 9. Fiber.fork — _cellScope_ 안에서 (ADR-035): restart 거쳐도 같은 fiber 유지. Stop 시만 종료.
    // instanceScope 는 cellScope 의 child 라 cellScope close 시 자동 cleanup → 사용자 자원도 정리.
    // onFailure hook — supervision 외피가 잡은 Cause 를 부모에게 ChildFailed 로 알림 (M3 사이클 5).
    // supervisor — meta 추출된 SupervisorRule 배열. 빈 배열이면 기본 stop (M4 사이클 2, ADR-034).
    // onRestart — restart 발동 시 자식 cascade + instanceScope 교체 (M4 사이클 3, ADR-020/035).
    const fiber = yield* Effect.forkIn(
      runInterpreter(meta.inner, entry, ctx, {
        onFailure: (cause) =>
          notifyParentOfChildFailure(spawnCtx.registry, entry, cause),
        startedLatch,
        supervisor: meta.supervisor,
        onRestart: () => restartCleanup(spawnCtx.registry, entry),
      }),
      cellScope,
    );

    // 10. entry.fiber 갱신 (STM tx)
    yield* STM.commit(TRef.set(entry.fiber, Option.some(fiber)));

    // 11. Setup 평가 끝 (또는 Setup 아닌 경우 즉시) 까지 await — happens-before 보장.
    yield* Deferred.await(startedLatch);

    return { ref: self, entry };
  });

// 자식 spawn / stop 을 노출하는 ctx 만든다.
// ctx.spawn 이 spawnInternal 을 parent entry 와 함께 호출.
// ctx.stop 은 child 의 entry 를 Registry 에서 resolve 후 stopActor 호출 (ADR-031).
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
    stop: <ChildMsg>(child: ActorRef<ChildMsg>) =>
      stopActorByRef(spawnCtx.registry, child),
    watch: <Other>(other: ActorRef<Other>) =>
      watchOther(spawnCtx.registry, self, selfEntry, other, {
        _tag: "Terminated",
      }),
    watchWith: <Other>(other: ActorRef<Other>, msg: Msg) =>
      watchOther(spawnCtx.registry, self, selfEntry, other, {
        _tag: "Custom",
        msg,
      }),
    unwatch: <Other>(other: ActorRef<Other>) =>
      unwatchOther(spawnCtx.registry, self, selfEntry, other),
    watchTerminated: <Other>(other: ActorRef<Other>) =>
      watchTerminatedOther(spawnCtx.registry, self, other),
    ask: <TargetMsg, Resp>(
      target: ActorRef<TargetMsg>,
      make: (replyTo: ActorRef<Resp>) => TargetMsg,
      timeout: Duration.DurationInput,
    ) => askOther(spawnCtx, selfEntry, target, make, timeout),
  });

// restartCleanup — Restart strategy 발동 시 messageLoop 의 onRestart 콜백 (ADR-020/035, M4 사이클 3).
// 1. 자식 cascade stop (LIFO) — children TRef 는 stopActor 가 parent.children 에서 자동 제거하므로 비워짐.
// 2. instanceScope close + 새 fork (cellScope 의 child) — 사용자 fork/timer/scoped resource 정리.
// cellScope / cell / uid / path 모두 보존 — ref 안정 + mailbox 보존.
const restartCleanup = <Msg>(
  registry: RegistryT,
  entry: ActorEntryT<Msg>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    // 1. 자식 cascade stop — stopActor 의 children 부분과 동일 흐름.
    const childChunk = yield* STM.commit(TRef.get(entry.children));
    const childArray = Chunk.toReadonlyArray(Chunk.reverse(childChunk));
    yield* Effect.forEach(
      childArray,
      (childPath) =>
        STM.commit(Registry.resolve(registry, childPath)).pipe(
          Effect.flatMap((found) =>
            Option.isSome(found)
              ? stopActor(registry, found.value)
              : Effect.void,
          ),
        ),
      { concurrency: 1, discard: true },
    );

    // 2. instanceScope close + 새 fork. cellScope 는 그대로 (interpreter fiber 유지).
    const oldInst = yield* STM.commit(TRef.get(entry.instanceScope));
    yield* Scope.close(oldInst, Exit.void);
    const newInst = yield* Scope.fork(
      entry.cellScope,
      ExecutionStrategy.sequential,
    );
    yield* STM.commit(TRef.set(entry.instanceScope, newInst));
  });

// notifyParentOfChildFailure — supervision 외피의 Cause 를 부모에게 ChildFailed 로 알림 (ADR-022).
// 부모가 onSignal 로 ChildFailed 처리 (또는 미부착 시 무시 — DeathPact 는 Terminated 한정).
const notifyParentOfChildFailure = <Msg>(
  registry: RegistryT,
  childEntry: ActorEntryT<Msg>,
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const parentPath = ActorPath.parent(childEntry.path);
    if (Option.isNone(parentPath)) return;
    const parentFound = yield* STM.commit(
      Registry.resolve(registry, parentPath.value),
    );
    if (Option.isNone(parentFound)) return;
    yield* Queue.offer(
      parentFound.value.cell.signalQueue,
      Signal.ChildFailed(childEntry.path, childEntry.uid, cause),
    );
  });

// stopActor — graceful cascade 의 핵심 흐름 (ADR-031, ARCHITECTURE §3.6).
// 1. status = "stopped" (이후 tell 거부)
// 2. children 재귀 stop — 자식의 자식부터 (forEach unbounded — 자식들끼리 순서 무관)
// 3. 자식 stop 끝까지 await → PostStop hook 모두 호출 보장
// 4. 자기 PostStop offer → fiber 자발 종료 await
// 5. 자기 instance Scope close (자동 cleanup)
// 6. queue cleanup
// 7. registry unregister + parent.children 에서 제거
const stopActor = <Msg>(
  registry: RegistryT,
  entry: ActorEntryT<Msg>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* STM.commit(TRef.set(entry.status, "stopped"));

    // children 스냅샷 후 재귀 stop — _LIFO_ 순서 (마지막 spawn 자식부터, ADR-031 보강).
    // M3.1: HashSet (순서 X) → Chunk (insertion order). reverse + 순차 await 로 cascade 직렬.
    // concurrency 1 명시 (forEach 의 default 가 sequential 이지만 안전).
    const childChunk = yield* STM.commit(TRef.get(entry.children));
    const childArray = Chunk.toReadonlyArray(Chunk.reverse(childChunk));
    yield* Effect.forEach(
      childArray,
      (childPath) =>
        STM.commit(Registry.resolve(registry, childPath)).pipe(
          Effect.flatMap((found) =>
            Option.isSome(found)
              ? stopActor(registry, found.value)
              : Effect.void,
          ),
        ),
      { concurrency: 1, discard: true },
    );

    // 자기 PostStop emit + fiber 자발 종료 (interpreter 의 PostStop 흐름과 정합)
    yield* Queue.offer(entry.cell.signalQueue, Signal.PostStop);
    const fiberOpt = yield* STM.commit(TRef.get(entry.fiber));
    if (Option.isSome(fiberOpt)) {
      yield* Fiber.await(fiberOpt.value);
    }

    // 자동 cleanup — cellScope close 면 instanceScope 도 자동 (ADR-035 child 관계).
    // Stop 흐름은 cellScope 만 close 하면 됨. 사용자 fork/timer + interpreter fiber 의존 자원 모두 정리.
    yield* Scope.close(entry.cellScope, Exit.void);
    yield* Queue.shutdown(entry.cell.mailbox);
    yield* Queue.shutdown(entry.cell.signalQueue);

    // watchers 알림 (ADR-022) — 각 watcher 의 (path,uid) 가 정상이면 Terminated/Custom 발사.
    // ABA 안전: watcher.uid 가 현재 entry uid 와 다르면 새 incarnation, 옛 watch 무효.
    const watcherMap = yield* STM.commit(TRef.get(entry.watchers));
    const watcherPairs = Array.from(HashMap.entries(watcherMap));
    yield* Effect.forEach(
      watcherPairs,
      ([watcherKey, watchMsg]) =>
        Effect.gen(function* () {
          const wFound = yield* STM.commit(
            Registry.resolve(registry, watcherKey.path),
          );
          if (Option.isNone(wFound)) return;
          if (wFound.value.uid !== watcherKey.uid) return;
          if (watchMsg._tag === "Terminated") {
            yield* Queue.offer(
              wFound.value.cell.signalQueue,
              Signal.Terminated(entry.path, entry.uid),
            );
          } else if (watchMsg._tag === "Custom") {
            yield* Queue.offer(
              wFound.value.cell.mailbox as Queue.Queue<unknown>,
              watchMsg.msg,
            );
          } else if (watchMsg._tag === "Deferred") {
            // Effect 형태 watchTerminated — Deferred 직접 succeed (cell 무관).
            yield* Deferred.succeed(watchMsg.deferred, void 0 as void);
          }
        }),
      { concurrency: "unbounded", discard: true },
    );

    // Registry unregister + parent.children 에서 제거 (정합성, 한 STM tx)
    const parentPath = ActorPath.parent(entry.path);
    yield* STM.commit(
      STM.gen(function* () {
        yield* Registry.unregister(registry, entry.path);
        if (Option.isSome(parentPath)) {
          const parentFound = yield* Registry.resolve(
            registry,
            parentPath.value,
          );
          if (Option.isSome(parentFound)) {
            yield* TRef.update(parentFound.value.children, (c) =>
              Chunk.filter(c, (p) => !Equal.equals(p, entry.path)),
            );
          }
        }
      }),
    );
  });

// ctx.stop(child) — child entry resolve + uid 검증 (ABA 안전) → stopActor.
// stale ref / 이미 unregister 된 경우 silent (ADR-019 best-effort 정신).
const stopActorByRef = <Msg>(
  registry: RegistryT,
  ref: ActorRef<Msg>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const found = yield* STM.commit(Registry.resolve(registry, ref.path));
    if (Option.isNone(found)) return;
    if (found.value.uid !== ref.uid) return;
    yield* stopActor(registry, found.value);
  });

// ctx.watch / ctx.watchWith — 양방향 TMap 등록 (ADR-022).
// 이미 죽은 / stale ref 면 즉시 self 에게 알림 (Akka 정통).
const watchOther = <Msg, Other>(
  registry: RegistryT,
  self: ActorRef<Msg>,
  selfEntry: ActorEntryT<Msg>,
  other: ActorRef<Other>,
  watchMsg: WatchMessage,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const otherFound = yield* STM.commit(
      Registry.resolve(registry, other.path),
    );
    if (
      Option.isNone(otherFound) ||
      otherFound.value.uid !== other.uid
    ) {
      // 이미 죽은 / 새 incarnation — 즉시 self 에게 알림
      if (watchMsg._tag === "Terminated") {
        yield* Queue.offer(
          selfEntry.cell.signalQueue,
          Signal.Terminated(other.path, other.uid),
        );
      } else if (watchMsg._tag === "Custom") {
        yield* Queue.offer(
          selfEntry.cell.mailbox as Queue.Queue<unknown>,
          watchMsg.msg,
        );
      }
      // Deferred case 는 watchOther 호출자 (ctx.watch/watchWith) 에서 안 들어옴 —
      // watchTerminatedOther 가 직접 처리 (stale 시 즉시 return).
      return;
    }

    const otherKey = WatchKey.make(other.path, other.uid);
    const selfKey = WatchKey.make(self.path, self.uid);
    yield* STM.commit(
      STM.gen(function* () {
        yield* TRef.update(otherFound.value.watchers, (m) =>
          HashMap.set(m, selfKey, watchMsg),
        );
        yield* TRef.update(selfEntry.watching, (m) =>
          HashMap.set(m, otherKey, watchMsg),
        );
      }),
    );
  });

// ctx.watchTerminated — Effect 형태 termination await (ADR-030).
// Deferred 만들어 target.watchers 에 등록 → target stop 시 stopActor 가 Deferred.succeed.
// 이미 죽은 / stale ref → 즉시 Effect 끝 (Deferred 만들 필요 없이).
const watchTerminatedOther = <Msg, Other>(
  registry: RegistryT,
  self: ActorRef<Msg>,
  other: ActorRef<Other>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const otherFound = yield* STM.commit(
      Registry.resolve(registry, other.path),
    );
    if (
      Option.isNone(otherFound) ||
      otherFound.value.uid !== other.uid
    ) {
      // 이미 죽은 / 새 incarnation — 즉시 끝
      return;
    }

    const deferred = yield* Deferred.make<void, never>();
    const selfKey = WatchKey.make(self.path, self.uid);
    yield* STM.commit(
      TRef.update(otherFound.value.watchers, (m) =>
        HashMap.set(m, selfKey, WatchMessage.Deferred(deferred)),
      ),
    );

    yield* Deferred.await(deferred);
  });

// ctx.ask — Akka 정통 ask 패턴 (ADR-029).
// 임시 actor (`$ask-{N}`) 가 reply 받으면 Deferred.succeed → 자기 stop.
// caller 는 race(Deferred.await, sleep(timeout) → AskTimeout fail). ensuring 으로 임시 actor cleanup 보장.
const askOther = <Msg, TargetMsg, Resp>(
  spawnCtx: SpawnContext,
  selfEntry: ActorEntryT<Msg>,
  target: ActorRef<TargetMsg>,
  make: (replyTo: ActorRef<Resp>) => TargetMsg,
  timeout: Duration.DurationInput,
): Effect.Effect<Resp, AskTimeout> =>
  Effect.gen(function* () {
    const deferred = yield* Deferred.make<Resp, never>();

    const tempBehavior: Behavior<Resp> = Behaviors.receiveMessage<Resp>(
      (resp) =>
        Deferred.succeed(deferred, resp).pipe(
          Effect.as(Behaviors.stopped<Resp>()),
        ),
    );
    const tempName = `$ask-${randomUUID().slice(0, 8)}`;

    const { ref: tempRef } = yield* spawnInternal<Resp>(spawnCtx, {
      path: ActorPath.child(selfEntry.path, tempName),
      behavior: tempBehavior,
      parentEntry: selfEntry as ActorEntryT<unknown>,
    });

    yield* spawnCtx.handle.tell(target, make(tempRef));

    const timeoutMillis = Duration.toMillis(Duration.decode(timeout));
    return yield* Deferred.await(deferred).pipe(
      Effect.timeoutFail({
        duration: timeout,
        onTimeout: () =>
          new AskTimeout({ path: target.path, timeoutMillis }),
      }),
      Effect.ensuring(stopActorByRef(spawnCtx.registry, tempRef)),
    );
  });

// ctx.unwatch — 양방향 watcher 맵에서 키 제거. stale 도 silent.
const unwatchOther = <Msg, Other>(
  registry: RegistryT,
  self: ActorRef<Msg>,
  selfEntry: ActorEntryT<Msg>,
  other: ActorRef<Other>,
): Effect.Effect<void> =>
  STM.commit(
    STM.gen(function* () {
      const selfKey = WatchKey.make(self.path, self.uid);
      const otherKey = WatchKey.make(other.path, other.uid);
      const otherFound = yield* Registry.resolve(registry, other.path);
      if (
        Option.isSome(otherFound) &&
        otherFound.value.uid === other.uid
      ) {
        yield* TRef.update(otherFound.value.watchers, (m) =>
          HashMap.remove(m, selfKey),
        );
      }
      yield* TRef.update(selfEntry.watching, (m) =>
        HashMap.remove(m, otherKey),
      );
    }),
  );

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

// system.shutdown — root 부터 graceful cascade (ADR-031, M3 사이클 1).
// stopActor 가 모든 우선순위 (자식 cascade → PostStop hook → Scope cleanup → unregister) 를 처리.
const shutdownSystem = <Msg>(args: {
  readonly registry: RegistryT;
  readonly rootEntry: ActorEntryT<Msg>;
}): Effect.Effect<void> => stopActor(args.registry, args.rootEntry);

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
