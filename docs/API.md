# API — 사용자 시안과 사용 예시

> 이 문서는 `effect-actor` 의 _사용자_ 가 보는 표면이다.
> poly-phony에서 어떻게 import해서 쓸지 _상상의 도그푸딩_ 을 여기서 한다.
> 시그니처가 어색하게 느껴지면 곧장 고친다 — 실제 구현보다 이 문서가 먼저다.

---

## 1. 첫 다섯 줄

```typescript
import { ActorSystem, Behaviors } from "@loveqoo/effect-actor";
import { Effect } from "effect";

const root = Behaviors.receiveMessage<string>((msg) =>
  Effect.sync(() => console.log(`got: ${msg}`)).pipe(Effect.as(Behaviors.same))
);

const program = Effect.gen(function* () {
  const system = yield* ActorSystem.create(root, "demo");
  yield* system.root.tell("hello");
  yield* Effect.sleep("100 millis");
  yield* system.shutdown;
});
```

이 다섯 줄을 _읽는 데 30초_, _이해하는 데 1분_ 안에 끝나야 한다. 어렵게 느껴지면 시그니처가 잘못된 것.

---

## 2. 핵심 타입

### 2.1 `Behavior<Msg>`

액터의 _다음 동작_ 을 표현하는 불변 값. 메시지를 받으면 _다음 Behavior_ 를 반환.

```typescript
type Behavior<Msg> = {
  readonly _tag: "Receive" | "Setup" | "Same" | "Stopped" | ...;
};
```

직접 만드는 일은 거의 없다. `Behaviors.*` 빌더로 만든다.

### 2.2 `ActorRef<Msg>`

액터의 논리 주소. 메시지 보내는 능력만.

```typescript
class ActorRef<Msg> {
  readonly path: ActorPath;
  tell(msg: Msg): Effect<void>;
  ask<Reply>(make: (replyTo: ActorRef<Reply>) => Msg, timeout: Duration): Effect<Reply>;
  narrow<U extends Msg>(): ActorRef<U>;
}
```

### 2.3 `ActorContext<Msg>`

`Behaviors.receive` 안에서 외부와 상호작용하는 통로.

```typescript
class ActorContext<Msg> {
  readonly self: ActorRef<Msg>;
  readonly system: ActorSystem;
  readonly log: Logger;

  spawn<ChildMsg>(b: Behavior<ChildMsg>, name: string): Effect<ActorRef<ChildMsg>>;
  spawnAnonymous<ChildMsg>(b: Behavior<ChildMsg>): Effect<ActorRef<ChildMsg>>;

  watch<M>(other: ActorRef<M>): Effect<void>;
  watchWith<M, MyMsg extends Msg>(other: ActorRef<M>, msg: MyMsg): Effect<void>;
  unwatch<M>(other: ActorRef<M>): Effect<void>;

  stop<M>(child: ActorRef<M>): Effect<void>;

  scheduleOnce<M>(delay: Duration, target: ActorRef<M>, msg: M): Effect<void>;
}
```

### 2.4 `ActorSystem`

전체 시스템. 보통 프로세스당 하나.

```typescript
class ActorSystem {
  readonly name: string;
  readonly root: ActorRef<???>;  // root guardian의 ref. 메시지 타입은 root behavior에 따라
  readonly shutdown: Effect<void>;

  static create<Msg>(root: Behavior<Msg>, name: string): Effect<ActorSystem>;
}
```

> ⚠️ `system.root` 의 타입 매개변수 처리는 미결. 후보:
> - root behavior의 Msg 타입을 system 인스턴스에 그대로 살림 (`ActorSystem<Msg>`)
> - root는 internal로 두고, 사용자는 `system.spawn(...)` 으로 직접 자식 만듦
> 도그푸딩에서 결정.

### 2.5 `Behaviors` 빌더

