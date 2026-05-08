# Architecture — 내부 런타임 모델

> 사용자 API(=`docs/API.md`) 가 동작하기 위해 _내부에 무엇이 있어야 하는가_ 를 정리한다.
> Akka 모델([AKKA_REFERENCE](./AKKA_REFERENCE.md)) 을 EffectTS로 옮길 때의 _구조적 결정_ 들이 여기 모인다.

---

## 1. 다섯 겹

```
┌─────────────────────────────────────────────────────────┐
│  L5  사용자 API                                           │
│      Behaviors.receive / spawn / supervise / watch / ask │
├─────────────────────────────────────────────────────────┤
│  L4  Behavior 해석기 (Interpreter)                       │
│      Behavior ADT를 받아 한 메시지씩 해석 → 다음 Behavior   │
├─────────────────────────────────────────────────────────┤
│  L3  Supervision 래퍼                                     │
│      해석 루프를 Effect.catchAll로 감쌈                    │
├─────────────────────────────────────────────────────────┤
│  L2  Mailbox 계층                                         │
│      Queue<Msg> + Queue<Signal>. Path 키로 registry에 보관 │
├─────────────────────────────────────────────────────────┤
│  L1  Registry + Fiber                                     │
│      ActorPath → ActorEntry. 각 entry당 한 Fiber 실행      │
└─────────────────────────────────────────────────────────┘
```

규칙: 위 계층은 _아래_ 만 호출한다. 옆이나 위로 호출하면 결합이 깨진다.

---

## 2. 핵심 자료 구조

### 2.1 `ActorPath`

논리 주소. 부모-자식 트리의 키.

```typescript
type ActorPath = {
  readonly system: string;          // 시스템 이름
  readonly elements: ReadonlyArray<string>;  // ["user", "parent", "child"]
};
// 직렬화 형태: "akka://my-system/user/parent/child"
```

- 루트는 `/user`. 사용자 액터는 모두 그 아래.
- 시스템 액터는 `/system` 아래(로깅, 데드레터 등).
- Anonymous spawn은 자동 부여된 이름(`$a`, `$b` …) 사용.

### 2.2 `ActorRef[Msg]`

가벼운 핸들. 메시지 보내는 능력만 있음.

```typescript
class ActorRef<Msg> {
  readonly path: ActorPath;
  readonly system: ActorSystem;

  // Fire-and-forget — registry를 통해 mailbox.offer
  tell(msg: Msg): Effect<void>;

  // 좁은 타입으로 강등
  narrow<U extends Msg>(): ActorRef<U>;
}
```

핵심: ActorRef는 _path 보유자_ 일 뿐. 실제 메일박스/Fiber에 대한 직접 참조는 갖지 _않는다_. 그래야 재시작에도 안정적.

### 2.3 `ActorEntry` (Registry 엔트리)

```typescript
type ActorEntry<Msg> = {
  readonly path: ActorPath;
  readonly mailbox: Queue<Msg>;        // 사용자 메시지
  readonly signalQueue: Queue<Signal>; // 시스템 신호
  readonly children: Ref<Set<ActorPath>>;
  readonly watchers: Ref<Set<ActorPath>>;  // 나를 watch하는 자들
  readonly fiber: Ref<Option<Fiber<unknown, never>>>; // 현재 실행 중인 Fiber
  readonly status: Ref<ActorStatus>;   // running / restarting / stopped
};

type ActorStatus = "running" | "restarting" | "stopped";
```

**중요한 invariant:**
- `mailbox` 는 ActorEntry _전체 수명_ 동안 같은 인스턴스다. restart 해도 새로 만들지 _않는다_.
- `fiber` 는 restart 시 교체된다.
- entry 자체가 사라지는 건 _stop_ 일 때뿐.

### 2.4 `Registry`

시스템 단위로 하나. path → entry.

```typescript
class Registry {
  private map: Map<string, ActorEntry<unknown>>;  // path 직렬화 키

  register<Msg>(entry: ActorEntry<Msg>): Effect<void>;
  resolve<Msg>(path: ActorPath): Effect<Option<ActorEntry<Msg>>>;
  unregister(path: ActorPath): Effect<void>;

  // Watch 이벤트 디스패치
  notifyTerminated(path: ActorPath, reason: TerminationReason): Effect<void>;
}
```

