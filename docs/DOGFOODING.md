# DOGFOODING — poly-phony 측 사용 가이드

> _ADR-024 의 도그푸딩 정신 그대로_. effect-actor 의 _사용자 측 검증_ 입력 누적.
> 문서/코드 정합성을 _쓴 코드_ 가 박는다.

---

## 도그푸딩 이력

| # | 시점 | 시기 | 결과 요약 |
|---|---|---|---|
| #1 | M2 끝 | 2026-05-09 | 4 결정 입력 → ADR-028~031 |
| #2 | M3 끝 | 2026-05-09 | 5 사이클 / 9 테스트 / 1 BUG (spawn race) → M3.1 환류 |
| #3 | M4 끝 | 2026-05-09 | 5 사이클 / 4 finding → M4.1 환류 (cleanup 통일) |
| #4 | **M5 끝 (지금)** | 2026-05-09 | _본격_ 도그푸딩 — Akka Typed 격차표 끝까지 |

#1~#3 은 _가벼운 도그푸딩_ (~1주 한정). **#4 부터 _본격_** — poly-phony 가 effect-actor 위에 _진짜 agent_ 를 만들면서 _모든 표면_ (M1~M5) 사용. 환류 사이클 (M5.1+) 가능성 열어둠.

---

## 도그푸딩 #4 — _본격_ 가이드

### 0. 이 도그푸딩의 _목적_

`AKKA_REFERENCE.md § 10` 의 격차표 _다섯 줄 모두_ 가 effect-actor 위에서 _진짜 동작_ 하는지 검증. _코드 레벨_ 이 아닌 _도메인 레벨_ — agent 한두 개를 _실제 만들면서_ 표면 cliff 발견.

**검증 약속 (M5 코드 끝 시점):**
- ActorRef 가 restart 후도 동일 (격차표 1 줄)
- Mailbox 가 actor instance 와 분리 — restart 시 메시지 보존 (격차표 2 줄)
- 부모-자식 트리가 framework 차원 — `ctx.spawn` / `ctx.stop` cascade (격차표 3 줄)
- Terminated / ChildFailed 가 _신호_ 로 도착, watchWith 는 _자기 메시지_ (격차표 4 줄)
- `Strategies.matchInstance` / `matchTag` / `matchAll` + restart / resume / stop / restartWithBackoff / withLimit (격차표 5 줄)

추가 표면 (M5):
- `Behaviors.withTimers` — heartbeat / scheduled work / 자동 cancel (restart/stop)
- `Behaviors.withStash` — 초기화 단계 메시지 보류 + unstashAll 순서 보존 + StashOverflow → supervision
- `ctx.fork` — instance scope 안 fork (사용자 직접 timer/loop)
- `ctx.scheduleOnce` — 다른 액터에 delayed tell

### 1. 환경 준비

```bash
# poly-phony 측에서 effect-actor 의존
cd ~/Repository/github/loveqoo/poly-phony
pnpm install
# effect-actor 는 source-direct export (ADR-032) — 빌드 불요. peer dep 으로 effect 같이.
```

`effect-actor` 의 _현재 head_ 확인:

```bash
cd ~/Repository/github/loveqoo/effect-actor
git log --oneline -5
# 최신: 7ca5c9e fix: Effect 밖 throw 안전망
# (또는 그 이후)
```

`pnpm test` 로 라이브러리 측 161+ 테스트 통과 확인 후 진입.

### 2. 시나리오 — 5 사이클 분할 권장

각 사이클은 _구체 도메인 시나리오_ 한 개. agent 의 _실제 사용_ 패턴이라 _합성_ 표면이 노출됨. M3 #2 (5 사이클 / 9 테스트) 같은 분할.

#### 사이클 1 — supervise + matcher chain (M4 + M5 사이클 1+2)

**시나리오**: backend agent (LLM 호출 wrapper) 가 _두 종류 fail_ 받음 — `RateLimitError` (재시도 의미) + `BackendError` (그 외 fail).

```ts
const supervisedBackend = Behaviors.supervise(backendBehavior).onFailure(
  Strategies.matchTag("RateLimitError"),
  Strategies.restartWithBackoff({
    minBackoff: "500 millis",
    maxBackoff: "30 seconds",
    randomFactor: 0.2,
  }).withLimit({ maxNrOfRetries: 5, withinTimeRange: "5 minutes" }),
).onFailure(
  Strategies.matchTag("BackendError"),
  Strategies.restart,  // 즉시 restart 한 번만, 그 외는 propagate
).onFailure(
  Strategies.matchAll,
  Strategies.stop,
);
```

