import { describe, it, expect } from "vitest";
import { Equal } from "effect";
import { ActorPath } from "../src/path.js";
import { WatchKey, WatchMessage, Signal } from "../src/signal.js";

describe("WatchKey", () => {
  it("같은 (path, uid) 는 Equal", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "x");
    const a = WatchKey.make(p, "uid-1");
    const b = WatchKey.make(p, "uid-1");
    expect(Equal.equals(a, b)).toBe(true);
  });

  it("uid 다르면 not Equal — ABA 차단의 본질 (ADR-016)", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "x");
    const a = WatchKey.make(p, "uid-1");
    const b = WatchKey.make(p, "uid-2");
    expect(Equal.equals(a, b)).toBe(false);
  });

  it("path 다르면 not Equal", () => {
    const a = WatchKey.make(
      ActorPath.child(ActorPath.root("demo"), "x"),
      "uid-1",
    );
    const b = WatchKey.make(
      ActorPath.child(ActorPath.root("demo"), "y"),
      "uid-1",
    );
    expect(Equal.equals(a, b)).toBe(false);
  });
});

describe("WatchMessage", () => {
  it("Terminated 는 단일 인스턴스 OK", () => {
    expect(WatchMessage.Terminated._tag).toBe("Terminated");
  });

  it("Custom 은 임의 메시지 보유", () => {
    const m = WatchMessage.Custom({ kind: "WorkerGone" });
    expect(m._tag).toBe("Custom");
    if (m._tag === "Custom") {
      expect(m.msg).toEqual({ kind: "WorkerGone" });
    }
  });
});

describe("Signal", () => {
  it("PreRestart / PostStop 은 상수", () => {
    expect(Signal.PreRestart._tag).toBe("PreRestart");
    expect(Signal.PostStop._tag).toBe("PostStop");
  });

  it("Terminated 는 path + uid 보유", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "child");
    const t = Signal.Terminated(p, "uid-1");
    expect(t._tag).toBe("Terminated");
    if (t._tag === "Terminated") {
      expect(t.path).toBe(p);
      expect(t.uid).toBe("uid-1");
    }
  });
});
