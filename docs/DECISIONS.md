# Decisions — 결정 기록 (ADR)

> 각 결정은 _맥락 → 결정 → 결과_ 의 짧은 기록.
> 미래의 자기 자신이 결정을 뒤집기 _전에_ 왜 그렇게 정했는지 보게 하는 그물.
> 형식이 무거우면 안 쓰게 되니 가볍게 — 한 결정당 10줄 안.

## 형식

```
## ADR-NNN: 제목
- 상태: proposed | accepted | superseded by ADR-XXX
- 일자: YYYY-MM-DD

### 맥락
무엇이 문제였는가. 어떤 후보들이 있었는가.

### 결정
무엇을 정했는가.

### 결과
이 결정 때문에 _얻는 것_ 과 _잃는 것_.
```

---

## ADR-001: Akka Typed를 따른다 (Classic 아님)
- 상태: accepted
- 일자: 2026-05-08

### 맥락
Akka는 Classic과 Typed 두 갈래가 있다. Classic은 부모가 자식의 supervisor를 정의하고 메시지가 `Any`. Typed는 `Behavior[T]` 가 불변 값이며 supervision은 behavior 작성자가 부착.

### 결정
**Typed 모델을 따른다.**

### 결과
- (+) TypeScript 타입 시스템과 잘 맞음. 메시지 타입이 컴파일타임에 검증됨.
- (+) Behavior가 불변 값이라 EffectTS의 함수형 패러다임과 결이 같음.
- (+) supervision 정책이 behavior 작성자 한 곳에 모임 → 라이브러리 사용자에게 친절.
- (-) AllForOne strategy를 라이브러리 차원에서 제공하지 않음 (Typed의 철학). 대신 watch + 명시적 재spawn 권장 (ADR-005 참고).

---

## ADR-002: Stable ActorRef + Mailbox 분리를 1일차부터 도입
- 상태: accepted
- 일자: 2026-05-08

### 맥락
poly-phony에서 ActorRef가 closure-bound value였고 mailbox가 인스턴스에 종속이었다. 그래서 restart가 의미 있게 동작 못함. 새 레포에서 이 모델을 _점진적_ 으로 도입할지, _1일차_ 부터 도입할지가 갈림길이었다.

### 결정
**1일차부터 Stable ActorRef + Mailbox(인스턴스 분리) 모델로 시작.**

### 결과
- (+) Restart, Backoff, Supervision Tree가 _자연스럽게_ 따라옴. 나중에 갈아엎을 일 없음.
- (+) npm 배포 시 공개 API가 의미 있게 굳음. ADR-003과 짝.
- (-) 초반 진입 비용이 높다. 가장 단순한 spawn/send/receive를 만들기 전에 Registry / ActorPath 같은 인프라가 먼저 들어가야 함.
- (-) 첫 동작 가능한 코드까지 시간이 더 걸림.

---

## ADR-003: npm 배포는 모든 기능 완성 후로 미룬다
- 상태: accepted
- 일자: 2026-05-08

### 맥락
오픈소스로 npm에 배포할 계획이지만, _초기에_ 배포하면 semver 부담이 생기고 공개 API의 자유도가 떨어진다.

### 결정
**모든 마일스톤(M1–M5)이 완성되고 poly-phony에서 충분히 도그푸딩한 _뒤에_ 배포한다.**

### 결과
- (+) 인프라 작업 자유도 최대. 마음껏 시그니처 바꿀 수 있음.
- (+) 첫 배포 버전이 _실제로 견딘_ API라는 보증.
- (-) 배포 흐름(`/setup-deploy`, `/ship`, `/land-and-deploy`) 셋업이 후반부로 미뤄짐.
- (-) 외부 사용자 피드백을 일찍 받을 수 없음.

---

## ADR-004: 도그푸딩은 모든 기능 완성 후 한 번에
- 상태: superseded by ADR-024 (2026-05-09)
- 일자: 2026-05-08

### 맥락
도그푸딩을 _마일스톤마다_ 점진적으로 할지, _전 기능 완성 후_ 한 번에 할지.

### 결정 (superseded)
**모든 기능 완성 후 본격 도그푸딩.** 단, 보완책으로 `docs/API.md` 에 _상상의 사용 예시_ 를 풍부하게 적어 임시 도그푸딩 그물로 삼는다.

### 결과
- (+) 인프라가 이리저리 흔들리는 동안 응용을 짤 부담 없음.
- (-) API 모양 어긋남이 늦게 발견됨 → 발견 시 큰 갈아엎기 위험.
- (관리책) `docs/API.md` 의 사용 예시를 _진짜 사용처럼_ 작성. 시그니처가 어색해 보이면 곧장 고침. 이게 도그푸딩의 _프록시_.

> _supersede 이유 (2026-05-09): plan-eng-review round 2 에서 Codex 가 짚음. 진짜 위험은 기능 누락이 아니라 _API 감각 / cost model / supervision 의미_ 가 실제 코드에서 맞는지. M1~M2 의 토대 (incarnation/cell ref/Scope) 가 진짜 동작하는지 _M2 끝 시점_ 에 부딪혀야. ADR-024 로 정정._

---

## ADR-005: AllForOne supervision strategy를 라이브러리 차원에서 제공하지 않는다
- 상태: accepted
- 일자: 2026-05-08

### 맥락
Akka Classic에는 AllForOne(한 자식 죽으면 형제 모두 재시작) 이 있다. Akka Typed에서는 이 개념이 _제거_ 됨 — 부모가 watch하고 명시적으로 재spawn하는 패턴으로 대체.

### 결정
**ADR-001 (Typed 채택) 의 자연스러운 결과. AllForOne 미제공.** 대신 watch + 명시적 재spawn을 권장 패턴으로 문서화.

### 결과
- (+) framework 복잡도 감소.
- (+) 사용자가 자기 의도를 _명시적_ 으로 표현 → 디버깅 용이.
- (-) AllForOne이 익숙한 사용자에게 학습 비용. 마이그레이션 가이드 필요.

---

## ADR-006: Cluster, Persistence, Distributed Pub-Sub은 비목표
- 상태: accepted
- 일자: 2026-05-08

### 맥락
Akka는 거대하다. 어디까지 다룰지 명확히 해야 _완성_ 의 정의가 생긴다.

### 결정
다음은 0.x 범위 _밖_:
- Cluster (멀티 노드)
- Persistence (Event Sourcing)
- Receptionist / Service Discovery
- Distributed Pub-Sub
- Streams (EffectTS는 이미 Stream이 있음)

### 결과
- (+) 첫 견고한 _단일 프로세스_ 액터에 집중 가능.
- (+) 분산은 후속 패키지로 분리할 여지를 남김.
- (-) "왜 cluster 없냐"는 질문이 생길 수 있음 — README/FAQ에서 명시 필요.

