import { Effect, Equal } from "effect";
import type { Cell } from "./mailbox.js";
import type { ActorPath } from "./path.js";
import { ActorPath as ActorPathNs } from "./path.js";
import { WatchKey } from "./signal.js";

// ActorSystem 의 _internal 표면_ — ActorRef 의 tell 이 위임할 곳.
// 사이클 4 에서 dispatch 메서드 추가 (이전 사이클 1 은 name 만).
export interface ActorSystemHandle {
  readonly name: string;
  readonly tell: <Msg>(ref: ActorRef<Msg>, msg: Msg) => Effect.Effect<void>;
}

// ActorRef — _stable identity_ + cell 직접 보유 (ADR-016, ADR-019).
// (path, uid) 가 identity. cell 은 같은 entry 의 ref 면 동일.
export class ActorRef<in out Msg> {
  constructor(
    readonly path: ActorPath,
    readonly uid: string,
    readonly cell: Cell<Msg>,
    readonly system: ActorSystemHandle,
  ) {}

  // Fire-and-forget — best-effort delivery (ADR-019).
  // STM uid + status 검증은 system.tell 안에서. 사용자 표면은 method 호출 한 줄.
  tell(msg: Msg): Effect.Effect<void> {
    return this.system.tell(this, msg);
  }

  // 정적 helper — 사이클 1 호환 + 새 사용처.
  static make<Msg>(args: {
    readonly path: ActorPath;
    readonly uid: string;
    readonly cell: Cell<Msg>;
    readonly system: ActorSystemHandle;
  }): ActorRef<Msg> {
    return new ActorRef(args.path, args.uid, args.cell, args.system);
  }

  // (path, uid) 만으로 동일성 판정 — cell/system 의 reference 비교 X.
  static equals<Msg>(a: ActorRef<Msg>, b: ActorRef<Msg>): boolean {
    return Equal.equals(
      WatchKey.make(a.path, a.uid),
      WatchKey.make(b.path, b.uid),
    );
  }

  static toString<Msg>(ref: ActorRef<Msg>): string {
    return `${ActorPathNs.toString(ref.path)}#${ref.uid}`;
  }

  static watchKey<Msg>(ref: ActorRef<Msg>): WatchKey {
    return WatchKey.make(ref.path, ref.uid);
  }
}
