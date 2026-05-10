# Usage — 지금 동작하는 표면 (M3 까지)

> _M0~M3 까지 실제 동작하는 사용자 표면_ 한 묶음. 도그푸딩 시 폰처럼 참고용.
> 마일스톤 진행에 따라 갱신. _M4+ 의 새 표면_ 은 그 마일스톤 끝에 추가.

## 한 줄 정신

> **ActorRef 는 논리 주소. 메일박스는 그 주소에 묶인다. Behavior 는 그 위에서 갈아끼울 수 있다.**

지금 단계는 _stable ref + mailbox + behavior 갈아끼우기_ 까지 동작. _restart / watch / ask_ 는 아직 없음.

---

## 1. Import

**도그푸딩 단계 — source-direct (ADR-032):**

```bash
# 소비 레포 (consumer workspace) 에서:
pnpm add file:../effect-actor
# 또는 pnpm workspace link (monorepo)
```

소비측 요구: ESM TS loader (tsx, ts-node ESM, vite, framework dev server). 일반 빌드 도구는 _아직_ 없음 — M∞ 직전에 dist 빌드 결정 (ADR-027 / ADR-032).

```typescript
import { Effect } from "effect";
import {
  ActorSystem,
  Behaviors,
  MailboxPolicy,
  type Behavior,
  type ActorRef,
  type ActorContext,
} from "@loveqoo/effect-actor";
```

---

## 2. 가장 단순한 액터 — receive + tell + shutdown

```typescript
const echo = Behaviors.receiveMessage<string>((msg) =>
  Effect.sync(() => {
    console.log("got:", msg);
    return Behaviors.same<string>();
  }),
);

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create(echo, "demo");
  yield* sys.root.tell("hello");
  yield* Effect.sleep("20 millis");   // fiber 처리 시간 (M3 ask 패턴 후 사라짐)
  yield* sys.shutdown;
});

Effect.runPromise(program);
```

핵심:
- `ActorSystem.create<RootMsg>(behavior, name)` — `Effect<ActorSystem<RootMsg>>` 반환
- `sys.root` — `ActorRef<RootMsg>`. 사용자 표면의 진입점
- `sys.shutdown` — `Effect<void>`. PostStop 발사 → fiber 자발 종료 → Scope cleanup

---

## 3. `Behaviors` 빌더 카탈로그

| 빌더 | 의미 |
|---|---|
| `Behaviors.receive<M>((ctx, msg) => Effect<Behavior<M>>)` | 메시지 처리 + ctx 접근 |
| `Behaviors.receiveMessage<M>((msg) => Effect<Behavior<M>>)` | ctx 무관 단순 형태 (내부적으로 Receive 로 풀림) |
| `Behaviors.setup<M>((ctx) => Effect<Behavior<M>>)` | 최초 1회 초기화 (자식 spawn, 자원 잡기) |
| `Behaviors.same<M>()` | 이전 Behavior 유지 (handler 가 반환) |
| `Behaviors.stopped<M>()` | 자발 종료 (handler 가 반환) → PostStop 자동 emit |
| `Behaviors.empty<M>()` | 메시지 무시 (NoOp) |
| `Behaviors.unhandled<M>()` | M3: signal handler 가 Unhandled 반환 + Terminated → DeathPact fail |
| `Behaviors.withMailbox(inner, policy)` | 메일박스 정책 부착 (래퍼) |
| `Behaviors.receive(...).receiveSignal(...)` | 신호 핸들러 fluent 부착 (PostStop, PreRestart, Terminated, ChildFailed) |
| `Behaviors.supervise(b).onFailure(matcher, strategy)` | M4: supervisor 정책 부착. `Strategies.{resume,restart,stop}` + `matchInstance/matchTag/matchAll` |
| `Behaviors.withTimers<M>((timers) => Effect<Behavior<M>>)` | M5 사이클 3 (ADR-039): timer 등록 표면. setup 위 헬퍼. |
| `Behaviors.withStash<M>(capacity, (stash) => Effect<Behavior<M>>)` | M5 사이클 4 (ADR-040): bounded buffer + unstashAll. setup 위 헬퍼. |

