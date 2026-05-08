# Akka Typed 참고 정리

> 이 문서는 `effect-actor` 의 모든 다른 문서(ARCHITECTURE, API, DECISIONS)의 뿌리다.
> Akka Typed의 핵심 개념을 정리하고, EffectTS 도구로 어떻게 옮길지 _후보_ 를 적어둔다.
> 결정이 굳은 항목은 굵게 표시하고, 나머지는 아직 토론 중인 후보로 본다.

## 1. 왜 Typed인가 (Classic 아님)

Akka는 두 갈래가 있다.

- **Classic** — `Actor` trait을 상속받아 `receive: PartialFunction[Any, Unit]` 을 정의. 부모가 자식의 `SupervisorStrategy` 를 결정. 메시지 타입은 `Any`. 1.0 시절부터의 모델.
- **Typed** — `Behavior[T]` 라는 _불변 값_ 을 정의. 메시지에 타입 파라미터 T가 붙음. supervision strategy는 _behavior 작성자_ 가 `Behaviors.supervise(...).onFailure(...)` 로 부착.

이 프로젝트는 **Typed** 를 따른다. 이유:

1. TypeScript는 타입 시스템이 핵심 자산이라 메시지 타입을 살리는 게 자연스럽다.
2. Behavior가 _불변 값_ 이라 EffectTS의 함수형 패러다임과 잘 맞는다.
3. supervision을 _behavior 작성자가 부착_ 하는 모델은, 라이브러리 사용자가 한 곳에서 액터의 모든 정책을 볼 수 있게 해준다 — 부모 코드를 뒤지지 않아도 됨.

---

## 2. 핵심 정신 모델

> **"액터 = 메일박스 + 행동(Behavior) + 자식들"**

- 액터는 **하나의 ActorRef** 로 외부에 노출된다.
- ActorRef는 **논리 주소(ActorPath)** 다. 액터가 재시작되어도 같은 ref를 그대로 쓸 수 있다.
- 메일박스는 **ActorRef에 묶여있다**. Behavior 인스턴스가 아니다. 따라서 재시작 시 메일박스가 보존된다.
- Behavior는 _메시지를 받으면 다음 Behavior를 반환_ 하는 함수형 값이다. 상태를 바꾸려면 _다음 Behavior를 반환_ 하면 된다.
- 자식은 부모 안에서 `ctx.spawn(...)` 으로 만들어진다. 부모-자식 관계는 framework이 인코딩한다 (사용자 코드에 자식 목록 변수를 둘 필요 없음).

---

## 3. Behavior API

Akka Typed의 사용자 API 표면. 우리가 본받을 _모양_ 이다.

### 3.1 기본 생성자들

```scala
// 메시지 + 컨텍스트 받기
Behaviors.receive[T] { (ctx, msg) =>
  // ... handle ...
  Behaviors.same
}

// 컨텍스트 안 쓸 때 — 메시지만
Behaviors.receiveMessage[T] { msg =>
  Behaviors.same
}

// 시작 시 일회성 setup (마치 생성자)
Behaviors.setup[T] { ctx =>
  // 초기 자식 spawn, 초기 timer 등록 등
  active(initialState)
}

// 신호(Signal) 처리
Behaviors.receiveSignal[T] {
  case (ctx, PostStop) => ...
  case (ctx, PreRestart) => ...
}

// 메시지 + 신호 동시
Behaviors.receive[T] { ... }.receiveSignal { ... }
```

### 3.2 다음 Behavior 표현

```scala
Behaviors.same       // 현재 Behavior 유지
Behaviors.stopped    // 자기 자신을 종료시킴
Behaviors.empty      // 모든 메시지 무시
Behaviors.unhandled  // 다음 Behavior에 넘김 (chain)
```

### 3.3 부가 도구

```scala
Behaviors.withTimers[T] { timers => ... }   // 스케줄링
Behaviors.withStash[T](capacity) { stash => ... }  // 메시지 잠시 보류

Behaviors.supervise(b).onFailure[E](SupervisorStrategy.restart)  // 감독
```

---

## 4. ActorContext

`Behaviors.receive` 의 첫 인자로 들어오는 컨텍스트. 액터가 외부 세계와 상호작용하는 통로.

