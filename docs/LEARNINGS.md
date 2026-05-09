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
- [architecture] supervision 외피가 _완전 분리_ 가 아니라 _interpreter 와 같은 fiber 안 catchAll_. Akka ActorCell 도 같은 모양 — supervisor + Behavior 둘 다 같은 cell 보유. 단순 분리 원리는 깰 수 있다. (ADR-020)
- [architecture] watch 식별자는 _path-only 가 아니라 (path, uid)_ 여야 ABA 안전. ref 의 incarnation 만으로는 부족 — watchers TMap key 자체가 (path, uid) 조합 필요. (ADR-022)
- [architecture] tell 의 _완전한 원자성_ 은 STM 으로도 어차피 못 얻는다 (mailbox 가 STM 밖). 그러므로 _best-effort delivery 명시_ 가 맞다 — Akka 도 같음. _송신 결과 표_ (stale/in-flight/fresh) 를 사용자에게 노출. (ADR-019)
- [architecture] ref 가 cell 직접 보유 + UID 검증 = stable ref 의 본질. tell hot path lookup 0회. _stable ref = mailbox cell identity_ 정확한 정의. path lookup 강제 X. (ADR-019)
- [architecture] Instance Scope 가 cleanup 의 _기본_, PostStop 이 _명시 hook_. 우선순위 명시가 _두 모델 공존_ 의미 정정. (ADR-021)
- [architecture] Behavior 래퍼 (withMailbox/supervise/setup) 는 spawn 0단계에서 _벗겨져_ 메타 추출. 같은 패턴 적용. ADT 일관성 우선. (ADR-026)
- [api] ActorSystem<RootMsg> generic 이 _첫 코드부터 타입 안전_ 보장. system.root.tell 이 컴파일타임 검증. Akka Typed 정통. (ADR-026)
- [api] narrowUnsafe 이름 변경만으로는 _미봉_. adapter actor 패턴을 API.md 예제로 같이 적지 않으면 사용자는 그냥 캐스팅. _대안 명시_ 가 _경고_ 보다 효과적. (ADR-023)
- [strategy] STM vs 시스템 명령 fiber — 둘 다 _구조적 안전_ 제공이지만 _학습 부담_ 측 시스템 fiber 가 단순. 0.x 단일 프로세스에서 STM 는 _과설계 가능성_ 이 있음. _결정 일관성_ 으로 STM 유지하지만 ARCHITECTURE.md 에 _비교_ 명시. (ADR-017)
- [strategy] 도그푸딩 시점 _M3 끝_ 도 늦음. M1~M2 토대 (incarnation/cell ref/Scope/STM/setup) 가 _쓴 코드에서_ 진짜 동작하는지 _M2 끝_ 시점에 부딪혀야. ~1주 가벼운 도그푸딩 사이클이 _토대 검증_ 으로 의미. (ADR-024)
- [process] 한 세션 안에서 _20개 결정_ 가능. Round 1 (10개) → outside voice → round 2 (10개) → 출력물. 한 결정 당 ~5분 + outside voice ~2분 = 약 2시간 세션. 결정 _뒤집지 않는_ 일관성 패턴 (예: STM 유지) 이 사용자 신뢰도와 균형.

### 2026-05-09 — M1 사이클 0 (툴체인 셋업)

- [tooling] pnpm 11 + corepack 으로 packageManager 핀. `"packageManager": "pnpm@11.0.8"` 한 줄로 팀 도구 통일. (ADR-027)
- [tooling] TypeScript 5 strict 옵션 묶음에서 _자주 무는 곳_: `exactOptionalPropertyTypes` (optional 과 undefined 다름), `noUncheckedIndexedAccess` (배열/Record 접근이 `T | undefined`), `verbatimModuleSyntax` (type-only import 강제). 처음부터 정하는 게 후속 수정 비용 < 추가 타입 부담.
- [effect-ts] `@effect/vitest` 가 Effect 런타임 통합 일급 — `it.effect("name", () => Effect<...>)` 형태. 일반 vitest 의 `it` 안 Effect.runPromise 보다 깔끔. M1 사이클 1 부터 사용 예정.
- [tooling] pnpm 11 의 `allowBuilds` 정책 — `esbuild` 등의 postinstall 이 _opt-in_. 첫 install 시 `pnpm-workspace.yaml` 자동 생성 후 `allowBuilds: { esbuild: true }` 추가해야 fail 안 함. 한 번만 풀면 lock 파일에 들어감. (사이클 0 첫 막힘 지점)

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

- [process] TDD 잘게 쪼갠 효과 — 사이클 2 에서 _큰 Red 한 번_ 보다, 사이클 3 의 _5단계 Red→Green_ 이 오류 디버깅 부담 적음. 한 단위 fail 시 _이전 통과_ 가 의도 보장. 사이클 3 끝나도 _supervision invariant_ 가 _별도 Red_ 로 들어 있어 한눈에 명세 보임.
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
- [process] M1 5 사이클 전체 회고 — 사이클 0 (셋업) → 1 (자료구조 39테) → 2 (ADT 13테) → 3 (해석기 16테) → 4 (통합 6테) → 5 (ctx.spawn + examples 3테). _각 사이클이 다음 사이클의 기반_ 이라 의존성 깊이가 자연 증가. TDD 가 _각 사이클의 의도를 테스트로 적는_ 일관 도구. 누적 77 테스트, examples 동작.

### 2026-05-09 — M2 사이클 1 (Behaviors.receiveSignal fluent 빌더)

- [api] Akka Typed 의 `Behaviors.receive(...).receiveSignal(...)` 모양 — `ReceiveBehavior<Msg>` interface 가 ADT 의 `Receive` 케이스 역할 + `receiveSignal` 메서드 부착. union ADT 안에 _메서드 부착 케이스_ 가 들어가도 `_tag` 분기 그대로 동작. _불변_ 으로 새 객체 반환 (handle 보존, onSignal 만 갱신).
- [api] `onSignal` 을 _명시 null_ 로 표현 — `optional` 보다 `null` 이 _명시적으로 비어 있음_ 을 ADT 패턴 매칭에서 누락 없이 체크. `current.onSignal !== null` 한 줄 분기.
- [process] M1 의 _Receive 케이스_ 가 `onSignal` 추가만으로 _기존 사용처 무 회귀_ — interpreter 의 case "Receive" 분기가 readonly 필드 추가 무관. ADT 확장은 _필드 추가_ 가 _필드 변경_ 보다 항상 안전.

### 2026-05-09 — M2 사이클 2 (interpreter 신호 우선 폴링)

- [effect-ts] _signal 우선 폴링_ 패턴: `Queue.poll(signalQueue)` 로 _이미 도착한_ signal 우선 → 비었으면 `Effect.race(Queue.take(sig), Queue.take(msg))`. race winner 결정 시 loser take 자동 interrupt. Queue 항목 소실 X. 동시 도착 시 비결정성 — 사이클 2 단계는 OK (Akka 도 비슷).
- [api] `interpretSignalStep` 가 `interpretStep` 과 _대칭 시그너처_ — `(current, ctx, signal) => BehaviorEffect<Msg>`. onSignal 미부착 → current 그대로 (Akka unhandled). DeathPact 검출은 M3 까지 미룸.
- [process] 사이클 2 의 _첫 Red_ 가 vitest timeout (~20s) — signal 만 들어 있는 케이스에서 mailbox blocking 영원. Green 후 0.5s. 테스트 fail 의 _시간 비용_ 이 _구현 의도_ 를 반영하면 OK (의도된 blocking).

### 2026-05-09 — M2 사이클 3 (PostStop 자동 emit + shutdown 흐름)

- [architecture] PostStop 의 _자동 emit 패턴_: messageLoop 가 _lastActive_ Receive 추적 → 자발 Stopped 도달 시 `interpretSignalStep(lastActive, PostStop)` 자동 호출. 외부 `Queue.offer(signalQueue, PostStop)` 도 같은 메커니즘 — `postStopHandled` 플래그로 _한 번만_ 보장. Akka ActorCell 의 _stop hook_ 정확 매핑.
- [architecture] 자발 Stopped 의 _마지막 active Receive_ 가 PostStop 받음 — stage1 → stage2 변환 후 stage2.handle 이 Stopped 반환하면 stage2.onSignal 이 호출 (stage1 아님). 이게 Akka 의 _현재 Behavior_ 의미와 정확.
- [architecture] ADR-021 §3.8 _두 cleanup 모델 우선순위_ 가 코드로 명확 — shutdown 흐름: status=stopped → PostStop offer → fiber.await (사용자 hook 평가) → Scope.close (자동 cleanup) → Queue.shutdown → unregister. _명시 hook 먼저, 자동 cleanup 나중_ 한 줄.
- [process] 사이클 2 의 기존 테스트가 사이클 3 의 _의미 변경_ 으로 회귀 — PostStop 이 _특수 종료 트리거_ 가 됨. 테스트 의도가 _signal 우선_ 이라 신호를 PostStop 에서 PreRestart 로 교체. _의미 변경 = 테스트 의도 표현 갱신_, 회귀 아님.
- [architecture/?] _자식 actor 의 PostStop hook_ 은 _아직_ 호출 안 됨 — 부모 Scope.close 시 자식 fiber 가 interrupt 로 강제 종료 (catchAllCause 흡수, messageLoop 정상 종료 못함). cascade stop 흐름에서 자식들의 PostStop 도 호출되도록 _M3 의 ctx.stop_ 또는 _M2 후속_ 에서 보강. examples/01 의 reporter 자식이 이 케이스.

### 2026-05-09 — M2 사이클 4 (examples/02-lifecycle + DoD 마무리)

- [api] examples/02 가 _setup + PostStop_ 두 핵심을 한 화면. `counter(n)` 의 onSignal 이 closure 의 `n` 잡음 — 마지막 active counter 의 n (=2) 이 PostStop 으로 전달. _Behavior 매개변수_ 패턴이 _상태 + cleanup_ 자연 표현.
- [process] M2 4 사이클 회고 — 사이클 1 (ADT/빌더 6테) → 2 (interpreter 폴링 8테) → 3 (PostStop 흐름 8테) → 4 (examples + DoD). 누적 99 테스트 (+22). _사이클 2 의 race 비결정성_ 과 _사이클 3 의 의미 변경 회귀_ 가 두 번의 _Akka 의미 결정_ 지점. TDD 가 의미 결정의 _코드화 도구_.
- [process] 코드 작업 끝 + _사용자 측 도그푸딩_ 단계 — poly-phony 에서 한 agent 만들어보면서 발견된 issue 가 후속 사이클 입력. _문서/코드 모두_ 정합성 유지를 도그푸딩 단계에서 부딪힘 (ADR-024).

### 2026-05-09 — M2 끝 도그푸딩 #1 (poly-phony 보류 입력) → ADR-028~031

- [process] 도그푸딩 #1 의 _진짜 가치_ 가 _코드 작성 안 하고 4 결정 입력_ 만 들고 돌아온 것. ADR-024 의 _토대 검증_ 정신 그대로. _첫 사용자 한 명_ 이 라이브러리 표면을 흔들지 않도록 _ADR-028 잣대_ (1차 Akka 정통 / 2차 EffectTS typed / 3차 도그푸딩 boilerplate 사용자 측) 박힘 — 다음 결정의 재발견 비용 0.
- [api] poly-phony 의 _4 결정_ 중 라이브러리 표면 수용 = #1 ask 자체, #4 ctx.stop cascade graceful. 거절 = #2 typed reply err (Akka untyped), #3 watch+ask 통합 (Akka 분리), #6 Stream pass-through (Akka 별도 패턴). _거절_ 들은 사용자 측 wrapper 5-10 줄로 자연 표현 — ADR-028 의 3차 잣대.

### 2026-05-09 — M3 사이클 1 (ctx.stop graceful cascade)

- [architecture] `stopActor` 가 _재사용 가능 helper_ — ctx.stop / sys.shutdown / (M4) supervision restart 의 일부 모두 같은 흐름. children 재귀 stop + 자식 PostStop hook 호출까지 await + 자기 PostStop + Scope cleanup + watchers 알림 + unregister. M2 LEARNINGS §11 의 _자식 PostStop 미호출_ 정확히 해결.
- [effect-ts] `Effect.forEach(items, fn, { concurrency: "unbounded", discard: true })` — 자식들 _병렬 stop_ + 결과 무시. Akka 도 자식들끼리 순서 보장 X.
- [architecture] _부모.children 정리_ 는 stopActor 가 STM tx 안에서 — `ActorPath.parent(entry.path)` 로 부모 path 추출. root 면 None — 분기.

### 2026-05-09 — M3 사이클 2 (watch / watchWith / unwatch + Terminated)

- [architecture] watch 의 _ABA 안전_ 본질 — watcher.uid !== entry.uid 면 알림 안 감. _옛 incarnation 의 watch_ 가 _새 incarnation 의 stop_ 으로 잘못 트리거되지 않음. (path, uid) 양방향 TMap 의 정확한 의미.
- [api] watchWith 의 _자기 메시지 채널_ 표현력 — signal 보다 자연. 사용자 ADT 에 케이스 추가하면 _domain language_ 그대로 (예: `WorkerGone` ADT). 도그푸딩 측면에서 watch 보다 watchWith 가 _주력 표면_ 일 가능성.
- [architecture] _이미 죽은 ref watch_ → 즉시 self 에게 알림 (Akka 정통). watchOther 가 stale 분기 — Custom/Terminated 만 발사, Deferred case 는 watchTerminatedOther 가 자체 처리.

### 2026-05-09 — M3 사이클 3 (ctx.watchTerminated Effect 형태)

- [api] WatchMessage 에 _Deferred case_ 추가 — 임시 actor 없이 _Deferred 직접 등록_. 사이클 4 의 ask 와 다른 패턴 (ask 는 reply 가 _임의 타입_ 이라 actor 형태 필요, watchTerminated 는 _시그너처 void_ 라 Deferred 직접). 표면 작아짐.
- [process] 사이클 3 이 _Red 단계 안 거침_ — 구현이 placeholder 없이 한 번에. TDD 의 _의도 검증_ 은 Green 통과로 보장 — 단 forward-declare 효과는 사이클 1/2 의 placeholder 패턴에서 받음. _작은 사이클은 Red 생략 OK_.

### 2026-05-09 — M3 사이클 4 (ctx.ask)

- [effect-ts] `Effect.race` 의 _함정_: 첫 _success_ winner. fail 은 무시 (다른 쪽 기다림). _timeout fail 패턴_ 엔 `Effect.timeoutFail({ duration, onTimeout: () => Err })` 또는 `Effect.raceFirst` 사용. 첫 구현 시 race 로 짰다가 _timeout 테스트 fail_ 로 발견.
- [api] `ctx.ask` 가 actor handler 안에서만 동작 — `ref.ask` (외부 호출) 는 _ActorSystemHandle 의 spawn helper_ 필요. 사이클 4 단순화로 미룸. 도그푸딩 측면에서 _대부분 ask 가 actor 안_ 이라 우선순위 낮음. 외부 호출은 _bootstrap actor_ 우회.
- [architecture] 임시 actor 의 _자동 cleanup_ — `Effect.ensuring(stopActorByRef(tempRef))` 정상/timeout 둘 다 보장. Behaviors.stopped() 자발 종료 + _명시 stop_ idempotent (status 이미 stopped, queue close 안전, fiber.await 즉시 끝).

