import { Chunk, Effect, STM, TRef } from "effect";
import type { Behavior } from "./behavior.js";
import type { ActorContext } from "./context.js";
import { StashOverflow } from "./errors.js";
import { interpretStep } from "./interpreter.js";

// Stash<Msg> — Akka Typed 의 StashBuffer 매핑 (M5 사이클 4, ADR-040).
// 메시지 임시 보관 + unstashAll 로 _next behavior 에 직접 적용_ (Akka 정통 순서 보장).
// buffer 는 instance scope 안 TRef<Chunk<Msg>>. restart 시 setup 재실행 → 새 stash 인스턴스 → 자동 비움.
// capacity 초과 시 stash() 가 StashOverflow fail (사용자 catch 또는 supervision).
export interface Stash<Msg> {
  readonly stash: (msg: Msg) => Effect.Effect<void, StashOverflow>;
  // unstashAll 은 stashed 메시지를 next 에 적용 — step fail propagate (외부 supervision 분기로).
  readonly unstashAll: (
    next: Behavior<Msg>,
  ) => Effect.Effect<Behavior<Msg>, unknown>;
  readonly clear: Effect.Effect<void>;
  readonly size: Effect.Effect<number>;
  readonly isFull: Effect.Effect<boolean>;
  readonly isEmpty: Effect.Effect<boolean>;
}

// makeStash — capacity + ctx (unstashAll 의 interpretStep 입력) 받아 Stash 인스턴스 생성.
// withStash builder 가 setup init 안에서 호출 — restart 시 재호출 = 새 buffer.
export const makeStash = <Msg>(args: {
  readonly capacity: number;
  readonly ctx: ActorContext<Msg>;
}): Effect.Effect<Stash<Msg>> =>
  Effect.gen(function* () {
    const buffer = yield* TRef.make(Chunk.empty<Msg>());

    const stash = (msg: Msg): Effect.Effect<void, StashOverflow> =>
      STM.commit(
        STM.gen(function* () {
          const cur = yield* TRef.get(buffer);
          if (Chunk.size(cur) >= args.capacity) {
            return yield* STM.fail(
              new StashOverflow({
                path: args.ctx.self.path,
                capacity: args.capacity,
              }),
            );
          }
          yield* TRef.set(buffer, Chunk.append(cur, msg));
        }),
      );

    // unstashAll — buffer 비우고 stashed 메시지들을 next behavior 에 _순서대로_ interpretStep 적용.
    // 마지막 결과 behavior 반환. 도중 Stopped 가 나오면 즉시 멈춤 (남은 stashed 메시지는 버림).
    // step 안 fail 은 propagate (외부 messageLoop 의 supervision 분기로).
    const unstashAll = (
      next: Behavior<Msg>,
    ): Effect.Effect<Behavior<Msg>, unknown> =>
      Effect.gen(function* () {
        const drained = yield* STM.commit(
          STM.gen(function* () {
            const cur = yield* TRef.get(buffer);
            yield* TRef.set(buffer, Chunk.empty<Msg>());
            return cur;
          }),
        );
        const messages = Chunk.toReadonlyArray(drained);

        let cur: Behavior<Msg> = next;
        for (const msg of messages) {
          cur = yield* interpretStep(cur, args.ctx, msg);
          if (cur._tag === "Stopped") return cur;
        }
        return cur;
      });

    const clear: Effect.Effect<void> = STM.commit(
      TRef.set(buffer, Chunk.empty<Msg>()),
    );

    const size: Effect.Effect<number> = STM.commit(
      TRef.get(buffer).pipe(STM.map((c) => Chunk.size(c))),
    );

    const isFull: Effect.Effect<boolean> = STM.commit(
      TRef.get(buffer).pipe(
        STM.map((c) => Chunk.size(c) >= args.capacity),
      ),
    );

    const isEmpty: Effect.Effect<boolean> = STM.commit(
      TRef.get(buffer).pipe(STM.map((c) => Chunk.size(c) === 0)),
    );

    return {
      stash,
      unstashAll,
      clear,
      size,
      isFull,
      isEmpty,
    };
  });
