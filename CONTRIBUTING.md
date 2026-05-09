# Contributing

Thanks for your interest. This is a small alpha project — keeping the contribution flow lightweight on purpose.

## Before you start

- **Open an issue first** for non-trivial work (new feature, API change, architectural question). The project is run by a single maintainer and Akka Typed semantics is the design constraint — better to align before code.
- **Bug reports** are great as issues. Include reproduction steps + Node version + `effect` version.
- **Documentation fixes** can go straight to PR. Korean is canonical for `docs/*.md`; English README is fine to update.

## Development setup

```bash
# Requirements: Node 20+, pnpm 11 (via corepack)
corepack enable
pnpm install

# Run tests (vitest)
pnpm test

# Typecheck only
pnpm typecheck

# Run an example
pnpm tsx examples/01-counter.ts

# Build (tsc → dist/)
pnpm build

# Format
pnpm format
```

## Working agreements

- **TypeScript 5 strict** with `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`. Don't relax these.
- **Tests first** for new behavior — TDD cycle. See `test/` for the existing pattern.
- **Effect-first** — the runtime is EffectTS. Don't introduce raw Promises in actor handlers; use `Effect.tryPromise` at the boundary.
- **Comments**: explain _why_, not _what_. Akka Typed parallels are worth noting.
- **Conventional commit prefixes** (`feat:` / `fix:` / `docs:` / `build:` / `chore:`) — already used in history.

## Documentation discipline

When you change behavior, update:
- `docs/USAGE.md` — user-facing surface
- `docs/API.md` — API sketch
- `docs/PLAN.md` — milestone status (if relevant)
- `docs/LEARNINGS.md` — non-obvious learnings (one line is fine)
- `docs/DECISIONS.md` — new ADR for design decisions (don't reverse existing ADRs silently — supersede explicitly)
- `examples/*.ts` — if the surface changed
- `CHANGELOG.md` — under `[Unreleased]`

Code + docs in the same commit.

## Testing

- `pnpm test` runs the full suite (~10 seconds).
- New tests should be deterministic. If timing is involved, use `>=` minimums (not exact equality) and check 5x flake-free locally before submitting.
- See `test/system.test.ts` for integration patterns (actor system + dogfooding-style scenarios).

## Pull request checklist

- [ ] Issue exists and is linked (for non-trivial changes)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` passing (`5x flake-free` if timing-sensitive)
- [ ] Relevant docs updated
- [ ] `CHANGELOG.md [Unreleased]` entry added
- [ ] Commit message follows conventional prefix

## Out of scope (please don't propose)

These are explicit non-goals for `0.x` (see [ADR-006](./docs/DECISIONS.md)):
- Cluster (multi-node)
- Persistence / Event Sourcing
- Distributed Pub-Sub / Receptionist
- AllForOne supervision (Akka Typed deliberately doesn't have this)

## License

By contributing you agree your contribution is licensed under [MIT](./LICENSE).