```typescript
const Behaviors: {
  // 메시지 + 컨텍스트
  receive<Msg>(
    f: (ctx: ActorContext<Msg>, msg: Msg) => Effect<Behavior<Msg>>
  ): Behavior<Msg>;

  // 메시지만
  receiveMessage<Msg>(
    f: (msg: Msg) => Effect<Behavior<Msg>>
  ): Behavior<Msg>;

  // 신호도 받기 (체이닝)
  receiveSignal<Msg>(...): { receive: ... };

  // 시작 시 일회 setup
  setup<Msg>(
    f: (ctx: ActorContext<Msg>) => Effect<Behavior<Msg>>
  ): Behavior<Msg>;

  // 종결자
  same<Msg>(): Behavior<Msg>;
  stopped<Msg>(): Behavior<Msg>;
  empty<Msg>(): Behavior<Msg>;
  unhandled<Msg>(): Behavior<Msg>;

  // 부가 도구
  withTimers<Msg>(f: (timers: Timers<Msg>) => Behavior<Msg>): Behavior<Msg>;
  withStash<Msg>(capacity: number, f: (stash: Stash<Msg>) => Behavior<Msg>): Behavior<Msg>;

  // 감독
  supervise<Msg>(b: Behavior<Msg>): SuperviseBuilder<Msg>;
};

type SuperviseBuilder<Msg> = {
  onFailure<E>(error: ErrorMatcher<E>, strategy: SupervisorStrategy): Behavior<Msg>;
};
```

### 2.6 `SupervisorStrategy`

```typescript
const Strategies: {
  resume: SupervisorStrategy;
  restart: SupervisorStrategy;
  stop: SupervisorStrategy;
  restartWithBackoff(opts: {
    minBackoff: Duration;
    maxBackoff: Duration;
    randomFactor?: number;
  }): SupervisorStrategy;
};

// limit 부착
Strategies.restart.withLimit({ maxNrOfRetries: 5, withinTimeRange: "1 minute" });
```

### 2.7 `Signal`

```typescript
type Signal =
  | { _tag: "PreRestart" }
  | { _tag: "PostStop" }
  | { _tag: "Terminated"; ref: ActorRef<unknown>; reason: TerminationReason }
  | { _tag: "ChildFailed"; ref: ActorRef<unknown>; cause: unknown };
```

---

## 3. 사용 예시

### 3.1 카운터

가장 단순한 액터.

```typescript
type Counter =
  | { _tag: "Inc" }
  | { _tag: "Get"; replyTo: ActorRef<number> };

const counter = (n: number): Behavior<Counter> =>
  Behaviors.receiveMessage((msg) =>
    Effect.gen(function* () {
      switch (msg._tag) {
        case "Inc":
          return counter(n + 1);
        case "Get":
          yield* msg.replyTo.tell(n);
          return Behaviors.same();
      }
    })
  );

// 사용
const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(counter(0), "counter-demo");
  yield* sys.root.tell({ _tag: "Inc" });
  yield* sys.root.tell({ _tag: "Inc" });
  const value = yield* sys.root.ask<number>(
    (replyTo) => ({ _tag: "Get", replyTo }),
    "1 second"
  );
  // value === 2
});
```

상태(`n`)는 _Behavior의 매개변수_ 로 전달된다. 변경하려면 _다음 Behavior를 반환_. 어디에도 mutable 변수가 없다.

### 3.2 자식 spawn

부모가 자식 둘을 만들고 메시지 라우팅.

```typescript
type WorkerMsg = { _tag: "Process"; data: string };
type ParentMsg = { _tag: "Distribute"; data: string };

const worker = (id: string): Behavior<WorkerMsg> =>
  Behaviors.receive((ctx, msg) =>
    Effect.sync(() => ctx.log.info(`[${id}] ${msg.data}`)).pipe(
      Effect.as(Behaviors.same())
    )
  );

const parent = Behaviors.setup<ParentMsg>((ctx) =>
  Effect.gen(function* () {
    const w1 = yield* ctx.spawn(worker("w1"), "w1");
    const w2 = yield* ctx.spawn(worker("w2"), "w2");

    let nextWorker = w1;
    return Behaviors.receiveMessage<ParentMsg>((msg) =>
      Effect.gen(function* () {
        yield* nextWorker.tell({ _tag: "Process", data: msg.data });
        nextWorker = nextWorker === w1 ? w2 : w1;
        return Behaviors.same();
      })
    );
  })
);
```

> ⚠️ 위 코드의 `let nextWorker` 는 _setup 의 closure_ 에 갇힌 상태. 재시작 후에는 초기 setup이 다시 돌아 새 worker를 spawn하게 되는데, 이때 mailbox는 보존되지만 _이전 worker로 보내는 중이던 ref_ 는 유효하지 않을 수 있다. 더 안전한 패턴은 worker를 _자식이름으로 매번 lookup_ 하거나, 상태를 Behavior 매개변수로 빼는 것.
>
> _이 주석 자체가 도그푸딩의 결과 — 사용자에게 closure 패턴을 권장하지 _않는다_._

더 안전한 버전:

