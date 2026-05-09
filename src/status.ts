// 액터 인스턴스의 lifecycle 상태 (ADR-017 — TRef 로 추적)
// M∞.1 사이클 4 (ADR-045): stopping 추가 — Akka 의 _Terminated = 완전히 끝_ semantics 보존.
// running   — 정상 동작. tell 받음, watch 등록 받음.
// restarting — (예약, 미사용)
// stopping  — ctx.stop / shutdown 진입, cleanup 진행 중. tell 거부, watch 등록 _가능_
//             (onSelfTermination 의 atomic STM tx 가 watchers 스냅샷 + stopped 전환 한 번에).
// stopped   — onSelfTermination 끝, registry unregister 후. watch 등록 시 즉시 alreadyGone.
export type ActorStatus = "running" | "restarting" | "stopping" | "stopped";

export const ActorStatus = {
  running: "running" as const satisfies ActorStatus,
  restarting: "restarting" as const satisfies ActorStatus,
  stopping: "stopping" as const satisfies ActorStatus,
  stopped: "stopped" as const satisfies ActorStatus,
};
