# Plan — 마일스톤 인덱스

> _색인 + 게시판_. 각 마일스톤의 _현재 상태_ 를 한눈에.
> 자세한 내용은 다른 문서(API, ARCHITECTURE)를 참조하고, 여기는 _진행 상황_ 만.
>
> _2026-05-09 plan-eng-review 결과 반영. ADR-016~026 정해짐._

---

## 한눈에

| 마일스톤 | 상태 | 목표 |
|---|---|---|
| M0. 정보 모으기 | 🟢 완료 | docs/ 묶음 작성. AGENTS.md 색인 |
| M1. 최소 동작 + setup | 🟢 완료 | spawn / tell / receive + setup + ctx.spawn (Stable ref + Mailbox 분리). 77 테스트, examples/01 동작. |
| M2. Lifecycle | 🟢 완료 | receiveSignal + signal 우선 폴링 + PostStop hook (자동 + 외부 emit). 99 테스트, examples/02 동작. 도그푸딩 _시작_ 단계. |
| M3. Stop + Watch + Ask | 🟢 완료 | ctx.stop graceful cascade + watch/watchWith/unwatch + watchTerminated + ask + ChildFailed + DeathPact. examples/03,04 동작. |
| M3.1. spawn race fix | 🟢 완료 | 도그푸딩 #2 사이클 5 발견 → 두 layer fix: (a) Deferred latch happens-before, (b) Effect 3.21.2 TMap.remove 본체 버그 우회 (TRef<HashMap>). 118 테스트, consumer 측 9ms / 5회 flake-free 검증 완료. |
| M4. Restart | 🟢 완료 | Supervision (resume/restart/stop) + 매처 헬퍼 + Scope 분리 (ADR-035). 사이클 1~5 코드 + M4 끝 도그푸딩 #3 (5 사이클 / 4 finding) + M4.1 환류 (F1 + 의제 1+2 한 번에 fix) + consumer 측 25회 flake-free 재검증. 161 테스트, examples/01~05 동작. |
| M5. 고급 기능 | 🟢 완료 | Backoff / withLimit / Stash / Timer + examples 06~08 + Effect 밖 throw 안전망. ADR-037~040. 201 테스트. **도그푸딩 #4 통과 — finding 0, 회귀 0, 5×3=15회 flake-free.** |
| M∞. 출시 | 🟡 진행 중 | npm 배포 직전. (a) ✅ semver ADR-041 / (b) ✅ 영어 README + CHANGELOG + CONTRIBUTING / (c) ✅ 빌드 도구 ADR-042 / (d) TMap PR / (e) 0.1.0 배포 / (f) codex review / (g) ✅ 자체 점검 (잔재 0, dead 0, JSDoc 0건만 후속 후보) |

상태 표기: 🟢 완료 · 🟡 진행 중 · 🔴 막힘 · ⚪ 대기

---

## M0. 정보 모으기 — 문서 작성

> 사이클이 시작되기 _전_ 의 준비 단계.

- [x] `docs/AKKA_REFERENCE.md` — Akka Typed 핵심 정리
- [x] `docs/ARCHITECTURE.md` — 내부 런타임 모델 (2026-05-09 plan-eng-review 반영)
- [x] `docs/API.md` — 사용자 API 시안
- [x] `docs/DECISIONS.md` — ADR 기록 (ADR-001~026)
- [x] `docs/PLAN.md` — 이 문서
- [x] `docs/LEARNINGS.md` — 사이클 학습 누적
- [x] `AGENTS.md` + `CLAUDE.md` — AI 진입점 색인

이 단계가 끝나면 _계획 리뷰_ 단계로 넘어간다.

- [x] `/plan-devex-review` — 2026-05-08 (DX SCORECARD 작성)
- [x] `/plan-eng-review` — 2026-05-09 (ADR-016~026 정해짐. ARCHITECTURE 모순 해결)

---

## M1. 최소 동작 — Stable ref + Mailbox 분리 + setup

**이 시점에 사용자가 할 수 있는 것:**
- `ActorSystem.create<RootMsg>(behavior, "name")` 으로 시스템 만들기 (ADR-026)
- `system.root.tell(msg)` 로 root 액터에 메시지 보내기
- 메시지 받아서 다음 Behavior 반환
- `Behaviors.setup` 으로 자원 초기화 (ADR-025)

