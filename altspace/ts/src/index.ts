// beer-pong: the beer pong table of Thryrallo/UdonPrefabs (`_Internal/BeerPong`, MIT) on the portkit runtime.
// The classes bindings.json names by `type`; the build bundles this with bindings.json into pk-beer-pong.js.

import { Vector3, type GameDefinition, type GameInstance } from "../portkit/src/index.ts";
import { Ball } from "./Ball.ts";
import { CupsManager } from "./CupsManager.ts";
import { Game } from "./Game.ts";
import { Player } from "./Player.ts";
import { PlayerScoreAnnouncement } from "./PlayerScoreAnnouncement.ts";
import { SimpleUIInteract } from "./SimpleUIInteract.ts";
import { SimpleUIOptionSelector } from "./SimpleUIOptionSelector.ts";
import { SimpleUISlider } from "./SimpleUISlider.ts";
import { SimpleUIToggle } from "./SimpleUIToggle.ts";
import { SimpleUIToggleGroup } from "./SimpleUIToggleGroup.ts";
import { ToggleActive } from "./ToggleActive.ts";

const game: GameDefinition = {
  slug: "beer-pong",
  behaviours: {
    Game,
    Player,
    CupsManager,
    Ball,
    PlayerScoreAnnouncement,
    SimpleUIToggle,
    SimpleUISlider,
    SimpleUIOptionSelector,
    SimpleUIInteract,
    SimpleUIToggleGroup,
    ToggleActive,
  },
  debug: (instance: GameInstance) => debugHooks(instance),
};

/**
 * Readers and helpers for Play-mode tests (window.__pk1.debug["beer-pong:<inst>"]): the table as this page holds it,
 * the transform reports the page gets of a ball (how often a physics-driven ball's position reaches the page), and
 * helpers that move the ball or remove a cup. The runtime puts them in the page registry only on a test page
 * (`window.__pk1_debug = true`, which the Play-mode kit test sets first); a published page never has them. Nothing here
 * changes the game until a hook is called: the report counter is installed by the first call of `now` or `reports`.
 */