---

## ADR-007: ActorContext는 함수 인자로 명시 전달
- 상태: accepted (잠정)
- 일자: 2026-05-08

### 맥락
사용자가 ctx에 접근하는 방법 후보:
- A. 함수 인자로 명시 (`Behaviors.receive((ctx, msg) => ...)`)
- B. EffectTS Service (`Effect.serviceWith(ActorContext)`)

### 결정
**A를 우선 진행.** B는 후속 옵션으로 _추가_ 가능성을 남김.

### 결과
- (+) Akka 모양과 일치 → 학습 비용 낮음.
- (+) ctx 사용처가 명시적이라 추적/디버깅 용이.
- (-) 사용자가 매번 ctx 받아야 함 (마법적이진 않음).

---

## ADR-008: Mailbox 기본은 bounded + backpressure
- 상태: superseded by ADR-018 (2026-05-09)
- 일자: 2026-05-08

### 맥락
메일박스 정책 후보: unbounded, bounded with drop, bounded with backpressure.

### 결정 (superseded)
**기본은 bounded(capacity 1024) + backpressure.**

### 결과
- (+) 메모리 안전성 기본.
- (-) Akka 의 dispatcher 모델과는 다른 동작 → Akka 사용자에게 살짝 낯섦.

> _supersede 이유 (2026-05-09): Codex 짚음. 페르소나 (AI/agent 빌더) 의 burst 워크로드에서 sender suspend → 그래프 정지. tell fire-and-forget 약속 깨짐. ADR-018 로 정정 (unbounded 기본 + 옵션)._

---

## ADR-009: Signal과 Message는 큐 분리, Signal 우선 처리
- 상태: accepted (잠정)
- 일자: 2026-05-08

### 맥락
Signal(PostStop, Terminated 등)과 Message(사용자 정의 T)를 한 큐에 union 할지, 별도 큐에 둘지.

### 결정
**별도 큐. take 시 signalQueue 우선 폴링.**

### 결과
- (+) 명확한 우선순위. PostStop이 사용자 메시지 뒤에 깔리는 일 없음.
- (+) 타입이 깔끔 (`Queue<Msg>` + `Queue<Signal>`).
- (-) take 로직이 두 큐를 polling — 미세 비용. 실측 후 한 큐로 합칠 가능성.

---

## ADR-010: 문서 기반 개발 워크플로우
- 상태: accepted
- 일자: 2026-05-08

### 맥락
AI 어시스턴트와 일할 때 _세션 휘발성_ 이 가장 큰 위험. 메모리는 _대화 스타일/큰 결정_ 을 잡아주지만 도메인 지식 자체는 외부 문서가 필요.

### 결정
**`docs/` 묶음을 영구 진실원으로.** AKKA_REFERENCE / ARCHITECTURE / API / DECISIONS / PLAN / LEARNINGS + 루트의 AGENTS.md. subset 사이클마다 코드와 문서를 _같은 커밋_ 에 묶는다.

### 결과
- (+) 새 세션이 처음부터 다시 시작하지 않음. AGENTS.md가 진입점.
- (+) 결정 / 학습이 누적되어 미래의 자기 자신을 보호.
- (-) 문서 작성 비용 — 다만 _코드 작성과 같이 진행_ 하면 큰 부담 아님.

---

## ADR-011: examples/ 폴더 동작이 마일스톤 완료 조건
- 상태: accepted
- 일자: 2026-05-08
- 출처: plan-devex-review F3 결정

### 맥락
docs/API.md 의 예시는 _읽을_ 수는 있어도 _실행_ 안 됨. 코드와 docs가 어긋날 위험.

### 결정
**M1 첫 사이클부터 `examples/` 폴더를 두고, 각 마일스톤의 _완료 정의(DoD)_ 에 _examples/N 동작_ 을 포함.**

### 결과
- (+) docs와 코드가 매 사이클 자동 정합. 이론이 아닌 검증된 사실로 격상.
- (+) 사용자가 `tsx examples/01-counter.ts` 같이 _직접 실행_ 가능 → 매직 모먼트 전달 매체로도 활용.
- (-) M1 작업량 약간 증가. 다만 어차피 손으로 한 번은 실행해보는 코드라 큰 추가 부담 아님.

---

## ADR-012: 에러 종류는 지금 ARCHITECTURE.md에, 구체 어휘는 사이클별로
- 상태: accepted
- 일자: 2026-05-08
- 출처: plan-devex-review F5 결정

### 맥락
에러 메시지 어휘를 _지금_ 일괄 정할지, _사이클마다_ 결정할지.

### 결정
**계층적 접근:** 최상위 에러 종류(ActorNotFound, IncarnationMismatch, MailboxFull, AskTimeout, DeathPactException, StashOverflow 등)는 ARCHITECTURE.md §4.5 에 _지금_ 나열. EffectTS Tagged Error 표현 도입은 M1 첫 사이클. 구체 메시지 텍스트/권장 fix/문서 링크는 _관련 패스의 사이클_ 에서 확정.

### 결과
- (+) 일관성 — 모든 에러가 같은 패턴(Tagged Error).
- (+) 점진성 — 모르는 에러를 추측해 정하지 않음. 만들면서 확정.
- (-) 메타 관리 부담 약간 (어디서 어휘 결정했는지 LEARNINGS.md 추적).

---

## ADR-013: 디버그 모드는 placeholder만 지금, 세부는 M3-M4
- 상태: accepted
- 일자: 2026-05-08
- 출처: plan-devex-review F4 결정

### 맥락
액터 라이브러리 사용자의 가장 흔한 질문 _"왜 메시지를 안 받지"_ 에 답할 진단 도구. 지금 세부 설계할지, 미룰지.

### 결정
**ARCHITECTURE.md §4.4 에 _후보 진단 출력_ 항목만 placeholder. 구체 설계는 M3 (watch 구현) 끝난 시점에 자연스러워질 때 결정.**

### 결과
- (+) 자리는 잡힘 — M3-M4 사이클에서 _확장 지점_ 을 잊지 않음.
- (+) 모르는 채 굳히지 않음.
- (-) M3-M4까지 _구체 진단 도구 없는_ 상태 — 다만 이 시기엔 사용자가 거의 자기 자신.

---

## ADR-014: 도그푸딩 시점 재고 (제안 — superseded by ADR-024)
- 상태: superseded by ADR-024 (2026-05-09)
- 출처: plan-eng-review D10 결정 (M3 끝 가벼운 + M5 끝 본격) → round 2 재고 → ADR-024

> _proposed → renumbered/refined as ADR-024 (M2 끝 시작) — round 2 OV2-9 결과._

---

