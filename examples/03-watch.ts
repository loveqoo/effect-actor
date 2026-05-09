// examples/03-watch — M3 DoD.
// 보여주는 것: ctx.spawn + ctx.watchWith (자식 종료를 _자기 메시지 채널_ 로 알림) + ctx.stop graceful.
// watchWith 의 custom 메시지가 parent 의 mailbox 로 도착 — signal 보다 표현력 좋음 (ADT 분기 자연).
// 메시지는 `Data.TaggedEnum` — payload (`reason`) 도 자연.
//
// 실행: pnpm tsx examples/03-watch.ts

import { Data, Effect } from "effect";
import { ActorSystem, Behaviors, type Behavior } from "../src/index.js";

type ParentMsg = Data.TaggedEnum<{
  Start: {};
  WorkerGone: { readonly reason: string };
}>;
const ParentMsg = Data.taggedEnum<ParentMsg>();

// Worker — 단순 값 메시지 (string) 처리.
const worker = (id: string): Behavior<string> =>
  Behaviors.receiveMessage<string>((m) =>
    Effect.sync(() => {
      console.log(`[${id}] received: ${m}`);
      return Behaviors.same<string>();
    }),
  );

// Parent — worker 를 watchWith 로 감시. worker 정지 시 ParentMsg.WorkerGone 도착.
const parent = Behaviors.setup<ParentMsg>((ctx) =>
  Effect.gen(function* () {
    const w = yield* ctx.spawn(worker("alpha"), "alpha");
    yield* ctx.watchWith(w, ParentMsg.WorkerGone({ reason: "alpha stopped" }));

    return Behaviors.receiveMessage<ParentMsg>((m) =>
      ParentMsg.$match(m, {
        Start: () =>
          w
            .tell("hello")
            .pipe(
              Effect.flatMap(() => ctx.stop(w)),
              Effect.as(Behaviors.same<ParentMsg>()),
            ),
        WorkerGone: ({ reason }) => {
          console.log(`[parent] worker gone — reason: ${reason}`);
          return Effect.succeed(Behaviors.stopped<ParentMsg>());
        },
      }),
    );
  }),
);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(parent, "watch-demo");
  yield* sys.root.tell(ParentMsg.Start());
  yield* Effect.sleep("100 millis");
  yield* sys.shutdown;
});

Effect.runPromise(program).catch((err) => {
  console.error("watch demo failed:", err);
  process.exit(1);
});
