import { describe, it, expect } from "vitest";
import { Cause, Effect } from "effect";
import { Behaviors, unwrapMeta } from "../src/behavior.js";
import { DeathPactException } from "../src/errors.js";
import { MailboxPolicy } from "../src/mailbox.js";
import { ActorPath } from "../src/path.js";
import { pickStrategy, Strategies } from "../src/supervision.js";
import { ActorSystem } from "../src/system.js";

const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

describe("Strategy ADT (ADR-034)", () => {
  it("Strategies.resume / restart / stop 은 _고정 참조_ 의 ADT 값", () => {
    expect(Strategies.resume._tag).toBe("Resume");
    expect(Strategies.restart._tag).toBe("Restart");
    expect(Strategies.stop._tag).toBe("Stop");

    // 참조 동일성 — 종결자 같은 패턴 (Behaviors.same 등)
    expect(Strategies.resume).toBe(Strategies.resume);
    expect(Strategies.restart).toBe(Strategies.restart);
    expect(Strategies.stop).toBe(Strategies.stop);
  });
});

describe("Behaviors.supervise 빌더 (ADR-034)", () => {
  it("supervise(inner) 는 _Supervise_ 래퍼 + 빈 rules + onFailure 메서드", () => {
    const inner = Behaviors.same<string>();
    const wrapped = Behaviors.supervise(inner);

    expect(wrapped._tag).toBe("Supervise");
    expect(wrapped.inner).toBe(inner);
    expect(wrapped.rules.length).toBe(0);
    expect(typeof wrapped.onFailure).toBe("function");
  });

  it("onFailure(matcher, strategy) 는 _새 Supervise_ 반환 (불변), rules 에 _뒤에 append_", () => {
    const inner = Behaviors.same<string>();
    const matcher = (_e: unknown) => true;

    const base = Behaviors.supervise(inner);
    const withRule = base.onFailure(matcher, Strategies.restart);

    // 원본은 그대로 — 불변
    expect(base.rules.length).toBe(0);

    // 새 객체는 inner 보존 + rules 채움
    expect(withRule._tag).toBe("Supervise");
    expect(withRule.inner).toBe(inner);
    expect(withRule.rules.length).toBe(1);
    expect(withRule.rules[0]?.match).toBe(matcher);
    expect(withRule.rules[0]?.strategy).toBe(Strategies.restart);
  });

  it("연쇄 onFailure — _체인 순서_ 가 rules 순서 (가장 안쪽 = 첫 호출 = 가장 specific)", () => {
    const inner = Behaviors.same<string>();
    const m1 = (_e: unknown) => true;
    const m2 = (_e: unknown) => true;
    const m3 = (_e: unknown) => true;

    const b = Behaviors.supervise(inner)
      .onFailure(m1, Strategies.restart)
      .onFailure(m2, Strategies.resume)
      .onFailure(m3, Strategies.stop);

    expect(b.rules.length).toBe(3);
    expect(b.rules[0]?.match).toBe(m1);
    expect(b.rules[0]?.strategy).toBe(Strategies.restart);
    expect(b.rules[1]?.match).toBe(m2);
    expect(b.rules[1]?.strategy).toBe(Strategies.resume);
    expect(b.rules[2]?.match).toBe(m3);
    expect(b.rules[2]?.strategy).toBe(Strategies.stop);
  });
});

