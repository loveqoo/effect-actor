import { describe, it, expect } from "vitest";
import { Equal, Option } from "effect";
import { ActorPath } from "../src/path.js";

describe("ActorPath", () => {
  it("root 는 system 이름과 user 단일 세그먼트", () => {
    const p = ActorPath.root("demo");
    expect(p.system).toBe("demo");
    expect(p.elements).toEqual(["user"]);
  });

  it("child 는 새 세그먼트 추가", () => {
    const root = ActorPath.root("demo");
    const c = ActorPath.child(root, "counter");
    expect(c.elements).toEqual(["user", "counter"]);
    expect(root.elements).toEqual(["user"]);
  });

  it("parent 는 root 면 None, 아니면 Some", () => {
    const root = ActorPath.root("demo");
    const c = ActorPath.child(root, "a");
    expect(Option.isNone(ActorPath.parent(root))).toBe(true);
    expect(Option.getOrThrow(ActorPath.parent(c)).elements).toEqual(["user"]);
  });

  it("toString 은 actor:// 스킴", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "child");
    expect(ActorPath.toString(p)).toBe("actor://demo/user/child");
  });

  it("parse 는 toString 의 역", () => {
    const p = ActorPath.child(ActorPath.root("demo"), "child");
    const parsed = Option.getOrThrow(ActorPath.parse(ActorPath.toString(p)));
    expect(Equal.equals(parsed, p)).toBe(true);
  });

  it("parse 잘못된 입력은 None", () => {
    expect(Option.isNone(ActorPath.parse("not-a-path"))).toBe(true);
    expect(Option.isNone(ActorPath.parse("actor://only-system"))).toBe(true);
  });

  it("같은 내용 ActorPath 는 Equal", () => {
    const a = ActorPath.child(ActorPath.root("demo"), "x");
    const b = ActorPath.child(ActorPath.root("demo"), "x");
    expect(Equal.equals(a, b)).toBe(true);
  });

  it("isAncestorOf 는 strict ancestor", () => {
    const root = ActorPath.root("demo");
    const child = ActorPath.child(root, "a");
    const grand = ActorPath.child(child, "b");
    expect(ActorPath.isAncestorOf(root, child)).toBe(true);
    expect(ActorPath.isAncestorOf(root, grand)).toBe(true);
    expect(ActorPath.isAncestorOf(child, root)).toBe(false);
    expect(ActorPath.isAncestorOf(root, root)).toBe(false);
  });

  it("다른 system 끼리 isAncestorOf 는 false", () => {
    const a = ActorPath.root("a");
    const b = ActorPath.child(ActorPath.root("b"), "x");
    expect(ActorPath.isAncestorOf(a, b)).toBe(false);
  });
});
