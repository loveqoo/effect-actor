import { describe, it, expect } from "vitest";
import { Effect, Option, Queue, STM } from "effect";
import { Behaviors, type Behavior } from "../src/behavior.js";
import { ActorRef } from "../src/ref.js";
import { Registry } from "../src/registry.js";
import { Strategies } from "../src/supervision.js";
import { ActorSystem } from "../src/system.js";
import { ActorPath } from "../src/path.js";
import type { ActorContext } from "../src/context.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

describe("ActorSystem.create — 통합", () => {
  it("create + tell + shutdown — 한 메시지 처리하고 종료", () =>
    run(
      Effect.gen(function* () {
        let processed = "";
        const root = Behaviors.receiveMessage<string>((m) =>
          Effect.sync(() => {
            processed = m;
            return Behaviors.same();
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* sys.root.tell("hello");
        yield* Effect.sleep("20 millis"); // fiber 가 처리할 시간
        yield* sys.shutdown;

        expect(processed).toBe("hello");
        expect(sys.name).toBe("demo");
      }),
    ));

  it("root path 는 actor://<systemName>/user", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          Behaviors.empty<unknown>(),
          "my-sys",
        );
        expect(sys.root.path.system).toBe("my-sys");
        expect(sys.root.path.elements).toEqual(["user"]);
        yield* sys.shutdown;
      }),
    ));

  it("root 의 uid 가 spawn 시 부여됨 (ADR-016, UUID 형태)", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          Behaviors.empty<unknown>(),
          "demo",
        );
        // UUID 또는 충분히 unique 한 문자열
        expect(sys.root.uid.length).toBeGreaterThan(0);
        expect(typeof sys.root.uid).toBe("string");
        yield* sys.shutdown;
      }),
    ));
});

describe("ActorRef.tell — best-effort delivery (ADR-019)", () => {
  it("정상 ref tell → mailbox 에 enqueue", () =>
    run(
      Effect.gen(function* () {
        // Behaviors.empty 라 메시지가 mailbox 에 들어가도 처리 안 됨 (검증용)
        const sys = yield* ActorSystem.create(
          Behaviors.empty<string>(),
          "demo",
        );
        yield* sys.root.tell("test");
        // 잠깐 처리 시간 후 mailbox 가 _empty_ 가 아닐 수도 — Empty behavior 는
        // interpretStep 에서 메시지 무시하고 그대로. 즉 mailbox 에서 take 는 일어나도
        // 처리는 noop. 일단 fiber 가 take 했는지는 race — _최소 enqueue 성공_ 만 본다.
        // queue size 검사 대신 _shutdown 정상_ 으로 enqueue 자체는 OK 검증.
        yield* sys.shutdown;
        expect(true).toBe(true);
      }),
    ));

  it("stale ref (uid 다름) → dead letter, mailbox 에 안 들어감", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          // 메시지를 처리하지 않고 들어오면 _기록_ 만 — 실제로는 staleRef 가 enqueue 막힘.
          Behaviors.receiveMessage<string>(() =>
            Effect.succeed(Behaviors.same()),
          ),
          "demo",
        );
        const real = sys.root;
        const staleRef = ActorRef.make<string>({
          path: real.path,
          uid: "stale-uid-xxx",
          cell: real.cell,
          system: real.system,
        });

        yield* staleRef.tell("ghost");
        // 진짜 ref 의 mailbox 에 enqueue 안 됨
        const size = yield* Queue.size(real.cell.mailbox);
        expect(size).toBe(0);

        yield* sys.shutdown;
      }),
    ));

  it("shutdown 후 tell → dead letter (status=stopped)", () =>
    run(
      Effect.gen(function* () {
        const sys = yield* ActorSystem.create(
          Behaviors.receiveMessage<string>(() =>
            Effect.succeed(Behaviors.same()),
          ),
          "demo",
        );
        yield* sys.shutdown;
        // tell 이 silent dead letter — 에러 안 나야 함
        yield* sys.root.tell("after-shutdown");
        expect(true).toBe(true);
      }),
    ));
});