내부 구현은 `Ref<HashMap>` 또는 STM 기반. 동시성에 안전해야 함 — 동시에 여러 spawn/stop이 일어남.

### 2.5 `Behavior<Msg>` ADT

함수형 데이터 구조. 해석기(L4) 가 한 케이스씩 처리.

```typescript
type Behavior<Msg> =
  | { _tag: "Receive"; handle: (ctx: ActorContext<Msg>, msg: Msg) => Effect<Behavior<Msg>> }
  | { _tag: "ReceiveSignal"; handleMsg: ...; handleSignal: ... }
  | { _tag: "Setup"; init: (ctx: ActorContext<Msg>) => Effect<Behavior<Msg>> }
  | { _tag: "Same" }
  | { _tag: "Stopped" }
  | { _tag: "Empty" }
  | { _tag: "Unhandled" }
  | { _tag: "Supervise"; inner: Behavior<Msg>; strategy: SupervisorStrategy };
```

해석기는 _현재 Behavior_ 를 들고, 메시지를 받아서 _다음 Behavior_ 를 계산. `Same` 이면 그대로, `Stopped` 면 종료.

---

## 3. 데이터 흐름

### 3.1 Spawn

부모 액터가 `ctx.spawn(childBehavior, "child")` 를 호출하면:

```
1. parent.path + "child" → childPath 생성
2. Mailbox(Queue<Msg>) + SignalQueue(Queue<Signal>) 생성
3. ActorEntry 생성 (status=running, fiber=Empty)
4. Registry.register(entry)
5. Parent의 children에 추가
6. Behavior 해석 루프를 Effect.fork → Fiber
7. fiber를 entry.fiber에 저장
8. ActorRef 반환 (childPath만 들고)
```

**Scope 처리:** spawn은 부모의 scope에 묶일 수 있고, 아닐 수도 있다. 일반적으론 _부모-자식_ 관계가 stop을 cascade하므로 명시적 scope는 불필요.

### 3.2 Tell (메시지 보내기)

`ref.tell(msg)`:

```
1. registry.resolve(ref.path) → Option<ActorEntry>
2. None이면 dead letter 처리
3. Some이면 entry.mailbox.offer(msg)
```

ref가 들고 있는 건 path뿐이라, 매번 registry를 거친다. 이 _간접 참조_ 가 stable ref의 비용이자 본질이다.

### 3.3 Receive (해석 루프)

각 액터가 자기 Fiber 안에서 도는 루프:

```
loop(behavior, ctx):
  msg or signal = take(mailbox, signalQueue)  // signal이 있으면 우선
  next = interpret(behavior, ctx, msg)
  if next === Same: loop(behavior, ctx)
  if next === Stopped: cleanup; return
  else: loop(next, ctx)
```

- **Signal 우선순위:** `PostStop`, `Terminated` 같은 시그널은 사용자 메시지보다 _먼저_ 처리. 두 큐를 둘 다 들여다보되, signalQueue 쪽을 우선 폴링.
- **`take` 의 의미:** EffectTS의 `Queue.take` 는 기본 blocking. Fiber가 자연스럽게 대기.

### 3.4 Watch + Terminated

`ctx.watch(otherRef)`:

```
1. registry.resolve(otherRef.path) → otherEntry
2. otherEntry.watchers에 self.path 추가
3. (만약 이미 죽었다면 즉시 self에 Terminated 전송)
```

`other`가 죽을 때:

```
1. registry.notifyTerminated(other.path, reason)
2. 각 watcher에 대해:
     resolve(watcher) → entry
     entry.signalQueue.offer(Terminated(other.path, reason))
```

DeathPact: watcher가 Terminated를 처리하지 _않으면_ 자신도 실패한다 — 해석기 차원에서 unhandled signal 검출.

### 3.5 Restart

Supervision strategy가 restart로 결정된 경우:

```
1. status = "restarting"
2. PreRestart 신호 전송 → 현재 Behavior가 처리 (선택적)
3. 현재 Fiber interrupt (mailbox는 그대로)
4. 자식 액터 모두 stop (cascade)  ← Akka Typed 기본 동작
5. 새 Behavior 인스턴스 생성 (setup 다시 실행)
6. 새 Fiber로 해석 루프 재시작
7. status = "running"
```