**포함:**
- `ActorPath` / `ActorRef<Msg>` (path + uid + cell + system — ADR-016, ADR-019)
- `Cell<Msg>` (mailbox + signalQueue, EffectTS Queue)
- `ActorEntry` — Cell + children/watchers/watching/fiber/status/scope (TRef/TMap, STM — ADR-017)
- `Registry` (TMap path → entry, STM tx)
- `Behavior<Msg>` ADT + 해석기 + Supervision 외피 (ADR-020)
- `Behaviors.receive` / `.receiveMessage` / `.same` / `.stopped` / `.setup`
- `Behaviors.withMailbox` (ADR-018, ADR-026)
- `ActorContext.spawn` / `ctx.self`
- `ActorSystem<RootMsg>.create` / `ActorSystem.shutdown`
- Instance Scope (per actor — ADR-021)

**일부러 제외:**
- supervision (M4에서)
- watch / Terminated (M3에서)
- ask 패턴 (M3 또는 M5에서. 임시 actor spawn이 의존)
- PostStop (M2에서 — ADR-021 cleanup 우선순위 명시)

**도전 과제:**
- Spawn 의 0단계 (메타 추출) 구현 (ADR-026)
- Tell hot path (cell direct + STM read-only tx) (ADR-019)
- Instance Scope 시작/종료 — ctx.fork 가 그 Scope 안 (ADR-021)
- ActorSystem<RootMsg> generic 추론 (ADR-026)
- ctx 전달 방식 확정 (ADR-007 잠정)
- Fiber lifecycle 과 entry status 동기화 (TRef)

**마일스톤 완료 조건 (DoD) — 모두 충족 ✅:**
- [x] _ARCHITECTURE 모순 없음_ — ADR-016~026 모두 반영 (2026-05-09 plan-eng-review)
- [x] `examples/01-counter.ts` — 단순 카운터 액터 + setup + ctx.spawn, `pnpm tsx` 실행 시 "current count: 3" 출력
- [x] EffectTS Tagged Error 패턴 도입 (`ActorNotFound`, `IncarnationMismatch`, `MailboxFull` — ADR-012, ADR-016)
- [x] tell hot path 가 cell direct (ADR-019) — ActorRef.cell 직접, system.tell STM read-only tx + cell.mailbox.offer
- [x] STM tx 로 Registry/spawn/stop 정합성 (ADR-017) — spawnInternal 의 Entry+Registry+children 한 트랜잭션

**완료된 사이클:**
- 🟢 사이클 0 — 툴체인 셋업 (ADR-027): pnpm + ESM + TS5 strict + vitest + tsx
- 🟢 사이클 1 — 핵심 자료구조 (ActorPath, Signal/WatchKey/WatchMessage, Cell, Errors, ActorEntry, Registry, ActorRef identity) + 39 테스트
- 🟢 사이클 2 — Behavior ADT + Behaviors 빌더 + unwrapMeta (ADR-026 sync 메타 추출) + 13 테스트 (TDD 첫 적용)
- 🟢 사이클 3 — ActorContext (self/system) + interpretStep + runInterpreter (Setup 평가 + message loop + Stopped 종료) + Supervision 외피 default stop (ADR-020 catchAllCause) + 16 테스트
- 🟢 사이클 4 — ActorSystem<RootMsg> (root only spawn) + ActorRef class + system.tell (STM uid 검증) + system.shutdown (Scope.close + Fiber.await) + 6 통합 테스트
- 🟢 사이클 5 — ctx.spawn (자식) + spawnInternal 일반화 (root + child 공통 STM tx) + examples/01-counter.ts 동작 + index.ts 사용자 표면 정리. 누적 77 테스트.

---

## M2. Lifecycle — PostStop + 도그푸딩 시작

**이 시점에 사용자가 할 수 있는 것:**
- PostStop 신호로 _명시_ cleanup hook (ADR-021 — 자동 cleanup 은 instance Scope 가)
- `Behaviors.receiveSignal` 로 신호 처리

**포함:**
- `Behaviors.receiveSignal` 빌더
- Signal: `PostStop` (M3에서 Terminated 추가)
- SignalQueue + take 우선순위 (ADR-009)

