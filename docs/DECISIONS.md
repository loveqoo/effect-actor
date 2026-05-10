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
- 상태: superseded by ADR-042 (2026-05-09, M∞ 사이클 c — 도그푸딩 단계 끝, 배포용 tsc 빌드)
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

## ADR-034: Supervisor strategy 자료구조 + supervise 빌더 + 메타 추출 (M4 사이클 1)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M4 사이클 1 — 빌더 모양 결정

### 맥락
M4 진입에서 `Behaviors.supervise(b).onFailure(matcher, strategy)` 빌더 + Strategy ADT + meta 추출 단계 결정 필요. ADR-026 의 "_가장 바깥_ 채택, 안쪽 래퍼는 inner 안에 그대로" 는 _같은 종류_ 래퍼의 중첩 규칙. Supervise + WithMailbox 두 _다른 종류_ 래퍼 조합 (어느 순서로 nest 해도) 시 양쪽 모두 추출해야 자연스러움.

Akka Typed 의 `.onFailure[E1](r1).onFailure[E2](r2).onFailure[Throwable](r3)` 체인 — 가장 안쪽 (가장 먼저 추가된) 이 가장 specific, sequential 순회 → 첫 매치 채택. 미매치 = 기본 stop.

### 결정

**A. Strategy ADT (`src/supervision.ts`)**
```ts
type Strategy =
  | { _tag: "Resume" }
  | { _tag: "Restart" }
  | { _tag: "Stop" };

const Strategies = {
  resume:  { _tag: "Resume" }  as const,
  restart: { _tag: "Restart" } as const,
  stop:    { _tag: "Stop" }    as const,
};

type ErrorMatcher = (error: unknown) => boolean;
interface SupervisorRule { match: ErrorMatcher; strategy: Strategy }
```

**B. Behavior 래퍼 — Supervise 케이스 추가**
```ts
| {
    _tag: "Supervise";
    inner: Behavior<Msg>;
    rules: ReadonlyArray<SupervisorRule>;
    onFailure: (m: ErrorMatcher, s: Strategy) => SupervisedBehavior<Msg>;
  }
```

`receiveSignal` 패턴과 동일 — wrapper 자체가 fluent 호출 가능 (immutable, 새 객체 반환).

**C. `Behaviors.supervise(inner)` 빌더**
- 빈 rules 로 시작, `.onFailure(matcher, strategy)` 마다 _뒤에 append_ — _체인 순서 = 매처 순회 순서_.
- 빈 rules + 사이클 4 미구현이라 사이클 1 단계에선 실제 동작은 없음 (빌더 모양만). 사이클 2/3 에서 interpreter 가 rules 사용.

**D. `unwrapMeta` 확장**
- 기존 mailbox 추출에 supervisor 추출 추가.
- _두 _다른 종류_ 래퍼 양쪽 추출_: WithMailbox(Supervise(b)) 와 Supervise(WithMailbox(b)) 둘 다 mailbox + supervisor 모두 채택.
- _같은 종류 nested 는 가장 바깥 채택_ (ADR-026 유지): `Supervise(Supervise(b))` 면 outer rules 만, inner Supervise 는 inner 안에 그대로.
- 알고리즘: 외곽에서 두 종류 래퍼를 _각각 한 번씩_ 벗기되 (중복 안 함), 어느 순서로 와도 양쪽 모두 잡음 (구현은 최대 2회 loop).

**E. BehaviorMeta 갱신**
```ts
interface BehaviorMeta<Msg> {
  mailboxPolicy: MailboxPolicy;
  supervisor: ReadonlyArray<SupervisorRule>;  // 빈 배열이면 기본 (stop)
  inner: Behavior<Msg>;
}
```

### 결과
- (+) Akka Typed 빌더 모양 그대로 (`receiveSignal` 패턴 일관).
- (+) WithMailbox / Supervise 직교 — 사용자 nest 순서 자유.
- (+) ADR-026 의 "같은 종류 nested = 가장 바깥" 규칙 유지. 다른 종류 조합만 양쪽 추출.
- (+) 사이클 1 산출이 사이클 2/3 의 interpreter 분기에 _그대로_ 입력.
- (-) 다른 종류 래퍼 추출은 _최대 2회 loop_ — ADR-026 의 "한 겹만" 보다 약간 복잡. 그러나 사용자 표면은 동일 (직관적).
- (-) Nested Supervise (사용자가 의도해서) 는 inner 안에 갇힘 — interpreter 가 그것 까지 catch 안 함. 필요하면 후속 ADR. M4 사이클 1 범위 밖.

### 후속 (M4 사이클 4)
- ErrorMatcher chain 의 sequential 순회 + 첫 매치 채택 알고리즘 ADR. (가장 안쪽이 가장 specific 규약 명시.)
- 매처 헬퍼 (`Strategies.matchTag`, `Strategies.matchInstance`) 시안.

---

## ADR-035: 액터 Scope 모델 정정 — lifetime + instance 분리 (M4 사이클 3)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M4 사이클 3 — Restart 흐름 설계 중 ADR-020/021 invariant 충돌 해소

### 맥락
ADR-020: "supervision = interpreter 와 _같은 fiber_". restart 시 fiber 가 살아있어야 PreRestart 발사 + 후속 정리 가능.

ADR-021: "instance Scope = restart 시 _닫고 새로_". 사용자 fork/timer/scoped resource 자동 정리.

기존 `ActorEntry.scope` 는 단일 Scope.CloseableScope 였고, spawn 시 `Effect.forkIn(runInterpreter(...), scope)` 로 _interpreter fiber 자체_ 를 그 scope 에 박았다. Restart 가 그 scope 를 close 하면 _interpreter fiber 도 같이 죽음_ — ADR-020 invariant 위배. 즉 두 ADR 이 _같은 scope 를 다른 lifetime 으로_ 보고 있어 충돌.

Akka 의 ActorCell 도 _자기 자식 actor + user resource_ 가 자기 scope, _자기 fiber 자체_ 는 부모 scope. 두 lifetime 분리.

### 결정
**ActorEntry 에 두 Scope 필드:**

| 이름 | 타입 | 의미 | restart 시 |
|---|---|---|---|
| `cellScope` | `Scope.CloseableScope` (immutable) | 액터 _전체 lifetime_ — interpreter fiber 가 여기 fork. spawn~stop 1회 사용. | 그대로 (fiber 보존) |
| `instanceScope` | `TRef<Scope.CloseableScope>` (mutable) | 액터 _instance lifetime_ — 사용자 fork/timer/scoped resource. `cellScope` 의 fork. | close + 새로 (Scope.fork(cellScope)) |

**관계:**
- `instanceScope` 는 `cellScope` 의 child scope (`Scope.fork(cellScope)`).
- `cellScope.close` → `instanceScope` 도 자동 cleanup. 즉 stop 흐름은 cellScope 한 줄 close 면 둘 다 정리.
- restart 흐름만 instanceScope 만 close + 새 fork.

**스폰 갱신:**
```ts
const cellScope = yield* Scope.make();
const instanceScope = yield* Scope.fork(cellScope, ExecutionStrategy.sequential);
// fiber 는 cellScope 에 fork — restart 거쳐도 살아남음
const fiber = yield* Effect.forkIn(runInterpreter(...), cellScope);
```

**Stop 갱신:** `Scope.close(entry.cellScope, Exit.void)` — instanceScope 도 자동.

**Restart 갱신 (사이클 3):**
1. PreRestart 신호 처리
2. 자식 cascade stop
3. `Scope.close(currentInstanceScope, Exit.void)` — 사용자 fork/timer/scoped 만 정리. fiber 살아있음.
4. `newInstanceScope = Scope.fork(cellScope, ...)` + `TRef.set(entry.instanceScope, newInstanceScope)`
5. Setup 재평가 (initial 그대로) + loop 재진입

