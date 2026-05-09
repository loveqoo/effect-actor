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
| #4 | **M5 끝** | 2026-05-09 | **통과** — 5 사이클 × 3회 = 15회 flake-free, finding 0, 회귀 0. 5 cliff 모두 안정. M5 _전체_ DoD 🟢. M∞ 진입 가능. |
| #5 | **0.1.0 배포 직후** | 2026-05-10 | **통과** — 2 사이클, finding 0, 회귀 0, 3회 flake-free. `npm install` (legacy-peer-deps) → import / tsc strict / 실행 모두 OK. `.d.ts.map` 포함 IDE 친화. 도메인 사이클 (ADR-045 watchTerminated + 재spawn) 정확. **0.1.0 packaging DoD 🟢.** |

#1~#3 은 _가벼운 도그푸딩_ (~1주 한정). **#4 부터 _본격_** — poly-phony 가 effect-actor 위에 _진짜 agent_ 를 만들면서 _모든 표면_ (M1~M5) 사용. 환류 사이클 (M5.1+) 가능성 열어둠.

**#5 는 _packaging 검증_ 중심** — 기능은 #4 가 검증. #5 의 초점은 _배포한 코드_ 가 _진짜 npm 환경_ 에서 동작하는지. 가벼움 (1-2 사이클).

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

## 도그푸딩 #5 — _packaging 검증_ 가이드

### 0. 목적

도그푸딩 #4 까지는 _source-direct_ (poly-phony 가 effect-actor 의 src/ 를 직접 import). #5 는 **`npm install @loveqoo/effect-actor@0.1.0` → `dist/` 번들 사용**. 검증 초점:

1. **설치 path** — `pnpm add @loveqoo/effect-actor` 정상.
2. **exports 해상도** — `import { ActorSystem, Behaviors, Strategies, ... }` 모두 풀림.
3. **타입** — IDE 에서 `ActorRef<Msg>`, `Behaviors.receive`, `Strategies.matchTag` 등 자동완성 + 시그너처 hover.
4. **`.d.ts.map` 의 `go to definition`** — 우리 `src/` (또는 `dist/*.d.ts`) 까지 추적.
5. **ESM 호환성** — poly-phony 의 module 환경 (`tsconfig.json` 의 `module: NodeNext` 등) 과 충돌 없는지.
6. **peer dep `effect@^3.10.0`** — poly-phony 의 effect 버전과 충돌 없는지.

기능 검증 _아님_ — 기능은 도그푸딩 #4 통과. _포장지 검증_.

### 1. 환경 준비

```bash
cd ~/Repository/github/loveqoo/poly-phony

# (a) 기존 source-direct dependency 제거 (가능한 경우 — 도그푸딩 #4 셋업)
# package.json 의 "@loveqoo/effect-actor": "file:../effect-actor" 또는 비슷한 항목 제거.

# (b) 진짜 npm 에서 install
pnpm add @loveqoo/effect-actor@0.1.0

# (c) 설치 결과 확인
ls node_modules/@loveqoo/effect-actor/dist/ | head -10
# 기대: index.{js,d.ts,d.ts.map,js.map} + 16개 module 파일
cat node_modules/@loveqoo/effect-actor/package.json | head -20
# version 0.1.0, exports 정상
```

### 2. 시나리오 — 2 사이클 분할 권장

#### 사이클 1: smoke install + 한 example 동작

도그푸딩 #4 의 _가장 간단한 표면_ 한 줄 (예: `examples/01-counter.ts` 의 spawn/tell/receive) 을 poly-phony 안 _아무 파일_ 로 옮겨 실행.

검증 항목:
- `import { ActorSystem, Behaviors } from "@loveqoo/effect-actor"` 풀림
- TypeScript compile 통과
- `pnpm dev` (또는 `tsx your-smoke.ts`) 정상 실행 → expected 출력
- 콘솔에 _no warnings_ (ESM/CJS interop 경고 없음)

발견 시 보고:
- import resolve 실패 → npm 설치 손상 또는 exports map 잘못
- tsc 에러 → tsconfig 환경 충돌 또는 .d.ts 손상
- 런타임 에러 → dist/ 빌드 손상 (tsc 결과)

#### 사이클 2: IDE 친화도 + 도그푸딩 #4 _도메인_ 한 사이클 재실행

VS Code (또는 본인 IDE) 에서:
- `ActorRef<Msg>` 의 `Msg` 자동 추론 보임?
- `Behaviors.supervise(b).onFailure(...)` 의 `Strategies` 자동완성 — `restart`, `restartWithBackoff`, `withLimit` 등 모두 보임?
- `ChildNameTaken` 의 `Effect.catchTag("ChildNameTaken", ...)` 자동완성 + 타입 좁힘?
- `ctx.spawn` 의 _hover_ — 시그너처 + (있다면) JSDoc?
- _go to definition_ — `ActorSystem.create` 누르면 dist/system.d.ts 로? `.d.ts.map` 있으면 우리 src/system.ts 로?

**도메인 한 사이클** — 도그푸딩 #4 의 사이클 한 개 (예: watchTerminated + 재spawn — 우리 ADR-045 의 핵심 시나리오) 를 _진짜 npm 환경_ 에서 다시. 한 번. _packaging 손상_ 으로 _기능_ 도 깨졌는지 검증.

### 3. 결과 형식

도그푸딩 #4 와 같은 형식. 사이클 별 _발견_ + _재현 코드_. **최소 출력:**

```
## 도그푸딩 #5 — packaging 검증

### 사이클 1 — smoke install + 1 example
- pnpm add @loveqoo/effect-actor@0.1.0 → 성공/실패 (메시지 첨부)
- import resolve → OK / ERR
- tsc → OK / ERR (메시지)
- 실행 → expected 출력 / 실제 출력
- finding: 0 / N (각 finding 형식: 가설 + 재현 코드)

### 사이클 2 — IDE + 도메인 한 사이클
- 자동완성 / hover / go-to-definition 각 OK / ERR
- 도메인 사이클 (watchTerminated + 재spawn) → OK / ERR
- finding: 0 / N
```

### 4. 결과 도착 시 후속

- finding 0 → **0.1.0 packaging DoD 🟢** → 도그푸딩 _배포 후_ 모드 (외부 issue 라운드 대기)
- finding 1+ → 분류:
  - **packaging cliff** (exports / d.ts / ESM / peer dep) → 0.1.1 patch (ADR-041 의 _patch = bug fix_)
  - **시그너처 cliff** (시그너처 누락 / 시그너처 잘못) → 0.1.1 patch 또는 0.2.0 minor (breaking 여부)
  - **문서 cliff** (README / CHANGELOG 의 사실 오류) → 0.1.1 docs patch 

cliff 발견 = _배포 직후 회귀_ 라 _가장 빠른 patch_ 우선.

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
