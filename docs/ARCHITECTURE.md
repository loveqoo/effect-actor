# Architecture — 내부 런타임 모델

> 사용자 API(=`docs/API.md`) 가 동작하기 위해 _내부에 무엇이 있어야 하는가_ 를 정리한다.
> Akka 모델([AKKA_REFERENCE](./AKKA_REFERENCE.md)) 을 EffectTS로 옮길 때의 _구조적 결정_ 들이 여기 모인다.
>
> _2026-05-09 plan-eng-review 결과 반영. ADR-016~026 참고._

---

## 1. 다섯 겹

```
┌─────────────────────────────────────────────────────────┐
│  L5  사용자 API                                           │
│      Behaviors.receive / spawn / supervise / watch / ask │
├─────────────────────────────────────────────────────────┤
│  L4  Behavior 해석기 + L3 Supervision 외피 (같은 fiber)   │
│      해석 루프를 catchAll 로 감싼 _외피_. 래퍼가 현재       │
│      Behavior 인스턴스를 추적해 PreRestart 신호 전달.       │
├─────────────────────────────────────────────────────────┤
│  L2  Mailbox 계층                                         │
│      Queue<Msg> + Queue<Signal>. Cell 로 ref 가 직접 보유 │
├─────────────────────────────────────────────────────────┤
│  L1  Registry + Fiber + Instance Scope                   │
│      ActorPath → ActorEntry. 각 entry당 한 Fiber 실행      │
│      각 instance 가 EffectTS Scope 소유 (cleanup 자동)     │
└─────────────────────────────────────────────────────────┘
```

규칙: 위 계층은 _아래_ 만 호출한다. 옆이나 위로 호출하면 결합이 깨진다.

> ⚠️ **L3 Supervision 외피 의미** (ADR-020): supervision 은 _완전히 분리된 계층_ 이 아니라 _interpreter 와 같은 fiber 안의 외피_. 래퍼가 _현재 Behavior 인스턴스_ 를 추적해야 PreRestart 를 _그 Behavior_ 에게 발사 가능. Akka 의 `ActorCell` 도 같은 모양 — supervisor 와 Behavior 둘 다 같은 cell 안에 보유.

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

### 2.2 `ActorRef[Msg]` (ADR-016, ADR-019)

가벼운 핸들. 메시지 보내는 능력만. **path-only 가 아니라 incarnation UID + cell 까지 포함**.

```typescript
class ActorRef<Msg> {
  readonly path: ActorPath;
  readonly uid: string;        // ADR-016: spawn 시 부여되는 UUID, ABA 방지
  readonly cell: Cell<Msg>;    // ADR-019: mailbox + signalQueue 직접 reference
  readonly system: ActorSystem;

  // Fire-and-forget — best-effort delivery (ADR-019)
  // 1) STM read-only tx 로 entry.uid === ref.uid + status 검증
  // 2) cell.mailbox.offer(msg)  — registry lookup 0회
  // 송신 결과:
  //   - stale ref (uid 다름): dead letter
  //   - in-flight stop: 옛 cell 에 enqueue, 아무도 안 읽음 (의미적 소실)
  //   - fresh: enqueue 성공
  tell(msg: Msg): Effect<void>;

  // 좁은 타입으로 강등 (ADR-023, ADR-016과 같은 정신)
  // ⚠️ TypeScript 단순 캐스팅 — 런타임 검증 없음. _권장 대안은 adapter actor 패턴_ (API.md §3.8).
  narrowUnsafe<U extends Msg>(): ActorRef<U>;
}

type Cell<Msg> = {
  readonly mailbox: Queue<Msg>;        // 사용자 메시지 (EffectTS Queue, unbounded 기본)
  readonly signalQueue: Queue<Signal>; // 시스템 신호
};
```

핵심:
- ActorRef 는 _path + uid + cell_ 직접 보유. tell hot path 가 _registry lookup 0회_.
- restart 시 cell 그대로 (mailbox 인스턴스 동일).
- 동명 재spawn 시 _새 entry_ 는 _새 cell + 새 uid_. 옛 ref 는 옛 cell 에 enqueue → 아무도 안 읽음 + uid mismatch 로 dead letter 검출.

