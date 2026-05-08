# Plan — 마일스톤 인덱스

> _색인 + 게시판_. 각 마일스톤의 _현재 상태_ 를 한눈에.
> 자세한 내용은 다른 문서(API, ARCHITECTURE)를 참조하고, 여기는 _진행 상황_ 만.

---

## 한눈에

| 마일스톤 | 상태 | 목표 |
|---|---|---|
| M0. 정보 모으기 | 🟢 완료 | docs/ 묶음 작성. AGENTS.md 색인 |
| M1. 최소 동작 | ⚪ 대기 | spawn / tell / receive (Stable ref + Mailbox 분리) |
| M2. Lifecycle | ⚪ 대기 | setup / PostStop / PreRestart 신호 |
| M3. Stop + Watch | ⚪ 대기 | ctx.stop / watch / Terminated / ChildFailed |
| M4. Restart | ⚪ 대기 | Supervision strategies (resume/restart/stop) |
| M5. 고급 기능 | ⚪ 대기 | Backoff / withLimit / Stash / Timer |
| M∞. 도그푸딩 + 출시 | ⚪ 대기 | poly-phony에서 본격 사용 → npm publish |

상태 표기: 🟢 완료 · 🟡 진행 중 · 🔴 막힘 · ⚪ 대기

---

## M0. 정보 모으기 — 문서 작성

> 사이클이 시작되기 _전_ 의 준비 단계.

- [x] `docs/AKKA_REFERENCE.md` — Akka Typed 핵심 정리
- [x] `docs/ARCHITECTURE.md` — 내부 런타임 모델
- [x] `docs/API.md` — 사용자 API 시안
- [x] `docs/DECISIONS.md` — ADR 기록
- [x] `docs/PLAN.md` — 이 문서
- [x] `docs/LEARNINGS.md` — 빈 셸
- [x] `AGENTS.md` + `CLAUDE.md` — AI 진입점 색인

이 단계가 끝나면 _계획 리뷰_ 단계(`/plan-devex-review`, `/plan-eng-review`)로 넘어간다.

---

## M1. 최소 동작 — Stable ref + Mailbox 분리

**이 시점에 사용자가 할 수 있는 것:**
- `ActorSystem.create(behavior, "name")` 으로 시스템 만들기
- root 액터에 메시지 보내기 (`tell`)
- 메시지 받아서 다음 Behavior 반환

**포함:**
- `ActorPath` / `ActorRef[Msg]` (path 기반 핸들)
- `Registry` — path → ActorEntry
- `ActorEntry` — Mailbox(Queue<Msg>) + Children(Ref<Set>) + Status(Ref)
- `Behavior<Msg>` ADT + 해석기
- `Behaviors.receive` / `Behaviors.receiveMessage` / `Behaviors.same` / `Behaviors.stopped`
- `ActorContext.spawn` / `ctx.self`
- `ActorSystem.create` / `ActorSystem.shutdown`

**일부러 제외:**
- supervision (M4에서)
- watch / Terminated (M3에서)
- ask 패턴 (M3 또는 M5에서. 임시 actor spawn이 의존)
- setup / signal (M2에서)

**도전 과제:**
- ctx 전달 방식 확정 (ADR-007 잠정)
- Mailbox 정책 (capacity, backpressure) 확정 (ADR-008 잠정)
- Fiber lifecycle과 entry status 동기화

**마일스톤 완료 조건 (DoD):** _ADR-011 적용._
- [ ] `examples/01-counter.ts` — 단순 카운터 액터, `tsx` 로 실행 시 정상 출력
- [ ] EffectTS Tagged Error 패턴 도입 (`ActorNotFound` 정의 — _ADR-012_)
- [ ] _Outside Voice 발견(OV-1, 2, 4, 5, 8) 모두 plan-eng-review 에서 결정 끝났음_

> ⚠️ **M1 진입 전 결정 필요:** ADR-014 (도그푸딩 시점), ADR-015 (M1 범위 확장 여부). plan-eng-review 세션에서 처리.

---

## M2. Lifecycle

**이 시점에 사용자가 할 수 있는 것:**
- `Behaviors.setup` 으로 초기화 작업
- PostStop 신호로 자원 정리

