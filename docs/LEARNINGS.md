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
- [architecture] path-only ActorRef는 단일 프로세스에서도 ABA 위험. 재spawn 동명 액터에 옛 ref가 도달. **incarnation UID** 가 사실상 필수. (Codex OV-1 → ADR-016)
- [architecture] supervision 래퍼를 _해석기 밖_ 에 두는 모델은 PreRestart/PostStop 흐름과 모순. signal handling을 _누가 어디서_ 하는지 다시 설계 필요. (Codex OV-2 → ADR-020)
- [architecture] Registry/children/watchers/fiber/status 분리 = 트랜잭션 경계 부재. STM이 _필수_. spawn/stop/watch 경합에서 찢어진 상태가 그렇지 않으면 발생. (Codex OV-4 → ADR-017)
- [architecture] Mailbox 보존 restart는 _handler 내부 부작용_ 의 정리 범위가 명시 안 되면 반쯤 망가진 재시작. EffectTS의 `Scope` 활용 필요. (Codex OV-5 → ADR-021)
- [api] `narrow<U extends Msg>()` 가 단순 캐스팅이라 타입 안전성 보장 없음. supervision은 강제하면서 타입은 사용자 거짓 허용 = 모순. → narrowUnsafe + adapter actor 권장 (ADR-023). (Codex OV-10)
- [strategy] 도그푸딩 미루기는 위험. 진짜 위험은 기능 누락이 아니라 _API 감각/cost model/supervision 의미_ 가 실제 코드에서 맞느냐. → M2 끝부터 ~1주 도그푸딩 (ADR-024). (Codex OV-6)
- [process] 첫 plan-devex-review가 _문서 작성 자체에서도_ 도그푸딩 효과 발견. API.md 작성 중 closure 안티패턴이 _쓰는 도중_ 발견됨 → 5번 안티패턴 섹션 추가. _문서 작성도 도그푸딩이다_.

### 2026-05-09 — plan-eng-review (M1 진입 직전)

- [workflow] outside voice 를 _두 라운드_ 돌리는 게 가치 있다. round 1 결과를 _round 1 결정에 다시_ 돌려서 round 2 가 _10개 새 발견_ 짚음 (Critical 4 포함). _결정 자체에 대한 검증_ 이 _초기 발견 검증_ 만큼 중요.
- [architecture] supervision 외피가 _완전 분리_ 가 아니라 _interpreter 와 같은 fiber 안 catchAll_. Akka ActorCell 도 광광 — supervisor + Behavior 둘 다 같은 cell 보유. 단순 분리 원리는 깰 수 있다. (ADR-020)
- [architecture] watch 식별자는 _path-only 가 아니라 (path, uid)_ 여야 ABA 안전. ref 의 incarnation 만으로는 부족 — watchers TMap key 자체가 (path, uid) 조합 필요. (ADR-022)
- [architecture] tell 의 _완전한 원자성_ 은 STM 으로도 어차피 못 얻는다 (mailbox 가 STM 밖). 그러므로 _best-effort delivery 명시_ 가 맞다 — Akka 도 같음. _송신 결과 표_ (stale/in-flight/fresh) 를 사용자에게 노출. (ADR-019)
- [architecture] ref 가 cell 직접 보유 + UID 검증 = stable ref 의 본질. tell hot path lookup 0회. _stable ref = mailbox cell identity_ 정확한 정의. path lookup 강제 X. (ADR-019)
- [architecture] Instance Scope 가 cleanup 의 _기본_, PostStop 이 _명시 hook_. 우선순위 명시가 _두 모델 공존_ 의미 정정. (ADR-021)
- [architecture] Behavior 래퍼 (withMailbox/supervise/setup) 는 spawn 0단계에서 _벗겨져_ 메타 추출. 같은 패턴 적용. ADT 일관성 우선. (ADR-026)
- [api] ActorSystem<RootMsg> generic 이 _첫 코드부터 타입 안전_ 보장. system.root.tell 이 컴파일타임 검증. Akka Typed 정통. (ADR-026)
- [api] narrowUnsafe 이름 변경만으로는 _미봉_. adapter actor 패턴을 API.md 예제로 같이 박지 않으면 사용자는 그냥 캐스팅. _대안 명시_ 가 _경고_ 보다 효과적. (ADR-023)
- [strategy] STM vs 시스템 명령 fiber — 둘 다 _구조적 안전_ 제공이지만 _학습 부담_ 측 시스템 fiber 가 단순. 0.x 단일 프로세스에서 STM 는 _과설계 가능성_ 이 있음. _결정 일관성_ 으로 STM 유지하지만 ARCHITECTURE.md 에 _비교_ 명시. (ADR-017)
- [strategy] 도그푸딩 시점 _M3 끝_ 도 늦음. M1~M2 토대 (incarnation/cell ref/Scope/STM/setup) 가 _쓴 코드에서_ 진짜 동작하는지 _M2 끝_ 시점에 부딪혀야. ~1주 가벼운 도그푸딩 사이클이 _토대 검증_ 으로 의미. (ADR-024)
- [process] 한 세션 안에서 _20개 결정_ 가능. Round 1 (10개) → outside voice → round 2 (10개) → 출력물. 한 결정 당 ~5분 + outside voice ~2분 = 약 2시간 세션. 결정 _뒤집지 않는_ 일관성 패턴 (예: STM 유지) 이 사용자 신뢰도와 균형.

