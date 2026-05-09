// examples/05-restart — M4 DoD.
// 보여주는 것:
//   1. Behaviors.supervise + Strategies.restart 부착
//   2. _stable ref_ — restart 거쳐도 같은 sys.root 로 tell 가능 (uid 동일)
//   3. _mailbox 보존_ — restart 도중 들어온 메시지가 새 incarnation 에 처리됨
//   4. _Setup 재실행_ — counter init 이 restart 마다 다시 호출 (== 0 으로 리셋)
//   5. _PreRestart hook_ — receiveSignal 로 정리 작업 hook
//   6. _자식 cascade stop_ — restart 시 자식들이 PostStop 받고 새 instance 에서 다시 spawn
//   7. _매처 chain_ — TypeError → restart, 그 외 → stop (catch-all)
// 메시지는 `Data.TaggedEnum` — `$match` 가 `switch` 보다 짧고 새 case 추가 시 컴파일 강제.
//
// 실행: pnpm tsx examples/05-restart.ts

import { Data, Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  Strategies,
  type Behavior,
} from "../src/index.js";

type Msg = Data.TaggedEnum<{
  Inc: {};
  Boom: {}; // TypeError → restart
  Fatal: {}; // 미매치 → stop
  Show: {};
}>;
const Msg = Data.taggedEnum<Msg>();

// 자식 actor — 단일 메시지라 그대로 (taggedEnum 의 진가는 _다종_ 일 때).
const child: Behavior<{ readonly _tag: "Ping" }> = Behaviors.receive<{
  readonly _tag: "Ping";
}>((_ctx, _msg) => Effect.succeed(Behaviors.same())).receiveSignal(
  (_ctx, sig) =>
    Effect.sync(() => {
      if (sig._tag === "PostStop") console.log("  [child] PostStop");
      return Behaviors.same();
    }),
);

// counter(n) — _Behavior 매개변수_ 패턴. PreRestart / PostStop hook.
const counter = (n: number): Behavior<Msg> =>
  Behaviors.receive<Msg>((_ctx, msg) =>
    Msg.$match(msg, {
      Inc: () => Effect.succeed(counter(n + 1)),
      Show: () =>
        Effect.sync(() => {
          console.log(`  [counter] n = ${n}`);
          return counter(n);
        }),
      Boom: () =>
        Effect.sync<Behavior<Msg>>(() => {
          throw new TypeError("boom — restart 트리거");
        }),
      Fatal: () =>
        Effect.sync<Behavior<Msg>>(() => {
          throw new RangeError("fatal — stop 강등");
        }),
    }),
  ).receiveSignal((_ctx, sig) =>
    Effect.sync(() => {
      if (sig._tag === "PreRestart") {
        console.log(`  [counter] PreRestart (n=${n}) — 정리 작업 hook`);
      }
      if (sig._tag === "PostStop") {
        console.log(`  [counter] PostStop (n=${n}) — 최후 정리`);
      }
      return Behaviors.same();
    }),
  );

// Setup — restart 마다 _재실행_. counter 가 0 으로 리셋, 자식도 다시 spawn.
const root: Behavior<Msg> = Behaviors.supervise(
  Behaviors.setup<Msg>((ctx) =>
    Effect.gen(function* () {
      console.log("[setup] init — counter=0, child spawn");
      yield* ctx.spawn(child, "kid");
      return counter(0);
    }),
  ),
)
  // 가장 안쪽 (먼저 호출) = 가장 specific. TypeError 만 restart, 그 외는 catch-all stop.
  .onFailure(Strategies.matchInstance(TypeError), Strategies.restart)
  .onFailure(Strategies.matchAll, Strategies.stop);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create<Msg>(root, "restart-demo");
  const refBefore = sys.root;
  const uidBefore = refBefore.uid;
  console.log(`[main] root uid before any restart: ${uidBefore.slice(0, 8)}...`);

  // (1) 정상 처리
  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Show()); // n=2

  // (2) Boom → restart. _Boom 다음 enqueue 되는 메시지_ 는 mailbox 에 보존되어 새 incarnation 에서 처리.
  yield* sys.root.tell(Msg.Boom()); // restart 트리거
  yield* sys.root.tell(Msg.Inc()); // 새 counter(0) → counter(1)
  yield* sys.root.tell(Msg.Show()); // n=1 (Setup 재실행으로 0 리셋 + Inc)

  yield* Effect.sleep("100 millis");

  // (3) ref 안정성 검증 — 같은 ref/uid 로 계속 tell
  console.log(
    `[main] root uid after restart: ${sys.root.uid.slice(0, 8)}... (same? ${sys.root === refBefore && sys.root.uid === uidBefore})`,
  );

  // (4) 다시 Boom — 두 번째 restart, 자식도 두 번째 cascade
  yield* sys.root.tell(Msg.Boom());
  yield* sys.root.tell(Msg.Show()); // n=0 (Setup 또 리셋)
  yield* Effect.sleep("80 millis");

  // (5) Fatal → 미매치 → stop. 이후 메시지는 dead-letter.
  yield* sys.root.tell(Msg.Fatal());
  yield* Effect.sleep("60 millis");
  yield* sys.root.tell(Msg.Inc()); // dead-letter (액터 죽음)
  yield* Effect.sleep("40 millis");

  yield* sys.shutdown;
  console.log("[main] shutdown 완료");
});

Effect.runPromise(program).catch((err) => {
  console.error("restart demo failed:", err);
  process.exit(1);
});
