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
poly-phony에서 ActorRef가 closure-bound value였고 mailbox가 인스턴스에 종속이었다. 그래서 restart가 의미 있게 동작 못함. 새 레포에서 이 모델을 _점진적_ 으로 도입할지, _1일차_ 부터 박을지가 갈림길이었다.

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
- 상태: accepted
- 일자: 2026-05-08

### 맥락
도그푸딩을 _마일스톤마다_ 점진적으로 할지, _전 기능 완성 후_ 한 번에 할지.

### 결정
**모든 기능 완성 후 본격 도그푸딩.** 단, 보완책으로 `docs/API.md` 에 _상상의 사용 예시_ 를 풍부하게 적어 임시 도그푸딩 그물로 삼는다.

### 결과
- (+) 인프라가 이리저리 흔들리는 동안 응용을 짤 부담 없음.
- (-) API 모양 어긋남이 늦게 발견됨 → 발견 시 큰 갈아엎기 위험.
- (관리책) `docs/API.md` 의 사용 예시를 _진짜 사용처럼_ 작성. 시그니처가 어색해 보이면 곧장 고침. 이게 도그푸딩의 _프록시_.

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
- 상태: accepted (잠정)
- 일자: 2026-05-08

### 맥락
메일박스 정책 후보:
- unbounded — 메모리 폭발 위험
- bounded with drop — 메시지 유실
- bounded with backpressure — tell이 suspend

### 결정
**기본은 bounded(capacity 1024) + backpressure.** 사용자가 `Behaviors.withMailbox({ unbounded: true })` 등으로 override 가능.

### 결과
- (+) 메모리 안전성 기본.
- (+) EffectTS Queue의 backpressure와 결이 맞음.
- (-) Akka의 dispatcher 모델과는 다른 동작 → Akka 사용자에게 살짝 낯섦.

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

## 갱신 규칙

- 새 결정은 다음 ADR 번호로 추가 (ADR-011, ADR-012, ...).
- 결정이 뒤집히면 새 ADR을 만들고 _이전 ADR의 상태를 `superseded by ADR-XXX` 로_ 변경. 본문은 그대로 둠 (역사 보존).
- 잠정(accepted (잠정))은 도그푸딩 또는 첫 구현 후 _확정_ 으로 갱신.
