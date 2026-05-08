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
