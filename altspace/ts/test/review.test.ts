// Tests added with the review fixes (REVIEW-FINDINGS.md, beer-pong): each failed before its fix. Same fake room and
// helpers as scenarios.test.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "../portkit/src/index.ts";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import { BallState, type Ball } from "../src/Ball.ts";
import type { Cup } from "../src/Cup.ts";
import { GameMode, LAUNCH_GAP } from "../src/Game.ts";
import {
  B, bindings, CM, contact, cupIndices, G, game, hit, kitCups, miss, newWorld, P, problems, refIndex, setSlider, setToggle, settle, SLUG, throwBall,
} from "./helpers.ts";

/** The client whose page owns (simulates) a ball. */
function ownerOf(world: ReturnType<typeof newWorld>, ball: (c: FakeClient) => Ball): FakeClient {
  const name = world.instance(world.clients[0]!).networking.GetOwner(ball(world.clients[0]!))?.displayName;
  const owner = world.clients.find((c) => c.name === name);
  assert.ok(owner, `nobody owns the ball (${name})`);
  return owner;
}

// ---- finding 2: two hits on one rack at the same moment both remove their cup ----

for (const gap of [0, 100, 300]) {
  test(`King of the Hill: two balls land in one tier ${gap} ms apart: both cups go, on every client`, async () => {
    const world = newWorld(21);
    const el = [{ mode: "king", players: "2" }];
    const ann = world.join({ name: "Ann", elements: el });
    const bob = world.join({ name: "Bob", elements: el });
    await settle(world);
    // Bob's page takes ball 1 over first (a throw that misses), as a second thrower would
    await throwBall(world, bob, 1);
    await world.run(2000);
    const tier = cupIndices(CM(world, ann, 3));
    const before = tier.length;
    assert.ok(before >= 6, `the top tier holds ${before} cups`);
    await throwBall(world, ann, 0);
    await throwBall(world, bob, 1);
    assert.equal(B(world, ann, 0)._state[0], BallState.Flying);
    assert.equal(B(world, bob, 1)._state[0], BallState.Flying);
    // each thrower's own physics reports its ball in a different cup of the same rack (Bob is not the referee)
    contact(world, [ann], ann, { ball: 0, side: 3, index: tier[0] });
    if (gap) await world.run(gap);
    contact(world, [bob], bob, { ball: 1, side: 3, index: tier[5] });
    await world.run(4000);
    for (const c of [ann, bob]) {
      assert.deepEqual(cupIndices(CM(world, c, 3)), tier.filter((i) => i !== tier[0] && i !== tier[5]), `${c.name}: both cups are gone, no other`);
      assert.equal(CM(world, c, 3).SyncedCount, before - 2, `${c.name}: the count went down by two`);
      assert.equal(P(world, c, 0)._score, 2, `${c.name}: King of the Hill scores 2 (Game.cs:505)`);
      assert.equal(P(world, c, 1)._score, 2);
    }
    assert.ok(world.agree());
    assert.deepEqual(problems(world), []);
  });
}

test("a removal asked twice for one cup (two reports of one hit) removes it once", async () => {
  const world = newWorld(22);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  const m = CM(world, bob, 1);
  const index = cupIndices(m)[3]!;
  m.RequestRemoveCup(Math.trunc(index / 22), index % 22);
  m.RequestRemoveCup(Math.trunc(index / 22), index % 22);
  // nonsense from a modified page is refused by the referee: out of the grid, not a number, an empty place
  m.SendCommand("RemoveCupCommand", 99, 0, 1);
  m.SendCommand("RemoveCupCommand", "3", "4", 1);
  m.SendCommand("RemoveCupCommand", 0, 0, 1);
  await world.run(2000);
  for (const c of [ann, bob]) {
    assert.equal(CM(world, c, 1).SyncedCount, 14);
    assert.deepEqual(cupIndices(CM(world, c, 1)).includes(index), false);
  }
  assert.ok(world.agree());
});

// ---- finding 3: no teleport at start-up ----