핸들러의 fail 채널은 `unknown` — `Effect.fail(any)` / `Effect.die(any)` 모두 supervision 외피의 default stop 으로 흡수 (액터 _자발 종료_ 와 동일 효과, M4 부터 restart 정책). _M3 추가:_ supervision 외피가 cause 를 부모에게 `ChildFailed` 로 알림.

## 3.1 ActorContext 표면 (M3 추가 종합)

| 메서드 | 의미 |
|---|---|
| `ctx.self: ActorRef<Msg>` | 자기 ref |
| `ctx.system: ActorSystemHandle` | system handle (이름 + tell) |
| `ctx.spawn(behavior, name): Effect<ActorRef<ChildMsg>>` | 자식 spawn |
| `ctx.stop(child): Effect<void>` | 자식 graceful stop (자식 cascade + PostStop hook 호출 + Scope cleanup, ADR-031) |
| `ctx.watch(other): Effect<void>` | other stop 시 self.signalQueue 에 `Signal.Terminated` 발사 |
| `ctx.watchWith(other, msg): Effect<void>` | other stop 시 self.mailbox 에 사용자 정의 `msg` 발사 (signal 아님) |
| `ctx.unwatch(other): Effect<void>` | watch 취소 |
| `ctx.watchTerminated(other): Effect<void>` | other stop 까지 Effect 형태 await (ADR-030) — Deferred 직접 등록 |
| `ctx.ask<TargetMsg, Resp>(target, make, timeout): Effect<Resp, AskTimeout>` | ask 패턴 — 임시 actor + race(reply, timeout). typed reply err 는 reply ADT 안에 표현 (ADR-029) |
| `ctx.fork<A, E>(eff): Effect<RuntimeFiber<A, E>>` | M5 사이클 3 (ADR-039): instance scope 안 fork. restart/stop 시 자동 interrupt. |
| `ctx.scheduleOnce<M>(delay, target, msg): Effect<void>` | M5 사이클 3 (ADR-039): delay 후 다른 액터에 tell (fire-and-forget, ctx.fork 안 wrapping) |

---

## 4. State machine — Behavior 매개변수 패턴

Akka Typed 정통. closure mutable 보다 _다음 Behavior 반환_ 이 정석.

```typescript
type Msg = { _tag: "Inc" } | { _tag: "Get"; reply: ActorRef<number> };

const counter = (n: number): Behavior<Msg> =>
  Behaviors.receiveMessage<Msg>((msg) => {
    switch (msg._tag) {
      case "Inc": return Effect.succeed(counter(n + 1));   // 새 Behavior
      case "Get": return msg.reply.tell(n).pipe(Effect.as(Behaviors.same()));
    }
  });

// 시작점은 counter(0)
```

`Same` 반환 → 같은 Behavior 인스턴스 그대로. 새 Behavior 반환 → 다음 메시지부터 새 handler.

---

## 4.5 watch + Terminated / ChildFailed 처리 (M3)

```typescript
const watcher = Behaviors.setup<MyMsg>((ctx) =>
  Effect.gen(function* () {
    const child = yield* ctx.spawn(childBehavior, "child");
    yield* ctx.watch(child);   // Terminated signal 받기
    return Behaviors.receive<MyMsg>((_c, msg) => /* ... */)
      .receiveSignal((_c, sig) =>
        Effect.sync(() => {
          if (sig._tag === "Terminated") console.log("child gone:", sig.path);
          if (sig._tag === "ChildFailed") console.log("child failed:", sig.cause);
          return Behaviors.same<MyMsg>();
        }),
      );
  }),
);
```

