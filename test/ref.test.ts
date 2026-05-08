import { describe, it, expect } from "vitest";
import { Effect, Equal } from "effect";
import { Cell } from "../src/mailbox.js";
import { ActorPath } from "../src/path.js";
import { ActorRef } from "../src/ref.js";
import { stubSystem } from "./helpers.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

describe("ActorRef", () => {
  it("make 가 path/uid/cell/system 을 그대로 보유", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.child(ActorPath.root("test-sys"), "x");
        const cell = yield* Cell.make<string>();
        const ref = ActorRef.make({
          path,
          uid: "u1",
          cell,
          system: stubSystem,
        });
        expect(ref.path).toBe(path);
        expect(ref.uid).toBe("u1");
        expect(ref.cell).toBe(cell);
        expect(ref.system.name).toBe("test-sys");
      }),
    ));

  it("같은 (path, uid) 두 ref 는 equals true — cell 다르더라도 identity 동일", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.child(ActorPath.root("s"), "x");
        const cellA = yield* Cell.make<string>();
        const cellB = yield* Cell.make<string>();
        const a = ActorRef.make({
          path,
          uid: "u",
          cell: cellA,
          system: stubSystem,
        });
        const b = ActorRef.make({
          path,
          uid: "u",
          cell: cellB,
          system: stubSystem,
        });
        expect(ActorRef.equals(a, b)).toBe(true);
      }),
    ));

  it("uid 다르면 not equal — ABA 차단 (ADR-016)", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.child(ActorPath.root("s"), "x");
        const cell = yield* Cell.make<string>();
        const old = ActorRef.make({
          path,
          uid: "old",
          cell,
          system: stubSystem,
        });
        const fresh = ActorRef.make({
          path,
          uid: "fresh",
          cell,
          system: stubSystem,
        });
        expect(ActorRef.equals(old, fresh)).toBe(false);
      }),
    ));

  it("toString 은 path#uid", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.child(ActorPath.root("s"), "x");
        const cell = yield* Cell.make<string>();
        const ref = ActorRef.make({
          path,
          uid: "u1",
          cell,
          system: stubSystem,
        });
        expect(ActorRef.toString(ref)).toBe("actor://s/user/x#u1");
      }),
    ));

  it("watchKey 가 (path, uid) 조합으로 Equal 비교 (ADR-022)", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.child(ActorPath.root("s"), "x");
        const cell = yield* Cell.make<string>();
        const ref = ActorRef.make({
          path,
          uid: "u1",
          cell,
          system: stubSystem,
        });
        const k1 = ActorRef.watchKey(ref);
        const k2 = ActorRef.watchKey(ref);
        expect(Equal.equals(k1, k2)).toBe(true);
      }),
    ));
});