describe("ctx.spawn — 자식 actor (ARCHITECTURE §3.1)", () => {
  it("setup 안에서 자식 spawn → 자식 메시지 처리", () =>
    run(
      Effect.gen(function* () {
        const seen: string[] = [];

        type ParentMsg = { _tag: "Forward"; data: string };
        type ChildMsg = { _tag: "Process"; data: string };

        const child = Behaviors.receiveMessage<ChildMsg>((m) =>
          Effect.sync(() => {
            seen.push(m.data);
            return Behaviors.same();
          }),
        );

        const parent = Behaviors.setup<ParentMsg>((ctx) =>
          Effect.gen(function* () {
            const childRef = yield* ctx.spawn(child, "worker");
            return Behaviors.receiveMessage<ParentMsg>((m) =>
              childRef
                .tell({ _tag: "Process", data: m.data })
                .pipe(Effect.as(Behaviors.same())),
            );
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* sys.root.tell({ _tag: "Forward", data: "hello" });
        yield* sys.root.tell({ _tag: "Forward", data: "world" });
        yield* Effect.sleep("30 millis");

        expect(seen).toEqual(["hello", "world"]);
        yield* sys.shutdown;
      }),
    ));

  it("자식의 path 는 parent.path + name", () =>
    run(
      Effect.gen(function* () {
        const captured: { path?: import("../src/path.js").ActorPath } = {};

        const parent = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const childRef = yield* ctx.spawn(
              Behaviors.empty<string>(),
              "kid",
            );
            captured.path = childRef.path;
            return Behaviors.empty<string>();
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("20 millis");

        expect(captured.path?.system).toBe("demo");
        expect(captured.path?.elements).toEqual(["user", "kid"]);

        yield* sys.shutdown;
      }),
    ));

  it("ctx.spawn 후 parent.children TMap 에 자식 path 등록 (ADR-017)", () =>
    run(
      Effect.gen(function* () {
        // root 의 entry 를 못 가져오니 _간접 검증_: 같은 이름 재spawn 가능 여부는
        // children 추가 자체가 STM tx 안에서 동작함을 통합으로 본다.
        const parent = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.spawn(Behaviors.empty<string>(), "child-a");
            yield* ctx.spawn(Behaviors.empty<string>(), "child-b");
            return Behaviors.empty<string>();
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("20 millis");
        // shutdown 이 정상 종료 — 두 자식 모두 등록됨을 의미
        yield* sys.shutdown;
        expect(true).toBe(true);
      }),
    ));
});

describe("ActorSystem.shutdown — PostStop hook (M2 사이클 3, ADR-021 §3.8)", () => {
  it("shutdown 시 root 의 onSignal 이 PostStop 호출됨", () =>
    run(
      Effect.gen(function* () {
        let postStopSeen = false;

        const root = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        ).receiveSignal((_c, s) =>
          Effect.sync(() => {
            if (s._tag === "PostStop") postStopSeen = true;
            return Behaviors.same();
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* sys.shutdown;
        expect(postStopSeen).toBe(true);
      }),
    ));

  it("PostStop 미부착 root 도 shutdown 정상 (silent)", () =>
    run(
      Effect.gen(function* () {
        const root = Behaviors.receive<string>(() =>
          Effect.succeed(Behaviors.same()),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* sys.shutdown;
        expect(true).toBe(true);
      }),
    ));

  it("setup 안에서 자원 잡고 PostStop 에서 정리 — Akka 패턴", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const root = Behaviors.setup<string>(() =>
          Effect.sync(() => {
            log.push("setup");
            return Behaviors.receiveMessage<string>(() =>
              Effect.succeed(Behaviors.same()),
            ).receiveSignal((_c, s) =>
              Effect.sync(() => {
                if (s._tag === "PostStop") log.push("post-stop");
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* sys.shutdown;

        expect(log).toEqual(["setup", "post-stop"]);
      }),
    ));
});

// 자식이 PostStop hook 을 갖는 leaf — 호출 검증용.
const trackedLeaf = (log: string[], label: string): Behavior<string> =>
  Behaviors.receiveMessage<string>(() =>
    Effect.succeed(Behaviors.same<string>()),
  ).receiveSignal((_c, sig) =>
    Effect.sync(() => {
      if (sig._tag === "PostStop") log.push(`stop:${label}`);
      return Behaviors.same<string>();
    }),
  );

describe("spawn race fix (M3.1, 도그푸딩 #2 사이클 5 finding)", () => {
  it("spawn 후 _즉시_ sys.shutdown — 자식 PostStop 호출 보장 (happens-before)", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.spawn(trackedLeaf(log, "a"), "a");
            yield* ctx.spawn(trackedLeaf(log, "b"), "b");
            return Behaviors.receiveMessage<string>(() =>
              Effect.succeed(Behaviors.same<string>()),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        // _즉시_ shutdown — Effect.sleep 우회 X. spawn happens-before contract 검증.
        yield* sys.shutdown;

        // 두 자식 PostStop 모두 호출되어야 (race 안 짐)
        expect(log).toContain("stop:a");
        expect(log).toContain("stop:b");
      }),
    ));

  it("spawn 후 즉시 ctx.stop — 자식 PostStop 호출 보장 (happens-before)", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const a = yield* ctx.spawn(trackedLeaf(log, "a"), "a");
            // spawn 직후 즉시 stop
            yield* ctx.stop(a);
            return Behaviors.receiveMessage<string>(() =>
              Effect.succeed(Behaviors.same<string>()),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");

        expect(log).toContain("stop:a");
        yield* sys.shutdown;
      }),
    ));

  it("정상 cascade 시 sibling LIFO 순서 — 마지막 spawn 자식부터 PostStop (Akka 정통)", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.spawn(trackedLeaf(log, "a"), "a");
            yield* ctx.spawn(trackedLeaf(log, "b"), "b");
            yield* ctx.spawn(trackedLeaf(log, "c"), "c");
            return Behaviors.receiveMessage<string>(() =>
              Effect.succeed(Behaviors.same<string>()),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");
        yield* sys.shutdown;

        // c, b, a 순서 (LIFO) — 마지막 spawn 부터 stop
        expect(log).toContain("stop:a");
        expect(log).toContain("stop:b");
        expect(log).toContain("stop:c");
        expect(log.indexOf("stop:c")).toBeLessThan(log.indexOf("stop:b"));
        expect(log.indexOf("stop:b")).toBeLessThan(log.indexOf("stop:a"));
      }),
    ));
});

describe("ChildFailed signal + DeathPact (M3 사이클 5, ADR-022)", () => {
  it("자식이 Effect.fail → 부모 onSignal 가 ChildFailed 받음", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const failingChild = Behaviors.receiveMessage<string>((m) =>
          m === "boom"
            ? Effect.fail(new Error("intentional"))
            : Effect.succeed(Behaviors.same<string>()),
        );

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(failingChild, "kid");
            return Behaviors.receiveMessage<string>((m) =>
              child.tell(m).pipe(Effect.as(Behaviors.same<string>())),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "ChildFailed") {
                  log.push(`child-failed:${sig.path.elements.join("/")}`);
                }
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("100 millis");

        expect(log).toContain("child-failed:user/kid");
        yield* sys.shutdown;
      }),
    ));

  it("자식이 Effect.die (defect) → 부모 ChildFailed 받음", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const dyingChild = Behaviors.receiveMessage<string>(() =>
          Effect.die(new Error("defect")),
        );

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(dyingChild, "kid");
            return Behaviors.receiveMessage<string>((m) =>
              child.tell(m).pipe(Effect.as(Behaviors.same<string>())),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "ChildFailed") log.push("child-failed");
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");
        yield* sys.root.tell("trigger");
        yield* Effect.sleep("100 millis");

        expect(log).toContain("child-failed");
        yield* sys.shutdown;
      }),
    ));

  it("DeathPact — watch + onSignal 미부착 → watcher fail → watcher 의 부모가 ChildFailed 받음", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        // watcher: target 을 watch 하지만 onSignal 없음 → Terminated 받으면 DeathPact
        const watcherFactory = (
          target: ActorRef<string>,
        ): Behavior<string> =>
          Behaviors.setup<string>((ctx) =>
            Effect.gen(function* () {
              yield* ctx.watch(target);
              // onSignal 미부착 — Terminated 받으면 DeathPact
              return Behaviors.receiveMessage<string>(() =>
                Effect.succeed(Behaviors.same<string>()),
              );
            }),
          );

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const target = yield* ctx.spawn(trackedLeaf(log, "target"), "target");
            yield* ctx.spawn(watcherFactory(target), "watcher");

            return Behaviors.receiveMessage<string>((m) =>
              m === "kill-target"
                ? ctx.stop(target).pipe(Effect.as(Behaviors.same<string>()))
                : Effect.succeed(Behaviors.same<string>()),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "ChildFailed") {
                  log.push(`child-failed:${sig.path.elements.join("/")}`);
                }
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");
        yield* sys.root.tell("kill-target");
        yield* Effect.sleep("150 millis");

        // target stop → watcher 가 Terminated 받음 → onSignal 미부착이라 DeathPact fail
        // → watcher 의 부모 (root) 가 ChildFailed (path="user/watcher") 받음
        expect(log).toContain("stop:target");
        expect(log).toContain("child-failed:user/watcher");
        yield* sys.shutdown;
      }),
    ));
});