## ADR-015: M1 범위 확장 (superseded by ADR-025)
- 상태: superseded by ADR-025 (2026-05-09)
- 출처: plan-eng-review D6 결정 (M1 + setup) → ADR-025 로 정해짐.

> _proposed → renumbered as ADR-025._

---

## ADR-016: ActorRef 에 incarnation UID + watch key (path, uid)
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-1 (round 1) + OV2-1 (round 2)

### 맥락
Codex outside voice round 1: 현재 ActorRef 가 path-only → 동명 재spawn 시 옛 ref 가 새 액터에 메시지 전달 → ABA 위험. 단일 프로세스에서도 발생.

Round 2 추가 발견: UID 가 ref 에만 붙으면 watch 쪽 ABA 그대로 — `target.watchers: TMap<watcherPath, ...>` 가 path-only 면 재spawn 동명 액터에 _옛 watcher 가 따라붙어_ 잘못 Terminated 발사.

### 결정
**ActorRef = `{ path, uid, cell, system }`** (uid 는 spawn 시 부여되는 UUID, restart 에 유지, stop 후 재spawn 시 새 uid).

**Watch key = `(path, uid)`** — `target.watchers: TMap<{path, uid}, WatchMessage>` (ADR-022 와 결).

tell hot path: STM read-only tx 로 entry.uid === ref.uid 검증, 다르면 dead letter.

### 결과
- (+) 단일 프로세스에서 ABA 구조적 차단. 멀티노드 확장 시도 일관.
- (+) Akka Typed 정통 — incarnation UID 모델.
- (+) Watch 의 동명 재spawn 잘못된 Terminated 발사 차단.
- (-) ref 사이즈 +UUID. UUID 생성 비용 (spawn 시 1회).

---

## ADR-017: STM 부분 도입 (TRef + TMap) — 시스템 명령 fiber 와 비교
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-4 (round 1) + OV2-8 (round 2)

### 맥락
Round 1: ActorEntry 의 children/watchers/status/fiber 가 여러 Ref 분리 → spawn/stop/watch 가 _여러 entry 의 여러 필드_ 를 동시 갱신해야 정합성 유지. 트랜잭션 경계 없음 → 찢어진 상태 위험.

Round 2 (Codex 재고): _시스템 전용 명령 fiber 하나_ 가 spawn/stop/watch 를 직렬화하는 더 단순한 안. STM 은 _0.x 단일 프로세스 lifecycle 드뭄_ 에서 과설계 우려.

### 결정
**STM 부분 도입 (TRef + TMap) 선택.** Registry 의 path → entry 는 TMap. children/watchers/status/fiber 는 TRef. spawn/stop/watch 는 STM tx. Mailbox/signalQueue 는 일반 EffectTS Queue.

**시스템 명령 fiber 와의 비교 (왜 STM):**
- 둘 다 _구조적 안전_ 제공.
- STM: 병렬 시도 + auto retry. 사용자 STM tx 합성 가능성 (추후 옵션).
- 명령 fiber: 직렬 처리. 단순 + 학습 비용 0.
- 0.x 에선 _둘 다 충분_, STM 채택 — 사용자 노출 가능성 + EffectTS 1급 제공 도구.

### 결과
- (+) 트랜잭션 경계 명시. 찢어진 상태 구조적 차단.
- (+) EffectTS STM 의 자연스러운 활용처. 향후 사용자 코드 수준 합성 여지.
- (-) STM 학습 부담 (개발 측). TMap/TRef API 일반 자료구조와 약간 다름.
- (-) Mailbox 의 enqueue 는 STM 밖 → tell 의 완전 원자성 보장 안 함 (ADR-019 best-effort 명시로 보완).

---

## ADR-018: Mailbox 기본 unbounded + capacity 옵션
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-3 (round 1)
- supersedes: ADR-008

### 맥락
ADR-008 의 _bounded + backpressure_ 가 tell 의 fire-and-forget 약속 깨뜨림. 페르소나 (AI/agent 빌더) burst 워크로드에서 sender suspend → 그래프 정지.

### 결정
**기본 unbounded.** 사용자가 `Behaviors.withMailbox({ capacity, overflow: "backpressure" | "drop" | "fail" })` 로 명시 선택. Akka Typed 정통 (그쪽도 기본 unbounded).

### 결과
- (+) AI/agent burst 워크로드 안전. tell fire-and-forget 약속 유지.
- (+) Akka Typed 와 일관.
- (-) 메모리 폭발 위험을 사용자가 안다 — README "메모리 우려 있으면 capacity 명시" 경고 필요.

---

## ADR-019: ActorRef 가 cell 직접 보유 + best-effort delivery 명시
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-9 (round 1) + OV2-2 (round 2)

### 맥락
Round 1: 현재 ARCHITECTURE.md 의 tell 은 _매번 registry resolve_ → AI burst 워크로드에서 path serialize + Map lookup 누적 비용. Stable ref 의 본질은 _mailbox cell identity_ 이지 path lookup 강제 아님.

Round 2 (Codex 재고): 결정 1+2+9 의 조합에서 uid/status 검증은 STM, 실제 enqueue 는 Queue.offer — 둘 사이 race 가능. _tell 선형화 의미_ 명시 필요.

### 결정
**ActorRef = `{ path, uid, cell, system }`** — cell 직접 보유 (mailbox + signalQueue 의 stable reference).

**tell hot path:**
1. STM read-only tx: entry.uid === ref.uid 검증 + status check
2. cell.mailbox.offer(msg) — registry lookup 0회

**송신 결과 명시 (best-effort delivery):**
- _stale ref_ (uid 불일치): dead letter
- _in-flight stop_ (검증 후 enqueue 사이에 stop): 옛 cell 에 enqueue, 아무도 안 읽음 (의미적 소실)
- _fresh_: enqueue 성공

Akka 와 동일 — tell 은 _delivery 보장 안 함_. 사용자가 보장 원하면 명시 supervision 또는 ack 패턴.

### 결과
- (+) tell hot path lookup 0회. AI burst 워크로드에서 최소 비용.
- (+) Stable ref 의 본질 정확 — mailbox cell identity 유지.
- (+) Akka best-effort 의미 일관 + 송신 결과 표 명시.
- (-) ref 사이즈 증가 (cell ref). Spawn 단계 cell 생성 + ref 조립.
- (-) in-flight stop 시 메시지 의미적 소실 — 사용자 인지 필요 (Akka 와 동일 동작이나 명시 필요).

---

## ADR-020: Supervision 외피 (해석기와 같은 fiber, invariant 정정)
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-2 (round 1) + OV2-3 (round 2)

### 맥락
Round 1: ARCHITECTURE.md §3.5 (Restart) 가 _현재 Behavior 가 PreRestart 처리_ 라 적힘. 그 Behavior 는 방금 실패해서 _깨진 fiber_ 안 — supervision 래퍼는 §1 에서 _해석기 밖_ 에 있는데 어떻게 그 Behavior 에 PreRestart 발사? 모순.