describe("unwrapMeta — Supervise 추출 (ADR-034)", () => {
  it("Supervise 래퍼 없으면 supervisor 는 빈 배열 (기본)", () => {
    const meta = unwrapMeta(Behaviors.same<string>());
    expect(meta.supervisor.length).toBe(0);
  });

  it("Supervise 한 겹 — rules 추출 + inner 는 _안쪽_ 그대로", () => {
    const inner = Behaviors.receive<string>(() =>
      Effect.succeed(Behaviors.same()),
    );
    const wrapped = Behaviors.supervise(inner).onFailure(
      () => true,
      Strategies.restart,
    );
    const meta = unwrapMeta(wrapped);

    expect(meta.supervisor.length).toBe(1);
    expect(meta.supervisor[0]?.strategy).toBe(Strategies.restart);
    expect(meta.inner).toBe(inner);
    // 기본 mailbox
    expect(meta.mailboxPolicy._tag).toBe("Unbounded");
  });

  it("중첩 Supervise — 가장 바깥 채택 (ADR-026 정신 유지)", () => {
    const innerMost = Behaviors.same<string>();
    const innerSup = Behaviors.supervise(innerMost).onFailure(
      () => true,
      Strategies.resume,
    );
    const outerSup = Behaviors.supervise(innerSup).onFailure(
      () => true,
      Strategies.restart,
    );
    const meta = unwrapMeta(outerSup);

    expect(meta.supervisor.length).toBe(1);
    expect(meta.supervisor[0]?.strategy).toBe(Strategies.restart);
    // 안쪽 Supervise 는 inner 그대로
    expect(meta.inner).toBe(innerSup);
  });

  it("WithMailbox(Supervise(b)) — 양쪽 모두 추출, inner 는 _두 겹 다 벗긴_ 안쪽", () => {
    const inner = Behaviors.receive<string>(() =>
      Effect.succeed(Behaviors.same()),
    );
    const sup = Behaviors.supervise(inner).onFailure(
      () => true,
      Strategies.restart,
    );
    const policy = MailboxPolicy.bounded(8, "drop");
    const wrapped = Behaviors.withMailbox(sup, policy);

    const meta = unwrapMeta(wrapped);
    expect(meta.mailboxPolicy).toBe(policy);
    expect(meta.supervisor.length).toBe(1);
    expect(meta.supervisor[0]?.strategy).toBe(Strategies.restart);
    expect(meta.inner).toBe(inner);
  });

  it("Supervise(WithMailbox(b)) — 양쪽 모두 추출 (반대 순서도 같음)", () => {
    const inner = Behaviors.receive<string>(() =>
      Effect.succeed(Behaviors.same()),
    );
    const policy = MailboxPolicy.bounded(8, "backpressure");
    const wm = Behaviors.withMailbox(inner, policy);
    const wrapped = Behaviors.supervise(wm).onFailure(
      () => true,
      Strategies.resume,
    );

    const meta = unwrapMeta(wrapped);
    expect(meta.mailboxPolicy).toBe(policy);
    expect(meta.supervisor.length).toBe(1);
    expect(meta.supervisor[0]?.strategy).toBe(Strategies.resume);
    expect(meta.inner).toBe(inner);
  });

  it("WithMailbox(Supervise(WithMailbox(b))) — 안쪽 WithMailbox 는 _가장 바깥_ 규칙으로 무시 (inner 안에 갇힘)", () => {
    const innerMost = Behaviors.same<string>();
    const innerWm = Behaviors.withMailbox(
      innerMost,
      MailboxPolicy.bounded(1, "drop"),
    );
    const sup = Behaviors.supervise(innerWm).onFailure(
      () => true,
      Strategies.restart,
    );
    const outerPolicy = MailboxPolicy.bounded(64, "backpressure");
    const wrapped = Behaviors.withMailbox(sup, outerPolicy);

    const meta = unwrapMeta(wrapped);
    expect(meta.mailboxPolicy).toBe(outerPolicy); // 가장 바깥
    expect(meta.supervisor.length).toBe(1);
    // inner 는 안쪽 WithMailbox _그대로_ — 두 번 같은 종류 안 벗김
    expect(meta.inner).toBe(innerWm);
  });
});

describe("pickStrategy — cause 분기 (사이클 2)", () => {
  it("빈 rules → 기본 Stop", () => {
    const cause = Cause.fail(new Error("any"));
    expect(pickStrategy([], cause)).toBe(Strategies.stop);
  });

  it("매치 rule → 그 strategy 채택", () => {
    const cause = Cause.fail(new Error("boom"));
    const rules = [{ match: (_e: unknown) => true, strategy: Strategies.resume }];
    expect(pickStrategy(rules, cause)).toBe(Strategies.resume);
  });

  it("미매치 → 기본 Stop", () => {
    const cause = Cause.fail("string-err");
    const rules = [
      {
        match: (e: unknown) => e instanceof TypeError,
        strategy: Strategies.resume,
      },
    ];
    expect(pickStrategy(rules, cause)).toBe(Strategies.stop);
  });

  it("sequential 순회 — 첫 매치 채택 (가장 안쪽 = 첫 호출 = 가장 specific)", () => {
    const cause = Cause.fail(new TypeError("specific"));
    const rules = [
      {
        match: (e: unknown) => e instanceof TypeError,
        strategy: Strategies.resume,
      },
      { match: (_e: unknown) => true, strategy: Strategies.restart },
    ];
    // TypeError 매치 → Resume (Restart 까지 안 감)
    expect(pickStrategy(rules, cause)).toBe(Strategies.resume);
  });

  it("defect (Effect.die) 도 cause.defects 에서 추출", () => {
    const cause = Cause.die(new Error("defect-boom"));
    const rules = [
      {
        match: (e: unknown) => e instanceof Error,
        strategy: Strategies.resume,
      },
    ];
    expect(pickStrategy(rules, cause)).toBe(Strategies.resume);
  });
});

