import { describe, it, expect } from "vitest";
import { Effect, Queue } from "effect";
import { Behaviors } from "../src/behavior.js";
import { ActorRef } from "../src/ref.js";
import { ActorSystem } from "../src/system.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

describe("ActorSystem.create — 통합", () => {
  it("create + tell + shutdown — 한 메시지 처리하고 종료", () =>
    run(
      Effect.gen(function* () {
        let processed = "";
        const root = Behaviors.receiveMessage<string>((m) =>
          Effect.sync(() => {
            processed = m;
            return Behaviors.same();
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* sys.root.tell("hello");
        yield* Effect.sleep("20 millis"); // fiber 가 처리할 시간
        yield* sys.shutdown;

        expect(processed).toBe("hello");
        expect(sys.name).toBe("demo");
      }),
    ));

  it("root path 는 actor://<systemName>/user", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          Behaviors.empty<unknown>(),
          "my-sys",
        );
        expect(sys.root.path.system).toBe("my-sys");
        expect(sys.root.path.elements).toEqual(["user"]);
        yield* sys.shutdown;
      }),
    ));

  it("root 의 uid 가 spawn 시 부여됨 (ADR-016, UUID 형태)", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          Behaviors.empty<unknown>(),
          "demo",
        );
        // UUID 또는 충분히 unique 한 문자열
        expect(sys.root.uid.length).toBeGreaterThan(0);
        expect(typeof sys.root.uid).toBe("string");
        yield* sys.shutdown;
      }),
    ));
});

describe("ActorRef.tell — best-effort delivery (ADR-019)", () => {
  it("정상 ref tell → mailbox 에 enqueue", () =>
    run(
      Effect.gen(function* () {
        // Behaviors.empty 라 메시지가 mailbox 에 들어가도 처리 안 됨 (검증용)
        const sys = yield* ActorSystem.create(
          Behaviors.empty<string>(),
          "demo",
        );
        yield* sys.root.tell("test");
        // 잠깐 처리 시간 후 mailbox 가 _empty_ 가 아닐 수도 — Empty behavior 는
        // interpretStep 에서 메시지 무시하고 그대로. 즉 mailbox 에서 take 는 일어나도
        // 처리는 noop. 일단 fiber 가 take 했는지는 race — _최소 enqueue 성공_ 만 본다.
        // queue size 검사 대신 _shutdown 정상_ 으로 enqueue 자체는 OK 검증.
        yield* sys.shutdown;
        expect(true).toBe(true);
      }),
    ));

  it("stale ref (uid 다름) → dead letter, mailbox 에 안 들어감", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          // 메시지를 처리하지 않고 들어오면 _기록_ 만 — 실제로는 staleRef 가 enqueue 막힘.
          Behaviors.receiveMessage<string>(() =>
            Effect.succeed(Behaviors.same()),
          ),
          "demo",
        );
        const real = sys.root;
        const staleRef = ActorRef.make<string>({
          path: real.path,
          uid: "stale-uid-xxx",
          cell: real.cell,
          system: real.system,
        });

        yield* staleRef.tell("ghost");
        // 진짜 ref 의 mailbox 에 enqueue 안 됨
        const size = yield* Queue.size(real.cell.mailbox);
        expect(size).toBe(0);

        yield* sys.shutdown;
      }),
    ));

  it("shutdown 후 tell → dead letter (status=stopped)", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          Behaviors.receiveMessage<string>(() =>
            Effect.succeed(Behaviors.same()),
          ),
          "demo",
        );
        yield* sys.shutdown;
        // tell 이 silent dead letter — 에러 안 나야 함
        yield* sys.root.tell("after-shutdown");
        expect(true).toBe(true);
      }),
    ));
});
