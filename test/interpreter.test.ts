import { describe, it, expect } from "vitest";
import { Effect, Queue } from "effect";
import { Behaviors } from "../src/behavior.js";
import { ActorContext } from "../src/context.js";
import { ActorEntry } from "../src/entry.js";
import {
  interpretSignalStep,
  interpretStep,
  runInterpreter,
} from "../src/interpreter.js";
import { Cell } from "../src/mailbox.js";
import { ActorPath } from "../src/path.js";
import { ActorRef } from "../src/ref.js";
import { Signal } from "../src/signal.js";
import {
  stubAsk,
  stubSpawn,
  stubStop,
  stubSystem,
  stubUnwatch,
  stubWatch,
  stubWatchTerminated,
  stubWatchWith,
} from "./helpers.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

const makeCtx = <Msg>() =>
  Effect.gen(function* () {
    const path = ActorPath.child(ActorPath.root("test-sys"), "x");
    const cell = yield* Cell.make<Msg>();
    const self = ActorRef.make({ path, uid: "u", cell, system: stubSystem });
    return ActorContext.make<Msg>({
      self,
      system: stubSystem,
      spawn: stubSpawn,
      stop: stubStop,
      watch: stubWatch,
      watchWith: stubWatchWith,
      unwatch: stubUnwatch,
      watchTerminated: stubWatchTerminated,
      ask: stubAsk,
    });
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
    const ctx = ActorContext.make<Msg>({
      self,
      system: stubSystem,
      spawn: stubSpawn,
      stop: stubStop,
      watch: stubWatch,
      watchWith: stubWatchWith,
      unwatch: stubUnwatch,
      watchTerminated: stubWatchTerminated,
      ask: stubAsk,
    });
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

describe("interpretSignalStep — 신호 분기 (M2 사이클 2)", () => {
  it("onSignal 없는 Receive 면 current 그대로 — 신호 무시 (Akka unhandled)", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const b = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        );
        const next = yield* interpretSignalStep<string>(
          b,
          ctx,
          Signal.PostStop,
        );
        expect(next).toBe(b);
      }),
    ));

  it("Same/Empty/Stopped/Unhandled/Setup 도 신호에 대해 current 그대로 (사이클 2 default)", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        for (const b of [
          Behaviors.same<string>(),
          Behaviors.empty<string>(),
          Behaviors.stopped<string>(),
          Behaviors.unhandled<string>(),
        ]) {
          const next = yield* interpretSignalStep<string>(
            b,
            ctx,
            Signal.PostStop,
          );
          expect(next).toBe(b);
        }
      }),
    ));

  it("onSignal 부착되면 호출 + 결과 채택", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        let receivedSig: Signal | null = null;
        const sig2 = Behaviors.stopped<string>();
        const b = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        ).receiveSignal((_c, s) => {
          receivedSig = s;
          return Effect.succeed(sig2);
        });
        const next = yield* interpretSignalStep<string>(
          b,
          ctx,
          Signal.PostStop,
        );
        expect(receivedSig).toEqual(Signal.PostStop);
        expect(next).toBe(sig2);
      }),
    ));

  it("onSignal 이 Same 반환하면 _현재 Receive_ 유지", () =>
    run(
      Effect.gen(function* () {
        const ctx = yield* makeCtx<string>();
        const b = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        ).receiveSignal(() => Effect.succeed(Behaviors.same()));
        const next = yield* interpretSignalStep<string>(
          b,
          ctx,
          Signal.PreRestart,
        );
        expect(next).toBe(b);
      }),
    ));
});

describe("runInterpreter — 신호 우선 폴링 (M2 사이클 2)", () => {
  it("signalQueue 에만 신호 + mailbox 비어 있음 — 신호 처리되고 종료 가능", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        let sigSeen: Signal | null = null;
        const b = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        ).receiveSignal((_c, s) => {
          sigSeen = s;
          return Effect.succeed(Behaviors.stopped());
        });

        yield* Queue.offer(entry.cell.signalQueue, Signal.PostStop);

        yield* runInterpreter(b, entry, ctx);
        expect(sigSeen).toEqual(Signal.PostStop);
      }),
    ));

  it("signal + message 둘 다 큐에 있으면 _signal 먼저_", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        const order: string[] = [];

        const b = Behaviors.receive<string>((_c, m) => {
          order.push(`msg:${m}`);
          if (m === "stop") return Effect.succeed(Behaviors.stopped());
          return Effect.succeed(Behaviors.same());
        }).receiveSignal((_c, s) => {
          // PostStop 은 자동 emit 으로 끝에 한 번 더 옴 — 이 테스트는 PreRestart 만 추적.
          if (s._tag === "PreRestart") order.push(`sig:${s._tag}`);
          return Effect.succeed(Behaviors.same());
        });

        // 메시지를 _먼저_ 박아도 signal 이 _먼저_ 처리되어야 함.
        yield* Queue.offer(entry.cell.mailbox, "a");
        yield* Queue.offer(entry.cell.mailbox, "stop");
        yield* Queue.offer(entry.cell.signalQueue, Signal.PreRestart);

        yield* runInterpreter(b, entry, ctx);

        // signal 먼저, 그 다음 mailbox 순서대로
        expect(order).toEqual(["sig:PreRestart", "msg:a", "msg:stop"]);
      }),
    ));

  it("onSignal 없는 Behavior 가 signal 받으면 무시, mailbox 처리 계속", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        const seen: string[] = [];

        const b = Behaviors.receive<string>((_c, m) => {
          seen.push(m);
          if (m === "stop") return Effect.succeed(Behaviors.stopped());
          return Effect.succeed(Behaviors.same());
        });
        // onSignal 미부착 — signal 무시.

        // PostStop 대신 PreRestart — PostStop 은 사이클 3 부터 자발 종료 트리거.
        yield* Queue.offer(entry.cell.signalQueue, Signal.PreRestart);
        yield* Queue.offer(entry.cell.mailbox, "x");
        yield* Queue.offer(entry.cell.mailbox, "stop");

        yield* runInterpreter(b, entry, ctx);
        expect(seen).toEqual(["x", "stop"]);
      }),
    ));

  it("onSignal 결과가 새 Receive 면 _새_ Behavior 가 다음 메시지 처리", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        const seen: string[] = [];

        const stage2 = Behaviors.receive<string>((_c, m) => {
          seen.push(`s2:${m}`);
          return Effect.succeed(Behaviors.stopped());
        });

        const stage1 = Behaviors.receive<string>((_c, m) => {
          seen.push(`s1:${m}`);
          return Effect.succeed(Behaviors.same());
        }).receiveSignal(() => Effect.succeed(stage2));

        yield* Queue.offer(entry.cell.signalQueue, Signal.PreRestart);
        yield* Queue.offer(entry.cell.mailbox, "after-sig");

        yield* runInterpreter(stage1, entry, ctx);
        expect(seen).toEqual(["s2:after-sig"]);
      }),
    ));
});