### 2026-05-09 — M1 사이클 0 (툴체인 셋업)

- [tooling] pnpm 11 + corepack 으로 packageManager 핀. `"packageManager": "pnpm@11.0.8"` 한 줄로 팀 도구 통일. (ADR-027)
- [tooling] TypeScript 5 strict 옵션 묶음에서 _자주 무는 곳_: `exactOptionalPropertyTypes` (optional 과 undefined 다름), `noUncheckedIndexedAccess` (배열/Record 접근이 `T | undefined`), `verbatimModuleSyntax` (type-only import 강제). 처음부터 박는 게 후속 수정 비용 < 추가 타입 부담.
- [effect-ts] `@effect/vitest` 가 Effect 런타임 통합 일급 — `it.effect("name", () => Effect<...>)` 형태. 일반 vitest 의 `it` 안 Effect.runPromise 보다 깔끔. M1 사이클 1 부터 사용 예정.
- [tooling] pnpm 11 의 `allowBuilds` 정책 — `esbuild` 등의 postinstall 이 _opt-in_. 첫 install 시 `pnpm-workspace.yaml` 자동 생성 후 `allowBuilds: { esbuild: true }` 박아야 fail 안 함. 한 번만 풀면 lock 파일에 박힘. (사이클 0 첫 막힘 지점)

### 2026-05-09 — M1 사이클 1 (핵심 자료구조)

- [effect-ts] `Data.struct` 의 Equal 은 _shallow_. nested 배열 deep equality 가 필요하면 `Data.array([...elements])` 로 감싸야 함. `ActorPath.elements` 가 이 케이스. (path.test.ts 첫 fail 에서 발견)
- [effect-ts] STM 안에서는 `Queue` / `Scope` 생성 불가 (둘 다 Effect 자원). 패턴: Cell + Scope 는 Effect 안에서 미리 생성 → `STM.commit(makeStm({ ..., cell, scope }))` 로 합치기. ActorEntry.create 가 이 합성 본보기.
- [effect-ts] `TMap` 키로 record 를 쓰려면 Equal/Hash 자동이 필요 — `Data.struct` 가 자동 부여. WatchKey = (path, uid) Data.struct 라 TMap 키로 안전. _cell 직접 비교 X, identity 는 (path, uid)_ 가 ADR-016/022 의 본질.
- [api/?] ActorRef 를 `class` 아닌 `interface + 함수 묶음` (`ActorRef.equals(a, b)`) 으로 시작. 사이클 4 에서 사용자 표면을 method 식으로 (`ref.tell(msg)`) 결정할 때 wrap 가능. 함수형 시작이 EffectTS 정신과 일관.
- [architecture] Registry 키는 _path 직렬화 string_ — TMap<string, ActorEntry<unknown>>. WatchKey 와 다름 (그쪽은 record). Equal/Hash 비용 회피 + 디버그 dump 직관 + path 가 시스템 안에서 unique. 두 자료구조의 키 선택이 _용도_ 에 따라 다른 게 깔끔.

