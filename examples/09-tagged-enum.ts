// examples/09-tagged-enum — Effect 정통 메시지 정의.
// 보여주는 것: `Data.TaggedEnum` 으로 메시지 ADT 한 곳에 정의 → constructor + $match + $is 자동.
// 01-counter 와 같은 시나리오에 payload 있는 메시지 (`Add`) 까지 추가.
//
// 매번 `{ _tag: "Inc" }` 리터럴 쓰는 대신 `RootMsg.Inc()` / `RootMsg.Add({ n: 5 })`.
// 받는 쪽도 `switch` 대신 `RootMsg.$match` — 컴파일 타임 exhaustiveness 보장.
//
// effect-actor 는 메시지 모양에 의견 없음 (사용자 도메인) — 리터럴 / const factory /
// `Data.TaggedEnum` 모두 OK. 같은 메시지를 여러 곳에서 만들거나 매처가 자주 등장하면
// `Data.taggedEnum` 이 가장 깔끔.
//
// 실행: pnpm tsx examples/09-tagged-enum.ts

import { Data, Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  type ActorRef,
  type Behavior,
} from "../src/index.js";

// 메시지 정의 — 한 곳에 ADT + constructor + matcher 모두.
type CounterMsg = Data.TaggedEnum<{
  Inc: {};
  Add: { readonly n: number };
  Get: {};
}>;
const CounterMsg = Data.taggedEnum<CounterMsg>();

// Reporter — 01-counter 와 동일 (값 메시지라 taggedEnum 불요).
const reporter: Behavior<number> = Behaviors.receiveMessage<number>((n) =>
  Effect.sync(() => {
    console.log(`current count: ${n}`);
    return Behaviors.same<number>();
  }),
);

// Counter — `$match` 로 분기. switch + _tag 비교보다 짧고, 새 case 추가 시
// 컴파일 에러로 _빠진 분기_ 잡아줌 (exhaustiveness).
const counter = (
  n: number,
  reportTo: ActorRef<number>,
): Behavior<CounterMsg> =>
  Behaviors.receiveMessage<CounterMsg>((msg) =>
    CounterMsg.$match(msg, {
      Inc: () => Effect.succeed(counter(n + 1, reportTo)),
      Add: ({ n: delta }) => Effect.succeed(counter(n + delta, reportTo)),
      Get: () =>
        reportTo.tell(n).pipe(Effect.as(Behaviors.same<CounterMsg>())),
    }),
  );

const root: Behavior<CounterMsg> = Behaviors.setup<CounterMsg>((ctx) =>
  Effect.gen(function* () {
    const reportTo = yield* ctx.spawn(reporter, "reporter");
    return counter(0, reportTo);
  }),
);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(root, "tagged-enum-demo");

  // 매번 리터럴 X — constructor 호출.
  yield* sys.root.tell(CounterMsg.Inc());
  yield* sys.root.tell(CounterMsg.Add({ n: 10 }));
  yield* sys.root.tell(CounterMsg.Inc());
  yield* sys.root.tell(CounterMsg.Get()); // "current count: 12"

  yield* Effect.sleep("100 millis");

  yield* sys.shutdown;
});

Effect.runPromise(program).catch((err) => {
  console.error("tagged-enum demo failed:", err);
  process.exit(1);
});