describe("runInterpreter — PostStop 자동 emit (M2 사이클 3, ADR-021 §3.8)", () => {
  it("Behavior 가 자발 Stopped 반환 시 _마지막 active Receive_ 의 onSignal 이 PostStop 받음", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        let postStopSeen = false;

        const b = Behaviors.receiveMessage<string>((m) =>
          m === "stop"
            ? Effect.succeed(Behaviors.stopped())
            : Effect.succeed(Behaviors.same()),
        ).receiveSignal((_c, s) => {
          if (s._tag === "PostStop") postStopSeen = true;
          return Effect.succeed(Behaviors.same());
        });

        yield* Queue.offer(entry.cell.mailbox, "stop");
        yield* runInterpreter(b, entry, ctx);

        expect(postStopSeen).toBe(true);
      }),
    ));

  it("외부에서 signalQueue 에 PostStop offer 시 onSignal 호출 _후 fiber 자발 종료_", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        let postStopSeen = false;

        const b = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        ).receiveSignal((_c, s) => {
          if (s._tag === "PostStop") postStopSeen = true;
          return Effect.succeed(Behaviors.same());
        });

        yield* Queue.offer(entry.cell.signalQueue, Signal.PostStop);
        yield* runInterpreter(b, entry, ctx);

        expect(postStopSeen).toBe(true);
      }),
    ));

  it("onSignal 미부착 Behavior 가 자발 Stopped — PostStop noop, fiber 정상 종료", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        const b = Behaviors.receiveMessage<string>(() =>
          Effect.succeed(Behaviors.stopped()),
        );
        yield* Queue.offer(entry.cell.mailbox, "trigger");
        yield* runInterpreter(b, entry, ctx);
        expect(true).toBe(true);
      }),
    ));

  it("자발 Stopped — 직전 active Receive (stage 변환 후) 의 onSignal 이 PostStop 받음", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        let s1Saw = false;
        let s2Saw = false;

        const stage2 = Behaviors.receiveMessage<string>(() =>
          Effect.succeed(Behaviors.stopped()),
        ).receiveSignal((_c, s) => {
          if (s._tag === "PostStop") s2Saw = true;
          return Effect.succeed(Behaviors.same());
        });

        const stage1 = Behaviors.receiveMessage<string>(() =>
          Effect.succeed(stage2),
        ).receiveSignal((_c, s) => {
          if (s._tag === "PostStop") s1Saw = true;
          return Effect.succeed(Behaviors.same());
        });

        yield* Queue.offer(entry.cell.mailbox, "to-stage2");
        yield* Queue.offer(entry.cell.mailbox, "stop");
        yield* runInterpreter(stage1, entry, ctx);

        expect(s1Saw).toBe(false);
        expect(s2Saw).toBe(true);
      }),
    ));

  it("PostStop 자동 emit 은 _한 번만_ 호출 — 자발 Stopped + 외부 PostStop 둘 다 와도 중복 X", () =>
    run(
      Effect.gen(function* () {
        const { entry, ctx } = yield* makeEntryAndCtx<string>();
        let postStopCount = 0;

        const b = Behaviors.receiveMessage<string>(() =>
          Effect.succeed(Behaviors.stopped()),
        ).receiveSignal((_c, s) => {
          if (s._tag === "PostStop") postStopCount += 1;
          return Effect.succeed(Behaviors.same());
        });

        yield* Queue.offer(entry.cell.signalQueue, Signal.PostStop);
        yield* Queue.offer(entry.cell.mailbox, "boom");
        yield* runInterpreter(b, entry, ctx);

        expect(postStopCount).toBe(1);
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
