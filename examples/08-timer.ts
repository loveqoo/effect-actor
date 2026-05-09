// examples/08-timer — M5 사이클 3 (ADR-039).
// 보여주는 것:
//   1. Behaviors.withTimers<Msg>((timers) => ...)
//   2. timers.startTimerWithFixedDelay — heartbeat (interval 마다 self 메시지)
//   3. timers.startSingleTimer + timers.cancel — 일회성 + 취소
//   4. ctx.scheduleOnce — _다른_ 액터에 delayed tell
//   5. ctx.fork — instance scope 안 fork (사용자 직접). stop 시 자동 cancel.
// 메시지는 `Data.TaggedEnum`. 4종 + payload 가 있어서 $match 의 진가가 잘 보임.
//
// 실행: pnpm tsx examples/08-timer.ts

import { Data, Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  type Behavior,
} from "../src/index.js";

type Msg = Data.TaggedEnum<{
  Heartbeat: {};
  OneShot: {};
  CancelHeartbeat: {};
  Done: {};
}>;
const Msg = Data.taggedEnum<Msg>();

type ChildMsg = Data.TaggedEnum<{
  Wakeup: { readonly from: string };
}>;
const ChildMsg = Data.taggedEnum<ChildMsg>();

const start = Date.now();
const ts = (): string =>
  `+${(Date.now() - start).toString().padStart(4)}ms`;

// child — scheduleOnce 의 대상.
const child: Behavior<ChildMsg> = Behaviors.receive<ChildMsg>((_c, msg) =>
  Effect.sync(() =>
    ChildMsg.$match(msg, {
      Wakeup: ({ from }) => {
        console.log(`${ts()} [child] received Wakeup(from=${from})`);
        return Behaviors.same<ChildMsg>();
      },
    }),
  ),
);

// root — withTimers 안에서 heartbeat + oneShot 등록 + 자식에 scheduleOnce.
const root: Behavior<Msg> = Behaviors.setup<Msg>((ctx) =>
  Effect.gen(function* () {
    const childRef = yield* ctx.spawn(child, "kid");

    // 100ms 후 다른 액터에 메시지 (scheduleOnce).
    yield* ctx.scheduleOnce(
      "100 millis",
      childRef,
      ChildMsg.Wakeup({ from: "scheduleOnce" }),
    );

    // 사용자 직접 fork (instance scope 안). stop 시 자동 cancel — 마지막 검증.
    let backgroundTicks = 0;
    yield* ctx.fork(
      Effect.forever(
        Effect.sync(() => {
          backgroundTicks++;
        }).pipe(Effect.flatMap(() => Effect.sleep("30 millis"))),
      ),
    );

    return Behaviors.withTimers<Msg>((timers) =>
      Effect.gen(function* () {
        // 100ms 간격 heartbeat
        yield* timers.startTimerWithFixedDelay(
          "hb",
          Msg.Heartbeat(),
          "100 millis",
        );
        // 250ms 후 일회성
        yield* timers.startSingleTimer(
          "once",
          Msg.OneShot(),
          "250 millis",
        );

        let beats = 0;
        return Behaviors.receive<Msg>((_c, msg) =>
          Msg.$match(msg, {
            Heartbeat: () =>
              Effect.sync(() => {
                beats++;
                console.log(`${ts()} [root] heartbeat #${beats}`);
                return Behaviors.same<Msg>();
              }),
            OneShot: () =>
              Effect.sync(() => {
                console.log(`${ts()} [root] OneShot 도착`);
                return Behaviors.same<Msg>();
              }),
            CancelHeartbeat: () =>
              Effect.gen(function* () {
                console.log(`${ts()} [root] cancel heartbeat`);
                yield* timers.cancel("hb");
                return Behaviors.same<Msg>();
              }),
            Done: () =>
              Effect.sync(() => {
                console.log(
                  `${ts()} [root] Done — backgroundTicks=${backgroundTicks}, stop`,
                );
                return Behaviors.stopped<Msg>();
              }),
          }),
        );
      }),
    );
  }),
);

const program = Effect.gen(function* () {
  console.log(`${ts()} [main] system.create`);
  const sys = yield* ActorSystem.create<Msg>(root, "timer-demo");

  // 350ms 동안 heartbeat 3~4 회 + OneShot + scheduleOnce
  yield* Effect.sleep("350 millis");

  // heartbeat 취소
  yield* sys.root.tell(Msg.CancelHeartbeat());
  yield* Effect.sleep("250 millis");
  console.log(`${ts()} [main] (heartbeat 취소 후 — 추가 발사 X 확인)`);

  // 자발 stop — fork + 남은 timer 모두 자동 cancel
  yield* sys.root.tell(Msg.Done());
  yield* Effect.sleep("100 millis");

  yield* sys.shutdown;
  console.log(`${ts()} [main] shutdown 완료`);
});

Effect.runPromise(program).catch((err) => {
  console.error("timer demo failed:", err);
  process.exit(1);
});