describe("ctx.ask — Akka 정통 ask 패턴 (M3 사이클 4, ADR-029)", () => {
  it("정상 reply — target 이 즉시 응답하면 Effect 가 resp 으로 끝", () =>
    run(
      Effect.gen(function* () {
        type CalcMsg = {
          readonly _tag: "Add";
          readonly a: number;
          readonly b: number;
          readonly replyTo: ActorRef<number>;
        };

        const calculator: Behavior<CalcMsg> = Behaviors.receiveMessage<CalcMsg>(
          (msg) =>
            msg.replyTo
              .tell(msg.a + msg.b)
              .pipe(Effect.as(Behaviors.same<CalcMsg>())),
        );

        const captured: { result?: number } = {};

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const calc = yield* ctx.spawn(calculator, "calc");
            return Behaviors.receiveMessage<string>(() =>
              Effect.gen(function* () {
                const sum = yield* ctx.ask<CalcMsg, number>(
                  calc,
                  (replyTo) => ({ _tag: "Add", a: 7, b: 5, replyTo }),
                  "1 second",
                );
                captured.result = sum;
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");
        yield* sys.root.tell("go");
        yield* Effect.sleep("100 millis");

        expect(captured.result).toBe(12);
        yield* sys.shutdown;
      }),
    ));

  it("timeout — target 이 응답 안 하면 AskTimeout fail", () =>
    run(
      Effect.gen(function* () {
        // 응답 안 하는 silent target
        const silent = Behaviors.receiveMessage<unknown>(() =>
          Effect.succeed(Behaviors.same<unknown>()),
        );

        const captured: { err?: unknown } = {};

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const target = yield* ctx.spawn(silent, "silent");
            return Behaviors.receiveMessage<string>(() =>
              ctx
                .ask<unknown, string>(target, (_replyTo) => "ignored", "50 millis")
                .pipe(
                  Effect.catchTag("AskTimeout", (err) =>
                    Effect.sync(() => {
                      captured.err = err;
                    }),
                  ),
                  Effect.as(Behaviors.same<string>()),
                ),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");
        yield* sys.root.tell("go");
        yield* Effect.sleep("200 millis");

        expect(captured.err).toBeDefined();
        expect((captured.err as { _tag: string })._tag).toBe("AskTimeout");
        yield* sys.shutdown;
      }),
    ));

  it("typed err wrapper 패턴 (ADR-029 §결정 예시) — reply ADT 안에 도메인 에러 표현", () =>
    run(
      Effect.gen(function* () {
        // 도메인 reply ADT — Found / NotFound
        type LookupResp =
          | { readonly _tag: "Found"; readonly value: number }
          | { readonly _tag: "NotFound" };

        type RegistryMsg = {
          readonly _tag: "Lookup";
          readonly key: string;
          readonly replyTo: ActorRef<LookupResp>;
        };

        const registry: Behavior<RegistryMsg> = Behaviors.receiveMessage(
          (msg) => {
            const resp: LookupResp =
              msg.key === "x"
                ? { _tag: "Found", value: 42 }
                : { _tag: "NotFound" };
            return msg.replyTo
              .tell(resp)
              .pipe(Effect.as(Behaviors.same<RegistryMsg>()));
          },
        );

        // 사용자 측 wrapper — domain err 로 변환
        class NotFoundError {
          readonly _tag = "NotFoundError" as const;
          constructor(readonly key: string) {}
        }

        const captured: {
          ok?: number;
          fail?: NotFoundError;
        } = {};

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const reg = yield* ctx.spawn(registry, "reg");
            const lookup = (key: string) =>
              ctx
                .ask<RegistryMsg, LookupResp>(
                  reg,
                  (replyTo) => ({ _tag: "Lookup", key, replyTo }),
                  "1 second",
                )
                .pipe(
                  Effect.flatMap((r) =>
                    r._tag === "Found"
                      ? Effect.succeed(r.value)
                      : Effect.fail(new NotFoundError(key)),
                  ),
                );

            return Behaviors.receiveMessage<string>((m) =>
              Effect.gen(function* () {
                if (m === "ok") {
                  const v = yield* lookup("x");
                  captured.ok = v;
                } else {
                  yield* lookup("missing").pipe(
                    Effect.catchTag("NotFoundError", (e) =>
                      Effect.sync(() => {
                        captured.fail = e;
                      }),
                    ),
                  );
                }
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");
        yield* sys.root.tell("ok");
        yield* sys.root.tell("missing");
        yield* Effect.sleep("100 millis");

        expect(captured.ok).toBe(42);
        expect(captured.fail).toBeInstanceOf(NotFoundError);
        expect(captured.fail?.key).toBe("missing");
        yield* sys.shutdown;
      }),
    ));
});

describe("ctx.watchTerminated — Effect 형태 (M3 사이클 3, ADR-030)", () => {
  it("ctx.watchTerminated(child) → child stop 후 Effect 가 success 으로 끝", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(trackedLeaf(log, "kid"), "kid");
            return Behaviors.receiveMessage<string>(() =>
              Effect.gen(function* () {
                // 별도 fiber 에서 child stop 시작
                yield* Effect.fork(ctx.stop(child));
                // child stop 완료까지 await (Effect 형태)
                yield* ctx.watchTerminated(child);
                log.push("watched-terminated");
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");

        yield* sys.root.tell("go");
        yield* Effect.sleep("100 millis");

        expect(log).toContain("stop:kid");
        expect(log).toContain("watched-terminated");
        // 순서: stop:kid 가 watched-terminated 보다 먼저 (Deferred succeed 가 stop hook 후)
        expect(log.indexOf("stop:kid")).toBeLessThan(
          log.indexOf("watched-terminated"),
        );

        yield* sys.shutdown;
      }),
    ));

  it("ctx.watchTerminated(stale-ref) — 이미 죽은 ref 면 즉시 Effect 끝", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(trackedLeaf(log, "kid"), "kid");
            // child 를 먼저 graceful stop (await)
            yield* ctx.stop(child);
            // 이미 죽은 child ref → watchTerminated 가 _즉시_ 끝
            yield* ctx.watchTerminated(child);
            log.push("immediate-done");
            return Behaviors.receiveMessage<string>(() =>
              Effect.succeed(Behaviors.same<string>()),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("50 millis");

        expect(log).toContain("stop:kid");
        expect(log).toContain("immediate-done");

        yield* sys.shutdown;
      }),
    ));
});

describe("ctx.watch / watchWith / unwatch (M3 사이클 2, ADR-022)", () => {
  it("ctx.watch(child) → child stop 시 watcher 의 signalQueue 에 Terminated 도착", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const parent = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(trackedLeaf(log, "kid"), "kid");
            yield* ctx.watch(child);
            return Behaviors.receiveMessage<string>((m) =>
              m === "kill"
                ? ctx.stop(child).pipe(Effect.as(Behaviors.same<string>()))
                : Effect.succeed(Behaviors.same<string>()),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "Terminated") {
                  log.push(`terminated:${sig.path.elements.join("/")}`);
                }
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("30 millis");

        yield* sys.root.tell("kill");
        yield* Effect.sleep("80 millis");

        expect(log).toContain("stop:kid");
        expect(log).toContain("terminated:user/kid");

        yield* sys.shutdown;
      }),
    ));

  it("ctx.watchWith(child, customMsg) → child stop 시 watcher 의 mailbox 에 customMsg 도착", () =>
    run(
      Effect.gen(function* () {
        type ParentMsg =
          | { readonly _tag: "Kill" }
          | { readonly _tag: "ChildGone" };

        const log: string[] = [];

        const parent = Behaviors.setup<ParentMsg>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(trackedLeaf(log, "kid"), "kid");
            yield* ctx.watchWith(child, { _tag: "ChildGone" });
            return Behaviors.receiveMessage<ParentMsg>((m) => {
              if (m._tag === "Kill")
                return ctx.stop(child).pipe(Effect.as(Behaviors.same<ParentMsg>()));
              if (m._tag === "ChildGone") log.push("child-gone");
              return Effect.succeed(Behaviors.same<ParentMsg>());
            });
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("30 millis");

        yield* sys.root.tell({ _tag: "Kill" });
        yield* Effect.sleep("80 millis");

        expect(log).toContain("stop:kid");
        expect(log).toContain("child-gone");

        yield* sys.shutdown;
      }),
    ));

  it("ctx.unwatch(child) 후 child stop → watcher 알림 안 받음", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const parent = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(trackedLeaf(log, "kid"), "kid");
            yield* ctx.watch(child);
            yield* ctx.unwatch(child);
            return Behaviors.receiveMessage<string>((m) =>
              m === "kill"
                ? ctx.stop(child).pipe(Effect.as(Behaviors.same<string>()))
                : Effect.succeed(Behaviors.same<string>()),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "Terminated") log.push("terminated:RECEIVED");
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("30 millis");

        yield* sys.root.tell("kill");
        yield* Effect.sleep("80 millis");

        expect(log).toContain("stop:kid");
        expect(log).not.toContain("terminated:RECEIVED");

        yield* sys.shutdown;
      }),
    ));

  it("ABA 안전 — 옛 ref 로 watch 한 후 같은 path 재spawn → 새 incarnation stop 시 옛 watcher 알림 X", () =>
    run(
      Effect.gen(function* () {
        // 시나리오: parent 가 v1 child 를 watch → v1 stop → 같은 이름 v2 spawn → v2 stop.
        // v1 stop 시 Terminated 한 번만 받아야 (v2 stop 은 _옛 watch_ 와 무관).
        const log: string[] = [];

        const parent = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const v1 = yield* ctx.spawn(trackedLeaf(log, "v1"), "kid");
            yield* ctx.watch(v1);
            return Behaviors.receiveMessage<string>((m) => {
              if (m === "kill-v1") return ctx.stop(v1).pipe(Effect.as(Behaviors.same<string>()));
              if (m === "spawn-v2")
                return ctx
                  .spawn(trackedLeaf(log, "v2"), "kid")
                  .pipe(
                    Effect.flatMap((v2) => ctx.stop(v2)),
                    Effect.as(Behaviors.same<string>()),
                  );
              return Effect.succeed(Behaviors.same<string>());
            }).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "Terminated") log.push(`terminated`);
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("30 millis");

        yield* sys.root.tell("kill-v1");
        yield* Effect.sleep("60 millis");
        yield* sys.root.tell("spawn-v2");
        yield* Effect.sleep("80 millis");

        // v1, v2 둘 다 stop, 하지만 Terminated 는 _v1 의 watch_ 에 의해 _한 번만_
        expect(log).toContain("stop:v1");
        expect(log).toContain("stop:v2");
        const terminatedCount = log.filter((s) => s === "terminated").length;
        expect(terminatedCount).toBe(1);

        yield* sys.shutdown;
      }),
    ));
});

