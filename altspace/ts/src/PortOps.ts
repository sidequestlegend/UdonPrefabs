// Port helper (no upstream file): the kit's relay ops as beer pong uses them.
//
// Everything goes through the runtime's relay host (`this.Host`), batched with the rest of the tick. Standard ops
// (portkit README op table): `spawn` / `despawn` for cup copies, `rbKinematic` / `rbVelocity` for the ball,
// `uiSetToggle` / `uiSetSlider` for the panels, `audioVolume`, `particles`, `color`, `animBool`, `text`, `active`.
// The table's size is the Game object's own transform (a bound object, so the page scales it).
//
// Game ops (BeerPongKitBuilder.RelayOps adds them to the relay graph; tests declare them with room.defineRelayOp):
//   cupPlace|@<cupPath>|<lx>|<ly>|<lz>|<scale>|<r>|<g>|<b>
//       the copy's local position under its rack anchor, its uniform local scale, and the colour of material slot 0
//       of its three LOD renderers (children named Glass_LOD*: Cup.cs:45-51)
//   cupInside|@<cupPath>|<1/0>
//       1: the cup's throw collider (the MeshCollider on the copy) off and its inner box colliders on (the ball is in
//       the cup, Ball.cs:172-173); 0: the other way round

import type { Color, HostActions, Vector3 } from "../portkit/src/index.ts";

/** The inactive copy of `[ThryBP]glass` the kit builder puts under every rack anchor; `spawn` copies it. */
export const CUP_TEMPLATE = "CupTemplate";

/** The game's own relay ops (the tests declare them to the fake room's graph). */
export const GAME_OPS = ["cupPlace", "cupInside"] as const;

/** Places and colours a cup copy (a value: sent only when it changed since the copy was spawned). */
export function CupPlace(host: HostActions, path: string, local: Vector3, scale: number, color: Color): void {
  host.op("cupPlace", path, [local.x, local.y, local.z, scale, color.r, color.g, color.b], "place");
}

/** Switches a cup copy between its throw collider and its inner colliders. */
export function CupInside(host: HostActions, path: string, inside: boolean): void {
  host.op("cupInside", path, [inside], "inside");
}
