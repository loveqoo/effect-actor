// examples/02-lifecycle — M2 DoD.
// 보여주는 것: setup (_최초 1회_ 자원 초기화) + PostStop (_명시 cleanup hook_, ADR-021 §3.8).
// counter(n) 의 onSignal 이 _그 시점의 n_ 을 closure 에 잡음 → 마지막 active Receive 의 n 이 PostStop 으로 전달.
// 메시지는 `Data.TaggedEnum` (Effect 정통, examples/09-tagged-enum 참고).
//
// 실행: pnpm tsx examples/02-lifecycle.ts

import { Data, Effect } from "effect";
import { ActorSystem, Behaviors, type Behavior } from "../src/index.js";

type Msg = Data.TaggedEnum<{
  Inc: {};
  Dec: {};
}>;
const Msg = Data.taggedEnum<Msg>();

// _Behavior 매개변수_ 패턴 (Akka Typed 정통). receiveSignal 로 PostStop 흐름 hook.
const counter = (n: number): Behavior<Msg> =>
  Behaviors.receive<Msg>((_ctx, msg) =>
    Effect.succeed(
      counter(
        Msg.$match(msg, {
          Inc: () => n + 1,
          Dec: () => n - 1,
        }),
      ),
    ),
  ).receiveSignal((_ctx, sig) =>
    Effect.sync(() => {
      if (sig._tag === "PostStop") {
        console.log(`[counter] final value at shutdown: ${n}`);
      }
      return Behaviors.same<Msg>();
    }),
  );

// Setup — _최초 1회_ 실행. 외부 자원 open 흉내. M4 부터 restart 마다 재실행 의미.
const root: Behavior<Msg> = Behaviors.setup<Msg>(() =>
  Effect.sync(() => {
    console.log("[setup] resource opened");
    return counter(0);
  }),
);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(root, "lifecycle-demo");

  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Dec());

  // 메시지 처리 시간
  yield* Effect.sleep("50 millis");

  // shutdown → PostStop 발사 → 마지막 counter(2) 의 onSignal 이 받음
  yield* sys.shutdown;
});

Effect.runPromise(program).catch((err) => {
  console.error("lifecycle demo failed:", err);
  process.exit(1);
});
