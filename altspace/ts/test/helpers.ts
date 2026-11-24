// Test helpers: players at a beer pong table in the fake room, doing what a player does (grab the ball, let go,
// click panel controls), and the kit's ball graph reporting what the owner's physics saw (bpRelease, bpContact).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Vector3 } from "../portkit/src/index.ts";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import { TestWorld } from "../portkit/src/testing.ts";
import type { Ball } from "../src/Ball.ts";
import type { CupsManager } from "../src/CupsManager.ts";
import type { Game } from "../src/Game.ts";
import game from "../src/index.ts";
import type { Player } from "../src/Player.ts";
import { GAME_OPS } from "../src/PortOps.ts";

export const bindings = JSON.parse(readFileSync(fileURLToPath(new URL("../bindings.json", import.meta.url)), "utf8"));
export const SLUG = game.slug;
export { game };

export function newWorld(seed = 1): TestWorld {
  return new TestWorld(game, bindings, { seed });
}

export const G = (w: TestWorld, c: FakeClient, inst = "0") => w.behaviour<Game>(c, "game", inst);
export const CM = (w: TestWorld, c: FakeClient, side: number, inst = "0") => w.behaviour<CupsManager>(c, `cm${side}`, inst);
export const P = (w: TestWorld, c: FakeClient, side: number, inst = "0") => w.behaviour<Player>(c, `p${side}`, inst);
export const B = (w: TestWorld, c: FakeClient, i = 0, inst = "0") => w.behaviour<Ball>(c, `ball${i}`, inst);

/** Everyone has started, and a fresh table's first writes have reached the room. */
export async function settle(world: TestWorld, inst = "0"): Promise<void> {
  await world.settle(inst);
  await world.run(2500);
}

/** Error lines and graph complaints, without the fake graph's "unknown op" notes for this game's own ops. */
export function problems(world: TestWorld): string[] {
  return world.problems().filter((line) => !GAME_OPS.some((op) => line.endsWith(`graph: unknown op ${op}`)));
}

/** The cup copies one client's kit holds, as `<anchor path>/<name>`, from the `cup` ops its graph received. */
export function kitCups(c: FakeClient, inst = "0"): Set<string> {
  const cups = new Set<string>();
  for (const record of c.graph(SLUG, inst).records) {
    if (record.op !== "cup") continue;
    const path = `${record.target.slice(1)}/${record.args[0]}`;
    if (record.args[1] === "1") cups.add(path);
    else cups.delete(path);
  }
  return cups;
}

/** A VR throw: grab the ball, let go; the ball graph reports the release velocity. */
export async function throwBall(world: TestWorld, c: FakeClient, ballIndex = 0, inst = "0", velocity = new Vector3(0, 1.5, 2.5)): Promise<void> {
  assert.ok(c.grab(SLUG, inst, `ball${ballIndex}`), `${c.name} cannot grab ball ${ballIndex}`);
  await world.run(300);
  c.graphEvent(SLUG, inst, "bpRelease", `${ballIndex}|${velocity.x}|${velocity.y}|${velocity.z}|0`);
  c.drop(SLUG, inst, `ball${ballIndex}`);
  await world.run(250);
}

/**
 * What every client's ball graph reports when the ball lands: straight down onto the middle of cup `index` of `side`
 * (or, with `name`, onto something else). Every client reports; only the owner acts on it.
 */
export function contact(world: TestWorld, clients: FakeClient[], from: FakeClient, opts: { ball?: number; side?: number; index?: number; name?: string; own?: boolean; offset?: number; inst?: string }): void {
  const inst = opts.inst ?? "0";
  const ball = opts.ball ?? 0;
  let args: string;
  if (opts.name !== undefined) {
    args = `${ball}|${opts.name}|${opts.own === false ? 0 : 1}|0|0.9|0|0|-2|0`;
  } else {
    const cup = CM(world, from, opts.side!, inst).CupAtIndex(opts.index!);
    assert.ok(cup, `${from.name}: no cup ${opts.index} on side ${opts.side}`);
    const p = cup.position;
    const top = p.y + cup.GlobalHeight;
    const off = opts.offset ?? 0;
    args = `${ball}|${cup.name}|${opts.own === false ? 0 : 1}|${p.x + off}|${top + 0.03}|${p.z}|0|-3|0|${p.x}|${p.y}|${p.z}|${top}`;
  }
  for (const c of clients) c.graphEvent(SLUG, inst, "bpContact", args);
}

/** One full turn that lands in a cup: throw, contact, and the 2 s until the cup goes and the ball respawns. */
export async function hit(world: TestWorld, thrower: FakeClient, side: number, index: number, inst = "0", ball = 0): Promise<void> {
  await throwBall(world, thrower, ball, inst);
  contact(world, world.clients, thrower, { ball, side, index, inst });
  await world.run(3000);
}

/** One full turn that misses (the ball touches something that is not the game's). */
export async function miss(world: TestWorld, thrower: FakeClient, inst = "0", ball = 0): Promise<void> {
  await throwBall(world, thrower, ball, inst);
  contact(world, world.clients, thrower, { ball, name: "Floor", own: false, inst });
  await world.run(1000);
}

/** The indices of the cups a rack holds. */
export function cupIndices(m: CupsManager): number[] {
  const out: number[] = [];
  m._cupOwnersAtPositions.forEach((v, i) => {
    if (v !== 255) out.push(i);
  });
  return out;
}

/** Clicks a panel button (uiButton through the relay graph). */
export async function pressButton(world: TestWorld, c: FakeClient, key: string, inst = "0"): Promise<void> {
  c.graphEvent(SLUG, inst, "uiButton", refIndex(key));
  await world.run(1000);
}

export async function setToggle(world: TestWorld, c: FakeClient, key: string, on: boolean, inst = "0"): Promise<void> {
  c.graphEvent(SLUG, inst, "uiToggle", `${refIndex(key)}|${on ? 1 : 0}`);
  await world.run(1000);
}

export async function setSlider(world: TestWorld, c: FakeClient, key: string, value: number, inst = "0"): Promise<void> {
  c.graphEvent(SLUG, inst, "uiSlider", `${refIndex(key)}|${value}`);
  await world.run(1000);
}

export function refIndex(key: string): string {
  const i = (bindings.refs as string[]).indexOf(key);
  assert.ok(i >= 0, `${key} is not in refs`);
  return String(i);
}

/** The last value a game op set on a target, on one client (uiSetToggle / uiSetSlider). */
export function lastOp(c: FakeClient, op: string, key: string, inst = "0"): string[] | undefined {
  const target = refIndex(key);
  const records = c.graph(SLUG, inst).records.filter((r) => r.op === op && r.target === target);
  return records.length ? records[records.length - 1]!.args : undefined;
}