```scala
ctx.self                       // 자기 자신의 ActorRef
ctx.system                     // ActorSystem 전체

ctx.spawn(behavior, name)      // 자식 생성. ActorRef 반환
ctx.spawnAnonymous(behavior)   // 이름 자동 부여

ctx.watch(other)               // other가 죽으면 Terminated(ref) 신호 받음
ctx.watchWith(other, msg)      // Terminated 대신 사용자 메시지로 변환
ctx.unwatch(other)

ctx.stop(child)                // 자식 종료

ctx.log                        // 로거
ctx.scheduleOnce(delay, target, msg)
```

---

## 5. ActorRef[T]

**액터의 논리 주소.** 가장 중요한 개념 중 하나.

```scala
val ref: ActorRef[Greet] = ctx.spawn(behavior, "greeter")

ref ! Greet("anthony")         // tell — fire and forget
```

핵심 속성:

- **재시작에도 안정적.** 액터가 죽고 새로 만들어져도 외부에서는 같은 ref로 계속 보낸다.
- **타입 파라미터 T가 받을 수 있는 메시지.** 컴파일 타임에 잘못된 메시지를 막는다.
- **ActorPath를 가진다.** `/user/parent/child` 같은 경로. 메일박스 키.
- **`narrow[U <: T]`** — 더 좁은 타입으로 강등 가능. 외부에 일부만 노출할 때.

### Ask Pattern

`!` 는 fire-and-forget. 응답이 필요하면 ask:

```scala
import akka.actor.typed.scaladsl.AskPattern._

val future: Future[Reply] = ref.ask[Reply](replyTo => Question("...", replyTo))
```

ask는 응답용 임시 actor를 만들어서 그 ref를 메시지에 끼워주고, 응답이 오면 Future로 변환한다. 중요한 건 _요청자가 임시 actor의 ref를 메시지에 직접 박는다_ 는 점 — 이게 typed에서 응답 경로를 표현하는 표준 방식이다.

---

## 6. Signal — Behavior 외 채널

메시지(T)와 별개로 받는 _시스템 이벤트_. Signal은 framework이 보내준다.

| Signal | 시점 | 비고 |
|---|---|---|
| `PreStart` | 시작 직전 | (Typed에선 setup으로 대체되는 경향) |
| `PreRestart` | 재시작 직전 | 정리 작업 |
| `PostStop` | 종료 직후 | 자원 해제 |
| `Terminated(ref)` | watch한 액터가 죽었을 때 | 누구든 watch 가능 |
| `ChildFailed(ref, cause)` extends Terminated | 자식이 _실패로_ 죽었을 때 | 정상 종료와 구분됨 |

Signal은 받는 쪽에서 처리 안 하면:
- `Terminated` 는 처리 안 하면 액터가 _죽는다_ (DeathPactException). 이건 의도된 동작 — watch 했는데 무시하면 위험하니까.
- 다른 Signal은 무시되어도 OK.

```scala
Behaviors.receive[T] { (ctx, msg) =>
  ...
}.receiveSignal {
  case (ctx, PostStop) =>
    ctx.log.info("bye")
    Behaviors.same
  case (ctx, Terminated(ref)) =>
    ctx.log.info(s"$ref is gone")
    Behaviors.same
}
```

---

## 7. Supervision

실패 처리. **Behavior 작성자** 가 부착한다.

### 7.1 Strategy 종류

| Strategy | 동작 | 상태 | 메일박스 |
|---|---|---|---|
| `resume` | 그대로 진행, 실패 메시지만 무시 | 유지 | 유지 |
| `restart` | 액터 재생성 (PreRestart 신호) | 버림 | 유지 |
| `stop` | 영구 종료 | 버림 | 버림 |
| `restartWithBackoff(min, max, randomFactor)` | 점차 늘어나는 간격으로 재시작 | 버림 | 유지 |

`resume` 과 `restart` 모두 메일박스가 보존된다는 점이 중요하다 — 이게 **stable ActorRef** 를 받쳐주는 핵심 동작이다.

### 7.2 부착 방법

```scala
val supervised: Behavior[T] =
  Behaviors.supervise(myBehavior)
    .onFailure[IllegalStateException](SupervisorStrategy.restart)
    .onFailure[IOException](SupervisorStrategy.resume)
    .onFailure[Throwable](SupervisorStrategy.stop)
```