- **Terminated**: ctx.watch(other) 등록 + other stop 시 self.signalQueue 에 도착
- **ChildFailed**: 직접 자식이 fail/die 시 supervision 외피가 부모에게 자동 발사 (등록 불필요)
- **DeathPact**: watch 한 target 의 Terminated 를 _onSignal 미부착_ 또는 _Behaviors.unhandled() 반환_ 시 watcher 도 fail (Akka 정통)

## 4.6 watchWith — _자기 메시지 채널_ 로 알림 (M3)

signal 보다 표현력 좋음 — 사용자 ADT 에 케이스 추가해 자연스럽게 분기.

```typescript
type ParentMsg =
  | { _tag: "Start" }
  | { _tag: "WorkerGone"; reason: string };

const parent = Behaviors.setup<ParentMsg>((ctx) =>
  Effect.gen(function* () {
    const w = yield* ctx.spawn(worker, "alpha");
    yield* ctx.watchWith(w, { _tag: "WorkerGone", reason: "alpha stopped" });
    return Behaviors.receiveMessage<ParentMsg>((m) => {
      if (m._tag === "WorkerGone") console.log(m.reason);
      return Effect.succeed(Behaviors.same());
    });
  }),
);
```

## 4.7 ask 패턴 (M3)

```typescript
type CalcMsg = { _tag: "Add"; a: number; b: number; replyTo: ActorRef<number> };

const root = Behaviors.setup<RootMsg>((ctx) =>
  Effect.gen(function* () {
    const calc = yield* ctx.spawn(calculator, "calc");
    return Behaviors.receiveMessage<RootMsg>(() =>
      ctx.ask<CalcMsg, number>(
        calc,
        (replyTo) => ({ _tag: "Add", a: 7, b: 5, replyTo }),
        "1 second",
      ).pipe(
        Effect.tap((sum) => Effect.sync(() => console.log(`sum=${sum}`))),
        Effect.catchTag("AskTimeout", (err) =>
          Effect.sync(() => console.log(`timeout: ${err.timeoutMillis}ms`)),
        ),
        Effect.as(Behaviors.same<RootMsg>()),
      ),
    );
  }),
);
```

**typed reply err 패턴 (ADR-029):** Akka 정통은 _untyped_ (AskTimeout 만). 도메인 에러는 _reply ADT_ 안에 표현 + 사용자 측 wrapper 5-10 줄로 typed err 변환.

```typescript
type LookupResp = { _tag: "Found"; ref: BackendRef } | { _tag: "NotFound" };

const lookup = (key: string) =>
  ctx.ask<RegMsg, LookupResp>(reg, (replyTo) => ({ _tag: "Lookup", key, replyTo }), "5 seconds")
    .pipe(Effect.flatMap(r =>
      r._tag === "Found" ? Effect.succeed(r.ref) : Effect.fail(new BackendNotFound({ key }))
    ));
```

## 4.8 외부 의존성 주입 — factory 패턴 (도그푸딩 #2 _표준 확정_)

핸들러의 effect 채널이 `Effect<Behavior<Msg>, unknown, never>` — **R=never 강제**. 즉 핸들러 안에서 `yield* HttpClient.HttpClient` 같은 _컨텍스트 의존_ 못 씀.

해결 (외부 의존성 actor 의 **표준 패턴**): **Behavior 를 만드는 factory 가 컨텍스트 받음** — closure 로 캡처.

```typescript
const makeBackendBehavior = (
  opts: BackendOpts,
): Effect.Effect<Behavior<BackendMsg>, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;   // factory 가 R 채널에서 받음

    // closure 로 http 캡처 — 핸들러 안에서 자유 사용
    return Behaviors.receiveMessage<BackendMsg>((msg) =>
      http.execute(makeReq(msg)).pipe(
        Effect.flatMap((resp) => msg.replyTo.tell(resp)),
        Effect.as(Behaviors.same<BackendMsg>()),
      ),
    );
  });

// 사용처:
const program = Effect.gen(function* () {
  const behavior = yield* makeBackendBehavior(opts);   // R 채널 처리
  const sys = yield* ActorSystem.create(behavior, "demo");
  // ...
}).pipe(Effect.provide(httpLayer));   // R 채널 inject
```