describe("Strategies.resume 통합 — 액터 동작 (사이클 2)", () => {
  it("supervise + Resume 매처 — 메시지 처리 중 throw → 다음 메시지 정상 처리, 액터 살아있음", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const inner = Behaviors.receiveMessage<string>((m) =>
          Effect.sync(() => {
            if (m === "boom") throw new Error("boom!");
            seen.push(m);
            return Behaviors.same<string>();
          }),
        );
        const supervised = Behaviors.supervise(inner).onFailure(
          (e) => e instanceof Error,
          Strategies.resume,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("a");
        yield* sys.root.tell("boom"); // throw → resume → 무시
        yield* sys.root.tell("b");
        yield* Effect.sleep("50 millis");

        expect(seen).toEqual(["a", "b"]);

        yield* sys.shutdown;
      }),
    ));

  it("supervise 미매치 → 기본 Stop (액터 종료)", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const inner = Behaviors.receiveMessage<string>((m) =>
          Effect.sync(() => {
            if (m === "boom") throw new TypeError("type-err");
            seen.push(m);
            return Behaviors.same<string>();
          }),
        );
        // matcher 가 RangeError 만 잡음 — TypeError 미매치 → 기본 stop
        const supervised = Behaviors.supervise(inner).onFailure(
          (e) => e instanceof RangeError,
          Strategies.resume,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("a");
        yield* sys.root.tell("boom"); // 종료
        yield* sys.root.tell("b"); // best-effort dead-letter (액터 죽음)
        yield* Effect.sleep("50 millis");

        // a 는 처리됨, b 는 도달 X (액터 stop)
        expect(seen).toEqual(["a"]);

        yield* sys.shutdown;
      }),
    ));

  it("supervise 안 함 (raw behavior) → 기본 Stop (현재 default 회귀 보호)", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const inner = Behaviors.receiveMessage<string>((m) =>
          Effect.sync(() => {
            if (m === "boom") throw new Error("boom");
            seen.push(m);
            return Behaviors.same<string>();
          }),
        );

        const sys = yield* ActorSystem.create<string>(inner, "demo");
        yield* sys.root.tell("a");
        yield* sys.root.tell("boom");
        yield* sys.root.tell("b");
        yield* Effect.sleep("50 millis");

        expect(seen).toEqual(["a"]);

        yield* sys.shutdown;
      }),
    ));

  it("Resume — defect (Effect.die) 도 잡힘", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<number> = [];
        const inner = Behaviors.receiveMessage<number>((n) =>
          n === 0
            ? Effect.die(new Error("defect"))
            : Effect.sync(() => {
                seen.push(n);
                return Behaviors.same<number>();
              }),
        );
        const supervised = Behaviors.supervise(inner).onFailure(
          () => true,
          Strategies.resume,
        );

        const sys = yield* ActorSystem.create<number>(supervised, "demo");
        yield* sys.root.tell(1);
        yield* sys.root.tell(0); // die → resume → 무시
        yield* sys.root.tell(2);
        yield* Effect.sleep("50 millis");

        expect(seen).toEqual([1, 2]);

        yield* sys.shutdown;
      }),
    ));

  it("Resume — 여러 번 fail 도 모두 흡수, 액터 살아있음", () =>
    run(
      Effect.gen(function* () {
        let okCount = 0;
        const inner = Behaviors.receiveMessage<string>((m) =>
          Effect.sync(() => {
            if (m === "fail") throw new Error("fail");
            okCount++;
            return Behaviors.same<string>();
          }),
        );
        const supervised = Behaviors.supervise(inner).onFailure(
          () => true,
          Strategies.resume,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        for (let i = 0; i < 5; i++) {
          yield* sys.root.tell("fail");
          yield* sys.root.tell("ok");
        }
        yield* Effect.sleep("80 millis");

        expect(okCount).toBe(5);

        yield* sys.shutdown;
      }),
    ));
});

