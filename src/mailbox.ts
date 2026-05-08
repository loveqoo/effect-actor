import { Effect, Queue } from "effect";
import type { Signal } from "./signal.js";

// Mailbox 정책 (ADR-018). 기본 unbounded — AI/agent burst 워크로드 안전.
export type MailboxPolicy =
  | { readonly _tag: "Unbounded" }
  | {
      readonly _tag: "Bounded";
      readonly capacity: number;
      readonly overflow: "backpressure" | "drop" | "fail";
    };

export const MailboxPolicy = {
  unbounded: { _tag: "Unbounded" } as const satisfies MailboxPolicy,
  bounded: (
    capacity: number,
    overflow: "backpressure" | "drop" | "fail",
  ): MailboxPolicy => ({ _tag: "Bounded", capacity, overflow }),
};

// Cell — ActorEntry 수명 동안 _같은 인스턴스_ (ADR-019).
// restart 시 mailbox 보존되는 곳.
export interface Cell<Msg> {
  readonly mailbox: Queue.Queue<Msg>;
  readonly signalQueue: Queue.Queue<Signal>;
}

const makeMailbox = <Msg>(policy: MailboxPolicy): Effect.Effect<Queue.Queue<Msg>> => {
  if (policy._tag === "Unbounded") {
    return Queue.unbounded<Msg>();
  }
  switch (policy.overflow) {
    case "backpressure":
      return Queue.bounded<Msg>(policy.capacity);
    case "drop":
      return Queue.dropping<Msg>(policy.capacity);
    case "fail":
      // overflow=fail 은 Queue.bounded + offer 가 false 반환을 사용자 단에서 감지.
      // Bounded queue 그대로 쓰되 ADR-019 의 dispatch 단계에서 fail 변환.
      return Queue.bounded<Msg>(policy.capacity);
  }
};

export const Cell = {
  make: <Msg>(policy: MailboxPolicy = MailboxPolicy.unbounded): Effect.Effect<Cell<Msg>> =>
    Effect.gen(function* () {
      const mailbox = yield* makeMailbox<Msg>(policy);
      const signalQueue = yield* Queue.unbounded<Signal>();
      return { mailbox, signalQueue };
    }),
};