**포함:**
- `Behaviors.setup`
- `Behaviors.receiveSignal` 빌더
- Signal: `PostStop` (M3에서 Terminated 추가)
- SignalQueue + take 우선순위 (ADR-009)

**도전 과제:**
- setup 이 _최초 1회_ 만 실행되는지, _restart마다_ 다시 실행되는지 명세 (Akka는 restart마다)
- DeathPact 정책 (Terminated 미처리 시 자기도 실패) 의 _signal 검출 로직_ — M3까지 미룸

---

## M3. Stop + Watch

**이 시점에 사용자가 할 수 있는 것:**
- `ctx.stop(child)` 로 자식 종료
- `ctx.watch(other)` / `watchWith` 로 다른 액터 감시
- Terminated / ChildFailed 신호 처리
- ask 패턴 사용

**포함:**
- `ctx.stop`
- `ctx.watch` / `ctx.watchWith` / `ctx.unwatch`
- Signal 확장: `Terminated`, `ChildFailed`
- DeathPact (미처리 시 자살)
- ask 패턴 (임시 actor + Deferred + timeout)
- 부모-자식 cascade stop

**도전 과제:**
- watchers / children 동시성 — STM이 적합한가, Ref+atomic update가 충분한가
- ask의 임시 actor 명명 / 정리 보장
- ChildFailed의 cause 표현 (EffectTS의 Cause<E>를 그대로 노출?)

---

## M4. Restart — Supervision

**이 시점에 사용자가 할 수 있는 것:**
- `Behaviors.supervise(b).onFailure(E, Strategies.restart)` 로 재시작 정책 부착
- resume / restart / stop strategy 사용
- 예외 타입별 분기

**포함:**
- `Behaviors.supervise` 빌더
- `Strategies.resume` / `restart` / `stop`
- Restart 흐름:
  - PreRestart 신호
  - 현재 Fiber interrupt
  - 자식 cascade stop
  - 새 Behavior로 Fiber 재시작
  - mailbox 보존
- Error matcher (예외 타입 분기)

**도전 과제:**
- _Stable ref_ 가 진짜로 동작함을 검증. 외부에서 보낸 메시지가 restart 도중 mailbox에 쌓였다가 새 fiber에서 처리되는지.
- supervise wrapping의 nested 처리 (여러 onFailure chain)

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
- `Behaviors.withStash` + `Stash` 인터페이스
- `Behaviors.withTimers` + `Timers` 인터페이스
- `ctx.scheduleOnce`

**도전 과제:**
- Backoff schedule이 mailbox 보존과 충돌하지 않는지
- Stash 용량 초과 시 supervision으로 흘리는 흐름
- Timer가 액터 stop 시 자동 정리

---

## M∞. 도그푸딩 + 출시

**이 시점에 사용자가 할 수 있는 것:**
- poly-phony에서 `@loveqoo/effect-actor` import 해서 실제 Agent 구축
- npm publish

**포함:**
- poly-phony에서 진짜 사용
- 발견된 API 어색함 → 본 레포에서 수정 → minor 버전 갱신
- `setup-deploy` 셋업 (npm publish 흐름)
- `/ship` / `/land-and-deploy` 흐름 적용
- 0.1.0 첫 배포

**도전 과제:**
- npm 패키지 이름 결정 (`@loveqoo/effect-actor` 후보)
- 첫 배포 직전 `/devex-review`, `/codex review`, `/health` 통과
- README / CHANGELOG / docs 영어판 (비공식적으로는 한국어 docs를 그대로 두되, 영어 README는 별도)
- **semver 정책 확정** (현재 미정 — F6 결정에 따라 M∞ 직전에 ADR로 박음. 후보: `0.x = minor가 breaking, patch는 fix-only / 1.0+ = SemVer`)
- 영어 README 작성 (한국어 docs/는 그대로)
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

---

## 갱신 규칙

- 마일스톤 상태 표기 (🟢/🟡/🔴/⚪)는 사이클 끝마다 갱신.
- 마일스톤이 시작되면 _도전 과제_ 항목들이 사이클의 todo 후보가 된다.
- 마일스톤 _완료 정의(DoD)_ 가 모호하면 첫 사이클 시작 전에 명시화.