**도전 과제:**
- setup 이 _최초 1회_ 만 실행되는지, _restart마다_ 다시 실행되는지 명세 (Akka 는 restart 마다, ADR-021 도)
- PostStop vs instance Scope 자동 cleanup 의 우선순위 — ARCHITECTURE.md §3.8 명시 (ADR-021)
- DeathPact 정책 (Terminated 미처리 시 자기도 실패) 의 _signal 검출 로직_ — M3까지 미룸

**마일스톤 완료 조건 (DoD):**
- [x] `examples/02-lifecycle.ts` — setup + PostStop 로 자원 초기화/정리하는 액터 (counter + 마지막 값 PostStop 보고)
- [x] **도그푸딩 #1 + #2 완료 (ADR-024)** — #1 = 4 결정 입력 (ADR-028~031). #2 = 5 사이클 / 9 테스트 / 1 BUG 발견 (spawn race). 토대 검증 통과, 후속 사이클 입력 누적.

**완료된 사이클:**
- 🟢 사이클 1 — `Behaviors.receive(...).receiveSignal(...)` fluent 빌더 + `ReceiveBehavior<Msg>` ADT (onSignal 필드) + 6 테스트
- 🟢 사이클 2 — `interpretSignalStep` + `messageLoop` signal 우선 폴링 (Queue.poll + Effect.race) + 8 테스트
- 🟢 사이클 3 — PostStop 자동 emit (_lastActive_ 추적, 자발 Stopped + 외부 PostStop 양 케이스) + `system.shutdown` 의 PostStop offer 흐름 + 8 테스트
- 🟢 사이클 4 — `examples/02-lifecycle.ts` (setup + PostStop) 동작 + DoD 4/5 충족 (도그푸딩 _시작_ 은 사용자 측)

---

## M3. Stop + Watch + Ask

> _2026-05-09 도그푸딩 #1 입력 반영 → ADR-028~031 추가._

**이 시점에 사용자가 할 수 있는 것:**
- `ctx.stop(child)` 로 자식 종료 — _graceful_ (자식 cascade + PostStop 호출, ADR-031)
- `ctx.watch(other)` / `watchWith` 로 다른 액터 감시 (ADR-022)
- `ctx.watchTerminated(other): Effect<void>` 로 _Effect 형태 termination await_ (ADR-030)
- Terminated / ChildFailed 신호 처리
- `ref.ask(make, timeout): Effect<Resp, AskTimeout>` 또는 `ctx.ask(target, make, timeout)` — Akka 정통 untyped err (ADR-029)

**포함:**
- `ctx.stop` (graceful cascade — ADR-031)
- `ctx.watch` / `ctx.watchWith` / `ctx.unwatch` (TMap<{path, uid}, WatchMessage> 양방향 — ADR-022)
- `ctx.watchTerminated(other)` — Effect 형태 노출 (ADR-030)
- Signal 확장: `Terminated`, `ChildFailed`
- DeathPact (미처리 시 자살)
- ask 패턴 (임시 actor + Deferred + timeout — ask temp actor 의 instance Scope 자기 소유 — ADR-021, ADR-029)
- shutdown 흐름 graceful 갱신 (ADR-031: 자식 cascade + PostStop hook 호출 + Fiber.await)

**도전 과제:**
- ctx.stop 의 _children TRef 순회_ + Fiber.awaitAll 합성 — STM 안에서 children 스냅샷 후 순회
- watchKey (path, uid) 인스턴스 비교 정확성 (ADR-016, ADR-022)
- ask 의 임시 actor 명명 (`$ask-N` 같은 자동 부여) + 정리 보장 (ADR-021 Scope)
- ask 의 임시 actor 가 `Deferred` 에 응답 set, fiber 가 await — Effect.race(Deferred.await, sleep(timeout))
- ChildFailed 의 cause 표현 (EffectTS Cause<E> 그대로 노출?)