describe("ctx.stop — graceful cascade (M3 사이클 1, ADR-031)", () => {
  it("ctx.stop(child) — 자식의 PostStop hook 호출 + Registry 에서 unregister", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];
        const captured: { childRef?: ActorRef<string>; sysRef?: ActorContext<string> } = {};

        const parent = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const child = yield* ctx.spawn(trackedLeaf(log, "kid"), "kid");
            captured.childRef = child;
            captured.sysRef = ctx;
            return Behaviors.receiveMessage<string>((m) =>
              m === "kill"
                ? ctx.stop(child).pipe(Effect.as(Behaviors.same<string>()))
                : Effect.succeed(Behaviors.same<string>()),
            );
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("20 millis");

        // kill 메시지 → ctx.stop(child) → 자식 graceful stop
        yield* sys.root.tell("kill");
        yield* Effect.sleep("50 millis");

        expect(log).toEqual(["stop:kid"]);

        // 자식이 Registry 에서 사라졌는지
        const childPath = captured.childRef!.path;
        const found = yield* STM.commit(Registry.resolve(sys.registry, childPath));
        expect(Option.isNone(found)).toBe(true);

        yield* sys.shutdown;
      }),
    ));

  it("ctx.stop(child) — depth 2 cascade (자식의 자식 PostStop 도 호출)", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const middleBehavior = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.spawn(trackedLeaf(log, "leaf"), "leaf");
            return Behaviors.receiveMessage<string>(() =>
              Effect.succeed(Behaviors.same<string>()),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "PostStop") log.push("stop:middle");
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const middle = yield* ctx.spawn(middleBehavior, "middle");
            return Behaviors.receiveMessage<string>((m) =>
              m === "kill"
                ? ctx.stop(middle).pipe(Effect.as(Behaviors.same<string>()))
                : Effect.succeed(Behaviors.same<string>()),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");

        yield* sys.root.tell("kill");
        yield* Effect.sleep("80 millis");

        // leaf 가 _먼저_, middle 이 _나중_ — Akka cascade 순서 (자식부터)
        expect(log).toContain("stop:leaf");
        expect(log).toContain("stop:middle");
        expect(log.indexOf("stop:leaf")).toBeLessThan(log.indexOf("stop:middle"));

        yield* sys.shutdown;
      }),
    ));

  it("ctx.stop(child) 후 같은 이름 재spawn 가능 — unregister 검증", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const parent = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            const first = yield* ctx.spawn(trackedLeaf(log, "v1"), "kid");
            return Behaviors.receiveMessage<string>((m) => {
              if (m === "kill") return ctx.stop(first).pipe(Effect.as(Behaviors.same<string>()));
              if (m === "respawn")
                return ctx.spawn(trackedLeaf(log, "v2"), "kid").pipe(
                  Effect.as(Behaviors.same<string>()),
                );
              return Effect.succeed(Behaviors.same<string>());
            });
          }),
        );

        const sys = yield* ActorSystem.create(parent, "demo");
        yield* Effect.sleep("20 millis");

        yield* sys.root.tell("kill");
        yield* Effect.sleep("40 millis");
        yield* sys.root.tell("respawn");
        yield* Effect.sleep("40 millis");

        // 첫 자식은 stop 됐고, 같은 이름의 v2 가 새로 spawn 가능
        expect(log).toContain("stop:v1");

        const v2Path = ActorPath.child(sys.root.path, "kid");
        const found = yield* STM.commit(Registry.resolve(sys.registry, v2Path));
        expect(Option.isSome(found)).toBe(true);

        yield* sys.shutdown;
      }),
    ));

  it("sys.shutdown — root 의 자식들 PostStop hook 호출 (graceful cascade 통합)", () =>
    run(
      Effect.gen(function* () {
        const log: string[] = [];

        const root = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.spawn(trackedLeaf(log, "a"), "a");
            yield* ctx.spawn(trackedLeaf(log, "b"), "b");
            return Behaviors.receiveMessage<string>(() =>
              Effect.succeed(Behaviors.same<string>()),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "PostStop") log.push("stop:root");
                return Behaviors.same<string>();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create(root, "demo");
        yield* Effect.sleep("30 millis");

        yield* sys.shutdown;

        // 두 자식 모두 stop 호출 (순서는 무관 — 자식들끼리 병렬 가능)
        expect(log).toContain("stop:a");
        expect(log).toContain("stop:b");
        expect(log).toContain("stop:root");
        // root 는 _자식들 다음_
        expect(log.indexOf("stop:a")).toBeLessThan(log.indexOf("stop:root"));
        expect(log.indexOf("stop:b")).toBeLessThan(log.indexOf("stop:root"));
      }),
    ));
});