**검증 약속**:
- RateLimitError → backoff 점진 + jitter + 한도 초과 시 stop 강등
- BackendError → 즉시 restart, ref 안정 (외부 코드 변경 X)
- 그 외 → stop, parent ChildFailed
- restart 도중 들어온 메시지 보존 (mailbox)

#### 사이클 2 — withTimers + ctx.fork (M5 사이클 3)

**시나리오**: agent 가 _heartbeat_ (60초 간격 health probe) + _idle timeout_ (5분 메시지 없으면 자기 stop) 동시.

```ts
const heartbeatAgent = Behaviors.withTimers<Msg>((timers) =>
  Effect.gen(function* () {
    yield* timers.startTimerWithFixedDelay("hb", { _tag: "Heartbeat" }, "60 seconds");
    yield* timers.startSingleTimer("idle", { _tag: "IdleTimeout" }, "5 minutes");
    return Behaviors.receive<Msg>((ctx, msg) =>
      Effect.gen(function* () {
        // 메시지 도착 → idle timer 리셋
        yield* timers.startSingleTimer("idle", { _tag: "IdleTimeout" }, "5 minutes");
        // ... 메시지 처리 ...
      })
    );
  }),
);
```

**검증 약속**:
- heartbeat 정확 간격 (시계 측정)
- idle timer key 충돌 시 기존 cancel + 새 등록 — Akka 동작
- restart 시 모든 timer 자동 cancel + 새 setup 에서 새로 등록
- agent stop 시 timer 자동 cancel (instanceScope close)

#### 사이클 3 — withStash 초기화 패턴 (M5 사이클 4)

**시나리오**: agent 가 _외부 reply 도착 전_ 메시지 stash, init 끝나고 unstashAll → ready. capacity 초과 → restart.

```ts
type Msg =
  | { _tag: "InitDone"; conn: Connection }
  | { _tag: "Request"; payload: ... };

const initializing = Behaviors.withStash<Msg>(100, (stash) =>
  Effect.sync(() =>
    Behaviors.receive<Msg>((ctx, msg) => {
      if (msg._tag === "InitDone") return stash.unstashAll(ready(msg.conn));
      return stash.stash(msg).pipe(Effect.as(Behaviors.same()));
    }),
  ),
);

// supervisor 결합 — overflow → restart (외부 reply 안 오면 capacity 한계로 자기 보호)
const supervised = Behaviors.supervise(initializing).onFailure(
  Strategies.matchTag("StashOverflow"),
  Strategies.restart,
);
```

**검증 약속**:
- stash 메시지가 unstashAll 시 _순서대로_ 처리 (FIFO)
- unstashAll 후 들어온 메시지가 _그 다음_ 처리
- StashOverflow → restart, 새 buffer
- restart 후 buffer 자동 비움

#### 사이클 4 — watchWith + ask + scheduleOnce (M3 + M5 사이클 3)

**시나리오**: orchestrator agent 가 worker pool 관리. 각 worker watchWith → 죽으면 _자기 메시지_ `WorkerGone` 으로 알림. ask 로 동기 호출, scheduleOnce 로 retry.

```ts
type OrchMsg =
  | { _tag: "WorkerGone"; workerId: string }
  | { _tag: "Submit"; task: Task }
  | { _tag: "RetryAfter"; task: Task; deadline: Date };

const orchestrator = Behaviors.setup<OrchMsg>((ctx) =>
  Effect.gen(function* () {
    const worker = yield* ctx.spawn(workerBehavior, "worker-1");
    yield* ctx.watchWith(worker, { _tag: "WorkerGone", workerId: "worker-1" });
    return Behaviors.receive<OrchMsg>((c, msg) =>
      Effect.gen(function* () {
        switch (msg._tag) {
          case "Submit": {
            const result = yield* c.ask(worker, (replyTo) => ({
              _tag: "Process", task: msg.task, replyTo,
            }), "10 seconds").pipe(
              Effect.catchTag("AskTimeout", () =>
                c.scheduleOnce("5 seconds", c.self, {
                  _tag: "RetryAfter", task: msg.task, deadline: ...,
                }).pipe(Effect.as(undefined)),
              ),
            );
            // ...
          }
          case "WorkerGone": {
            // worker 죽음 알림 — 새로 spawn 또는 alert
          }
          // ...
        }
        return Behaviors.same<OrchMsg>();
      }),
    );
  }),
);
```

**검증 약속**:
- `watchWith` 가 worker 죽음 시 _custom 메시지_ 정상 도착 (signal 아닌 mailbox)
- `ctx.ask` typed reply, AskTimeout catchTag 분기
- `ctx.scheduleOnce` self 에 delayed tell, restart/stop 시 자동 cancel

#### 사이클 5 — 종합 시나리오 + Stress