Round 2 (Codex 재고): "supervision 은 해석기 밖" invariant 자체가 잘못 — 래퍼가 _현재 Behavior 인스턴스_ 추적해야 PreRestart 발사 가능. 즉 supervision 과 interpreter 가 _같은 fiber, 같은 모양_. 문서 표현 정정 필요.

### 결정
**Supervision 은 _interpreter 와 같은 fiber 안의 외피_** (catchAll wrapper). 래퍼가 _현재 Behavior 인스턴스_ 추적.

PreRestart 흐름: catchAll → strategy 결정 → 만약 restart 면 signalQueue.offer(PreRestart) → 현재 Behavior 가 receiveSignal 로 처리 → instance Scope 닫고 새로 → setup 재실행 → 새 Behavior 로 재시작.

재귀 실패 (PreRestart 처리 도중 재실패) 시 strategy 재적용. 강도 제한 (max retry).

ARCHITECTURE.md §1 다이어그램 갱신: "L3 Supervision 외피 — interpreter 와 같은 fiber, catchAll, 현재 Behavior 추적". §5 invariant 정정.

### 결과
- (+) OV-2 결정 보존. 모순 해결.
- (+) Akka ActorCell 과 일관 — cell 이 supervisor + Behavior 둘 다 보유.
- (+) PreRestart 가 사용자 코드 수준 hook (Akka Typed 와 일관).
- (-) "단순 분리" 원리 약간 느슨. 문서 표현 정정 (같은 모양 인정).

---

## ADR-021: Instance Scope (자동 cleanup) + 소유권 표 + cleanup 우선순위
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-5 (round 1) + OV2-4, OV2-7 (round 2)

### 맥락
Round 1: 사용자가 receiveMessage handler 안에서 `Effect.fork`/`Schedule.scheduleAt`/scoped resource 만들면 → restart 시 _좀비 fiber_ 남음. mailbox 보존 restart 의 _handler 가 순수한 한 effect_ 가정 깨짐.

Round 2 (Codex):
- Scope 경계 미명시 — 부모 restart 시 자식 actor / timer / ask temp / ctx.fork / setup resource 가 _각각 어느 scope 소유_ 인지 불분명.
- setup M1 + PostStop M2 어정쩡 — instance Scope 가 cleanup 기본이면 PostStop 역할 줄여야, 또는 같이 와야. 우선순위 없음.

### 결정
**Instance Scope** (액터 spawn 시 열림, stop/restart 시 닫힘): EffectTS Scope. ctx.fork / timer / scoped resource 모두 instance Scope 소유.

**Scope 소유권 표** (ARCHITECTURE.md §3.7 신규):

| 자원 | 소유 Scope | restart 시 |
|---|---|---|
| 자식 actor | 자기 instance Scope (부모 Scope 아님) | 부모 cascade stop 정책에 따라 stop |
| ctx.fork fiber | 부모 instance Scope | 부모 restart 시 닫힘 |
| Timer | 부모 instance Scope | restart 시 닫힘 |
| Ask 임시 actor | 자기 instance Scope | 부모 restart 와 무관 (독립) |
| Setup resource | instance Scope | restart 시 닫고 setup 재실행 |
| Stash | instance Scope | restart 시 비워짐 |

**Cleanup 모델 우선순위:**
1. _자동_ (기본): instance Scope 의 finalize. 대부분 사용자.
2. _명시 hook_ (M2 후): PostStop 신호. fiber 영역 밖 알림 (외부 시스템 등).

### 결과
- (+) OV-5 핵심 해결 — 좀비 fiber 자동 정리.
- (+) Akka 액터 lifetime 관점 그대로.
- (+) 두 cleanup 모델 (자동 vs 명시 hook) 우선순위 명시.
- (-) 한 메시지만 살아야 하는 짧은 fork 는 사용자가 Effect.scoped 직접 래핑 (ctx 수준 hook 은 instance lifetime 만 제공).

---

## ADR-022: watchers/watching 자료구조 — TMap<{path, uid}, WatchMessage> 양방향
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-8 (round 1) + OV2-1 (round 2)

### 맥락
Round 1: 현재 `watchers: Set<ActorPath>` 로는 watchWith 의 _누가 어떤 메시지로 변환해서 감시 중_ 표현 불가. Akka Typed semantics 모방 필요.

Round 2: watch key 가 path-only 면 동명 재spawn 시 _옛 watcher 가 새 entry 에 따라붙어_ 잘못 Terminated. ADR-016 의 incarnation 일관 위해 (path, uid).

### 결정
**target.watchers**: `TMap<{path, uid}, WatchMessage>`
**watcher.watching**: `TMap<{path, uid}, WatchMessage>` (양방향)

Where:
```
WatchMessage =
  | { _tag: "Terminated" }                  // ctx.watch
  | { _tag: "Custom"; msg: unknown }        // ctx.watchWith
```

**Semantics (Akka Typed):**
- 한 watcher-target 쌍 당 하나의 WatchMessage.
- 재호출 (`watch` 후 `watchWith`): 덮어쓰기.
- `unwatch(target)`: 그 쌍 (path, uid) 제거.

target 사망 시: target.watchers 의 각 (watcherKey, msg) 에 대해 entry.signalQueue.offer(변환 결과). 동시에 entry.uid === watcherKey.uid 검증 (ABA 차단).

### 결과
- (+) Akka Typed semantics 정확.
- (+) ABA 안전 — 동명 재spawn 시 옛 watcher 잘못 연결 차단.
- (+) STM TMap 으로 OV-4 결정과 결 맞음.
- (-) Map 두 개 (target watchers + watcher watching). spawn/stop/watch 시 둘 다 갱신.
- (-) TMap 키 가 조합 (path, uid) — hash/equality 정의 필요.

---

## ADR-023: narrowUnsafe 로 이름 변경 + adapter actor 패턴 권장
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV-10 (round 1) + OV2-10 (round 2)

### 맥락
Round 1: API.md 의 `ActorRef.narrow<U extends Msg>()` 가 TypeScript 단순 캐스팅 → 런타임 안전성 X. 라이브러리가 supervision/lifecycle 강제하면서 타입 안전성에선 무력 → selling point 어려움.

Round 2 (Codex): 이름만 변경하는 건 미봉. 부분 프로토콜 노출의 _대체 수단_ (adapter actor) 을 API.md 예제로 같이 적지 않으면 사용자는 그냥 캐스팅.

### 결정
**메서드 명: `narrow` → `narrowUnsafe`** — 사용자 명시 인지.

**API.md §3.8 (신규): adapter actor 패턴 예제** — _권장 안전 대안_. 메시지 변환 actor spawn 해서 좁은 메시지 제한 표현.