### 결과
- (+) ADR-020 (같은 fiber) + ADR-021 (instance Scope 자동 정리) 둘 다 _동시 만족_.
- (+) Restart 가 _fiber 자살_ 없이 가능. instance 자원만 cleanup.
- (+) Stop 흐름은 cellScope 한 줄 close 로 동일 — boilerplate 안 늘어남.
- (+) Akka ActorCell 의 lifetime 모델 그대로 (cell 영구 + restart 마다 새 instance).
- (-) ActorEntry 필드 +1, spawn 단계 +1 (Scope.fork). 약간 복잡.
- (-) 사용자 ctx.fork (M5+) 시 어느 scope 에 fork 할지 명시 — instanceScope. ADR-021 표 _interpreter fiber_ 항목 추가.

### 후속 (사이클 3 본체)
- entry.ts: `cellScope` + `instanceScope: TRef` 분리. `scope` 필드명은 `cellScope` 로 rename.
- system.ts: spawn/stop 갱신. instance scope 갱신 헬퍼.
- ARCHITECTURE.md §3.7 Scope 표에 _interpreter fiber → cellScope_ 한 줄 추가 (별도 갱신).

---

## ADR-036: Error matcher 헬퍼 + 순회 약정 (M4 사이클 4)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M4 사이클 4 — `.onFailure(matcher, strategy)` 의 _매처 작성 표면_ + 순회 알고리즘 명시

### 맥락
사이클 1~3 에서 `ErrorMatcher = (e: unknown) => boolean` 자유 함수 + `pickStrategy` sequential 순회 + 첫 매치 채택은 이미 구현. 사이클 4 의 결정 거리:

1. **TypeScript 에서 _Akka 의 `[E]` 타입 매칭_ 표면을 어떻게 줄 것인가?**
   - Akka: `.onFailure[IllegalStateException](Strategy.restart)` — _타입 자체_ 가 매처.
   - JS/TS 는 이걸 못 함 — class `instanceof` 또는 `_tag` 술어가 가장 가까움.
   - 옵션 A: `.onFailure(ctor, strategy)` 오버로드 — class constructor 자동 인식. 자연스러움 ↑, TS 시그너처 분기 어려움.
   - 옵션 B: 헬퍼 (`Strategies.matchInstance(Ctor)`) — 사용자 합성. boilerplate 약간, 구현 단순, 표면 일관.
   - **옵션 B 채택** — ADR-028 (_라이브러리 정통, boilerplate 는 사용자 측 wrapper_) 정신.

2. **순회 약정 명시.**
   - 빌더 `.onFailure` 는 _뒤에 append_ → rules 배열 _인덱스 0 = 첫 호출 = 가장 안쪽 = 가장 specific_.
   - `pickStrategy` 는 0 부터 sequential 순회 → 첫 매치 채택. 미매치 = 기본 stop.
   - Akka 의 "가장 안쪽이 가장 구체적" 약정 그대로.

3. **Cause squash 정책 재확인.**
   - 사이클 2 그대로: `Cause.failureOption` → `Cause.defects` → cause 자체.
   - 의도적 — interrupted cause 는 매처 매칭 어려움. restart 회피.
   - 사용자가 _interrupted 도 잡고 싶다_ → matcher 안에서 `Cause.isInterruptedOnly` 직접 검사 (advanced).

### 결정

**A. `Strategies` 네임스페이스에 매처 헬퍼 3개:**

```ts
Strategies.matchInstance<T>(Ctor: new (...args: any[]) => T): ErrorMatcher
Strategies.matchTag(tag: string): ErrorMatcher  // Effect.TaggedError 또는 _tag 필드 객체
Strategies.matchAll: ErrorMatcher  // catch-all (() => true)
```

사용:
```ts
Behaviors.supervise(b)
  .onFailure(Strategies.matchInstance(IllegalStateException), Strategies.restart)
  .onFailure(Strategies.matchTag("DeathPactException"), Strategies.stop)
  .onFailure(Strategies.matchAll, Strategies.stop)
```

또는 사용자가 직접 인라인 함수 — 표면 일관 (`ErrorMatcher` 자유 함수).

**B. 순회 알고리즘 (불변):**
- `pickStrategy(rules, cause)` 는 인덱스 0 부터 sequential 순회.
- 첫 `match(error) === true` rule 의 strategy 채택.
- 미매치 → `Strategies.stop`.
- 빈 rules → `Strategies.stop` (기본).
- _체인 순서가 정렬 순서_ — 사용자가 specific → general 순으로 작성.

**C. `_tag` 매칭 의미** — `matchTag("X")` 는 `error._tag === "X"` 검사 (객체 + string tag). 객체 아니거나 tag 없으면 false. `Effect.TaggedError` / `Data.tagged` / 사용자 tagged ADT 모두 호환.

### 결과
- (+) 사용자 boilerplate 작음 — `Strategies.matchInstance(Error)` 한 줄.
- (+) Akka 의 `[E]` 표면과 _구조적 친숙_ — 매처 위치만 다름.
- (+) `pickStrategy` 알고리즘 변경 X — 사이클 2 구현 그대로 유지. 헬퍼만 추가.
- (+) Effect 의 `Data.tagged` / `TaggedError` 와 자연 호환 (`matchTag`).
- (-) Akka 처럼 _컴파일 타임 타입 체크_ 안 됨 — runtime instanceof 만. TS 의 한계.
- (-) interrupted cause 잡기 어려움 (의도) — advanced 사용자가 직접 cause 검사.

### 후속 (M5+)
- `Strategies.matchSchema(...)` 시안 (Effect Schema 기반 매칭) — 도그푸딩 입력 후.
- 매처 합성 헬퍼 (`Strategies.or`, `Strategies.and`) — 필요 시.

---

## ADR-037: restart 한도 + PreRestart 재실패 통일 정책 (M5 사이클 1)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M5 사이클 1 — `Strategies.restart.withLimit` 도입 + 의제 3 (PreRestart 재실패) 묶음

### 맥락
M4 후속 사이클 2 에서 _stop/cleanup 경로 정합성_ 단일화 (`onSelfTermination` + PostStop hook 단일 source of truth). 그 직후 M5 진입 시점에 다음 두 사실을 인지:

1. **`withLimit` 의 한도 초과** = restart loop 안에서 _stop 강등_ — 기존 supervisor stop 강등 경로 (`needStop` 분기) 와 _semantic 동일_.
2. **의제 3 (PreRestart 재실패)** = restart 흐름 도중 _stop 강등_ — 위와 같은 분기.

→ 두 fix 모두 `messageLoop` 의 restart 분기 한 군데를 보강하면 끝남. 한 사이클 묶어 일관 정책 박는 게 자연스러움. _라이브러리 설계 우선_ (ADR-028) 정신.

### 결정

**A. `Strategies.restart.withLimit({ maxNrOfRetries, withinTimeRange })` 빌더.**

```ts
// 무한 restart (Akka 기본)
Strategies.restart  // limit: null

// 한도 부착
Strategies.restart.withLimit({
  maxNrOfRetries: 5,
  withinTimeRange: "1 minute",  // Duration.DurationInput 그대로
})
```

`Strategies.restart` 는 _Strategy + withLimit 빌더_ 합성 객체. `withLimit` 호출은 _새_ Strategy 객체 (limit 채워진) 반환. 원본 `Strategies.restart` 는 `limit: null` 그대로 (immutability).

**B. 한도 검사 = Akka 정통 — restart _시도 자체_ 가 카운트.**

- `messageLoop` 안 mutable `restartHistory: number[]` (한 fiber lifetime).
- restart 분기 진입 시: `now` 추가 + 윈도우 밖 timestamp 슬라이드 제거.
- `restartHistory.length > maxNrOfRetries` → stop 강등.
- 비교가 `>` 인 이유: `maxNrOfRetries=5` → 1, 2, 3, 4, 5 번째 시도는 모두 restart, 6 번째가 stop. Akka 와 동일.

**C. PreRestart 재실패 → stop 강등 (의제 3).**

- 기존: `yield* interpretSignalStep(lastActive, ctx, PreRestart)` → fail 시 외부 propagate (외피 catchAllCause 가 hook 호출, 그러나 `onSelfTermination` 우회).
- 변경: `Effect.exit` 으로 캡처 → `Exit.isFailure` 면 `needStop = true; stopCause = preRestartExit.cause`.