### 2026-05-09 — M1 사이클 2 (Behavior ADT + 빌더 + unwrapMeta)

- [process] TDD 첫 사이클 효과 — _Red 단계_ 가 _ActorContext placeholder 의 필요성_ 을 미리 발견. 테스트가 `import type { ActorContext }` 를 요구하니 _구현 전_ 에 빈 interface 를 짜야 했음. 이 forward-declare 방식이 사이클 3 에서 자연 채워짐 — invariant 가 흐려지지 않음.
- [api] `Behaviors.receiveMessage(handle)` 는 내부적으로 `Receive` ADT 로 풀림 — `(_ctx, msg) => handle(msg)`. 사용자 표면은 두 빌더, 내부 표현은 한 케이스. 해석기 단순.
- [architecture] `unwrapMeta` 는 _가장 바깥_ WithMailbox 만 채택 (Akka semantics). 안쪽 WithMailbox 는 inner 안에 그대로 — 시작 behavior 가 보유. 중첩 시 안쪽이 무시되는 것 _아님_ — _밖에서 본 mailbox 가_ 안쪽 정책 가림. 해석 루프 의 시작 behavior 는 _안쪽 래퍼 그대로_.
- [effect-ts] mailbox.ts 의 `export type MailboxPolicy = ... ; export const MailboxPolicy = { ... }` — type + const 같은 이름. 한 import 로 type + value 둘 다 참조 가능. verbatimModuleSyntax 도 OK. 라이브러리 코드 import 패턴 표준화.
- [tooling] TS 의 `noUnusedParameters` + variance annotation — phantom Msg 가 union 의 _어떤 케이스에도 안 나오면_ unused. 해결: Receive/Setup 추가하면 자연 등장. 사이클 2 의 종결자만 있는 단계에서는 `_Msg` prefix 또는 placeholder 케이스 추가. 다음 사이클 추가 시 자연 정리.

### 2026-05-09 — M1 사이클 3 (ActorContext + 해석 루프 + Supervision 외피)

- [process] TDD 잘게 쪼갠 효과 — 사이클 2 에서 _큰 Red 한 번_ 보다, 사이클 3 의 _5단계 Red→Green_ 이 오류 디버깅 부담 적음. 한 단위 fail 시 _이전 통과_ 가 의도 보장. 사이클 3 끝나도 _supervision invariant_ 가 _별도 Red_ 로 박혀 한눈에 명세 보임.
- [effect-ts] `Effect.catchAllCause(self, () => Effect.void)` 가 _fail + defect_ 둘 다 흡수. `Effect.catchAll` 만 쓰면 die (defect) 못 잡음 — supervision 외피의 _완전한_ 차단을 위해 `catchAllCause` 가 정확. (사이클 5 supervision strategy 도 같은 패턴.)
- [architecture] handler 의 fail 채널 `unknown` 으로 — 사용자가 `Effect.fail(any Error)` 자유롭게 던질 수 있음. supervision 외피가 _전부 받음_. ADR-020 의 의미: _interpreter 와 같은 fiber 안의 catchAllCause 외피_ — 이 한 줄이 코드로 정확히 표현.
- [api/?] _Same 반환은 이전 behavior 유지_ 가 사이클 3 의 _첫 행동 fix_. interpreter.test 의 "Receive 가 Same 반환하면 _현재 Receive_ 그대로" 가 _Akka semantics_ 정확. counter actor 테스트 (Same 반환 4번) 으로도 검증됨.
- [api] Setup 한 겹만 풀음 — `init` 결과가 또 Setup 이면 _재평가 안 함_. Akka 정통 (Setup 의 결과가 시작 behavior). 중첩 Setup 은 사용자 의도가 흐려서 의미 없음. 사이클 5 도그푸딩에서 발견되면 ADR.
- [process] 사이클 3 이 _가장 어려운 사이클_ 이라 했지만 _TDD + 잘게 쪼개기_ 로 ~30분에 끝남. 16 새 테스트, 누적 68. 사이클 1 의 _큰 한 번_ 보다 사이클 3 의 _작은 5번_ 이 _체감 부담 더 적음_.

### 2026-05-09 — M1 사이클 4 (ActorSystem + root spawn + tell + shutdown)

