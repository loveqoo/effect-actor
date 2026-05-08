import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Behaviors, unwrapMeta } from "../src/behavior.js";
import type { ActorContext } from "../src/context.js";
import { MailboxPolicy } from "../src/mailbox.js";

describe("Behavior ADT 종결자", () => {
  it("same() 의 _tag 는 'Same'", () => {
    const b = Behaviors.same<unknown>();
    expect(b._tag).toBe("Same");
  });

  it("stopped() 의 _tag 는 'Stopped'", () => {
    const b = Behaviors.stopped<unknown>();
    expect(b._tag).toBe("Stopped");
  });

  it("empty() 의 _tag 는 'Empty' — 메시지 무시", () => {
    const b = Behaviors.empty<unknown>();
    expect(b._tag).toBe("Empty");
  });

  it("unhandled() 의 _tag 는 'Unhandled' — DeathPact / 진단 hint", () => {
    const b = Behaviors.unhandled<unknown>();
    expect(b._tag).toBe("Unhandled");
  });

  it("종결자는 _참조 동일성 유지_ — 매번 새 객체 만들 필요 없음", () => {
    expect(Behaviors.same()).toBe(Behaviors.same());
    expect(Behaviors.stopped()).toBe(Behaviors.stopped());
    expect(Behaviors.empty()).toBe(Behaviors.empty());
    expect(Behaviors.unhandled()).toBe(Behaviors.unhandled());
  });
});

describe("Behaviors.receive / receiveMessage", () => {
  it("receive 는 handler 그대로 보존 + _tag Receive", () => {
    const handler = (
      _ctx: ActorContext<string>,
      _msg: string,
    ): Effect.Effect<ReturnType<typeof Behaviors.same<string>>> =>
      Effect.succeed(Behaviors.same<string>());
    const b = Behaviors.receive(handler);
    expect(b._tag).toBe("Receive");
    if (b._tag === "Receive") {
      expect(b.handle).toBe(handler);
    }
  });

  it("receiveMessage 는 ctx 받지 않는 단순 형태 — 내부적으로는 Receive ADT 로 풀림", () => {
    const handler = (msg: string) =>
      Effect.succeed(
        msg === "stop" ? Behaviors.stopped<string>() : Behaviors.same<string>(),
      );
    const b = Behaviors.receiveMessage(handler);
    expect(b._tag).toBe("Receive");
    // receiveMessage 는 ctx 인자 무시 — handle 호출 가능 검증은 사이클 3 (해석기) 에서
  });
});

describe("Behaviors.setup", () => {
  it("setup 의 _tag 는 Setup, init 보존", () => {
    const init = (_ctx: ActorContext<number>) =>
      Effect.succeed(Behaviors.same<number>());
    const b = Behaviors.setup(init);
    expect(b._tag).toBe("Setup");
    if (b._tag === "Setup") {
      expect(b.init).toBe(init);
    }
  });
});

describe("Behaviors.withMailbox + 메타 추출 (ADR-018, ADR-026)", () => {
  it("withMailbox 는 inner + policy 보존", () => {
    const inner = Behaviors.same<string>();
    const policy = MailboxPolicy.bounded(64, "drop");
    const wrapped = Behaviors.withMailbox(inner, policy);
    expect(wrapped._tag).toBe("WithMailbox");
    if (wrapped._tag === "WithMailbox") {
      expect(wrapped.inner).toBe(inner);
      expect(wrapped.policy).toBe(policy);
    }
  });

  it("unwrapMeta — 래퍼 없으면 default unbounded + inner 그대로", () => {
    const b = Behaviors.same<string>();
    const meta = unwrapMeta(b);
    expect(meta.mailboxPolicy._tag).toBe("Unbounded");
    expect(meta.inner).toBe(b);
  });

  it("unwrapMeta — withMailbox 한 겹 벗기고 policy 추출", () => {
    const inner = Behaviors.stopped<string>();
    const policy = MailboxPolicy.bounded(8, "backpressure");
    const wrapped = Behaviors.withMailbox(inner, policy);
    const meta = unwrapMeta(wrapped);
    expect(meta.mailboxPolicy).toBe(policy);
    expect(meta.inner).toBe(inner);
  });

  it("unwrapMeta — 중첩 withMailbox 는 _가장 바깥_ 채택 (Akka semantics)", () => {
    const innerMost = Behaviors.same<string>();
    const innerWrap = Behaviors.withMailbox(
      innerMost,
      MailboxPolicy.bounded(1, "drop"),
    );
    const outerPolicy = MailboxPolicy.bounded(100, "backpressure");
    const outerWrap = Behaviors.withMailbox(innerWrap, outerPolicy);

    const meta = unwrapMeta(outerWrap);
    expect(meta.mailboxPolicy).toBe(outerPolicy);
    // inner 는 안쪽 래퍼 그대로 (Setup/Receive 등 시작 behavior). 안쪽 mailbox 는 무시.
    expect(meta.inner).toBe(innerWrap);
  });

  it("unwrapMeta — withMailbox 안에 Setup 이 있으면 inner 는 Setup", () => {
    const init = (_ctx: ActorContext<number>) =>
      Effect.succeed(Behaviors.same<number>());
    const setup = Behaviors.setup(init);
    const wrapped = Behaviors.withMailbox(
      setup,
      MailboxPolicy.bounded(4, "fail"),
    );
    const meta = unwrapMeta(wrapped);
    expect(meta.inner._tag).toBe("Setup");
  });
});
