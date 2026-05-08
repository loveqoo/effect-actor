// examples/01-counter — M1 DoD.
// 보여주는 것: setup, ctx.spawn (자식), state machine (Behavior 매개변수),
// 자식 actor 로 reply 보내기 (ask 가 없는 M1 단계의 fan-out 형태).
//
// 실행: pnpm tsx examples/01-counter.ts

import { Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  type ActorRef,
  type Behavior,
} from "../src/index.js";

type CounterMsg =
  | { readonly _tag: "Inc" }
  | { readonly _tag: "Get" };

// Reporter — Counter 가 보내준 현재 값을 stdout 으로 보고.
const reporter: Behavior<number> = Behaviors.receiveMessage<number>((n) =>
  Effect.sync(() => {
    console.log(`current count: ${n}`);
    return Behaviors.same<number>();
  }),
);

// Counter — n 을 _Behavior 매개변수_ 로 (Akka Typed 정통).
// Inc: 다음 Behavior = counter(n+1). Get: reporter.tell(n).
const counter = (
  n: number,
  reportTo: ActorRef<number>,
): Behavior<CounterMsg> =>
  Behaviors.receiveMessage<CounterMsg>((msg) => {
    switch (msg._tag) {
      case "Inc":
        return Effect.succeed(counter(n + 1, reportTo));
      case "Get":
        return reportTo.tell(n).pipe(Effect.as(Behaviors.same<CounterMsg>()));
    }
  });

// Root — setup 으로 reporter 자식 spawn 후 counter(0) 시작.
const root: Behavior<CounterMsg> = Behaviors.setup<CounterMsg>((ctx) =>
  Effect.gen(function* () {
    const reportTo = yield* ctx.spawn(reporter, "reporter");
    return counter(0, reportTo);
  }),
);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(root, "counter-demo");

  yield* sys.root.tell({ _tag: "Inc" });
  yield* sys.root.tell({ _tag: "Inc" });
  yield* sys.root.tell({ _tag: "Inc" });
  yield* sys.root.tell({ _tag: "Get" }); // reporter 가 "current count: 3" 출력

  // fiber 가 메시지 처리할 짧은 시간
  yield* Effect.sleep("100 millis");

  yield* sys.shutdown;
});

Effect.runPromise(program).catch((err) => {
  console.error("counter demo failed:", err);
  process.exit(1);
});
