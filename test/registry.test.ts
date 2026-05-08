import { describe, it, expect } from "vitest";
import { Effect, Option, STM } from "effect";
import { ActorEntry } from "../src/entry.js";
import { ActorPath } from "../src/path.js";
import { Registry } from "../src/registry.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

describe("Registry", () => {
  it("빈 registry 는 size 0", () =>
    run(
      Effect.gen(function* () {
        const reg = yield* Registry.make();
        const n = yield* STM.commit(Registry.size(reg));
        expect(n).toBe(0);
      }),
    ));

  it("register 후 resolve 가 같은 entry 반환", () =>
    run(
      Effect.gen(function* () {
        const reg = yield* Registry.make();
        const path = ActorPath.child(ActorPath.root("demo"), "x");
        const entry = yield* ActorEntry.create<string>({
          path,
          uid: "u1",
        });

        yield* STM.commit(Registry.register(reg, entry));
        const found = yield* STM.commit(Registry.resolve<string>(reg, path));
        expect(Option.isSome(found)).toBe(true);
        if (Option.isSome(found)) {
          expect(found.value.uid).toBe("u1");
        }
      }),
    ));

  it("없는 path resolve 는 None", () =>
    run(
      Effect.gen(function* () {
        const reg = yield* Registry.make();
        const path = ActorPath.root("demo");
        const found = yield* STM.commit(Registry.resolve(reg, path));
        expect(Option.isNone(found)).toBe(true);
      }),
    ));

  it("unregister 후 has 는 false", () =>
    run(
      Effect.gen(function* () {
        const reg = yield* Registry.make();
        const path = ActorPath.child(ActorPath.root("demo"), "x");
        const entry = yield* ActorEntry.create<string>({
          path,
          uid: "u",
        });

        yield* STM.commit(Registry.register(reg, entry));
        const before = yield* STM.commit(Registry.has(reg, path));
        expect(before).toBe(true);

        yield* STM.commit(Registry.unregister(reg, path));
        const after = yield* STM.commit(Registry.has(reg, path));
        expect(after).toBe(false);
      }),
    ));

  it("두 entry 한 트랜잭션 등록 — 트랜잭션 경계 (ADR-017)", () =>
    run(
      Effect.gen(function* () {
        const reg = yield* Registry.make();
        const root = ActorPath.root("demo");
        const a = ActorPath.child(root, "a");
        const b = ActorPath.child(root, "b");
        const entryA = yield* ActorEntry.create<unknown>({
          path: a,
          uid: "ua",
        });
        const entryB = yield* ActorEntry.create<unknown>({
          path: b,
          uid: "ub",
        });

        // 한 STM tx 안에 두 register — atomic
        yield* STM.commit(
          STM.gen(function* () {
            yield* Registry.register(reg, entryA);
            yield* Registry.register(reg, entryB);
          }),
        );

        const n = yield* STM.commit(Registry.size(reg));
        expect(n).toBe(2);
      }),
    ));

  it("동명 재등록은 덮어씀 (incarnation 다름 — ADR-016)", () =>
    run(
      Effect.gen(function* () {
        const reg = yield* Registry.make();
        const path = ActorPath.child(ActorPath.root("demo"), "x");
        const oldEntry = yield* ActorEntry.create<string>({
          path,
          uid: "uid-old",
        });
        const newEntry = yield* ActorEntry.create<string>({
          path,
          uid: "uid-new",
        });

        yield* STM.commit(Registry.register(reg, oldEntry));
        yield* STM.commit(Registry.register(reg, newEntry));

        const found = yield* STM.commit(Registry.resolve<string>(reg, path));
        expect(Option.isSome(found)).toBe(true);
        if (Option.isSome(found)) {
          // 옛 entry 가 사라지고 새 uid 만 유효
          expect(found.value.uid).toBe("uid-new");
        }
      }),
    ));
});