`narrowUnsafe` 설명에 "권장 대안: adapter actor" 명시 (API.md §2.2).

향후 _Schema 검증 narrow_ (Effect Schema 기반) 도입 여지 — 둘 나눠서 공존 가능.

### 결과
- (+) 사용자가 unsafe 를 _호출할 때마다_ 인지 — 정직.
- (+) Adapter actor 패턴이 _첫 페이지_ 에서 노출 → 권장 대안 우선 선택 유도.
- (+) Codex 우려 ("이름만 설공") 정확 대응.
- (-) Akka 의 narrow 와 이름 다름 — Akka 사용자 처음 한 번 설명 필요.

---

## ADR-024: 도그푸딩 시점 — M2 끝 시작
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review ADR-014 D10 (M3 끝) → OV2-9 (round 2 재고)
- supersedes: ADR-004

### 맥락
ADR-004 (한 번에 도그푸딩 — M5+M∞ 끝) 이 Codex round 1 우려. ADR-014 (D10) 에서 _M3 끝 가벼운 + M5 끝 본격_ 으로 재고. 하지만 round 2 Codex: M3 까지 기다리는 게 _여전히 늦음_. 가장 위험한 건 watch/restart 보다 _M1~M2 의 토대_ (incarnation/cell ref/Scope) 가 코드에서 진짜 동작하는지.

### 결정
**M2 끝 도그푸딩 시작.** ~1주, poly-phony 에서 _setup + PostStop + 상태 갖는 actor_ 한 개 만들어보기. M1~M2 토대 검증.

**M3 끝, M4 끝 추가 도그푸딩** (마일스톤마다 ~1주). M5 끝 _본격_ 도그푸딩.

M1 동안은 docs/API.md + examples/ 가 _프록시 도그푸딩_ (ADR-004 정신 일부 보존).

### 결과
- (+) M1~M2 토대 (incarnation/cell ref/Scope/STM) 가 쓴 코드에서 진짜 동작 — M3 사이클에 토대 오류 안 가져감.
- (+) Codex round 2 우려 수확.
- (-) 사이클 관리 부담 약간 증가 (M2/M3/M4 끝마다 도그푸딩 세션).

---

## ADR-025: M1 범위 — spawn / tell / receive + setup
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review ADR-015 D6

### 맥락
ADR-015 (제안): M1 = spawn/tell/receive 만으론 Codex 의 Competitive TTHW 우려에 답 못함 (Nact 대비 차별점 안 보임). 후보: M1 그대로, M1 + setup, M1 + setup + PostStop, M1 + setup + watch + ask.

### 결정
**M1 = spawn/tell/receive + Behaviors.setup.**

추가 비용 극소: Behavior ADT 한 케이스 + Behaviors.setup 빌더 + 해석기 한 분기. M1 사이클 길이 터지지 않음.

PostStop 은 M2 에 남김 (ADR-021 의 _자동 vs 명시 hook_ 우선순위 명시로 어정쩡함 해소).

### 결과
- (+) 사용자 첫 코드가 setup 으로 _자원 초기화_ — Akka 정통 진입점.
- (+) examples/01-counter.ts 가 의미 있는 데모 (단순 counter + setup 자원).
- (-) PostStop 없이 setup 만 — _setup 한쪽 짝_ 상태로 M2 까지 (ARCHITECTURE.md §3.8 cleanup 우선순위 표 로 의미 명시).

---

## ADR-026: ActorSystem<RootMsg> generic + behavior 메타 추출 단계
- 상태: accepted
- 일자: 2026-05-09
- 출처: plan-eng-review OV2-5 + OV2-6 (round 2)

### 맥락
Round 2 Codex:
- ADR-018 의 `Behaviors.withMailbox` 가 Behavior 래퍼인데 mailbox 는 spawn 2단계에서 생성 → spawn 전에 _벗겨서_ 메타 추출 순서 미정. supervise/setup 도 같은 패턴.
- ADR-025 의 setup 추가는 root typing 결정 강제 — system.root 가 ActorRef<???> 어떤 타입?

### 결정

**A. ActorSystem<RootMsg> generic** (Akka Typed 정통):
```
ActorSystem<RootMsg> {
  root: ActorRef<RootMsg>;
  ...
}
ActorSystem.create<RootMsg>(behavior, name): Effect<ActorSystem<RootMsg>>
```

**B. Behavior 메타 추출 단계 명시** (ARCHITECTURE.md §3.1 0단계):
spawn 시 Behavior 의 외곽 래퍼 (WithMailbox / Supervise / Setup) 를 _벗겨서_ 메타 추출 후 시작 behavior 결정. 같은 패턴이 모든 래퍼 ADT 에 적용.

API.md §2.5 에 `Behaviors.withMailbox` 추가.

### 결과
- (+) 사용자 첫 코드부터 타입 안전. examples/01 이 신뢰할 수 있는 타입 약속.
- (+) ADT 일관 — supervise/withMailbox/setup 모두 Behavior 래퍼. 학습 표면 단일.
- (+) 추가 항목 (stash, withTimers) 도 같은 패턴 — 식단적 확장.
- (-) ActorSystem 타입 파라미터 추가 (사용자 명시 또는 추론).
- (-) Spawn 구현에 메타 추출 단계 추가 — 구현 복잡도 조금.

---

## ADR-027: 툴체인 — pnpm + ESM + TypeScript 5 strict + vitest + tsx
- 상태: accepted (잠정)
- 일자: 2026-05-09
- 출처: M1 사이클 0 — AGENTS.md §5.3 의 _M1 시작 전 결정_ 마무리

### 맥락
M1 시작 전에 패키지 매니저 / 빌드 도구 / 테스트 / 실행 환경을 정해야 한다. 후보:
- 패키지 매니저: npm / pnpm / yarn / bun
- 모듈: ESM / CJS / dual
- 테스트: vitest / jest / node:test
- 실행: tsx / ts-node / bun run

선택 기준: EffectTS 생태계 친화도, 사용자(EffectTS 파워 유저) 익숙함, 향후 라이브러리 배포 (M∞) 호환성, 유지비 낮음.

### 결정
- **패키지 매니저: pnpm 11** (corepack 통해 고정. lock 파일 커밋).
- **모듈: ESM** (`"type": "module"`). CJS dual export 는 M∞ 직전 빌드 도구로 결정.
- **TypeScript 5 strict** + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **테스트: vitest + @effect/vitest** — Effect 런타임 통합 일급.
- **실행: tsx** (examples 직접 실행, ESM .ts 지원).
- **빌드 도구: 미정** — 라이브러리 배포가 필요해질 때 (M∞) 결정. 후보 tsup.
- **포매터: prettier** (디폴트 설정).
- **린터: 미정** — 처음부터 정하지 않음. typecheck + 명시적 코드 리뷰로 충분. eslint 가 필요하면 후속 ADR.