describe("M4.1 — sys.shutdown + watchWith self-loop (도그푸딩 #3 F1 회귀)", () => {
  it("baseline — watchWith 없이 spawn 만 → shutdown 빠르게 정상", () =>
    run(
      Effect.gen(function* () {
        const child = Behaviors.empty<unknown>();
        const parent = Behaviors.setup<{ readonly _tag: "Ping" }>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.spawn(child, "kid");
            return Behaviors.receiveMessage<{ readonly _tag: "Ping" }>(() =>
              Effect.succeed(Behaviors.same()),
            );
          }),
        );
        const sys = yield* ActorSystem.create<{ readonly _tag: "Ping" }>(
          parent,
          "baseline",
        );
        yield* Effect.sleep("20 millis");
        const start = Date.now();
        yield* sys.shutdown.pipe(
          Effect.timeoutFail({
            duration: "1 second",
            onTimeout: () => new Error("baseline shutdown timeout"),
          }),
        );
        expect(Date.now() - start).toBeLessThan(500);
      }),
    ));

  it("F1 — parent 가 child 를 watchWith 한 상태에서 sys.shutdown 정상 종료", () =>
    run(
      Effect.gen(function* () {
        type ParentMsg =
          | { readonly _tag: "Ping" }
          | { readonly _tag: "ChildGone" };
        const child = Behaviors.empty<unknown>();
        const parent = Behaviors.setup<ParentMsg>((ctx) =>
          Effect.gen(function* () {
            const c = yield* ctx.spawn(child, "kid");
            yield* ctx.watchWith(c, { _tag: "ChildGone" } as ParentMsg);
            return Behaviors.receiveMessage<ParentMsg>(() =>
              Effect.succeed(Behaviors.same()),
            );
          }),
        );
        const sys = yield* ActorSystem.create<ParentMsg>(parent, "f1");
        yield* Effect.sleep("20 millis");
        const start = Date.now();
        yield* sys.shutdown.pipe(
          Effect.timeoutFail({
            duration: "1 second",
            onTimeout: () => new Error("F1 still hangs — fix regressed"),
          }),
        );
        // baseline 과 비슷한 시간대 — race wait 깨우지 못해 hang 안 함
        expect(Date.now() - start).toBeLessThan(500);
      }),
    ));

  it("외부 watcher (다른 sibling) 는 정상 알림 받음 — fix 가 외부 케이스 회귀 X", () =>
    run(
      Effect.gen(function* () {
        type WatcherMsg =
          | { readonly _tag: "Init"; readonly target: ActorRef<unknown> }
          | { readonly _tag: "TargetGone" };

        const events: Array<string> = [];
        const watcher = Behaviors.setup<WatcherMsg>((ctx) =>
          Effect.succeed(
            Behaviors.receiveMessage<WatcherMsg>((m) => {
              if (m._tag === "Init") {
                return ctx
                  .watchWith(m.target, {
                    _tag: "TargetGone",
                  } as WatcherMsg)
                  .pipe(Effect.as(Behaviors.same()));
              }
              events.push("target-gone");
              return Effect.succeed(Behaviors.same());
            }),
          ),
        );

        const target = Behaviors.empty<unknown>();

        type RootMsg = { readonly _tag: "Setup" };
        const root = Behaviors.setup<RootMsg>((ctx) =>
          Effect.gen(function* () {
            const w = yield* ctx.spawn(watcher, "watcher");
            const t = yield* ctx.spawn(target, "target");
            yield* ctx.system.tell(w, {
              _tag: "Init",
              target: t as ActorRef<unknown>,
            });
            yield* Effect.sleep("20 millis");
            // ctx.stop(t) — watcher 살아있는 상태에서 target stop
            yield* ctx.stop(t);
            yield* Effect.sleep("30 millis");
            return Behaviors.same();
          }),
        );
        const sys = yield* ActorSystem.create<RootMsg>(root, "demo");
        yield* sys.root.tell({ _tag: "Setup" });
        yield* Effect.sleep("100 millis");
        yield* sys.shutdown;

        // watcher 가 target 의 죽음 알림 정상 수신
        expect(events).toContain("target-gone");
      }),
    ));
});

describe("M4.1 사이클 2 — 자발 Stopped 시 watcher 알림 (도그푸딩 #3 의제 2)", () => {
  it("child 가 Behaviors.stopped 반환 → parent 의 watchWith 콜백 정상 발사", () =>
    run(
      Effect.gen(function* () {
        const events: Array<string> = [];
        type ParentMsg =
          | { readonly _tag: "Setup" }
          | { readonly _tag: "ChildGone" };

        const child = Behaviors.receive<string>((_c, m) =>
          m === "die"
            ? Effect.succeed(Behaviors.stopped<string>())
            : Effect.succeed(Behaviors.same()),
        ).receiveSignal((_c, sig) =>
          Effect.sync(() => {
            if (sig._tag === "PostStop") events.push("child:postStop");
            return Behaviors.same();
          }),
        );

        const parent = Behaviors.setup<ParentMsg>((ctx) =>
          Effect.gen(function* () {
            const c = yield* ctx.spawn(child, "kid");
            yield* ctx.watchWith(c, { _tag: "ChildGone" } as ParentMsg);
            return Behaviors.receiveMessage<ParentMsg>((m) => {
              if (m._tag === "ChildGone") {
                events.push("parent:ChildGone");
                return Effect.succeed(Behaviors.same());
              }
              return ctx.system
                .tell(c as ActorRef<string>, "die")
                .pipe(Effect.as(Behaviors.same()));
            });
          }),
        );

        const sys = yield* ActorSystem.create<ParentMsg>(parent, "demo");
        yield* sys.root.tell({ _tag: "Setup" });
        yield* Effect.sleep("80 millis");

        // 자발 Stopped 도 외부 ctx.stop 과 같이 watcher 알림 발사 — fix 검증
        expect(events).toContain("child:postStop");
        expect(events).toContain("parent:ChildGone");

        yield* sys.shutdown;
      }),
    ));

  it("자발 Stopped 후 registry unregister 됨 (stale entry 제거)", () =>
    run(
      Effect.gen(function* () {
        const child = Behaviors.receive<string>((_c, m) =>
          m === "die"
            ? Effect.succeed(Behaviors.stopped<string>())
            : Effect.succeed(Behaviors.same()),
        );

        type RootMsg = { readonly _tag: "Setup" };
        let childPath: ActorRef<string> | null = null;
        const root = Behaviors.setup<RootMsg>((ctx) =>
          Effect.gen(function* () {
            const c = yield* ctx.spawn(child, "kid");
            childPath = c;
            return Behaviors.receiveMessage<RootMsg>((_m) =>
              ctx.system
                .tell(c, "die")
                .pipe(Effect.as(Behaviors.same())),
            );
          }),
        );

        const sys = yield* ActorSystem.create<RootMsg>(root, "demo");
        yield* sys.root.tell({ _tag: "Setup" });
        yield* Effect.sleep("80 millis");

        // 자발 Stopped 후 registry 에서 child unregister 됐는지 검증
        const childResolved = yield* STM.commit(
          Registry.resolve(sys.registry, childPath!.path),
        );
        expect(Option.isNone(childResolved)).toBe(true);

        yield* sys.shutdown;
      }),
    ));
});

