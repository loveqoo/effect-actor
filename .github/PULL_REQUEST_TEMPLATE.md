## Summary

<!-- 1-3 bullets. What changed and why. -->

## Linked issue

<!-- Closes #N. For non-trivial work, an issue should exist first. -->

## Type

- [ ] Bug fix
- [ ] New feature (minor — breaking, per ADR-041)
- [ ] Documentation
- [ ] Internal refactor (no surface change)
- [ ] Build / tooling

## Checklist

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` passing (5x flake-free if timing-sensitive)
- [ ] Relevant docs updated (`docs/USAGE.md`, `docs/API.md`, `docs/PLAN.md`, `docs/LEARNINGS.md`, ADR if design decision)
- [ ] `examples/*.ts` updated if surface changed
- [ ] `CHANGELOG.md [Unreleased]` entry added
- [ ] Conventional commit message (`feat:` / `fix:` / `docs:` / `build:` / `chore:`)

## Notes for reviewer

<!-- Anything tricky about the diff. Akka Typed parallels worth pointing out. Dogfooding round that surfaced this, if any. -->