### 2.3 `ActorEntry` (Registry 엔트리, ADR-017, ADR-022)

```typescript
type ActorEntry<Msg> = {
  readonly path: ActorPath;
  readonly uid: string;                        // ADR-016: incarnation UID
  readonly cell: Cell<Msg>;                    // mailbox + signalQueue
  readonly children: TRef<Set<ActorPath>>;     // ADR-017: STM
  // ADR-022: watch key 가 (path, uid) — ABA 방지. 양방향 추적.
  readonly watchers: TMap<WatchKey, WatchMessage>;     // 나를 watch 하는 자들
  readonly watching: TMap<WatchKey, WatchMessage>;     // 내가 watch 중인 대상
  readonly fiber: TRef<Option<Fiber<unknown, never>>>; // 현재 실행 중인 Fiber
  readonly status: TRef<ActorStatus>;          // running / restarting / stopped
  readonly scope: Scope;                       // ADR-021: instance Scope
};

type ActorStatus = "running" | "restarting" | "stopped";

type WatchKey = { readonly path: ActorPath; readonly uid: string };

type WatchMessage =
  | { readonly _tag: "Terminated" }                  // ctx.watch
  | { readonly _tag: "Custom"; readonly msg: unknown }; // ctx.watchWith
```

**중요한 invariant:**
- `cell.mailbox` 와 `cell.signalQueue` 는 ActorEntry _전체 수명_ 동안 같은 인스턴스다. restart 해도 새로 만들지 _않는다_.
- `fiber` 는 restart 시 교체된다.
- `scope` 는 instance lifetime — restart 시 닫고 새로 연다 (ADR-021).
- entry 자체가 사라지는 건 _stop_ 일 때뿐.

### 2.4 `Registry` (ADR-017)

시스템 단위로 하나. path → entry. **STM 트랜잭션으로 정합성 보장**.

```typescript
class Registry {
  private map: TMap<string, ActorEntry<unknown>>;  // path 직렬화 키, STM

  register<Msg>(entry: ActorEntry<Msg>): STM<void>;
  resolve<Msg>(path: ActorPath): STM<Option<ActorEntry<Msg>>>;
  unregister(path: ActorPath): STM<void>;

  // Watch 이벤트 디스패치 (STM 트랜잭션 안)
  notifyTerminated(key: WatchKey, reason: TerminationReason): Effect<void>;
}
```

**STM 선택 이유 (ADR-017)**:
- spawn/stop/watch 가 _여러 entry 의 여러 필드_ 를 한 트랜잭션으로 안전 갱신. 찢어진 상태 구조적 차단.
- 시스템 명령 fiber 안과 비교: STM 은 _병렬 시도 + auto retry_ 로 lifecycle 연산이 _독립적_ 가능. fiber 채널 안은 _직렬화_, 보장은 같지만 병렬성 없음. 단일 프로세스 0.x 에선 lifecycle 이 드물어 _둘 다 충분한 보장_, STM 선택은 _사용자 STM tx 합성_ 가능성 (추후 옵션) 도 고려.
- enqueue 원자성은 별도 — `tell` 의 `Queue.offer` 는 STM 밖. _best-effort delivery_ 명시 (ADR-019).

### 2.5 `Behavior<Msg>` ADT

함수형 데이터 구조. 해석기(L4) 가 한 케이스씩 처리.

