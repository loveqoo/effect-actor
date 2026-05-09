import { Effect, HashMap, Option, STM, TRef } from "effect";
import type { ActorEntry } from "./entry.js";
import type { ActorPath } from "./path.js";
import { ActorPath as ActorPathNs } from "./path.js";

// Registry — 시스템 단위 단일 진실원 (ADR-017).
// path 직렬화를 키로 — Equal/Hash 비용 회피, 디버그 출력 직관.
// entry 의 generic 은 unknown 으로 erase — 시스템 단계에서 호출자가 다시 좁힘.
//
// 구현 노트: Effect 3.21.2 의 TMap.remove/removeAll 가 partition 술어 인자 자리를
// 잘못 고른 버그(line 308/328: entry[1] 또는 toRetain 사용)가 있어 hash 충돌이 난
// 같은 bucket 의 다른 엔트리까지 한꺼번에 사라진다. Registry 키들이 공통 prefix
// (`actor://<system>/...`) 를 공유해 충돌이 흔하므로, TRef<HashMap> 으로 우회.
// upstream issue: https://github.com/Effect-TS/effect/issues/6225
// 복원 조건: 위 issue fix 가 release 되면 TMap 직접 사용으로 swap 가능.
export interface Registry {
  readonly map: TRef.TRef<HashMap.HashMap<string, ActorEntry<unknown>>>;
}

const make = (): Effect.Effect<Registry> =>
  STM.commit(TRef.make(HashMap.empty<string, ActorEntry<unknown>>())).pipe(
    Effect.map((map) => ({ map })),
  );

const register = <Msg>(
  registry: Registry,
  entry: ActorEntry<Msg>,
): STM.STM<void> =>
  TRef.update(registry.map, (m) =>
    HashMap.set(
      m,
      ActorPathNs.toString(entry.path),
      entry as ActorEntry<unknown>,
    ),
  );

const resolve = <Msg = unknown>(
  registry: Registry,
  path: ActorPath,
): STM.STM<Option.Option<ActorEntry<Msg>>> =>
  TRef.get(registry.map).pipe(
    STM.map(
      (m) =>
        HashMap.get(m, ActorPathNs.toString(path)) as Option.Option<
          ActorEntry<Msg>
        >,
    ),
  );

const unregister = (registry: Registry, path: ActorPath): STM.STM<void> =>
  TRef.update(registry.map, (m) =>
    HashMap.remove(m, ActorPathNs.toString(path)),
  );

const has = (registry: Registry, path: ActorPath): STM.STM<boolean> =>
  TRef.get(registry.map).pipe(
    STM.map((m) => HashMap.has(m, ActorPathNs.toString(path))),
  );

const size = (registry: Registry): STM.STM<number> =>
  TRef.get(registry.map).pipe(STM.map((m) => HashMap.size(m)));

export const Registry = {
  make,
  register,
  resolve,
  unregister,
  has,
  size,
};
