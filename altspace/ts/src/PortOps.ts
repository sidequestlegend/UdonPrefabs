// Port helper (no upstream file): relay ops this game needs that portkit's HostActions cannot send.
//
// The README lets a game add relay ops of its own (KitBuilder.RelayOps on the Unity side), but the ts runtime gives
// behaviours no way to send one: HostActions has a fixed list of methods. Until it does, this file reaches the
// runtime's relay host directly (its batching sender, `event`, which exists at run time but is private in the
// types). That is the smallest local workaround; PORT.md lists it as a runtime gap.
//
// Ops (the Unity side's KitBuilder.RelayOps must implement them; provisional until the kit builder exists):
//   cup|@<anchorPath>|<name>|<on 1/0>|<lx>|<ly>|<lz>|<scale>|<r>|<g>|<b>
//       create (or move and recolour) the cup copy <anchorPath>/<name> from the template `[ThryBP]glass`, at that
//       local position and uniform scale, colour on material slot 0 of its three LOD renderers; on = 0 destroys it
//   cupInside|@<cupPath>|<1/0>      1: the throw collider off and the inner box colliders on (ball in the cup)
//   ballPhys|<ballRef>|rest         rigidbody kinematic, velocity zero (the page then sets its pose)
//   ballPhys|<ballRef>|fly|px|py|pz|vx|vy|vz   dynamic, gravity on, at that world position with that velocity
//   uiSetToggle|<ref>|<1/0>|<notify 1/0>       Toggle.isOn (notify 0: SetIsOnWithoutNotify)
//   uiSetSlider|<ref>|<value>       Slider.SetValueWithoutNotify
//   scale|@|<s>                     the kit root's uniform local scale (table size)
//   audioVolume|<ref>|<v>           AudioSource.volume

import { relayNumber, type HostActions } from "../portkit/src/index.ts";

interface EventSender {
  event(op: string, target: string, args: string[]): void;
}

const lastValues = new WeakMap<HostActions, Map<string, string>>();

/** Sends one record of a game op, batched with the rest of the tick's relay traffic. */
export function SendOp(host: HostActions, op: string, target: string, args: Array<string | number>): void {
  const sender = host as unknown as Partial<EventSender>;
  if (typeof sender.event !== "function") return;
  sender.event(op, target, args.map((a) => (typeof a === "number" ? relayNumber(a) : a)));
}

/** Sends a value-like op only when it differs from what was last sent for that op and target. */
export function SendValueOp(host: HostActions, op: string, target: string, args: Array<string | number>): void {
  let last = lastValues.get(host);
  if (!last) lastValues.set(host, (last = new Map()));
  const text = args.map((a) => (typeof a === "number" ? relayNumber(a) : a)).join("|");
  const slot = `${op}/${target}`;
  if (last.get(slot) === text) return;
  last.set(slot, text);
  SendOp(host, op, target, args);
}

/** Records a value the control already shows (a player just changed it), so that it is not sent back. */
export function RememberValueOp(host: HostActions, op: string, target: string, args: Array<string | number>): void {
  let last = lastValues.get(host);
  if (!last) lastValues.set(host, (last = new Map()));
  last.set(`${op}/${target}`, args.map((a) => (typeof a === "number" ? relayNumber(a) : a)).join("|"));
}

/** The game ops this file defines: the tests tell the fake room's graph (which does not know them) apart by name. */
export const GAME_OPS = ["cup", "cupInside", "ballPhys", "uiSetToggle", "uiSetSlider", "scale", "audioVolume"];
