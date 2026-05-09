import {
  Duration,
  Effect,
  Fiber,
  HashMap,
  Option,
  Queue,
  STM,
  Schedule,
  TRef,
} from "effect";
import type { Cell } from "./mailbox.js";

// Timers — Akka Typed 의 TimerScheduler 매핑 (M5 사이클 3, ADR-039).
// _self mailbox 에 메시지 발사_ 를 일정 간격으로 자동화.
// 모든 fiber 는 _instance scope_ 안에 fork (ctx.fork 사용) — restart/stop 시 자동 cancel (ADR-021).
// key 충돌 시 기존 fiber interrupt 후 새로 (Akka 동작 일치).
export interface Timers<Msg> {
  readonly startSingleTimer: (
    key: string,
    msg: Msg,
    delay: Duration.DurationInput,
  ) => Effect.Effect<void>;
  readonly startTimerWithFixedDelay: (
    key: string,
    msg: Msg,
    interval: Duration.DurationInput,
  ) => Effect.Effect<void>;
  readonly cancel: (key: string) => Effect.Effect<void>;
  readonly cancelAll: Effect.Effect<void>;
  readonly isActive: (key: string) => Effect.Effect<boolean>;
}

// makeTimers — 액터의 _self cell_ + _instance scope 안 fork 헬퍼_ 만 받아 Timers 인스턴스 생성.
// system.ts 의 makeChildContext 가 ctx.fork 를 갖고 있으므로, withTimers 빌더 안 ctx 에서 호출.
// fork 헬퍼는 instance scope 안 fork — 이후 fiber map 에 추적해 cancel 시 interrupt.
export const makeTimers = <Msg>(args: {
  readonly cell: Cell<Msg>;
  readonly forkInInstanceScope: <A, E>(
    eff: Effect.Effect<A, E>,
  ) => Effect.Effect<Fiber.RuntimeFiber<A, E>>;
}): Effect.Effect<Timers<Msg>> =>
  Effect.gen(function* () {
    // key → fiber 추적. 같은 key 다시 start 시 기존 fiber interrupt.
    const fibersRef = yield* TRef.make(
      HashMap.empty<string, Fiber.RuntimeFiber<unknown, unknown>>(),
    );

    // 공통 — key 의 기존 fiber interrupt 후 새 fiber 등록.
    const replaceFiber = (
      key: string,
      newFiber: Fiber.RuntimeFiber<unknown, unknown>,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const old = yield* STM.commit(
          STM.gen(function* () {
            const map = yield* TRef.get(fibersRef);
            const opt = HashMap.get(map, key);
            yield* TRef.set(fibersRef, HashMap.set(map, key, newFiber));
            return opt;
          }),
        );
        if (Option.isSome(old)) {
          yield* Fiber.interrupt(old.value);
        }
      });

    const startSingleTimer = (
      key: string,
      msg: Msg,
      delay: Duration.DurationInput,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const eff = Effect.gen(function* () {
          yield* Effect.sleep(delay);
          yield* Queue.offer(args.cell.mailbox, msg);
          // 자기 fiber 가 끝나면 map 에서 idempotent 삭제 (best-effort)
          yield* STM.commit(
            TRef.update(fibersRef, (m) => HashMap.remove(m, key)),
          );
        });
        const fiber = yield* args.forkInInstanceScope(eff);
        yield* replaceFiber(
          key,
          fiber as Fiber.RuntimeFiber<unknown, unknown>,
        );
      });

    const startTimerWithFixedDelay = (
      key: string,
      msg: Msg,
      interval: Duration.DurationInput,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        // Schedule.spaced — 첫 발사도 interval 후 (Akka fixedDelay 와 동일 의미).
        // _이전 작업 완료 후_ interval — _Rate 가 아닌_ Delay (offer 끝나고 sleep).
        const eff = Effect.repeat(
          Effect.gen(function* () {
            yield* Effect.sleep(interval);
            yield* Queue.offer(args.cell.mailbox, msg);
          }),
          Schedule.forever,
        ).pipe(Effect.asVoid);
        const fiber = yield* args.forkInInstanceScope(eff);
        yield* replaceFiber(
          key,
          fiber as Fiber.RuntimeFiber<unknown, unknown>,
        );
      });

    const cancel = (key: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const found = yield* STM.commit(
          STM.gen(function* () {
            const map = yield* TRef.get(fibersRef);
            const opt = HashMap.get(map, key);
            if (Option.isSome(opt)) {
              yield* TRef.set(fibersRef, HashMap.remove(map, key));
            }
            return opt;
          }),
        );
        if (Option.isSome(found)) {
          yield* Fiber.interrupt(found.value);
        }
      });

    const cancelAll: Effect.Effect<void> = Effect.gen(function* () {
      const map = yield* STM.commit(
        STM.gen(function* () {
          const m = yield* TRef.get(fibersRef);
          yield* TRef.set(
            fibersRef,
            HashMap.empty<string, Fiber.RuntimeFiber<unknown, unknown>>(),
          );
          return m;
        }),
      );
      yield* Effect.forEach(
        Array.from(HashMap.values(map)),
        (f) => Fiber.interrupt(f),
        { concurrency: "unbounded", discard: true },
      );
    });

    const isActive = (key: string): Effect.Effect<boolean> =>
      Effect.gen(function* () {
        const map = yield* STM.commit(TRef.get(fibersRef));
        return HashMap.has(map, key);
      });

    return {
      startSingleTimer,
      startTimerWithFixedDelay,
      cancel,
      cancelAll,
      isActive,
    };
  });
