import type { Effect } from "effect";
import type { ActorContext } from "./context.js";
import { MailboxPolicy } from "./mailbox.js";

// Behavior<Msg> ADT — 액터의 _다음 동작_ 을 표현하는 불변 값.
// 사이클 2: ADT + 빌더 + 메타 추출 (sync 부분). 해석기는 사이클 3.

// handler 의 fail 채널은 unknown — supervision 외피 (ADR-020) 가 catchAllCause 로 받음.
export type BehaviorEffect<Msg> = Effect.Effect<Behavior<Msg>, unknown>;

export type Behavior<Msg> =
  | { readonly _tag: "Same" }
  | { readonly _tag: "Stopped" }
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Unhandled" }
  | {
      readonly _tag: "Receive";
      readonly handle: (
        ctx: ActorContext<Msg>,
        msg: Msg,
      ) => BehaviorEffect<Msg>;
    }
  | {
      readonly _tag: "Setup";
      readonly init: (ctx: ActorContext<Msg>) => BehaviorEffect<Msg>;
    }
  | {
      readonly _tag: "WithMailbox";
      readonly inner: Behavior<Msg>;
      readonly policy: MailboxPolicy;
    };

const SAME: Behavior<never> = { _tag: "Same" };
const STOPPED: Behavior<never> = { _tag: "Stopped" };
const EMPTY: Behavior<never> = { _tag: "Empty" };
const UNHANDLED: Behavior<never> = { _tag: "Unhandled" };

export const Behaviors = {
  same: <Msg>(): Behavior<Msg> => SAME,
  stopped: <Msg>(): Behavior<Msg> => STOPPED,
  empty: <Msg>(): Behavior<Msg> => EMPTY,
  unhandled: <Msg>(): Behavior<Msg> => UNHANDLED,

  receive: <Msg>(
    handle: (ctx: ActorContext<Msg>, msg: Msg) => BehaviorEffect<Msg>,
  ): Behavior<Msg> => ({ _tag: "Receive", handle }),

  receiveMessage: <Msg>(
    handle: (msg: Msg) => BehaviorEffect<Msg>,
  ): Behavior<Msg> => ({
    _tag: "Receive",
    handle: (_ctx, msg) => handle(msg),
  }),

  setup: <Msg>(
    init: (ctx: ActorContext<Msg>) => BehaviorEffect<Msg>,
  ): Behavior<Msg> => ({ _tag: "Setup", init }),

  // Mailbox 정책을 부착한 래퍼 (ADR-018, ADR-026).
  // spawn 0단계에서 unwrapMeta 가 벗기고 정책 추출.
  withMailbox: <Msg>(
    inner: Behavior<Msg>,
    policy: MailboxPolicy,
  ): Behavior<Msg> => ({ _tag: "WithMailbox", inner, policy }),
};

// 메타 추출 결과 (ADR-026, ARCHITECTURE §3.1 의 0단계 sync 부분).
// Setup 평가 (init 실행) 는 ctx 의존이라 사이클 3 의 spawn 흐름에서.
export interface BehaviorMeta<Msg> {
  readonly mailboxPolicy: MailboxPolicy;
  readonly inner: Behavior<Msg>;
  // 사이클 4 (M4): supervisorStrategy 추가 예정.
}

// 외곽 래퍼 _가장 바깥_ 것만 채택 (Akka semantics).
// 안쪽 래퍼는 inner 안에 그대로 — 시작 behavior 가 보유.
export const unwrapMeta = <Msg>(behavior: Behavior<Msg>): BehaviorMeta<Msg> => {
  if (behavior._tag === "WithMailbox") {
    return { mailboxPolicy: behavior.policy, inner: behavior.inner };
  }
  return { mailboxPolicy: MailboxPolicy.unbounded, inner: behavior };
};