### 결과
- (+) EffectTS 생태계 표준 조합. 사용자가 이미 익숙한 도구.
- (+) M1 시작 전 _도구 결정 부담 0_. tsx 로 examples 즉시 실행, vitest 로 즉시 테스트.
- (+) M∞ 배포 시 빌드 도구만 결정하면 됨 — pnpm publish 흐름 자체는 표준.
- (-) bun (이미 설치됨) 의 단일 도구 (run + test + bundle) 이점 포기. EffectTS 1급 통합이 vitest 쪽이라 그쪽이 더 안전.
- (-) lock 파일이 pnpm 전용. 사용자가 npm/yarn 으로 바꾸려면 변환 필요 — 다만 그럴 일 거의 없음.

---

## ADR-028: 라이브러리 설계 우선순위 잣대
- 상태: accepted
- 일자: 2026-05-09
- 출처: M2 끝 도그푸딩 #1 (poly-phony) 보류 입력 → 잣대 명시 필요

### 맥락
도그푸딩 #1 입력으로 _4 결정 묶음_ (ask 시그너처, typed reply err, watch+ask 통합, ctx.stop cascade) 이 들어옴. 도그푸딩 입력 _그대로 채택_ 하면 라이브러리 설계 흔들림 — _첫 사용자_ 한 명에 맞춘 표면이 _다른 사용자_ 에게 어색. ADR-024 의 도그푸딩 정신은 _토대 검증_ 이지 _요구 그대로 채택_ 이 아님. 잣대가 명시 안 되면 매 결정마다 _재발견_.

### 결정
**라이브러리 설계 우선순위 (충돌 시 위쪽 우선):**

1. **Akka Typed 정통 모양** — 라이브러리 _표면_ 이 Akka Typed 와 구조적 일치. AGENTS.md §7 한 줄 ("ActorRef 는 논리 주소 …") 의 시금석.
2. **EffectTS typed 정신** — Akka 모양과 _자연 호환_ 인 곳에서만 typed 채택. ADR-026 의 typed root (`ActorSystem<RootMsg>`) 가 본보기. Akka 와 충돌하면 _Akka 우선_.
3. **도그푸딩 boilerplate 는 _사용자 측 wrapper_** — 라이브러리는 정통 유지, 도메인 편의는 사용자 측 5-10 줄 wrapper.

**도그푸딩 입력 처리 규칙:**
- 도그푸딩 입력은 _라이브러리 설계 잣대_ 로 재평가 후 결정. 입력 그대로 채택 X.
- 잣대와 충돌 시 _도그푸딩 측이 wrapper / 우회_ — 라이브러리는 정통.
- 잣대 자체가 모호하면 _철학 ADR_ 먼저 박고 그 다음 입력 평가.

### 결과
- (+) 모든 결정의 _재발견_ 비용 0 — 잣대 한 번 정해두면 다음 결정마다 _그 잣대 적용_.
- (+) _첫 사용자 의존성_ 차단 — poly-phony 한 도메인이 라이브러리 표면 흔들 수 없음.
- (+) Akka Typed 사용자가 _구조적 친숙_ — 학습 비용 최소.
- (-) 도그푸딩 측 boilerplate 부담 약간 — wrapper 5-10 줄. 라이브러리 설계 일관성과 trade-off 에서 후자 우선.
- (-) _Akka 정통이 EffectTS 정신과 충돌_ 하는 케이스 발견 시 _Akka 우선_ 이 EffectTS 사용자에게 어색할 수도 — 그때마다 케이스별 ADR 로 명시.

---

## ADR-029: ask 패턴 시그너처 — Akka 정통 (untyped err)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M2 끝 도그푸딩 #1 입력 #1 + #2 → ADR-028 잣대 적용

### 맥락
도그푸딩 #1 입력 #2: poly-phony 의 ask 가 `ask<In, Out, Err>` (typed err) — `BackendNotFound` 같은 도메인 에러를 typed 로 표현. effect-actor M3 ask 설계 시 typed err 포함 여부 결정 필요.

ADR-028 잣대 적용:
- Akka Typed 의 ask 는 _untyped_ — `AskTimeoutException` 만. reply 의 _도메인 에러_ 는 reply ADT 안에 표현 (예: `Result<Resp, Err>` 또는 `Success | Failure` ADT).
- EffectTS typed 정신 (`Effect<A, E>`) 과 충돌 — Akka 우선이 ADR-028 의 1차 잣대.

### 결정
**ask 시그너처:**
```typescript
// ctx 안: 자식 spawn 흉내 — 임시 actor 가 ctx 의 instance Scope 안 (ADR-021).
ctx.ask<Resp>(
  target: ActorRef<TargetMsg>,
  make: (replyTo: ActorRef<Resp>) => TargetMsg,
  timeout: Duration,
): Effect.Effect<Resp, AskTimeout>

// ref 안: top-level 또는 외부 Effect 에서. ask temp actor 가 자기 instance Scope.
ref.ask<Resp>(
  make: (replyTo: ActorRef<Resp>) => Msg,
  timeout: Duration,
): Effect.Effect<Resp, AskTimeout>
```

- **Resp generic 1개** — Akka 정통.
- **fail 채널: `AskTimeout` 만** — typed err X. 도메인 에러는 사용자 측 reply ADT.
- **timeout 필수 positional** — Akka 정통. opts 객체 X (단순함 우선).

**도메인 에러 패턴 (사용자 측 wrapper 예시):**
```typescript
type LookupResp = { _tag: "Found"; ref: BackendRef } | { _tag: "NotFound" };

const lookupBackend = (id: string) =>
  ctx.ask<LookupResp>(registry, (replyTo) => ({ _tag: "Lookup", id, replyTo }), "5 seconds")
    .pipe(Effect.flatMap(r =>
      r._tag === "Found" ? Effect.succeed(r.ref) : Effect.fail(new BackendNotFound({ id })),
    ));
```

### 결과
- (+) Akka Typed 사용자가 _구조적 친숙_ — `ref.ask(make, timeout)` 정통.
- (+) 라이브러리 표면 _작음_ — generic 1개, fail 채널 1개.
- (+) 사용자가 _자기 도메인 에러_ 자유 표현 — reply ADT 가 도메인 분기 자연 노출.
- (-) poly-phony 같은 도메인이 _wrapper 5-10 줄_ 부담. ADR-028 3차 잣대 (사용자 측 wrapper) 정신.
- (-) `ctx.ask` 와 `ref.ask` 두 표면 — Akka Typed 도 같음 (`AskPattern._` import 또는 ctx 안). 같은 의미, 위치 차이.

---

