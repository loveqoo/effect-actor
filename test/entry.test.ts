import { describe, it, expect } from "vitest";
import {
  Chunk,
  Effect,
  ExecutionStrategy,
  Exit,
  HashMap,
  Option,
  STM,
  Scope,
  TRef,
} from "effect";
import { ActorEntry } from "../src/entry.js";
import { ActorPath } from "../src/path.js";
import { WatchKey, WatchMessage } from "../src/signal.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

describe("ActorEntry", () => {
  it("create 는 cell + scope + 빈 STM 컨테이너로 시작", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.child(ActorPath.root("demo"), "x");
        const entry = yield* ActorEntry.create<string>({
          path,
          uid: "uid-1",
        });
        expect(entry.path).toBe(path);
        expect(entry.uid).toBe("uid-1");

        const status = yield* STM.commit(TRef.get(entry.status));
        expect(status).toBe("running");

        const children = yield* STM.commit(TRef.get(entry.children));
        expect(Chunk.size(children)).toBe(0);

        const watchers = yield* STM.commit(TRef.get(entry.watchers));
        expect(HashMap.size(watchers)).toBe(0);

        const fiber = yield* STM.commit(TRef.get(entry.fiber));
        expect(Option.isNone(fiber)).toBe(true);
      }),
    ));

  it("STM 한 트랜잭션으로 status + children 동시 갱신 (ADR-017)", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.root("demo");
        const childPath = ActorPath.child(path, "c");
        const entry = yield* ActorEntry.create<string>({ path, uid: "u" });

        // 한 트랜잭션 — 둘 다 성공하거나 둘 다 실패
        yield* STM.commit(
          STM.gen(function* () {
            yield* TRef.set(entry.status, "restarting");
            yield* TRef.update(entry.children, (c) =>
              Chunk.append(c, childPath),
            );
          }),
        );

        const status = yield* STM.commit(TRef.get(entry.status));
        expect(status).toBe("restarting");

        const children = yield* STM.commit(TRef.get(entry.children));
        expect(Chunk.toReadonlyArray(children)).toContainEqual(childPath);
      }),
    ));

  it("watchers 에 (path, uid) 키로 등록 — 같은 path 다른 uid 는 다른 entry", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.root("demo");
        const watcherPath = ActorPath.child(path, "w");
        const entry = yield* ActorEntry.create<string>({ path, uid: "u" });

        const k1 = WatchKey.make(watcherPath, "uid-old");
        const k2 = WatchKey.make(watcherPath, "uid-new");

        yield* STM.commit(
          TRef.update(entry.watchers, (m) =>
            HashMap.set(m, k1, WatchMessage.Terminated),
          ),
        );
        yield* STM.commit(
          TRef.update(entry.watchers, (m) =>
            HashMap.set(m, k2, WatchMessage.Custom("custom-msg")),
          ),
        );

        const watchers = yield* STM.commit(TRef.get(entry.watchers));
        expect(HashMap.size(watchers)).toBe(2);

        const v1 = HashMap.get(watchers, k1);
        expect(Option.isSome(v1)).toBe(true);
        if (Option.isSome(v1)) {
          expect(v1.value._tag).toBe("Terminated");
        }
      }),
    ));

  it("cellScope close 가 되면 entry 의 자원 cleanup 동작 (ADR-035)", () =>
    run(
      Effect.gen(function* () {
        let cleaned = false;
        const path = ActorPath.root("demo");
        const entry = yield* ActorEntry.create<string>({ path, uid: "u" });

        // cellScope 안에 finalizer 등록 (lifetime — interpreter fiber 자리)
        yield* Scope.addFinalizer(
          entry.cellScope,
          Effect.sync(() => {
            cleaned = true;
          }),
        );

        // 닫기
        yield* Scope.close(entry.cellScope, Exit.void);
        expect(cleaned).toBe(true);
      }),
    ));

  it("instanceScope 는 cellScope 의 child — cellScope close 시 자동 cleanup (ADR-035)", () =>
    run(
      Effect.gen(function* () {
        let instanceCleaned = false;
        const path = ActorPath.root("demo");
        const entry = yield* ActorEntry.create<string>({ path, uid: "u" });

        const inst = yield* STM.commit(TRef.get(entry.instanceScope));
        yield* Scope.addFinalizer(
          inst,
          Effect.sync(() => {
            instanceCleaned = true;
          }),
        );

        // cellScope close 만 → instanceScope 도 자동
        yield* Scope.close(entry.cellScope, Exit.void);
        expect(instanceCleaned).toBe(true);
      }),
    ));

  it("instanceScope 는 TRef — restart 시 새 scope 로 교체 가능 (ADR-035)", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.root("demo");
        const entry = yield* ActorEntry.create<string>({ path, uid: "u" });

        const oldInst = yield* STM.commit(TRef.get(entry.instanceScope));
        yield* Scope.close(oldInst, Exit.void);

        // 새 child scope 만들어서 교체
        const newInst = yield* Scope.fork(
          entry.cellScope,
          ExecutionStrategy.sequential,
        );
        yield* STM.commit(TRef.set(entry.instanceScope, newInst));

        const stored = yield* STM.commit(TRef.get(entry.instanceScope));
        expect(stored).toBe(newInst);

        yield* Scope.close(entry.cellScope, Exit.void);
      }),
    ));
});