**시나리오**: 위 사이클 1~4 의 _합성_. supervise + restartWithBackoff + withTimers + withStash + watchWith 가 한 actor tree 안에 동시 존재. 약 10~50 worker 동시. 약 100~1000 메시지/sec.

**검증 약속**:
- 동시 fail / restart / mailbox 보존 의 _race-free_ (M3.1 spawn latch + ADR-031 cascade 그대로 유지되는지)
- timer 가 stress 안에서도 정확
- stash overflow 가 _드물게_ 발생할 때 supervision 정상
- shutdown 깔끔 — 모든 fiber interrupt + scope close
- agent 측 _domain 어휘_ 가 자연 (예: `WorkerGone`, `RateLimitError`) — wrapper 부담 5~10줄?

### 3. 결과 형식

각 사이클 끝에 다음 형식으로 보고:

```
## 사이클 N — <시나리오 한 줄>

[결과 표]
| 약속 | 결과 | 측정 |
|---|---|---|
| ... | ✅ / ⚠️ / ❌ | ... |

[발견]
- F1: <한 줄 finding> — 재현 코드 / 환경 / 영향
- F2: ...

[표면 어색]
- ... (cliff, 잠재 의제)

[권장 후속]
- (a) 라이브러리 환류 fix 후보
- (b) USAGE 보강
- (c) M∞ 까지 미룸
```

각 사이클 _10~30분_ 목표. 5 사이클 합 _2~3시간_. 본격이라 가벼운 사이클 (#2, #3) 보다 깊이 있게.

### 4. 결과 도착 시 후속

라이브러리 측 처리 (M3.1 / M4.1 패턴):
- finding 모두 _가설_ + _라이브러리 측 실측_ 으로 검증 (도그푸딩 #3 의 _single root cause_ 가설 검증 패턴 그대로)
- 환류 사이클 (M5.1) 진입 — fix + 회귀 테스트 + 재검증
- 모든 finding closed → M5 _전체_ DoD 🟢

표면 어색 / cliff:
- _작은 fix_ → M5.1 안에 묶음 (_Effect 밖 throw_ 안전망 같은 미니 사이클 패턴)
- _큰 의제_ → ADR 박고 M∞ (본격 release) 직전 또는 후속 마일스톤

### 5. 본격 도그푸딩 _이후_

ADR-024 의 _M5 끝_ 본격 도그푸딩 시점 = npm 배포 직전 마지막 검증.

- M5.1 환류 사이클 모두 closed 후 → M∞ 진입 (semver 정책 결정 + 영어 README + CHANGELOG + setup-deploy)
- 0.1.0 첫 배포 — _도그푸딩 통과한 표면_ 그대로
- 도그푸딩 #5+ 는 _배포 후_ 사용자 측 issue 입력 (GitHub) 으로 넘어감

---

## 부가 — 기존 도그푸딩의 _이미 fix 된 cliff_ (#4 에서 _안 부딪힐_ 것)

| # | 이슈 | fix |
|---|---|---|
| #2 사이클 5 | spawn race (자식 spawn 후 즉시 stop 시 미등록 자식) | ADR-031 보강 + Deferred latch + TMap.remove 우회 (M3.1) |
| #3 의제 1 | supervisor stop 강등 시 PostStop 미호출 | ADR-037 의 cleanup 통일 (M4.1 사이클 2) |
| #3 의제 2 | 자발 Behaviors.stopped 시 watcher 미알림 | 같은 ADR-037 onSelfTermination |
| #3 F1 | sys.shutdown 시 self-loop watchWith hang | M4.1 사이클 1 fix (status check) |
| #4 사전 fix | _Effect 밖 throw_ 가 supervision 통과 X | M5 미니 사이클 fix (interpretStep / interpretSignalStep 의 Effect.suspend wrap) |

이 cliff 들은 _다시 안 발견되어야_ 회귀 안전 검증. 발견되면 _회귀_ 알림.

---

## 부가 — _안 다루는_ 표면

다음은 시안 / 미구현 / 도그푸딩 _대상 밖_:

- `ref.ask` (외부 Effect 에서 호출) — _bootstrap actor_ 우회 권장
- `Strategies.matchSchema(...)` — Effect Schema 기반 매처, 도그푸딩 입력 후 결정
- `unstash(behavior, n)` — 부분 unstash, Akka 별도
- `startTimerAtFixedRate` — fixedDelay 와 의미 다름, 미구현
- Cluster / Persistence / Receptionist — ADR-006, 0.x 범위 _밖_

---

## 갱신 규칙

- 도그푸딩 끝나면 _이력 표_ 갱신 (#4, #5, ...)
- 새 cliff 발견 → _이미 fix 된 cliff_ 표 갱신 (fix 후)
- 가이드 자체 변경은 _도그푸딩 #X+ 사이클_ 시작 직전
