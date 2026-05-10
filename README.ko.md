# effect-actor

> EffectTS 기반 Akka Typed 스타일 Actor 라이브러리. **0.x 알파.**

## 상태

| 항목 | 상태 |
|---|---|
| 버전 | [`0.1.0`](https://www.npmjs.com/package/@loveqoo/effect-actor) — 첫 공개 배포 (2026-05-10) |
| 마일스톤 | **M0~M5 + M∞ + M∞.1 모두 🟢** — 도그푸딩 5라운드 + codex 3라운드 GATE PASS |
| npm 패키지 | `@loveqoo/effect-actor` — `pnpm add @loveqoo/effect-actor effect` |
| 테스트 | 215 자체 테스트, 5회 flake-free. consumer 측 도그푸딩 #4 (5×3=15회 flake-free, in-tree) + #5 (npm-install packaging 통과) |
| 코드 | M5 표면 + M∞.1 환류 (ADR-043/044/045 — interpreter cleanup 단일 source, spawn/watch race-free atomic STM, Terminated semantics + spawn-fail cleanup). examples/01~09 실행 가능. |

## 무엇인가

EffectTS 위에 [Akka Typed](https://doc.akka.io/docs/akka/current/typed/index.html) 스타일 Actor 모델을 올린다. 핵심 약속 한 줄:

> **ActorRef는 논리 주소. 메일박스는 그 주소에 묶인다. 행동(Behavior)은 그 위에서 갈아끼울 수 있다.**

이 한 줄이 동작하면 따라오는 것들:
- _재시작에도 동일한 ref_ — 외부 코드가 ref를 들고 계속 메시지 보낼 수 있음
- _재시작 도중 메시지 보존_ — Mailbox가 액터 인스턴스와 분리됨
- _부모-자식 supervision tree_ — framework 차원에서 인코딩
- _Behavior 작성자가 직접 supervision 정책 부착_ — Akka Typed 철학

기존 내부 실험에서 위 모델 없이 Actor를 만들어보고 한계를 확인 → 새 레포로 분리. Akka Typed 표면 vs. _Effect 만으로 단순 구현_ 의 격차 분석은 [docs/AKKA_REFERENCE.md](./docs/AKKA_REFERENCE.md).

## 매직 모먼트

```
// before (Effect 만으로 단순 구현):
//   액터 재시작 시 새 ref 발급 → 외부 코드가 stale ref 들고 있음
//   mailbox 재생성 → 큐 안 메시지 소실

// after (effect-actor):
//   동일 ref 유지 → 외부 코드 변경 없이 연결 유지
//   mailbox 보존 → restart 도중 들어온 메시지가 새 fiber에서 처리
```

동작 코드는 [examples/05-restart.ts](./examples/05-restart.ts) 참고. 메시지 ADT 패턴 (`Data.TaggedEnum`) 은 [examples/09-tagged-enum.ts](./examples/09-tagged-enum.ts).

## 마일스톤

| | 상태 | 무엇이 가능해지나 |
|---|---|---|
| M0 | 🟢 완료 | 설계 문서, ADR, 마일스톤 게시판 |
| M1 | 🟢 완료 | spawn / tell / receive + setup + ctx.spawn (stable ref + mailbox 분리). 77 테스트, examples/01 동작 |
| M2 | 🟢 완료 | receiveSignal + signal 우선 폴링 + PostStop hook. 99 테스트, examples/02 동작. 도그푸딩 _시작_ 단계 |
| M3 | 🟢 완료 | ctx.stop graceful + watch / watchWith / watchTerminated + ask + ChildFailed + DeathPact. examples/03,04 동작. |
| M3.1 | 🟢 완료 | spawn race fix — Deferred latch happens-before + Effect 3.21.2 TMap.remove 본체 버그 우회. 118 테스트, consumer 측 9ms / 5회 flake-free 검증 |
| M4 | 🟢 완료 | Supervision (resume/restart/stop) + 매처 헬퍼 + Scope 분리 + 환류 fix (F1 / 의제 1+2). examples/05 동작. 161 테스트, consumer 측 25회 flake-free. |
| M5 | 🟢 완료 | Backoff / Stash / Timer + examples 06~08 + Effect 밖 throw 안전망 (ADR-037~040). 201 테스트. **도그푸딩 #4 통과 (5×3=15회 flake-free, finding 0, 회귀 0).** |
| M∞ | 🟢 완료 | semver (ADR-041) + tsc 빌드 (ADR-042) + 영어 README + CHANGELOG + CONTRIBUTING + **0.1.0 publish (2026-05-10)**. |
| M∞.1 | 🟢 완료 | Review-feedback 환류 — interpreter cleanup 단일 source (ADR-043), spawn/watch race-free atomic STM (ADR-044), Terminated semantics + spawn-fail cleanup (ADR-045). 5 사이클, codex 3 라운드 GATE PASS, 도그푸딩 #5 packaging 통과. |

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
- [docs/DECISIONS.md](./docs/DECISIONS.md) — ADR (ADR-001 ~ ADR-045)
- [docs/LEARNINGS.md](./docs/LEARNINGS.md) — 작업 중 학습 누적
- [docs/DOGFOODING.md](./docs/DOGFOODING.md) — 도그푸딩 이력 + 가이드
- [CHANGELOG.md](./CHANGELOG.md) — 릴리즈 노트 (Keep a Changelog)
- [AGENTS.md](./AGENTS.md) — AI 에이전트 진입점

## 페르소나

이 라이브러리는 **EffectTS 파워 유저, agent/AI 시스템 빌더** 를 1차 사용자로 가정합니다 (자세히는 [docs/PLAN.md DX SCORECARD](./docs/PLAN.md)). EffectTS의 `Effect`, `Fiber`, `Layer`, `Queue`, `Scope` 에 익숙하고 Akka Typed의 `Behaviors` / `supervise` / `Terminated` 를 빠르게 이해하는 분이 가장 자연스럽게 받는 라이브러리입니다.

## 설치

```bash
pnpm add @loveqoo/effect-actor effect
# npm 사용 시 effect 해상도에 따라 --legacy-peer-deps 필요할 수 있음
```

영어 quickstart 코드 예시는 [README.md](./README.md) 의 _Quick start_ 절 참고.

## 라이선스

[MIT](./LICENSE)