같은 패턴이 `Mailbox.make()` (Scope 필요), `Effect.fork` (parent fiber scope) 등 Scope 의존 effect 에도 적용 — _factory 가 Scope 까지 다루고 closure 로 전달_.

### 4.8.1 자식 spawn 도 pre-build (Registry 패턴)

자식 actor 가 _컨텍스트 의존_ 이면 자식 Behavior 도 _factory 단계_ 에서 빌드 → 부모의 setup 안에서 `ctx.spawn(beh, name)` 만 호출. setup 의 R=never 제약과 깔끔히 맞물림.

```typescript
const makeRegistryBehavior = (
  specs: ReadonlyArray<BackendSpec>,
): Effect.Effect<Behavior<RegistryMsg>, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    // 자식 Behavior 들 _미리_ 빌드 (R 채널 여기서 처리)
    const childBehaviors = yield* Effect.forEach(specs, (spec) =>
      makeBackendBehavior(spec.opts).pipe(
        Effect.map((beh) => [spec.id, beh] as const),
      ),
    );

    return Behaviors.setup<RegistryMsg>((ctx) =>
      Effect.gen(function* () {
        // setup 안에선 spawn 만 (R=never 제약 OK)
        const refs = new Map<string, ActorRef<BackendMsg>>();
        for (const [id, beh] of childBehaviors) {
          const ref = yield* ctx.spawn(beh, id);
          refs.set(id, ref);
        }
        return /* receive ... uses refs */;
      }),
    );
  });
```