- 예외 타입별로 다른 strategy 가능. 가장 안쪽이 가장 구체적이어야 함 (체이닝 순서 주의).
- 부모가 아닌 _이 액터를 만든 사람_ 이 부착하므로, 액터의 모든 정책이 한 곳에 모인다.

### 7.3 한도

```scala
SupervisorStrategy.restart.withLimit(maxNrOfRetries = 5, withinTimeRange = 1.minute)
```

지정 시간 내 재시작 횟수가 한도를 넘으면 stop으로 강등.

### 7.4 Akka Typed에는 없는 것

Akka Classic의 **`AllForOne`** strategy는 Typed에서 _제거됨_ (사라진 게 아니라, 패턴이 바뀜). 대신:

- 부모 액터가 자식들을 watch하고, 한 자식이 죽으면 다른 자식들을 명시적으로 stop하고 다시 spawn하는 방식.
- 이게 더 _명시적_ 이라는 게 typed의 철학.

우리도 이 철학을 따른다. AllForOne을 라이브러리 차원에서 제공하지 _않는다_. 대신 watch + 명시적 재spawn 패턴을 권장.

---

## 8. Stash

액터가 _아직 처리할 준비가 안 된_ 메시지를 잠시 보류.

```scala
Behaviors.withStash[T](capacity = 100) { stash =>
  Behaviors.receiveMessage {
    case Init =>
      // 준비 완료
      stash.unstashAll(active)
    case other =>
      stash.stash(other)   // 일단 보류
      Behaviors.same
  }
}
```

- 초기화 중 / DB 연결 중 / 마이그레이션 중 등에 유용.
- 용량 초과 시 `StashOverflowException` 발생 (supervision 대상).

---

## 9. Mailbox 모델

이 프로젝트의 _가장 중요한_ 설계 기준.

### 9.1 Akka의 모델

- 메일박스는 **ActorRef(ActorPath)에 묶여있다.**
- Behavior 인스턴스가 새로 만들어져도(restart) 메일박스는 그대로다.
- 따라서 restart 도중 들어온 메시지는 _큐에 쌓였다가_ 새 Behavior에 도달한다.
- 이 모델 없이는 "stable ActorRef + restart" 가 무의미하다 — ref는 같은데 메시지가 사라지면 외부 입장에서 파편화된다.

### 9.2 Polyphony와의 격차

