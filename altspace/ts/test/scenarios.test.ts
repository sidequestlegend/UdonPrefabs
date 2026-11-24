// Rung 1: several players on the fake room (virtual time), playing through the inputs a player has: grabbing and
// letting go of the ball, a key, clicking the settings panels; and the kit's ball graph reporting what the thrower's
// physics saw (bpRelease, bpContact).

import assert from "node:assert/strict";
import { test } from "node:test";
import { leafBudget, statePrefix, Vector3 } from "../portkit/src/index.ts";
import { BallState } from "../src/Ball.ts";
import { GameMode } from "../src/Game.ts";
import {
  B, bindings, CM, contact, cupIndices, G, game, hit, kitCups, lastOp, miss, newWorld, P, pressButton, problems, setSlider, setToggle, settle, SLUG, throwBall,
} from "./helpers.ts";

test("two sides play until one rack is empty: hits keep the ball, misses pass it, every client agrees", async () => {
  const world = newWorld(3);
  const ann = world.join({ name: "Ann", elements: [{ rows: "3" }] });
  const bob = world.join({ name: "Bob", elements: [{ rows: "3" }] });
  await settle(world);
  const everyone = [ann, bob];

  for (const c of everyone) {
    assert.equal(CM(world, c, 0).SyncedCount, 6, `${c.name}: side 0 starts with a 3-row triangle`);
    assert.equal(CM(world, c, 1).SyncedCount, 6);
    assert.equal(kitCups(c).size, 12, `${c.name}'s kit holds 12 cup copies`);
    assert.equal(B(world, c)._state[0], BallState.Idle);
    assert.equal(B(world, c).CurrentPlayer, 0);
  }

  // Ann throws for side 0 and sinks Bob's six cups, with a miss and Bob's turn in between
  const targets = cupIndices(CM(world, ann, 1));
  await hit(world, ann, 1, targets[0]!);
  await hit(world, ann, 1, targets[1]!);
  assert.equal(B(world, bob).CurrentPlayer, 0, "a hit keeps the ball with the same side");
  await miss(world, ann);
  assert.equal(B(world, ann).CurrentPlayer, 1, "a miss passes the ball");
  await miss(world, bob);
  assert.equal(B(world, bob).CurrentPlayer, 0);
  for (const index of targets.slice(2)) await hit(world, ann, 1, index);
  await world.run(1000);

  for (const c of everyone) {
    assert.equal(CM(world, c, 1).SyncedCount, 0, `${c.name}: side 1 has no cups left`);
    assert.equal(CM(world, c, 0).SyncedCount, 6);
    assert.equal(P(world, c, 0)._score, 6, `${c.name}: six points for side 0`);
    assert.equal(P(world, c, 0)._numberOfThrows, 7);
    assert.equal(P(world, c, 0)._numberOfHits, 6);
    assert.equal(P(world, c, 1)._numberOfThrows, 1);
    assert.equal(c.graph(SLUG).text.get("p0score"), "0006");
    assert.equal(c.graph(SLUG).text.get("p0popupScore"), "0006", "the points popup shows the score");
    assert.equal(kitCups(c).size, 6);
    // no game over upstream (item 46): the ball is back at side 0's spawn, ready
    assert.equal(B(world, c)._state[0], BallState.Idle);
  }
  // with only one side holding cups, the turn is not skipped any more (Game.cs:549): a miss still passes it
  await miss(world, ann);
  assert.equal(B(world, bob).CurrentPlayer, 1);
  assert.ok(world.agree(), "every client holds the same state");
  assert.deepEqual(problems(world), []);
});

