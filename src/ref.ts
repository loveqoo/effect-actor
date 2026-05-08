import { Equal } from "effect";
import type { Cell } from "./mailbox.js";
import type { ActorPath } from "./path.js";
import { ActorPath as ActorPathNs } from "./path.js";
import { WatchKey } from "./signal.js";

// 사이클 1 단계의 ActorSystem placeholder.
// 실제 ActorSystem (사이클 4) 가 이 인터페이스를 만족하도록 만들어진다.
export interface ActorSystemHandle {
  readonly name: string;
}

// ActorRef — _stable identity_ + cell 직접 보유 (ADR-016, ADR-019).
// (path, uid) 가 identity. cell 은 같은 entry 의 ref 면 동일.
// tell / narrowUnsafe 메서드는 사이클 4 (system dispatch) 에서 부착.
export interface ActorRef<in out Msg> {
  readonly path: ActorPath;
  readonly uid: string;
  readonly cell: Cell<Msg>;
  readonly system: ActorSystemHandle;
}

const make = <Msg>(args: {
  readonly path: ActorPath;
  readonly uid: string;
  readonly cell: Cell<Msg>;
  readonly system: ActorSystemHandle;
}): ActorRef<Msg> => ({
  path: args.path,
  uid: args.uid,
  cell: args.cell,
  system: args.system,
});

// (path, uid) 만으로 동일성 판정 — cell/system 의 reference 비교 X.
const equals = <Msg>(a: ActorRef<Msg>, b: ActorRef<Msg>): boolean =>
  Equal.equals(WatchKey.make(a.path, a.uid), WatchKey.make(b.path, b.uid));

const toString = <Msg>(ref: ActorRef<Msg>): string =>
  `${ActorPathNs.toString(ref.path)}#${ref.uid}`;

const watchKey = <Msg>(ref: ActorRef<Msg>): WatchKey =>
  WatchKey.make(ref.path, ref.uid);

export const ActorRef = {
  make,
  equals,
  toString,
  watchKey,
};
