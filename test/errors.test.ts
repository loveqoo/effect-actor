import { describe, it, expect } from "vitest";
import { Effect, Exit, Cause } from "effect";
import { ActorPath } from "../src/path.js";
import {
  ActorNotFound,
  IncarnationMismatch,
  MailboxFull,
  RestartLimitExceeded,
} from "../src/errors.js";

describe("Tagged errors", () => {
  it("ActorNotFound 는 _tag + path 보유", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "missing");
    const e = new ActorNotFound({ path: p });
    expect(e._tag).toBe("ActorNotFound");
    expect(e.path).toBe(p);
  });

  it("IncarnationMismatch 는 expected/actual uid 보유", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "x");
    const e = new IncarnationMismatch({
      path: p,
      expectedUid: "old-uid",
      actualUid: "new-uid",
    });
    expect(e._tag).toBe("IncarnationMismatch");
    expect(e.expectedUid).toBe("old-uid");
    expect(e.actualUid).toBe("new-uid");
  });

  it("MailboxFull 은 capacity 보유", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "x");
    const e = new MailboxFull({ path: p, capacity: 1024 });
    expect(e._tag).toBe("MailboxFull");
    expect(e.capacity).toBe(1024);
  });

  it("RestartLimitExceeded 는 path / 한도 / 윈도우 / 시도 횟수 보유 (M5 사이클 1, ADR-037)", () => {
    const p = ActorPath.root("demo");
    const e = new RestartLimitExceeded({
      path: p,
      maxNrOfRetries: 2,
      windowMillis: 1000,
      attemptCount: 3,
    });
    expect(e._tag).toBe("RestartLimitExceeded");
    expect(e.path).toBe(p);
    expect(e.maxNrOfRetries).toBe(2);
    expect(e.windowMillis).toBe(1000);
    expect(e.attemptCount).toBe(3);
  });

  it("Effect.fail 안에서 tagged 채널 실패로 흐름", async () => {
    const p = ActorPath.root("demo");
    const exit = await Effect.runPromiseExit(
      Effect.fail(new ActorNotFound({ path: p })),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value._tag).toBe("ActorNotFound");
      }
    }
  });
});
