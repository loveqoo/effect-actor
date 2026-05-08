# Learnings — 작업 중 알게 된 것

> subset 사이클이 끝날 때마다 _새로 알게 된 사실_ 을 한 줄씩 누적.
> 미래의 자기 자신에게 보내는 메모. 같은 발견을 두 번 하지 않기 위함.

## 사용 규칙

1. **한 줄 = 한 학습.** 짧게. 풀어 쓰면 안 읽게 됨.
2. **분류 태그를 앞에 붙인다.** `[runtime]`, `[api]`, `[testing]`, `[effect-ts]`, `[akka]`, `[tooling]` 등.
3. **확신이 약하면 _후보_ 표시.** `[runtime/?]` — 추가 검증 필요.
4. **출처가 있으면 짧게 링크.** Akka 문서, EffectTS docs, 커밋 해시 등.
5. **너무 사소한 건 안 적는다.** 문서가 노이즈로 잠기면 안 읽힘. 한 사이클 한두 줄이 보통.
6. **틀린 것이 밝혀지면 줄긋기 + 정정.** 삭제하지 말고 _왜 틀렸는지_ 도 한 줄.

## 형식

```
- [태그] 학습 한 줄. (출처/맥락 짧게 — 선택)
```

예시:
```
- [runtime] Mailbox은 ActorEntry 수명 내내 같은 인스턴스여야 한다. 인스턴스 교체 시 외부 ref가 가리키는 큐가 어긋남.
- [effect-ts] Queue.take는 인터럽트 시 대기 중인 Fiber를 깔끔히 풀어준다. 별도 cleanup 불필요.
- [api/?] watchWith가 watch보다 거의 항상 더 좋은 선택. watch + Terminated 직접 처리는 거의 쓰일 일 없음. (M3 사이클 확인)
```

---

## 누적 학습

### 2026-05-08 — plan-devex-review (M0 직후)

- [workflow] outside voice (Codex) 가 _DX 표면 리뷰_ 가 놓치는 _아키텍처 근본_ 을 짚는다. plan-devex-review는 표면 마찰점, plan-eng-review는 구조에 강함 — 두 시각이 보완 관계.
- [architecture] path-only ActorRef는 단일 프로세스에서도 ABA 위험. 재spawn 동명 액터에 옛 ref가 도달. **incarnation UID** 가 사실상 필수. (Codex OV-1, plan-eng-review에서 결정)
- [architecture] supervision 래퍼를 _해석기 밖_ 에 두는 모델은 PreRestart/PostStop 흐름과 모순. signal handling을 _누가 어디서_ 하는지 다시 설계 필요. (Codex OV-2)
- [architecture] Registry/children/watchers/fiber/status 분리 = 트랜잭션 경계 부재. STM이 _필수_. spawn/stop/watch 경합에서 찢어진 상태가 그렇지 않으면 발생. (Codex OV-4)
- [architecture] Mailbox 보존 restart는 _handler 내부 부작용_ 의 정리 범위가 명시 안 되면 반쯤 망가진 재시작. EffectTS의 `Scope` 활용 필요. (Codex OV-5)
- [api/?] `narrow<U extends Msg>()` 가 단순 캐스팅이라 타입 안전성 보장 없음. supervision은 강제하면서 타입은 사용자 거짓 허용 = 모순. Schema-based message validation 검토. (Codex OV-10)
- [strategy] 도그푸딩 미루기는 위험. 진짜 위험은 기능 누락이 아니라 _API 감각/cost model/supervision 의미_ 가 실제 코드에서 맞느냐. ADR-004 재고 (ADR-014 제안). (Codex OV-6)
- [process] 첫 plan-devex-review가 _문서 작성 자체에서도_ 도그푸딩 효과 발견. API.md 작성 중 closure 안티패턴이 _쓰는 도중_ 발견됨 → 5번 안티패턴 섹션 추가. _문서 작성도 도그푸딩이다_.