function debugHooks(instance: GameInstance): Record<string, unknown> {
  const G = () => instance.behaviour<Game>("game");
  const ball = (i: number) => instance.behaviour<Ball>(`ball${i}`);
  // every pose report of each ball, with the page's clock: the rate the "still for 1 s" and respawn-height checks see
  const reports: Array<Array<{ t: number; y: number }>> = [[], [], [], []];
  let counting = false;
  const countReports = () => {
    if (counting) return;
    counting = true;
    for (let i = 0; i < 4; i++) {
      const transform = ball(i).transform;
      const original = transform._report.bind(transform);
      transform._report = (position, rotation) => {
        const list = reports[i]!;
        list.push({ t: instance.platform.clock.now(), y: position.y });
        if (list.length > 2000) list.splice(0, 1000);
        original(position, rotation);
      };
    }
  };
  return {
    refOf: (key: string) => instance.bindings.refs.indexOf(key),
    /** Sends relay records as they are ("<op>|<target>|<args>^..."), for diagnostics. */
    rawRelay: (records: string) => instance.platform.relaySend(`beer-pong:${instance.inst}|${records}`),
    pathOf: (key: string) => instance.bindings.objects[key]?.path ?? "",
    /** The page clock the report times use (ms); from the first call on, the ball's pose reports are counted. */
    now: () => {
      countReports();
      return instance.platform.clock.now();
    },
    me: () => ({ sid: instance.networking.LocalPlayer.sid, name: instance.networking.LocalPlayer.displayName }),
    table: () => {
      const g = G();
      return {
        mode: g._gameMode,
        players: g._playerCount,
        size: g._size,
        teams: g._doTeams,
        barrier: g._useBarrier,
        aimAssist: g._aimAssist,
        settingsOpen: g.Players.map((p) => p._areSettingsOpen),
        tab: g.Players.map((p) => p._settingsNavbar),
        scores: g.Players.map((p) => p._score),
        cups: g.Players.map((p) => p.CupsManager.SyncedCount),
        rows: g.Players.map((p) => p.CupsManager._rows),
        balls: g.Balls.map((b) => ({ state: b._state[0], side: b.CurrentPlayer, holder: b._holder, active: b.gameObject.activeSelf })),
      };
    },
    /** The cup copies this page has made for a side, by name, and where the page puts them. */
    cups: (side: number) => G().Players[side]!.CupsManager.List.map((c) => ({ name: c.name, path: c.manager.CupPath(c), position: [c.position.x, c.position.y, c.position.z] })),
    /** A ball's pose reports since `since` (page clock, ms): count, and the longest gap between two. */
    reports: (i: number, since: number) => {
      countReports();
      const list = reports[i]!.filter((r) => r.t >= since);
      let gap = 0;
      for (let k = 1; k < list.length; k++) gap = Math.max(gap, list[k]!.t - list[k - 1]!.t);
      return { count: list.length, longestGapMs: gap, first: list[0]?.t ?? 0, last: list[list.length - 1]?.t ?? 0 };
    },
    /** Removes the cup at a grid index of a side's rack, as a counted hit does (Game.RemoveCup -> CupsManager.RemoveCup). */
    removeCup: (side: number, index: number) => {
      const m = G().Players[side]!.CupsManager;
      if (m._cupOwnersAtPositions[index] === 255) return false;
      m.RemoveCup(Math.trunc(index / m.X_PER_ROW), index % m.X_PER_ROW);
      return true;
    },
    contactTrace: (i = 0) => ball(i).contactTrace.slice(),
    ballPosition: (i: number) => {
      const p = ball(i).transform.position;
      return [p.x, p.y, p.z];
    },
    /**
     * The AI's throw with skill 1, in its two steps (Player.AI_Aim, then a second later AI_Shoot / Ball.ShootAI): the
     * ball goes to the side's AI spawn point above the table, then flies with the aimed velocity into the cup nearest
     * where the throw would land. The ball's own physics and the ball graph's contact report decide, as for any throw.
     */
    aimPlace: (i = 0) => {
      const b = ball(i);
      b.OnPickupAI();
      const spawn = G().Players[b.CurrentPlayer]!.AiBallSpawnWorld();
      b.SetPositionRotation(spawn.position, spawn.rotation);
      return spawn.position.toString();
    },
    /**
     * As aimShoot, but straight at the opposing cup nearest the ball, on a high arc (Ball.OptimalVectorChangeStrength
     * into that cup's opening, keeping the launch elevation): the AI's own flatter throw at the cup nearest where it
     * lands often clips the rim of a cup in front of it, which the physics ball then bounces off.
     */
    aimShootNearest: (i = 0) => {
      const b = ball(i);
      const g = G();
      const from = b.transform.position;
      let best: { cup: import("./Cup.ts").Cup; d: number } | null = null;
      for (const p of g.Players) {
        if (p.PlayerIndex === b.CurrentPlayer) continue;
        for (const cup of p.CupsManager.List) {
          const d = Vector3.Distance(cup.position, from);
          if (!best || d < best.d) best = { cup, d };
        }
      }
      if (!best) return "no cup";
      // a high arc (as the AI's Big Pong throw, Game.cs:398-414), so the ball comes down into the opening
      const toCup = best.cup.position.sub(from);
      toCup.y = 0;
      const base = toCup.normalized.add(Vector3.up.scale(2)).normalized.scale(5);
      b._start_velocity = b.OptimalVectorChangeStrength(base, from, best.cup);
      b._start_position = from;
      (b as unknown as { BeginFlight(): void }).BeginFlight();
      return `${best.cup.name} ${b._start_velocity.toString()}`;
    },
    /** The ball, held kinematic 0.35 m above an opposing cup (the front one by default), to be let fall (dropThrow). */
    placeAbove: (i = 0, index = -1) => {
      const b = ball(i);
      const g = G();
      const target = g.Players[1 - b.CurrentPlayer]!.CupsManager.List;
      const cup = index >= 0 ? target.find((c) => c.index === index) : target.reduce((a, c) => (c.index > a.index ? c : a), target[0]!);
      if (!cup) return "no cup";
      b.OnPickupAI();
      b.SetPositionRotation(cup.position.add(Vector3.up.scale(0.35)), b.transform.rotation);
      return cup.name;
    },
    aimShoot: (i = 0) => {
      const b = ball(i);
      b.ShootAI(1);
      return b._start_velocity.toString();
    },
    /**
     * A throw with no velocity from where the ball is (the desktop drop of an uncharged ball): it lies still (or
     * falls), a miss rule passes the turn. Used to bring the ball to the other side; call aimPlace first.
     */
    dropThrow: (i = 0) => {
      const b = ball(i);
      b._start_position = b.transform.position;
      b._start_velocity = Vector3.zero;
      (b as unknown as { BeginFlight(): void }).BeginFlight();
    },
  };
}

export default game;
