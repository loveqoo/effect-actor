# effect-actor

> [Akka Typed](https://doc.akka.io/docs/akka/current/typed/index.html)-style actor library on top of [EffectTS](https://effect.website/). **0.x alpha — pre-release.**

> 한국어는 [README.ko.md](./README.ko.md) 참고.

## Status

| Item | Value |
|---|---|
| Version | [`0.1.0`](https://www.npmjs.com/package/@loveqoo/effect-actor) — first public release (2026-05-10) |
| Milestones | M0~M5 + M∞ (publish) + M∞.1 (review-feedback hardening, ADR-043/044/045) all 🟢 |
| Tests | 215 passing, 5× flake-free. Consumer-side dogfooding: #4 (15 runs flake-free, in-tree) + #5 (npm-install packaging passed) |
| External review | `codex review` — 3 rounds, final GATE: PASS |
| Surface | `spawn` / `tell` / `receive` / `setup` / `watch` / `watchWith` / `unwatch` / `watchTerminated` / `ask` / `supervise` / `restart` / `restartWithBackoff` / `withLimit` / `withTimers` / `withStash` / `ctx.fork` / `ctx.scheduleOnce` |

## What is this

Akka Typed semantics expressed as a TypeScript library on top of EffectTS. The one-line promise:

> **`ActorRef` is a logical address. The mailbox is bound to that address. The behavior is what you can swap on top.**

When that one line holds, the rest follows:
- _ref stays stable across restart_ — external code can keep the ref and keep sending messages
- _mailbox preserved across restart_ — actor instance and mailbox are decoupled
- _parent-child supervision tree_ encoded by the framework, not by user code
- _supervision policy attached by the behavior author_ — Akka Typed philosophy

This project came out of an earlier internal attempt where the above guarantees were absent. The full gap analysis (Akka Typed surface vs. naive Effect-on-its-own) is in [docs/AKKA_REFERENCE.md](./docs/AKKA_REFERENCE.md).

## Install

```bash
pnpm add @loveqoo/effect-actor effect
# npm users: --legacy-peer-deps may be needed depending on your effect resolution
```

## Quick start

```typescript
import { Data, Effect } from "effect";
import { ActorSystem, Behaviors } from "@loveqoo/effect-actor";

// Messages as a tagged ADT (Effect's Data.TaggedEnum — see examples/09)
type Msg = Data.TaggedEnum<{ Inc: {}; Show: {} }>;
const Msg = Data.taggedEnum<Msg>();

const counter = (n: number) =>
  Behaviors.receive<Msg>((_ctx, msg) =>
    Msg.$match(msg, {
      Inc: () => Effect.succeed(counter(n + 1)),
      Show: () =>
        Effect.sync(() => {
          console.log(`current count: ${n}`);
          return counter(n);
        }),
    }),
  );

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create<Msg>(counter(0), "demo");
  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Inc());
  yield* sys.root.tell(Msg.Show());
  yield* Effect.sleep("50 millis");
  yield* sys.shutdown;
});

Effect.runPromise(program);
// → current count: 3
```

More patterns in [examples/](./examples) (01-counter through 09-tagged-enum). Plain `{ _tag: "Inc" }` literals work too — `Data.TaggedEnum` is one option, not a requirement.

## Magic moment

```ts
// before (typical naive Effect-actor implementation):
//   ref reissued on restart → external code holds stale ref
//   mailbox recreated → in-flight messages lost

// after (effect-actor):
//   same ref preserved → external code never changes
//   mailbox preserved → messages received during restart are processed by the new fiber
```

See [examples/05-restart.ts](./examples/05-restart.ts) for the working demo.

## Milestones

| | Status | What works |
|---|---|---|
| M0 | ✅ | Design docs, ADRs, milestone board |
| M1 | ✅ | `spawn` / `tell` / `receive` + `setup` + `ctx.spawn`. Stable ref + mailbox separation |
| M2 | ✅ | `receiveSignal` + signal-priority polling + automatic `PostStop` hook |
| M3 | ✅ | `ctx.stop` graceful cascade + `watch` / `watchWith` / `watchTerminated` + `ask` + `ChildFailed` + `DeathPact` |
| M3.1 | ✅ | spawn race fix (Deferred latch + Effect 3.21.2 `TMap.remove` workaround) |
| M4 | ✅ | Supervision (`resume` / `restart` / `stop`) + matcher helpers + Scope split |
| M5 | ✅ | `restartWithBackoff` + `.withLimit` + `withTimers` + `withStash` + `ctx.fork` + `ctx.scheduleOnce` + Effect-outside-throw safety net |
| M∞ | ✅ | semver (ADR-041) + tsc build (ADR-042) + English README + CHANGELOG + CONTRIBUTING + 0.1.0 published 2026-05-10 |
| M∞.1 | ✅ | Review-feedback hardening — interpreter cleanup single source (ADR-043), spawn/watch race-free atomic STM (ADR-044), `Terminated` semantics + spawn-fail cleanup (ADR-045). 5 cycles, codex 3 rounds GATE PASS, dogfooding #5 packaging passed |

Detailed progress: [docs/PLAN.md](./docs/PLAN.md). All design decisions: [docs/DECISIONS.md](./docs/DECISIONS.md) (ADRs in Korean).

## Versioning policy

`0.x` follows the **Akka / Cats Effect convention**, _not_ standard SemVer:

```
0.x.y
├─ y (patch): bug fixes, internal refactors, doc changes
└─ x (minor): breaking changes, new features, public ADT/signature changes
```

Pin with `^0.x.y` (npm's default for `0.x` is patch-only — automatic protection against breaking minors).

`1.0` will be reached after _post-publish stability_ (~1 week + first external issue round + non-goal decisions). Code completion ≠ 1.0. Details in [ADR-041](./docs/DECISIONS.md).

## Non-goals (out of `0.x` scope)

- Cluster (multi-node)
- Persistence (Event Sourcing)
- Distributed Pub-Sub / Receptionist
- Streams (use EffectTS `Stream` directly)
- AllForOne supervision strategy (Akka Typed philosophy: explicit `watch` + respawn)

See [ADR-006](./docs/DECISIONS.md).

## Documentation

Korean is canonical (the project's working language). English README is the entry point.

- [docs/PLAN.md](./docs/PLAN.md) — milestone board
- [docs/USAGE.md](./docs/USAGE.md) — current user-facing surface
- [docs/API.md](./docs/API.md) — API sketch + examples
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — internal runtime model
- [docs/AKKA_REFERENCE.md](./docs/AKKA_REFERENCE.md) — Akka Typed → EffectTS mapping
- [docs/DECISIONS.md](./docs/DECISIONS.md) — ADRs (ADR-001 ~ ADR-045)
- [docs/LEARNINGS.md](./docs/LEARNINGS.md) — accumulated learnings
- [docs/DOGFOODING.md](./docs/DOGFOODING.md) — dogfooding history + guide
- [CHANGELOG.md](./CHANGELOG.md) — release notes (Keep a Changelog)
- [AGENTS.md](./AGENTS.md) — entry point for AI agents

## Persona

Primary user: **EffectTS power user, agent / AI system builder**. Comfortable with `Effect`, `Fiber`, `Layer`, `Queue`, `Scope`, and Akka Typed's `Behaviors` / `supervise` / `Terminated`. See [docs/PLAN.md DX SCORECARD](./docs/PLAN.md).

## Requirements

- Node 20+
- ESM only (no CJS)
- `effect@^3.10.0` as peer dependency

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues / PRs welcome — for non-trivial work please open an issue first.

## License

[MIT](./LICENSE)