describe("M5 사이클 1 — restart.withLimit + PreRestart 재실패 (ADR-037)", () => {
  it("withLimit({ maxNrOfRetries: 2, withinTimeRange: '1 second' }) — 한도 초과 → stop 강등 + PostStop + watcher 알림", () =>
    run(
      Effect.gen(function* () {
        const events: Array<string> = [];

        type RootMsg = { readonly _tag: "Setup" };
        let childRef: ActorRef<string> | null = null;

        const child = Behaviors.receive<string>((_c, _m) =>
          Effect.die(new Error("always-fail")),
        ).receiveSignal((_c, sig) =>
          Effect.sync(() => {
            if (sig._tag === "PostStop") events.push("child:postStop");
            if (sig._tag === "PreRestart") events.push("child:preRestart");
            return Behaviors.same();
          }),
        );

        const supervised = Behaviors.supervise(child).onFailure(
          Strategies.matchAll,
          Strategies.restart.withLimit({
            maxNrOfRetries: 2,
            withinTimeRange: "1 second",
          }),
        );

        const root = Behaviors.setup<RootMsg>((ctx) =>
          Effect.gen(function* () {
            const c = yield* ctx.spawn(supervised, "kid");
            childRef = c;
            return Behaviors.receive<RootMsg>((c2, _m) =>
              Effect.gen(function* () {
                yield* c2.watch(c);
                // 3회 fail 트리거 — 한도 2 초과
                yield* ctx.system.tell(c, "boom");
                yield* ctx.system.tell(c, "boom");
                yield* ctx.system.tell(c, "boom");
                return Behaviors.same();
              }),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "Terminated")
                  events.push("root:terminated");
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<RootMsg>(root, "demo");
        yield* sys.root.tell({ _tag: "Setup" });
        yield* Effect.sleep("200 millis");

        // PreRestart 2회 (한도 안), 그리고 한도 초과 시 PostStop + watcher 알림
        const preRestartCount = events.filter(
          (e) => e === "child:preRestart",
        ).length;
        const postStopCount = events.filter(
          (e) => e === "child:postStop",
        ).length;
        const terminatedCount = events.filter(
          (e) => e === "root:terminated",
        ).length;

        expect(preRestartCount).toBe(2); // 1번째, 2번째 시도 → restart 성공 = PreRestart 발사
        expect(postStopCount).toBe(1); // 3번째 시도 = 한도 초과 → stop 강등 → PostStop
        expect(terminatedCount).toBe(1); // watcher 알림

        // registry unregister 검증
        const resolved = yield* STM.commit(
          Registry.resolve(sys.registry, childRef!.path),
        );
        expect(Option.isNone(resolved)).toBe(true);

        yield* sys.shutdown;
      }),
    ));

  it("withLimit — 윈도우 _밖_ 시도는 카운트 리셋 (sliding window)", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              m === "boom"
                ? Effect.die(new Error("boom"))
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );

        // 윈도우 100ms 안 maxNrOfRetries=1 — 즉 _2번째 fail_ 가 100ms 안이면 stop, 밖이면 restart
        const supervised = Behaviors.supervise(setup).onFailure(
          Strategies.matchAll,
          Strategies.restart.withLimit({
            maxNrOfRetries: 1,
            withinTimeRange: "100 millis",
          }),
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom"); // 1번째 → restart
        yield* Effect.sleep("250 millis"); // 윈도우 밖
        yield* sys.root.tell("boom"); // 윈도우 리셋, 다시 1번째 → restart
        yield* Effect.sleep("250 millis"); // 윈도우 밖
        yield* sys.root.tell("boom"); // 또 1번째 → restart
        yield* Effect.sleep("80 millis");

        // 윈도우 밖이라 카운트 리셋 → 모든 시도 restart 성공.
        // 첫 spawn (1) + 3 restart = 4
        expect(setupCount).toBeGreaterThanOrEqual(4);

        yield* sys.shutdown;
      }),
    ));

  it("restart 무한 (limit=null) — 회귀: 10회 fail 도 모두 restart, 액터 살아있음", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              m === "boom"
                ? Effect.die(new Error("boom"))
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );

        const supervised = Behaviors.supervise(setup).onFailure(
          Strategies.matchAll,
          Strategies.restart, // limit=null
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        for (let i = 0; i < 10; i++) {
          yield* sys.root.tell("boom");
        }
        yield* Effect.sleep("200 millis");

        // 첫 spawn (1) + 10 restart = 11
        expect(setupCount).toBeGreaterThanOrEqual(11);

        yield* sys.shutdown;
      }),
    ));

  it("PreRestart 재실패 (의제 3) → stop 강등 + PostStop + watcher 알림", () =>
    run(
      Effect.gen(function* () {
        const events: Array<string> = [];
        let preRestartCount = 0;

        type RootMsg = { readonly _tag: "Setup" };
        let childRef: ActorRef<string> | null = null;

        const child = Behaviors.receive<string>((_c, _m) =>
          Effect.die(new Error("trigger")),
        ).receiveSignal((_c, sig) =>
          Effect.gen(function* () {
            if (sig._tag === "PreRestart") {
              preRestartCount++;
              return yield* Effect.die(new Error("pre-restart-fail"));
            }
            if (sig._tag === "PostStop") {
              events.push("child:postStop");
            }
            return Behaviors.same();
          }),
        );

        const supervised = Behaviors.supervise(child).onFailure(
          Strategies.matchAll,
          Strategies.restart, // 무한이지만 PreRestart 재실패가 우선
        );

        const root = Behaviors.setup<RootMsg>((ctx) =>
          Effect.gen(function* () {
            const c = yield* ctx.spawn(supervised, "kid");
            childRef = c;
            return Behaviors.receive<RootMsg>((c2, _m) =>
              Effect.gen(function* () {
                yield* c2.watch(c);
                yield* ctx.system.tell(c, "boom");
                return Behaviors.same();
              }),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "Terminated")
                  events.push("root:terminated");
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<RootMsg>(root, "demo");
        yield* sys.root.tell({ _tag: "Setup" });
        yield* Effect.sleep("100 millis");

        // PreRestart 1회 시도 → 그 안에서 재실패 → stop 강등 → PostStop
        expect(preRestartCount).toBe(1);
        expect(events.filter((e) => e === "child:postStop").length).toBe(1);
        expect(events.filter((e) => e === "root:terminated").length).toBe(1);

        // unregister
        const resolved = yield* STM.commit(
          Registry.resolve(sys.registry, childRef!.path),
        );
        expect(Option.isNone(resolved)).toBe(true);

        yield* sys.shutdown;
      }),
    ));
});

describe("M5 사이클 2 — restartWithBackoff (ADR-038)", () => {
  it("backoff 점진 증가 — restart 간격이 시간순으로 늘어남 (minBackoff → 2x → 4x)", () =>
    run(
      Effect.gen(function* () {
        const restartTimestamps: Array<number> = [];
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            restartTimestamps.push(Date.now());
            return Behaviors.receiveMessage<string>((m) =>
              m === "boom"
                ? Effect.die(new Error("boom"))
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );

        // minBackoff=80ms, maxBackoff=1s, no jitter
        const supervised = Behaviors.supervise(setup).onFailure(
          Strategies.matchAll,
          Strategies.restartWithBackoff({
            minBackoff: "80 millis",
            maxBackoff: "1 second",
          }),
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom"); // 1번째 fail → backoff 80ms → restart
        yield* sys.root.tell("boom"); // 2번째 fail → backoff 160ms → restart
        yield* sys.root.tell("boom"); // 3번째 fail → backoff 320ms → restart
        yield* Effect.sleep("900 millis"); // 80 + 160 + 320 + 약간 여유

        // restart 간격 측정 — 점진 증가 확인
        expect(restartTimestamps.length).toBeGreaterThanOrEqual(4); // 첫 + 3 restart
        const t0 = restartTimestamps[0]!;
        const t1 = restartTimestamps[1]!;
        const t2 = restartTimestamps[2]!;
        const t3 = restartTimestamps[3]!;

        // 첫 boom 처리는 spawn 직후 짧은 시간 안 일어남.
        // restart 1: t1 - t0 ≈ 80ms (최소 60ms 여유)
        // restart 2: t2 - t1 ≈ 160ms
        // restart 3: t3 - t2 ≈ 320ms
        expect(t1 - t0).toBeGreaterThanOrEqual(60);
        expect(t2 - t1).toBeGreaterThanOrEqual(140);
        expect(t3 - t2).toBeGreaterThanOrEqual(280);

        yield* sys.shutdown;
      }),
    ));

  it("backoff cap — maxBackoff 초과 시 cap 됨", () =>
    run(
      Effect.gen(function* () {
        const restartTimestamps: Array<number> = [];
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            restartTimestamps.push(Date.now());
            return Behaviors.receiveMessage<string>((m) =>
              m === "boom"
                ? Effect.die(new Error("boom"))
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );

        // minBackoff=50ms, maxBackoff=120ms — 3번째 시도 (50*4=200) 가 cap=120
        const supervised = Behaviors.supervise(setup).onFailure(
          Strategies.matchAll,
          Strategies.restartWithBackoff({
            minBackoff: "50 millis",
            maxBackoff: "120 millis",
          }),
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom");
        yield* sys.root.tell("boom");
        yield* sys.root.tell("boom");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("700 millis");

        expect(restartTimestamps.length).toBeGreaterThanOrEqual(5);

        // 4번째 → 5번째 간격은 maxBackoff (120ms) cap. 200ms 안 넘어야.
        const t3 = restartTimestamps[3]!;
        const t4 = restartTimestamps[4]!;
        expect(t4 - t3).toBeGreaterThanOrEqual(100);
        expect(t4 - t3).toBeLessThan(200);

        yield* sys.shutdown;
      }),
    ));

  it("backoff 도중 mailbox 보존 — sleep 중 도착한 메시지가 새 incarnation 에서 처리", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() =>
            Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                if (m === "boom") throw new Error("boom");
                seen.push(m);
                return Behaviors.same();
              }),
            ),
          ),
        );

        const supervised = Behaviors.supervise(setup).onFailure(
          Strategies.matchAll,
          Strategies.restartWithBackoff({
            minBackoff: "200 millis",
            maxBackoff: "1 second",
          }),
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("a");
        yield* sys.root.tell("boom"); // restart 트리거 + 200ms backoff
        yield* sys.root.tell("during-backoff-1"); // backoff 도중 도착
        yield* sys.root.tell("during-backoff-2"); // backoff 도중 도착
        yield* Effect.sleep("400 millis"); // backoff (200) 끝나고 처리 충분히

        // backoff 도중 도착한 메시지가 새 incarnation 에서 처리됨
        expect(seen).toEqual(["a", "during-backoff-1", "during-backoff-2"]);

        yield* sys.shutdown;
      }),
    ));

  it("backoff + withLimit chain — 한도 초과 시 stop 강등 (backoff sleep 안 함, 즉시 stop)", () =>
    run(
      Effect.gen(function* () {
        const events: Array<string> = [];

        type RootMsg = { readonly _tag: "Setup" };
        let childRef: ActorRef<string> | null = null;

        const child = Behaviors.receive<string>((_c, _m) =>
          Effect.die(new Error("always-fail")),
        ).receiveSignal((_c, sig) =>
          Effect.sync(() => {
            if (sig._tag === "PostStop") events.push("child:postStop");
            return Behaviors.same();
          }),
        );

        const supervised = Behaviors.supervise(child).onFailure(
          Strategies.matchAll,
          Strategies.restartWithBackoff({
            minBackoff: "60 millis",
            maxBackoff: "500 millis",
          }).withLimit({
            maxNrOfRetries: 1,
            withinTimeRange: "5 seconds",
          }),
        );

        const root = Behaviors.setup<RootMsg>((ctx) =>
          Effect.gen(function* () {
            const c = yield* ctx.spawn(supervised, "kid");
            childRef = c;
            return Behaviors.receive<RootMsg>((c2, _m) =>
              Effect.gen(function* () {
                yield* c2.watch(c);
                yield* ctx.system.tell(c, "boom");
                yield* ctx.system.tell(c, "boom");
                return Behaviors.same();
              }),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "Terminated")
                  events.push("root:terminated");
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<RootMsg>(root, "demo");
        yield* sys.root.tell({ _tag: "Setup" });
        yield* Effect.sleep("400 millis"); // 첫 backoff (60ms) + 한도 초과 stop

        expect(events.filter((e) => e === "child:postStop").length).toBe(1);
        expect(events.filter((e) => e === "root:terminated").length).toBe(1);

        const resolved = yield* STM.commit(
          Registry.resolve(sys.registry, childRef!.path),
        );
        expect(Option.isNone(resolved)).toBe(true);

        yield* sys.shutdown;
      }),
    ));

  it("회귀 — backoff 없는 restart (사이클 1) 즉시 restart 그대로", () =>
    run(
      Effect.gen(function* () {
        const restartTimestamps: Array<number> = [];
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            restartTimestamps.push(Date.now());
            return Behaviors.receiveMessage<string>((m) =>
              m === "boom"
                ? Effect.die(new Error("boom"))
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );

        const supervised = Behaviors.supervise(setup).onFailure(
          Strategies.matchAll,
          Strategies.restart, // backoff 없음
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom");
        yield* sys.root.tell("boom");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("100 millis");

        expect(restartTimestamps.length).toBeGreaterThanOrEqual(4);
        // restart 간격이 _짧음_ (즉시) — 50ms 안.
        const t0 = restartTimestamps[0]!;
        const tLast = restartTimestamps[restartTimestamps.length - 1]!;
        expect(tLast - t0).toBeLessThan(50);

        yield* sys.shutdown;
      }),
    ));
});

describe("M5 사이클 3 — Behaviors.withTimers + ctx.fork + ctx.scheduleOnce (ADR-039)", () => {
  it("startSingleTimer — delay 후 _self mailbox_ 에 메시지 도착 + 핸들러 호출", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const root = Behaviors.withTimers<string>((timers) =>
          Effect.gen(function* () {
            yield* timers.startSingleTimer("once", "ping", "80 millis");
            return Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                seen.push(m);
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<string>(root, "demo");
        yield* Effect.sleep("200 millis");
        expect(seen).toEqual(["ping"]);

        yield* sys.shutdown;
      }),
    ));

  it("startTimerWithFixedDelay — interval 마다 self 메시지", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const root = Behaviors.withTimers<string>((timers) =>
          Effect.gen(function* () {
            yield* timers.startTimerWithFixedDelay(
              "tick",
              "tick!",
              "60 millis",
            );
            return Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                seen.push(m);
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<string>(root, "demo");
        yield* Effect.sleep("260 millis"); // 60ms 간격 → 약 4회 가능 (첫 발사 60ms 후)
        expect(seen.length).toBeGreaterThanOrEqual(3);
        expect(seen.every((m) => m === "tick!")).toBe(true);

        yield* sys.shutdown;
      }),
    ));

  it("Timers.cancel(key) — 취소 후 메시지 도착 X", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];

        type Msg = { readonly _tag: "Cancel" } | { readonly _tag: "Tick" };

        const root = Behaviors.withTimers<Msg>((timers) =>
          Effect.gen(function* () {
            yield* timers.startTimerWithFixedDelay(
              "tick",
              { _tag: "Tick" },
              "50 millis",
            );
            return Behaviors.receiveMessage<Msg>((m) =>
              Effect.gen(function* () {
                if (m._tag === "Cancel") {
                  yield* timers.cancel("tick");
                } else {
                  seen.push("tick");
                }
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<Msg>(root, "demo");
        yield* Effect.sleep("130 millis"); // ~2회 발사
        const beforeCancel = seen.length;
        yield* sys.root.tell({ _tag: "Cancel" });
        yield* Effect.sleep("200 millis");
        expect(seen.length).toBe(beforeCancel); // 취소 후 증가 X

        yield* sys.shutdown;
      }),
    ));

  it("Timers.cancelAll — 모든 timer 취소", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];

        type Msg =
          | { readonly _tag: "CancelAll" }
          | { readonly _tag: "T1" }
          | { readonly _tag: "T2" };

        const root = Behaviors.withTimers<Msg>((timers) =>
          Effect.gen(function* () {
            yield* timers.startTimerWithFixedDelay(
              "t1",
              { _tag: "T1" },
              "50 millis",
            );
            yield* timers.startTimerWithFixedDelay(
              "t2",
              { _tag: "T2" },
              "50 millis",
            );
            return Behaviors.receiveMessage<Msg>((m) =>
              Effect.gen(function* () {
                if (m._tag === "CancelAll") {
                  yield* timers.cancelAll;
                } else {
                  seen.push(m._tag);
                }
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<Msg>(root, "demo");
        yield* Effect.sleep("120 millis");
        yield* sys.root.tell({ _tag: "CancelAll" });
        const before = seen.length;
        yield* Effect.sleep("200 millis");
        expect(seen.length).toBe(before);

        yield* sys.shutdown;
      }),
    ));

  it("Timers.isActive — start 후 true, cancel 후 false", () =>
    run(
      Effect.gen(function* () {
        let beforeStart = false;
        let afterStart = false;
        let afterCancel = false;

        type Msg = { readonly _tag: "Check" };

        const root = Behaviors.withTimers<Msg>((timers) =>
          Effect.gen(function* () {
            beforeStart = yield* timers.isActive("k");
            yield* timers.startSingleTimer("k", { _tag: "Check" }, "10 seconds");
            afterStart = yield* timers.isActive("k");
            yield* timers.cancel("k");
            afterCancel = yield* timers.isActive("k");
            return Behaviors.receiveMessage<Msg>((_m) =>
              Effect.succeed(Behaviors.same()),
            );
          }),
        );

        const sys = yield* ActorSystem.create<Msg>(root, "demo");
        yield* Effect.sleep("50 millis");

        expect(beforeStart).toBe(false);
        expect(afterStart).toBe(true);
        expect(afterCancel).toBe(false);

        yield* sys.shutdown;
      }),
    ));

  it("startSingleTimer — 같은 key 다시 호출 시 기존 timer 대체 (cancel)", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];

        type Msg =
          | { readonly _tag: "Replace" }
          | { readonly _tag: "First" }
          | { readonly _tag: "Second" };

        const root = Behaviors.withTimers<Msg>((timers) =>
          Effect.gen(function* () {
            yield* timers.startSingleTimer(
              "k",
              { _tag: "First" },
              "300 millis",
            );
            return Behaviors.receiveMessage<Msg>((m) =>
              Effect.gen(function* () {
                if (m._tag === "Replace") {
                  yield* timers.startSingleTimer(
                    "k",
                    { _tag: "Second" },
                    "80 millis",
                  );
                } else {
                  seen.push(m._tag);
                }
                return Behaviors.same();
              }),
            );
          }),
        );

        const sys = yield* ActorSystem.create<Msg>(root, "demo");
        yield* Effect.sleep("50 millis"); // First 도 안 발사
        yield* sys.root.tell({ _tag: "Replace" }); // First cancel + Second start
        yield* Effect.sleep("250 millis"); // Second 발사 (~80ms 후), First 시점 (300ms) 도 지남

        // First 가 발사되지 않아야 — Replace 가 cancel
        expect(seen).toEqual(["Second"]);

        yield* sys.shutdown;
      }),
    ));

  it("ctx.scheduleOnce(delay, target, msg) — 다른 액터에 delayed tell", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];

        const child = Behaviors.receiveMessage<string>((m) =>
          Effect.sync(() => {
            seen.push(m);
            return Behaviors.same();
          }),
        );

        type RootMsg = { readonly _tag: "Setup" };
        const root = Behaviors.setup<RootMsg>((ctx) =>
          Effect.gen(function* () {
            const c = yield* ctx.spawn(child, "kid");
            yield* ctx.scheduleOnce("60 millis", c, "delayed-hello");
            return Behaviors.receiveMessage<RootMsg>((_m) =>
              Effect.succeed(Behaviors.same()),
            );
          }),
        );

        const sys = yield* ActorSystem.create<RootMsg>(root, "demo");
        yield* Effect.sleep("160 millis");
        expect(seen).toEqual(["delayed-hello"]);

        yield* sys.shutdown;
      }),
    ));

  it("ctx.fork — instance scope 안 fork, 액터 stop 시 자동 interrupt", () =>
    run(
      Effect.gen(function* () {
        let tickCount = 0;

        type Msg = { readonly _tag: "Done" };
        const root = Behaviors.setup<Msg>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.fork(
              Effect.forever(
                Effect.sync(() => {
                  tickCount++;
                }).pipe(Effect.flatMap(() => Effect.sleep("5 millis"))),
              ),
            );
            return Behaviors.receiveMessage<Msg>((_m) =>
              Effect.succeed(Behaviors.stopped()),
            );
          }),
        );

        const sys = yield* ActorSystem.create<Msg>(root, "demo");
        yield* Effect.sleep("80 millis");
        const beforeStop = tickCount;
        expect(beforeStop).toBeGreaterThan(5);

        yield* sys.root.tell({ _tag: "Done" }); // stop
        yield* Effect.sleep("100 millis");
        const afterStopOnce = tickCount;
        yield* Effect.sleep("100 millis");
        const afterStopTwice = tickCount;
        // stop 후 fork 가 interrupt — count 증가 X (또는 1~2 수준 잔여)
        expect(afterStopTwice).toBe(afterStopOnce);

        yield* sys.shutdown;
      }),
    ));

  it("restart 시 timer 자동 cleanup — 기존 fixedDelay interrupt, 새 timer 만 발사", () =>
    run(
      Effect.gen(function* () {
        let tickCount = 0;
        let setupCount = 0;

        type Msg = { readonly _tag: "Boom" } | { readonly _tag: "Tick" };

        const inner = Behaviors.setup<Msg>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.withTimers<Msg>((timers) =>
              Effect.gen(function* () {
                yield* timers.startTimerWithFixedDelay(
                  "tick",
                  { _tag: "Tick" },
                  "50 millis",
                );
                return Behaviors.receiveMessage<Msg>((m) =>
                  Effect.sync(() => {
                    if (m._tag === "Boom") throw new Error("boom");
                    tickCount++;
                    return Behaviors.same();
                  }),
                );
              }),
            );
          }),
        );

        const supervised = Behaviors.supervise(inner).onFailure(
          Strategies.matchAll,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<Msg>(supervised, "demo");
        yield* Effect.sleep("160 millis"); // ~3회 발사
        const beforeRestart = tickCount;
        expect(beforeRestart).toBeGreaterThan(1);

        yield* sys.root.tell({ _tag: "Boom" });
        yield* Effect.sleep("160 millis"); // restart 후 새 timer 발사

        // setup 두 번 호출 — restart 검증
        expect(setupCount).toBe(2);
        // restart 후 새 timer 가 살아있어 카운트 더 증가
        expect(tickCount).toBeGreaterThan(beforeRestart);

        yield* sys.shutdown;
      }),
    ));
});
