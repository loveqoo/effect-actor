# effect-actor

> [Akka Typed](https://doc.akka.io/docs/akka/current/typed/index.html)-style actor library on top of [EffectTS](https://effect.website/). **0.x alpha — pre-release.**

> 한국어는 [README.ko.md](./README.ko.md) 참고.

## Status

| Item | Value |
|---|---|
| Version | `0.0.0` (not yet published) |
| Milestones | M0~M5 complete (5-cycle dogfooding passed). M∞ (npm publish) in progress |
| Tests | 201 passing, 5×3 = 15 flake-free runs in consumer (poly-phony) |
| Surface | `spawn` / `tell` / `receive` / `setup` / `watch` / `watchWith` / `ask` / `supervise` / `restart` / `restartWithBackoff` / `withLimit` / `withTimers` / `withStash` / `ctx.fork` / `ctx.scheduleOnce` |

## What is this

Akka Typed semantics expressed as a TypeScript library on top of EffectTS. The one-line promise:

> **`ActorRef` is a logical address. The mailbox is bound to that address. The behavior is what you can swap on top.**

When that one line holds, the rest follows:
- _ref stays stable across restart_ — external code can keep the ref and keep sending messages
- _mailbox preserved across restart_ — actor instance and mailbox are decoupled
- _parent-child supervision tree_ encoded by the framework, not by user code
- _supervision policy attached by the behavior author_ — Akka Typed philosophy

This project came out of an earlier attempt ([poly-phony](../poly-phony)) where the above guarantees were absent. The gap analysis is in [docs/AKKA_REFERENCE.md § 10](./docs/AKKA_REFERENCE.md#10-polyphony와의-비교).

## Quick start

> _Not yet on npm._ Will be published as `@loveqoo/effect-actor` once M∞ closes.

```typescript
import { Effect } from "effect";
import { ActorSystem, Behaviors } from "@loveqoo/effect-actor";

type Msg = { _tag: "Inc" } | { _tag: "Show" };

const counter = (n: number) =>
  Behaviors.receive<Msg>((_ctx, msg) => {
    if (msg._tag === "Inc") return Effect.succeed(counter(n + 1));
    return Effect.sync(() => {
      console.log(`current count: ${n}`);
      return counter(n);
    });
  });

const program = Effect.gen(function* () {
  const sys = yield* ActorSystem.create<Msg>(counter(0), "demo");
  yield* sys.root.tell({ _tag: "Inc" });
  yield* sys.root.tell({ _tag: "Inc" });
  yield* sys.root.tell({ _tag: "Inc" });
  yield* sys.root.tell({ _tag: "Show" });
  yield* Effect.sleep("50 millis");
  yield* sys.shutdown;
});

Effect.runPromise(program);
// → current count: 3
```

More patterns in [examples/](./examples) (01-counter through 08-timer).

## Magic moment

```ts
// before (poly-phony style):
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
| M∞ | 🟡 | npm publish (semver ✅, build ✅, English README ✅, CHANGELOG ✅, first publish pending) |

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
- [docs/DECISIONS.md](./docs/DECISIONS.md) — ADRs (ADR-001 ~ ADR-042)
- [docs/LEARNINGS.md](./docs/LEARNINGS.md) — accumulated learnings
- [docs/DOGFOODING.md](./docs/DOGFOODING.md) — dogfooding history + guide
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
