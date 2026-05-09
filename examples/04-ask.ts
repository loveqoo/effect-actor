// examples/04-ask — M3 DoD.
// 보여주는 것: ctx.ask 패턴 (임시 actor 자동 spawn + race(reply, timeout)) + AskTimeout 캐치.
// typed reply err 는 reply ADT 안에 표현 (ADR-029 §결정 예시).
//
// 실행: pnpm tsx examples/04-ask.ts

import { Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  type ActorRef,
  type Behavior,
} from "../src/index.js";

// Calculator — Add 메시지 받으면 replyTo 에 결과 보냄.
type CalcMsg = {
  readonly _tag: "Add";
  readonly a: number;
  readonly b: number;
  readonly replyTo: ActorRef<number>;
};

const calculator: Behavior<CalcMsg> = Behaviors.receiveMessage<CalcMsg>((msg) =>
  msg.replyTo.tell(msg.a + msg.b).pipe(Effect.as(Behaviors.same<CalcMsg>())),
);

// Silent — 응답 안 함 (timeout 데모용).
const silent: Behavior<CalcMsg> = Behaviors.receiveMessage<CalcMsg>(() =>
  Effect.succeed(Behaviors.same<CalcMsg>()),
);

type RootMsg =
  | { readonly _tag: "AskOk" }
  | { readonly _tag: "AskTimeout" };

const root = Behaviors.setup<RootMsg>((ctx) =>
  Effect.gen(function* () {
    const calc = yield* ctx.spawn(calculator, "calc");
    const slow = yield* ctx.spawn(silent, "slow");

    return Behaviors.receiveMessage<RootMsg>((m) => {
      if (m._tag === "AskOk") {
        return ctx
          .ask<CalcMsg, number>(
            calc,
            (replyTo) => ({ _tag: "Add", a: 7, b: 5, replyTo }),
            "1 second",
          )
          .pipe(
            Effect.tap((sum) => Effect.sync(() => console.log(`sum = ${sum}`))),
            Effect.as(Behaviors.same<RootMsg>()),
          );
      }
      // AskTimeout: silent 에게 ask — 100ms 내 응답 없음 → AskTimeout fail
      return ctx
        .ask<CalcMsg, number>(
          slow,
          (replyTo) => ({ _tag: "Add", a: 1, b: 1, replyTo }),
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
        );
    });
  }),
);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(root, "ask-demo");
  yield* sys.root.tell({ _tag: "AskOk" });
  yield* sys.root.tell({ _tag: "AskTimeout" });
  yield* Effect.sleep("300 millis");
  yield* sys.shutdown;
});

Effect.runPromise(program).catch((err) => {
  console.error("ask demo failed:", err);
  process.exit(1);
});
