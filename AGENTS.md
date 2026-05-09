# AGENTS.md — AI 에이전트 진입점

> 이 레포에 처음 들어온 AI 에이전트를 위한 **첫 페이지**.
> 작업 시작 전 _반드시_ 읽어야 할 색인. 5분 안에 전체 그림이 잡히도록.

---

## 1. 이 레포가 뭐냐

**`effect-actor`** — EffectTS 기반 Akka Typed 스타일 Actor 라이브러리.
오픈소스로 npm 배포 예정. 현재는 _구현 전 단계_ (M0: 정보 모으기).

도그푸딩 환경: [`/Users/anthony/Repository/github/loveqoo/poly-phony`](../poly-phony) (별도 레포).
이전 시도(poly-phony) 에서 만난 한계가 이번 레포의 출발점. [DECISIONS.md](./docs/DECISIONS.md) 의 ADR-002 참고.

---

## 2. 어디서 무엇을 찾는가 (문서 색인)

| 문서 | 무엇을 담음 |
|---|---|
| [docs/PLAN.md](./docs/PLAN.md) | **현재 어디까지 왔는지.** 마일스톤 게시판. _가장 먼저 보라_ |
| [docs/USAGE.md](./docs/USAGE.md) | _현재 동작하는 사용자 표면_ 한 묶음. 도그푸딩/사용자 참고용 |
| [docs/AKKA_REFERENCE.md](./docs/AKKA_REFERENCE.md) | Akka Typed 핵심 + EffectTS 매핑 후보. _다른 모든 문서의 뿌리_ |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 내부 런타임 모델 (Registry, Mailbox, Fiber). _구현 시 참조_ |
| [docs/API.md](./docs/API.md) | 사용자 API 시안 + 풍부한 예시. _시그니처가 어색하면 곧장 고침_ |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | ADR. _왜 X 대신 Y 인가_. 결정 뒤집기 전 반드시 확인 |
| [docs/LEARNINGS.md](./docs/LEARNINGS.md) | 작업 중 알게 된 사실 누적. _같은 학습 두 번 하지 말 것_ |

---

## 3. 새 세션 시작 시 권장 흐름

```
1. PLAN.md     → 지금 어느 마일스톤 어느 사이클인지 확인
2. LEARNINGS.md → 최근 학습 훑기
3. DECISIONS.md → 잠정 결정이 있는지 확인
4. 사용자에게 "M_ 의 X 사이클 시작합니다" 라고 짧게 동기화
5. 작업 시작
```

---

## 4. 작업 흐름 (subset 사이클)

이 레포는 **문서 기반 개발** 워크플로우를 따른다 (DECISIONS ADR-010).

```
플랜 → 개발 → 테스트 → 버그/수정 → /codex review → 사용자 리뷰 → 수정 → 커밋
```

각 사이클 끝에:
- [ ] `LEARNINGS.md` 에 한 줄 추가 (있으면)
- [ ] `ARCHITECTURE.md` / `API.md` 갱신 (변경 있을 시)
- [ ] `DECISIONS.md` 잠정 → 확정 갱신 (해당 시)
- [ ] `PLAN.md` 체크리스트 갱신
- [ ] **코드와 문서를 _같은 커밋_ 에 묶기**
- [ ] 사용자와 3줄 회고 (잘 된 것 / 다르게 했어야 할 것 / 다음 학습)
- [ ] `/context-save`

---

## 5. 일하는 규칙

### 5.1 대화

- 자연스러운 한국어. 영어 직역체 금지 (_박-_ 어간 전체 금지: "박았다/박은/박혀" → "정했다/추가한/들어 있는". "스코프" → "범위" 등). _박다_ 는 한국에서 성적 은어로 혼용되어 공문서/비즈니스 맥락에 부적절.
- _한자권 다른 언어 (중국어/일본어) 에서 유추한 한자어 주의._ 한국어에 없는/안 쓰이는 단어 (예: "광광") 는 금지. 한자어 쓸 때 _한국어에서 실제 쓰는지_ 한 번 의식.
- 동료 톤. 결정을 다그치지 말고 함께 고민.
- 길게 풀어 설명 OK. 짧게 압축하다 맥락 빠지면 안 됨.
- 사용자가 정정해 준 표현은 _누적_. 같은 표현 두 번 쓰지 말 것.

### 5.2 결정

- 잠정 결정은 `DECISIONS.md` 에 _accepted (잠정)_ 으로 기록. 도그푸딩 / 첫 구현 후 확정.
- 결정 뒤집기 전 _왜 그 결정을 했는지_ ADR을 먼저 읽는다.
- 새 결정은 ADR-NNN 으로 추가. 형식은 DECISIONS.md 상단 참고.

### 5.3 코드

- TypeScript 5 strict + EffectTS 3.x. ESM (`"type": "module"`).
- 패키지 매니저: pnpm 11 (corepack). 테스트: vitest + @effect/vitest. 실행: tsx. 빌드 도구는 M∞ 직전 결정. (ADR-027)
- 코드 주석은 _왜_ 가 비명백할 때만. _무엇_ 은 코드가 말하게.
- 한 사이클 안에 끝나는 단위로 커밋. 큰 PR 지양.

### 5.4 비목표 (DECISIONS ADR-006)

- Cluster, Persistence, Distributed Pub-Sub, Receptionist — 0.x 범위 _밖_.
- AllForOne supervision strategy — 미제공 (Typed 철학).
- 위 영역 작업이 들어오면 사용자에게 _범위 밖_ 임을 알리고 확인.

---

## 6. 도구

이 레포는 [gstack](https://github.com/?) 워크플로우와 함께 동작.

자주 쓰는 것:
- `/plan-eng-review` — 계획 단계 아키텍처 락인
- `/plan-devex-review` — 라이브러리니까 _가장 중요_
- `/codex review` — diff 독립 리뷰 (사이클 끝마다)
- `/codex consult` — 깊은 설계 질문
- `/health` — 코드 품질 종합 점수
- `/investigate` — 버그 근본 원인 추적
- `/context-save` / `/context-restore` — 세션 간 연결

피하기:
- `/office-hours` — 사용자가 _소모적_ 이라 판단. 새 발상 검증 아니면 추천 금지.
- 출시 관련(`/ship`, `/land-and-deploy`, `/setup-deploy`) — M∞까지 _금지_.

---

## 7. 빠른 참조 — Akka 정신 한 줄 요약

> "**ActorRef는 논리 주소. 메일박스는 그 주소에 묶인다. 행동(Behavior)은 그 위에서 갈아끼울 수 있다.**"

이 한 줄이 모든 설계 결정의 시금석이다. 어떤 결정이 이 줄과 어긋나면 _그 결정이 잘못된 것이다_.

---

## 8. 갱신 규칙

- 새 문서가 추가되면 2번 표에 추가.
- 새 _금지/권장_ 도구가 나오면 6번 갱신.
- 일하는 규칙(5번) 변경은 사용자 동의 후.
