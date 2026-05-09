# examples — 실행 가능한 사용 예시

ADR-011 에 따라 _마일스톤마다 동작하는 예시 한 개_ 가 DoD.

| 파일 | 마일스톤 | 무엇 |
|---|---|---|
| `01-counter.ts` | M1 | spawn / tell / receive + setup |
| `02-lifecycle.ts` | M2 | setup + PostStop |
| `03-watch.ts` | M3 | watch / Terminated |
| `04-ask.ts` | M3 | ask 패턴 + timeout |
| `05-restart.ts` | M4 | supervision restart + mailbox 보존 |
| `06-backoff.ts` | M5 | restartWithBackoff |
| `07-stash.ts` | M5 | withStash |
| `08-timer.ts` | M5 | withTimers |
| `09-tagged-enum.ts` | (도구) | `Data.TaggedEnum` 으로 메시지 ADT 정의 — constructor + `$match` 자동 |

## 실행

```bash
pnpm tsx examples/01-counter.ts
```

또는

```bash
pnpm example examples/01-counter.ts
```