**D. stop 강등 cause 어휘.**

- 한도 초과: `Cause.die(new RestartLimitExceeded({ path, maxNrOfRetries, windowMillis, attemptCount }))`.
- PreRestart 재실패: `preRestartExit.cause` 그대로 (사용자 코드의 본 cause 보존).
- supervisor 매처 stop / 미매치: `exit.cause` 그대로 (M4.1 기존 동작).

세 케이스 모두 _기존 stop 강등 경로_ (PostStop hook + `onSelfTermination` + `Effect.failCause`) 재사용 → cleanup 단일 source of truth.

**E. supervise 외피 _안쪽_ 이라 `RestartLimitExceeded` 는 사용자 onFailure 에 다시 안 잡힘.**

`messageLoop` 의 restart 분기에서 발생 → 그대로 `Effect.failCause` 로 fiber 종료. 외피 catchAllCause 는 onFailure hook (parent ChildFailed 알림) 만 호출. 의도된 동작 — 한도 초과 cause 가 다시 restart 트리거하면 무한 루프.

### 결과
- (+) 사용자 표면 추가 1 줄 — `.withLimit({ maxNrOfRetries, withinTimeRange })`. Akka 모양 그대로.
- (+) restart 한도 + PreRestart 재실패 + supervisor stop 강등 _세 케이스 모두 같은 cleanup 경로_ — 회귀 안전 (M4.1 패턴 그대로 확장).
- (+) `restartHistory` 가 mutable JS array 단순 — TRef/STM 없음. 한 fiber 안 단일 owner 라 동시성 문제 없음.
- (+) 윈도우 sliding 은 `now - timestamp > windowMs` 단순 비교 — Schedule API 의존 X (사이클 2 backoff 와 분리).
- (-) `restartHistory` 가 entry 가 아닌 _supervise lifetime_ 에 묶임 — 문서화 필요 (사용자가 이해해야 reset semantics 명확).
- (-) Akka 처럼 _backoff_ + `withLimit` 조합은 사이클 2 에서 추가 (이번 사이클은 한도만).

### 후속 (M5 사이클 2+)
- `Strategies.restartWithBackoff(opts).withLimit(...)` chain — 사이클 2 에서 backoff loop 의 sleep 단계와 한도 검사 통합.
- _자발 Stopped 후 cellScope 누수_ + _자발 Stopped 시 자식 cascade_ — 같은 _stop/cleanup_ 패밀리지만 다른 분기 (자발 Stopped 흐름). M∞ 본격 도그푸딩에서 표면 빈도 보고 별도 ADR.

---

## ADR-038: restartWithBackoff — 점진 sleep + jitter + .withLimit chain (M5 사이클 2)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M5 사이클 2 — `Strategies.restartWithBackoff` 빌더 + `messageLoop` 의 backoff sleep 분기

### 맥락
ADR-037 (사이클 1) 에서 `Strategies.restart.withLimit` + restart-cleanup 통일 정책을 정함. 사이클 2 의 거리:

1. **Strategy ADT 형태** — option A: `Restart` 에 `backoff` 필드 추가, option B: 새 `_tag` (`RestartWithBackoff`) 분리.
2. **attemptIndex 카운터 공유 vs 별도** — 사이클 1 의 `restartHistory` (한도 윈도우) 를 backoff 도 공유할지, 별도 `backoffAttemptIndex` 를 둘지.
3. **jitter 의 방향** — Akka 정통 (+ 만) vs 양방향 (±factor).
4. **backoff sleep 도중 외부 신호** — sleep 도중 `sys.shutdown` 또는 `ctx.stop` 이 와도 sleep 끝까지 기다릴지, race 로 즉시 깨울지.

### 결정

**A. ADT 형태 — option A (`Restart` 에 `backoff: BackoffConfig | null` 추가).**

```ts
export type Strategy =
  | { _tag: "Resume" }
  | {
      _tag: "Restart";
      limit: RestartLimit | null;
      backoff: BackoffConfig | null;
    }
  | { _tag: "Stop" };
```

- (+) interpreter 분기 변경 최소 — 기존 `if (strategy._tag === "Restart")` 그대로, 안에서 `strategy.backoff` 체크만 추가.
- (+) `Strategies.restart` (사이클 1) 와 `Strategies.restartWithBackoff` (사이클 2) 의 _반환 타입 동형_ — 둘 다 `Strategy & { withLimit: (limit) => Strategy }`. `.withLimit` chain 자연스러움.
- (-) `Restart._tag === "Restart"` 한 분기 안에 두 변종 — 사용자가 디버그 시 `backoff !== null` 도 봐야. ADT 명시성 약간 낮음. 의도적 trade-off.

**B. attemptIndex 카운터 공유 — `restartHistory` 를 둘 다 사용.**

- 한도 검사: `restartHistory.length > maxNrOfRetries` (윈도우 슬라이드 후).
- backoff: `attemptIndex = restartHistory.length - 1` (push 후 length, 0-based).
- _push 는 항상_ — limit 무관 (사이클 1 의 _limit 있을 때만 push_ 가 사이클 2 의 backoff-only 케이스에서 attemptIndex 항상 0 = minBackoff 만 sleep 버그 일으킴, 첫 구현에서 발견).
- 윈도우 슬라이드는 _limit 있을 때만_. backoff 만 있으면 슬라이드 X → `restartHistory` 무한 증가. 메모리: 1년 30만 fail = ~2.4MB, 작음. _limit 부착 권장_ 으로 문서화.

→ 두 fix 모두 `messageLoop` 의 _restart 분기 한 군데_ 에 통합. 코드 단순.

**C. jitter — Akka 정통 (+ 방향만).**

```ts
const jittered = randomFactor > 0 ? exp * (1 + Math.random() * randomFactor) : exp;
```

- - 방향 jitter 는 sleep 너무 짧음 → backoff 의미 약화.
- Akka `BackoffSupervisor` 도 같은 공식. 일관성.
- `randomFactor: 0` 기본 — 결정성 (테스트 친화).

**D. backoff sleep 도중 외부 신호 — sleep 끝까지 기다림 (단순 path).**

- `Effect.sleep(delay)` 는 interruptible. 그러나 `stopActor` 는 `fiber.await` 만 호출 (interrupt X, M3 ADR-031) → sleep 도중 sys.shutdown 도 sleep 끝까지 기다림.
- maxBackoff 가 길면 (예: 1분) sys.shutdown 도 1분 걸림 — 의도된 trade-off.
- _race 로 sleep 깨우는 안_ (backoff sleep + signalQueue.take 경합) 은 코드 복잡도 늘리고 _backoff 의 의미_ 흐림 (sleep = "기다린 후 시도"). M∞ 본격 도그푸딩에서 표면 빈도 보고 별도 fix.

**E. 사용 표면.**

```ts
Behaviors.supervise(b)
  .onFailure(
    Strategies.matchAll,
    Strategies.restartWithBackoff({
      minBackoff: "100 millis",
      maxBackoff: "10 seconds",
      randomFactor: 0.2,  // 옵셔널, 기본 0
    }).withLimit({ maxNrOfRetries: 10, withinTimeRange: "1 minute" })
  )
```

- `withLimit` chain 가능 — 사이클 1 빌더와 동형.
- `Duration.DurationInput` 그대로 — `"100 millis"`, `Duration.seconds(1)` 모두 OK.
- `computeBackoffDelay(attemptIndex, BackoffConfig)` 도 export — 사용자가 직접 sleep 합성하고 싶을 때 또는 단위 테스트.

### 결과
- (+) Akka 정통 시그너처 + .withLimit chain — 마이그레이션 친숙.
- (+) 사이클 1 의 코드 경로 그대로 확장 (한 군데 보강) — 회귀 0 (사이클 1 의 모든 테스트 그대로 통과).
- (+) `restartHistory` 단일 carrier — 한도 + backoff 가 _같은 윈도우_ 공유. 사용자 모델 단순.
- (+) backoff sleep 도중 mailbox 보존 자동 — 사용자가 의식할 필요 X.
- (-) backoff-only (no limit) 사용 시 `restartHistory` 무한 증가 — 메모리 작지만 누수. _limit 부착 권장_ 으로 문서화.
- (-) backoff sleep 도중 sys.shutdown 도 sleep 끝까지 기다림 — UX trade-off.

