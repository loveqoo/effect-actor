# Plan — 마일스톤 인덱스

> _색인 + 게시판_. 각 마일스톤의 _현재 상태_ 를 한눈에.
> 자세한 내용은 다른 문서(API, ARCHITECTURE)를 참조하고, 여기는 _진행 상황_ 만.
>
> _2026-05-09 plan-eng-review 결과 반영. ADR-016~026 박힘._

---

## 한눈에

| 마일스톤 | 상태 | 목표 |
|---|---|---|
| M0. 정보 모으기 | 🟢 완료 | docs/ 묶음 작성. AGENTS.md 색인 |
| M1. 최소 동작 + setup | 🟡 진행 중 | spawn / tell / receive + setup (Stable ref + Mailbox 분리) |
| M2. Lifecycle | ⚪ 대기 | PostStop + 도그푸딩 시작 (ADR-024) |
| M3. Stop + Watch | ⚪ 대기 | ctx.stop / watch / Terminated / ChildFailed |
| M4. Restart | ⚪ 대기 | Supervision strategies (resume/restart/stop) |
| M5. 고급 기능 | ⚪ 대기 | Backoff / withLimit / Stash / Timer |
| M∞. 본격 도그푸딩 + 출시 | ⚪ 대기 | poly-phony 본격 사용 → npm publish |

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
- [x] `/plan-eng-review` — 2026-05-09 (ADR-016~026 박힘. ARCHITECTURE 모순 해결)

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

**마일스톤 완료 조건 (DoD):**
- [x] _ARCHITECTURE 모순 없음_ — ADR-016~026 모두 반영 (2026-05-09 plan-eng-review)
- [ ] `examples/01-counter.ts` — 단순 카운터 액터 + setup, `tsx` 로 실행 시 정상 출력
- [ ] EffectTS Tagged Error 패턴 도입 (`ActorNotFound`, `IncarnationMismatch` — ADR-012, ADR-016)
- [ ] tell hot path 가 cell direct (ADR-019)
- [ ] STM tx 로 Registry/spawn/stop 정합성 (ADR-017)

**진행 중인 사이클:**
- 🟢 사이클 0 — 툴체인 셋업 (ADR-027): pnpm + ESM + TS5 strict + vitest + tsx
- 🟢 사이클 1 — 핵심 자료구조 (ActorPath, Signal/WatchKey/WatchMessage, Cell, Errors, ActorEntry, Registry, ActorRef identity) + 39 테스트
- 🟢 사이클 2 — Behavior ADT (Same/Stopped/Empty/Unhandled/Receive/Setup/WithMailbox) + Behaviors 빌더 + unwrapMeta (ADR-026 sync 메타 추출) + 13 테스트 (TDD Red→Green→Refactor)
- 🟢 사이클 3 — ActorContext (self/system) + interpretStep + runInterpreter (Setup 평가 + message loop + Stopped 종료) + Supervision 외피 default stop (ADR-020 catchAllCause) + 16 테스트
- 🟢 사이클 4 — ActorSystem<RootMsg> (root only spawn) + ActorRef class + system.tell (STM uid 검증) + system.shutdown (Scope.close + Fiber.await) + 6 통합 테스트
- 🟡 사이클 5 — examples/01-counter.ts 동작 + ctx.spawn (자식) + 통합 테스트 + M1 DoD 검증

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
- [ ] `examples/02-lifecycle.ts` — setup + PostStop 로 자원 초기화/정리하는 액터
- [ ] **도그푸딩 시작 (~1주, ADR-024)** — poly-phony 에서 한 agent 만들어보기. M1~M2 토대 검증 (incarnation/cell ref/Scope/STM/setup/PostStop). 발견된 issue 는 LEARNINGS.md + 후속 사이클 입력.

---

## M3. Stop + Watch

**이 시점에 사용자가 할 수 있는 것:**
- `ctx.stop(child)` 로 자식 종료
- `ctx.watch(other)` / `watchWith` 로 다른 액터 감시 (ADR-022)
- Terminated / ChildFailed 신호 처리
- ask 패턴 사용

