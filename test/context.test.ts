import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Cell } from "../src/mailbox.js";
import { ActorPath } from "../src/path.js";
import { ActorRef } from "../src/ref.js";
import { ActorContext } from "../src/context.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

const stubSystem = { name: "test-sys" };

describe("ActorContext.make", () => {
  it("self 와 system 보존", () =>
    run(
      Effect.gen(function* () {
        const path = ActorPath.child(ActorPath.root("test-sys"), "x");
        const cell = yield* Cell.make<string>();
        const self = ActorRef.make({
          path,
          uid: "u",
          cell,
          system: stubSystem,
        });
        const ctx = ActorContext.make({ self, system: stubSystem });
        expect(ctx.self).toBe(self);
        expect(ctx.system).toBe(stubSystem);
      }),
    ));
});