```typescript
type Behavior<Msg> =
  | { _tag: "Receive";  // M2: onSignal 필드 + receiveSignal fluent 메서드 (ReceiveBehavior)
      handle: (ctx: ActorContext<Msg>, msg: Msg) => Effect<Behavior<Msg>>;
      onSignal: ((ctx: ActorContext<Msg>, signal: Signal) => Effect<Behavior<Msg>>) | null;
      receiveSignal: (h: ...) => Behavior<Msg>;
    }
  | { _tag: "Setup"; init: (ctx: ActorContext<Msg>) => Effect<Behavior<Msg>> }
  | { _tag: "Same" }
  | { _tag: "Stopped" }
  | { _tag: "Empty" }
  | { _tag: "Unhandled" }
  | { _tag: "Supervise"; inner: Behavior<Msg>; strategy: SupervisorStrategy }
  | { _tag: "WithMailbox"; inner: Behavior<Msg>; policy: MailboxPolicy }; // ADR-018

type MailboxPolicy =
  | { _tag: "Unbounded" }                           // 기본 (ADR-018)
  | { _tag: "Bounded"; capacity: number; overflow: "backpressure" | "drop" | "fail" };
```

해석기는 _현재 Behavior_ 를 들고, 메시지를 받아서 _다음 Behavior_ 를 계산. `Same` 이면 그대로, `Stopped` 면 종료.

`Supervise` / `WithMailbox` 같은 _래퍼 ADT_ 는 spawn 의 0단계에서 _벗겨져_ 메타 추출 (§3.1). 같은 패턴.

**M2: 신호 처리** — `Receive` 가 _Akka Typed 모양_ 의 fluent 빌더 (`Behaviors.receive(...).receiveSignal(...)`). `onSignal` 이 null 이면 신호 무시 (Akka unhandled). PostStop 은 _자발 Stopped 도달_ 또는 _외부 emit (shutdown)_ 두 케이스 모두 _마지막 active Receive_ 의 onSignal 이 한 번만 받음. ADR-021 §3.8 의 _명시 hook 먼저, 자동 Scope cleanup 나중_.

---

## 3. 데이터 흐름

### 3.1 Spawn (ADR-026, ADR-021)

부모 액터가 `ctx.spawn(childBehavior, "child")` 를 호출하면:

```
0. (메타 추출 단계 — ADR-026)
   childBehavior 의 외곽 래퍼 (WithMailbox / Supervise / Setup) 를 벗겨서
   - mailbox 정책 추출 (없으면 unbounded — ADR-018)
   - supervisor 정책 추출 (없으면 default: stop on failure)
   - 시작 behavior 추출 (Setup 이면 init 실행 결과)
1. parent.path + "child" → childPath 생성
2. UUID 생성 → childUid (ADR-016)
3. cell = { Queue<Msg>(policy), Queue<Signal>() } 생성 (ADR-019)
4. instance Scope 열기 (ADR-021)
5. ActorEntry 생성 (status=running, fiber=Empty, scope)
6. Registry.register(entry)  — STM tx
7. Parent 의 children 에 추가 — 같은 STM tx
8. Behavior 해석 루프를 Effect.fork (instance Scope 안) → Fiber
9. fiber 를 entry.fiber 에 저장 — STM tx
10. ActorRef = { path, uid, cell, system } 반환 (ADR-019)
```

### 3.2 Tell (메시지 보내기, ADR-019)

`ref.tell(msg)`:

```
1. STM read-only tx:
   - entry = registry.resolve(ref.path) || dead letter
   - if entry.uid !== ref.uid: dead letter (ADR-016)
   - if entry.status === "stopped": dead letter
2. ref.cell.mailbox.offer(msg)  — registry lookup 0회 (ADR-019)
```

**송신 결과 명시 (ADR-019, "best-effort delivery"):**
- _stale ref_ (uid 불일치): dead letter
- _in-flight stop_ (검증 후 enqueue 사이에 stop): 옛 cell 에 enqueue, 아무도 안 읽음 (의미적 소실)
- _fresh_: enqueue 성공

Akka 와 동일 — tell 은 _delivery 보장 안 함_. 사용자가 보장 원하면 명시 supervision 또는 ack 패턴.

### 3.3 Receive (해석 루프, ADR-020)

각 액터가 자기 Fiber 안에서 도는 루프 — supervision 외피 안:

