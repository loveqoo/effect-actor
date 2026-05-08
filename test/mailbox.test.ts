import { describe, it, expect } from "vitest";
import { Effect, Queue } from "effect";
import { Cell, MailboxPolicy } from "../src/mailbox.js";
import { Signal } from "../src/signal.js";

const run = <A>(eff: Effect.Effect<A>): Promise<A> => Effect.runPromise(eff);

describe("Cell", () => {
  it("make 기본은 unbounded mailbox", () =>
    run(
      Effect.gen(function* () {
        const cell = yield* Cell.make<string>();
        yield* Queue.offer(cell.mailbox, "a");
        yield* Queue.offer(cell.mailbox, "b");
        const a = yield* Queue.take(cell.mailbox);
        const b = yield* Queue.take(cell.mailbox);
        expect(a).toBe("a");
        expect(b).toBe("b");
      }),
    ));

  it("bounded backpressure 는 capacity 까지 즉시 enqueue", () =>
    run(
      Effect.gen(function* () {
        const cell = yield* Cell.make<number>(
          MailboxPolicy.bounded(2, "backpressure"),
        );
        const r1 = yield* Queue.offer(cell.mailbox, 1);
        const r2 = yield* Queue.offer(cell.mailbox, 2);
        expect(r1).toBe(true);
        expect(r2).toBe(true);
      }),
    ));

  it("bounded drop 는 capacity 초과 시 드랍 (offer false)", () =>
    run(
      Effect.gen(function* () {
        const cell = yield* Cell.make<number>(MailboxPolicy.bounded(1, "drop"));
        const r1 = yield* Queue.offer(cell.mailbox, 1);
        const r2 = yield* Queue.offer(cell.mailbox, 2);
        expect(r1).toBe(true);
        // dropping queue 는 capacity 초과 시 false 반환 (사용자 메시지 드랍)
        expect(r2).toBe(false);
      }),
    ));

  it("signalQueue 는 항상 unbounded — 신호 유실 안 됨 (ADR-009)", () =>
    run(
      Effect.gen(function* () {
        const cell = yield* Cell.make<string>(
          MailboxPolicy.bounded(1, "drop"),
        );
        // bounded mailbox 에도 signal 은 unbounded
        for (let i = 0; i < 10; i++) {
          yield* Queue.offer(cell.signalQueue, Signal.PostStop);
        }
        const size = yield* Queue.size(cell.signalQueue);
        expect(size).toBe(10);
      }),
    ));
});
