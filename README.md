# effect-actor

> EffectTS 기반 Akka Typed 스타일 Actor 라이브러리. **0.x 알파, 코드 미공개.**

## 상태

| 항목 | 상태 |
|---|---|
| 버전 | 0.0.0 (미배포) |
| 마일스톤 | M0~M4 완료 (Supervision 환류 + 재검증 통과) |
| npm 패키지 | _M5+ 도그푸딩 후 배포 예정_ |
| 코드 | _M4: supervise/resume/restart/stop + 매처 헬퍼 + Scope 분리 (ADR-035) + 환류 fix (F1/의제 1+2). 161 테스트, examples/01~05 실행 가능._ |

## 무엇인가

EffectTS 위에 [Akka Typed](https://doc.akka.io/docs/akka/current/typed/index.html) 스타일 Actor 모델을 올린다. 핵심 약속 한 줄:

> **ActorRef는 논리 주소. 메일박스는 그 주소에 묶인다. 행동(Behavior)은 그 위에서 갈아끼울 수 있다.**

이 한 줄이 동작하면 따라오는 것들:
- _재시작에도 동일한 ref_ — 외부 코드가 ref를 들고 계속 메시지 보낼 수 있음
- _재시작 도중 메시지 보존_ — Mailbox가 액터 인스턴스와 분리됨
- _부모-자식 supervision tree_ — framework 차원에서 인코딩
- _Behavior 작성자가 직접 supervision 정책 부착_ — Akka Typed 철학

기존 `poly-phony` 작업에서 위 모델 없이 Actor를 만들어보고 한계를 확인 → 새 레포로 분리. 자세한 격차 분석은 [docs/AKKA_REFERENCE.md § Polyphony와의 비교](./docs/AKKA_REFERENCE.md#10-polyphony와의-비교).

## 매직 모먼트 (M1 후 채워짐)

```
// before (poly-phony 스타일):
//   액터 재시작 시 새 ref 발급 → 외부 코드가 stale ref 들고 있음
//   mailbox 재생성 → 큐 안 메시지 소실

// after (effect-actor):
//   동일 ref 유지 → 외부 코드 변경 없이 연결 유지
//   mailbox 보존 → restart 도중 들어온 메시지가 새 fiber에서 처리
```

_실제 동작 코드는 M1 마일스톤 완료 시 [examples/01-restart-demo.ts](./examples/) 로 추가됩니다._

## 마일스톤

| | 상태 | 무엇이 가능해지나 |
|---|---|---|
| M0 | 🟢 완료 | 설계 문서, ADR, 마일스톤 게시판 |
| M1 | 🟢 완료 | spawn / tell / receive + setup + ctx.spawn (stable ref + mailbox 분리). 77 테스트, examples/01 동작 |
| M2 | 🟢 완료 | receiveSignal + signal 우선 폴링 + PostStop hook. 99 테스트, examples/02 동작. 도그푸딩 _시작_ 단계 |
| M3 | 🟢 완료 | ctx.stop graceful + watch / watchWith / watchTerminated + ask + ChildFailed + DeathPact. examples/03,04 동작. |
| M3.1 | 🟢 완료 | spawn race fix — Deferred latch happens-before + Effect 3.21.2 TMap.remove 본체 버그 우회. 118 테스트, consumer 측 9ms / 5회 flake-free 검증 |
| M4 | 🟢 완료 | Supervision (resume/restart/stop) + 매처 헬퍼 + Scope 분리 + 환류 fix (F1 / 의제 1+2). examples/05 동작. 161 테스트, consumer 측 25회 flake-free. |
| M5 | 🟡 진행 중 | Backoff / Stash / Timer. _사이클 1 완료 — restart.withLimit + PreRestart 재실패 통합 (ADR-037)._ 169 테스트 |
| M∞ | ⚪ 대기 | poly-phony 도그푸딩 → npm 배포 |

자세한 진행 상황은 [docs/PLAN.md](./docs/PLAN.md).

## 비목표 (0.x 범위 밖)

- Cluster (멀티 노드)
- Persistence (Event Sourcing)
- Distributed Pub-Sub / Receptionist
- Streams (EffectTS의 `Stream` 그대로 활용 권장)
- AllForOne supervision strategy (Akka Typed 철학을 따라 watch + 명시적 재spawn)

자세히는 [docs/DECISIONS.md ADR-006](./docs/DECISIONS.md).

## 문서

- [docs/PLAN.md](./docs/PLAN.md) — 마일스톤 진행 상황
- [docs/USAGE.md](./docs/USAGE.md) — _지금 동작하는_ 사용자 표면 가이드 (도그푸딩 참고)
- [docs/API.md](./docs/API.md) — 사용자 API 시안 + 사용 예시
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 내부 런타임 모델
- [docs/AKKA_REFERENCE.md](./docs/AKKA_REFERENCE.md) — Akka Typed → EffectTS 매핑
- [docs/DECISIONS.md](./docs/DECISIONS.md) — ADR
- [docs/LEARNINGS.md](./docs/LEARNINGS.md) — 작업 중 학습 누적
- [AGENTS.md](./AGENTS.md) — AI 에이전트 진입점

## 페르소나

이 라이브러리는 **EffectTS 파워 유저, agent/AI 시스템 빌더** 를 1차 사용자로 가정합니다 (자세히는 [docs/PLAN.md DX SCORECARD](./docs/PLAN.md)). EffectTS의 `Effect`, `Fiber`, `Layer`, `Queue`, `Scope` 에 익숙하고 Akka Typed의 `Behaviors` / `supervise` / `Terminated` 를 빠르게 이해하는 분이 가장 자연스럽게 받는 라이브러리입니다.

## 알림 받기

배포될 때 알림 받고 싶으시면 GitHub _Watch → Custom → Releases_. 첫 0.1.0 직전 announcement 예정.

## 라이선스

(LICENSE 파일 참고)