## ADR-030: watch + ask 분리 — Akka 정통
- 상태: accepted
- 일자: 2026-05-09
- 출처: M2 끝 도그푸딩 #1 입력 #3 → ADR-028 잣대 적용

### 맥락
도그푸딩 #1 입력 #3: poly-phony 의 ask 가 `raceFirst(reply, terminated → fail ActorClosed)` — target 이 응답 전에 죽으면 caller 자동 fail. effect-actor M3 ask 에 watch 통합 여부 결정 필요.

ADR-028 잣대 적용:
- Akka Typed 의 ask 는 watch _분리_ — ask = timeout 만, watch 는 별도 (`ctx.watch` 또는 `ctx.watchWith`). caller 가 _명시_ 로 watch + ask combine.

### 결정
**ask 와 watch 는 분리.** ask 의 fail 채널은 `AskTimeout` 만 (ADR-029). target 의 죽음 검출이 필요하면 사용자 측 _명시 combine_:

```typescript
// 사용자 측 wrapper 예시 — ActorClosed 자동 fail 패턴.
const askOrFailIfClosed = <Resp>(
  ctx: ActorContext<Msg>,
  target: ActorRef<TargetMsg>,
  make: (replyTo: ActorRef<Resp>) => TargetMsg,
  timeout: Duration,
) =>
  Effect.race(
    ctx.ask<Resp>(target, make, timeout),
    ctx.watchTerminated(target).pipe(Effect.flatMap(() => Effect.fail(new ActorClosed({ path: target.path })))),
  );
```

`ctx.watchTerminated(target): Effect<void>` 는 M3 watch 인프라가 제공 — _Effect 형태로_ termination await (이게 watch 의 _Effect 노출_).

### 결과
- (+) Akka Typed 정통 — ask 와 watch 가 _독립 직교 기능_, 사용자가 필요 시 combine.
- (+) ask 표면 _단순_ — fail 채널 1개 (`AskTimeout`).
- (+) `ctx.watchTerminated` 가 watch 의 _Effect 형태_ 노출 — race / scope-bound 합성 자유.
- (-) poly-phony 의 _자동 watch_ 의미가 wrapper 로 이동 — 5줄. ADR-028 3차 잣대 정신.
- (-) caller 가 _명시 combine 잊기_ 가능성 — Akka Typed 도 같은 부담 (사용자 책임).

---

## ADR-031: ctx.stop cascade — graceful (자식 cascade + PostStop 호출)
- 상태: accepted (M3.1 사이클 1 보강: sibling LIFO + spawn happens-before + Effect TMap 우회)
- 일자: 2026-05-09
- 출처: M2 끝 도그푸딩 #1 입력 #4 + M2 LEARNINGS §11 의 _자식 PostStop 미호출_ 한계 + 도그푸딩 #2 사이클 5 의 spawn race 발견

### 맥락
M2 끝 LEARNINGS: 부모 `sys.shutdown` 시 부모 Scope.close 가 자식 fiber 강제 interrupt → 자식 PostStop 미호출. 도그푸딩 #1 입력 #4: `BackendRegistry` 가 `Backend` 들을 eagerly spawn + lifetime 묶음 — registry close 시 모든 backend cleanup 필요.

ADR-028 잣대 적용:
- Akka Typed 의 stop 의미 = _자식 cascade_ + _PostStop 호출_ + _자기 stop_. 강제 interrupt 는 supervision restart 한정. 도그푸딩 요구가 Akka 정통과 _일치_ — 수용.

### 결정
**`ctx.stop(child)` 와 `sys.shutdown` 의 graceful 의미:**

```
1. status = "stopped" (STM)
2. 자식 actor 들 재귀 stop (cascade) — 자식의 자식부터 (depth-first 또는 순서 무관)
3. 자식 fiber.await — 자식의 PostStop hook 평가 + Scope close 끝까지 대기
4. 자기 PostStop signalQueue offer
5. 자기 fiber.await — 자기 PostStop hook 평가 + 자발 종료
6. 자기 instance Scope close (자동 cleanup)
7. registry.unregister
```

자식의 PostStop 이 호출되도록 _부모가 자식의 PostStop 처리 끝까지 await_. 이게 Akka 의 _graceful stop_ 의미.

**강제 interrupt 의 자리:** supervision strategy 가 _restart_ 일 때만 (M4). stop 흐름에선 항상 graceful.

### 결과
- (+) M2 LEARNINGS §11 자식 PostStop 미호출 한계 정확히 해결.
- (+) Akka Typed 사용자가 _구조적 친숙_.
- (+) `ctx.stop(child)` 가 명시 표면 — 부모가 자식 lifetime 통제.
- (-) shutdown 시간 = _가장 깊은 자식의 PostStop hook 시간 합_. 사용자가 PostStop 에서 hang 시키면 shutdown 도 hang. _timeout 강제_ 는 미정 (M4 또는 M5).
- (-) 구현 복잡도 — children TRef 순회 + Fiber.awaitAll. M2 의 단일 actor shutdown 보다 한 단계 복잡.

### M3.1 사이클 1 보강 — 도그푸딩 #2 사이클 5 의 race 대응

**1. spawn happens-before contract**
- spawnInternal 의 마지막 단계로 _자식 fiber 가 evaluateInitial (Setup 평가) 까지 끝낸 시점_ 을 await 함.
- 구현: `Deferred<void, never>` latch — runInterpreter 가 evaluateInitial 직후 `Deferred.succeed`, spawnInternal 이 `Deferred.await` 후 ref 반환. Setup 평가 도중 fail 도 supervision 외피 catchAllCause 안에서 latch.succeed 보장 → 영원 await 불가.
- 사용자 setup 안 ctx.spawn 들도 같은 보장 _재귀 전파_ — 부모 spawn 끝났다 = 모든 자식 setup 평가도 끝났다.

**2. sibling LIFO cascade 명시 (Akka 정통)**
- children 자료구조: `TRef<HashSet>` → `TRef<Chunk>` (insertion order 보존).
- stopActor 의 cascade: `Chunk.reverse` + `Effect.forEach({concurrency: 1})` 로 마지막 spawn 자식부터 순차 stop.

**3. Effect 3.21.2 TMap 버그 우회**
- 발견: `TMap.remove`/`removeAll` 가 `Chunk.partition` 의 [excluded, satisfying] 시맨틱을 잘못 다뤄 _hash 충돌이 같은 bucket 의 다른 엔트리들을 한꺼번에 비움_. `actor://<sys>/...` prefix 공유 키들이 공통 bucket 으로 떨어져 첫 unregister 한 번에 registry 가 텅 비는 증상.
- 우회: `Registry`, `entry.watchers`, `entry.watching` 모두 `TMap` → `TRef<HashMap>` 으로 교체 (atomic 갱신 그대로).
- upstream 보고 candidate (TMap 본체 버그). 라이브러리 측은 일단 우회로 unblock.