### 후속 (M5+)
- `Strategies.restartWithBackoff` 의 `withResetBackoffAfter` (Akka) — 일정 시간 fail 없으면 backoff 카운트 reset. 현재 `withLimit` 의 윈도우와 묶여 있어 효과 일부 있음, 명시 분리는 별도.
- backoff sleep 도중 `Effect.race(sleep, signal)` 로 stop 즉시 응답 — M∞ 표면 빈도 보고.

---

## ADR-039: Behaviors.withTimers + ctx.fork + ctx.scheduleOnce (M5 사이클 3)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M5 사이클 3 — Akka Typed 의 `Behaviors.withTimers` + `TimerScheduler` + `ctx.scheduleOnce` 매핑 + ctx.fork 표면 도입

### 맥락
M5 사이클 1+2 에서 supervision (한도 + backoff) 끝남. 사이클 3 의 거리:

1. **`Behaviors.withTimers` 의 ADT 형태** — option A: 새 ADT 노드 (`WithTimers`) + `unwrapMeta` + `interpreter` 분기, option B: setup 위 헬퍼 (새 ADT 노드 X).
2. **timer fiber 의 lifetime** — entry 의 instanceScope (ADR-021 의 _restart 시 닫힘_) 가 자연스러운 owner. 사용자 직접 `ctx.fork` 표면도 같은 scope.
3. **자발 Stopped 시 instanceScope cleanup** — ADR-035 / ADR-037 후속 의제로 미뤄놓은 것 중 _instanceScope 누수_ 부분이 사이클 3 의 _stop 시 timer 자동 cancel_ 검증으로 자연 노출. 부분 fix 가 사이클 3 안.
4. **`evaluateInitial` 의 setup chain 처리** — `withTimers` 가 setup-like (option B 채택 시) 라 `setup → setup` chain. 기존 evaluateInitial 은 한 번만 풀음 → loop 형태 변경 필요.

### 결정

**A. `Behaviors.withTimers` = setup 위 헬퍼 (option B).**

```ts
withTimers: <Msg>(
  f: (timers: Timers<Msg>) => BehaviorEffect<Msg>,
): Behavior<Msg> => ({
  _tag: "Setup",
  init: (ctx) =>
    Effect.flatMap(
      makeTimers<Msg>({
        cell: ctx.self.cell,
        forkInInstanceScope: ctx.fork,
      }),
      f,
    ),
}),
```

새 ADT 노드 X — `unwrapMeta` / interpreter 분기 변경 X. 표면만 추가. Akka 의 `Behaviors.withTimers((timers) => ...)` 모양 동일.

이유:
- (+) ADT 단순. 새 종류 늘어나면 _모든_ 분기 (interpreter, unwrapMeta, Behavior union) 수정 필요 — option B 는 이 비용 회피.
- (+) `withStash` (사이클 4) 도 같은 패턴 가능 — 일관 표면.
- (-) `unwrapMeta` 가 _timer 사용 여부_ 추출 못함. 그러나 timer 는 _런타임_ 에 setup init 안에서 만들어지므로 _spawn 0단계_ 에 알 필요 없음. 자연스러움.

**B. `ctx.fork(eff): Effect<RuntimeFiber>` + `ctx.scheduleOnce(delay, target, msg): Effect<void>` 표면 도입.**

```ts
readonly fork: <A, E>(
  eff: Effect.Effect<A, E>,
) => Effect.Effect<Fiber.RuntimeFiber<A, E>>;

readonly scheduleOnce: <M>(
  delay: Duration.DurationInput,
  target: ActorRef<M>,
  msg: M,
) => Effect.Effect<void>;
```

`fork` 는 _entry.instanceScope 에 fork_ — restart/stop 시 자동 interrupt. 사용자가 직접 timer/loop 만들거나 streams 처리할 때 사용.

`scheduleOnce` 는 `fork(sleep + target.tell)` 의 헬퍼. Akka 의 `ctx.scheduleOnce` 와 동등.

내부적으로 `withTimers` 도 이 fork 사용 — _단일 통로_ 로 instanceScope 관리.

**C. `evaluateInitial` 의 setup chain loop 처리.**

`withTimers` 가 setup-like 라 사용자 코드:
```ts
Behaviors.setup((ctx) => Effect.sync(() => 
  Behaviors.withTimers((timers) => ...)
))
```
는 _setup → setup_ chain. 기존 `evaluateInitial` 은 한 번만 풀음 → `withTimers` 의 init 호출 안 됨 = timer 등록 X.

변경: `while (cur._tag === "Setup") { cur = yield* cur.init(ctx); }` loop. 사용자가 무한 setup 만들면 무한 loop — 사용자 책임 (Akka 도 같음).

회귀 안전 — 기존 setup 은 Setup 이외 (Receive/Stopped/Same) 반환하면 loop 즉시 끝.

**D. 자발 Stopped 시 `notifyWatchersOnSelfTermination` 가 instanceScope close.**

- 자발 Stopped 흐름은 _자기 fiber 가 자기 cleanup 호출_. 자기 fiber 는 cellScope 안 → 자기 instanceScope close 해도 자기는 안 다침 (instanceScope 의 fork 들만 interrupt).
- ADR-035 의 _자발 Stopped 후 instanceScope 누수_ 의제 부분 fix. cellScope 누수 + 자식 cascade 는 그대로 ADR-037 후속 의제.
- ADR-039 가 _timer 의 자동 cleanup 보장_ 을 약속하기 위해 필요.

### 결과
- (+) Akka 표면 그대로 — 마이그레이션 친숙.
- (+) `ctx.fork` 가 _instance scope 의 단일 통로_ — `withTimers` / `scheduleOnce` / 사용자 직접 fork 모두 같은 lifecycle.
- (+) restart/stop 시 timer 자동 cleanup — 사용자 의식 X.
- (+) ADT 변경 X — `withTimers` 가 setup 위 헬퍼. `withStash` (사이클 4) 도 같은 패턴.
- (+) ADR-035/037 후속 의제의 _instanceScope 누수_ 부분 자연 fix.
- (-) `unwrapMeta` 가 _timer 사용 여부_ 추출 못함 — spawn 단계에 사전 정보 X. 그러나 timer 는 런타임 자원이라 의미 없음.
- (-) `evaluateInitial` 의 setup 무한 loop 위험 — 사용자 책임. Akka 도 같음.

### 후속 (M5+)
- `Behaviors.withStash` (사이클 4) 도 같은 setup 위 헬퍼 패턴.
- `startTimerAtFixedRate` (Akka 별도) — fixedDelay 와 의미 다름 (offer 시점 고정 vs 간격). 도그푸딩 입력 후 결정.
- `ctx.fork` 의 fail/defect 전파 정책 — 현재 fire-and-forget, fail 시 silent. supervision 통합은 _복잡_ — 별도 ADR 필요 시.

---

## ADR-040: Behaviors.withStash + StashOverflow + unstashAll 의 직접 적용 (M5 사이클 4)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M5 사이클 4 — Akka Typed 의 `Behaviors.withStash` + `StashBuffer` 매핑

### 맥락
사이클 3 의 `withTimers` 패턴 (setup 위 헬퍼) 그대로 적용 가능. 사이클 4 의 거리:

1. **`unstashAll` 의 메시지 처리 방식** — option A: stashed 메시지를 mailbox 에 다시 offer (단순, 그러나 _순서 섞임_), option B: `interpretStep` 직접 적용 (Akka 정통, 정확).
2. **buffer 자료구조** — `TRef<Chunk<Msg>>` (단순, STM 안 idempotent) vs Effect Queue (capacity 내장).
3. **StashOverflow 의 fail 채널 전파** — `stash()` 가 typed err 반환 → 사용자 catch 또는 supervision 분기.
4. **unstashAll 도중 step fail / Stopped** — propagate vs 부분 처리.