[poly-phony 격차표](#10-polyphony와의-비교) 참고. 핵심: Polyphony는 메일박스가 _액터 인스턴스에 종속_ 되어 있어 restart 시 메시지가 사라진다.

이 프로젝트에서는 **메일박스를 ActorPath 키로 registry에 보관** — 인스턴스(Fiber)와 분리한다.

---

## 10. Polyphony와의 비교

(원본은 사용자가 정리한 격차표.)

| Akka 전제 | Polyphony 현재 |
|---|---|
| ActorRef = 논리 주소 (재시작에도 동일) | ref가 곧 closure-bound value (재시작 시 새 ref) |
| Mailbox는 actor instance와 분리 (restart 시 보존) | Mailbox가 액터 인스턴스에 종속 |
| 부모-자식 트리가 framework 차원에 인코딩됨 | Scope 계층만 존재, parent-child 명시 안 됨 |
| Terminated 시그널 = 메시지로 도착 | terminated: Effect<void> (Exit 정보 없음) |
| Strategy = exception 타입 매칭 | MsgError 채널만 typed, defect는 Effect.die |

이 프로젝트는 _다섯 줄 모두_ Akka 쪽 모델을 따른다.

---

## 11. EffectTS 매핑 후보

Akka 개념 → EffectTS 도구. **굵게** 표시한 건 결정된 것, 나머지는 아직 후보.

| Akka 개념 | EffectTS 후보 | 비고 |
|---|---|---|
| `ActorRef[T]` | **가벼운 핸들 (path + system)** | 논리 주소. registry로 dereference |
| `ActorPath` | **`string` 또는 구조체 (`/user/a/b` 형식)** | 부모-자식 트리의 키 |
| Mailbox | **`Queue<T>`** (Effect의 unbounded queue) | path 키로 registry에 보관 |
| Behavior | **함수형 데이터 구조** (Effect 자체가 아님) | (ctx, msg) → Behavior 또는 종결자 |
| ActorContext | Service (Layer 또는 명시적 인자) | spawn / watch / self / log 제공 |
| ActorSystem | **Layer** | 시스템 전역 자원 |
| Spawn | **Effect** (registry 등록 + Mailbox 생성 + Fiber 시작) | scope에 묶여 정리됨 |
| Fiber (액터 실행) | **Effect.fork → Fiber** | dispatcher 자리 |
| Signal | 별도 우선순위 큐 또는 메시지 union | 미정. signalQueue 별도 / inbound priority 둘 다 후보 |
| Supervision | `Effect.catchAll` / `Effect.catchTags` 래핑 | strategy를 함수로 표현 |
| restartWithBackoff | `Effect.retry(Schedule.exponential)` | EffectTS의 Schedule이 그대로 맞아 떨어짐 |
| Watch | registry 이벤트 + Terminated 메시지 자동 주입 | DeathPact 정책 포함 |
| Stash | `Queue` 추가 + unstash 동작 | 별도 데이터 구조 |
| Restart 후 같은 ref | **메일박스를 path 키로 보관 → 새 Fiber가 같은 큐 공유** | 격차표의 핵심 해결 |

### 11.1 Behavior 시그니처 후보

```typescript
// 후보 1: 순수 함수형
type Behavior<Msg> =
  | { _tag: "Receive"; handle: (ctx: ActorContext<Msg>, msg: Msg) => Effect<Behavior<Msg>> }
  | { _tag: "Same" }
  | { _tag: "Stopped" }
  | { _tag: "Setup"; init: (ctx: ActorContext<Msg>) => Effect<Behavior<Msg>> }
  | { _tag: "Supervise"; inner: Behavior<Msg>; strategy: Strategy };

// 후보 2: 클래스 기반 (DSL 친화적)
declare const Behaviors: {
  receive<T>(f: (ctx: ActorContext<T>, msg: T) => Effect<Behavior<T>>): Behavior<T>;
  receiveMessage<T>(f: (msg: T) => Effect<Behavior<T>>): Behavior<T>;
  setup<T>(f: (ctx: ActorContext<T>) => Effect<Behavior<T>>): Behavior<T>;
  same: Behavior<never>;
  stopped: Behavior<never>;
  supervise<T>(b: Behavior<T>): { onFailure<E>(strategy: Strategy<E>): Behavior<T> };
};
```

**현재 후보:** Akka의 모양과 가장 가까운 후보 2. 단 내부 표현은 후보 1에 가까운 ADT — DSL이 ADT를 빌드하는 구조.

---

## 12. 비목표 (이 프로젝트에서 다루지 _않는_ 것)

Akka는 거대하다. 그 중 다음은 0.x 범위 _밖_ 이다:

- **Cluster** — 여러 노드, gossip protocol, sharding.
- **Persistence (Event Sourcing)** — 액터 상태를 이벤트 로그로 저장.
- **Receptionist / Service Discovery** — 글로벌 actor 검색.
- **Distributed Pub-Sub.**
- **Streams (akka-streams)** — 별도 라이브러리. EffectTS는 이미 Stream을 가짐.
- **DSL이 아닌 Inheritance 기반 사용** — Classic 스타일.

**이유:** 위 항목 대부분은 _분산_ 영역이고, 이 프로젝트의 첫 목표는 _단일 프로세스 안의 견고한 액터_ 다. 분산은 충분히 견고해진 뒤 _다른 레포_ 또는 _후속 패키지_ 로 분리하는 게 옳다.

---

## 13. 참고할 만한 Akka 문서 단편

(문서 링크 또는 읽어볼 만한 섹션 모음. 작업 중 추가될 것.)

- _Akka Typed: Introduction_ — Behavior 모델의 첫 소개.
- _Akka Typed: Fault Tolerance_ — supervision의 모든 변형.
- _Akka Typed: Interaction Patterns_ — ask, tell, request-response, scatter-gather 등.
- _Akka Typed: Lifecycle_ — Signal과 setup의 관계.

---

## 14. 이 문서의 갱신 규칙

- subset 사이클 중 _Akka의 어떤 동작을 새로 알게 되면_ 곧장 이 문서에 반영한다.
- _EffectTS 매핑 결정이 굳어지면_ 11번 표를 굵게 갱신한다.
- _비목표가 늘어나거나 줄어들면_ 12번 갱신.