for (const players of ["3", "4"]) {
  test(`a fresh ${players}-side table does not teleport its starter; changing the side count later does`, async () => {
    const world = newWorld(3);
    const ann = world.join({ name: "Ann", elements: [{ players }] });
    // the page knows where Ann stands from the start (the kit asks for the head position at once)
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setImmediate(r));
      ann.pose(new Vector3(0.3, 0, -2.6));
    }
    await settle(world);
    assert.ok(G(world, ann).Input.Position, "the start position is known");
    assert.equal(G(world, ann)._playerCount, Number(players));
    assert.deepEqual(ann.teleports, [], "nobody is moved when the table starts");
    await setSlider(world, ann, "p0_count", players === "3" ? 4 : 3);
    assert.equal(ann.teleports.length, 1, "the side count changed on the panel: the changer moves with their side (Game.cs:761-779)");
    assert.deepEqual(problems(world), []);
  });
}

// ---- finding 4: Big Pong's adaptive AI skill stays a number ----

test("Big Pong: an AI side with no cups of its own gets a skill in [0, 1] (no Infinity or NaN), the same everywhere", async () => {
  const world = newWorld(31);
  const el = [{ mode: "big", players: "2" }];
  const ann = world.join({ name: "Ann", elements: el });
  const bob = world.join({ name: "Bob", elements: el });
  await settle(world);
  assert.deepEqual([0, 1].map((s) => CM(world, ann, s).SyncedCount), [1, 0], "Big Pong: one big cup, on side 0's rack");
  await miss(world, ann); // side 0's skill is now 0 hits of 1 throw
  for (const s of [0, 1]) {
    const skill = G(world, ann).GetAdaptiveAIStrength(s);
    assert.ok(Number.isFinite(skill) && skill >= 0 && skill <= 1, `side ${s}: skill ${skill}`);
  }
  await setToggle(world, bob, "p1_ai", true);
  for (let i = 0; i < 4; i++) await world.run(2000);
  for (const c of [ann, bob]) {
    const skill = P(world, c, 1)._aiSkill;
    assert.ok(Number.isFinite(skill) && skill >= 0 && skill <= 1, `${c.name}: AI skill ${skill}`);
    assert.ok(Number.isFinite(G(world, c)._lastAimAssist), `${c.name}: last assist ${G(world, c)._lastAimAssist}`);
  }
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

// ---- finding 5: the game's test helpers never ship callable ----

test("the game's test helpers (remove a cup, aim a throw) reach the page registry only on a test page, and do nothing until called", async () => {
  const world = newWorld(41);
  const pub = world.join({ name: "Ann" });
  const tester = world.room.join({ name: "Tester" });
  (tester.env.win as { __pk1_debug?: boolean }).__pk1_debug = true;
  tester.load(game, bindings);
  tester.addSnippet(SLUG, { windows: world.kit });
  world.clients.push(tester);
  await settle(world);
  const registry = (c: FakeClient) => (c.env.win as { __pk1: { debug: Record<string, Record<string, unknown>> } }).__pk1.debug;
  assert.deepEqual(Object.keys(registry(pub)), [], "a published page exposes nothing");
  const hooks = registry(tester)[`${SLUG}:0`]!;
  for (const name of ["removeCup", "aimShoot", "aimShootNearest", "placeAbove", "dropThrow", "rawRelay"]) assert.equal(typeof hooks[name], "function", name);
  // the report counter is installed by the first call, not at start: an untouched page runs the game unchanged
  const transform = B(world, pub).transform as unknown as { _report: unknown; constructor: { prototype: { _report: unknown } } };
  assert.equal(transform._report, transform.constructor.prototype._report, "the published page's ball reports are untouched");
  const testerTransform = B(world, tester).transform as unknown as { _report: unknown; constructor: { prototype: { _report: unknown } } };
  assert.equal(testerTransform._report, testerTransform.constructor.prototype._report, "not even on a test page before a hook is called");
  (hooks.now as () => number)();
  assert.notEqual(testerTransform._report, testerTransform.constructor.prototype._report, "counting once asked");
});

// ---- finding 6: tests that land what their names say ----

test("Big Pong: a ball in the big cup scores 2 after 3 s (rim 1), the cup stays, the scorer keeps the ball", async () => {
  const world = newWorld(51);
  const el = [{ mode: "big", players: "3" }];
  const ann = world.join({ name: "Ann", elements: el });
  const bob = world.join({ name: "Bob", elements: el });
  await settle(world);
  const big = cupIndices(CM(world, ann, 0));
  assert.equal(big.length, 1);
  assert.equal(CM(world, ann, 0)._scale, 10, "the one cup is ten times the size (Game.cs:672)");
  await throwBall(world, ann);
  contact(world, [ann], ann, { side: 0, index: big[0] });
  await world.run(2500);
  for (const c of [ann, bob]) {
    assert.equal(B(world, c)._state[0], BallState.InCup);
    assert.equal(P(world, c, 0)._score, 0, `${c.name}: not counted before 3 s (Ball.cs:385-390)`);
  }
  await world.run(1000);
  for (const c of [ann, bob]) {
    assert.equal(P(world, c, 0)._score, 2, `${c.name}: Big Pong scores 2 (Game.cs:506)`);
    assert.equal(P(world, c, 0)._numberOfHits, 1);
    assert.equal(CM(world, c, 0).SyncedCount, 1, "Big Pong never removes its cup (Game.cs:420)");
    assert.equal(B(world, c)._state[0], BallState.Idle);
    assert.equal(B(world, c).CurrentPlayer, 0, "the scorer throws again");
  }
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("Mayhem: every side has its own ball; a cup of another colour scores 1, one of the thrower's own colour costs 1", async () => {
  const world = newWorld(32);
  const el = [{ mode: "mayhem", players: "2" }];
  const ann = world.join({ name: "Ann", elements: el });
  const bob = world.join({ name: "Bob", elements: el });
  await settle(world);
  const rack = CM(world, ann, 1);
  assert.equal(rack.SyncedCount, 21, "Mayhem racks are 6 rows (Game.cs:612)");
  assert.equal(B(world, bob, 1).gameObject.activeSelf, true, "side 1 has a ball of its own");
  const owners = rack._cupOwnersAtPositions;
  const other = cupIndices(rack).find((i) => owners[i] !== 0)!;
  const own = cupIndices(rack).find((i) => owners[i] === 0);
  assert.ok(other !== undefined && own !== undefined, "seed 32 gives side 1 cups of Ann's colour and of others");
  // Ann (side 0) hits a cup of another colour on side 1: +1, removed after 1 s (Ball.cs:378-384), the ball stays with side 0
  await hit(world, ann, 1, other);
  for (const c of [ann, bob]) {
    assert.equal(P(world, c, 0)._score, 1, `${c.name}`);
    assert.equal(CM(world, c, 1).SyncedCount, 20);
    assert.equal(B(world, c, 0).CurrentPlayer, 0, "Mayhem keeps each ball with its side (Game.cs:546)");
  }
  // then a cup of her own colour on Bob's side: -1 (Game.cs:509)
  await hit(world, ann, 1, own!);
  for (const c of [ann, bob]) {
    assert.equal(P(world, c, 0)._score, 0, `${c.name}: 1 - 1`);
    assert.equal(CM(world, c, 1).SyncedCount, 19);
  }
  // a cup standing on the thrower's own side is not a hit at all (Game.cs:483), whatever its colour
  await throwBall(world, ann);
  contact(world, [ann], ann, { side: 0, index: cupIndices(CM(world, ann, 0))[0]! });
  await world.run(300);
  assert.equal(B(world, ann)._state[0], BallState.Flying, "own side: neither a hit nor a miss");
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("teams (0 and 2 against 1 and 3): a hit scores for both team-mates; a team-mate's cup costs both 3", async () => {
  const world = newWorld(52);
  const el = [{ players: "4", teams: "true", rows: "3" }];
  const ann = world.join({ name: "Ann", elements: el });
  const bob = world.join({ name: "Bob", elements: el });
  await settle(world);
  assert.equal(G(world, bob)._doTeams, true);
  await hit(world, ann, 1, cupIndices(CM(world, ann, 1))[0]!);
  for (const c of [ann, bob]) assert.deepEqual([0, 1, 2, 3].map((s) => P(world, c, s)._score), [1, 0, 1, 0], `${c.name}: side 0's hit counts for 0 and 2`);
  // friendly fire is on by default (item 57): side 0 sinks a cup of its team-mate, side 2
  await hit(world, ann, 2, cupIndices(CM(world, ann, 2))[0]!);
  for (const c of [ann, bob]) {
    assert.deepEqual([0, 1, 2, 3].map((s) => P(world, c, s)._score), [-2, 0, -2, 0], `${c.name}: -3 for both (Game.cs:510)`);
    assert.equal(P(world, c, 0)._numberOfHits, 2, "the thrower's side counts both hits");
    assert.equal(P(world, c, 2)._numberOfHits, 0);
  }
  // with friendly fire off, the team-mate's cup is neither a hit nor a miss
  await setToggle(world, bob, "p1_friendlyFire", false);
  await throwBall(world, ann);
  contact(world, [ann], ann, { side: 2, index: cupIndices(CM(world, ann, 2))[0]! });
  await world.run(300);
  assert.equal(B(world, ann)._state[0], BallState.Flying);
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

/** Where a throw from `start` with `velocity` crosses each cup's opening height on the way down: the nearest miss. */
function nearestOpening(world: ReturnType<typeof newWorld>, c: FakeClient, start: Vector3, velocity: Vector3): { cup: Cup; distance: number } {
  const g = G(world, c);
  let best: { cup: Cup; distance: number } | null = null;
  for (const cup of g.AllCups()) {
    const opening = cup.position.add(new Vector3(0, cup.GlobalHeight + g.BallRadius(), 0));
    const t = B(world, c).PredictTableHitTime(velocity, start, opening.y - g.BallRadius());
    if (!(t > 0)) continue;
    const at = B(world, c).PositionAt(start, velocity, t);
    const distance = Math.hypot(at.x - opening.x, at.z - opening.z);
    if (!best || distance < best.distance) best = { cup, distance };
  }
  assert.ok(best, "no cup below the throw");
  return best;
}

for (const mode of ["king", "big"] as const) {
  test(`${mode === "king" ? "King of the Hill" : "Big Pong"}: the AI at skill 1 throws from its spawn point into a cup at the table's centre`, async () => {
    const world = newWorld(61);
    const el = [{ mode, players: "2" }];
    const ann = world.join({ name: "Ann", elements: el });
    const bob = world.join({ name: "Bob", elements: el });
    await settle(world);
    await setToggle(world, bob, "p1_aiAdaptive", false);
    await setSlider(world, bob, "p1_aiSkill", 1);
    await setToggle(world, bob, "p1_ai", true);
    const ball = mode === "king" ? 1 : 0;
    if (mode === "big") await miss(world, ann); // Big Pong has one ball: pass it to side 1
    let thrown = false;
    for (let i = 0; i < 20 && !thrown; i++) {
      await world.run(500);
      thrown = B(world, bob, ball)._state[0] === BallState.Flying && B(world, bob, ball).CurrentPlayer === 1;
    }
    assert.ok(thrown, "the AI threw");
    const b = B(world, bob, ball);
    const spawn = G(world, bob).Players[1]!.AiBallSpawnWorld().position;
    assert.ok(Vector3.Distance(b._start_position, spawn) < 1e-6, "from side 1's AI spawn point (Player.cs:244-249)");
    const { cup, distance } = nearestOpening(world, bob, b._start_position, b._start_velocity);
    assert.ok(distance < 0.01, `lands ${distance.toFixed(4)} m from the opening of ${cup.name}`);
    const centre = G(world, bob).KitToWorld(G(world, bob)._kingOfTheHillLocal);
    assert.ok(Math.hypot(cup.position.x - centre.x, cup.position.z - centre.z) < 0.8, `${cup.name} stands at the centre`);
    if (mode === "big") assert.equal(cup.PlayerAnchorSide.PlayerIndex, 0, "Big Pong's one cup");
    assert.deepEqual(problems(world), []);
  });
}

test("an AI throw that lands scores for its side, and is counted neither as a throw nor as a hit (Game.cs:440, :470)", async () => {
  const world = newWorld(16);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  await setToggle(world, ann, "p0_ai", true);
  let thrown = false;
  for (let i = 0; i < 60 && !thrown; i++) {
    await world.run(250);
    thrown = B(world, ann)._state[0] === BallState.Flying;
  }
  assert.ok(thrown, "the AI threw for side 0");
  const owner = ownerOf(world, (c) => B(world, c));
  const target = cupIndices(CM(world, owner, 1))[2]!;
  contact(world, world.clients, owner, { side: 1, index: target });
  await world.run(3000);
  for (const c of [ann, bob]) {
    assert.equal(P(world, c, 0)._score, 1, `${c.name}: the AI's hit scores`);
    assert.equal(P(world, c, 0)._numberOfHits, 0, `${c.name}: not counted as a hit`);
    assert.equal(P(world, c, 0)._numberOfThrows, 0, `${c.name}: nor as a throw`);
    assert.equal(CM(world, c, 1).SyncedCount, 14);
  }
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

// ---- launches from one page go one at a time (the kit's rbLaunch held one pending launch per kit until f7547fb) ----

test("launches from one page go out one at a time, LAUNCH_GAP apart", async () => {
  const world = newWorld(71);
  const el = [{ mode: "king", players: "4" }];
  const ann = world.join({ name: "Ann", elements: el });
  await settle(world);
  const g = G(world, ann);
  const before = ann.graph(SLUG).payloads.length;
  // two of Ann's balls thrown in one turn (as the AI driving two sides at once does)
  B(world, ann, 0).ShootAI(1);
  B(world, ann, 1).ShootAI(1);
  await world.run(Math.ceil(LAUNCH_GAP * 1000) + 200);
  const launches = ann.graph(SLUG).payloads.slice(before)
    .map((p) => p.split("^").map((r, i) => (i === 0 ? r.slice(r.indexOf("|") + 1) : r)).filter((r) => r.startsWith("rbLaunch|")).length)
    .filter((n) => n > 0);
  assert.deepEqual(launches, [1, 1], "two batches with one launch each");
  const targets = ann.graph(SLUG).records.filter((r) => r.op === "rbLaunch").map((r) => r.target);
  assert.deepEqual(targets.slice(-2), ["ball0", "ball1"].map((k) => String(bindings.refs.indexOf(k))));
  // a launch still waiting is dropped when its ball is respawned meanwhile
  B(world, ann, 2).ShootAI(1);
  B(world, ann, 3).ShootAI(1);
  B(world, ann, 3).Respawn();
  await world.run(Math.ceil(LAUNCH_GAP * 1000) + 200);
  const after = ann.graph(SLUG).records.filter((r) => r.op === "rbLaunch").map((r) => r.target);
  assert.equal(after.length, targets.length + 1, "ball 3's launch was dropped");
  assert.equal(g.Gamemode, GameMode.KingOfTheHill);
  assert.equal(kitCups(ann).size > 0, true);
});

// ---- PORT.md 0.10 (closed): team-mates scoring at the same moment ----
// Every count a turn changes on a side (throws, hits, score, the last aim assist, the AI's skill) is a request to the
// referee, the one writer of them during play; before, the scorer wrote its team-mate's side, and a team-mate's own
// throw at that moment wrote it too: one of the two writes was dropped by the ownership rules.

for (const [seed, referee] of [[81, "Ann"], [82, "Ann"], [83, "Bob"], [84, "Bob"]] as const) {
  test(`teams, several balls (Mayhem, 4 sides): team-mates who score and throw at the same moment lose nothing (seed ${seed}, ${referee === "Ann" ? "a scorer" : "an opponent"} is the referee)`, async () => {
    const world = newWorld(seed);
    const el = [{ mode: "mayhem", players: "4", teams: "true", rows: "3" }];
    // the first to come is the referee: Ann (one of the scorers: her own counts are written at once) or Bob (every
    // count of both scorers is a request)
    const first = world.join({ name: referee, elements: el });
    const ann = referee === "Ann" ? first : world.join({ name: "Ann", elements: el });
    const bob = referee === "Bob" ? first : world.join({ name: "Bob", elements: el });
    const cat = world.join({ name: "Cat", elements: el });
    await settle(world);
    assert.equal(world.instance(cat).networking.Master?.displayName, referee);
    assert.equal(G(world, cat)._doTeams, true);
    // each page takes its side's ball over first with a throw that misses (Ann side 0, Bob 1, Cat 2: Ann's team-mate)
    await miss(world, ann, "0", 0);
    await miss(world, cat, "0", 2);
    await miss(world, bob, "0", 1);
    await world.run(2000);
    const scores = (c: FakeClient) => [0, 1, 2, 3].map((s) => P(world, c, s)._score);
    const throws = (c: FakeClient) => [0, 1, 2, 3].map((s) => P(world, c, s)._numberOfThrows);
    const hits = (c: FakeClient) => [0, 1, 2, 3].map((s) => P(world, c, s)._numberOfHits);
    assert.deepEqual(scores(ann), [0, 0, 0, 0]);
    const opponents = (side: number) => {
      const owners = CM(world, ann, side)._cupOwnersAtPositions;
      return cupIndices(CM(world, ann, side)).filter((i) => owners[i] === 1 || owners[i] === 3);
    };
    const on1 = opponents(1);
    const on3 = opponents(3);
    assert.ok(on1.length >= 1 && on3.length >= 1, "cups of the other team's colours on sides 1 and 3");

    // 1. Ann (side 0) hits while Cat (side 2) throws: Ann's hit scores for side 2 as Cat's throw counts on side 2
    await throwBall(world, ann, 0);
    contact(world, [ann], ann, { ball: 0, side: 1, index: on1[0]! });
    await throwBall(world, cat, 2);
    await world.run(3000);
    for (const c of [ann, bob, cat]) {
      assert.deepEqual(scores(c), [1, 0, 1, 0], `${c.name}: Ann's hit counts for 0 and 2`);
      assert.deepEqual(throws(c), [2, 1, 2, 0], `${c.name}: every throw counts (Cat's at the moment of Ann's hit too)`);
    }
    contact(world, [cat], cat, { ball: 2, name: "Floor", own: false });
    await world.run(2000);

    // 2. Ann and Cat both hit at the same moment: each hit scores for both
    await throwBall(world, ann, 0);
    await throwBall(world, cat, 2);
    contact(world, [ann], ann, { ball: 0, side: 1, index: opponents(1)[0]! });
    contact(world, [cat], cat, { ball: 2, side: 3, index: on3[0]! });
    await world.run(4000);
    for (const c of [ann, bob, cat]) {
      assert.deepEqual(scores(c), [3, 0, 3, 0], `${c.name}: two hits at once, each for both team-mates`);
      assert.deepEqual(throws(c), [3, 1, 3, 0], `${c.name}: every throw counted`);
      assert.deepEqual(hits(c), [2, 0, 1, 0], `${c.name}: every hit counted, on the thrower's side`);
    }

    // 3. Cat moves her side's AI skill slider (her own claim of side 2) in the moment she throws (a request): the
    // referee runs the request only after it has seen that claim and write (the kit's write mark), so both stay
    await world.run(1000);
    assert.ok(cat.grab(SLUG, "0", "ball2"));
    await world.run(300);
    cat.graphEvent(SLUG, "0", "uiSlider", `${refIndex("p2_aiSkill")}|0.8`);
    cat.graphEvent(SLUG, "0", "bpRelease", "2|0|1.5|2.5|0");
    cat.drop(SLUG, "0", "ball2");
    await world.run(3000);
    for (const c of [ann, bob, cat]) {
      assert.equal(P(world, c, 2)._aiSkill, 0.8, `${c.name}: the slider's value stays`);
      assert.equal(throws(c)[2], 4, `${c.name}: and the throw counts`);
    }
    assert.ok(world.agree());
    assert.deepEqual(problems(world), []);
  });
}