**마일스톤 완료 조건 (DoD) — 모두 충족 ✅:**
- [x] `examples/03-watch.ts` — watchWith + ctx.stop graceful (자식 종료 알림 + 메시지 채널)
- [x] `examples/04-ask.ts` — ask 패턴 + AskTimeout 캐치
- [x] `ctx.stop` 의 graceful cascade 동작 (자식 PostStop 호출 검증, ADR-031)
- [x] DeathPact 검출 (watch + Unhandled Terminated → fail → 부모 ChildFailed 연쇄, ADR-022)
- [x] **M3 끝 도그푸딩 (ADR-024)** — 도그푸딩 #2 5 사이클 완료. wrapper 3종 (typed err / Stream pass-through / watch+ask race) 검증, factory 패턴 표준 확정, spawn race BUG 발견 → M3.1 환류로 fix.
- [x] **M3.1 사이클 1 — spawn race fix** — 두 layer fix 완료, consumer 측 9ms / 5회 flake-free 재검증.

**완료된 사이클:**
- 🟢 사이클 1 — `ctx.stop(child)` graceful cascade (ADR-031): stopActor 재사용 가능 helper, sys.shutdown 도 같은 흐름. 4 테스트
- 🟢 사이클 2 — `ctx.watch / watchWith / unwatch` (ADR-022) + Terminated signal: 양방향 TMap, ABA 안전 검증. 4 테스트
- 🟢 사이클 3 — `ctx.watchTerminated(other): Effect<void>` (ADR-030): WatchMessage 의 Deferred case 추가, 임시 actor 우회 안 함. 2 테스트
- 🟢 사이클 4 — `ctx.ask` (ADR-029): 임시 actor + Deferred + Effect.timeoutFail. typed err wrapper 패턴 검증. 3 테스트
- 🟢 사이클 5 — ChildFailed signal + DeathPact: runInterpreter 의 onFailure hook + interpretSignalStep 의 unhandled 검출. 3 테스트
- 🟢 사이클 6 — `examples/03-watch.ts` + `examples/04-ask.ts` + USAGE.md 갱신. 누적 115 테스트.

