import { describe, it, expect } from "vitest";
import { Effect, Queue } from "effect";
import { Behaviors } from "../src/behavior.js";
import { ActorContext } from "../src/context.js";
import { ActorEntry } from "../src/entry.js";
import { interpretStep, runInterpreter } from "../src/interpreter.js";
import { Cell } from "../src/mailbox.js";
import { ActorPath } from "../src/path.js";
import { ActorRef } from "../src/ref.js";
import { stubSystem } from "./helpers.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

const makeCtx = <Msg>() =>
  Effect.gen(function* () {
    const path = ActorPath.child(ActorPath.root("test-sys"), "x");
    const cell = yield* Cell.make<Msg>();
    const self = ActorRef.make({ path, uid: "u", cell, system: stubSystem });
    return ActorContext.make({ self, system: stubSystem });
  });

describe("interpretStep — 종결자 transition", () => {
  it("current = Same 이면 메시지 무시하고 Same 그대로", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const next = yield* interpretStep<string>(
          Behaviors.same(),
          ctx,
          "msg",
        );
        expect(next._tag).toBe("Same");
      }),
    ));

  it("current = Empty 이면 메시지 무시하고 Empty 그대로", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const next = yield* interpretStep<string>(
          Behaviors.empty(),
          ctx,
          "msg",
        );
        expect(next._tag).toBe("Empty");
      }),
    ));

  it("current = Unhandled 이면 메시지 무시하고 Unhandled 그대로 (DeathPact 는 M3)", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const next = yield* interpretStep<string>(
          Behaviors.unhandled(),
          ctx,
          "msg",
        );
        expect(next._tag).toBe("Unhandled");
      }),
    ));

  it("current = Stopped 면 Stopped — loop 종료 시그널", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const next = yield* interpretStep<string>(
          Behaviors.stopped(),
          ctx,
          "msg",
        );
        expect(next._tag).toBe("Stopped");
      }),
    ));
});

describe("interpretStep — Receive 처리", () => {
  it("Receive 의 handler 실행, ctx 와 msg 그대로 전달", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        let receivedMsg: string | null = null;
        let receivedCtxSelf = false;
        const b = Behaviors.receive<string>((c, m) => {
          receivedMsg = m;
          receivedCtxSelf = c.self === ctx.self;
          return Effect.succeed(Behaviors.same());
        });
        yield* interpretStep(b, ctx, "hello");
        expect(receivedMsg).toBe("hello");
        expect(receivedCtxSelf).toBe(true);
      }),
    ));

  it("Receive 가 Same 반환하면 _현재 Receive_ 그대로 (이전 behavior 유지)", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const original = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        );
        const next = yield* interpretStep(original, ctx, "msg");
        expect(next).toBe(original);
      }),
    ));

  it("Receive 가 Stopped 반환하면 Stopped", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const b = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.stopped()),
        );
        const next = yield* interpretStep(b, ctx, "msg");
        expect(next._tag).toBe("Stopped");
      }),
    ));

  it("Receive 가 새 Receive 반환하면 _그 새 Receive_ 가 다음 current", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const stage2 = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        );
        const stage1 = Behaviors.receive<string>(() => Effect.succeed(stage2));
        const next = yield* interpretStep(stage1, ctx, "msg");
        expect(next).toBe(stage2);
      }),
    ));

  it("receiveMessage 도 Receive ADT 로 풀려 같은 흐름 — ctx 무시 OK", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        let received: string | null = null;
        const b = Behaviors.receiveMessage<string>((m) => {
          received = m;
          return Effect.succeed(Behaviors.stopped());
        });
        const next = yield* interpretStep(b, ctx, "ping");
        expect(received).toBe("ping");
        expect(next._tag).toBe("Stopped");
      }),
    ));
});

const makeEntryAndCtx = <Msg>(uid: string = "u") =>
  Effect.gen(function* () {
    const path = ActorPath.child(ActorPath.root("test-sys"), "x");
    const entry = yield* ActorEntry.create<Msg>({ path, uid });
    const self = ActorRef.make({
      path,
      uid,
      cell: entry.cell,
      system: stubSystem,
    });
    const ctx = ActorContext.make<Msg>({ self, system: stubSystem });
    return { entry, ctx };
  });