describe("Strategies.restart 통합 — 액터 재시작 (사이클 3, ADR-020/035)", () => {
  it("Restart — Setup 재실행 (counter 증가) + ref 안정", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                if (m === "boom") throw new Error("boom");
                return Behaviors.same();
              }),
            );
          }),
        );
        const supervised = Behaviors.supervise(setup).onFailure(
          () => true,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        const refBefore = sys.root;
        const uidBefore = refBefore.uid;

        yield* sys.root.tell("boom"); // restart
        yield* Effect.sleep("50 millis");
        yield* sys.root.tell("boom"); // restart 2
        yield* Effect.sleep("50 millis");

        expect(setupCount).toBeGreaterThanOrEqual(3); // 첫 spawn + 2 restart
        // ref / uid 안정 (인스턴스 동일)
        expect(sys.root).toBe(refBefore);
        expect(sys.root.uid).toBe(uidBefore);

        yield* sys.shutdown;
      }),
    ));

  it("Restart — mailbox 보존: restart 도중 들어온 메시지가 새 Behavior 에서 처리", () =>
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
          () => true,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        // boom + after — boom 이 restart 트리거, after 는 mailbox 에 쌓였다가 새 Behavior 로
        yield* sys.root.tell("a");
        yield* sys.root.tell("boom");
        yield* sys.root.tell("after");
        yield* Effect.sleep("80 millis");

        expect(seen).toEqual(["a", "after"]);

        yield* sys.shutdown;
      }),
    ));

  it("Restart — PreRestart 신호가 _현재 Behavior_ 의 onSignal 로 호출 (ADR-020)", () =>
    run(
      Effect.gen(function* () {
        let preRestartCount = 0;
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() =>
            Behaviors.receive<string>((_c, m) =>
              Effect.sync(() => {
                if (m === "boom") throw new Error("boom");
                return Behaviors.same();
              }),
            ).receiveSignal((_c, sig) =>
              Effect.sync(() => {
                if (sig._tag === "PreRestart") preRestartCount++;
                return Behaviors.same();
              }),
            ),
          ),
        );
        const supervised = Behaviors.supervise(setup).onFailure(
          () => true,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("50 millis");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("50 millis");

        expect(preRestartCount).toBe(2);

        yield* sys.shutdown;
      }),
    ));

  it("Restart — 자식 cascade stop (자식 PostStop 호출 + children 비워짐)", () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];

        const childBehavior = Behaviors.receive<string>((_c, _m) =>
          Effect.succeed(Behaviors.same()),
        ).receiveSignal((_c, sig) =>
          Effect.sync(() => {
            if (sig._tag === "PostStop") seen.push("child-poststop");
            return Behaviors.same();
          }),
        );

        const setup = Behaviors.setup<string>((ctx) =>
          Effect.gen(function* () {
            yield* ctx.spawn(childBehavior, "kid");
            return Behaviors.receive<string>((_c, m) =>
              Effect.sync(() => {
                if (m === "boom") throw new Error("boom");
                return Behaviors.same();
              }),
            );
          }),
        );
        const supervised = Behaviors.supervise(setup).onFailure(
          () => true,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom"); // restart → 자식 stop → 새 Setup → 새 자식
        yield* Effect.sleep("80 millis");

        expect(seen).toEqual(["child-poststop"]); // 한 번 stop

        yield* sys.shutdown;
        // shutdown 시 새 자식도 PostStop
        expect(seen.length).toBe(2);
      }),
    ));

  it("Restart 매처 미매치 → 기본 stop (회귀)", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const seen: Array<string> = [];
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                if (m === "boom") throw new TypeError("type");
                seen.push(m);
                return Behaviors.same();
              }),
            );
          }),
        );
        // RangeError 만 잡음 → TypeError 미매치
        const supervised = Behaviors.supervise(setup).onFailure(
          (e) => e instanceof RangeError,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("a");
        yield* sys.root.tell("boom"); // 미매치 → stop
        yield* sys.root.tell("after"); // 액터 죽음, dead-letter
        yield* Effect.sleep("60 millis");

        expect(setupCount).toBe(1); // restart 안 됨
        expect(seen).toEqual(["a"]);

        yield* sys.shutdown;
      }),
    ));

  it("Restart — 여러 번 안정적으로 반복", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const setup = Behaviors.setup<number>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<number>((n) =>
              n === 0
                ? Effect.die(new Error("zero"))
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );
        const supervised = Behaviors.supervise(setup).onFailure(
          () => true,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<number>(supervised, "demo");
        for (let i = 0; i < 5; i++) {
          yield* sys.root.tell(0); // restart
          yield* sys.root.tell(1); // ok
        }
        yield* Effect.sleep("100 millis");

        // 첫 spawn (1) + 5 restart = 6
        expect(setupCount).toBeGreaterThanOrEqual(6);

        yield* sys.shutdown;
      }),
    ));
});

