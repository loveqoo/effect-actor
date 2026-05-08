import { Effect, Option, STM, TMap } from "effect";
import type { ActorEntry } from "./entry.js";
import type { ActorPath } from "./path.js";
import { ActorPath as ActorPathNs } from "./path.js";

// Registry — 시스템 단위 단일 진실원 (ADR-017).
// path 직렬화를 키로 — Equal/Hash 비용 회피, 디버그 출력 직관.
// entry 의 generic 은 unknown 으로 erase — 시스템 단계에서 호출자가 다시 좁힘.
export interface Registry {
  readonly map: TMap.TMap<string, ActorEntry<unknown>>;
}

const make = (): Effect.Effect<Registry> =>
  STM.commit(TMap.empty<string, ActorEntry<unknown>>()).pipe(
    Effect.map((map) => ({ map })),
  );

const register = <Msg>(
  registry: Registry,
  entry: ActorEntry<Msg>,
): STM.STM<void> =>
  TMap.set(
    registry.map,
    ActorPathNs.toString(entry.path),
    entry as ActorEntry<unknown>,
  );

const resolve = <Msg = unknown>(
  registry: Registry,
  path: ActorPath,
): STM.STM<Option.Option<ActorEntry<Msg>>> =>
  TMap.get(registry.map, ActorPathNs.toString(path)).pipe(
    STM.map(
      (opt) => opt as Option.Option<ActorEntry<Msg>>,
    ),
  );

const unregister = (registry: Registry, path: ActorPath): STM.STM<void> =>
  TMap.remove(registry.map, ActorPathNs.toString(path));

const has = (registry: Registry, path: ActorPath): STM.STM<boolean> =>
  TMap.has(registry.map, ActorPathNs.toString(path));

const size = (registry: Registry): STM.STM<number> => TMap.size(registry.map);

export const Registry = {
  make,
  register,
  resolve,
  unregister,
  has,
  size,
};
