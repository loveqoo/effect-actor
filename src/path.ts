import { Data, Option } from "effect";

export interface ActorPath {
  readonly system: string;
  readonly elements: ReadonlyArray<string>;
}

const make = (system: string, elements: ReadonlyArray<string>): ActorPath =>
  Data.struct({ system, elements: Data.array([...elements]) });

const root = (system: string): ActorPath => make(system, ["user"]);

const child = (parent: ActorPath, name: string): ActorPath =>
  make(parent.system, [...parent.elements, name]);

const parent = (path: ActorPath): Option.Option<ActorPath> =>
  path.elements.length <= 1
    ? Option.none()
    : Option.some(make(path.system, path.elements.slice(0, -1)));

const toString = (path: ActorPath): string =>
  `actor://${path.system}/${path.elements.join("/")}`;

const SCHEME = /^actor:\/\/([^/]+)\/(.+)$/;

const parse = (s: string): Option.Option<ActorPath> => {
  const m = SCHEME.exec(s);
  if (m === null) return Option.none();
  const sys = m[1];
  const tail = m[2];
  if (sys === undefined || tail === undefined || tail === "") return Option.none();
  return Option.some(make(sys, tail.split("/")));
};

const isAncestorOf = (ancestor: ActorPath, descendant: ActorPath): boolean => {
  if (ancestor.system !== descendant.system) return false;
  if (ancestor.elements.length >= descendant.elements.length) return false;
  return ancestor.elements.every(
    (seg: string, i: number) => descendant.elements[i] === seg,
  );
};

export const ActorPath = {
  make,
  root,
  child,
  parent,
  toString,
  parse,
  isAncestorOf,
};