describe("매처 헬퍼 (사이클 4, ADR-036)", () => {
  it("Strategies.matchInstance — class instanceof 매칭", () => {
    const m = Strategies.matchInstance(TypeError);
    expect(m(new TypeError("x"))).toBe(true);
    expect(m(new RangeError("x"))).toBe(false);
    expect(m("string")).toBe(false);
    expect(m(null)).toBe(false);
  });

  it("Strategies.matchInstance — Error base class 도 매칭 (subtype 포함)", () => {
    const m = Strategies.matchInstance(Error);
    expect(m(new TypeError("x"))).toBe(true);
    expect(m(new Error("x"))).toBe(true);
    expect(m({ message: "x" })).toBe(false);
  });

  it("Strategies.matchTag — _tag 필드 매칭 (Effect.TaggedError / Data.tagged 호환)", () => {
    const m = Strategies.matchTag("DeathPactException");
    expect(m({ _tag: "DeathPactException", path: "x" })).toBe(true);
    expect(m({ _tag: "Other" })).toBe(false);
    expect(m({})).toBe(false);
    expect(m("string")).toBe(false);
    expect(m(null)).toBe(false);
  });

  it("Strategies.matchAll — 무조건 true (catch-all)", () => {
    expect(Strategies.matchAll(new Error())).toBe(true);
    expect(Strategies.matchAll("any")).toBe(true);
    expect(Strategies.matchAll(undefined)).toBe(true);
    expect(Strategies.matchAll(null)).toBe(true);
  });
});

