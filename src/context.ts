// ActorContext — 사이클 2 placeholder. 사이클 3 에서 self / log / spawn 등 채움.
// 사이클 2 의 receive / setup 빌더가 핸들러 시그니처에서 _참조_ 만 함.

export interface ActorContext<Msg> {
  // 사이클 3: self, system, log, spawn, watch, stop, scheduleOnce
  readonly _msg?: Msg; // phantom — Msg 의 variance 강제
}