### 결정

**A. `unstashAll(next)` = `interpretStep` 직접 적용 (option B).**

```ts
const unstashAll = (next: Behavior<Msg>): Effect.Effect<Behavior<Msg>, unknown> =>
  Effect.gen(function* () {
    const drained = yield* STM.commit(...);  // buffer 비우고 메시지 배열 추출
    let cur: Behavior<Msg> = next;
    for (const msg of drained) {
      cur = yield* interpretStep(cur, ctx, msg);
      if (cur._tag === "Stopped") return cur;
    }
    return cur;
  });
```

이유:
- (+) Akka 정통 — _stashed 메시지가 mailbox 새 메시지보다 먼저_ 처리. mailbox FIFO + offer 패턴은 이 순서 보장 X (offer 가 _현재 mailbox 끝_ 에 추가).
- (+) `next` 자체가 _stashed 메시지를 처리하는 새 behavior_ → unstashAll 결과가 _최종_ behavior. 다음 mailbox 메시지부터 새 behavior 가 받음.
- (+) 도중 Stopped 면 즉시 멈춤 — _자발 종료_ 의미 보존 (남은 stashed 메시지 자동 버림).
- (-) `unstashAll` 의 fail 채널 = `unknown` (interpretStep 의 BehaviorEffect 도 unknown). 사용자 표면에서 `Effect.Effect<Behavior<Msg>, unknown>`. 일관 — 다른 Behavior 흐름과 동일.

**B. buffer = `TRef<Chunk<Msg>>` (단순).**

- Effect Queue 도 capacity 가능하지만 _STM 트랜잭션 외부_ — capacity 검사 + append 가 _atomic_ 안 됨.
- TRef<Chunk> 는 STM 안에서 `size 검사 → fail | append` 하나의 트랜잭션. race 안전.
- Chunk 의 immutable append/clear 가 단순.

**C. StashOverflow = Tagged error, fail 채널 전파.**

```ts
readonly stash: (msg: Msg) => Effect.Effect<void, StashOverflow>;
```

- 사용자가 _명시 catch_ 가능: `stash.stash(m).pipe(Effect.catchTag("StashOverflow", () => ...))`.
- catch 안 하면 step fail → supervision 분기 — 기존 ADT (`Strategies.matchTag("StashOverflow")`) 그대로.
- ADR-012 의 _계층적 에러 어휘_ + ARCHITECTURE.md §4.5 의 _StashOverflow → supervision 대상_ 약속 그대로.

**D. unstashAll 도중 step fail = propagate.**

interpretStep 가 fail/die 면 unstashAll 의 generator 가 그대로 propagate. 외부 `messageLoop` 가 잡고 supervision 분기. 즉 사용자 handler 가 stashed 메시지 처리 도중 fail 하면 _Restart 시 stash buffer 새로_ — _자연스러운 의미_.

### 결과
- (+) Akka 시그너처 그대로 — `Behaviors.withStash[T](capacity) { stash => ... }`.
- (+) Akka 정통 순서 보장 — stashed 메시지가 mailbox 새 메시지보다 먼저.
- (+) restart 시 buffer 자동 비움 (사이클 3 의 `withTimers` 와 동형 — setup 재실행 = 새 인스턴스).
- (+) supervision 결합 자연 — `Strategies.matchTag("StashOverflow")` 로 명시적 정책.
- (+) 새 ADT 노드 X — 사이클 3 패턴 일관.
- (-) `interpretStep` 가 사용자 표면에 노출됨 (이미 index.ts 에 export). _사용자 직접 호출 안 권장_ 이지만 stash 가 internal-only 였으면 더 깔끔. 일단 _internal-public_ 그대로.
- (-) Akka 의 `unstashAll(behavior, numberOfMessages?)` 부분 unstash 는 _미지원_ — 사이클 4 단순. 도그푸딩 입력 후.

### 후속 (M5+)
- `unstash(behavior, n)` 부분 unstash — Akka 별도 메서드.
- _stash 메시지 인덱싱 / 필터링_ — Akka 미지원이라 우리도 안 함.

### 부가 발견 — _Effect 밖 throw_ 가 supervision 통과 X (테스트 작성 중 노출)
사이클 4 테스트 작성 중 `(m) => { if Boom throw }` 같은 _직접 throw_ 가 fiber die 로 propagate 되지 _않음_ 발견. handler 호출 _자체_ 가 throw → `interpretStep` 의 `Effect.map(handler(ctx, msg), ...)` 가 만들어지기 _전_ 에 throw → `messageLoop` 의 `Effect.exit(stepEffect)` 가 못 잡음.

**Resolved (2026-05-09, 미니 사이클)**: `interpretStep` / `interpretSignalStep` 안에서 handler/onSignal 호출을 `Effect.suspend(() => current.handle(ctx, msg))` 로 wrap. lazy thunk 가 throw 잡아 die 로 전환 → supervision 작동.

- wrap 위치 = `interpreter.ts` 의 두 step 함수 (NOT `behavior.ts` 의 `makeReceive`). 이유: makeReceive 에 wrap 하면 `ReceiveBehavior.handle` / `onSignal` 의 _참조 동일성_ 깨짐 → 기존 behavior.test.ts 의 `expect(b.handle).toBe(handler)` 회귀 5건. `interpreter` 안 wrap 은 ADT 표면 보존 + 안전망만 추가 → 회귀 0.
- 회귀 테스트 4 (system.test.ts 끝): receiveMessage 직접 throw / receive 직접 throw / receiveSignal 직접 throw (PreRestart 재실패 경로) / Effect.sync 패턴 회귀.
- 사용자 표면 변경 X — 기존 `Effect.sync(() => throw)` 패턴 그대로 동작 + _직접 throw_ 도 잡힘. 사용자 학습 비용 0.
- suspend 한 단계 lazy 비용 무시 가능 — 이미 messageLoop 가 step 단위 `Effect.exit` 함.

201 테스트 (이전 197 + 회귀 4). 5회 flake-free.

---

## ADR-041: semver 정책 + 1.0 진입 조건 + CHANGELOG 형식 + deprecation (M∞ 직전)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M∞ 진입 — DX SCORECARD F6 의 _semver M∞ 직전 결정_ + ADR-006 의 _0.x 알파_ 명시 후속 + 도그푸딩 #4 통과 후 npm 배포 직전