---

## ADR-032: 패키징 — source-direct export (도그푸딩 단계 한정)
- 상태: accepted (도그푸딩 #2 사이클 0 검증 완료)
- 일자: 2026-05-09
- 출처: M2 끝 도그푸딩 #1 입력 #5 → 도그푸딩 진입 자체를 막던 갭 해소
- 검증: 2026-05-09 도그푸딩 #2 사이클 0 — poly-phony vitest@4.1.5 환경에서 source-direct import _바로 동작_. 별도 loader / build step 없이 30줄 probe 통과 (LEARNINGS).

### 맥락
도그푸딩 #1 보류 사유 #5: `package.json` 의 `private: true` + `exports` 미설정 → poly-phony 가 file: dep 으로 path 해석 불가. 도그푸딩 진입 자체가 막힘.

세 노선 (도그푸딩 #1 입력에서 정리):
- (a) `private` 해제 + `exports: { ".": "./src/index.ts" }` — 소비측 tsx/ESM TS loader 가 source 직접 import
- (b) tsc build script + `exports: { ".": { "import": "./dist/...", "types": "./dist/..." } }` — npm publish 동작과 동일
- (c) npm publish (private registry 설정 필요)

ADR-027 의 정신: _빌드 도구는 M∞ 직전_. 즉 dist 빌드는 _M∞ 결정_. 도그푸딩 단계는 빌드 안 함.

### 결정
**(a) source-direct export 채택. 도그푸딩 단계 한정.**

`package.json` 갱신:
- `"private": true` 제거
- `"exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }` — source 직접
- `"files": ["src", "README.md", "LICENSE"]` — pnpm pack 시 포함
- `"publishConfig": { "access": "restricted" }` — _실수로 publish_ 차단 (M∞ 까지 publish X)

소비측 (poly-phony 등) 요구 사항:
- ESM TS loader (tsx, ts-node ESM 모드, vite, 또는 framework 의 dev server)
- 또는 자기 빌드 단계에서 `@loveqoo/effect-actor` source 를 같이 transform

도그푸딩 시 import 패턴:
```bash
# poly-phony 측에서
pnpm add file:../effect-actor
# 또는 pnpm workspace link (monorepo 인 경우)
```

### 결과
- (+) 도그푸딩 진입 _즉시 가능_ — 빌드 단계 0, source 변경 즉시 반영. 발견 사이클 단축.
- (+) ADR-027 의 _빌드 도구 M∞ 직전_ 정신 안 어김.
- (+) `publishConfig.access: restricted` 로 실수 publish 차단.
- (-) 소비측이 ESM TS loader 강제 — 일반 사용자 (M∞ 후) 는 부담. 단 도그푸딩 단계라 OK.
- (-) `exports.types` 가 `.ts` 직접 — TypeScript declaration 별도 생성 안 함. M∞ 빌드 시 dist + .d.ts + dual export 결정 (ADR-027 후속).

### 후속 (M∞ 직전)
- (b) 노선 결정 — tsup 또는 tsc emit 으로 `dist/` 생성, `exports` 를 `dist/index.js` + `dist/index.d.ts` 로 갱신.
- 0.1.0 publish 직전 ADR-033+ 로 빌드 도구 확정.

---

## ADR-033: effect 의존성 — peerDependencies + devDependencies 분리
- 상태: accepted (도그푸딩 #2 사이클 0 검증 완료)
- 일자: 2026-05-09
- 출처: 도그푸딩 #2 진입 직전 — 사용자가 effect 버전 차이 (effect-actor ^3.10.0 vs poly-phony ^3.21.2) 지적
- 검증: 2026-05-09 도그푸딩 #2 사이클 0 — poly-phony 측 effect@3.21.2 가 root node_modules 에 hoist, effect-actor symlink 가 그것을 가리킴. 단일 인스턴스 보장 (LEARNINGS).

### 맥락
ADR-027 시점에 `effect` 를 `dependencies` 로 두고 ^3.10.0 으로 박았음. 이후 갱신 안 함. 도그푸딩 #2 진입 시 두 가지 문제:

1. **모듈 인스턴스 분리 위험**: `effect` 는 라이브러리가 _자기 동작에 쓰는 런타임_ — Fiber / Scheduler / FiberRefs 가 _같은 module instance_ 여야 동작. `dependencies` 에 두면 사용자가 자기 effect 를 가질 때 _두 인스턴스_ 가 install 되어 actor 동작 실패 위험. pnpm 의 hoist 가 _같은 major_ 면 한 인스턴스 보장하지만 _확실 보장은 peerDep_.
2. **하한 버전 stale**: ^3.10.0 은 _당시 최신_, 현재 ^3.21.2. 우리 코드가 3.21 의 API (예: `Effect.timeoutFail` 옵션 형태) 사용하면 3.10 에선 fail.

### 결정
**`effect` 를 `peerDependencies` 로 옮긴다.** 추가로:

- **`peerDependencies.effect: ^3.10.0`** — 호환 범위 _넓게_ 유지 (사용자가 가진 effect 사용. major 같으면 호환 보장).
- **`devDependencies.effect: ^3.21.0`** — 우리 개발 환경 검증 버전. test / typecheck 시 사용.
- **버전 정책**: 우리가 _3.x 새 API_ 사용 시 peerDep 하한도 같이 올림. 도그푸딩에서 _하한 부족_ 발견되면 LEARNINGS + ADR.

`@effect/vitest` 같은 _Effect 생태계 패키지_ 는 devDep 그대로 (테스트 도구).

### 결과
- (+) 사용자 인스턴스 일치 보장 — actor Fiber 가 사용자 effect 와 같은 module 인스턴스 사용.
- (+) 사용자 effect 버전 자유 — 우리 호환 범위 (^3.10.0) 안에서 자기 결정.
- (+) 우리 검증 환경은 _최신 버전_ — devDep 으로 분리.
- (-) pnpm 의 strict-peer-dependencies 켜져 있으면 _peerDep 누락 시 install fail_. 사용자가 effect 안 갖고 있으면 명시적으로 install 해야. 라이브러리는 정통 방식이라 OK.
- (-) peerDep 하한 (^3.10.0) 이 _우리 검증 안 한 버전_ 까지 포함. 발견되면 ADR-033 하한 올림.

---

## 갱신 규칙

- 새 결정은 다음 ADR 번호로 추가.
- 결정이 뒤집히면 새 ADR 을 만들고 _이전 ADR 의 상태를 `superseded by ADR-XXX` 로_ 변경. 본문은 그대로 둠 (역사 보존).
- 잠정(accepted (잠정))은 도그푸딩 또는 첫 구현 후 _확정_ 으로 갱신.
