import { Effect, Queue } from "effect";
import type { Behavior, BehaviorEffect } from "./behavior.js";
import type { ActorContext } from "./context.js";
import type { ActorEntry } from "./entry.js";

// 한 메시지를 한 Behavior 에 적용해 _다음_ Behavior 계산.
// Setup/WithMailbox 는 spawn 0단계에서 풀려 도달 안 함 — 도달하면 invariant violation, 안전하게 그대로.
export const interpretStep = <Msg>(
  current: Behavior<Msg>,
  ctx: ActorContext<Msg>,
  msg: Msg,
): BehaviorEffect<Msg> => {
  switch (current._tag) {
    case "Same":
    case "Empty":
    case "Unhandled":
    case "Stopped":
      return Effect.succeed(current);
    case "Receive":
      return Effect.map(current.handle(ctx, msg), (next) =>
        next._tag === "Same" ? current : next,
      );
    case "Setup":
    case "WithMailbox":
      // spawn 0단계가 풀어줘야 하는 케이스 — 여기까지 오면 invariant violation. 안전 fallback.
      return Effect.succeed(current);
  }
};

// Setup 을 평가해 시작 behavior 를 얻는다 (init 한 번만 실행).
// 사이클 3 단계는 Setup 한 겹만 — 중첩 Setup 은 사이클 4 또는 M2 에서 결정.
const evaluateInitial = <Msg>(
  initial: Behavior<Msg>,
  ctx: ActorContext<Msg>,
): BehaviorEffect<Msg> => {
  if (initial._tag === "Setup") {
    return initial.init(ctx);
  }
  return Effect.succeed(initial);
};

const messageLoop = <Msg>(
  initial: Behavior<Msg>,
  entry: ActorEntry<Msg>,
  ctx: ActorContext<Msg>,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    let current = yield* evaluateInitial(initial, ctx);
    while (current._tag !== "Stopped") {
      const msg = yield* Queue.take(entry.cell.mailbox);
      current = yield* interpretStep(current, ctx, msg);
    }
  });

// 액터의 메인 루프 (ARCHITECTURE §3.3).
// Supervision 외피 (ADR-020): default strategy = stop. catchAllCause 로 fail + defect 모두 흡수.
// 사이클 3: message 흐름 + Stopped 종료 + default stop on failure. signal 폴링은 사이클 4.
export const runInterpreter = <Msg>(
  initial: Behavior<Msg>,
  entry: ActorEntry<Msg>,
  ctx: ActorContext<Msg>,
): Effect.Effect<void> =>
  Effect.catchAllCause(messageLoop(initial, entry, ctx), () => Effect.void);