---

## OUTSIDE VOICE FINDINGS

> 2026-05-08 plan-devex-review 세션에서 Codex outside voice가 짚은 발견 10개.
> 모두 _M1 시작 전 별도 plan-eng-review 세션_ 에서 본격 결정.
> 이 섹션은 _발견을 흘리지 않기 위한 그물_. 결정 끝난 항목은 ADR로 옮기고 여기서 빼낸다.

| # | 등급 | 영역 | 발견 |
|---|---|---|---|
| OV-1 | 🔴 Critical | ARCHITECTURE 2.2/2.3/3.4, API 2.2 | ActorRef가 path만 들고 incarnation 개념 없음 → ABA 버그. 액터 재spawn 시 옛 ref가 새 액터 가리킴. 단일 프로세스에서도 안전하지 않음. |
| OV-2 | 🔴 Critical | ARCHITECTURE 3.5/3.6/5 | PreRestart/PostStop 흐름 모순. supervision 래퍼가 해석기 _밖_ 인데 PreRestart를 _현재 behavior_ 가 처리한다고 적힘. 실패 시점에 해석 루프 깨짐. |
| OV-3 | 🟡 Important | DECISIONS ADR-008 | bounded mailbox + backpressure 기본값이 tell의 fire-and-forget 깸. AI/agent burst 워크로드에서 sender suspend → 그래프 정지. ADR-008 재고. |
| OV-4 | 🔴 Critical | ARCHITECTURE 2.3/2.4/3.1/3.6 | Registry/children/watchers/fiber/status 여러 Ref 분리. 트랜잭션 경계 없음 → 중간 실패/경합에서 찢어진 상태. STM 거의 필수. |
| OV-5 | 🔴 Critical | ARCHITECTURE 3.5, PLAN M4, API 3.2/3.5 | Mailbox 보존 restart의 가정이 _handler가 순수한 한 개 effect_ 라고 깔고 있음. Effect 사용자는 fork/timer/scoped resource 쉽게 만듦 → 부작용 누수 위에 메시지만 재처리하는 반쯤 망가진 restart 위험. |
| OV-6 | 🟡 Strategy | DECISIONS ADR-004, PLAN M∞ | 도그푸딩 미루기 = 전략 오류. 진짜 위험은 기능 누락이 아니라 _API 감각/cost model/supervision 의미_ 가 실제 코드에서 맞느냐. ADR-014 (제안) 로 재고. |
| OV-7 | 🟡 Strategy | PLAN M1~M4, API 전체 | M1=spawn/tell/receive 만으론 Competitive TTHW 목표(2-5분)에서 _Nact 대신 쓸 이유_ 안 보임. ADR-015 (제안) 로 M1 범위 확장 검토. |
| OV-8 | 🔴 Critical | ARCHITECTURE 2.3/3.4, API 2.3/3.4 | watchWith 데이터 모델 미정. `watchers: Set<ActorPath>` 로는 "누가 어떤 메시지로 변환해서 감시 중" 표현 불가. 중복 watch / unwatch semantics 미정. |
| OV-9 | 🟡 Important | DECISIONS ADR-002, ARCHITECTURE 2.2/3.2 | Path-string lookup hot path 비용 + 과설계. Stable ref의 본질은 mailbox cell identity 유지지 path lookup 강제 아님. 단일 프로세스 0.x에선 더 단순 가능. |
| OV-10 | 🟡 Important | API 2.2/6, PLAN M1 | `narrow<U extends Msg>()` 가 TypeScript 단순 캐스팅. 라이브러리가 supervision/lifecycle은 강제하면서 타입 안전성에선 무력. selling point로 어려움. |

**관련 ADR:**
- ADR-014 (제안): ADR-004 (도그푸딩 시점) 재고 — OV-6 대응
- ADR-015 (제안): M1 범위 확장 — OV-7 대응
- 나머지 OV-1, 2, 3, 4, 5, 8, 9, 10 은 _M1 시작 전 plan-eng-review_ 에서 ADR-016~ 로 박힐 예정