```
loop(behavior, ctx):
  msg or signal = take(mailbox, signalQueue)  // signal 이 있으면 우선
  next = interpret(behavior, ctx, msg)        // catchAll 로 supervision 외피
    on failure:
      strategy = behavior.supervisorStrategy ?? default
      if strategy === restart:
        signalQueue.offer(PreRestart)         // 현재 behavior 가 받음
        // (재귀 실패 시 정책 재적용, 강도 제한)
        scope.close + scope.open               // ADR-021
        new = recompute(behavior 의 setup)
        loop(new, ctx)
      if strategy === stop:
        cleanup; return
  if next === Same: loop(behavior, ctx)
  if next === Stopped: cleanup; return
  else: loop(next, ctx)
```

- **Signal 우선순위:** `PostStop`, `Terminated` 같은 시그널은 사용자 메시지보다 _먼저_ 처리. 두 큐를 둘 다 들여다보되, signalQueue 쪽을 우선 폴링 (ADR-009).
- **`take` 의 의미:** EffectTS 의 `Queue.take` 는 기본 blocking. Fiber 가 자연스럽게 대기.
- **Supervision 외피 (ADR-020):** _interpreter 와 같은 fiber 안_ 의 catchAll 외피. 래퍼가 _현재 Behavior 인스턴스_ 추적해 PreRestart 발사 가능. Akka ActorCell 과 같은 모양.

### 3.4 Watch + Terminated (ADR-022)

`ctx.watch(otherRef)` (또는 `watchWith`):

```
1. STM tx:
   - watchKey = { path: otherRef.path, uid: otherRef.uid }
   - target.watchers[watchKey] = WatchMessage  (Terminated 또는 Custom msg)
   - self.watching[targetWatchKey] = WatchMessage
   - if otherRef.uid !== currentEntry.uid: 즉시 self.signalQueue.offer(Terminated)
```

`other` 가 죽을 때 (ADR-022):

```
1. STM tx 안:
   - registry.unregister(other.path)
   - 각 watcher (target.watchers) 에 대해:
       resolve(watcher.path) → entry
       만약 entry.uid === watcher.uid (ABA 방지):
         entry.signalQueue.offer(WatchMessage 변환 결과)
   - target.watchers 비우기
```

**중복 watch / 재호출 (Akka semantics)**: 같은 watcher-target 쌍에 대해 _하나의 변환_ 만. 재호출 (`watch` 후 `watchWith`) 은 _덮어쓰기_. unwatch(target) 는 _그 쌍 제거_.

DeathPact: watcher 가 Terminated 를 처리하지 _않으면_ 자신도 실패한다 — 해석기 차원에서 unhandled signal 검출.

### 3.5 Restart (ADR-020, ADR-021)

Supervision strategy 가 restart 로 결정된 경우:

```
1. status = "restarting" (STM tx)
2. PreRestart 신호 → 현재 Behavior 가 처리 (선택적, supervision 외피가 발사)
3. 자식 액터 모두 stop (cascade)  ← Akka Typed 기본 동작
4. instance Scope 닫기 (ADR-021)
   → fork fiber, timer, ask temp actor, setup resource 자동 정리
5. 현재 Fiber interrupt (mailbox 는 보존)
6. 새 instance Scope 열기
7. 새 Behavior 인스턴스 생성 (setup 다시 실행)
8. 새 Fiber 로 해석 루프 재시작
9. status = "running" (STM tx)
```

이 동안 _외부에서 보낸 메시지는 mailbox 에 쌓여있다_ (cell 인스턴스 동일). 새 Fiber 가 곧장 그것들을 처리.

### 3.6 Stop

```
1. status = "stopped" (STM tx)
2. 자식 모두 stop (재귀)
3. PostStop 신호 처리 (사용자 명시 hook — ADR-021)
4. instance Scope 닫기 (자동 cleanup)
5. mailbox / signalQueue 종료 (이후 tell 은 dead letter)
6. watchers 에 Terminated 전송 (각 watchKey 의 WatchMessage 변환 — ADR-022)
7. registry.unregister(path) — STM tx
8. fiber 종료
```

### 3.7 Scope 소유권 표 (ADR-021)

각 자원이 _어느 Scope_ 에 묶이는지 명시. 자원 추가 시 이 표를 갱신.