### 2026-05-09 — M3 사이클 5 (ChildFailed + DeathPact)

- [api] runInterpreter 의 _optional onFailure hook_ — supervision 외피의 cause 를 부모에게 ChildFailed 발사 통로. 정상 종료 (자발 Stopped) 시 호출 안 됨. _interpreter 와 system 의 의존 분리_ 유지 (interpreter 가 system 모름).
- [architecture] DeathPact 의 _두 검출 경로_ — onSignal 미부착 + Terminated, 또는 onSignal 결과 Unhandled + Terminated. 둘 다 fail 채널에 DeathPactException → supervision 외피 catchAllCause 흡수 → notifyParentOfChildFailure → 부모 ChildFailed. _연쇄 자연_.
- [process] 도그푸딩 측면에서 DeathPact _주의_ — watch 한 actor 에 onSignal 미부착이면 _자동 자살_. 부모 monitor 만 원하면 `.receiveSignal((_, _) => Effect.succeed(Behaviors.same()))` 명시 무시 처리 권장. USAGE §11.8 항목.

### 2026-05-09 — M3 사이클 6 (examples + DoD)

- [process] M3 6 사이클 회고 — 사이클 1 (stop 4테) → 2 (watch 4테) → 3 (watchTerminated 2테) → 4 (ask 3테) → 5 (ChildFailed/DeathPact 3테) → 6 (examples). 누적 115 테스트 (+16). _ADR-028~031 잣대_ 박힌 후라 의미 결정 _재발견 비용 0_ — 사이클 5 의 DeathPact 는 ADR-022 정신 그대로 직진.
- [api] examples/04-ask 의 typed err wrapper 패턴이 _도그푸딩 측 표면_ 의 본보기. raw `ctx.ask` + `Effect.flatMap(r => r._tag === "Found" ? Succeed : Fail(domainErr))` — 5줄. ADR-028 의 _3차 잣대_ (도그푸딩 boilerplate 사용자 측) 가 _실제로 보일 정도 단순함_.

### 2026-05-09 — DX 우려: yield/generator 누락

- [process/?] Effect.gen 안 yield* 누락 = silent bug 우려 사용자 제기. _gen 의 가독성 이득_ 이 _pipe 의 안전성_ 보다 큼 (사용자 의견 + 동의) → pipe 일괄 변환 안 함.
- [tooling] `@effect/eslint-plugin@0.3.2` 존재 검증 — 단 rule 은 `dprint` + `no-import-from-barrel-package` 두 개만. _yield 누락 잡는 rule 없음._ 사용자 _기능 없음_ 추측 정확 (이전 응답에서 hallucination 으로 _잡음_ 이라 한 거 정정).
- [tooling/?] AST 기반 typescript-eslint custom rule (`@typescript-eslint/no-floating-promises` 패턴 흉내) _기술적 가능_ — 약 200줄 type-aware. 단 도그푸딩 #2 에서 _실제 빈도_ 확인 후 (b) internal rule / (a) 별도 패키지 / (c) EffectTS PR 결정. 미리 만들면 도그푸딩에서 안 쓰이면 낭비.
- [tooling] 룰베이스 (정규식) 는 _Effect 가 의미 단위_ 라 type 검사 필요 → false positive 큼. 실용성 0.

### 2026-05-09 — effect 의존성 분류 (peerDep)