describe("runInterpreter — Setup 평가 + loop + Stopped 종료", () => {
  it("Setup 의 init 이 한 번만 실행, 그 결과가 시작 behavior", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        let initCount = 0;

        const initial = Behaviors.setup<string>(() =>
          Effect.sync(() => {
            initCount += 1;
            return Behaviors.receiveMessage<string>((m) =>
              m === "stop"
                ? Effect.succeed(Behaviors.stopped())
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );

        yield* Queue.offer(entry.cell.mailbox, "ping");
        yield* Queue.offer(entry.cell.mailbox, "stop");

        yield* runInterpreter(initial, entry, ctx);

        expect(initCount).toBe(1);
      }),
    ));

  it("mailbox 에 쌓인 메시지를 순서대로 처리 후 Stopped 시 종료", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        const seen: string[] = [];

        const loop = Behaviors.receiveMessage<string>((m) => {
          if (m === "stop") return Effect.succeed(Behaviors.stopped());
          seen.push(m);
          return Effect.succeed(Behaviors.same());
        });

        yield* Queue.offer(entry.cell.mailbox, "a");
        yield* Queue.offer(entry.cell.mailbox, "b");
        yield* Queue.offer(entry.cell.mailbox, "c");
        yield* Queue.offer(entry.cell.mailbox, "stop");

        yield* runInterpreter(loop, entry, ctx);

        expect(seen).toEqual(["a", "b", "c"]);
      }),
    ));

  it("Same 반환 시 _이전 behavior_ 유지 — 상태 갈아치움 없이 같은 handler 재사용", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<number>();
        let calls = 0;

        const counter = (n: number): import("../src/behavior.js").Behavior<number> =>
          Behaviors.receiveMessage((m) => {
            calls += 1;
            if (m === -1) return Effect.succeed(Behaviors.stopped());
            // 상태 변경: 새 Behavior 반환
            return Effect.succeed(counter(n + m));
          });

        yield* Queue.offer(entry.cell.mailbox, 1);
        yield* Queue.offer(entry.cell.mailbox, 2);
        yield* Queue.offer(entry.cell.mailbox, 3);
        yield* Queue.offer(entry.cell.mailbox, -1);

        yield* runInterpreter(counter(0), entry, ctx);

        expect(calls).toBe(4);
      }),
    ));
});

describe("Supervision 외피 default stop (ADR-020)", () => {
  it("handler 가 Effect.fail 하면 runInterpreter 가 _정상 종료_ (실패 삼킴, default stop)", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        let processed = 0;

        const b = Behaviors.receiveMessage<string>((m) => {
          processed += 1;
          if (m === "boom") return Effect.fail(new Error("intentional"));
          return Effect.succeed(Behaviors.same());
        });

        yield* Queue.offer(entry.cell.mailbox, "ok-1");
        yield* Queue.offer(entry.cell.mailbox, "boom");
        // boom 후 메시지가 와도 처리 안 됨 (이미 종료)
        yield* Queue.offer(entry.cell.mailbox, "after-boom");

        yield* runInterpreter(b, entry, ctx);
        // 정상 종료 — 1, 2 만 처리. after-boom 은 mailbox 에 남음.
        expect(processed).toBe(2);
      }),
    ));

  it("Setup init 이 Effect.fail 해도 default stop — 정상 종료", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();

        const initial = Behaviors.setup<string>(() =>
          Effect.fail(new Error("init failed")),
        );

        // 정상 종료 (실패 삼킴)
        yield* runInterpreter(initial, entry, ctx);
        expect(true).toBe(true);
      }),
    ));

  it("Defect (Effect.die) 도 default stop — 외피가 모든 catchAllCause", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();

        const b = Behaviors.receiveMessage<string>(() =>
          Effect.die(new Error("defect")),
        );

        yield* Queue.offer(entry.cell.mailbox, "trigger");
        yield* runInterpreter(b, entry, ctx);
        expect(true).toBe(true);
      }),
    ));
});
