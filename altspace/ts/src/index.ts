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
 * Readers for Play-mode tests (window.__pk1.debug["beer-pong:<inst>"]): the table as this page holds it, and the
 * transform reports the page gets of a ball (how often a physics-driven ball's position reaches the page).
 */
function debugHooks(instance: GameInstance): Record<string, unknown> {
  const G = () => instance.behaviour<Game>("game");
  const ball = (i: number) => instance.behaviour<Ball>(`ball${i}`);
  // every pose report of each ball, with the page's clock: the rate the "still for 1 s" and respawn-height checks see
  const reports: Array<Array<{ t: number; y: number }>> = [[], [], [], []];
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
  return {
    pathOf: (key: string) => instance.bindings.objects[key]?.path ?? "",
    /** The page clock the report times use (ms). */
    now: () => instance.platform.clock.now(),
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
      const list = reports[i]!.filter((r) => r.t >= since);
      let gap = 0;
      for (let k = 1; k < list.length; k++) gap = Math.max(gap, list[k]!.t - list[k - 1]!.t);
      return { count: list.length, longestGapMs: gap, first: list[0]?.t ?? 0, last: list[list.length - 1]?.t ?? 0 };
    },
    ballPosition: (i: number) => {
      const p = ball(i).transform.position;
      return [p.x, p.y, p.z];
    },
    /**
     * The AI's throw with skill 1 (Player.AI_Aim / AI_Shoot, Ball.ShootAI): the aimed velocity into the cup nearest
     * where the throw would land, from where the ball is now. The ball's own physics and the ball graph's contact
     * report then decide, as for any throw.
     */
    aimedThrow: (i = 0) => {
      const b = ball(i);
      b.OnPickupAI();
      b.ShootAI(1);
      return b._start_velocity.toString();
    },
    /**
     * A throw with no velocity from where the ball is (the desktop drop of an uncharged ball): it lies still, the
     * miss rule passes the turn. Used to bring the ball to the other side.
     */
    dropThrow: (i = 0) => {
      const b = ball(i);
      b.OnPickupAI();
      b._start_position = b.transform.position;
      b._start_velocity = Vector3.zero;
      (b as unknown as { BeginFlight(): void }).BeginFlight();
    },
  };
}

export default game;