- [tooling] effect 같은 _라이브러리 런타임 패키지_ 는 항상 `peerDependencies` — 사용자와 _같은 module 인스턴스_ 공유해야 actor Fiber/Scheduler 가 동작. `dependencies` 에 두면 두 인스턴스 install 위험. pnpm hoist 가 보호하지만 _확실 보장은 peerDep_. (도그푸딩 #2 진입 직전 사용자 지적으로 정정 — ADR-033)
- [tooling] 라이브러리 패키지 검증 환경 (devDep) 과 호환 범위 (peerDep) 를 _분리_. devDep = ^3.21.0 (현재 검증), peerDep = ^3.10.0 (호환 범위 넓게). 우리가 새 API 쓰면 peerDep 하한 같이 올림.

### 2026-05-09 — 도그푸딩 #2 사이클 0 (poly-phony probe)

- [tooling] `file:../../../effect-actor` + `exports: { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }` 조합이 poly-phony vitest@4.1.5 환경에서 source-direct import _바로 동작_. 별도 loader 설정/build step 없이 30줄 probe 통과 (ActorSystem.create + Behaviors.receiveMessage + tell + Behaviors.same + sys.shutdown). ADR-032 의도 그대로.
- [tooling] effect 단일 인스턴스 보장 확인 — poly-phony 측 effect@3.21.2 가 root node_modules에 hoist, effect-actor symlink 가 그것을 가리킴. ADR-033 의 peerDep 의도 실제 검증.
- [tooling] poly-phony _기존_ peerDep 충돌 (`@effect/vitest@0.29.0` peerDep `vitest ^3.2.0` ↔ root `vitest ^4.1.5`) 이 file: dep 추가 시 npm 재해석으로 노출. effect-actor 무관. `--legacy-peer-deps` 우회 — poly-phony 쪽 후속 정리.

### 2026-05-09 — 도그푸딩 #2 사이클 2 (LLMBackend.Generate, Stream pass-through)

- [api] Stream pass-through wrapper (가이드 §wrapper #6) 정상 동작 — `replyTo: ActorRef<{ _tag: "Stream", stream }>` 패턴으로 reply 메시지에 `Stream` 객체 자체 담아 전달. caller는 `ctx.ask` → `Effect.map(r => r.stream)` 후 `Stream.runCollect`로 소비. 패턴 자체 5줄, 직관적.
- [effect-ts] **`BehaviorEffect<Msg> = Effect.Effect<Behavior<Msg>, unknown>` 의 R=never 강제가 도메인 코드에 마찰점.** `Mailbox.make()` (Scope 필요), `Effect.fork` (parent fiber scope) 등 Scope 의존하는 effect를 핸들러 안에서 못 씀. 우회 패턴: 핸들러 진입 시 `Scope.make()` 명시 생성 → `Mailbox.make().pipe(Scope.extend(scope))` → `Effect.forkDaemon` (parent와 무관) → 작업 끝 `Effect.ensuring(Scope.close(scope, Exit.void))`. 약 8줄 boilerplate가 LLM 호출 한 번마다 추가됨. 잦으면 helper 추출 후보.
- [api] HttpClient 같은 Effect 컨텍스트 의존성은 **factory 수준에서 yield하고 closure로 캡처** 해야 함. `makeBackendBehavior(opts): Effect<Behavior<BackendMsg>, never, HttpClient>` 형태. 핸들러 안에서 `yield* HttpClient.HttpClient` 못 함 (R=never). 캐치는 명확하나, 도메인 actor가 외부 자원 의존하는 경우 factory 패턴 강제됨 — 가이드/USAGE에 한 줄 정도 명시되면 도그푸딩 마찰 줄어듦.
- [api] error axis 분리 (Effect 채널 = AskTimeout / Stream 채널 = BackendError) 가 새 표면에서도 깔끔히 유지됨. ctx.ask가 Effect.fail로 BackendError를 만들지 않아도 됨 — Stream 객체 안에 묶여 caller가 소비할 때만 surface.
- [effect-ts] `Effect.forkDaemon` + `Effect.ensuring(Scope.close)` 패턴 — daemon fork가 parent fiber 스코프 밖이라 handler return 후에도 살아있고, work 완료 시 ensuring이 box 정리. caller가 stream 끝까지 소비하지 않으면 daemon이 끝까지 pump하다 종료 (zombie 가능성 작음). actor stop 시 daemon은 자동 interrupt 안 됨 (의도) — 만약 cascade interrupt 의미론을 바라면 다른 fork 모델 필요.
- [tooling] flake-free 5회. 96 테스트 (probe + LookupChat + Generate, +6 from baseline).
- [api/?] _후속 후보_: (1) `Behaviors.layered(layer, factory)` helper — Layer 합성해 R 채널 정리. (2) `ctx.fork(eff)` — instance Scope 안 fork (cascade interrupt). 도그푸딩 _빈도_ 더 보고 ADR 결정.

### 2026-05-09 — 도그푸딩 #2 사이클 3 (Registry-Backend integration)

- [api] **Behavior factory 패턴이 외부 의존성 actor의 표준** — `makeXxxBehavior(opts): Effect<Behavior<XxxMsg>, never, R>` 형태가 Effect 컨텍스트(HttpClient 등) 의존하는 actor에 강제됨. R=never의 BehaviorEffect 안에서 yield 못 하니, factory가 pre-build 후 Behavior만 전달. Registry처럼 자식 actor를 spawn하는 경우, 각 자식 Behavior도 factory 단계에서 미리 빌드해 setup에 closure로 넘김.
- [api] 자식 Behavior pre-build 패턴이 자연스러움 — Registry 입장에서는 BackendSpec → makeBackendBehavior(opts) → built Behavior 를 Map에 모은 뒤, setup 안에서 `ctx.spawn(beh, name)` 만 호출. setup의 R=never 제약과 깔끔히 맞물림. 도메인 코드 가독성 좋음.
- [api] **ctx.ask 연쇄 (lookup → generate)** 가 Effect.flatMap으로 자연스럽게 연결됨. error union (BackendNotFound | AskTimeout | BackendError) 가 Effect 채널에서 자동 누적되며, 마지막에 matchEffect로 묶어 Deferred로 빼내는 패턴이 안정적. handler 안에서 여러 ctx.ask가 직렬로 합성되는 일반 시나리오 검증됨.
- [api] domain-side error union이 점점 길어지는 게 살짝 우려 — agent 깊어질수록 `BackendNotFound | AskTimeout | BackendError | ...` 누적. typed reply error wrapper의 부담은 작지만, 합성 깊이가 깊어지면 helper로 묶고 싶은 욕구. 도그푸딩 더 진행하며 관찰.
- [tooling] HttpClient 같은 Effect 컨텍스트 자원이 actor tree 전체에 걸쳐 자연스럽게 propagation. Registry factory가 HttpClient 요구 → driver factory도 같은 요구 propagate → 테스트 program에서 한 번 provide 면 끝.
- [tooling] flake-free 5회. agent layer 4 파일 (probe + registry + backend + integration), 누적 +7 테스트.
- [process] **사이클 2 의 _후속 후보_ → 사이클 3 _표준 확정_** — factory 패턴이 _빈도 임계_ 넘음. USAGE §4.8 톤을 _후속 검토_ 에서 _표준 패턴_ 으로 격상. `Behaviors.layered` helper 는 _직접 factory 가 충분 깔끔_ 이라 _helper 의 가치 한계_ — 제공 시점 미룸.

### 2026-05-09 — 도그푸딩 #2 사이클 4 (watch+ask wrapper)

- [api] watch+ask race-fail wrapper (가이드 §wrapper) 동작 확인 — `Effect.raceFirst(ctx.ask, ctx.watchTerminated → fail ActorClosed)`. raceFirst 명시 (race는 첫 success winner라 fail 전파 안 됨, 가이드 §11.6 그대로).
- [api] 외부 ref.ask 부재로 인한 bootstrap pattern — Behaviors.setup<never>의 setup 안에서 spawn + Effect.forkDaemon(ask) + Effect.sleep + ctx.stop 한 번에. setup 완료 시점에 외부 Deferred 기다리는 패턴. 도메인 actor 없이 wrapper 검증할 때 표준 형태.
- [api] ActorClosed Tagged Error는 poly-phony 측 정의 (ADR-028 거절 항목). path 식별자는 ActorRef.toString(target) — 명시적 helper 노출, 자연스러움.

### 2026-05-09 — 도그푸딩 #2 사이클 5 (cascade shutdown — FINDING)

- **[runtime/!] BUG 후보** — `ctx.spawn` 직후 즉시 `sys.shutdown` 시 children setup이 race에 짐. 관찰 log: `['root', 'child:a:setup', 'child:b:setup']`. root PostStop이 children setup 완료 전 발사되어 cascade가 children에 도달 못 함. children의 PostStop은 영원히 호출 안 됨 (orphan). 100ms 대기 추가하면 정상 cascade (`['child:a:setup', 'child:b:setup', 'child:b:poststop', 'child:a:poststop', 'root']`). ctx.spawn이 fire-and-forget으로 ActorRef만 반환하고 child fiber 시작이 비동기인 것으로 보임. sys.shutdown은 in-flight setup을 기다리지 않음. 실 consumer 입장에서 *spawn 후 즉시 shutdown 시 PostStop이 호출 안 됨* — Akka Typed 의 spawn happens-before contract 위반.
- [api] 100ms 같은 sleep 우회는 도그푸딩에서만 가능. 실 production에서는 spawn 완료 보장이 필요. 후보 fix: (a) ctx.spawn이 setup 완료까지 await, (b) sys.shutdown이 in-flight spawn drain 후 cascade 시작, (c) Behaviors.setup이 부모의 메시지 처리 차단.
- [testing] 정상 cascade 시 sibling 순서는 reverse-spawn (LIFO): b의 poststop → a의 poststop. 의도된 의미론인지 ADR-031 명시 필요할 듯.

### 2026-05-09 — 도그푸딩 #2 종합 정리

- [process] 누적 5 사이클, 7 commit, 98/99 테스트 (이전 89 + 9 신규).
  - cycle 0: probe (file: dep + source-direct + ESM TS loader)
  - cycle 1: Registry.LookupChat (typed err wrapper)
  - cycle 2: LLMBackend.Generate (Stream pass-through wrapper)
  - cycle 3: Registry-Backend integration (factory + ctx.ask 연쇄)
  - cycle 4: askOrFailIfClosed (watch+ask race wrapper)
  - cycle 5: cascade shutdown (BUG 후보 발견)
- [process] 가이드 #2 의 검증 항목 4개 100% 커버.
  1. wrapper 3종 ✅ (cycle 1, 2, 4)
  2. ctx.stop graceful cascade ⚠️ 정상 동작 단 spawn race 조건 발견 (cycle 5)
  3. yield 누락 빈도 — 0건 (5 사이클, 핸들러 ~15개 표본)
  4. ESM TS loader ✅ (cycle 0)
- [api] 가이드/USAGE에 명시되면 좋을 항목들:
  - "외부 자원 의존 actor는 makeXxxBehavior(opts): Effect<Behavior, never, R> factory 패턴 강제" (handler R=never 제약 명시적 안내)
  - "핸들러 안 Mailbox.make / Effect.fork 같은 Scope 의존 effect는 명시적 Scope.make + forkDaemon + ensuring(Scope.close) 패턴 필요" — 8줄 boilerplate 표면화
  - "ctx.spawn happens-before contract — 현재 깨짐 / 의도된 비동기인지 결정 필요"

### 2026-05-09 — 도그푸딩 #2 종료 — 후속 사이클 결정

- [process] 도그푸딩 #2 결과 종합 후 effect-actor 측 입력 우선순위:
  1. **사이클 5 spawn race fix** — 가장 무게. 후속 사이클 1 (M3 보강) 즉시 진입. ADR-031 보강 + 새 사이클로.
  2. yield 누락 빈도 0건 — lint 도구 안 만듦 결정 _확정_ (도그푸딩 실증).
  3. 나머지 (factory 패턴 표준 / R=never 제약) — USAGE 이미 갱신됨 (사이클 2/3 후 §4.8). 추가 정리 안 함.
- [api] cycle 5 의 sibling LIFO 순서 — 정상 cascade 흐름은 _Akka 정통_ (마지막 spawn 자식부터 stop). ADR-031 결정 단계에 _명시 안 박힘_ — fix 사이클에서 ADR-031 보강 + 테스트로 명시.
- [process] 도그푸딩 #2 _가치 검증_ — 5 사이클 / 9 테스트 / 1 BUG 발견. ADR-024 의 _토대 검증_ 정신 그대로. wrapper 3종 의 도메인 부담 5-10줄 데이터, factory 패턴 표준 확정, spawn race 의 production 위험 — 모두 _코드 작성 안 했으면_ 못 잡았을 입력.

### 2026-05-09 — 도그푸딩 #2 사이클 5 BUG 후속 검증 (consumer 측)

- [runtime] poly-phony cascade.test.ts 의 100ms grace window 제거 후 통과 (9ms, 5회 flake-free). spawn 직후 sys.shutdown 호출해도 cascade 가 children setup 완료까지 기다린 뒤 depth-first PostStop 발사 (`child:a:setup → child:b:setup → child:b:poststop → child:a:poststop → root`). spawn happens-before contract 가 production 시점에서도 정상.
- [process] consumer 분석 (_"STM transaction 경계 미흡"_) 은 _부분적으로만_ 맞음. 실제 root cause 는 두 layer:
  1. spawn happens-before 부재 — STM 과 별개, fiber fork 후 Setup 평가 완료 await 안 함. Deferred latch 로 fix.
  2. Effect 3.21.2 `TMap.remove` 본체 버그 — `Chunk.partition` 술어 자리 잘못, hash 충돌 bucket 전부 비움. 우리 Registry 키들이 같은 bucket 으로 떨어져 cascade silent skip 야기. STM tx 자체는 atomic 했음, 그 _안의_ TMap.remove 가 broken.
  - (1) 만 fix 했으면 cascade 는 여전히 silent skip. consumer 가 라이브러리 내부 안 보니 (1) layer 로 추론한 건 자연스럽고 합리적 — _abstraction leak_ 의 사례. _라이브러리 잣대로 재해석_ 의 ADR-028 정신 그대로 (consumer 추론 채택 X, 우리 측 실측 채택).
- [tooling] **도그푸딩의 _진짜 가치_** — consumer lifecycle race 시나리오 (spawn → shutdown → cleanup) 가 라이브러리 격리 테스트가 못 잡는 BUG 를 surface. 라이브러리 측 system.test.ts 는 _spawn 후 sleep → shutdown_ 패턴이 default 였고, _즉시 shutdown_ 케이스가 없었음. consumer 가 _당연한 사용 시나리오_ 로 자연 노출 → 라이브러리 측 spawn race fix 사이클로 환류.
- [process] M3.1 사이클 1 의 입력 → 결과 흐름:
  - 입력: poly-phony 측 100ms grace 우회 보고 (도그푸딩 #2 cycle 5)
  - 진단 (consumer): STM 경계 추측
  - 진단 (라이브러리 측 실측): (a) latch + (b) TMap.remove 버그 두 layer
  - 후속: latch + Chunk LIFO + TMap → TRef<HashMap> 우회 (사용자 표면 변경 0)
  - 검증 (consumer): grace 제거 후 9ms / 5회 flake-free 통과
- [api] 사용자 표면 변경 없음 — `ctx.spawn` 시그너처 동일, `sys.shutdown` 의미 동일. 내부 구현만 강화. 도그푸딩 측 코드 한 줄도 안 바꾸고 fix 검증.

### 2026-05-09 — M3.1 사이클 1 (spawn race fix + Effect TMap 버그 발견)

- [runtime] spawn happens-before 보장은 _Deferred latch_ 한 줄로 깔끔. spawnInternal 안에서 `Deferred.make<void, never>` → runInterpreter 가 evaluateInitial 후 `Deferred.succeed` → spawnInternal 의 `Deferred.await(latch)` 로 마감. Setup 평가 도중 fail 도 supervision 외피 catchAllCause 안에서 latch.succeed 보장 → 영원 await 불가. 재귀 spawn (Setup 안 ctx.spawn) 도 같은 보장 자동 전파.
- [runtime] sibling LIFO cascade — children 자료구조를 HashSet (순서 X) → Chunk (insertion order) 로 바꾸고, stopActor 안 cascade 를 reverse + concurrency:1 sequential forEach 로. 마지막 spawn 자식부터 PostStop. ADR-031 보강.
- **[effect-ts/!] Effect 3.21.2 의 `TMap.remove` / `TMap.removeAll` 가 broken** — `Chunk.partition` 의 [excluded, satisfying] 반환을 잘못 해석해서 술어 자리에 entry[1] (값) 을 비교하거나 (`remove`), 결과 chunk 의 [0] / [1] 을 뒤바꿔 (`removeAll`) bucket 을 _완전히 잘못 갱신_. hash 충돌이 일어난 같은 bucket 의 다른 엔트리들이 한꺼번에 사라짐. Registry 의 키들 (`actor://demo/user`, `.../user/a`, `.../user/b`) 이 모두 bucket 13 으로 충돌 → user/b 한 개 unregister 시 user, user/a 도 함께 증발 → cascade 가 "이미 unregister 됐다" 로 silent skip → 첫 자식 PostStop 안 호출 → BUG #5 의 본질.
- [effect-ts] 우회: `Registry`, `entry.watchers`, `entry.watching` 모두 `TMap` → `TRef<HashMap>` 으로 교체. STM 안에서 atomic 갱신 그대로 가능 (TRef.update + HashMap.set/remove). 의미 동일, API 표면만 `TRef.update((m) => HashMap.set(m, k, v))` 로 약간 길어짐. 사용 빈도 낮은 자료구조라 boilerplate 비용 무시 가능.
- [effect-ts] `entry.children` 은 이미 `TRef<Chunk>` 라 영향 없음 (TMap 무관).
- [process] 도그푸딩 #2 사이클 5 의 _spawn race_ 보고가 _두 layer_ 의 결합 — (1) 진짜 spawn happens-before 부재 (latch 로 fix) + (2) TMap.remove 버그가 cascade 흐름의 _silent skip_ 원인. 디버그 console.log 로 _registry 가 unregister 한 번에 텅 빈다_ 는 사실을 발견 안 했으면 latch 만 추가하고 cascade 는 여전히 broken. _도그푸딩의 가치_ 가 두 번째 발견 (TMap 버그) 까지 끌어냄.
- [process] Effect 본체 버그라 upstream 보고 candidate. 단 검증/PR 일정 별도 → 우선 우회 fix 로 unblock.



### 2026-05-09 — M3 완료 명시

- [process] **M3 마일스톤 _전체_ DoD 확정.** 사이클 6 + M3 끝 도그푸딩 #2 (5 사이클) + M3.1 사이클 1 (spawn race fix 두 layer + consumer 측 9ms / 5회 flake-free 재검증) 모두 충족. PLAN.md M3 상태 표기 🟢 완료 / M3.1 도 🟢 완료. 누적 118 테스트.
- [process] M3 의 _진짜 완료_ 는 코드 작성 끝 (사이클 6) 이 아니라 _도그푸딩 환류 fix 까지 통과한 시점_ — ADR-024 정신 그대로. M2 끝 도그푸딩 #1 도 ADR-028~031 환류로 이어진 동일 패턴.
- [process] 다음 갈래 후보: (a) M4 진입 (Supervision restart strategy), (b) Effect TMap.remove 본체 버그 upstream 보고 (PR), (c) M∞ 직전 빌드 도구 결정 (ADR-027 후속). _라이브러리 설계 우선_ (ADR-028) 정신상 (a) 가 자연스러운 다음 단계.



### 2026-05-09 — M4 사이클 1 (Strategy ADT + Behaviors.supervise 빌더)

- [design] Akka Typed 의 `Behaviors.supervise(b).onFailure[E](r1).onFailure[E2](r2)` 체인을 fluent 빌더로 그대로 옮김. `SupervisedBehavior<Msg>` 가 `_tag: "Supervise"` + immutable `rules` + 새 객체 반환 `onFailure` 메서드. `receiveSignal` (M2) 패턴과 일관 — 사용자 학습 표면 단일.
- [design] _체인 순서 = rules 배열 순서 = 매처 순회 순서_ 약정 (가장 안쪽이 가장 specific). 사이클 4 의 sequential 매처 순회가 그대로 받음. 빌더 단계서 정렬/재배열 X.
- [design] `BehaviorMeta` 에 `supervisor: ReadonlyArray<SupervisorRule>` 추가. 빈 배열 = 기본 stop (현재 default 동작 유지). 사이클 2/3 의 interpreter 분기 입력.
- [design] `unwrapMeta` 가 _두 다른 종류 래퍼_ (WithMailbox + Supervise) 양쪽 추출 — 어느 순서로 nest 해도 양쪽 모두 잡음. 같은 종류 nested 는 _가장 바깥_ 만 (ADR-026 정신 유지). 구현은 최대 2회 loop. ADR-034 박음.
- [runtime] `interpretStep` 의 invariant violation fallback (`Setup` / `WithMailbox` / `Supervise` 도달 시 `Effect.succeed(current)`) 에 `Supervise` 추가. spawn 0단계가 풀어줘야 하는 케이스라 정상 흐름 도달 X.
- [test] 10 테스트 추가 (총 128). Strategy ADT 참조 동일성 + 빌더 immutability + 체인 순서 + meta 추출 (단독 / 중첩 / 두 종류 조합 / 두 종류 + nested 같은 종류 혼합). ADR-026 의 nested 같은 종류 = 가장 바깥 규칙 회귀 보호.
- [process] 사이클 1 산출이 사이클 2/3 에 _그대로_ 입력 — interpreter 의 catchAllCause 가 `meta.supervisor` 만 보면 됨. supervisor 없는 (빈 배열) 케이스 = 현 default stop 그대로 동작 → 회귀 0.



### 2026-05-09 — M4 사이클 2 (Strategies.resume — step-level supervision)

- [runtime] supervision 의 _granularity_ 결정: messageLoop 의 _step 단위_ Effect.exit. 한 메시지/시그널 처리 한 번이 한 step → 그 안 fail 만 supervisor 분기. PostStop 처리는 supervision 밖 (최후 정리 의미 — Resume 으로 PostStop 무시되면 액터 영구 살아 있어 의미상 어색).
- [runtime] Resume 의미 = "current 그대로, 실패한 메시지/시그널 무시" — `continue` 한 줄. cell/mailbox/uid 모두 자동 보존 (cell 인스턴스 그대로). lastActive 도 유지 (current 안 바뀜).
- [runtime] 외부 catchAllCause (runInterpreter 외피) 는 _최종 stop 강등_ 한정 — Resume 은 messageLoop 안에서 흡수, hook (parent ChildFailed 알림) 호출 X. Restart 도 같은 정신 (사이클 3에서). 즉 외부 외피 = "final stop" 표면.
- [design] `pickStrategy(rules, cause): Strategy` 헬퍼 — cause 에서 error 추출 (failureOption → defects → cause 자체) → rules sequential 순회 → 첫 매치 strategy. 빈 rules / 미매치 = 기본 stop. 사이클 4 의 매처 헬퍼 도입 시 표면 유지하고 내부만 보강.
- [design] cause squash 우선순위 — `Cause.failureOption` 우선 (typed fail), 그 다음 `Cause.defects` (Effect.die / throw), 마지막 cause 자체 (interrupted 등 매처 적용 어려운 케이스). interrupted 케이스에 매처가 매치하기 어렵게 의도 — restart 회피.
- [test] 10 테스트 추가 (총 138): pickStrategy 단위 5개 + Resume 통합 5개 (Resume 정상, 미매치 stop, supervise 안 함 = default stop 회귀, defect 잡음, 다회 fail 흡수). 회귀 안전 — 기존 128 모두 통과.
- [process] 사이클 2 산출이 사이클 3 에 _그대로_ 입력 — interpretterLoop 의 `if (strategy._tag === "Restart") { ... }` 한 분기만 추가하면 됨. Resume/Stop 흐름 변경 X.



### 2026-05-09 — M4 사이클 3 (Strategies.restart + PreRestart 흐름)

- [design] **Scope 모델 정정** — ADR-020 ("supervision = 같은 fiber") + ADR-021 ("instance Scope = restart 시 닫고 새로") 가 _같은 단일 scope_ 위에서 충돌. 단일 scope 닫으면 _interpreter fiber 도 죽음_ → restart 가 자기 fiber 자살. **ADR-035** 로 정정: ActorEntry 에 `cellScope` (lifetime, immutable) + `instanceScope` (TRef, instance 마다 새로). instanceScope = `Scope.fork(cellScope, sequential)` — child 관계라 cellScope.close 면 instanceScope 도 자동. Stop 흐름 boilerplate 안 늘어남.
- [runtime] Akka ActorCell 의 lifetime 모델 그대로 — cell 영구 + 자기 fiber 영구 + restart 마다 새 instance. interpreter fiber 가 entry.cellScope 에 fork → restart 거쳐도 같은 fiber. 사용자 fork/timer/scoped resource (M5+) 는 instanceScope 에 → restart 시 자동 정리.
- [runtime] **messageLoop = outer (restart loop) + inner (message loop)**. inner step fail → pickStrategy → Restart 면 inner break + needRestart=true. outer 가 PreRestart 신호 발사 (lastActive 의 onSignal) → onRestart 콜백 (자식 cascade + instanceScope 교체) → outer continue → initial 재평가 → 새 incarnation. 같은 fiber 안 재진입.
- [runtime] **자식 cascade stop on restart** — 기존 stopActor 의 children 부분과 동일 (LIFO + concurrency:1). children TRef 는 stopActor 가 parent.children 에서 자동 제거하므로 outer 가 별도 비우기 X.
- [design] **PreRestart fail 시 단순화** — 사이클 3 에선 fail 그대로 외부 propagate (stop 강등). Akka 정통은 _재귀 supervision + max retry_ — M5/withLimit 후속. 사이클 3 단계는 _hook fail = stop_ 안전망.
- [design] messageLoop 가 system 의 cleanup 에 의존하지 않게 _onRestart 콜백_ 으로 분리. messageLoop = restart mechanics (PreRestart 발사 + initial 재평가 + loop 재진입), system = 측면 정리 (자식 cascade + instanceScope 교체). 결합도 낮음.
- [runtime] **happens-before contract 보존** — startedLatch 는 `firstStart` 플래그로 _첫 spawn 직후만_ succeed. Restart 후엔 latch 이미 succeed 상태라 외부 spawn await 영원 X. M3.1 의 race fix 와 정합.
- [test] 6 통합 테스트 추가 (총 146): Setup 재실행 + ref 안정 / mailbox 보존 / PreRestart hook 호출 / 자식 cascade stop / 매처 미매치 = stop 회귀 / 다회 restart 안정. entry.test.ts 도 +2 (cellScope/instanceScope 분리 검증).
- [process] 큰 구조 변경 (Scope 분리) 을 _restart 본 구현 직전_ 에 단독으로 박고 회귀 0 확인 후 본체. 변경 단위 작게 → 디버그 표면 단순. 사이클 3 안에서 두 단계 (3a scope 분리, 3b restart) 로 사실상 분할.



### 2026-05-09 — M4 사이클 4 (Error matcher 헬퍼 + 순회 약정)

- [design] Akka 의 `.onFailure[E](strategy)` _타입 매칭_ 표면을 TS 로 못 옮김 (런타임 instanceof 만 가능). 두 노선:
  - (A) `.onFailure(ctor, strategy)` 오버로드 — 자연스러움 ↑, TS 시그너처 분기 어려움.
  - (B) 헬퍼 (`Strategies.matchInstance(Ctor)`) — boilerplate 약간, 표면 일관, ADR-028 정신.
  - **(B) 채택, ADR-036.** 사용자가 specific → general 순으로 작성: `.onFailure(matchInstance(IllegalState), restart).onFailure(matchInstance(IO), resume).onFailure(matchAll, stop)`.
- [design] 헬퍼 3개: `matchInstance(Ctor)` (`instanceof`), `matchTag(string)` (`_tag` 필드 — Effect.TaggedError / Data.tagged 호환), `matchAll` (`() => true`, catch-all). 사용자가 직접 `(e) => ...` 로 합성도 OK — 헬퍼는 _공통 패턴 단축_.
- [runtime] `pickStrategy` 알고리즘 변경 0 — 사이클 2 의 sequential 순회 그대로. 헬퍼만 추가 → 회귀 안전.
- [test] 10 테스트 추가 (총 154): 매처 헬퍼 단위 4개 (matchInstance / instanceof subtype / matchTag / matchAll) + 매처 chain 통합 4개 (Akka 모양 IllegalState→restart, IO→resume, catch-all→stop / 첫 매치 채택 (specific 우선) / DeathPactException matchTag / 미매치 = 기본 stop 회귀).
- [discovery/!] **자발 Stopped 는 watcher 알림 안 감** — 사이클 4 DeathPactException 통합 테스트 작성 도중 발견. 현재 `stopActor` 만 watchers 알림 발사. messageLoop 의 _자발 Stopped → PostStop emit → fiber 종료_ 흐름은 `entry.watchers` 알림 없이 끝남. Akka Typed 정통: 자발 Stopped 도 termination → watcher 알림 가야. _별개 의제_, 사이클 4 본질 (매처) 과 무관해 우회 (직접 `Effect.die(new DeathPactException(...))` 로 트리거). M4 끝 도그푸딩 (사이클 5) 또는 M5 에서 결정.
- [process] 사이클 4 산출 = 헬퍼 + ADR. 알고리즘 변경 0 — 사이클 1~3 의 토대가 _깔끔_ 하면 다음 사이클이 _작아진다_ 는 정신 (ADR-024) 그대로. 사이클 4 가 가장 작은 사이클 (~30분).



### 2026-05-09 — M4 사이클 5 (examples/05-restart + 발견 의제 정리)

- [examples] `examples/05-restart.ts` 작성 + 동작 확인. 시연 항목: supervise 빌더 + restart 매처 / stable ref+uid / mailbox 보존 (Boom 이후 Inc/Show 메시지가 새 incarnation 처리) / Setup 재실행 (counter 0 으로 리셋 + 자식 다시 spawn) / PreRestart hook 호출 / 자식 cascade stop / 매처 chain (TypeError → restart, catch-all → stop). 출력 trace 가 모든 요소 확인.
- [discovery/!] **Supervisor stop 강등 시 PostStop hook 안 호출** — examples/05 의 fatal (RangeError, 미매치) 출력에서 `[counter] PostStop` 안 나옴. 흐름: step fail → pickStrategy → 미매치 → messageLoop return Effect.failCause → 외부 catchAllCause 가 흡수 → fiber 종료. _자발 Stopped_ 흐름 (postStopHandled 플래그) 거치지 않아 PostStop hook skip. ADR-021 의 "PostStop = 자동 hook (instance Scope finalizer 와 보완)" 약속과 모순. _root 의 shutdown_ 시 stopActor 가 자기 PostStop offer 하지만 fiber 이미 종료라 처리 안 됨 — 자식 cascade 는 stopActor 가 직접 처리해서 OK.
- [discovery/!] **자발 Stopped 시 watcher 알림 안 감** (사이클 4 발견 재확인) — Akka Typed: 자발 stop 도 termination → watcher 알림 가야. 현재는 외부 stopActor 만 알림 발사. messageLoop 의 자발 Stopped → PostStop emit → fiber 종료 흐름은 watchers 알림 없이 끝남.
- [discovery] **PreRestart 처리 도중 fail 시 단순 stop 강등** — 사이클 3 결정으로 일단 단순화 (재귀 supervision 없음). M5 withLimit (재시도 한도) 와 함께 본격 처리 예정. 현재 단계는 _안전망_.
- [process] **세 발견 의제는 같은 패밀리** — _stop/cleanup 흐름의 여러 경로 정합성_. 자발 Stopped / 외부 ctx.stop / supervisor stop 강등 / supervisor restart — 각 경로의 PostStop / watcher / Scope cleanup / fiber 종료 약속이 통일되지 않음. M4 끝 도그푸딩 + ADR-037 (가칭 _stop 경로 통일_) 후보.
- [process] DoD 부분 체크 — `examples/05` 항목 ✅. _M4 끝 도그푸딩 (~1주, ADR-024)_ 항목은 _사용자 진행 대기_ — M4 _전체_ DoD 확정은 도그푸딩 환류 fix 후 (M3 패턴과 동일).
- [process] 도그푸딩 진행 방향 결정 — **poly-phony 측에서 직접** (M3 도그푸딩 #2 패턴 동일). 사이클 5 는 examples/05 + 발견 의제 정리로 닫고, 도그푸딩 입력 받으면 M4.도그푸딩 / M4.1 환류 fix 후속 사이클 진행 예정. 사이클 5 발견 3 의제 (supervisor stop PostStop / 자발 Stopped watcher / PreRestart 재실패) 도 poly-phony 사용 중 _실제 노출_ 되는지 확인 후 우선순위 정함.



### 2026-05-09 — Effect TMap.remove/removeAll 버그 upstream 보고

- [process] **사용자 비판적 의심으로 검증 깊이 ↑** — _"큰 라이브러리에서 이런 본체 버그가 살아있을 리가, 우리가 잘못 사용하고 있을 가능성 더 높다"_ 의 사용자 challenge 가 검증의 _발판_. 단순 코드 분석 → 격리 reproducer + 공식 가이드 + 시그너처 확인 + own test 분석까지 _깊이 있는 검증_ 으로 발전. 결과적으로 _진짜 본체 버그_ 확정 + upstream 보고 가치 ↑.
- [process] **검증 단계** (참고용 — 다음 _본체 버그 의심_ 케이스 동일 패턴 사용 가능):
  1. _격리 reproducer_ — 라이브러리 자체 API 만 사용, 우리 도메인 분리 (custom Hash 로 강제 충돌)
  2. _최신 버전 확인_ — npm latest 가 우리 버전인지 (이미 fix 됐는데 우리만 오래됨 가능성 차단)
  3. _공식 가이드 / 명세_ 확인 — 우리 사용 패턴 가이드와 일치하는지
  4. _주변 함수 비교_ — 같은 자료구조 다루는 다른 함수의 구현이 일관된지 (set vs remove 의 비교 모양)
  5. _own test 검사_ — upstream test 가 _이 케이스 다루는지_ (안 다루면 _2년 살아남은 이유_ 명확)
  6. _GitHub issue/PR 검색_ — 이미 보고됐는지
- [discovery] **확정된 사실**: Effect 3.21.2 (현재 npm latest) 의 `TMap.remove` / `removeAll` 는 `Chunk.partition` 결과 변수 (`[toRemove, toRetain]`) 를 시그너처 (`[excluded, satisfying]`) 와 거꾸로 바인드. 추가로 `remove` 는 predicate 자리에 `entry[1]` (value) 를 비교 — 두 번째 잘못. 결과: hash 충돌 bucket 통째 비움 + tSize 1 만 감소 = 데이터 corruption (size != 실제 entry 수).
- [discovery] **2년 살아남은 이유**: Effect own test (`TMap.test.ts`) 가 짧은 varied 키 (`"a"`, `"b"`) 만 사용 → 다른 bucket 으로 분산 → bucket-wipe 안 일어남. STM 자체가 minor feature 라 community 노출 적음.
- [process] **upstream issue 박음**: https://github.com/Effect-TS/effect/issues/6225 (제목 _"TMap.remove and removeAll incorrectly clear entire bucket on hash collision"_). 본문: 인사 + 격리 reproducer (custom Hash 강제 충돌, 도메인 중립) + 현재 코드 + 제안 fix patch. ~96 줄, 우리 도메인 흔적 0, attribution 없이 (commit 패턴과 일관).
- [code] `src/registry.ts` + `src/entry.ts` 의 우회 주석에 issue link + 복원 조건 (_"위 issue fix 가 release 되면 TMap 직접 사용으로 swap 가능"_) 명시. fix release 되면 `TRef<HashMap>` → `TMap` 한 줄 swap 으로 복원.
- [process] OSS 환류 의의 — ADR-028 의 _라이브러리 정통_ 정신 그대로. 우리 우회는 _임시_, upstream fix 후 정통 복원이 자연스러움. PR 까지는 안 보냈지만 (C 갈래) reproducer + fix patch 까지 포함해 maintainer 부담 최소화.



### 2026-05-09 — M4 도그푸딩 #3 (poly-phony 측, 5 사이클)

#### 결과 요약

- 5 사이클 / 106-107 테스트 / flake-free.
- 핵심 약속 검증 9개 중 ✅ 8 / ⚠️ 1 / N/A 1 (matchTag — 도메인 시나리오 자연스레 미등장).
- 사이클 5 발견 의제 3개 중 **의제 1, 2 노출 확정**. 의제 3 (PreRestart 재실패) 만 N/A.
- _신규_ F1: `sys.shutdown` hang when `watchWith` registered — production 영향 가장 큼.

#### Consumer 분석 (F3 단일 root cause 추정, 가설)

> _세 finding 의 패턴이 일치: "종료 통로 일부 (PostStop hook + watcher 알림 + watcher subscription 정리) 가 일부 stop 경로에서 실행 안 됨". 외부 ctx.stop 만이 모든 통로를 지나감. 자발 Stopped, supervisor stop 강등 둘 다 일부 통로 skip. 이 skip 으로 인해 watcher subscription 이 dangling → sys.shutdown 의 drain 이 그것을 기다리며 hang._

자발 Stopped (cycle 5A) / 외부 `ctx.stop` (cycle 5B) / supervisor stop 강등 (cycle 5C) 세 경로가 _다른 종료 통로_ 를 거침. cycle 5B 만 모든 통로 (PostStop + watcher 알림 + subscription 정리) 통과. 나머지 두 경로는 일부 skip.

#### 라이브러리 측 평가 (ADR-024 / ADR-028 정신)

Consumer 분석은 _가설_. M3.1 spawn race 의 consumer (_STM 경계 추측_) → 라이브러리 실측 (_latch + TMap 두 layer_) 정정 패턴과 동일하게, _라이브러리 측 실측_ 으로 검증 필요. 단 우리 사이클 5 발견 (3 의제) 과 정확히 일치 — 가설 정당성 ↑.

F1 (shutdown hang) 은 우리 사이클 5 에서 발견 못 한 _신규_. consumer 시나리오가 라이브러리 격리 테스트 못 잡는 BUG surface 한 케이스 (M3.1 spawn race 와 같은 정신).

#### 후속 사이클 결정 (M4.1)

1. **사이클 1**: F1 진단 + fix. consumer reproducer 받아 system.test.ts 박고 _진짜 root cause_ 확정. 가설 (watchWith dangling subscription → drain 대기) 검증.
2. **사이클 2**: 의제 1+2 (자발 stop / supervisor stop 강등 시 PostStop + watcher 통합). ADR-037 (_stop/cleanup 경로 통일_) 박을지 결정 — 사이클 1 의 진단으로 단일 root cause 확정되면 ADR-037 박음.
3. **사이클 3**: poly-phony 측 재검증 → M4 _전체_ DoD 🟢.

#### M5 로 미룸

- 의제 3 (PreRestart 재실패 시 stop 강등) — restart-cleanup 정책 전체와 묶어 결정. M5 의 withLimit 와 함께.
- matchTag 본격 — agent layer 가 supervise 적용 시 BackendError ADT (Transient/Permanent/ProtocolViolation) 매처 chain 으로.

#### Consumer 추가 관찰 (참고)

- _resume 의미_ — "Ref 쓰기는 살아남고 Effect.fail 만 흡수" 멘탈모델 명확. counter=3 깔끔히 입증.
- _supervise + setup + receive_ 합성 자연스러움. 단 _setup 안에서 fail_ 시 어디로 가는지 미검증.
- _watchWith_ 의 fire 조건 일관성 깨짐 — 의제 2 + F2 의 핵심 surface.
- 4 핵심 약속 + 3 의제 모두 5 사이클 안에 surface — M3.1 도그푸딩 (cycle 5 cascade race) 과 비슷한 ROI.



### 2026-05-09 — M4.1 사이클 1 (F1 진단 + fix)

#### 진단 (라이브러리 측 실측)

격리 reproducer (parent 가 child 를 watchWith → `sys.shutdown`) effect-actor 측에서 즉시 재현 — baseline 3ms / F1 1004ms timeout. trace log 로 hang 위치 정확히 확정:

```
[stop:user/kid] notify 1 watchers   ← child 의 watcher (root) 알림 = root.mailbox 에 ChildGone enqueue
[stop:user] cascade done
[stop:user] PostStop offered        ← root.signalQueue 에 PostStop offer
[stop:user] awaiting own fiber       ← Fiber.await(rootFiber) HANG
```

**Root cause**: _shutdown cascade 도중 self-loop watcher 알림_. cascade 가 child stopActor → child watchers 알림 → root.mailbox 에 ChildGone enqueue. 그 후 root.PostStop offer. root messageLoop:
- iter 1: ChildGone (mailbox) 처리 → handler noop
- iter 2: `Effect.race(signalQueue.take, mailbox.take)` 진입 — 이미 enqueue 된 PostStop 잡지 못함 → hang

핵심 trigger: _죽어가는 ancestor 에게 자식이 watcher 알림 발사_. 외부 watcher 면 hang 안 남.

#### Consumer 가설 vs 실측

Consumer 의 _drain 대기_ 가설은 _부분적으로 맞음_:
- ✅ _drain 대기_ — root 가 mailbox ChildGone 처리 후 race wait 에서 PostStop 못 깨움
- ⚠️ _trigger_ 는 더 구체적 — _shutdown cascade 안 self-loop watcher 알림_ 이 정확한 시점

M3.1 spawn race 패턴 재현 (consumer = STM 추측, 실측 = 두 layer). 도그푸딩 흐름의 _학습 양식_ 일관.

#### Fix (노선 A — 가장 작은 변화)

`stopActor` 의 watchers 알림 forEach 안에 _watcher.status === "stopped" 면 skip_ 한 줄 추가. 의미상 자연 — 죽어가는 watcher 에게 알림 무의미.

```ts
const watcherStatus = yield* STM.commit(TRef.get(wFound.value.status));
if (watcherStatus === "stopped") return;
```

회귀 0 — 외부 watcher (다른 sibling) 케이스는 정상 알림 (테스트로 검증).

#### 회귀 테스트 (3개 추가, 총 157)

- baseline (watchWith 없음 / shutdown < 500ms)
- F1 (watchWith + shutdown 정상 < 500ms — fix 검증)
- 외부 watcher 정상 알림 — fix 가 외부 케이스 회귀 X

#### 부산물 — typecheck 회귀 fix

진단 중 발견: 사이클 4 commit 이 typecheck 통과 못 한 채 박힘 (`Strategies.matchInstance` 의 `ReadonlyArray<unknown>` 가 builtin Error 의 `(message?: string, options?)` 시그너처와 호환 X). runtime 은 정상이라 test 통과로 미발견. `any[]` 로 lenient — 별도 commit 분리 (`fix: Strategies.matchInstance 시그너처 lenient`).

#### 다음 (사이클 2)

의제 1, 2 — 자발 stop / supervisor stop 강등 시 PostStop + watcher 알림 통합. F1 fix 와 _독립_ — 다른 root cause (_종료 통로 자체가 호출 안 됨_ vs F1 의 _호출 후 wake-up 실패_). ADR-037 박을지 사이클 2 진단 후 결정.



### 2026-05-09 — M4.1 사이클 2 (의제 1+2 fix — onSelfTermination 통일)

#### 진단 결과 (실측)

- **의제 1**: `supervise + matchAll → stop` 으로 child fail → events: `[]`. supervisor stop 강등 시 child PostStop hook 안 호출. messageLoop 의 `needStop` 분기에서 `Effect.failCause` 로 즉시 propagate, 자발 Stopped 흐름의 `interpretSignalStep(PostStop)` 거치지 않음.
- **의제 2**: `Behaviors.stopped` 반환 → events: `["child:postStop"]`. child PostStop 정상, 단 parent 의 ChildGone 미수신. _watchers 알림 / registry unregister / parent.children_ 모두 `stopActor` 안에 있는데 자발 Stopped 는 stopActor 거치지 않음 → cleanup 부재.
- **비교 (외부 ctx.stop)**: `["child:postStop", "parent:ChildGone"]` 정상.

→ 두 의제는 _다른 root cause_ (의제 1 = 통로 호출 안 됨, 의제 2 = cleanup 자체 부재). consumer 의 _F3 단일 root cause_ 가설 (ADR-037) 은 _semantic 일치_ 측면 정확하지만 _근본 메커니즘_ 은 두 layer.

#### Fix (노선 C — 작은 fix 두 개 + ADR-037 큰 통일은 별도)

**1. `onSelfTermination` 콜백 도입 (interpreter.ts)**
- `runInterpreter` / `messageLoop` 에 `onSelfTermination?: () => Effect<void>` 옵션 추가.
- _자발 Stopped 분기_ + _supervisor stop 강등 분기_ 둘 다 호출.
- supervisor stop 강등은 PostStop hook 도 추가 발사 (`Effect.ignore` 로 fail 무시 — 원본 cause propagate 우선).

**2. `notifyWatchersOnSelfTermination` 헬퍼 (system.ts)**
- `stopActor` 의 _watchers 알림 + registry unregister + parent.children 갱신_ 부분만 추출.
- F1 fix 의 status check (죽어가는 watcher skip) 그대로 포함.
- _cellScope close 안 함_ — 자기 fiber 가 자기 scope 닫으면 self-interrupt 위험. cellScope 는 사이클 2 범위 밖.

**3. `stopActor` 의 cleanup 부분 제거 (단일 source of truth)**
- 이중 호출 회귀 발견: 외부 stopActor 가 watcher 알림 + fiber 가 PostStop 받고 messageLoop 가 onSelfTermination 호출 → 두 번 fire (ABA test 실패로 surface).
- 해결: `stopActor` 에서 _watchers 알림 + registry unregister + parent.children_ 제거 → `onSelfTermination` 만 함.
- 외부 stopActor 도 _fiber 가 PostStop 받고 messageLoop 종료 직전 onSelfTermination 호출_ → 단일 경로.
- `stopActor` 는 _status=stopped + cascade + PostStop offer + fiber await + cellScope close + queue shutdown_ 만.

#### 회귀 테스트 (4개 추가, 총 161)

- supervision.test.ts:
  - `supervise + matchAll → stop` 으로 child fail → PostStop hook 호출됨 (의제 1)
  - `supervise + 미매치` → 기본 stop 도 PostStop hook 호출 (회귀)
- system.test.ts:
  - `Behaviors.stopped` 반환 → parent watchWith 콜백 정상 발사 (의제 2)
  - 자발 Stopped 후 registry 에서 child unregister 됨 (stale entry 제거)

#### 회귀 발견 + 정정

ABA test (M3 ctx.watch 사이클 2) 실패 — 외부 stopActor 의 watcher 알림 + onSelfTermination 의 watcher 알림 _이중_. _Queue.offer 두 번 = 두 메시지_, idempotent X. fix: stopActor 에서 watcher 알림 제거 (단일 source of truth). 위 _Fix #3_ 으로 정정.

#### 사이클 2 범위 밖 (ADR-037 후보)

- _자발 Stopped 후 cellScope 누수_ — entry 의 cellScope 가 영구 살아있음. 사용자가 sys.shutdown 호출하면 root 의 cellScope close 시 _자식 entry 의 cellScope_ 는 별개 (cellScope 가 _서로 child 관계 아님_) 라 남음. 메모리 누수.
- _자발 Stopped 시 자식 cascade 안 함_ — 자식 actor 가 _고아_. Akka 정통은 _자발 stop 도 자식 cascade_.
- _PreRestart 처리 도중 fail = 단순 stop 강등_ (사이클 5 발견 의제 3) — M5 withLimit 와 같이.

세 의제 모두 같은 패밀리 (_stop/cleanup 경로 정합성_). M5 끝 본격 도그푸딩 (ADR-024) 에서 표면 노출 빈도 보고 ADR-037 박을지 결정.

#### 다음 (사이클 3)

poly-phony 측 재검증 — M4.1 fix 가 도그푸딩 #3 의 5 사이클 (특히 cycle 3 watchWith + shutdown / cycle 5A 자발 / cycle 5C supervisor stop) 통과 확인. 모두 통과 시 M4 _전체_ DoD 🟢.



### 2026-05-09 — M4.1 사이클 3 (재검증) + M4 완료 명시

#### 재검증 결과 (poly-phony 측, 5 사이클 × 5회 = 25회)

- **F1 (cycle 3 sys.shutdown hang with watchWith)**: 1112ms timeout → 111ms 정상 종료. ✅
- **의제 2 (cycle 5A 자발 `Behaviors.stopped` → watcher 미알림)**: childGoneCount 0 → 1. ✅
- **의제 1 (cycle 5C supervisor stop 강등 → PostStop 미호출)**: postStopCount 0 → 1. ✅
- **F2 (cycle 5C supervisor stop 강등 → watcher 미알림, 5C 부수 finding)**: childGoneCount 0 → 1. ✅ — 의제 1 fix 와 같은 `onSelfTermination` 통로로 자동 해결.
- **회귀 검증**: M4 4 핵심 약속 (resume / restart / PreRestart / 자식 cascade) + 매처 (matchInstance / matchAll) 모두 회귀 0. agent/ 디렉토리 합산 runtime ~1.02s 일관 (편차 ~10ms). 8 M4 테스트 + 99 (M3 + 기타) = 106/107 통과 1 skipped 안정.
- **새 finding**: 0. 잠재 의제 (cellScope 누수 / 자식 cascade / PreRestart 재실패) 는 현재 도메인 시나리오에서 자연스럽게 노출 X — M5 묶음 후보.

#### M4 완료 명시

- [process] **M4 마일스톤 _전체_ DoD 확정.** 코드 사이클 1~5 + M4 끝 도그푸딩 #3 (5 사이클 / 4 finding) + M4.1 환류 사이클 1~3 (F1 + 의제 1+2 fix + consumer 측 25회 flake-free 재검증) 모두 충족. PLAN.md M4 상태 표기 🟢 완료. 누적 161 테스트.
- [process] M4 의 _진짜 완료_ 도 M3 패턴 그대로 — 코드 작성 끝 (사이클 5) 이 아니라 _도그푸딩 환류 fix 까지 통과한 시점_. ADR-024 정신 일관 (M2 끝 #1 → ADR-028~031, M3 끝 #2 → M3.1, M4 끝 #3 → M4.1).
- [insight] **single root cause 가설 검증.** consumer (poly-phony) 측 ADR-037 가설 = "F3 단일 root cause". 라이브러리 측 진단 = "두 layer (의제 1 = 통로 호출 안 됨, 의제 2 = cleanup 자체 부재)". 결론: _semantic 일치_ 측면에서 가설 정확, _근본 메커니즘_ 측면에서는 두 layer. 작은 fix 두 개 (`onSelfTermination` 콜백 + cleanup 단일 source of truth) 로 4개 finding (F1 + F2 + 의제 1 + 의제 2) 모두 closed → consumer 가설의 _semantic 통일_ 직관이 사실상 맞았음. ADR-037 큰 통일은 미루고 작은 fix 로 충분 → _라이브러리 설계 우선_ (ADR-028) 정신 그대로.
- [process] 다음 갈래 후보: (a) M5 진입 (Backoff / Stash / Timer), (b) Effect TMap 본체 PR (issue #6225 follow-up), (c) M∞ 직전 빌드 도구 결정 (ADR-027 후속). _라이브러리 설계 우선_ 정신상 (a) 가 자연스러운 다음.



### 2026-05-09 — M5 사이클 1 (restart.withLimit + 의제 3 통합, ADR-037)

- [design] **`Strategies.restart` 의 자료구조 결정 — Strategy + withLimit 빌더 합성 객체.** Akka 의 `SupervisorStrategy.restart.withLimit(...)` 모양 그대로. 원본 `Strategies.restart` 는 `{ _tag: "Restart", limit: null, withLimit: (limit) => new Strategy }` — `_tag` 필드는 Strategy union narrow 에 그대로 쓰이고 `withLimit` 메서드는 외부에서만 의미. interpreter 의 `if (strategy._tag === "Restart") { ... strategy.limit ... }` 분기는 `withLimit` 무시 (구조적 호환). _참조 동일성 유지_ + _빌더 표면 친숙_ 둘 다 충족.
- [design] **두 fix 한 사이클 묶음 — _restart 한도 초과_ + _PreRestart 재실패_.** 공통 분모: 둘 다 restart 분기 안 _stop 강등_ → 기존 supervisor stop 강등 경로 (`needStop` 분기, M4.1 사이클 2 의 `onSelfTermination` + PostStop hook 단일 source of truth) 그대로 재사용. 변경: `messageLoop` 의 restart 분기 한 군데에 _한도 검사_ + _PreRestart Effect.exit 캡처_ 추가. M4.1 의 cleanup 통일 패턴이 그대로 _확장_ 되어 회귀 안전. ADR-037.
- [design] Akka 정통 — _restart 시도 자체가 카운트_ (성공/실패 무관). 슬라이딩 윈도우: `restartHistory.push(now)` + `now - restartHistory[0] > windowMs` while-shift. 비교는 `>` (즉 `maxNrOfRetries=2` → 1, 2 번째 시도는 restart, 3 번째가 stop). Akka 그대로.
- [runtime] **`restartHistory` 는 `messageLoop` 안 mutable JS array (한 fiber lifetime).** TRef/STM 불필요 — 한 fiber 안 단일 owner. ADR-037 결과 (+) 항목으로 명시. Akka 의 `RestartImpl.restartCount` 와 같은 위치.
- [runtime] **`Strategies.restart` 자체는 `Strategy` union 으로 좁혀지면 `withLimit` 가 보이지 않지만 _값_ 으로는 그대로 있음.** 즉 사용자가 `Strategies.restart.withLimit(...)` 호출 시 TS 타입은 `Strategy & { withLimit }` 그대로 — Strategies 객체에 _그 augmented 타입_ 으로 노출. 그러나 `onFailure(matcher, Strategies.restart)` 에 그대로 넘기면 strategy 파라미터의 `Strategy` 타입으로 narrow → augmented 부분 무시되고 `_tag === "Restart"` 분기로 들어감. _별 추가 work 없이 양쪽 동시 만족_.
- [test] 8 테스트 추가 (총 169): 단위 4 (`Strategies.restart` 의 limit 기본값 / withLimit 새 객체 / 호출마다 다른 객체 / 참조 동일성 회귀) + 통합 4 (한도 초과 stop 강등 + watcher 알림 / sliding window 카운트 리셋 / 무한 restart 회귀 / PreRestart 재실패 stop 강등 + watcher 알림). 5회 flake-free. errors.test.ts 에 `RestartLimitExceeded` 단위 1개 추가.
- [insight] **ADR-037 의 _통일 정책_ 이 자연스러운 이유** — M4.1 사이클 2 에서 `onSelfTermination` 콜백 도입한 시점에 _stop 강등 경로_ 가 단일화되어 있었음. 이번 사이클은 그 경로에 _두 새 진입점_ (한도 초과 / PreRestart 재실패) 만 추가. 즉 _아키텍처가 fix 를 자연스럽게 받아들임_ — M4.1 의 통일 작업이 M5 사이클 1 의 _비용을 미리 지불한 셈_. _라이브러리 설계 우선_ (ADR-028) 정신의 실효 사례.
- [process] supervision.test.ts 에서 `RestartLimitExceeded` import 했다 제거 — 통합 테스트는 cause type 검증보다 _발사된 cleanup hooks_ (PostStop hook 호출 + watcher 알림) 검증이 우선. cause 자체 단위 검증은 errors.test.ts 에서.



### 2026-05-09 — M5 사이클 2 (restartWithBackoff, ADR-038)

- [design] **ADT 형태 — `Restart` 에 `backoff: BackoffConfig | null` 추가 (option A).** 새 `_tag` 분리 (option B) 대신. 이유: interpreter 의 `if (strategy._tag === "Restart")` 분기 그대로 두고 안에서 `backoff` 만 체크 — 사이클 1 의 코드 경로 재사용. _사이클 1 의 `restart` 와 사이클 2 의 `restartWithBackoff` 가 _반환 타입 동형_ (`Strategy & { withLimit }`) 으로 `.withLimit` chain 자연스러움._ 사용자 표면 일관성 + 내부 복잡도 단순화.
- [design] **`restartHistory` 카운터 공유 — 한도 + backoff 가 _같은 윈도우_.** 사용자 모델 단순화. backoff-only 사용 시 `restartHistory` 무한 증가 (메모리 누수 작음, _limit 부착 권장_ 으로 문서화). _자료구조 단일 carrier_ 가 ADT 단일 분기와 짝.
- [design] **jitter 는 + 방향만 (Akka 정통).** `exp * (1 + Math.random() * randomFactor)`. ± 방향이면 sleep 너무 짧아 backoff 의미 약화. Akka `BackoffSupervisor` 와 일관.
- [bug] **첫 구현 — `restartHistory.push` 가 `pendingRestartLimit !== null` 조건부였음 (사이클 1 코드 그대로).** backoff-only 케이스 (limit 없음) 에서 `restartHistory.length` 항상 0 → `attemptIndex=0` → 항상 minBackoff (점진 증가 X). 통합 테스트 _backoff 점진 증가_ 가 즉시 잡음 (`t2 - t1 ≥ 140` 기대, 실측 82). fix: push 를 한도 검사와 _분리_ — 항상 push, 윈도우 슬라이드만 limit 있을 때. _사이클 1 의 자료구조가 사이클 2 의 케이스를 _완전 모르고_ 만들어졌다는 신호_ — 자료구조 변경이 사이클별로 점진적이라 어쩔 수 없는 trade-off, 그러나 _두 use case 의 invariant 차이_ 를 박는 게 좋다 (코드 주석으로 명시).
- [runtime] **backoff sleep 도중 mailbox 보존 자동.** `Effect.sleep(delay)` 는 fiber 만 잠. mailbox queue 의 message offer 는 그대로. sleep 후 새 incarnation 이 take. _Akka 동일 — 사용자 의식 X_. 통합 테스트 (`during-backoff-1/2`) 가 검증.
- [runtime] **backoff sleep 도중 sys.shutdown 도 sleep 끝까지 기다림 — 단순 path.** `stopActor` 가 `fiber.await` 만 호출 (interrupt X, M3 ADR-031) 이라 sleep 깨우지 않음. maxBackoff 가 길면 (예: 1분) shutdown 도 1분. 의도된 trade-off, M∞ 본격 도그푸딩에서 표면 빈도 보고 race fix 결정. ADR-038 (-) 항목 명시.
- [test] 9 테스트 추가 (총 182): 단위 4 (`Strategies.restart.backoff` 기본 null / `restartWithBackoff` 빌더 + 옵셔널 randomFactor / `.withLimit` chain) + `computeBackoffDelay` 단위 4 (attemptIndex 0/1/cap, jitter 범위) + 통합 5 (backoff 점진 증가, cap, mailbox 보존, withLimit chain stop 강등, 사이클 1 회귀). 5회 flake-free.
- [process] 통합 테스트 시간 측정 (`Date.now()`) 의 정확도 — 60ms / 140ms 같은 _최소_ 임계값 사용. 정확한 비교 (예: ±5ms) 는 환경별 flake 위험. _최소만_ 검증이 안전.
- [insight] **사이클 1 → 2 의 자연스러운 확장.** 사이클 1 의 `pendingRestartLimit` 옆에 `pendingRestartBackoff` 추가, restart 분기 한 군데에 sleep 단계 추가 — 두 fix 모두 _기존 코드 경로_ 위에 얹힘. ADR-037 의 _stop/cleanup 통일_ + ADR-038 의 _restart-cleanup-backoff 통일_ 모두 같은 가족. _아키텍처가 점진 확장 친화_ 라는 또 다른 사례.



### 2026-05-09 — M5 사이클 3 (withTimers + ctx.fork + scheduleOnce, ADR-039)

- [design] **`Behaviors.withTimers` = setup 위 헬퍼 (option B).** 새 ADT 노드 (`WithTimers`) 추가 안 함. `withTimers` 가 `{ _tag: "Setup", init: (ctx) => Effect.flatMap(makeTimers(ctx), f) }` 반환. 이유: ADT 종류 늘리면 _모든 분기_ (interpreter / unwrapMeta / Behavior union) 수정 — option B 가 비용 회피. 사이클 4 의 `withStash` 도 같은 패턴 갈 수 있음.
- [design] **`ctx.fork` + `ctx.scheduleOnce` 표면 도입.** instance scope 안 fork 의 _단일 통로_. `withTimers` 도 내부적으로 이 fork 사용 — 사용자 fork 와 timer fork 가 _같은 lifecycle_. ADR-021 의 _Timer / fork 모두 instance Scope_ 약속 그대로 구현.
- [bug+fix] **`evaluateInitial` setup chain 미처리.** `withTimers` 가 setup 위 헬퍼라 `setup → withTimers (= setup)` chain. 기존 `evaluateInitial` 은 한 번만 풀음 → withTimers init 호출 안 됨 = timer 등록 X. 통합 테스트 _restart 시 timer cleanup_ 가 즉시 잡음. fix: `while (cur._tag === "Setup") { cur = yield* cur.init(ctx); }` loop. 회귀 안전 — 기존 setup 은 비-Setup 반환하면 즉시 끝. 사용자가 무한 setup 만들면 무한 loop (Akka 도 같음).
- [bug+fix] **`notifyWatchersOnSelfTermination` 가 instanceScope close 안 함.** ADR-035 의 _자발 Stopped 후 cleanup 누수_ 의제 일부. ctx.fork 자동 interrupt 검증이 즉시 노출. fix: `notifyWatchersOnSelfTermination` 끝에 `Scope.close(instanceScope)` 추가. 자기 fiber (interpreter) 는 cellScope 라 영향 X — _자기가 자기 instanceScope_ 닫는 건 안전 (instanceScope 의 _fork 들만_ interrupt). cellScope + 자식 cascade 누수는 그대로 ADR-037 후속 의제.
- [insight] **사이클 3 가 ADR-035/037 후속 의제의 _부분_ 을 자연 fix.** `instanceScope 누수` (M4 사이클 5 의제 중 하나) 가 _timer 의 자동 cleanup 보장_ 검증으로 자연 노출 → 작은 fix (한 줄 close). cellScope 누수 + 자식 cascade 는 본격 도그푸딩 표면 빈도 보고 별도. _큰 의제 패밀리는 사이클별로 자연스럽게 풀림_ 패턴 또 한 번.
- [test] 9 테스트 추가 (총 191): startSingleTimer / fixedDelay / cancel / cancelAll / isActive / key 충돌 대체 / scheduleOnce / ctx.fork stop 자동 interrupt / restart 시 timer cleanup. 모두 통합 (Effect runtime + 시간 측정). 5회 flake-free. 시간 측정은 _최소 임계값_ (예: `> 5`) 만 사용 — 환경별 flake 방지.
- [process] 표면 추가가 stub helpers (test/helpers.ts) 에도 영향 — `stubFork` + `stubScheduleOnce` 추가. context.test.ts + interpreter.test.ts 의 `ActorContext.make` 호출에도 새 파라미터. 기존 코드 변경 비용 명시 — _단위 테스트의 stub 완전성_ 을 신호로 보면 ADT 변경 비용 측정 가능.
- [process] timers.ts 의 `key → fiber` 추적 자료구조 — `TRef<HashMap<string, Fiber>>` 로 STM 안에서 idempotent 갱신 (replaceFiber 의 atomic interrupt-then-set). cell 외부 자료구조라 STM 단독 OK.



### 2026-05-09 — M5 사이클 4 (withStash + StashOverflow, ADR-040)

- [design] **`Behaviors.withStash` = setup 위 헬퍼 (사이클 3 패턴 동일).** `{ _tag: "Setup", init: (ctx) => Effect.flatMap(makeStash({capacity, ctx}), f) }`. 새 ADT 노드 X. _두 사이클 연속 같은 패턴_ — `withTimers` + `withStash` 가 자료구조 다르지만 _빌더 형태 동형_. 사용자 학습 표면 단일.
- [design] **`unstashAll(next)` = `interpretStep` 직접 적용 (option B).** Akka 정통 — stashed 메시지가 mailbox 새 메시지보다 _먼저_ 처리. mailbox re-offer (option A) 는 FIFO 라 _순서 섞임_ 위험. interpretStep 직접 적용은 _next behavior 가 메시지 받음_ → 결과가 _최종_ behavior. 다음 mailbox 부터 새 behavior 가 받음. 도중 Stopped → 즉시 멈춤 (남은 메시지 자동 버림).
- [design] **buffer = `TRef<Chunk<Msg>>` (Effect Queue 안 씀).** Effect Queue 도 capacity 있지만 _STM 트랜잭션 외부_ → capacity 검사 + append 가 atomic 안 됨. TRef + Chunk 는 STM 안 _하나의 트랜잭션_ — race 안전.
- [design] **StashOverflow = Tagged err, `stash()` fail 채널.** `Effect.Effect<void, StashOverflow>` — 사용자가 `Effect.catchTag("StashOverflow", ...)` 또는 supervision 의 `Strategies.matchTag("StashOverflow")` 로 분기. ADR-012 의 _계층적 에러 어휘_ + ARCHITECTURE §4.5 의 _StashOverflow → supervision 대상_ 약속 그대로.
- [bug+process] **테스트 작성 중 _Effect 밖 직접 throw_ 가 supervision 통과 X 발견.** `(m) => { if Boom throw }` 직접 throw 면 `interpretStep` 의 `Effect.map(handler(ctx, msg), ...)` 가 만들어지기 _전_ throw → `messageLoop` 의 `Effect.exit(stepEffect)` 가 못 잡음. 기존 supervision 테스트는 모두 `Effect.sync(() => { throw })` 패턴 — 일관 안 했음. fix 1: 테스트를 `Effect.suspend(() => { ... throw ... })` 로 wrap. fix 2 (별도 후보): `makeReceive` 안에서 handler 호출을 `Effect.suspend` 로 감싸기 — 사용자 직접 throw 도 잡힘. 사이클 4 범위 밖 — ADR-040 후속 + LEARNINGS 만 박음.
- [test] 5 통합 + 1 단위 (errors.test.ts) = 6 테스트 추가 (총 197): 기본 stash→unstashAll 순서, size/isEmpty/clear, isFull/overflow catch, supervision 결합 (matchTag restart), restart 시 buffer 자동 비움. 5회 flake-free.
- [insight] **사이클 3+4 의 패턴 동형성.** 둘 다 setup 위 헬퍼 + Effect 인터페이스 + restart 시 자동 비움. 다른 점은 _instance scope 자원 (timers)_ vs _logical buffer (stash)_. 사이클 4 는 instance scope 안 fork 안 씀 — `unstashAll` 이 _자기 fiber_ 안 직접 step 호출. 같은 빌더 패턴 다른 자원 모델. 사용자 학습 비용 작음.



### 2026-05-09 — M5 사이클 5 (examples/06~08 + USAGE.md 갱신)

- [process] **examples 3개 모두 `pnpm tsx` 실행 검증** — 06-backoff (setup #1~4 + 200/400/800ms 점진 + 한도 초과 stop), 07-stash (happy: 3 stash → unstashAll 순서 보존 / overflow: 3번째 fail → restart → 새 buffer), 08-timer (heartbeat 3회 + cancel + OneShot + scheduleOnce + ctx.fork stop 시 자동 cancel). _문서가 아닌 실측 동작_ 으로 검증.
- [insight] **examples 작성 = 사용자 표면의 _체험_ — 표면 어색함 1차 발견 기회.** 사이클 4 LEARNINGS 의 _Effect 밖 throw_ cliff 가 examples 06 작성 시 다시 노출되지 않게 _Effect.sync 안에서 throw_ 패턴을 _examples 의 공식 패턴_ 으로 굳힘 (05-restart 와 일관). 사용자가 examples 모방하면 cliff 안 부딪힘.
- [process] USAGE.md 갱신 — _Behaviors 빌더 카탈로그_ + _ActorContext 표면_ + _Tagged Errors_ + _안 되는 것_ 표 모두 M5 표면 (withTimers / withStash / restartWithBackoff / withLimit / ctx.fork / scheduleOnce + RestartLimitExceeded / StashOverflow) 추가. _안 되는 것_ 표는 _진짜 미구현_ (ref.ask, withResetBackoffAfter, matchSchema, unstash 부분, startTimerAtFixedRate) 만 남김. M5 코드 끝 시점의 _현재 표면_ 한 표로 정리.
- [process] M5 사이클 5 = 코드 _DoD 끝_, 본격 도그푸딩 (M5.1) 만 남음. M3.1, M4.1 패턴 그대로 — 환류 사이클 입력 후 _M5 전체 DoD 🟢_.
- [process] 다음 갈래: (a) M5.1 본격 도그푸딩 _즉시_ — poly-phony 측 전면 사용 가이드, (b) _Effect 밖 throw_ 의 makeReceive fix 미니 사이클 (사이클 5 LEARNINGS 의 후속 후보) 먼저 박고 도그푸딩 입력, (c) Effect TMap upstream PR (#6225 follow-up). _라이브러리 설계 우선_ 정신상 (b) → (a) 순서 자연스러움.



### 2026-05-09 — 미니 사이클 (Effect 밖 throw 안전망, ADR-040 후속 resolved)

- [bug+fix] **사이클 4 LEARNINGS 의 _Effect 밖 throw cliff_ resolved.** `interpretStep` / `interpretSignalStep` 안에서 handler/onSignal 호출을 `Effect.suspend(() => current.handle(ctx, msg))` 로 wrap. lazy thunk 가 throw 잡아 die 로 전환 → messageLoop 의 supervision 정상 작동.
- [insight] **Wrap 위치 결정 — `behavior.ts` (makeReceive) vs `interpreter.ts` (두 step 함수).** 첫 시도 makeReceive 에 wrap → 기존 behavior.test.ts 의 `expect(b.handle).toBe(handler)` 회귀 5건. ADT 의 _참조 동일성_ 깨짐. 두 번째 시도 interpreter 의 step 함수 안 wrap → ADT 표면 보존 + 안전망만 추가 → 회귀 0. _안전망_ 류는 _ADT_ 가 아닌 _해석기_ 안에 두는 게 깔끔 — ADT 는 _순수 데이터_, 해석기가 _실행 정책_ (안전망 포함).
- [test] 4 통합 테스트 추가 (총 201, 이전 197+4): receiveMessage 직접 throw / receive 직접 throw / receiveSignal 직접 throw (PreRestart 재실패 경로) / Effect.sync 회귀. 5회 flake-free.
- [insight] **사용자 학습 비용 0.** 기존 `Effect.sync(() => { throw })` 패턴 그대로 + _직접 throw_ 도 잡힘. 사용자 의식 X — _문서 추가_ 도 불요. _안전망_ 의 본질은 _보이지 않는 fix_.
- [process] 미니 사이클 = _라이브러리 설계 우선_ (ADR-028) 정신의 _도그푸딩 입력 직전 표면 다듬기_ 패턴 첫 사례. M5.1 입력 받기 전에 사용자가 _자연스럽게_ 부딪힐 cliff 미리 처리. 이후 도그푸딩 _진짜 finding_ 만 입력으로 들어옴 — 사이클 5 의 examples 작성 시점에 이미 cliff 알았기에 _examples 패턴_ 도 일관 (Effect.sync 안 throw) 으로 굳혀둠.



### 2026-05-09 — M5.1 도그푸딩 가이드 작성 (docs/DOGFOODING.md 박음)

- [process] **별도 영구 가이드 파일 (`docs/DOGFOODING.md`) 도입.** 이전 #1~#3 도그푸딩은 _대화 안_ 가이드 + LEARNINGS 박힘. #4 부터 _본격_ 이라 _영구 문서_ 가치 명확. 향후 #5+ 도 이 파일 갱신.
- [design] **5 사이클 분할 — 사이클 #2 / #3 패턴 그대로.** (1) supervise + matcher chain (M4 + M5 backoff/withLimit), (2) withTimers + ctx.fork, (3) withStash 초기화, (4) watchWith + ask + scheduleOnce, (5) 종합 + stress. 각 사이클 _구체 도메인 시나리오_ — agent 의 _실제 사용_ 패턴이라 합성 표면 노출.
- [process] **_이미 fix 된 cliff_ 표 박음.** #2/#3 의 finding 들 (spawn race / 의제 1+2 / F1 / Effect 밖 throw) 모두 _이미 fix_ — #4 에서 _재발견되면 회귀_. 회귀 안전 검증 자동.
- [process] AGENTS.md + CLAUDE.md 색인 갱신 — 새 가이드 진입점 등록.
- [process] PLAN.md M5.1 환류 사이클 박음 — _가이드 작성_ 사이클 1, 사이클 2+ 는 finding 도착 시 환류 fix.



### 2026-05-09 — M5.1 사이클 2 (도그푸딩 #4 결과) + M5 완료 명시

#### 도그푸딩 #4 결과 요약

- **5 사이클 × 3회 = 15회 모두 통과**, finding 0, 회귀 0, flake 0.
- **사이클 1** (supervise + matcher chain + backoff/withLimit): matchTag/matchAll/restartWithBackoff/withLimit 모두 약속대로. randomFactor=0 으로 deterministic 검증 가능.
- **사이클 2** (withTimers + ctx.fork): heartbeat 정확 + restart 시 자동 cancel + sys.shutdown 시 instanceScope close.
- **사이클 3** (withStash): FIFO 순서 보장 + capacity 초과 → matchTag("StashOverflow") + restart 시 buffer 비움.
- **사이클 4** (watchWith + ask + scheduleOnce): AskTimeout TaggedError + Effect.catchTag + scheduleOnce → self delayed tell 모두 자연.
- **사이클 5** (stress 종합): 5 workers × 30 tasks (병렬), occasional fail 도중 mailbox 보존 + race-free + sys.shutdown 깔끔.

#### 5 cliff 회귀 검증 (가이드 §7)

- spawn race ✅ 안정
- supervisor stop 강등 PostStop ✅ 호출
- 자발 Stopped watcher ✅ 알림
- self-loop watchWith hang ✅ 정상 종료
- Effect 밖 throw ✅ 무관 (cycle 들에서 자연스럽게 안 등장)

#### M5 완료 명시

- [process] **M5 마일스톤 _전체_ DoD 확정.** 코드 사이클 1~5 + 미니 사이클 (Effect 밖 throw 안전망) + M5.1 사이클 1 (가이드 작성) + 사이클 2 (도그푸딩 #4 통과) 모두 충족. PLAN.md M5 상태 표기 🟢 완료. 누적 201 테스트.
- [process] M5 의 _진짜 완료_ 도 M3 / M4 패턴 그대로 — 코드 작성 끝 (사이클 5) 이 아니라 _도그푸딩 통과 시점_. ADR-024 정신 일관 (#1 → ADR-028~031, #2 → M3.1, #3 → M4.1, **#4 → fix 불요**).
- [insight] **본격 도그푸딩이 _finding 0_ 으로 통과한 의미.** #1~#3 환류 사이클이 _이미_ 본 표면을 다 다듬어 놓음 + 미니 사이클이 _Effect 밖 throw_ cliff 사전 fix → #4 의 _finding 0_ 은 _저절로_ 가 아닌 _누적된 환류_ 의 결과. _도그푸딩 입력은 철학 안에서 수용_ (ADR-028) + _라이브러리 설계 우선_ + _도그푸딩 입력 직전 표면 다듬기_ 패턴이 _배포 직전_ 까지 통과한 셈.
- [insight] **consumer 추가 관찰의 _긍정적 신호_.** (1) domain 어휘 자연 — RateLimitError/BackendError/StashOverflow/AskTimeout 모두 Tagged 라 matchTag 하나로 충분. (2) ctx.ask + Effect.catchTag + scheduleOnce 합성이 Akka Typed retry 정통과 일치. (3) typecheck 깨끗, install 마찰 없음. _wrapper 부담 5~10줄_ 가이드 약속 (ADR-028 의 _3차 잣대_) 유지.
- [process] 다음 갈래: **M∞ 진입** (npm 배포 직전 결정거리). 후보:
  - (a) semver 정책 결정 (ADR — 0.x = minor breaking, 1.0+ = SemVer 후보)
  - (b) 영어 README + CHANGELOG + CONTRIBUTING.md
  - (c) 빌드 도구 결정 (ADR-027 후속) + setup-deploy
  - (d) Effect TMap upstream PR (#6225 follow-up, 우회 패치 본체로 보낼지)
  - (e) 0.1.0 배포 자체



### 2026-05-09 — M∞ 사이클 (a): semver 정책 (ADR-041)

- [decision] **0.x = minor breaking + patch fix/internal** (Akka / Cats Effect 정통). npm `^0.x.y` 가 patch only 자동 보호 — _minor=breaking_ 의미가 _기술적_ 으로 강제됨. SemVer 표준과 다른 부분은 README 첫 줄에 명시 (M∞ 사이클 b).
- [decision] **1.0 진입 = 배포 후 _안정 약속_** — 코드 끝 ≠ 1.0. 체크리스트: (1) 배포 후 ~1주 안정, (2) 외부 사용자 1명+ 사용, (3) 첫 issue 1라운드 처리, (4) Cluster/Persistence 등 비목표 _명시 결정_, (5) 영어 docs 갱신. ADR-024 의 _도그푸딩 정신_ 을 _배포 후_ 까지 확장.
- [decision] **CHANGELOG = Keep a Changelog 수기.** 자동화 (release-please / changesets) 는 _PR 흐름_ 본격화 후. 현재 commit 메시지가 이미 conventional 패턴 (`feat:`, `fix:`, `docs:`) — 자동화 도입 시 부드러움.
- [decision] **Deprecation = 0.x 즉시 제거 가능 (`@deprecated` 1번 정도) / 1.0+ = 한 minor warning 후 제거.** 0.x 의 _철학 안에서 다듬기_ 자유 vs 1.0+ 의 _안정 약속_ 차이.
- [insight] **F6 (DX SCORECARD) 결정 = M∞ 사이클 a 로 닫힘.** plan-devex-review 의 _배포 직전 ADR_ 약속 그대로. ADR-041 박은 후 README 의 _0.x 정책_ 명시 (사이클 b) → CHANGELOG.md 첫 entry (사이클 e 직전) 가 자연 순서.



### 2026-05-09 — M∞ 사이클 (c): 빌드 도구 = tsc (ADR-042 + ADR-032 supersede)

- [decision] **tsc 채택** (vs tsup/unbuild/rollup). 의존성 0, EffectTS 정통, ESM 만 출력 단순. 라이브러리 빌드는 _빌드 시간_ (tsup 10x) 보다 _확실성_ 우선.
- [decision] **`tsconfig.build.json` 별도** (`module: Node16`, `outDir: dist`, `rootDir: src`, `declaration/Map + sourceMap`). 기존 `tsconfig.json` 은 dev 용 (Bundler resolution + noEmit) 그대로.
- [decision] **package.json — exports types-first / files=dist + LICENSE + README + CHANGELOG / publishConfig public / prepublishOnly = build+test.** `prepublishOnly` 가 _깨진 빌드 publish_ 방지 안전망.
- [decision] **ADR-032 supersede.** source-direct export 는 _도그푸딩 단계 한정_ 명시 — 도그푸딩 #4 통과 = 단계 끝. ADR-032 자체는 _역사 보존_.
- [verify] `pnpm build` → 64 파일 (16 src × {.js, .js.map, .d.ts, .d.ts.map}). `pnpm pack --dry-run` → 42KB tarball, dist/ + LICENSE + package.json + README 만. typecheck + 201 테스트 그대로 통과.
- [insight] **`.d.ts.map` 의 가치.** 사용자 IDE 의 _go to definition_ 시 우리 src/ .ts 까지 추적 가능 — 라이브러리 디버깅 친화. tsc 의 `declarationMap: true` 한 줄. tsup 도 가능하나 _별도 설정_, tsc 는 _자연_.
- [process] _두 tsconfig_ 패턴 (dev + build) 이 EffectTS 생태계 정통 (Effect 본체도 같음). dev 는 빠른 피드백 (Bundler resolution + noEmit), build 는 정확성 (Node16 + emit). 사용자 학습 비용 작음.



### 2026-05-09 — M∞ 사이클 (b): 영어 README + CHANGELOG + CONTRIBUTING + .github 템플릿

- [decision] **README 분리 — README.md = 영어 (npm 진입점), README.ko.md = 한국어 (기존 그대로 보존).** docs/ 는 한국어 _공식_ 그대로 (한국어가 작업 언어, ADR 도 한국어). npm registry / GitHub 첫 화면이 영어 진입점. _다국어 분리_ 의 단순 정통 패턴.
- [content] 영어 README 의 핵심 한 줄 (Akka Typed 정신) 한국어 README 와 _구조 동형_ — pitch / status / quickstart / magic moment / milestones / versioning / non-goals / docs links / persona. "Korean is canonical" 한 줄 명시 → 사용자가 한국어 docs 안 부담.
- [content] **CHANGELOG.md = Keep a Changelog 형식 (ADR-041) + 0.1.0 entry _미리 채움_.** Unreleased 섹션 + 0.1.0 (배포 직전 채우는 게 자연이지만 _배포 임박_ 이라 미리). _Added_ 카테고리 한 가지로 모든 표면 (ADR 번호 + 빌더/매처/시그너처) 누적. ADR 번호 하이퍼링크 → ADR / commit / changelog 삼각 추적.
- [content] **CONTRIBUTING.md = _작은 alpha_ 정신 lightweight.** _Open issue first_ for non-trivial → 1인 maintainer + Akka semantics 제약. 도큐 fix 는 직접 PR. 한국어 docs 가 _공식_ 명시 — 영어 contributor 도 docs 한국어 그대로 둬도 OK 안내.
- [content] `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md` + `PULL_REQUEST_TEMPLATE.md`. feature request 가 _out-of-scope check_ (ADR-006 비목표) 박혀 있어 _Cluster / Persistence_ 류 issue 자동 차단. PR template 은 ADR-041 의 _0.x = breaking minor_ 명시.
- [process] _배포 직전 표면 셋업_ 이 _문서 셋업_ 보다 비용 큼 — README 영어 + CHANGELOG 0.1.0 entry 가 ~30분 중 가장. ADR 박은 시점에 _배포 직전 surface_ 까지 예약된 셈 (ADR-041 의 후속 항목 명시).
- [insight] **CHANGELOG 의 _ADR 번호 인용_ 패턴.** 모든 Added 항목에 (ADR-NN) 표기 → 사용자가 _왜_ 이 표면이 있는지 ADR 로 직진 가능. 도그푸딩 #4 의 _domain 어휘 자연_ 관찰처럼 — _decision provenance_ 가 사용자 표면에 노출되어 학습 비용 감소.



### 2026-05-09 — M∞ 사이클 (g): 자체 코드 점검

- [audit] 잔재 점검 — TODO/FIXME/console.log/HACK/XXX 모두 **0**. eslint-disable 2건만 (interpreter.ts 의 `no-constant-condition` outer while loop, supervision.ts 의 `no-explicit-any` 매처 lenient — 둘 다 의도된 ADR 명시).
- [audit] **Dead code 0**. index.ts 의 _내부 자료구조_ (ActorEntry / Registry / Cell) 노출은 _도그푸딩 단계 의도_ — minor 에서 _internal 표면 제거_ 가능 (ADR-041 의 0.x = breaking minor 정신).
- [audit] Import 일관성 OK — `verbatimModuleSyntax` 강제로 `import type` 명시. effect 의존 import 도 _file 별 모인 한 줄_ 정통 패턴.
- [metrics] **Bundle**: 42KB tarball / 58KB uncompressed (16 파일). src 총 2,221 lines. system.ts 609 + interpreter.ts 363 가 가장 큼 (supervisor + spawn + cleanup 흐름 응집). 분리 가능하지만 _응집력_ 우선.
- [metrics] **API 표면 일관성** — Akka Typed 정통 매핑 (`receive` / `setup` / `withMailbox` / `withTimers` / `withStash` / `supervise` / `Strategies.{resume,restart,stop,restartWithBackoff,matchInstance,matchTag,matchAll}` / `ctx.{spawn,stop,watch,watchWith,unwatch,watchTerminated,ask,fork,scheduleOnce}`). 시그너처 모두 Effect 반환 일관.
- [finding] **JSDoc 0개** — 모든 export 에 `/** ... */` 부재. IDE hover 시 빌더 의미 표시 안 됨. USAGE.md 가 1차 표면이라 _절대 cliff_ 는 아님. 비용 30~60분 — 별도 사이클 (배포 후 사용자 IDE feedback 받고) 후보.
- [decision] **(g) 자체 코드 변경 0.** 명백한 잔재/dead/일관성 모두 깨끗. _구조적 cliff_ (예: stopActor 재귀 깊이, restartHistory 무한 증가, watcher unbounded forEach) 는 codex 가 잡을 영역 — (f) 로 패스.
- [insight] **자체 점검의 가치 = _명백한 cliff 자동 차단_.** _구조적 cliff_ 는 외부 시야 (codex / 도그푸딩) 가 우월. 두 layer 분리: 자체 (코드 표면 깨끗) → 외부 (구조/일관성). _signal-noise ratio_ 좋아짐.



### 2026-05-09 — M∞ 사이클 (f): codex review 4 finding (P1×2 + P2×2)

- [finding] **F1 (P1)**: 같은 path 자식이 _아직 살아있는데_ 같은 이름 spawn → Registry.register 가 silent overwrite → 옛 entry 사라지고 fiber 만 _좀비_. parent.children 같은 path 두 번 → cascade stop 두 번. Akka 의 InvalidActorNameException 부재.
- [finding] **F2 (P1)**: `watchOther` / `watchTerminatedOther` 가 (1) STM 으로 target resolve + uid 검사 → (2) 별도 STM 으로 watchers 등록. 그 사이 target 이 stop 진행 → onSelfTermination watchers 스냅샷 _후_ 등록 → _영원 hang_.
- [finding] **F3 (P1 직전)**: `runInterpreter` 의 `catchAllCause` 가 setup fail 시 `onFailure` 만 호출, `onSelfTermination` 누락 → watcher 영원 await + registry stale entry.
- [finding] **F4 (P2)**: 자발 Stopped 흐름의 needStop 분기가 `onSelfTermination` 호출 _후_ PostStop hook. PostStop fail 시 supervision 외피 → catchAllCause 가 다시 onSelfTermination 호출 → _이중_.
- [decision] **모두 fix → re-review → 배포** (사용자 1번 선택, 4 갈래 중). 자체 점검 (g) 는 _명백 cliff_ 만 잡는다는 가설 검증 — codex 가 _구조적_ 4 finding 발견. 자체+외부 _두 layer_ 패턴 강화.
- [process] codex CLI 첫 시도 5.5분 timeout (deep review 중 잘림) → 10분 timeout 으로 재시도 5분 안 결과. `--base origin/main` + PROMPT 동시 사용 불가 (CLI 0.129 breaking) → PROMPT 생략. 인내심 비용 작음.
- [insight] **외부 review 는 _구조적 cliff_ 잡는 게 평균.** 자체 점검 (코드 표면 깨끗) 통과해도 _Akka semantics_ (race window, cleanup ordering, ABA) 는 외부가 우월. 배포 직전 외부 검증의 가치 1회 더 확인.



### 2026-05-09 — M∞.1 사이클 1: F3+F4 fix — interpreter cleanup 단일 source (ADR-043)

- [decision] **catchAllCause 가 cleanup 단일 통로.** `messageLoop` needStop 분기에서 `onSelfTermination` 호출 _제거_ — PostStop fail 도 catchAllCause 거침 → cleanup 한 번만 호출 보장. setup fail path 도 `Effect.gen` 으로 `startedLatch.succeed` + `onSelfTermination` + `onFailure` 모두 거침.
- [verify] **회귀 테스트 5개**: F3 두 개 (root setup fail, 자식 setup fail 시 watcher Terminated 받음), F4 두 개 (외부 PostStop fail / 자발 Stopped PostStop fail 시 cleanup 한 번만), ABA 회귀 1 (cleanup 두 번 호출 시 두 번째 idempotent).
- [verify] 5회 flake-free, 201 → 206 테스트.
- [insight] **cleanup ordering 의 _단일 source 원칙_** — Akka Typed 의 supervision 외피처럼, 종료 흐름은 _한 곳_ 에 모이는 게 정합. 분기 곳곳 cleanup → 이중 호출 + race + 누락 모두 피하기 어려움. ADR-037 (자발 Stopped) + ADR-043 (단일 source) 이 같은 정신.



### 2026-05-10 — M∞.1 사이클 2: F1+F2 fix — spawn/watch race-free (ADR-044)

- [decision] **atomic STM tx 로 race window 자체 제거.** `spawnInternal` 의 _live child 검사 + ActorEntry 생성 + Registry.register + parent.children 갱신_ 한 트랜잭션. `watchOther` / `watchTerminatedOther` 의 _resolve + uid + status + watchers 등록_ 한 트랜잭션. 이전 별도 STM 두 개 사이 race window 가 _이론상_ 존재 — atomic tx 로 차단.
- [decision] **`ChildNameTaken` 새 Tagged err** — `ctx.spawn` fail 채널 (`Effect.Effect<ActorRef, ChildNameTaken>`). 사용자가 `Effect.catchTag("ChildNameTaken", ...)` 분기 가능. `askOther` 의 `$ask-{N}` 임시 actor 와 `create` 의 root spawn 은 _이론상 collision 0_ → `Effect.orDie` 로 defect 변환 (사용자 fail 채널 오염 X).
- [decision] **status === "stopped" 면 등록 안 하고 즉시 알림.** `watchOther` 가 죽어가는 중 target 에 watcher 등록하면 onSelfTermination 의 watchers 스냅샷 _후_ 라 영원 hang. STM tx 안 status 검사 → "alreadyGone" 반환 → 즉시 `Signal.Terminated` 또는 Custom msg offer.
- [verify] **회귀 테스트 4개**: F1 두 개 (`ChildNameTaken` fail / stop 후 같은 이름 재spawn 가능), F2 두 개 (stop 진행 중 watchTerminated/watchWith 즉시 완료, 영원 hang X).
- [verify] 5회 flake-free, 206 → 210 테스트.
- [insight] **Deferred 미리 생성 패턴.** STM 안 Effect (Deferred.make) 못 부름 → 미리 만들고 등록 안 되면 GC. 작은 비용 (μs). _STM 트랜잭션 경계_ 와 _Effect 경계_ 가 다를 때의 정통 패턴.
- [insight] **race-free 검증 = _직접 trigger 가능_ 한 회귀 테스트.** F2 두 테스트는 _stop 후 watch_ + _stop 와 watch 동시_ 두 패턴 모두 즉시 완료 보장 (timing-free). 이전엔 timing 으로 통과했지만 _이론상_ 위험. atomic tx 로 _이론상도_ 차단.



### 2026-05-10 — M∞.1 사이클 3: codex re-review (사이클 2 fix 의 회귀 2 finding 발견)

- [finding] **R1 (P1, semantics 회귀)**: `watchTerminated` / `watchOther` 가 `status === "stopped"` 면 즉시 alreadyGone. 그러나 `stopActor` 시작 시 즉시 status="stopped" set 이라 _Terminated 받자마자_ 같은 path 재spawn 시 `ChildNameTaken` (registry 에 옛 entry 남아있음). Akka 의 _Terminated = 완전히 끝_ semantics 회귀.
- [finding] **R2 (P2, 누수)**: `spawnInternal` 이 mailbox + cellScope + instanceScope _먼저 할당_ 후 STM tx 의 `ChildNameTaken` fail → 자료 누수 누적.
- [decision] **둘 다 fix → re-review → 배포** (사용자 선택). 사이클 4 진입. R1 은 P1 회귀라 반드시 fix.
- [insight] **fix 가 새 finding 만든다.** 사이클 2 의 atomic STM tx 가 _race window_ 차단했지만 _stopped 의 의미_ 를 좁혔어야 함 (지금은 너무 일찍). 한 정확성 추가 = 다른 정확성 회귀 가능성. _re-review 의 가치_ 강화.
- [insight] **codex 의 시야** — _semantics 회귀_ 같은 _철학 차원_ finding 은 자동 도구로 안 잡힘. 사용자 정신 (Akka Typed 정통) 을 _이해_ 한 외부 reviewer 만 짚을 수 있음. 배포 직전 외부 review 의 진가.



### 2026-05-10 — M∞.1 사이클 4: R1+R2 fix — Terminated semantics + spawn fail cleanup (ADR-045)

- [decision] **status 3단계 (`running`/`stopping`/`stopped`).** `stopActor` 시작 시 `"stopping"` (이전: 즉시 `"stopped"`). `onSelfTermination` 끝에 `"stopped"`. `stopping` 상태 watch 등록은 다음 atomic tx 가 잡음. `stopped` 만 alreadyGone 즉시 알림.
- [decision] **`notifyWatchersOnSelfTermination` atomic STM tx — watchers 스냅샷 + status="stopped" + registry unregister + parent.children 갱신 한 트랜잭션.** 알림 발사 _전_ 에 unregister 끝나야 _Terminated 받은 즉시 재spawn_ 가능 (Akka semantics).
- [decision] **`spawnInternal` `tapErrorCause` cleanup (R2).** mailbox + cellScope + instanceScope 를 STM tx _전_ 에 할당하므로 fail 시 자료 누수. `Effect.tapErrorCause` 가 fail/defect 시 `Scope.close(cellScope)` + `Queue.shutdown` 실행 후 fail 그대로 전파.
- [verify] **회귀 5개**: R1×3 (PostStop 끝까지 await / 직후 재spawn 성공 / watch signal 도 stop 진행 중 발사), R2×2 (50회 fail 후 shutdown 정상 / fail 후 같은 이름 spawn 성공).
- [verify] 5회 flake-free, 210 → 215 테스트.
- [insight] **STM 트랜잭션 _크기_ 의 trade-off.** 사이클 2 는 spawn 의 STM tx 를 작게 (_check + register_ 만), 사이클 4 는 onSelfTermination 의 STM tx 를 크게 (_watchers + status + unregister + parent_ 한 번에). _atomic 보장_ 이 race-free 의 핵심. 너무 크면 contention 위험인데 single-actor write 라 OK.
- [insight] **순서 (ordering) bug 의 패턴.** R1 의 본질은 _registry unregister 가 알림 발사 후_ 였던 것. atomic 으로 묶었지만 _순서_ 도 옳아야 함. STM 트랜잭션 안 ordering 은 deterministic 이지만 _STM commit 후 Effect.forEach 발사_ 사이의 ordering 도 신경 써야. 첫 시도 (status + watchers 만 atomic) 에서 fail 한 회귀 테스트가 _registry unregister 가 늦음_ 잡아냄 — TDD 의 가치.



### 2026-05-10 — M∞.1 사이클 5: codex re-re-review GATE: PASS + 0.1.0 publish

- [verify] codex re-re-review (`codex review --commit dbae832`): _"I did not find any blocking correctness issues in this commit. The status split, atomic termination cleanup, and spawn failure cleanup all look internally consistent with the surrounding lifecycle logic."_ — 사이클 4 fix 가 깨끗.
- [milestone] **`@loveqoo/effect-actor@0.1.0` npm publish (2026-05-10).** First public release. M0-M5 + M∞.1 환류 (ADR-043/044/045) 통합. 215 테스트, 5회 flake-free, codex 3 라운드 GATE PASS.
- [milestone] git tag `v0.1.0` + 32 커밋 origin push — GitHub repo `loveqoo/effect-actor` 도 첫 push (initial commit 1 → 33 커밋).
- [process] **npm 2FA = WebAuthn/passkey (TOTP 옵션 제한).** macOS Touch ID 가 platform authenticator 로 동작 — 물리 키 없이 진행 가능. 등록 시 _이름표_ 만 입력 ("MacBook Pro" 등) → 기기 자체가 인증.
- [insight] **3 라운드 review 패턴의 가치.** 1라운드 (사이클 f, codex 4 finding) → 2라운드 (사이클 3, R1+R2 회귀 발견) → 3라운드 (사이클 5, GATE PASS). _fix 가 새 finding 만든다_ 가설 검증 — 회귀 fix 후 _다시_ review 가 정통. 배포 전 _수렴_ 까지가 외부 검증의 진짜 사이클.
- [insight] **0.x = 안정 약속 _없음_ 의 자유.** ADR-041 의 0.x 정책 덕에 ChildNameTaken 시그너처 변경 (사이클 2) + status 3단계 추가 (사이클 4) 모두 _배포 전_ 에 자유롭게. 1.0+ 면 _한 minor warning_ 후 제거. 0.x 의 _느슨함_ 이 학습 비용 낮춤.



### 2026-05-10 — 도그푸딩 #5: 0.1.0 packaging 검증 통과 (finding 0)

- [verify] **사이클 1 (smoke)**: `npm install @loveqoo/effect-actor@0.1.0` 정상 (npm `--legacy-peer-deps` 사용), import resolve OK, tsc strict (`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`) 통과, 실행 round-trip 30ms / expected 출력 정확. published tarball 깔끔 (file: dep 시절 `.git`, `AGENTS.md` 흔적 0).
- [verify] **사이클 2 (IDE + 도메인)**: `.d.ts` + `.d.ts.map` 모두 패키지 포함 — 정의 추적 가능. tsc 가 모든 import 의 generic/overload 정확 해석. **도메인 사이클 = ADR-045 의 watchTerminated + 재spawn** 정확 동작 (`echoes1 = ["from-w1"]`, `echoes2 = ["from-w2"]`, terminatedSeen 1회) — _배포한 코드_ 가 사이클 4 fix 의 semantics 보존.
- [verify] poly-phony agent 119/120 (1 skipped 무관), 회귀 0, 3회 flake-free 5.88s.
- [observation] **`--legacy-peer-deps` 필요했음** — npm 의 strict peer dep 처리. pnpm 은 일반적으로 자동 처리. 0.1.1 docs patch 후보 (README 에 npm 시 안내).
- [insight] **packaging DoD = _진짜 published tarball + 진짜 IDE_.** source-direct 도그푸딩 (#4) 은 _기능_ 검증 — exports / .d.ts / IDE 는 검증 안 됨. #5 가 그 layer 메움. 향후 라이브러리 첫 배포마다 _이 사이클 _ 필수.
- [insight] **ADR-045 의 _배포 환경_ 검증.** 사이클 4 의 fix (Terminated semantics 보존) 가 _내부 테스트_ 가 아닌 _진짜 dist/ + npm install + 다른 워크스페이스_ 에서도 정확 동작. 사이클 4 의 회귀 테스트 5개 가 _사용자 측 환경_ 에서도 같은 보장 — TDD + packaging dogfood 이 _모든 layer 검증_.
- [milestone] **M∞ _전체_ DoD 🟢 (2026-05-10)**. (a)~(g) + M∞.1 환류 5 사이클 + 도그푸딩 #5. 남은 (d) TMap upstream PR 은 _별도 의제_ — 우리 측 우회 (ADR-031 보강) 가 0.1.0 에서 정상 동작 확인됨.