---

## DX SCORECARD (2026-05-08, plan-devex-review POLISH 모드)

```
+============================================================================+
|              DX PLAN REVIEW — SCORECARD                                     |
+============================================================================+
| Dimension            | 현재     | F1-F6+M1 후 | M5+M∞ 후                  |
|----------------------|----------|-------------|---------------------------|
| Getting Started      | 3/10     | 8/10        | 8/10                      |
| API/CLI/SDK 설계     | 7/10     | 7/10        | 9/10 (잠정 결정 확정)     |
| Error Messages       | 2/10     | 6/10        | 8/10 (구체 어휘 확정)     |
| Documentation        | 7/10     | 7/10        | 8/10 (영어 README)        |
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
| Overall DX           | 3.9/10   | 5.6/10      | 7.5/10                    |
+============================================================================+
| DX 원칙 커버리지 (F1-F6+M1 후 기준)                                         |
| Zero Friction        | covered (스케치 README + examples/)                 |
| Learn by Doing       | covered (실행 가능 examples/)                       |
| Fight Uncertainty    | partial (에러 종류만, 구체 어휘는 사이클별)         |
| Opinionated + Escape | covered (Akka Typed 모양 + EffectTS escape)         |
| Code in Context      | covered (API.md 7개 예시)                           |
| Magical Moments      | covered (M1 후 README before/after 등장)            |
+============================================================================+
```

**리뷰 결과 요약:**
- 현재 평균 ~3.9/10. 코드 부재 + README 부재 + examples 부재가 대부분 차감.
- F1-F6 결정 + M1 셋업 완료 후 ~5.6/10. _Outside Voice 발견_ 들이 plan-eng-review에서 풀리고 M1이 끝나면 정확 측정 가능.
- M5+M∞ 후 ~7.5/10. 0.x 범위에서는 합리적 상한.
- **블로커:** Outside Voice OV-1~5, OV-8 (Critical 5개). M1 진입 전 plan-eng-review에서 결정 안 되면 ARCHITECTURE.md가 _틀린 상태로_ 코드 작성 시작.

**처리된 결정 (이 세션):**
- F1: 스케치 README 지금 (✅ README.md 작성 완료)
- F3: M1부터 examples/ 동작 (✅ ADR-011)
- F4: 디버그 모드 placeholder만 (✅ ARCHITECTURE.md §4.4)
- F5: 에러 종류 ARCHITECTURE에, 어휘 사이클별 (✅ ADR-012)
- F6: semver M∞ 직전 (✅ PLAN.md M∞ 노트)

**미처리 결정 (plan-eng-review 이관):**
- OV-1, 2, 3, 4, 5, 8, 9, 10 (8개)
- ADR-014 (도그푸딩 시점 재고)
- ADR-015 (M1 범위 확장)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 범위 & 전략 | 0 | — | — |
| Codex Review | `/codex review` | 독립 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | 아키텍처 & 테스트 (필수) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX (해당 없음, 라이브러리) | 0 | n/a | n/a |
| DX Review | `/plan-devex-review` | 개발자 경험 | 1 | issues_found | overall 3.9/10 → 5.6 (예상). Critical 5개는 plan-eng-review로 이관. F1-F6 처리됨. |

- **OUTSIDE VOICE (Codex):** 1회 실행 — 10개 발견(Critical 5, Important/Strategy 5). 모두 plan-eng-review로 이관.
- **CROSS-MODEL:** Codex와 Claude의 발견은 _상충하지 않고 보완_. Claude는 DX 표면(README, examples, 에러 어휘) 짚고, Codex는 아키텍처 근본(incarnation, signal 흐름, 트랜잭션 경계, 부작용 누수, watchWith 자료구조) 짚음.
- **UNRESOLVED:** 8 항목 (OV-1, 2, 3, 4, 5, 8, 9, 10) + ADR-014, ADR-015.
- **VERDICT:** DX Review 1회 완료. **Eng Review 필요 (M1 진입 전 필수)** — 미실행. 따라서 _NOT CLEARED for M1 코딩_.
