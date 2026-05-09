// examples/06-backoff — M5 사이클 2 (ADR-038).
// 보여주는 것:
//   1. Strategies.restartWithBackoff({ minBackoff, maxBackoff, randomFactor })
//   2. _점진 증가_ — 첫 fail 후 minBackoff, 다음 fail 후 ~2x, ... maxBackoff cap
//   3. _backoff sleep 도중 mailbox 보존_ — sleep 중 도착한 메시지가 새 incarnation 에서 처리
//   4. .withLimit chain — backoff + 한도 초과 시 stop 강등
//   5. RestartLimitExceeded cause (stop 시 fiber 종료 cause)
//
// 실행: pnpm tsx examples/06-backoff.ts

import { Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  Strategies,
  type Behavior,
} from "../src/index.js";

type Msg =
  | { readonly _tag: "Boom" }
  | { readonly _tag: "Probe"; readonly id: string };

const start = Date.now();
const ts = (): string =>
  `+${(Date.now() - start).toString().padStart(4)}ms`;

let setupCount = 0;

// flaky — Boom 만 die, Probe 는 정상 처리. setup 마다 incarnation 카운트 +1.
const flaky: Behavior<Msg> = Behaviors.setup<Msg>((_ctx) =>
  Effect.sync(() => {
    setupCount++;
    const inc = setupCount;
    console.log(`${ts()} [setup #${inc}] init`);
    return Behaviors.receive<Msg>((_c, msg) =>
      Effect.sync(() => {
        if (msg._tag === "Boom") {
          throw new Error("boom");
        }
        console.log(`${ts()} [#${inc}] received Probe(${msg.id})`);
        return Behaviors.same();
      }),
    );
  }),
);

// backoff: 200ms → 400ms → 800ms (cap=1s, randomFactor=0 결정성). withLimit 로 4번째 fail = stop.
const root: Behavior<Msg> = Behaviors.supervise(flaky).onFailure(
  Strategies.matchAll,
  Strategies.restartWithBackoff({
    minBackoff: "200 millis",
    maxBackoff: "1 second",
    randomFactor: 0,
  }).withLimit({ maxNrOfRetries: 3, withinTimeRange: "10 seconds" }),
);

const program = Effect.gen(function* () {
  console.log(`${ts()} [main] system.create`);
  const sys = yield* ActorSystem.create<Msg>(root, "backoff-demo");

  // 1) Boom → 200ms backoff. sleep 중 Probe 도착 → 새 incarnation 이 처리 (mailbox 보존).
  console.log(`${ts()} [main] tell Boom`);
  yield* sys.root.tell({ _tag: "Boom" });
  console.log(`${ts()} [main] tell Probe(during-sleep-1) — backoff 도중`);
  yield* sys.root.tell({ _tag: "Probe", id: "during-sleep-1" });
  yield* Effect.sleep("280 millis"); // 200ms backoff + 처리 여유

  // 2) Boom → 400ms backoff (2x).
  console.log(`${ts()} [main] tell Boom`);
  yield* sys.root.tell({ _tag: "Boom" });
  yield* Effect.sleep("500 millis");

  // 3) Boom → 800ms backoff (4x, cap 안).
  console.log(`${ts()} [main] tell Boom`);
  yield* sys.root.tell({ _tag: "Boom" });
  yield* Effect.sleep("900 millis");

  // 4) Boom → 한도 초과 (4번째 시도, maxNrOfRetries=3) → stop 강등.
  console.log(`${ts()} [main] tell Boom (한도 초과 예상)`);
  yield* sys.root.tell({ _tag: "Boom" });
  yield* Effect.sleep("400 millis");

  // 5) 액터 죽음 — 이 메시지는 dead-letter (best-effort)
  console.log(`${ts()} [main] tell Probe(after-stop) — dead-letter 예상`);
  yield* sys.root.tell({ _tag: "Probe", id: "after-stop" });
  yield* Effect.sleep("100 millis");

  console.log(`${ts()} [main] total setup invocations: ${setupCount}`);
  yield* sys.shutdown;
  console.log(`${ts()} [main] shutdown 완료`);
});

Effect.runPromise(program).catch((err) => {
  console.error("backoff demo failed:", err);
  process.exit(1);
});