이 동안 _외부에서 보낸 메시지는 mailbox에 쌓여있다_. 새 Fiber가 곧장 그것들을 처리.

### 3.6 Stop

```
1. status = "stopped"
2. 자식 모두 stop (재귀)
3. PostStop 신호 처리
4. mailbox / signalQueue 종료 (이후 tell은 dead letter)
5. watchers에 Terminated 전송
6. registry.unregister(path)
7. fiber 종료
```

---

## 4. 결정해야 할 것 — 미정 항목

### 4.1 Signal과 Message의 큐 분리?

두 후보:

- **A. 두 큐 분리 (현재 시안)** — 명확하지만 take 로직이 두 큐를 polling.
- **B. 한 큐에 union (priority 표시)** — 단순하지만 priority 처리 비용.

후보 A로 시작. 실측에서 polling 비용이 문제되면 B로 이행.

### 4.2 Mailbox 정책

- 무제한(unbounded)인가, 제한(bounded)인가?
- 첫 시안: **bounded with backpressure (capacity 1024)**. tell이 큐가 차면 _suspend_ 한다 (Akka의 dispatcher와는 다른 동작이지만 EffectTS 친화적).
- 사용자가 unbounded를 명시적으로 고를 수 있게 옵션 제공.

### 4.3 ActorContext 전달 방식

- **A. 함수 인자로 명시 전달** — 단순. 사용자는 매번 ctx 받음.
- **B. EffectTS Service (Layer)** — `Effect.serviceWith(ActorContext)` 같이. 마법적이지만 사용감 좋음.

후보 A 우선. 사용자가 늘 ctx를 받는 시그니처라 명시적이고 추적 쉬움. 후속에 B를 _추가_ 옵션으로 제공 가능.

### 4.4 Strategy DSL의 형태

```typescript
// 후보 1: chained
Behaviors.supervise(b)
  .onFailure(IOError, Strategies.resume)
  .onFailure(StateError, Strategies.restart);

// 후보 2: declarative
Behaviors.supervise(b, {
  IOError: Strategies.resume,
  StateError: Strategies.restart,
  default: Strategies.stop,
});
```

Akka 모양과 일치하는 후보 1로 우선 진행.

---

## 5. 주요 invariant 요약

| Invariant | 왜 |
|---|---|
| Mailbox 인스턴스는 ActorEntry 수명 = path 수명 동안 동일 | Stable ref + restart의 핵심 |
| ActorRef는 path만 들고, 직접 참조는 없다 | restart 후에도 같은 ref가 유효 |
| Registry는 시스템 단위 단일 진실원 | resolve(path)가 항상 권위 있음 |
| Signal은 사용자 메시지보다 우선 처리 | PostStop / Terminated가 늦게 도달하면 안 됨 |
| Stop은 재귀적 (자식 먼저 정리) | 자식이 부모보다 오래 사는 상태 금지 |
| Supervision은 해석기 _밖_ 의 래퍼 | Behavior 자체는 strategy를 모름. 분리됨 |

---

## 6. 의존성 그래프 (모듈)

```
ActorSystem
   ├─ Registry
   ├─ DeadLetter sink
   └─ rootGuardian (ActorRef[Nothing])

ActorEntry (per actor)
   ├─ Mailbox (Queue<Msg>)
   ├─ SignalQueue (Queue<Signal>)
   ├─ Children (Ref<Set>)
   ├─ Watchers (Ref<Set>)
   ├─ Fiber (Ref<Option<Fiber>>)
   └─ Status (Ref<Status>)

Behavior<Msg> (사용자 정의, ADT)
   └─ Interpreter (해석기)

Supervision
   └─ wrap(interpret loop, strategy) → Effect with retry
```

---

## 7. 이 문서의 갱신 규칙

- 미정 항목(4번)이 결정되면 _결정의 결과_ 만 본문에 옮기고, _왜 그 결정을 했는지_ 는 `DECISIONS.md` 에 ADR로 적는다.
- 새 invariant가 발견되면 5번 표에 추가.
- 모듈 그래프(6번)가 바뀌면 갱신. 단 너무 잘게 쪼개지 말 것 — 큰 그림용.