| 자원 | 소유 Scope | restart 시 |
|---|---|---|
| 자식 actor | _자기 instance Scope_ (부모 Scope 아님) | 부모 cascade stop 정책에 따라 stop (Akka Typed 기본) |
| `ctx.fork` fiber | 부모 instance Scope | 부모 restart 시 닫힘 |
| Timer (M5: `ctx.scheduleOnce`, `withTimers`) | 부모 instance Scope | restart 시 닫힘 |
| Ask 임시 actor | 자기 instance Scope (응답/타임아웃 후 stop) | 부모 restart 와 무관 (독립) |
| Setup resource (`Effect.acquireRelease`) | instance Scope | restart 시 닫고 setup 재실행 |
| Stash (M5) | instance Scope | restart 시 비워짐 |

**원칙:**
- _기본 cleanup_ 은 instance Scope 의 자동 정리 (Effect.acquireRelease / fork 등 finalizer).
- _명시 cleanup hook_ 은 PostStop (M2 후, 외부 알림 등 사용자 코드).

### 3.8 Cleanup 모델 우선순위 (ADR-021)

두 cleanup 모델 공존 — 우선순위 명시:

1. **자동 (기본)**: instance Scope 가 finalize. fork / timer / scoped resource 모두 자동.
2. **명시 hook (M2 후)**: PostStop 신호. 사용자 코드 수준 명시 cleanup (외부 알림, 로그, 분석 이벤트 등).

대부분 사용자는 (1) 만으로 충분. (2) 는 _fiber 영역 밖_ 에 알리고 싶을 때만.

---

## 4. 결정해야 할 것 — 미정 항목

### 4.1 Signal 과 Message 의 큐 분리 (ADR-009 — accepted)

별도 큐 + signalQueue 우선 폴링. 결정 끝.

### 4.2 Mailbox 정책 (ADR-018 — accepted, ADR-008 supersedes)

**기본 unbounded.** `Behaviors.withMailbox({ capacity, overflow })` 로 명시 선택 (`backpressure` / `drop` / `fail`). AI/agent burst 워크로드 안전 + Akka Typed 정통 일관.

### 4.3 ActorContext 전달 방식 (ADR-007 — accepted, 잠정)

함수 인자로 명시 전달. 결정 잠정.

### 4.4 진단 출력 / 디버그 모드 (ADR-013 — accepted, placeholder)

자리만. 구체 설계는 M3-M4 사이클에서.

후보 진단 출력:
- 액터별 mailbox depth (현재 큐 길이)
- registry dump (path, uid, status 매트릭스)
- watch 그래프 (누가 누구를 watchKey 로 watch 중)
- 마지막 N개 메시지의 routing 추적
- Scope 소유 트리 (부모-자식 + fork lifetime)

### 4.5 에러 종류 계층 (ADR-012 — accepted)

EffectTS Tagged Error 패턴으로 표현. 최상위 에러 종류:

| 에러 종류 | 발생 시점 | 예상 처리 |
|---|---|---|
| `ActorNotFound` | tell / ask 시 path 가 registry 에 없음 | dead letter 또는 사용자 캐치 |
| `IncarnationMismatch` | tell 시 entry.uid !== ref.uid (ADR-016) | dead letter 자동 |
| `MailboxFull` | bounded mailbox + overflow=fail (ADR-018) | 사용자 캐치 |
| `AskTimeout` | ask 응답이 지정 시간 내 안 도착 | 사용자 캐치 |
| `DeathPactException` | watch 했는데 Terminated 미처리 → 자기도 실패 | supervision 으로 catch |
| `StashOverflow` | withStash 용량 초과 | supervision 대상 |

구체 메시지 어휘 (텍스트, 권장 fix, 문서 링크 등) 는 _관련 패스의 사이클_ 에서 확정.

### 4.6 Strategy DSL 의 형태

```typescript
// chained
Behaviors.supervise(b)
  .onFailure(IOError, Strategies.resume)
  .onFailure(StateError, Strategies.restart);
```