- HttpClient 같은 _컨텍스트_ 가 actor tree 전체에 자연 propagation — Registry factory → child factory → 테스트 program 에서 한 번 `provide` 면 끝.
- 도메인 코드 가독성 좋음 (도그푸딩 #2 사이클 3 검증).

## 5. 자식 액터 spawn — `setup` + `ctx.spawn`

```typescript
const child = Behaviors.receiveMessage<string>((m) =>
  Effect.sync(() => { console.log("child:", m); return Behaviors.same(); }),
);

const parent = Behaviors.setup<string>((ctx) =>
  Effect.gen(function* () {
    const childRef = yield* ctx.spawn(child, "kid");  // ActorRef<string> 반환
    return Behaviors.receiveMessage<string>((m) =>
      childRef.tell(`forwarded: ${m}`).pipe(Effect.as(Behaviors.same())),
    );
  }),
);
```

자식의 path 는 `parent.path + "kid"`. 자식의 fiber 는 _부모 instance Scope_ 안에서 fork — 부모 종료 시 자동 interrupt.

✅ **M3 갱신**: `ctx.stop(child)` 와 `sys.shutdown` 모두 _graceful cascade_ — 자식부터 stop, 자식 PostStop hook 호출까지 await, 그 후 자기 stop. 자식 cleanup 보장.

---

## 6. Lifecycle — setup + PostStop

```typescript
const root = Behaviors.setup<Msg>(() =>
  Effect.sync(() => {
    console.log("[resource] opened");
    return Behaviors.receive<Msg>((_ctx, msg) =>
      Effect.sync(() => {
        // 메시지 처리
        return Behaviors.same();
      }),
    ).receiveSignal((_ctx, sig) =>
      Effect.sync(() => {
        if (sig._tag === "PostStop") console.log("[resource] closed");
        return Behaviors.same();
      }),
    );
  }),
);
```

PostStop emit 시점:
- **자발 Stopped** (handler 가 `Behaviors.stopped()` 반환) → 마지막 active Receive 의 onSignal 자동 호출
- **외부 shutdown** (`sys.shutdown`) → PostStop 을 signalQueue 에 offer → fiber 가 처리 후 자발 종료

_한 번만_ 보장 (postStopHandled 플래그).

⚠️ ADR-021 §3.8 우선순위: PostStop hook _먼저_, 그 후 instance Scope 자동 cleanup (fork fiber, scoped resource). 외부 알림 같은 fiber 영역 _밖_ 의 cleanup 만 PostStop 에. fiber 안 자원은 `Effect.acquireRelease` 같은 Scope 자원으로 잡으면 자동 정리.

---

## 7. Mailbox 정책

```typescript
const slowConsumer = Behaviors.withMailbox(
  Behaviors.receiveMessage<Job>((job) => /* 느린 처리 */),
  MailboxPolicy.bounded(100, "drop"),  // 100개 초과 메시지 drop
);
```

| 정책 | 의미 |
|---|---|
| `MailboxPolicy.unbounded` (기본) | 무한 — AI/agent burst 안전 |
| `MailboxPolicy.bounded(n, "backpressure")` | offer 가 blocking |
| `MailboxPolicy.bounded(n, "drop")` | 초과분 _자동 drop_ |
| `MailboxPolicy.bounded(n, "fail")` | 초과 시 fail (현재 단순 bounded 와 동일, ADR-019 의 fail 변환은 M3 후) |

---

## 8. Tell 의미 — best-effort delivery (ADR-019)

`ref.tell(msg)` 의 송신 결과:

| 케이스 | 결과 |
|---|---|
| 정상 | mailbox enqueue, fiber 가 처리 |
| stale ref (uid 불일치) | _silent dead letter_ — 에러 안 남 |
| status === "stopped" | _silent dead letter_ |
| in-flight stop (검증과 enqueue 사이 stop) | 옛 cell 에 enqueue, 아무도 안 읽음 (의미적 소실) |

⚠️ Akka 와 동일 — _배달 보장 안 함_. 보장 원하면 명시 ack 패턴 (현재는 자식 reply 만 있고 ask timeout 없음 → M3).

---

## 9. Tagged Errors

```typescript
import { ActorNotFound, AskTimeout, DeathPactException,
  IncarnationMismatch, MailboxFull, RestartLimitExceeded, StashOverflow } from "...";

// ActorNotFound / IncarnationMismatch / MailboxFull — 정의 들어 있지만 silent dead letter 로 처리 (Akka 원래 모양).
// AskTimeout — ctx.ask 의 fail 채널 (M3, 사용자가 catchTag 로 처리).
// DeathPactException — watch + Terminated unhandled 시 watcher 의 fail 채널 (M3, supervision 외피가 잡아서 부모에게 ChildFailed 발사).
// RestartLimitExceeded — M5 사이클 1: restart.withLimit 한도 초과 시 stop 강등의 cause (사용자 onFailure 에 다시 안 잡힘 — supervise 외피 안쪽에서 발생).
// StashOverflow — M5 사이클 4: withStash buffer 용량 초과 시 stash() fail 채널. catchTag 또는 Strategies.matchTag("StashOverflow") 로 분기.
```

---

## 10. 지금 _안 되는_ 것

| 기능 | 어느 마일스톤 |
|---|---|
| `ref.ask` (외부 Effect 에서 호출) | _미정_ (현재는 `ctx.ask` 만 — actor handler 안에서) |
| `Strategies.restartWithBackoff(...).withResetBackoffAfter(...)` | _미구현_ (Akka 별도. 현재 `withLimit` 윈도우와 묶여 있음 — 효과 일부) |
| `Strategies.matchSchema(...)` (Effect Schema 기반) | _시안_ (도그푸딩 입력 후) |
| `unstash(behavior, n)` 부분 unstash | _미구현_ (Akka 별도, 사이클 4 단순) |
| `startTimerAtFixedRate` | _미구현_ (Akka 별도, fixedDelay 만 — 도그푸딩 입력 후) |

M4/M5 _구현_:
- `Behaviors.supervise(...).onFailure(matcher, strategy)` — ✅ M4
- `Strategies.restart.withLimit({ maxNrOfRetries, withinTimeRange })` — ✅ M5 사이클 1 (ADR-037)
- `Strategies.restartWithBackoff({ minBackoff, maxBackoff, randomFactor })` — ✅ M5 사이클 2 (ADR-038)
- `Behaviors.withTimers` + `ctx.fork` + `ctx.scheduleOnce` — ✅ M5 사이클 3 (ADR-039)
- `Behaviors.withStash` + `StashOverflow` — ✅ M5 사이클 4 (ADR-040)

도그푸딩에서 `ref.ask` 가 필요하면 _bootstrap actor_ 패턴 우회 — root 가 외부 Deferred 받아 그 안에서 ctx.ask 호출.

---

## 11. 도그푸딩 시 부딪힐 가능성 (LEARNINGS 에서 지목)

1. ~~**자식 PostStop 미호출**~~ — ✅ M3 사이클 1 에서 해결 (`ctx.stop` graceful cascade, ADR-031).
2. **race 비결정성** — signal 과 message 동시 도착 시 race winner 비결정. _이미 도착한_ signal 만 우선 보장. 영향 있으면 LEARNINGS 후속.
3. **sleep 기반 동기화** — ✅ M3 ask 패턴으로 대부분 해결. `ctx.ask` 로 확정 동기화. 단 _shutdown 시점_ 같은 곳은 여전히 sleep 우회.
4. **Setup 중첩** — `init` 결과가 또 Setup 이면 _재평가 안 함_ (한 겹만 풀음). 의도치 않은 중첩 발견되면 LEARNINGS.
5. **`sys.tell(ref, msg)` 노출** — 사용자 표면에 system handle 의 tell 이 보임 (`ref.tell(msg)` 와 동치). 어색하면 internal/external 분리.
6. **`Effect.race` 의 함정** — 첫 _success_ 만 winner. fail 은 무시. timeout fail 패턴엔 `Effect.timeoutFail` 또는 `Effect.raceFirst` 사용. (M3 사이클 4 ask 구현에서 발견)
7. **자발 Stopped 후 Registry leak** — `Behaviors.stopped()` 반환만으로는 Registry / parent.children 에서 entry 안 사라짐. 확실한 cleanup 위해 _부모가 `ctx.stop(child)` 명시 호출_ 권장 (Akka 의 `context.stop` 정신과 정합).
8. **DeathPact 의 의도 미스** — watch 한 actor 에 onSignal 미부착이면 _자동 자살_. 부모 monitor 만 원하고 죽고 싶진 않으면 _onSignal 명시 + 무시 처리_ (Behaviors.same 반환).

---

## 12. 실행 가능한 examples

- [`examples/01-counter.ts`](../examples/01-counter.ts) — setup + ctx.spawn + state machine + 자식 reply
- [`examples/02-lifecycle.ts`](../examples/02-lifecycle.ts) — setup + PostStop 마지막 상태 보고
- [`examples/03-watch.ts`](../examples/03-watch.ts) — ctx.watchWith + ctx.stop graceful (M3)
- [`examples/04-ask.ts`](../examples/04-ask.ts) — ctx.ask + AskTimeout 캐치 (M3)

```bash
pnpm tsx examples/01-counter.ts
pnpm tsx examples/02-lifecycle.ts
pnpm tsx examples/03-watch.ts
pnpm tsx examples/04-ask.ts
```

---

## 갱신 규칙

- M4 끝나면 §3 / §10 / §11 갱신 (supervise / restart 추가)
- 도그푸딩에서 _새로 부딪힌 한계_ 는 §11 에 한 줄
- 새 우회 패턴 발견되면 §10 의 _우회_ 단락에