- [architecture] _system 과 root ref 의 cyclic dependency_ — ActorRef 가 system handle 보유, system 이 root ref 보유. 닭과 달걀. 해결: `handleRef: { ref: ... | null }` mutable 슬롯으로 _참조 슬롯_ 먼저 만들고 root spawn 후 채움. spawnRoot 내부의 race-free 한 곳 (모두 sync Effect 안). 도그푸딩에서 발견되면 _systemHandle deferred_ 같은 pattern 으로 정리.
- [effect-ts] `Effect.forkIn(eff, scope)` 가 _scope 안에서 fork_. scope close 시 fiber 자동 interrupt + cleanup. shutdown 의 _fiber interrupt_ 명시 호출 불필요 — Scope.close 한 줄로 충분. ADR-021 의 instance Scope = 자동 cleanup 본질을 정확히 표현.
- [effect-ts] `Fiber.await(fiber)` vs `Fiber.join` — await 은 interrupt 도 정상 받음, join 은 fail 채널로 던짐. shutdown 에서 _shutdown 끝 = fiber 끝_ 보장 위해 await 가 정확.
- [api] `ActorSystem<RootMsg>` 가 `ActorSystemHandle` 을 _is-a_ 로 만족 — internal 표면 (tell) + 사용자 표면 (root, shutdown) 한 객체. 사용자가 `system.tell(ref, msg)` 직접 호출 가능 (지금은 _노출_). 사이클 5 또는 M2 에서 internal/external 분리 검토.
- [api] tell 의 _STM read-only tx_: registry.resolve + entry.uid 검증 + status check. _enqueue 자체는 STM 밖_ (Queue.offer). ADR-019 의 _best-effort + 송신 결과 표_ 정확. 첫 통합에 stale ref + stopped 둘 다 silent dead letter 분기 검증.
- [process] 사이클 4 가 _가장 큰 통합_ 이라 했는데, 사이클 3 의 _runInterpreter_ + 사이클 1/2 의 자료구조 + 메타 추출 모두 _준비된 상태_ 라 system.ts _한 파일_ 이 ~180줄. 복잡함은 _한 사이클에 압축_ 안 되고 _사이클 사이_ 에 분배됨. TDD 의 큰 통합 테스트 첫 Red 가 _남은 의존성 그림_ 한 번에 보여줌.

### 2026-05-09 — M1 사이클 5 (ctx.spawn + examples/01-counter + DoD 검증)

- [architecture] spawnRoot → spawnInternal 일반화 — root 와 child 의 차이는 _parentEntry_ 한 인자뿐. ARCHITECTURE.md §3.1 의 0-10 단계가 root/child 동일. _자기 자식 부모 트리_ 는 STM tx 안의 children TMap 갱신 한 줄.
- [api] `ActorContext.spawn` 의 시그니처: `(behavior, name) => Effect<ActorRef<ChildMsg>>`. ctx 만들 때 system 이 _자기 자신을 부모 entry 와 묶어_ spawn 함수를 채움. ctx 객체가 _self entry 의 spawn 권한_ 보유.
- [tooling] `verbatimModuleSyntax` + 같은 이름의 `interface X` + `const X` — `export { X }` 한 줄로 type+value 둘 다 export. `export type { X }` + `export { X }` 두 줄은 _Duplicate identifier_ 충돌. 단일 export 가 정답.
- [api] index.ts 의 `XOps` 별칭 모두 제거 — 사용자 표면이 깔끔해짐 (`ActorPath`, `Behaviors`, `ActorSystem` 같이 자연 import). `ActorSystemHandle` 만 `export type` 으로 남겨 _internal 권장_ 표시. 사용자가 `import type` 안 하고 사용해도 안전하지만 의도 전달.
- [process] M1 5 사이클 전체 회고 — 사이클 0 (셋업) → 1 (자료구조 39테) → 2 (ADT 13테) → 3 (해석기 16테) → 4 (통합 6테) → 5 (ctx.spawn + examples 3테). _각 사이클이 다음 사이클의 기반_ 이라 의존성 깊이가 자연 증가. TDD 가 _각 사이클의 의도를 테스트로 박는_ 일관 도구. 누적 77 테스트, examples 동작.


