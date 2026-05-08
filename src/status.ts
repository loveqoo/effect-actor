// 액터 인스턴스의 lifecycle 상태 (ADR-017 — TRef 로 추적)
export type ActorStatus = "running" | "restarting" | "stopped";

export const ActorStatus = {
  running: "running" as const satisfies ActorStatus,
  restarting: "restarting" as const satisfies ActorStatus,
  stopped: "stopped" as const satisfies ActorStatus,
};