```typescript
const parent = Behaviors.setup<ParentMsg>((ctx) =>
  Effect.gen(function* () {
    yield* ctx.spawn(worker("w1"), "w1");
    yield* ctx.spawn(worker("w2"), "w2");
    return distribute(["w1", "w2"], 0);
  })
);

const distribute = (
  children: ReadonlyArray<string>,
  idx: number
): Behavior<ParentMsg> =>
  Behaviors.receive((ctx, msg) =>
    Effect.gen(function* () {
      const childPath = ctx.self.path.child(children[idx]);
      yield* ctx.system.tell(childPath, { _tag: "Process", data: msg.data });
      return distribute(children, (idx + 1) % children.length);
    })
  );
```

### 3.3 ask 패턴 (응답 받기)

```typescript
type CalcMsg = { _tag: "Add"; a: number; b: number; replyTo: ActorRef<number> };

const calculator: Behavior<CalcMsg> =
  Behaviors.receiveMessage((msg) =>
    msg.replyTo.tell(msg.a + msg.b).pipe(Effect.as(Behaviors.same()))
  );

const useIt = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(calculator, "calc");
  const result = yield* sys.root.ask<number>(
    (replyTo) => ({ _tag: "Add", a: 1, b: 2, replyTo }),
    "5 seconds"
  );
  // result === 3
});
```

ask는 내부적으로 _임시 액터를 spawn_ 해서 그 ref를 메시지에 넘긴다. 응답 도착 또는 타임아웃 시 임시 액터 정리.

### 3.4 Watch + Terminated 처리

자식이 죽으면 알아챈다.

```typescript
type ParentMsg =
  | { _tag: "Start" }
  | { _tag: "WorkerGone"; path: ActorPath };

const watchful = Behaviors.setup<ParentMsg>((ctx) =>
  Effect.gen(function* () {
    const w = yield* ctx.spawn(worker("only"), "worker");
    yield* ctx.watchWith(w, { _tag: "WorkerGone", path: w.path });

    return Behaviors.receiveMessage<ParentMsg>((msg) =>
      Effect.gen(function* () {
        if (msg._tag === "WorkerGone") {
          yield* ctx.log.warn(`worker ${msg.path} died`);
          return Behaviors.same();
        }
        return Behaviors.same();
      })
    );
  })
);
```

`watchWith` 는 Terminated 신호 대신 _사용자 메시지_ 로 변환해주는 게 핵심. 신호와 메시지를 통일된 방식으로 처리할 수 있어 코드가 단순해진다.

### 3.5 Supervision — restart with backoff

DB 연결을 다루는 액터. IO 실패 시 점진적으로 재시도.

```typescript
class IOError extends Error { _tag = "IOError" as const; }
class FatalError extends Error { _tag = "FatalError" as const; }

const dbActor: Behavior<DbMsg> = Behaviors.setup((ctx) =>
  Effect.gen(function* () {
    const conn = yield* connect();  // Effect<Connection, IOError | FatalError>
    return active(conn);
  })
);

const active = (conn: Connection): Behavior<DbMsg> =>
  Behaviors.receiveMessage((msg) =>
    /* 메시지 처리, 실패 시 IOError 또는 FatalError throw */
    /* ... */
  );

// 감독 부착
const supervised = Behaviors.supervise(dbActor)
  .onFailure(
    (e): e is IOError => e instanceof IOError,
    Strategies.restartWithBackoff({
      minBackoff: "100 millis",
      maxBackoff: "10 seconds",
      randomFactor: 0.2,
    }).withLimit({ maxNrOfRetries: 10, withinTimeRange: "1 minute" })
  )
  .onFailure(
    (e): e is FatalError => e instanceof FatalError,
    Strategies.stop
  );
```

핵심:
- IOError는 _재시도 가치_ 가 있다 → backoff restart.
- FatalError는 _복구 불가_ → stop.
- 부모 코드는 이 내용을 모른다 — 액터의 모든 정책이 _이 한 곳_ 에 모임.

### 3.6 Stash — 초기화 중 메시지 보류

```typescript
type Msg =
  | { _tag: "Init"; data: Config }
  | { _tag: "DoWork"; payload: string };

const initializing = Behaviors.withStash<Msg>(100, (stash) =>
  Behaviors.receiveMessage((msg) => {
    if (msg._tag === "Init") {
      return Effect.succeed(stash.unstashAll(active(msg.data)));
    }
    return Effect.gen(function* () {
      yield* stash.stash(msg);
      return Behaviors.same();
    });
  })
);

const active = (config: Config): Behavior<Msg> =>
  Behaviors.receiveMessage((msg) => {
    /* config 사용 */
  });
```