test("a hit reported by the thrower removes exactly that cup on every client; others' reports change nothing", async () => {
  const world = newWorld(5);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  const cat = world.join({ name: "Cat" });
  await settle(world);
  const before = cupIndices(CM(world, cat, 1));
  assert.equal(before.length, 15, "the default rack is a 5-row triangle");
  const target = before[7]!;
  const cupName = CM(world, ann, 1).CupAtIndex(target)!.name;

  await throwBall(world, ann);
  for (const c of [ann, bob, cat]) assert.equal(B(world, c)._state[0], BallState.Flying, `${c.name} sees the ball flying`);
  // Bob's and Cat's graphs report the contact alone first: they do not own the ball, so nothing happens
  contact(world, [bob, cat], ann, { side: 1, index: target });
  await world.run(300);
  for (const c of [ann, bob, cat]) assert.equal(B(world, c)._state[0], BallState.Flying);
  // the thrower's own physics reports it: in the cup at once, counted, the cup goes after 2 s (Ball.cs:359-376)
  contact(world, [ann], ann, { side: 1, index: target });
  await world.run(500);
  for (const c of [ann, bob, cat]) {
    assert.equal(B(world, c)._state[0], BallState.InCup, `${c.name}: in the cup`);
    assert.deepEqual(B(world, c)._state.slice(1, 4), [1, Math.trunc(target / 22), target % 22], `${c.name}: the right cup`);
    assert.equal(P(world, c, 0)._score, 1);
    assert.equal(CM(world, c, 1).SyncedCount, 15, "the cup stays for 2 s");
  }
  assert.ok(cat.graph(SLUG).events.some((e) => e.op === "particles" && e.target === "splash"), "the splash plays on every client");
  await world.run(2500);
  for (const c of [ann, bob, cat]) {
    const after = cupIndices(CM(world, c, 1));
    assert.deepEqual(after, before.filter((i) => i !== target), `${c.name}: exactly cup ${target} is gone`);
    assert.equal(CM(world, c, 1)._hit, 1);
    assert.ok(![...kitCups(c)].some((p) => p.endsWith("/" + cupName)), `${c.name}'s kit destroyed ${cupName}`);
    assert.equal(kitCups(c).size, 29);
    assert.equal(B(world, c)._state[0], BallState.Idle);
    assert.equal(B(world, c).CurrentPlayer, 0, "the scorer throws again");
  }
  // the thrower's client decided: it owns the ball, the side's score and the rack it changed
  const net = world.instance(bob).networking;
  assert.equal(net.GetOwner(B(world, bob))?.displayName, "Ann");
  assert.equal(net.GetOwner(CM(world, bob, 1))?.displayName, "Ann");
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("rim shot: 2 points, the rim angle travels as int(angle / 2), the cup is removed after the spiral and 2 s", async () => {
  const world = newWorld(8);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  const target = cupIndices(CM(world, ann, 1))[4]!;
  // land flat (angle from straight down near 90 degrees) close to the rim: the rim test draws two numbers (Ball.cs:950)
  await throwBall(world, ann);
  const cup = CM(world, ann, 1).CupAtIndex(target)!;
  const p = cup.position;
  const top = p.y + cup.GlobalHeight;
  const r = cup.GlobalRadius * 0.9;
  const args = `ball0|${cup.name}|${p.x + r}|${top}|${p.z}|0|1|0|1|${p.x + r}|${top + 0.03}|${p.z}|-3|-0.2|0|${p.x}|${p.y}|${p.z}|${top}`;
  ann.graphEvent(SLUG, "0", "collisionEnter", args);
  await world.run(300);
  for (const c of [ann, bob]) assert.equal(B(world, c)._state[0], BallState.Rimming, `${c.name}: on the rim`);
  const angle = B(world, bob)._state[4]!;
  assert.ok(angle >= 0 && angle < 180, "the start angle is sent halved");
  const rimSeconds = (3000 - angle * 2) / 1300;
  await world.run(rimSeconds * 1000 + 400);
  for (const c of [ann, bob]) assert.equal(B(world, c)._localState, BallState.InCup, `${c.name}: dropped in after the spiral`);
  assert.equal(P(world, bob, 0)._score, 2, "a rim shot is 2 points (Game.cs:510)");
  await world.run(2500);
  for (const c of [ann, bob]) {
    assert.equal(CM(world, c, 1).SyncedCount, 14);
    assert.equal(B(world, c)._state[0], BallState.Idle);
  }
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("a re-rack from the panel lays the remaining cups out again, on every client", async () => {
  const world = newWorld(9);
  const ann = world.join({ name: "Ann", elements: [{ rows: "4" }] });
  const bob = world.join({ name: "Bob", elements: [{ rows: "4" }] });
  await settle(world);
  const rack = cupIndices(CM(world, ann, 1));
  assert.equal(rack.length, 10);
  // sink three cups from the front row (row 0 is the back row, rows count toward the table centre)
  for (const index of [rack[0]!, rack[2]!, rack[5]!]) await hit(world, ann, 1, index);
  assert.equal(CM(world, bob, 1).SyncedCount, 7);
  const holes = cupIndices(CM(world, bob, 1));
  // Bob presses Rerack on side 1's panel
  await pressButton(world, bob, "p1_rerack");
  // 7 left -> a 4-row triangle with the 3 highest grid positions taken away (CupsManager.cs:220-236)
  // row 0: columns 8, 10, 12, 14; row 1: columns 9, 11, 13 (indices 22 + c)
  const expected = [8, 10, 12, 14, 31, 33, 35];
  for (const c of [ann, bob]) {
    const now = cupIndices(CM(world, c, 1));
    assert.deepEqual(now, expected, `${c.name}: re-racked`);
    assert.notDeepEqual(now, holes);
    assert.equal(kitCups(c).size, 10 + 7);
  }
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("settings changed on one panel reach every client and every other panel", async () => {
  const world = newWorld(10);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);

  // Bob opens his side's panel (table-edge button, a click) and picks the Rules tab
  assert.ok(bob.click(SLUG, "0", "p1uiButton"));
  await world.run(1000);
  for (const c of [ann, bob]) {
    assert.equal(P(world, c, 1)._areSettingsOpen, true);
    assert.equal(c.graph(SLUG).anim.get("p1uiAnim")?.isOn, "1", `${c.name}: the panel slides out`);
  }
  bob.graphEvent(SLUG, "0", "uiToggle", `${bindings.refs.indexOf("p1tabRules")}|1`);
  await world.run(1000);
  assert.equal(P(world, ann, 1)._settingsNavbar, 1);
  assert.deepEqual(lastOp(ann, "uiSetToggle", "p1tabRules"), ["1"], "Ann's copy of Bob's panel shows the Rules tab");
  assert.equal(ann.graph(SLUG).active.get("p1contentRules"), true, "and its Rules content");
  assert.equal(ann.graph(SLUG).active.get("p1contentGame"), false, "not the Game content");

  // game-wide toggles and sliders, from Bob's panel
  await setToggle(world, bob, "p1_teams", true);
  await setToggle(world, bob, "p1_selfFire", true);
  await setToggle(world, bob, "p1_autoRespawn", false);
  await setSlider(world, bob, "p1_aimAssist", 0.6);
  await setSlider(world, bob, "p1_count", 4);
  for (const c of [ann, bob]) {
    const g = G(world, c);
    assert.equal(g._doTeams, true, c.name);
    assert.equal(g._allowSelfFire, true);
    assert.equal(g._doAutoRespawnBalls, false);
    assert.equal(g._aimAssist, 0.6);
    assert.equal(g._playerCount, 4);
    // every panel on every client shows the new values (SimpleUISetterExtension.cs:21-38)
    for (const s of [0, 1, 2, 3]) {
      if (c === bob && s === 1) continue; // the controls Bob used show his values already: nothing is sent back to them
      assert.deepEqual(lastOp(c, "uiSetToggle", `p${s}_teams`)?.[0], "1", `${c.name}: panel ${s} shows teams on`);
      assert.deepEqual(lastOp(c, "uiSetToggle", `p${s}_autoRespawn`)?.[0], "0");
      assert.equal(lastOp(c, "uiSetSlider", `p${s}_aimAssist`)?.[0], "0.6");
    }
    assert.equal(c.graph(SLUG).text.get("p0_countHandle"), "4", "the count slider's handle shows 4");
    // four sides: the 4-side table model is the one shown, all four sides active, teams share colours 0+2 and 1+3
    assert.equal(c.graph(SLUG).active.get("table4"), true);
    assert.equal(c.graph(SLUG).active.get("table2"), false);
    assert.ok(P(world, c, 2).ActiveColor.equals(P(world, c, 0).ActiveColor), `${c.name}: side 2 takes side 0's colour`);
    assert.ok(P(world, c, 3).ActiveColor.equals(P(world, c, 1).ActiveColor));
    assert.equal(CM(world, c, 2).SyncedCount, 15, "a side that was off gets its rack (Game.cs:799-802)");
  }

  // the mode selector on Ann's panel: Next -> King of the Pong, then Mayhem through Prev twice
  await pressButton(world, ann, "p0_modeRight");
  for (const c of [ann, bob]) {
    assert.equal(G(world, c)._gameMode, GameMode.KingOfTheHill);
    assert.equal(c.graph(SLUG).text.get("p3_modeLabel"), "King of the Pong", `${c.name}: every panel's label`);
  }
  await pressButton(world, ann, "p0_modeLeft");
  await pressButton(world, ann, "p0_modeLeft");
  for (const c of [ann, bob]) {
    assert.equal(G(world, c)._gameMode, GameMode.Mayham);
    for (const s of [0, 1, 2, 3]) assert.equal(CM(world, c, s)._rows, 6, "Mayhem forces 6 rows (Game.cs:625)");
    for (let i = 0; i < 4; i++) assert.equal(B(world, c, i).gameObject.activeSelf, true, "a ball per side in Mayhem");
  }

  // a side's rows and shape are its own, not networked, then ResetGlasses (which syncs them): back to Normal first
  await pressButton(world, ann, "p0_modeRight"); // Mayhem -> Normal (the selector wraps)
  assert.equal(G(world, bob)._gameMode, GameMode.Normal);
  await setSlider(world, bob, "p1_rows", 3);
  await pressButton(world, bob, "p1_shapeRight");
  for (const c of [ann, bob]) {
    assert.equal(CM(world, c, 1)._rows, 3);
    assert.equal(CM(world, c, 1)._shape, 1, "square");
    assert.equal(CM(world, c, 1).SyncedCount, 9);
    assert.equal(CM(world, c, 0)._rows, 6, "side 0 keeps its own rows");
  }
  // "Sync settings to all players" copies side 1's rows and shape to the others without resetting their racks
  const side0Before = cupIndices(CM(world, ann, 0));
  await pressButton(world, bob, "p1_sync");
  for (const c of [ann, bob]) {
    assert.equal(CM(world, c, 0)._rows, 3);
    assert.equal(CM(world, c, 0)._shape, 1);
    assert.deepEqual(cupIndices(CM(world, c, 0)), side0Before);
  }

  // table size: a slider and its Reset button
  await setSlider(world, ann, "p0_size", 1.25);
  for (const c of [ann, bob]) {
    assert.equal(G(world, c)._size, 1.25);
    assert.equal(lastOp(c, "uiSetSlider", "p2_size")?.[0], "1.25", "the Size sliders are refreshed (upstream refreshed Aim Assist, Game.cs:119)");
  }
  await pressButton(world, bob, "p1_sizeReset");
  for (const c of [ann, bob]) assert.equal(G(world, c)._size, 1);

  // the volume is the local player's own
  await setSlider(world, ann, "p0_volume", 0.2);
  assert.equal(G(world, ann)._volume, 0.2);
  assert.equal(G(world, bob)._volume, 0.5);

  // Reset all: racks, throws, hits and scores of all four sides (Player.cs:280-297)
  await hit(world, ann, 1, cupIndices(CM(world, ann, 1))[0]!);
  assert.equal(P(world, bob, 0)._score, 1);
  await pressButton(world, ann, "p0_resetAll");
  for (const c of [ann, bob]) {
    for (const s of [0, 1, 2, 3]) {
      assert.equal(P(world, c, s)._score, 0, `${c.name}: side ${s} score reset`);
      assert.equal(P(world, c, s)._numberOfThrows, 0);
    }
    assert.equal(CM(world, c, 1).SyncedCount, 9, "side 1's 3-row square is full again");
    assert.equal(c.graph(SLUG).text.get("p0score"), "0000", `${c.name}: the score plate shows 0000 (fix: upstream's resetter kept the old one)`);
  }
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("King of the Hill: four stacked circle racks of 176 cups, inside the room's state budgets", async () => {
  const world = newWorld(11);
  const ann = world.join({ name: "Ann", elements: [{ mode: "king", players: "4" }] });
  const bob = world.join({ name: "Bob", elements: [{ mode: "king", players: "4" }] });
  await settle(world);
  for (const c of [ann, bob]) {
    assert.equal(G(world, c)._gameMode, GameMode.KingOfTheHill);
    const counts = [0, 1, 2, 3].map((s) => CM(world, c, s).SyncedCount);
    assert.deepEqual(counts, [76, 56, 30, 14], `${c.name}: circles of 10, 8, 6 and 4 rows`);
    assert.equal(kitCups(c).size, 176);
    assert.ok([...kitCups(c)].every((p) => p.startsWith("BeerPong/KingOfTheHillPosition/")), "all at the table centre");
    // tiers stack one cup height apart (Game.cs:651-664)
    assert.ok(CM(world, c, 1)._position_offset.y > CM(world, c, 0)._position_offset.y);
    assert.equal(P(world, c, 0)._doRandomCupColor, true, "random cup colours");
  }
  // the same random colours everywhere (Unity's generator seeded by the grid index, Cup.cs:36-37)
  const colours = (c: typeof ann) => G(world, c).AllCups().map((cup) => `${cup.color.r.toFixed(4)},${cup.color.g.toFixed(4)}`).join(" ");
  assert.equal(colours(ann), colours(bob));

  // one hit on the top tier: 2 points, removed after 1 s (Ball.cs:378-386)
  const top = cupIndices(CM(world, ann, 3))[0]!;
  await hit(world, ann, 3, top);
  for (const c of [ann, bob]) {
    assert.equal(CM(world, c, 3).SyncedCount, 13);
    assert.equal(P(world, c, 0)._score, 2);
  }

  // budgets: every leaf of this table under 16,384 bytes; few keys; no write was refused or rate-limited
  const prefix = statePrefix(SLUG, "0");
  const keys = world.room.stateKeys(prefix);
  const snapshot = world.room.stateSnapshot();
  const sizes = keys.map((k) => Buffer.byteLength(typeof snapshot[k] === "string" ? (snapshot[k] as string) : JSON.stringify(snapshot[k])));
  assert.ok(Math.max(...sizes) < 16384, `largest leaf ${Math.max(...sizes)} bytes`);
  assert.ok(Math.max(...sizes) < 4000, `a rack leaf stays small: ${Math.max(...sizes)} bytes`);
  const budget = leafBudget(world.bindings, (type) => {
    const cls = game.behaviours[type];
    return cls ? { synced: (cls.synced ?? []).length, perPlayer: cls.perPlayer === true } : null;
  });
  assert.equal(budget.slots, 13, "Game, 4 Players, 4 CupsManagers, 4 Balls (PORT.md 3.1)");
  assert.ok(keys.length <= budget.spaceLeaves, `${keys.length} keys used, ${budget.spaceLeaves} budgeted`);
  assert.ok(budget.instancesPerRoom >= 50, `${budget.instancesPerRoom} tables fit in one room`);
  assert.equal(world.room.stats.rateLimited, 0);
  assert.equal(world.room.stats.refusedWrites, 0);
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("a player leaves mid-throw, with the ball in a cup, and while holding it: the referee finishes each once", async () => {
  const world = newWorld(12);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  const cat = world.join({ name: "Cat" });
  await settle(world);
  assert.equal(world.instance(bob).networking.Master?.displayName, "Ann", "Ann, who came first, is the referee");

  // 1. Ann (the referee) throws and leaves while the ball is in the air: a miss, the ball goes to side 1
  await throwBall(world, ann);
  assert.equal(B(world, bob)._state[0], BallState.Flying);
  world.leave(ann);
  await world.run(8000);
  for (const c of [bob, cat]) {
    assert.equal(B(world, c)._state[0], BallState.Idle, `${c.name}: the ball is back`);
    assert.equal(B(world, c).CurrentPlayer, 1, "a throw that never landed is a miss");
    assert.equal(c.object(SLUG, "0", "ball0").layer, 20, "and it can be picked up");
  }
  assert.equal(P(world, bob, 0)._numberOfThrows, 1);

  // 2. Bob throws for side 1 into a cup, it is counted, and he leaves before the cup is taken away
  const target = cupIndices(CM(world, bob, 0))[3]!;
  await throwBall(world, bob);
  contact(world, [bob], bob, { side: 0, index: target });
  await world.run(800);
  assert.equal(P(world, cat, 1)._score, 1);
  world.leave(bob);
  await world.run(8000);
  assert.equal(B(world, cat)._state[0], BallState.Idle, "Cat, the referee now, finished the turn");
  assert.equal(P(world, cat, 1)._score, 1, "counted once, not again by the new owner");
  assert.equal(CM(world, cat, 0).SyncedCount, 14, "and the cup was removed");
  assert.equal(B(world, cat).CurrentPlayer, 1, "the scorer's side keeps the ball");

  // 3. Dan joins, picks the ball up and leaves holding it: it respawns for the same side
  const dan = world.join({ name: "Dan" });
  await world.settle();
  await world.run(1500);
  assert.ok(dan.grab(SLUG, "0", "ball0"));
  await world.run(500);
  assert.equal(B(world, cat)._state[0], BallState.InHand);
  assert.equal(cat.object(SLUG, "0", "ball0").layer, 5, "nobody else can take it meanwhile");
  world.leave(dan);
  await world.run(8000);
  assert.equal(B(world, cat)._state[0], BallState.Idle);
  assert.equal(B(world, cat).CurrentPlayer, 1);
  assert.deepEqual(problems(world), []);
});

test("a late joiner sees the racks, the scores and the ball as they are", async () => {
  const world = newWorld(13);
  const ann = world.join({ name: "Ann", elements: [{ shape: "square", rows: "3", players: "3" }] });
  const bob = world.join({ name: "Bob", elements: [{ shape: "square", rows: "3", players: "3" }] });
  await settle(world);
  await hit(world, ann, 1, cupIndices(CM(world, ann, 1))[0]!);
  await hit(world, ann, 2, cupIndices(CM(world, ann, 2))[4]!);
  await miss(world, ann);
  await setToggle(world, bob, "p1_pointsPopup", false);

  const cat = world.join({ name: "Cat", elements: [{ shape: "square", rows: "3", players: "3" }] });
  await world.settle();
  await world.run(2000);
  assert.equal(world.instance(cat).networking.StartKind, "joined");
  for (const s of [0, 1, 2]) assert.deepEqual(cupIndices(CM(world, cat, s)), cupIndices(CM(world, ann, s)), `side ${s} as Ann has it`);
  assert.equal(kitCups(cat).size, 9 + 8 + 8, "Cat's kit holds the cups that are left, at once");
  assert.equal(P(world, cat, 0)._score, 2);
  assert.equal(cat.graph(SLUG).text.get("p0score"), "0002");
  assert.equal(G(world, cat)._playerCount, 3);
  assert.equal(G(world, cat)._showPointsPopup, false);
  assert.equal(lastOp(cat, "uiSetToggle", "p2_pointsPopup")?.[0], "0", "Cat's panels show the settings in play");
  assert.equal(B(world, cat).CurrentPlayer, 1);
  assert.equal(B(world, cat)._state[0], BallState.Idle);
  assert.equal(cat.graph(SLUG).active.get("table3"), true);
  // and Cat can play on: he throws for side 1 and hits side 0
  await hit(world, cat, 0, cupIndices(CM(world, cat, 0))[0]!);
  assert.equal(P(world, ann, 1)._score, 1);
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("two tables in one room keep their racks, scores and balls apart", async () => {
  const world = newWorld(14);
  const tables = [{ room: "north", rows: "3" }, { room: "south", rows: "4" }];
  const ann = world.join({ name: "Ann", elements: tables });
  const bob = world.join({ name: "Bob", elements: tables });
  await settle(world, "north");
  await settle(world, "south");
  assert.equal(CM(world, bob, 1, "north").SyncedCount, 6);
  assert.equal(CM(world, bob, 1, "south").SyncedCount, 10);

  await hit(world, ann, 1, cupIndices(CM(world, ann, 1, "north"))[0]!, "north");
  await miss(world, bob, "south");
  // a ball of the north table touching a cup of the south table (another kit: own = 0) only bounces
  await throwBall(world, ann, 0, "north");
  const southCup = CM(world, ann, 1, "south").List[0]!.name;
  contact(world, [ann], ann, { name: southCup, own: false, inst: "north" });
  await world.run(300);
  assert.equal(B(world, ann, 0, "north")._state[0], BallState.Flying, "another table's cup is not a hit and not a miss");
  await world.run(2000);

  for (const c of [ann, bob]) {
    assert.equal(CM(world, c, 1, "north").SyncedCount, 5);
    assert.equal(CM(world, c, 1, "south").SyncedCount, 10);
    assert.equal(P(world, c, 0, "north")._score, 1);
    assert.equal(P(world, c, 0, "south")._score, 0);
    assert.equal(B(world, c, 0, "south").CurrentPlayer, 1);
    assert.equal(kitCups(c, "north").size, 11);
    assert.equal(kitCups(c, "south").size, 20);
  }
  const north = world.room.stateKeys(statePrefix(SLUG, "north"));
  const south = world.room.stateKeys(statePrefix(SLUG, "south"));
  assert.ok(north.length > 0 && south.length > 0);
  assert.ok(north.every((k) => !south.includes(k)));
  assert.ok(world.agree("north") && world.agree("south"));
  assert.deepEqual(problems(world), []);
});

test("desktop: holding the throw key charges the throw, letting go throws along the ball's forward axis", async () => {
  const world = newWorld(15);
  const ann = world.join({ name: "Ann", elements: [{ "throw-key": "R" }] });
  const bob = world.join({ name: "Bob", elements: [{ "throw-key": "R" }] });
  await settle(world);
  assert.ok(ann.grab(SLUG, "0", "ball0"));
  await world.run(300);
  ann.input({ type: "key", key: "R", pressed: true });
  await world.run(600);
  ann.input({ type: "key", key: "R", pressed: false });
  // GameObject.ReleaseGrab() lets go: the fake host raises the drop itself
  await world.run(400);
  const ball = B(world, bob);
  assert.equal(ball._state[0], BallState.Flying);
  // charge ~0.6 s of 1 s -> speed min(5, 0.6 * 5) * 1 = 3 m/s (Ball.cs:552-563), then aim assist (strength 0.3) may bend it
  const v = ball._start_velocity;
  assert.ok(v.magnitude > 1 && v.magnitude < 8, `speed ${v.magnitude}`);
  const launch = ann.graph(SLUG).records.filter((r) => r.op === "rbKinematic" && r.args[0] === "0");
  assert.equal(launch.length, 1, "the thrower's page makes the ball dynamic once");
  const velocities = ann.graph(SLUG).records.filter((r) => r.op === "rbVelocity" && r.args.some((a) => Number(a) !== 0));
  assert.equal(velocities.length, 1, "and gives it the throw's velocity once");
  assert.deepEqual(velocities[0]!.args.map(Number).map((n) => n.toFixed(3)), [v.x, v.y, v.z].map((n) => n.toFixed(3)));
  const bobs = bob.graph(SLUG).records.filter((r) => r.target === bindings.refs.indexOf("ball0").toString() && r.op.startsWith("rb"));
  assert.ok(bobs.length > 0 && bobs.every((r) => r.op === "rbVelocity" ? r.args.every((a) => Number(a) === 0) : r.args[0] === "1"),
    "other pages only ever keep the ball kinematic");
  assert.equal(ann.graph(SLUG).floats.get("ball0Bar/_Cutoff"), "1.01", "the charge bar is cleared");
  assert.deepEqual(problems(world), []);
});

test("AI against AI: turns pass, AI throws and hits are not counted, nothing stalls", async () => {
  const world = newWorld(16);
  const ann = world.join({ name: "Ann" });
  const bob = world.join({ name: "Bob" });
  await settle(world);
  await setToggle(world, ann, "p0_ai", true);
  await setToggle(world, ann, "p1_ai", true);
  // the AI side's ball is waiting already: nobody scheduled a turn, so the referee starts one (item 98)
  const turns: number[] = [];
  for (let i = 0; i < 12; i++) {
    await world.run(2500);
    turns.push(B(world, bob).CurrentPlayer);
  }
  assert.ok(new Set(turns).size === 2, `both sides threw: ${turns.join("")}`);
  for (const c of [ann, bob]) {
    assert.equal(P(world, c, 0)._numberOfThrows, 0, "AI throws are not counted (Game.cs:470)");
    assert.equal(P(world, c, 1)._numberOfThrows, 0);
    assert.ok(P(world, c, 0)._lastAimAssistStrength > 0, "the AI publishes its skill as the last assist");
  }
  assert.ok(ann.graph(SLUG).records.some((r) => r.op === "rbKinematic" && r.args[0] === "0"), "the AI launched balls");
  assert.ok(world.agree());
  assert.deepEqual(problems(world), []);
});

test("aim assist: strength 0 leaves the throw alone; a throw that would land near a cup is steered into it", async () => {
  const world = newWorld(17);
  const ann = world.join({ name: "Ann" });
  await settle(world);
  const ball = B(world, ann);
  const cup = CM(world, ann, 1).List[0]!;
  const start = G(world, ann).GetBallSpawn(0).position.add(new Vector3(0, 0.4, 0));
  const v = new Vector3(0.05, 1.2, 1.9);
  assert.deepEqual(ball.DoAimAssistVectoring(v, start, 0), v);
  // the optimal throw into that cup crosses the cup opening's height over the opening (Ball.cs:723-755)
  const best = ball.OptimalVectorChangeStrength(v, start, cup);
  const opening = cup.position.add(new Vector3(0, cup.GlobalHeight + G(world, ann).BallRadius(), 0));
  const t = ball.PredictTableHitTime(best, start, opening.y - G(world, ann).BallRadius());
  const at = ball.PositionAt(start, best, t);
  assert.ok(Math.hypot(at.x - opening.x, at.z - opening.z) < 0.01, `lands ${Math.hypot(at.x - opening.x, at.z - opening.z)} m from the opening`);
});

test("scoring and collision rules per mode (Game.cs:478-511), on a live table", async () => {
  const world = newWorld(18);
  const ann = world.join({ name: "Ann", elements: [{ players: "4" }] });
  await settle(world);
  const g = G(world, ann);
  const p = (i: number) => P(world, ann, i);
  // Normal, no teams: own cup -1, other cup 1, rim 2; own cups only with self fire
  assert.deepEqual([g.AddToScore(0, 0, 0), g.AddToScore(0, 1, 0), g.AddToScore(0, 1, 1)], [-1, 1, 2]);
  assert.equal(g.AllowCollision(0, p(0), p(0)), false);
  g._allowSelfFire = true;
  assert.equal(g.AllowCollision(0, p(0), p(0)), true);
  // teams (0+2 against 1+3): a team-mate's cup -3, allowed only with friendly fire
  g.DoTeams = true;
  assert.equal(g.AddToScore(0, 2, 0), -3);
  assert.equal(g.AllowCollision(0, p(2), p(2)), true);
  g._allowFriendlyFire = false;
  assert.equal(g.AllowCollision(0, p(2), p(2)), false);
  assert.equal(g.AllowCollision(0, p(1), p(1)), true);
  // King of the Hill and Big Pong: 2, rim 1, any cup
  g._gameMode = GameMode.KingOfTheHill;
  assert.deepEqual([g.AddToScore(0, 0, 0), g.AddToScore(0, 1, 1)], [2, 1]);
  assert.equal(g.AllowCollision(0, p(0), p(0)), true);
  g._gameMode = GameMode.BigPong;
  assert.deepEqual([g.AddToScore(3, 0, 0), g.AddToScore(3, 0, 1)], [2, 1]);
  // Mayhem: any cup not standing on the thrower's own side; one of the thrower's own colour costs 1
  g._gameMode = GameMode.Mayham;
  assert.equal(g.AllowCollision(1, p(1), p(2)), true);
  assert.equal(g.AllowCollision(1, p(2), p(1)), false);
  g.DoTeams = false;
  assert.equal(g.AddToScore(1, 1, 0), -1);
  // turns: Normal and Big Pong pass to the next side with cups (Game.cs:544-557); KotH and Mayhem keep the ball
  g._gameMode = GameMode.Normal;
  CM(world, ann, 1)._existing_glasses_count = 0;
  assert.equal(g.GetNextPlayer(0), 2, "side 1 has no cups: skipped");
  assert.equal(g.GetNextPlayer(3), 0);
  g._gameMode = GameMode.Mayham;
  assert.equal(g.GetNextPlayer(2), 2);
});
