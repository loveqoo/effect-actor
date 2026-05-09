# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to **Akka / Cats Effect 0.x convention** (see [ADR-041](./docs/DECISIONS.md)):
- `0.x.y` — `y` (patch) = bug fix / internal, `x` (minor) = breaking / new feature
- `1.0+` — standard SemVer with one-minor deprecation window

## [Unreleased]

### Added
- `examples/09-tagged-enum.ts` — `Data.TaggedEnum` (Effect) 로 메시지 ADT 정의 패턴. constructor + `$match` 자동, `{ _tag: "Foo" }` 리터럴 반복 줄임. effect-actor 자체는 메시지 모양에 의견 없음 — 사용자 도메인이라 리터럴 / const factory / `Data.TaggedEnum` 모두 OK.

### Changed
- `examples/02-lifecycle.ts`, `examples/05-restart.ts` — 메시지 정의를 `Data.TaggedEnum` 으로 변형. `switch` 대신 `$match` 로 분기 — 새 case 추가 시 컴파일 강제 (exhaustiveness). 기능 변화 없음.

## [0.1.0] - 2026-05-10

First public release. Output of milestones M0 through M5 plus the M∞.1 review-feedback cycles (ADR-043/044/045), validated by 4 dogfooding rounds against [poly-phony](https://github.com/loveqoo/poly-phony) and 3 rounds of external `codex review` before publish.

### Added

#### Core actor model
- `ActorSystem.create<RootMsg>(behavior, name)` — typed root actor
- `ActorRef<Msg>` — logical address, stable across restart (incarnation UID, ADR-016)
- `ActorPath` — hierarchical actor identity
- `Cell<Msg>` — mailbox + signal queue (Effect `Queue` based)

#### Behaviors
- `Behaviors.receive` / `receiveMessage` / `receiveSignal` (fluent)
- `Behaviors.setup` (initial resource acquisition)
- `Behaviors.same` / `stopped` / `empty` / `unhandled`
- `Behaviors.withMailbox(inner, policy)` — mailbox capacity / overflow
- `Behaviors.supervise(b).onFailure(matcher, strategy)` — supervisor chain
- `Behaviors.withTimers((timers) => ...)` — timer registration
- `Behaviors.withStash(capacity, (stash) => ...)` — bounded stash buffer

#### ActorContext
- `ctx.spawn(behavior, name)` — child lifecycle. Fail channel: `ChildNameTaken` when a live child already owns the name (ADR-044). Stop the existing child first to free the name.
- `ctx.stop` — graceful cascade (ADR-031)
- `ctx.watch` / `watchWith` / `unwatch` / `watchTerminated` — termination monitoring (ADR-022, ADR-030). `Terminated` / `watchTerminated.await` complete only after the target actor is fully unregistered (ADR-045) — re-spawning the same path immediately afterwards is safe.
- `ctx.ask<TargetMsg, Resp>(target, make, timeout)` — request-response (ADR-029)
- `ctx.fork(eff)` — fork in instance scope (auto-cancel on restart/stop)
- `ctx.scheduleOnce(delay, target, msg)` — delayed `tell` to another actor

#### Supervision strategies
- `Strategies.resume` / `restart` / `stop`
- `Strategies.restart.withLimit({ maxNrOfRetries, withinTimeRange })` — sliding-window limit (ADR-037)
- `Strategies.restartWithBackoff({ minBackoff, maxBackoff, randomFactor })` — exponential backoff with jitter (ADR-038)
- Matchers: `matchInstance` / `matchTag` / `matchAll` (ADR-036)

#### Signals
- `PreRestart` / `PostStop` (ADR-021)
- `Terminated` / `ChildFailed` (ADR-022)

#### Tagged errors
- `ActorNotFound` / `IncarnationMismatch` / `MailboxFull`
- `AskTimeout` (ADR-029)
- `DeathPactException` (ADR-022)
- `RestartLimitExceeded` (ADR-037)
- `StashOverflow` (ADR-040)
- `ChildNameTaken` (ADR-044) — `ctx.spawn` fail channel when path is occupied by a live child

#### Utilities
- `Timers` interface — `startSingleTimer` / `startTimerWithFixedDelay` / `cancel` / `cancelAll` / `isActive` (ADR-039)
- `Stash` interface — `stash` / `unstashAll(next)` / `clear` / `size` / `isFull` / `isEmpty` (ADR-040)
- `computeBackoffDelay(attemptIndex, BackoffConfig)` — direct backoff calculation
- `pickStrategy(rules, cause)` — supervisor rule traversal

#### Examples
- `examples/01-counter.ts` — basic spawn/tell/receive
- `examples/02-lifecycle.ts` — setup + PostStop
- `examples/03-watch.ts` — watch + Terminated
- `examples/04-ask.ts` — ask pattern + AskTimeout
- `examples/05-restart.ts` — supervision restart
- `examples/06-backoff.ts` — restartWithBackoff with progressive delay
- `examples/07-stash.ts` — initialization stash + StashOverflow supervision
- `examples/08-timer.ts` — heartbeat + scheduleOnce + ctx.fork

#### Pre-release hardening (M∞.1)
- ADR-043 — interpreter cleanup single source. `runInterpreter`'s `catchAllCause` is the one place that emits `onSelfTermination`, ensuring it runs exactly once across `Setup` failure, voluntary `Stopped`, and supervisor stop demotion.
- ADR-044 — atomic STM transactions for `spawn` and `watch`. Eliminates race windows around child registration and watcher registration during shutdown.
- ADR-045 — `Terminated` semantics preservation. Three-state lifecycle (`running` / `stopping` / `stopped`); `Terminated` and `watchTerminated.await` complete only after the actor is fully unregistered, so immediate same-path re-spawn is safe. `spawn` failure path releases preallocated mailbox and scopes.

### Notes
- ESM only (no CJS). Node 20+.
- `effect@^3.10.0` as peer dependency.
- Built with `tsc` (ADR-042). `dist/` includes `.d.ts.map` for IDE go-to-definition into source.

[Unreleased]: https://github.com/loveqoo/effect-actor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/loveqoo/effect-actor/releases/tag/v0.1.0