`Init` 도달 전까지 들어오는 `DoWork` 는 stash. `Init` 후 unstash해서 active behavior가 한꺼번에 처리.

### 3.7 Timer — 주기적 점검

```typescript
type HeartbeatMsg = { _tag: "Tick" } | { _tag: "Stop" };

const heartbeat = Behaviors.withTimers<HeartbeatMsg>((timers) =>
  Behaviors.setup((ctx) =>
    Effect.gen(function* () {
      yield* timers.startTimerWithFixedDelay("tick", { _tag: "Tick" }, "1 second");

      return Behaviors.receiveMessage<HeartbeatMsg>((msg) =>
        Effect.gen(function* () {
          if (msg._tag === "Tick") {
            yield* ctx.log.info("ping");
            return Behaviors.same();
          }
          return Behaviors.stopped();
        })
      );
    })
  )
);
```

타이머는 액터에 묶여있다. 액터가 stop되면 타이머도 자동 정리.

---

## 4. 자주 쓰는 패턴

### 4.1 Request-Reply

`ask` 가 표준. 기억할 점:
- 임시 actor가 spawn되므로 _빈번한 ask는 비용_ 이 있다.
- 타임아웃은 항상 명시.
- 응답이 안 오면 `TimeoutException` 으로 실패.

### 4.2 Scatter-Gather

여러 액터에 동시 요청, 응답 모으기.

```typescript
const aggregator = Behaviors.setup<AggregatorMsg>((ctx) =>
  Effect.gen(function* () {
    const workers = [w1, w2, w3];
    const results = yield* Effect.forEach(
      workers,
      (w) => w.ask<Result>((r) => ({ _tag: "Q", replyTo: r }), "5 seconds"),
      { concurrency: "unbounded" }
    );
    /* combine results */
    return Behaviors.stopped();
  })
);
```

### 4.3 Pipeline

각 단계가 액터. 메시지가 한 단계 처리되고 다음 단계로 forward.

```typescript
const stage1 = (next: ActorRef<Stage2Msg>): Behavior<Stage1Msg> =>
  Behaviors.receiveMessage((msg) =>
    process(msg).pipe(
      Effect.flatMap((processed) => next.tell(processed)),
      Effect.as(Behaviors.same())
    )
  );
```

---

## 5. 안티패턴 — 피해야 할 것

### 5.1 setup 안에서 mutable closure 쓰기

3.2 예시의 _첫 버전_ 처럼 `let x` 를 setup 안에서 쓰면 restart 시 일관성이 깨진다. _Behavior 매개변수_ 로 빼라.

### 5.2 Behavior 안에서 ActorRef를 직접 만들기

```typescript
// 안 됨
const bad = Behaviors.receive((ctx, msg) => {
  const ref = new ActorRef(somePath);  // ❌ 외부에서 만들지 마
  ...
});
```

ActorRef는 _시스템이 발급_ 하는 것. 직접 만들면 registry와 어긋난다.

### 5.3 메시지에 함수 / Promise / Effect 끼워 넣기

메시지는 _데이터_ 여야 한다. 직렬화 가능한 평범한 값. 함수를 넣으면:
- 디버깅이 어렵다 (메시지 dump가 의미 없음)
- 미래에 분산 확장 시 깨진다.

### 5.4 부모 외부에서 자식 spawn

자식은 _부모 ctx_ 안에서만 spawn. 외부에서 만들면 부모-자식 트리가 어긋나 supervision이 동작 안 함.

### 5.5 ask에 타임아웃 없음

타임아웃 안 거는 ask는 메시지 유실 시 무한 대기. 항상 명시.

---

## 6. 미정 / 토론 중

이 섹션은 _시안_ 단계이며 도그푸딩 또는 구현 중 결정이 굳어지면 본문으로 옮기고 여기서 빼낸다.

- `system.root` 의 타입 표현 방식 (위 2.4 참고)
- 메일박스 capacity 기본값 (현재 시안: 1024 + backpressure)
- `ctx.spawnAnonymous` 의 이름 부여 규칙 (`$a`, `$b` … vs UUID)
- `narrow` 의 형 안전성 보장 방법
- 분산 시 ActorPath 표현 — 일단 단일 노드만 다루지만 path 형식은 미래 호환을 고려할지

---

## 7. 이 문서의 갱신 규칙

- 새 시그니처가 추가되면 2번에 추가, 사용 예시는 3번에 추가.
- 도그푸딩에서 _불편_ 발견 → 5번 안티패턴에 추가하거나, 아예 시그니처를 고침.
- 미정(6번)에서 결정 굳어진 항목은 본문으로 이동.