Akka 모양과 일치하는 chained 로 진행.

### 4.7 Outside Voice 발견 — 모두 결정 끝 (2026-05-09 plan-eng-review)

**Round 1 (2026-05-08):** OV-1, 2, 3, 4, 5, 8, 9, 10 → ADR-016 ~ ADR-023 으로 정해짐. ADR-014 → ADR-024, ADR-015 → ADR-025.

**Round 2 (2026-05-09):** OV2-1, 2, 3, 4, 5, 6, 7, 8, 9, 10 → 위 ADR 보강 + ADR-026 신규. 자세한 내용은 [DECISIONS.md](./DECISIONS.md).

이 모든 결정이 본 문서의 §1-3 에 반영되어 있음. M1 진입 시 _구조적 모순_ 없는 상태.

---

## 5. 주요 invariant 요약

| Invariant | 왜 |
|---|---|
| Mailbox/signalQueue 인스턴스는 ActorEntry 수명 = path 수명 동안 동일 | Stable ref + restart 의 핵심 (ADR-002) |
| ActorRef 가 path + uid + cell 직접 보유 | tell hot path 0회 lookup + ABA 안전 (ADR-016, ADR-019) |
| Registry 는 시스템 단위 단일 진실원 (TMap, STM tx) | resolve 가 항상 권위 있음. spawn/stop/watch 정합성 (ADR-017) |
| Signal 은 사용자 메시지보다 우선 처리 | PostStop / Terminated 가 늦게 도달하면 안 됨 (ADR-009) |
| Stop 은 재귀적 (자식 먼저 정리) | 자식이 부모보다 오래 사는 상태 금지 |
| Supervision 은 해석기 외피 (같은 fiber, catchAll, 현재 Behavior 추적) | PreRestart 를 _그 Behavior_ 에 발사. Akka ActorCell 과 같은 모양 (ADR-020) |
| Instance Scope = 자동 cleanup 기본, PostStop = 명시 hook | restart/stop 시 fork/timer/scoped resource 자동 정리 (ADR-021) |
| Watch key = (path, uid) 양방향 TMap | 동명 재spawn 시 옛 watcher 가 새 entry 에 잘못 연결되지 않음 (ADR-022) |
| Tell 은 best-effort delivery | uid mismatch / in-flight stop 은 dead letter 또는 의미적 소실 명시 (ADR-019) |

---

## 6. 의존성 그래프 (모듈)

```
ActorSystem<RootMsg>             ← ADR-026: generic on root msg type
   ├─ Registry (TMap, STM)
   ├─ DeadLetter sink
   └─ rootGuardian (ActorRef<RootMsg>)

ActorEntry (per actor)
   ├─ Cell { Queue<Msg>, Queue<Signal> }   ← stable identity
   ├─ uid: string                          ← incarnation (ADR-016)
   ├─ Children (TRef<Set<ActorPath>>)
   ├─ Watchers (TMap<WatchKey, WatchMessage>)   ← ADR-022
   ├─ Watching (TMap<WatchKey, WatchMessage>)   ← ADR-022
   ├─ Fiber (TRef<Option<Fiber>>)
   ├─ Status (TRef<Status>)
   └─ Scope (instance lifetime — ADR-021)

Behavior<Msg> (사용자 정의, ADT)
   └─ Interpreter + Supervision 외피 (같은 fiber — ADR-020)

ActorRef<Msg> = { path, uid, cell, system }     ← ADR-019: cell direct
```

---

## 7. 이 문서의 갱신 규칙

- 미정 항목(4번)이 결정되면 _결정의 결과_ 만 본문에 옮기고, _왜 그 결정을 했는지_ 는 `DECISIONS.md` 에 ADR 로 적는다.
- 새 invariant 가 발견되면 5번 표에 추가.
- 모듈 그래프(6번)가 바뀌면 갱신. 단 너무 잘게 쪼개지 말 것 — 큰 그림용.
- §3.7 Scope 소유권 표 는 _새 자원 종류 추가_ 시마다 갱신 (Stash, Timer 등 마일스톤별).