describe("매처 chain 분기 통합 (사이클 4)", () => {
  it("Akka 모양 — IllegalState → restart, IO → resume, catch-all → stop", () =>
    run(
      Effect.gen(function* () {
        // 도메인 에러 정의 (instanceof 매칭용)
        class IllegalStateException extends Error {}
        class IOException extends Error {}

        let setupCount = 0;
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                if (m === "illegal") throw new IllegalStateException();
                if (m === "io") throw new IOException();
                if (m === "other") throw new RangeError("other");
                return Behaviors.same();
              }),
            );
          }),
        );

        const supervised = Behaviors.supervise(setup)
          .onFailure(
            Strategies.matchInstance(IllegalStateException),
            Strategies.restart,
          )
          .onFailure(
            Strategies.matchInstance(IOException),
            Strategies.resume,
          )
          .onFailure(Strategies.matchAll, Strategies.stop);

        const sys = yield* ActorSystem.create<string>(supervised, "demo");

        // illegal → restart (setupCount 증가)
        yield* sys.root.tell("illegal");
        yield* Effect.sleep("40 millis");
        const afterRestart = setupCount;
        expect(afterRestart).toBeGreaterThanOrEqual(2); // 첫 spawn + 1 restart

        // io → resume (setupCount 변화 X, 액터 살아있음)
        yield* sys.root.tell("io");
        yield* Effect.sleep("40 millis");
        expect(setupCount).toBe(afterRestart);

        // 살아있음 검증 — 정상 메시지 처리
        yield* sys.root.tell("ok");
        yield* Effect.sleep("40 millis");
        expect(setupCount).toBe(afterRestart);

        // other → stop (catch-all). 액터 종료.
        yield* sys.root.tell("other");
        yield* Effect.sleep("40 millis");
        // 더 이상 처리 안 됨
        yield* sys.root.tell("ok"); // dead-letter
        yield* Effect.sleep("40 millis");
        expect(setupCount).toBe(afterRestart); // restart 안 됨 (stop 강등)

        yield* sys.shutdown;
      }),
    ));

  it("순회 순서 — 가장 안쪽 (먼저 호출) 이 가장 specific. 첫 매치 채택", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const seen: Array<string> = [];
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                if (m === "boom") throw new TypeError("specific");
                seen.push(m);
                return Behaviors.same();
              }),
            );
          }),
        );

        // 첫 onFailure: TypeError 매치 → resume (specific)
        // 둘째 onFailure: catch-all → restart
        // TypeError fail 시 _첫_ 매치 (resume) 채택. restart 까지 안 감.
        const supervised = Behaviors.supervise(setup)
          .onFailure(
            Strategies.matchInstance(TypeError),
            Strategies.resume,
          )
          .onFailure(Strategies.matchAll, Strategies.restart);

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("a");
        yield* sys.root.tell("boom"); // resume — restart 안 됨
        yield* sys.root.tell("b");
        yield* Effect.sleep("60 millis");

        expect(setupCount).toBe(1); // restart 안 됨 = setup 한 번만
        expect(seen).toEqual(["a", "b"]);

        yield* sys.shutdown;
      }),
    ));

  it("matchTag — DeathPactException 매처 + restart 분기 (Tagged 에러 _tag)", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const inner = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              m === "deathpact"
                ? Effect.die(
                    new DeathPactException({
                      self: ActorPath.root("demo"),
                      terminated: ActorPath.root("demo"),
                      terminatedUid: "u",
                    }),
                  )
                : Effect.succeed(Behaviors.same()),
            );
          }),
        );

        const supervised = Behaviors.supervise(inner).onFailure(
          Strategies.matchTag("DeathPactException"),
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("deathpact");
        yield* Effect.sleep("60 millis");
        yield* sys.root.tell("deathpact");
        yield* Effect.sleep("60 millis");

        expect(setupCount).toBeGreaterThanOrEqual(3); // 첫 spawn + 2 restart

        yield* sys.shutdown;
      }),
    ));

  it("미매치 chain — 모든 매처 false → 기본 stop (회귀)", () =>
    run(
      Effect.gen(function* () {
        let setupCount = 0;
        const setup = Behaviors.setup<string>((_ctx) =>
          Effect.sync(() => {
            setupCount++;
            return Behaviors.receiveMessage<string>((m) =>
              Effect.sync(() => {
                if (m === "boom") throw new TypeError("type");
                return Behaviors.same();
              }),
            );
          }),
        );
        // RangeError + ReferenceError 만 잡음 → TypeError 미매치
        const supervised = Behaviors.supervise(setup)
          .onFailure(
            Strategies.matchInstance(RangeError),
            Strategies.restart,
          )
          .onFailure(
            Strategies.matchInstance(ReferenceError),
            Strategies.resume,
          );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("40 millis");

        expect(setupCount).toBe(1); // restart 안 됨 = stop

        yield* sys.shutdown;
      }),
    ));
});

describe("M4.1 사이클 2 — supervisor stop 강등 시 PostStop hook (도그푸딩 #3 의제 1)", () => {
  it("supervise + matchAll → stop 으로 child fail → PostStop hook 호출됨", () =>
    run(
      Effect.gen(function* () {
        const events: Array<string> = [];
        const inner = Behaviors.receive<string>((_c, _m) =>
          Effect.die(new Error("trigger")),
        ).receiveSignal((_c, sig) =>
          Effect.sync(() => {
            if (sig._tag === "PostStop") events.push("postStop");
            return Behaviors.same();
          }),
        );

        const supervised = Behaviors.supervise(inner).onFailure(
          Strategies.matchAll,
          Strategies.stop,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("60 millis");

        // supervisor stop 강등도 자발 Stopped 와 같이 PostStop hook 호출 — fix 검증
        expect(events).toEqual(["postStop"]);

        yield* sys.shutdown;
      }),
    ));

  it("supervise 매처 미매치 → 기본 stop 도 PostStop hook 호출 (회귀)", () =>
    run(
      Effect.gen(function* () {
        const events: Array<string> = [];
        const inner = Behaviors.receive<string>((_c, _m) =>
          Effect.die(new TypeError("type")),
        ).receiveSignal((_c, sig) =>
          Effect.sync(() => {
            if (sig._tag === "PostStop") events.push("postStop");
            return Behaviors.same();
          }),
        );

        // RangeError 만 잡음 → TypeError 미매치 → 기본 stop
        const supervised = Behaviors.supervise(inner).onFailure(
          (e) => e instanceof RangeError,
          Strategies.restart,
        );

        const sys = yield* ActorSystem.create<string>(supervised, "demo");
        yield* sys.root.tell("boom");
        yield* Effect.sleep("60 millis");

        expect(events).toEqual(["postStop"]);

        yield* sys.shutdown;
      }),
    ));
});