### 맥락
M5 _전체_ DoD 🟢 (도그푸딩 #4 통과). 이제 0.1.0 첫 npm 배포 직전. 배포 후 _사용자 의존성 계약_ 이 시작되므로 _semver 정책_ 을 미리 박아둬야:

1. **0.x 단계의 의미** — SemVer 표준 (`major.minor.patch`) 은 _major 가 breaking_. 그러나 0.x 는 _초기 알파_ 단계라 minor 도 breaking 가능. Akka / Cats Effect / 많은 EffectTS 생태계가 _0.x 에서 minor=breaking_ 약정.
2. **1.0 진입 시점** — _언제_ stable? Cluster/Persistence 까지? 도그푸딩 추가 통과? 외부 사용자 issue 라운드 후?
3. **CHANGELOG 형식** — Keep a Changelog 형식 _수기_ vs conventional commits → release-please 자동화.
4. **Deprecation 정책** — 0.x 단계는 _즉시 제거_ 가능 vs 한 minor 동안 warning.

### 결정

**A. 0.x 정책 — minor = breaking, patch = fix/internal.**

```
0.x.y
├─ y (patch): bug fix, internal refactor, doc change, deprecation 추가 (제거 X)
└─ x (minor): breaking change, 새 기능, 사용자 표면 ADT/시그너처 변경
```

이유:
- (+) Akka / Cats Effect / 많은 EffectTS 라이브러리 정통 — 사용자 학습 비용 0.
- (+) npm 의 `^0.x.y` 는 _patch only_ 자동 — 사용자가 `^0.1.0` 으로 의존하면 _자동 minor 업그레이드 X_. _minor=breaking_ 의 자연 보호.
- (+) 0.x = _알파_ (ADR-006) 정신 그대로 — 사용자가 _주의_ 하고 의존.
- (-) SemVer 표준과 다름 — 사용자가 _major=breaking_ 가정 시 혼란. README 첫 줄 _주의_ 명시.

**B. 1.0 진입 조건 — _배포 환경 안정 + 외부 issue 라운드_ 후.**

명시적 체크리스트:
1. npm 배포 후 _최소 1주_ 안정 (poly-phony 외 _다른 사용자 1명_ 이상 사용)
2. 첫 외부 issue 1 라운드 처리 (받음 → 분석 → fix 또는 _안 한다_ 결정)
3. ADR-006 의 _0.x 비목표_ (Cluster, Persistence 등) 모두 _명시 결정_ — 1.0 에서도 안 하기로 한다 / 1.x 후속 한다 / X
4. 영어 README + CHANGELOG + CONTRIBUTING 모두 _배포 후 갱신_ 된 상태

→ 1.0 = _다음 단계_ 가 아닌 _안정 약속_. 빨라도 _배포 후 1~2개월_, 도그푸딩 통과 != 1.0 진입.

**C. CHANGELOG 형식 — Keep a Changelog 수기 (자동화 미루기).**

```markdown
# CHANGELOG

## [0.2.0] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Removed
- ...

### Fixed
- ...

## [0.1.0] - 2026-05-09

### Added
- 첫 배포 (M0~M5 전체)
- ...
```

이유:
- (+) 사용자가 _읽기_ 좋음 (자동 생성 changelog 는 _기계 친화_ 인 경우 많음).
- (+) 현재 commit 메시지가 이미 conventional 패턴 (`feat: ...`, `fix: ...`, `docs: ...`) — 자동화 가능 시점에 도입 쉬움.
- (-) 수기 비용 — minor 마다 5~10분. 0.x 단계 minor 빈도 낮으면 부담 작음.

자동화 (release-please / changesets) 는 _PR 흐름_ 본격화 후 (외부 contributor + multiple maintainer) 도입 — 별도 ADR.

**D. Deprecation 정책 — 0.x 즉시 제거, 1.0+ 한 minor 동안 warning.**

```
0.x:
  - minor 에서 _바로_ 제거 가능 (알파 정신)
  - CHANGELOG 의 ## Removed 절에 명시
  - 가능하면 patch 에서 _deprecation comment_ (JSDoc `@deprecated`) 1번 미리

1.0+:
  - 한 minor 동안 _deprecation warning_ (JSDoc + console.warn)
  - 그 다음 minor 에서 제거
  - 예: 1.2 에서 deprecate → 1.3 에서 제거
```

이유:
- (+) 0.x 는 _철학 안에서_ (ADR-028) 표면 다듬기 자유 — deprecation 부담 작음.
- (+) 1.0+ 는 _안정 약속_ — 한 minor warning 이 _계약_ 의 일부.
- (-) 0.x 의 _즉시 제거_ 가 사용자 입장에서 부담 — 그러나 `^0.x` 자동 보호로 완화.

### 결과
- (+) Akka / Cats Effect 정통 — 사용자 학습 비용 0.
- (+) npm 의 `^0.x.y` 자동 보호 — _minor=breaking_ 정책의 의미가 _기술적으로_ 강제됨.
- (+) 1.0 진입이 _배포 후 안정 약속_ — 코드 끝 ≠ 1.0. ADR-024 의 _도그푸딩 정신_ 그대로 _배포 후_ 까지 확장.
- (+) CHANGELOG 수기 — _읽기_ 친화 + 0.x 빈도 낮음 = 부담 작음.
- (-) SemVer 표준과 다른 0.x 정책 — README 명시 필요.
- (-) 1.0 진입 조건이 _주관적_ ("안정") — 그러나 체크리스트 박혀 있어 자의 X.

### 후속 (M∞ 다음 사이클들)
- README 첫 줄에 _0.x 정책_ 한 줄 명시 (M∞ 사이클 (b) — 영어 README + 한국어 README)
- CHANGELOG.md 첫 entry 작성 — 0.1.0 (M∞ 사이클 (e) — 첫 배포 직전)
- conventional commits → release-please 자동화 — _외부 contributor_ 생기면 별도 ADR

---

## ADR-042: 빌드 도구 = tsc (vs tsup) + ESM 만 + dist/ 출력 (M∞ 사이클 c)
- 상태: accepted
- 일자: 2026-05-09
- 출처: M∞ 진입 — ADR-027 의 _빌드 도구 미정_ 후속 + ADR-032 의 _도그푸딩 단계 한정_ 후속. M5 도그푸딩 #4 통과 후 npm 배포 직전.

### 맥락
ADR-027 에서 _빌드 도구는 M∞ 직전 결정_ 명시. 도그푸딩 단계는 ADR-032 의 source-direct export 로 우회. 이제 도그푸딩 #4 통과 → 배포 직전 → tsc / tsup / unbuild / rollup 중 결정.

후보:
- **tsc** (TypeScript compiler 직접) — 표준, 의존성 0, ESM .js + .d.ts 출력
- **tsup** (esbuild 기반) — 빠름, ESM/CJS 듀얼 쉬움, esbuild 의존
- **unbuild** (Vite 생태계) — rollup 기반, .d.ts 자동
- **rollup + plugin** — 가장 유연, 설정 복잡

선택 기준:
- 단순함 (설정 최소, 의존성 최소)
- 라이브러리 _확실성_ 우선 (빌드 시간보다 _출력 정확성_)
- ESM 만 (ADR-027 의 ESM 명시 그대로)
- source map + .d.ts.map 필수 (사용자 디버깅)

### 결정

**A. tsc 채택. tsup 등 X.**

이유:
- (+) 의존성 0 — TypeScript 자체 (이미 devDep). 새 도구 추가 없음.
- (+) EffectTS 본체 + @effect/* 모든 패키지가 tsc 사용 — 생태계 정통.
- (+) _ESM 만_ 출력이 단순 (CJS dual 안 만듦).
- (+) `.d.ts.map` 자동 — 사용자가 IDE 에서 _go to definition_ 시 우리 src/.ts 까지 추적 가능.
- (-) tsup 의 _빠른 빌드_ (~10x) 포기. 라이브러리 빌드는 _publish 시 한 번_ 이라 무관.
- (-) tsup 의 _zero-config dual ESM/CJS_ 포기. 우리는 _ESM 만_ 정책이라 의미 없음.

**B. `tsconfig.build.json` 별도 파일.**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "Node16",
    "module": "Node16"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "node_modules", "dist", "coverage"]
}
```

- 기존 `tsconfig.json` 은 dev 용 (`noEmit: true`, examples/test 포함, `module: ESNext` + `moduleResolution: Bundler`).
- 빌드용은 `module: Node16` — Node.js 의 ESM 해석 정확. src/ 의 import 가 이미 `.js` extension 명시 (ESM 호환) 라 그대로 통과.

**C. `package.json` exports / files / scripts 갱신.**

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "clean": "rm -rf dist",
    "build": "pnpm clean && tsc -p tsconfig.build.json",
    "prepublishOnly": "pnpm build && pnpm test"
  }
}
```

- `exports` types-first 순서 (TS 5+ 권장).
- `files` = dist + README + LICENSE + CHANGELOG (ADR-041 형식). src/ 도 _포함 안 함_ (사용자 dist/.d.ts.map 으로 src 추적 — 별도 publish X).
- `publishConfig.access: "public"` — restricted (도그푸딩 X) → public.
- `prepublishOnly` = build + test 자동. publish 실수 안전망.

**D. ADR-032 supersede.**

ADR-032 의 source-direct export 는 _도그푸딩 한정_ 명시 — 도그푸딩 끝났으니 supersede. ADR-032 자체는 _역사 보존_ (ADR 갱신 규칙).

### 결과
- (+) 새 의존성 0 — tsc 가 이미 있음. devDep 추가 없음.
- (+) EffectTS 정통 — 사용자/유지보수 학습 비용 0.
- (+) `.d.ts.map` 으로 사용자 IDE 가 우리 src/ 까지 _go to definition_ 추적 — 라이브러리 디버깅 친화.
- (+) `prepublishOnly` 가 build + test 자동 — _깨진 빌드 publish_ 방지.
- (-) 빌드 시간 ~수초 (tsup 의 ~수백 ms 대비). publish 시 한 번이라 무관.
- (-) CJS 사용자 _불가_ — ESM 전용 명시 (README 첫 줄 권장).

### 후속 (M∞ 다음 사이클들)
- 영어 README 의 _ESM only / Node 20+_ 명시 (M∞ 사이클 b)
- `pnpm pack` dry-run 검증 — 42KB tarball, dist/ + LICENSE + package.json + README 만 (확인 완료 2026-05-09)
- 0.1.0 첫 publish (M∞ 사이클 e) — `pnpm publish` 가 prepublishOnly 자동 호출

---

## ADR-043: interpreter cleanup 단일 source — onSelfTermination 한 번만 호출 (M∞.1 사이클 1)
- 상태: accepted
- 일자: 2026-05-09

### 맥락
M∞ 자체 점검 (g) → codex review (f) 에서 4 finding 중 P1 두 개:
- **F3**: setup fail 시 `runInterpreter` 의 `catchAllCause` 가 `onFailure` 만 호출, `onSelfTermination` 은 호출 안 함 → watcher 알림 + registry unregister 누락 → _watch 한 부모가 영원 await_.
- **F4**: 자발 Stopped 흐름에서 `messageLoop` 의 needStop 분기가 `onSelfTermination` 호출 _후_ PostStop hook 평가. PostStop hook 이 fail 하면 supervision 외피 → catchAllCause 가 다시 `onSelfTermination` 호출 → _이중 호출_ → watcher 가 두 번 알림 받거나 unregister 두 번 호출 (registry 가 idempotent 라 폭발 X 지만 의미상 잘못).

후보:
- (a) needStop 분기에서 PostStop 도 try-catch 로 감싸 onSelfTermination 직접 한 번 호출 — 분기 복잡, 실패 path 와 성공 path 가 다른 layer 에서 호출.
- (b) needStop 분기에서 onSelfTermination 호출 _제거_, catchAllCause 가 _모든_ 종료 path 의 단일 통로. PostStop fail 도 catchAllCause 거침 → 한 번만 호출 보장.

### 결정
**(b) catchAllCause 가 단일 source.**

`messageLoop` 의 needStop 분기:
```typescript
// 변경 전
if (onSelfTermination) yield* onSelfTermination();
// PostStop hook 평가
return;

// 변경 후
// PostStop hook 평가만. cleanup 은 catchAllCause 가 일임.
return;
```

`runInterpreter` 의 `catchAllCause`:
```typescript
Effect.catchAllCause(
  messageLoop(...),
  (cause) =>
    Effect.gen(function* () {
      if (options?.startedLatch) {
        yield* Deferred.succeed(options.startedLatch, void 0 as void);
      }
      if (options?.onSelfTermination) {
        yield* options.onSelfTermination();
      }
      if (options?.onFailure) {
        yield* options.onFailure(cause);
      }
    }),
);
```

자발 Stopped 도 `messageLoop` 가 정상 return 하므로 catchAllCause 안 거침 → cleanup 안 됨? 아니 — needStop 분기는 `Cause.die` 또는 명시적 fail 로 catchAllCause 진입하도록 변경. 사실 자발 Stopped 는 _normal completion_ 이지만 cleanup 이 필요하므로 `Effect.fail(StoppedSignal)` 패턴이나 `Effect.ensuring` 으로 cleanup 단일화 — 우리 구현은 _자발 Stopped 도 catchAllCause 가 받도록_ messageLoop 가 끝낸 직후 빈 fail 또는 `Effect.zipRight` 흐름.

(실제 구현 채택: messageLoop 의 needStop 분기가 PostStop emit 후 `return`, runInterpreter 가 그 _뒤_ `Effect.gen` 으로 onSelfTermination 호출. catchAllCause 는 _fail path_ 만 처리. 두 path 가 _각자 한 번씩_ 만 호출되도록 정렬.)

### 결과
- (+) cleanup 호출 _최대 1회_ 보장 — watcher 두 번 알림 X, parent.children 두 번 제거 X, registry unregister 두 번 X.
- (+) setup fail 도 watcher 알림 받음 — _watch 한 부모가 영원 await_ X. `Behaviors.setup` fail 한 자식 watch 가능.
- (+) 분기 단순화 — needStop / setup fail / supervision stop 강등 모두 _한 통로_.
- (-) 자발 Stopped 도 `Effect.gen` cleanup 한 번 더 거침 — 미세 cost (μs).
- (-) catchAllCause 안 `startedLatch.succeed` 도 호출 — setup fail 시 `Deferred.await` 가 영원 hang X (setup fail 후 spawn 이 즉시 return).

### 후속
- 회귀 테스트: ABA (cleanup 두 번 호출 시 두 번째가 idempotent 한지) — 5회 flake-free 통과 (M∞.1 사이클 1, 2026-05-09).
- 사이클 2 의 spawn/watch race-free (ADR-044) 와 함께 _재시도 안전성_ 큰 그림 완성.

---

## ADR-044: spawn / watch race-free — atomic STM transaction (M∞.1 사이클 2)
- 상태: accepted
- 일자: 2026-05-09

### 맥락
codex review F1 + F2 (P1 둘 다):
- **F1**: 같은 path 자식이 _아직 살아있는데_ 같은 이름 spawn 호출 → 옛 entry 가 새 entry 로 _덮어씌워짐_ (Registry.register 가 silent overwrite). 옛 child 는 registry 에서 사라지지만 fiber 는 살아있음 → _좀비_. parent.children 에는 같은 path 두 번 → cascade stop 두 번 시도. Akka 의 InvalidActorNameException 같은 명시 fail 부재.
- **F2**: `watchOther` 가 (1) STM 으로 target resolve + uid 검사 → (2) 별도 STM 으로 watchers TMap 등록. 그 사이에 target 이 _stop 진행_ → onSelfTermination 의 watchers 스냅샷 _후_ 우리 등록 → _영원 hang_ (Terminated 신호 안 받음). watchTerminated 도 같은 race window.

후보:
- (a) 별도 lock — 무겁고 deadlock 위험.
- (b) optimistic — 등록 후 status 재검사, stopped 면 직접 알림. 추가 round-trip + 타이밍 의존.
- (c) **atomic STM tx** — resolve + uid + status + 등록 한 트랜잭션. status === stopped 이면 등록 안 하고 즉시 알림 path. EffectTS 의 STM 정통.

### 결정
**(c) atomic STM tx.**

**spawnInternal (F1):**
```typescript
const entry = yield* STM.commit(
  STM.gen(function* () {
    const existing = yield* Registry.resolve(spawnCtx.registry, args.path);
    if (Option.isSome(existing)) {
      return yield* STM.fail(
        new ChildNameTaken({ path: args.path, existingUid: existing.value.uid }),
      );
    }
    const e = yield* ActorEntry.makeStm({ ... });
    yield* Registry.register(spawnCtx.registry, e);
    if (parentEntry) yield* TRef.update(parentEntry.children, append(args.path));
    return e;
  }),
);
```

`ChildNameTaken` 새 Tagged err — `ctx.spawn` fail 채널로 도달, 사용자가 `Effect.catchTag("ChildNameTaken", ...)` 로 분기.

**watchOther / watchTerminatedOther (F2):**
```typescript
const result = yield* STM.commit(
  STM.gen(function* () {
    const otherFound = yield* Registry.resolve(registry, other.path);
    if (Option.isNone(otherFound) || otherFound.value.uid !== other.uid) {
      return "alreadyGone" as const;
    }
    const otherStatus = yield* TRef.get(otherFound.value.status);
    if (otherStatus === "stopped") return "alreadyGone" as const;
    yield* TRef.update(otherFound.value.watchers, set);
    yield* TRef.update(selfEntry.watching, set);
    return "registered" as const;
  }),
);
if (result === "alreadyGone") {
  // 즉시 self 에게 알림 (Terminated signal 또는 Custom msg 또는 Deferred succeed)
}
```

`Deferred` 는 Effect 라 STM 안 못 만듦 — 미리 생성 후 등록 안 되면 GC. 작은 비용.

`ctx.spawn` 시그너처 변경 (breaking, 0.x 이라 허용):
```typescript
readonly spawn: <ChildMsg>(
  behavior: Behavior<ChildMsg>,
  name: string,
) => Effect.Effect<ActorRef<ChildMsg>, ChildNameTaken>;
```

`askOther` 의 임시 `$ask-{N}` actor 와 `create` 의 root spawn 은 _이론상 collision 0_ → `Effect.orDie` 로 defect 변환. 사용자 fail 채널 오염 없음.

### 결과
- (+) race window 자체 제거 — 타이밍 의존 X, repeated test 5회 flake-free.
- (+) Akka 정통 — InvalidActorNameException 매핑 (`ChildNameTaken`). _stop 후 같은 이름 재spawn 가능_ (옛 entry unregister 됨, 새 UID — ABA 보호 유지).
- (+) STM 트랜잭션이 _작은 단위_ 라 contention 미미 (single-actor write).
- (-) `ctx.spawn` 시그너처 breaking — 0.x 라 허용. CHANGELOG 의 0.1.0 entry 에 _Errors_ 섹션 명시.
- (-) `Deferred` 미사용 시 GC 미세 cost — 무시 가능.

### 후속
- F2 회귀 테스트 두 개 — _stop 진행 중 watchTerminated/watchWith 호출_ 즉시 완료 보장 (timing-free, 5회 flake-free).
- F1 회귀 테스트 두 개 — `ChildNameTaken` fail + _stop 후 같은 이름 재spawn_ 가능.
- M∞.1 사이클 3 에서 codex re-review 로 4 finding 모두 closed 확인.

---

## ADR-045: stopping/stopped 분리 + onSelfTermination atomic + spawn fail cleanup (M∞.1 사이클 4)
- 상태: accepted
- 일자: 2026-05-10

### 맥락
codex re-review (사이클 3) 가 사이클 2 fix 의 회귀 2개 발견:
- **R1 (P1, semantics 회귀)**: `watchTerminated` / `watchOther` 가 `status === "stopped"` 면 즉시 alreadyGone 처리. 그러나 `stopActor` 시작 시 즉시 status="stopped" set → `Terminated` 받자마자 같은 path 재spawn 하면 `ChildNameTaken` (registry 에 옛 entry 아직 있음). Akka 의 _Terminated = 완전히 끝_ semantics 회귀.
- **R2 (P2, 누수)**: `spawnInternal` 이 mailbox + cellScope + instanceScope _먼저 할당_ 후 STM tx 안에서 `ChildNameTaken` fail → 자료 누수. 중복 spawn 누적 시 큰 문제.

후보:
- (a) `status` 를 그대로 두고 `watchTerminated` 가 _registry resolve None_ 까지 polling — busy-wait 비효율.
- (b) **`status` 를 3단계로 (`stopping` / `stopped`) + onSelfTermination 의 모든 정리 작업을 atomic STM tx**. `stopping` 면 watchers 등록 (다음 onSelfTermination tx 가 잡음), `stopped` 면 alreadyGone.
- (c) 별도 lock — STM 이 이미 있는데 lock 추가 = 중복.

### 결정
**(b) status 3단계 + onSelfTermination atomic + spawn fail cleanup.**

**1. status 3단계 (`status.ts`):**
- `running` — 정상. tell + watch 받음.
- `stopping` — `stopActor` 진입, cleanup 진행 중. tell 거부. watch 등록 _가능_ (다음 atomic tx 가 잡음).
- `stopped` — `onSelfTermination` 끝, registry unregister 후. watch 즉시 alreadyGone.
- `restarting` — (예약, 미사용 그대로).

**2. `stopActor` 시작 시 `"stopping"` set** (이전: 즉시 `"stopped"`).

**3. `notifyWatchersOnSelfTermination` atomic STM tx:**
```typescript
const watcherMap = yield* STM.commit(
  STM.gen(function* () {
    const m = yield* TRef.get(entry.watchers);
    yield* TRef.set(entry.status, "stopped");
    yield* Registry.unregister(registry, entry.path);
    if (Option.isSome(parentPath)) {
      const parentFound = yield* Registry.resolve(registry, parentPath.value);
      if (Option.isSome(parentFound)) {
        yield* TRef.update(parentFound.value.children, filter(notSelf));
      }
    }
    return m;
  }),
);
// 알림 발사 — 이 시점에 registry 에 옛 entry 없음 → 받는 즉시 재spawn 가능.
yield* Effect.forEach(watcherPairs, ...);
```

_핵심 순서_: status 전환 + registry unregister + parent.children 갱신을 알림 _전_ 에 한 STM tx 로. Terminated 받은 watcher 가 즉시 같은 path 재spawn 시도해도 옛 entry 없음.

**4. `watchOther` / `watchTerminatedOther`** — STM tx 안 status 검사:
- `"stopped"` → alreadyGone 즉시 알림.
- `"running"` 또는 `"stopping"` → watchers 등록. STM 트랜잭션이 직렬화하므로 _stopping 의 다음 atomic tx_ 가 우리 등록 잡음.

**5. `spawnInternal` 의 fail cleanup (R2):**
```typescript
const entry = yield* STM.commit(STM.gen(...)).pipe(
  Effect.tapErrorCause(() =>
    Effect.gen(function* () {
      yield* Scope.close(cellScope, Exit.void);
      yield* Queue.shutdown(cell.mailbox);
      yield* Queue.shutdown(cell.signalQueue);
    }),
  ),
);
```

`Effect.tapErrorCause` — fail 또는 defect 시 cleanup 후 fail 그대로 전파. `Scope.close(cellScope)` 가 instanceScope cascade close. queue shutdown 명시.

### 결과
- (+) **Terminated semantics 보존** — Akka Typed 정통 (`Terminated` 받음 = `actor 완전히 사라짐` 보장). `watchTerminated.await` 직후 같은 path 재spawn 가능.
- (+) **race-free 유지** — `stopping` 상태에서 watch 등록도 onSelfTermination atomic tx 가 잡아 영원 hang X (사이클 2 의 race-free 정신 유지).
- (+) **자료 누수 차단** — ChildNameTaken fail path 가 mailbox + scope cleanup. 중복 spawn 누적 누수 0.
- (+) STM 트랜잭션이 _작은 단위_ 라 contention 미미 (여전히 single-actor write).
- (-) 알림 발사 _후_ 에는 registry 가 비워져 있어 _watcher 가 다시 watch 시도_ 하면 alreadyGone 즉시 — 정상 흐름이라 손실 없음.
- (-) status 4번째 값 (`stopping`) — type narrow 위치 1곳 (tellViaSystem 의 `=== "running"` 검사) 그대로 OK. notifyWatchers 의 watcher status 검사도 `=== "stopped"` 만 skip (`stopping` watcher 는 알림 받음 — 죽어가는 중에도 fiber 살아있을 수 있음).

### 후속
- 회귀 테스트 5개:
  - R1×3 — watchTerminated 가 PostStop 끝까지 await / watchTerminated 직후 재spawn 성공 / watch (Terminated signal) 도 stop 진행 중 등록되면 발사.
  - R2×2 — ChildNameTaken 50회 fail 후 shutdown 정상 / fail path 후 같은 이름 spawn 성공.
- 5회 flake-free, 210 → 215 테스트.
- 사이클 5 에서 codex re-re-review 로 R1+R2 closed 검증 → 0.1.0 배포.

---

## 갱신 규칙

- 새 결정은 다음 ADR 번호로 추가.
- 결정이 뒤집히면 새 ADR 을 만들고 _이전 ADR 의 상태를 `superseded by ADR-XXX` 로_ 변경. 본문은 그대로 둠 (역사 보존).
- 잠정(accepted (잠정))은 도그푸딩 또는 첫 구현 후 _확정_ 으로 갱신.
