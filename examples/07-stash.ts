// examples/07-stash — M5 사이클 4 (ADR-040).
// 보여주는 것:
//   1. Behaviors.withStash<Msg>(capacity, (stash) => ...)
//   2. _초기화 단계_ — 외부 reply 도착 전 메시지 stash, 초기화 끝나고 unstashAll → ready
//   3. _Akka 정통 순서_ — stashed 메시지가 mailbox 새 메시지보다 먼저 처리
//   4. capacity 초과 → StashOverflow → supervision (Strategies.matchTag)
// 메시지는 `Data.TaggedEnum`. Strategies.matchTag("StashOverflow") 처럼 _tag 키만 알면
// 사용자 메시지 ADT 와 라이브러리 매처가 자연 합주.
//
// 실행: pnpm tsx examples/07-stash.ts

import { Data, Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  Strategies,
  type Behavior,
} from "../src/index.js";

type Msg = Data.TaggedEnum<{
  InitDone: { readonly userName: string };
  Greet: { readonly id: string };
}>;
const Msg = Data.taggedEnum<Msg>();

const start = Date.now();
const ts = (): string =>
  `+${(Date.now() - start).toString().padStart(4)}ms`;

// ready — 초기화 끝난 후 정상 동작 behavior. userName 클로저로 보존.
const ready = (userName: string): Behavior<Msg> =>
  Behaviors.receive<Msg>((_c, msg) =>
    Effect.sync(() =>
      Msg.$match(msg, {
        Greet: ({ id }) => {
          console.log(`${ts()} [ready] hello ${userName}, request=${id}`);
          return Behaviors.same<Msg>();
        },
        // InitDone 은 _ready 단계_ 에선 무시 (이미 초기화 끝).
        InitDone: () => Behaviors.same<Msg>(),
      }),
    ),
  );

// initializing — InitDone 도착 전 Greet 들이 stash. InitDone 받으면 unstashAll 후 ready.
const initializing: Behavior<Msg> = Behaviors.withStash<Msg>(50, (stash) =>
  Effect.sync(() =>
    Behaviors.receive<Msg>((_c, msg) =>
      Msg.$match(msg, {
        InitDone: ({ userName }) =>
          Effect.gen(function* () {
            const size = yield* stash.size;
            console.log(
              `${ts()} [init] InitDone(user=${userName}) — unstashAll size=${size}`,
            );
            return yield* stash.unstashAll(ready(userName));
          }),
        Greet: ({ id }) =>
          Effect.gen(function* () {
            yield* stash.stash(msg);
            const size = yield* stash.size;
            console.log(`${ts()} [init] stashed Greet(${id}), size=${size}`);
            return Behaviors.same<Msg>();
          }),
      }),
    ),
  ),
);

// 메인 시연 — 정상 흐름 (stash → unstashAll).
const happyPath = Effect.gen(function* () {
  console.log(`${ts()} [happy] system.create`);
  const sys = yield* ActorSystem.create<Msg>(initializing, "stash-happy");

  yield* sys.root.tell(Msg.Greet({ id: "before-1" }));
  yield* sys.root.tell(Msg.Greet({ id: "before-2" }));
  yield* sys.root.tell(Msg.Greet({ id: "before-3" }));
  yield* Effect.sleep("30 millis");

  console.log(`${ts()} [happy] tell InitDone`);
  yield* sys.root.tell(Msg.InitDone({ userName: "alice" }));
  yield* sys.root.tell(Msg.Greet({ id: "after-init" }));
  yield* Effect.sleep("60 millis");

  yield* sys.shutdown;
  console.log(`${ts()} [happy] shutdown 완료`);
});

// overflow 흐름 — capacity 초과 → StashOverflow → restart strategy 강등.
let overflowSetupCount = 0;
const overflowingInner: Behavior<Msg> = Behaviors.setup<Msg>((_ctx) =>
  Effect.sync(() => {
    overflowSetupCount++;
    const inc = overflowSetupCount;
    console.log(`${ts()} [overflow setup #${inc}] init`);
    return Behaviors.withStash<Msg>(2, (stash) =>
      Effect.sync(() =>
        Behaviors.receive<Msg>((_c, msg) =>
          Msg.$match(msg, {
            InitDone: ({ userName }) => stash.unstashAll(ready(userName)),
            // catch 안 함 — capacity 2 초과 시 step fail → restart
            Greet: () =>
              stash.stash(msg).pipe(Effect.as(Behaviors.same<Msg>())),
          }),
        ),
      ),
    );
  }),
);

const overflowingRoot: Behavior<Msg> = Behaviors.supervise(
  overflowingInner,
).onFailure(Strategies.matchTag("StashOverflow"), Strategies.restart);

const overflowPath = Effect.gen(function* () {
  console.log(`${ts()} [overflow] system.create (capacity=2)`);
  const sys = yield* ActorSystem.create<Msg>(overflowingRoot, "stash-overflow");

  // 3번째 stash 가 capacity 초과 → fail → restart → 새 buffer
  yield* sys.root.tell(Msg.Greet({ id: "1" }));
  yield* sys.root.tell(Msg.Greet({ id: "2" }));
  yield* sys.root.tell(Msg.Greet({ id: "3" })); // overflow → restart
  yield* Effect.sleep("80 millis");

  console.log(`${ts()} [overflow] tell InitDone (restart 후 새 buffer)`);
  yield* sys.root.tell(Msg.InitDone({ userName: "bob" }));
  yield* sys.root.tell(Msg.Greet({ id: "after-restart" }));
  yield* Effect.sleep("60 millis");

  console.log(
    `${ts()} [overflow] total setup invocations: ${overflowSetupCount}`,
  );
  yield* sys.shutdown;
  console.log(`${ts()} [overflow] shutdown 완료`);
});

const program = Effect.gen(function* () {
  yield* happyPath;
  yield* overflowPath;
});

Effect.runPromise(program).catch((err) => {
  console.error("stash demo failed:", err);
  process.exit(1);
});