**M3.1 사이클 (도그푸딩 #2 환류):**
- 🟢 사이클 1 — spawn happens-before contract (Deferred latch) + sibling LIFO cascade (Chunk) + Effect 3.21.2 `TMap.remove` 본체 버그 우회 (TRef<HashMap>). ADR-031 보강 절 3개. 누적 118 테스트. 사용자 표면 변경 0.

**M3 _전체_ DoD 확정 (2026-05-09):** 코드 + 도그푸딩 + 환류 fix + 재검증 모두 충족.

---

## M4. Restart — Supervision

**이 시점에 사용자가 할 수 있는 것:**
- `Behaviors.supervise(b).onFailure(E, Strategies.restart)` 로 재시작 정책 부착
- resume / restart / stop strategy 사용
- 예외 타입별 분기

**포함:**
- `Behaviors.supervise` 빌더 (Behavior 래퍼 — ADR-026 메타 추출)
- `Strategies.resume` / `restart` / `stop`
- Restart 흐름 (ADR-020):
  - Supervision 외피의 catchAll
  - PreRestart 신호 (현재 Behavior 가 receiveSignal 처리)
  - 자식 cascade stop
  - Instance Scope 닫고 새로 (ADR-021 — fork/timer/scoped resource 자동 정리)
  - Setup 재실행 → 새 Behavior
  - 새 Fiber 로 해석 루프 재시작
  - mailbox 보존 (cell 인스턴스 동일)
- Error matcher (예외 타입 분기)

**도전 과제:**
- _Stable ref_ 가 진짜로 동작함을 검증 — 외부에서 보낸 메시지가 restart 도중 mailbox 에 쌓였다가 새 fiber 에서 처리되는지
- Supervise wrapping 의 nested 처리 (여러 onFailure chain)
- PreRestart 처리 도중 재실패 → 정책 재적용 (강도 제한)

**마일스톤 완료 조건 (DoD) — 모두 충족 ✅:**
- [x] `examples/05-restart.ts` — restart 시 ref 안정성 + mailbox 보존 + Scope 자동 정리 검증 (사이클 5)
- [x] **M4 끝 도그푸딩 (~1주, ADR-024)** — poly-phony 측 5 사이클 완료. 핵심 약속 9개 중 ✅ 8 + ⚠️ 1, 의제 1·2 노출 확정 + F1 신규 BUG (sys.shutdown hang when watchWith). 환류 fix → M4.1.
- [x] **M4.1 환류 fix + 재검증** — 4개 finding (F1 + 의제 1 + 의제 2 + F2) 모두 closed, consumer 측 5 사이클 × 5회 = 25회 flake-free.

**완료된 사이클:**
- 🟢 사이클 1 — Strategy ADT (`Resume` / `Restart` / `Stop`) + `Behaviors.supervise(b).onFailure(matcher, strategy)` fluent 빌더 + `unwrapMeta` 두 종류 래퍼 추출 (ADR-034). 10 테스트
- 🟢 사이클 2 — `Strategies.resume` step-level supervision (messageLoop 의 `Effect.exit` + `pickStrategy`). PostStop 은 supervision 밖. 10 테스트
- 🟢 사이클 3 — `Strategies.restart` + PreRestart 신호 + Setup 재실행 + 자식 cascade + Scope 분리 (ADR-035 cellScope/instanceScope). 8 테스트
- 🟢 사이클 4 — Error matcher 헬퍼 (`matchInstance` / `matchTag` / `matchAll` / `matchPredicate`) + sequential 순회 약정. 4 테스트
- 🟢 사이클 5 — `examples/05-restart.ts` + 발견 의제 정리. 4 테스트. 누적 154 테스트.

**M4.1 환류 사이클 (도그푸딩 #3 결과 fix):**
- 🟢 사이클 1 — F1 (sys.shutdown hang when watchWith): self-loop watcher 알림 시 status 체크 추가 (죽어가는 watcher skip). 1112ms timeout → 111ms 정상 종료.
- 🟢 사이클 2 — 의제 1+2 (자발 stop / supervisor stop 강등 시 PostStop+watcher 통합): `onSelfTermination` 콜백 도입, `stopActor` 의 cleanup 부분을 단일 source of truth 로 통합. ADR-036. 4 테스트 (총 161).
- 🟢 사이클 3 — poly-phony 측 재검증 (5 사이클 × 5회 = 25회 flake-free, 4개 finding 모두 closed, 회귀 0). M4 _전체_ DoD 🟢.

**M4 _전체_ DoD 확정 (2026-05-09):** 코드 + 도그푸딩 + 환류 fix + 재검증 모두 충족. 161 테스트.

**M5 로 미룸 (ADR-037 후보):**
- 의제 3 (PreRestart 재실패) — restart-cleanup 정책 + withLimit 와 묶음
- matchTag 본격 검증 — agent layer BackendError ADT 매처 chain
- 자발 Stopped 후 cellScope 누수 / 자식 cascade — _stop/cleanup 경로 정합성_ 패밀리. M5 끝 본격 도그푸딩에서 표면 빈도 보고 ADR-037 박을지 결정.

---

## M5. 고급 기능

**이 시점에 사용자가 할 수 있는 것:**
- `restartWithBackoff` (점진적 재시도)
- `withLimit` (재시도 한도 → stop으로 강등)
- `withStash` (메시지 보류)
- `withTimers` (스케줄링)

**포함:**
- `Strategies.restartWithBackoff(opts)` (Schedule 기반)
- `.withLimit({ maxNrOfRetries, withinTimeRange })`
- `Behaviors.withStash` + `Stash` 인터페이스 (instance Scope — ADR-021)
- `Behaviors.withTimers` + `Timers` 인터페이스 (instance Scope)
- `ctx.scheduleOnce`

**도전 과제:**
- Backoff schedule 이 mailbox 보존과 충돌하지 않는지
- Stash 용량 초과 시 supervision 으로 흘리는 흐름
- Timer 가 액터 stop 시 자동 정리 (instance Scope 닫힘 — ADR-021)

**마일스톤 완료 조건 (DoD) — 모두 충족 ✅:**
- [x] `examples/06-backoff.ts` — restartWithBackoff (사이클 5)
- [x] `examples/07-stash.ts` — withStash (사이클 5)
- [x] `examples/08-timer.ts` — withTimers (사이클 5)
- [x] **M5 끝 _본격_ 도그푸딩 (ADR-024)** — poly-phony #4 통과. 5 사이클 × 3회 = 15회 flake-free, finding 0, 회귀 0. consumer 시점 표면 거친 부분 없음.

**완료된 사이클:**
- 🟢 사이클 1 — `Strategies.restart.withLimit({ maxNrOfRetries, withinTimeRange })` + 의제 3 (PreRestart 재실패 → stop 강등) 통합. ADR-037 박음. `RestartLimitExceeded` tagged error 추가. 누적 169 테스트, 5회 flake-free.
- 🟢 사이클 2 — `Strategies.restartWithBackoff({ minBackoff, maxBackoff, randomFactor })` + `.withLimit` chain. `messageLoop` restart 분기에 backoff sleep 단계 추가. `restartHistory` 카운터를 한도 + backoff 둘 다 공유. ADR-038. 누적 182 테스트, 5회 flake-free.
- 🟢 사이클 3 — `Behaviors.withTimers` (setup 위 헬퍼) + `ctx.fork` (instance scope 안 fork) + `ctx.scheduleOnce`. `Timers` 인터페이스 (startSingle/FixedDelay/cancel/cancelAll/isActive). `evaluateInitial` setup chain loop. `notifyWatchersOnSelfTermination` 의 instanceScope close (자발 Stopped 시 timer 자동 cleanup). ADR-039. 누적 191 테스트, 5회 flake-free.
- 🟢 사이클 4 — `Behaviors.withStash` (setup 위 헬퍼, 사이클 3 패턴) + `Stash` 인터페이스 (stash/unstashAll/clear/size/isFull/isEmpty) + `StashOverflow` Tagged error. `unstashAll(next)` 가 `interpretStep` 직접 적용 (Akka 정통 순서 보장). 부가 발견: _Effect 밖 throw_ 가 supervision 통과 X — 별도 fix 후보. ADR-040. 누적 197 테스트, 5회 flake-free.
- 🟢 사이클 5 — `examples/06-backoff.ts` + `07-stash.ts` + `08-timer.ts` + USAGE.md 갱신 (M5 표면 표 + Errors + 안 되는 것 정리). 모두 `pnpm tsx` 실행 검증. M5 _코드_ DoD 충족.
- 🟢 미니 사이클 — _Effect 밖 throw_ 안전망 (interpretStep / interpretSignalStep 의 Effect.suspend wrap). ADR-040 후속 resolved. 누적 201 테스트.

**M5.1 환류 사이클 (도그푸딩 #4 결과):**
- 🟢 사이클 1 (가이드 작성) — `docs/DOGFOODING.md` 박음.
- 🟢 사이클 2 (도그푸딩 진행) — poly-phony 측 5 사이클 × 3회 모두 통과. _finding 0, 회귀 0, 환류 fix 불요._

**M5 _전체_ DoD 확정 (2026-05-09):** 코드 + examples + 도그푸딩 #4 통과 + 안전망 (Effect 밖 throw fix). 201 테스트.

---

## M∞. 본격 도그푸딩 + 출시

**이 시점에 사용자가 할 수 있는 것:**
- poly-phony에서 `@loveqoo/effect-actor` import 해서 실제 Agent 구축
- npm publish

**포함:**
- poly-phony 에서 진짜 사용
- 발견된 API 어색함 → 본 레포에서 수정 → minor 버전 갱신
- `setup-deploy` 셋업 (npm publish 흐름)
- `/ship` / `/land-and-deploy` 흐름 적용
- 0.1.0 첫 배포

**도전 과제:**
- npm 패키지 이름 결정 (`@loveqoo/effect-actor` 후보)
- 첫 배포 직전 `/devex-review`, `/codex review`, `/health` 통과
- README / CHANGELOG / docs 영어판 (비공식적으로는 한국어 docs 그대로, 영어 README 별도)
- **semver 정책** — ✅ ADR-041 박음 (M∞ 사이클 a). 0.x = minor breaking + patch fix, 1.0+ = SemVer 표준 + 한 minor warning deprecation. 1.0 진입 조건 = 배포 후 1주 안정 + 외부 issue 1라운드.
- 영어 README 작성 (한국어 docs/ 그대로)
- CONTRIBUTING.md / ISSUE_TEMPLATE / PR template 추가

---

## 사이클 진입 규칙

각 마일스톤은 _여러 subset 사이클_ 로 쪼개진다. 사이클 단위:

```
플랜 → 개발 → 테스트 → 버그/수정 → /codex review → 사용자 리뷰 → 수정 → 커밋
```

한 사이클이 끝날 때:
- `LEARNINGS.md` 에 _새로 알게 된 사실_ 한 줄
- `ARCHITECTURE.md` / `API.md` 갱신 (필요 시)
- `DECISIONS.md` 에 _굳어진 결정_ 추가 (잠정 → 확정 갱신)
- 이 문서의 체크리스트 갱신
- 짧은 3줄 회고 (사용자와)

**M2/M3/M4 끝마다** _가벼운 도그푸딩 사이클_ (~1주, poly-phony agent — ADR-024). M5 끝 _본격_ 도그푸딩.

---

## 갱신 규칙

- 마일스톤 상태 표기 (🟢/🟡/🔴/⚪)는 사이클 끝마다 갱신.
- 마일스톤이 시작되면 _도전 과제_ 항목들이 사이클의 todo 후보가 된다.
- 마일스톤 _완료 정의(DoD)_ 가 모호하면 첫 사이클 시작 전에 명시화.

---

## OUTSIDE VOICE FINDINGS — 모두 결정 끝 (2026-05-09)

**Round 1 (2026-05-08, plan-devex-review)**: 10개 발견 (Critical 5, Important/Strategy 5).

**Round 2 (2026-05-09, plan-eng-review codex)**: 10개 발견 (Critical 4, Important/Strategy 6) — round 1 결정에 대한 교차 검증.

전부 결정되어 **ADR-016 ~ ADR-026** 으로 정해짐.

| Round | # | 발견 | 결정 ADR |
|---|---|---|---|
| R1 | OV-1 | ActorRef incarnation UID | ADR-016 |
| R1 | OV-2 | Supervision 외피 위치 | ADR-020 |
| R1 | OV-3 | Mailbox 정책 (unbounded 기본) | ADR-018 (ADR-008 supersedes) |
| R1 | OV-4 | Registry STM 트랜잭션 경계 | ADR-017 |
| R1 | OV-5 | Restart 시 cleanup scope | ADR-021 |
| R1 | OV-8 | watchWith 자료구조 | ADR-022 |
| R1 | OV-9 | Path lookup hot path | ADR-019 |
| R1 | OV-10 | narrow 타입 안전성 | ADR-023 |
| R1 | (ADR-014) | 도그푸딩 시점 | ADR-024 (ADR-004 supersedes) |
| R1 | (ADR-015) | M1 범위 | ADR-025 |
| R2 | OV2-1 | Watch key (path, uid) | ADR-022 (보강) |
| R2 | OV2-2 | Tell 선형화 (best-effort) | ADR-019 (보강) |
| R2 | OV2-3 | ARCHITECTURE invariant 정정 | ADR-020 (보강) |
| R2 | OV2-4 | Scope 소유권 표 | ADR-021 (보강, §3.7) |
| R2 | OV2-5 | Behavior 메타 추출 순서 | ADR-026 |
| R2 | OV2-6 | ActorSystem<RootMsg> 타입 | ADR-026 |
| R2 | OV2-7 | setup/PostStop 우선순위 | ADR-021 (보강, §3.8) |
| R2 | OV2-8 | STM vs 시스템 fiber | ADR-017 (재고 후 STM 유지) |
| R2 | OV2-9 | 도그푸딩 시점 재재고 | ADR-024 (M3 → M2 끝 시작) |
| R2 | OV2-10 | narrowUnsafe + adapter API 예제 | ADR-023 (보강) |

**M1 진입 시 _구조적 모순 없는_ 상태 보장.**

---

## DX SCORECARD (2026-05-08, plan-devex-review POLISH 모드)

```
+============================================================================+
|              DX PLAN REVIEW — SCORECARD                                     |
+============================================================================+
| Dimension            | 현재     | F1-F6+M1 후 | M5+M∞ 후                  |
|----------------------|----------|-------------|---------------------------|
| Getting Started      | 3/10     | 8/10        | 8/10                      |
| API/CLI/SDK 설계     | 7/10     | 8/10        | 9/10 (ADR-026 typed root) |
| Error Messages       | 2/10     | 6/10        | 8/10 (구체 어휘 확정)     |
| Documentation        | 7/10     | 8/10        | 8/10 (영어 README)        |
| Upgrade Path         | 3/10     | 3/10        | 7/10 (semver + CHANGELOG) |
| Dev Environment      | 4/10     | 8/10        | 8/10                      |
| Community            | 2/10     | 3/10        | 7/10 (CONTRIBUTING 등)    |
| DX Measurement       | 3/10     | 3/10        | 5/10                      |
+----------------------------------------------------------------------------+
| TTHW                 | N/A      | ~3 min      | ~3 min                    |
| Competitive Rank     | (no code)| Competitive | Competitive               |
| Magical Moment       | placeholder|README before/after | examples 동작 보강     |
| Product Type         | Library/SDK (TypeScript, EffectTS-based)            |
| Mode                 | POLISH                                              |
| Persona              | EffectTS 파워 유저, agent/AI 빌더                   |
| Overall DX           | 3.9/10   | 5.7/10      | 7.5/10                    |
+============================================================================+
| DX 원칙 커버리지 (F1-F6+M1 후 기준 + plan-eng-review 보강)                 |
| Zero Friction        | covered (스케치 README + examples/)                 |
| Learn by Doing       | covered (실행 가능 examples/)                       |
| Fight Uncertainty    | partial (에러 종류만, 구체 어휘는 사이클별)         |
| Opinionated + Escape | covered (Akka Typed 모양 + EffectTS escape)         |
| Code in Context      | covered (API.md 8개 예시 + adapter actor 추가)      |
| Magical Moments      | covered (M1 후 README before/after 등장)            |
+============================================================================+
```

**리뷰 결과 요약:**
- 현재 평균 ~3.9/10 → F1-F6+plan-eng-review 후 ~5.7/10 → M5+M∞ 후 ~7.5/10.
- ADR-016~026 정해짐으로 _ARCHITECTURE 모순_ 없음 → M1 진입 안전.
- M2 끝 도그푸딩 시작 (ADR-024) 으로 토대 검증 _이른 시점_.

**처리된 결정 (모든 세션):**

_plan-devex-review (2026-05-08):_
- F1: 스케치 README 지금 (✅ README.md 작성)
- F3: M1부터 examples/ 동작 (✅ ADR-011)
- F4: 디버그 모드 placeholder만 (✅ ARCHITECTURE.md §4.4, ADR-013)
- F5: 에러 종류 ARCHITECTURE에, 어휘 사이클별 (✅ ADR-012)
- F6: semver M∞ 직전 → ✅ ADR-041 (2026-05-09, M∞ 사이클 a)

_plan-eng-review round 1 (2026-05-09):_
- OV-1, 2, 3, 4, 5, 8, 9, 10 → ADR-016~023
- ADR-014 → ADR-024 (M3 끝 가벼운, round 2 에서 M2 끝으로 정정)
- ADR-015 → ADR-025

_plan-eng-review round 2 (2026-05-09):_
- OV2-1~10 → 위 ADR 보강 + ADR-026 신규

**미처리 결정:** 없음. M1 시작 가능.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 범위 & 전략 | 0 | — | — |
| Codex Review | `/codex review` | 독립 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | 아키텍처 & 테스트 (필수) | 1 | clean | ADR-016~026 정해짐. 20개 결정 모두 처리 (round 1 + 2 outside voice). M1 진입 안전. |
| Design Review | `/plan-design-review` | UI/UX (해당 없음, 라이브러리) | 0 | n/a | n/a |
| DX Review | `/plan-devex-review` | 개발자 경험 | 1 | issues_found | overall 3.9/10 → 5.7 (예상). Critical 5개 plan-eng-review 로 이관. F1-F6 처리됨. |
| Outside Voice (Codex) | `/codex review` (plan-eng-review 안) | 독립 plan 검증 | 1 | issues_found→resolved | round 2 에서 10개 새 발견 모두 결정. |

- **OUTSIDE VOICE (Codex):** 2회 실행 (round 1 plan-devex-review, round 2 plan-eng-review). 총 20개 발견 모두 ADR 정해짐.
- **CROSS-MODEL:** Codex 와 Claude 발견은 _상충 X, 보완_ — Claude 는 DX/표면 (README, examples, 에러 어휘), Codex 는 아키텍처 근본 + 결정 교차 검증.
- **UNRESOLVED:** 0 (모두 결정).
- **VERDICT:** **CLEARED** — Eng Review (plan) 1회 clean. M1 진입 가능. _ARCHITECTURE 모순 없음._
