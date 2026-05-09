// examples/04-ask — M3 DoD.
// 보여주는 것: ctx.ask 패턴 (임시 actor 자동 spawn + race(reply, timeout)) + AskTimeout 캐치.
// typed reply err 는 reply ADT 안에 표현 (ADR-029 §결정 예시).
// 메시지는 `Data.TaggedEnum`. ask 의 `make` callback 안에서도 constructor 가 자연.
//
// 실행: pnpm tsx examples/04-ask.ts

import { Data, Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  type ActorRef,
  type Behavior,
} from "../src/index.js";

// Calculator — Add 메시지 받으면 replyTo 에 결과 보냄.
// 단일 메시지지만 payload 풍부 — taggedEnum 의 constructor 가 깔끔.
type CalcMsg = Data.TaggedEnum<{
  Add: {
    readonly a: number;
    readonly b: number;
    readonly replyTo: ActorRef<number>;
  };
}>;
const CalcMsg = Data.taggedEnum<CalcMsg>();

const calculator: Behavior<CalcMsg> = Behaviors.receiveMessage<CalcMsg>((msg) =>
  CalcMsg.$match(msg, {
    Add: ({ a, b, replyTo }) =>
      replyTo.tell(a + b).pipe(Effect.as(Behaviors.same<CalcMsg>())),
  }),
);

// Silent — 응답 안 함 (timeout 데모용).
const silent: Behavior<CalcMsg> = Behaviors.receiveMessage<CalcMsg>(() =>
  Effect.succeed(Behaviors.same<CalcMsg>()),
);

type RootMsg = Data.TaggedEnum<{
  AskOk: {};
  AskTimeout: {};
}>;
const RootMsg = Data.taggedEnum<RootMsg>();

const root = Behaviors.setup<RootMsg>((ctx) =>
  Effect.gen(function* () {
    const calc = yield* ctx.spawn(calculator, "calc");
    const slow = yield* ctx.spawn(silent, "slow");

    return Behaviors.receiveMessage<RootMsg>((m) =>
      RootMsg.$match(m, {
        AskOk: () =>
          ctx
            .ask<CalcMsg, number>(
              calc,
              (replyTo) => CalcMsg.Add({ a: 7, b: 5, replyTo }),
              "1 second",
            )
            .pipe(
              Effect.tap((sum) =>
                Effect.sync(() => console.log(`sum = ${sum}`)),
              ),
              Effect.as(Behaviors.same<RootMsg>()),
            ),
        // AskTimeout: silent 에게 ask — 100ms 내 응답 없음 → AskTimeout fail
        AskTimeout: () =>
          ctx
            .ask<CalcMsg, number>(
              slow,
              (replyTo) => CalcMsg.Add({ a: 1, b: 1, replyTo }),
              "100 millis",
            )
            .pipe(
              Effect.match({
                onSuccess: () => Behaviors.same<RootMsg>(),
                onFailure: (err) => {
                  console.log(
                    `ask timed out after ${err.timeoutMillis}ms (target: ${err.path.elements.join("/")})`,
                  );
                  return Behaviors.same<RootMsg>();
                },
              }),
            ),
      }),
    );
  }),
);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(root, "ask-demo");
  yield* sys.root.tell(RootMsg.AskOk());
  yield* sys.root.tell(RootMsg.AskTimeout());
  yield* Effect.sleep("300 millis");
  yield* sys.shutdown;
});

Effect.runPromise(program).catch((err) => {
  console.error("ask demo failed:", err);
  process.exit(1);
});