**포함:**
- `ctx.stop`
- `ctx.watch` / `ctx.watchWith` / `ctx.unwatch` (TMap<{path, uid}, WatchMessage> 양방향 — ADR-022)
- Signal 확장: `Terminated`, `ChildFailed`
- DeathPact (미처리 시 자살)
- ask 패턴 (임시 actor + Deferred + timeout — ask temp actor 의 instance Scope 자기 소유 — ADR-021)
- 부모-자식 cascade stop

**도전 과제:**
- watchKey (path, uid) 인스턴스 비교 정확성 (ADR-016, ADR-022)
- ask 의 임시 actor 명명 / 정리 보장 (ADR-021 Scope)
- ChildFailed 의 cause 표현 (EffectTS Cause<E> 그대로 노출?)

**마일스톤 완료 조건 (DoD):**
- [ ] `examples/03-watch.ts` — 자식 감시하는 부모. ABA 안전성 (재spawn 후 옛 watcher 잘못된 Terminated 안 받음) 검증
- [ ] `examples/04-ask.ts` — ask 패턴 + timeout
- [ ] **M3 끝 도그푸딩 (~1주, ADR-024)** — watch + ask 조합 의미 검증.

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

**마일스톤 완료 조건 (DoD):**
- [ ] `examples/05-restart.ts` — restart 시 ref 안정성 + mailbox 보존 + Scope 자동 정리 검증
- [ ] **M4 끝 도그푸딩 (~1주, ADR-024)** — supervision 의미 검증.

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

**마일스톤 완료 조건 (DoD):**
- [ ] `examples/06-backoff.ts` — restartWithBackoff
- [ ] `examples/07-stash.ts` — withStash
- [ ] `examples/08-timer.ts` — withTimers
- [ ] **M5 끝 _본격_ 도그푸딩 (ADR-024)** — poly-phony 전면 도그푸딩 시작.

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
- **semver 정책 확정** (현재 미정 — F6 결정에 따라 M∞ 직전에 ADR 로 박음. 후보: `0.x = minor 가 breaking, patch 는 fix-only / 1.0+ = SemVer`)
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

전부 결정되어 **ADR-016 ~ ADR-026** 으로 박힘.

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
- ADR-016~026 박힘으로 _ARCHITECTURE 모순_ 없음 → M1 진입 안전.
- M2 끝 도그푸딩 시작 (ADR-024) 으로 토대 검증 _이른 시점_.

**처리된 결정 (모든 세션):**

_plan-devex-review (2026-05-08):_
- F1: 스케치 README 지금 (✅ README.md 작성)
- F3: M1부터 examples/ 동작 (✅ ADR-011)
- F4: 디버그 모드 placeholder만 (✅ ARCHITECTURE.md §4.4, ADR-013)
- F5: 에러 종류 ARCHITECTURE에, 어휘 사이클별 (✅ ADR-012)
- F6: semver M∞ 직전 (✅ M∞ 노트)

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
| Eng Review | `/plan-eng-review` | 아키텍처 & 테스트 (필수) | 1 | clean | ADR-016~026 박힘. 20개 결정 모두 처리 (round 1 + 2 outside voice). M1 진입 안전. |
| Design Review | `/plan-design-review` | UI/UX (해당 없음, 라이브러리) | 0 | n/a | n/a |
| DX Review | `/plan-devex-review` | 개발자 경험 | 1 | issues_found | overall 3.9/10 → 5.7 (예상). Critical 5개 plan-eng-review 로 이관. F1-F6 처리됨. |
| Outside Voice (Codex) | `/codex review` (plan-eng-review 안) | 독립 plan 검증 | 1 | issues_found→resolved | round 2 에서 10개 새 발견 모두 결정. |

- **OUTSIDE VOICE (Codex):** 2회 실행 (round 1 plan-devex-review, round 2 plan-eng-review). 총 20개 발견 모두 ADR 박힘.
- **CROSS-MODEL:** Codex 와 Claude 발견은 _상충 X, 보완_ — Claude 는 DX/표면 (README, examples, 에러 어휘), Codex 는 아키텍처 근본 + 결정 교차 검증.
- **UNRESOLVED:** 0 (모두 결정).
- **VERDICT:** **CLEARED** — Eng Review (plan) 1회 clean. M1 진입 가능. _ARCHITECTURE 모순 없음._
