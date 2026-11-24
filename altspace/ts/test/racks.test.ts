// Rung 1, rules alone: the rack layouts and the rerack rule of CupsManager.ts against
//   (a) layouts worked out by hand from upstream's code (line numbers are CupsManager.cs's), and
//   (b) vectors/upstream.json: upstream's own CupsManager.cs compiled unchanged with dotnet (golden/Harness.cs).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CupsManager, CupsShape } from "../src/CupsManager.ts";

const golden = JSON.parse(readFileSync(fileURLToPath(new URL("../vectors/upstream.json", import.meta.url)), "utf8")) as {
  placements: Record<string, Array<{ rows: number; count: number; cells: string }>>;
  reracks: Record<string, Array<{ n: number; cells: string }>>;
  resets: Array<{ name: string; side: number; count: number; cells: string }>;
};

const SHAPES = ["triangle", "square", "circle", "hashtag"] as const;
const PLACE = { triangle: "PlaceCupsAsPyramid", square: "PlaceCupsAsSquare", circle: "PlaceCupsAsCircle", hashtag: "PlaceCupsAsHashtag" } as const;

/** A CupsManager outside a running table: the grid rules only (no kit, no network). */
function manager(side = 1, mode = 0): CupsManager {
  const m = new CupsManager();
  const players = [0, 1, 2, 3].map((i) => ({ PlayerIndex: i }));
  (m as unknown as { SidePlayer: unknown }).SidePlayer = { PlayerIndex: side, GameManager: { Gamemode: mode, Players: players } };
  m.RequestSerialization = () => {};
  return m;
}

function cells(m: CupsManager): string {
  return m._cupOwnersAtPositions.map((v) => (v === 255 ? "." : String(v))).join("");
}

/** Rows of 22 characters, top row first (row 0 is the rack's back row, CupsManager.cs:523-524). */
function grid(rows: string[]): string {
  return rows.map((r) => r.padEnd(22, ".")).join("").padEnd(242, ".");
}

const count = (text: string) => [...text].filter((c) => c !== ".").length;

test("rack layouts worked out by hand from the code", () => {
  // Triangle, 3 rows (:294-320): row r has a cup where (3 - r) and c have the same parity and |c - 11| < 4 - r.
  let m = manager();
  assert.equal(m.PlaceCupsAsPyramid(3), 6);
  assert.equal(cells(m), grid([".........1.1.1", "..........1.1", "...........1"]));

  // Square, 2 rows (:322-347): even columns (2 rows is even) with |c - 11| < 2, rows 0 and 1.
  m = manager();
  assert.equal(m.PlaceCupsAsSquare(2), 4);
  assert.equal(cells(m), grid(["..........1.1", "..........1.1"]));

  // HashTag, 3 rows (:393-419): rows forced odd (3); (3 - 1) / 2 = 1 is odd, so the posts are at c % 4 == 3; odd rows
  // fill every odd column with |c - 11| < 3.
  m = manager();
  assert.equal(m.PlaceCupsAsHashtag(3), 5);
  assert.equal(cells(m), grid(["...........1", ".........1.1.1", "...........1"]));

  // Circle, 4 rows (:349-391): radius 4 / 2 = 2 (integer division, :353), centre row 1.5; rows 1 and 2 are within one
  // row of the centre so y counts as 0 (:378); x = (c - 11) / 2 must satisfy x^2 + y^2 <= 4.
  m = manager();
  assert.equal(m.PlaceCupsAsCircle(4), 14);
  assert.equal(cells(m), grid(["..........1.1", ".......1.1.1.1.1", ".......1.1.1.1.1", "..........1.1"]));

  // Big Pong: one row of circle is one cup in the middle, a HashTag of one row is none (PORT.md item 70).
  m = manager();
  assert.equal(m.PlaceCupsAsCircle(1), 1);
  assert.equal(cells(m), grid(["...........1"]));
  m = manager();
  assert.equal(m.PlaceCupsAsHashtag(1), 0);
});

test("rerack rules worked out by hand from the code", () => {
  // Triangle with 7 left (:220-223): rows = (int)(sqrt(2 * 6.9 + 0.25) - 0.5) + 1 = 4; a 4-row triangle holds 10, and
  // the 3 surplus go from the highest grid indices (:227-236): row 3's cup and both of row 2's.
  let m = manager();
  m._shape = CupsShape.Triangle;
  m._existing_glasses_count = 7;
  m.RerackInternal();
  assert.equal(cells(m), grid(["........1.1.1.1", ".........1.1.1"]));

  // Square with 5 left (:208-210): rows = (int)sqrt(4.9) + 1 = 3; 9 placed, 4 removed from the end.
  m = manager();
  m._shape = CupsShape.Square;
  m._existing_glasses_count = 5;
  m.RerackInternal();
  assert.equal(cells(m), grid([".........1.1.1", ".........1.1"]));

  // Nothing left: the square, circle and hashtag formulas take sqrt of a negative number (NaN); the rack stays empty.
  for (const shape of [0, 1, 2, 3]) {
    m = manager();
    m._shape = shape;
    m._existing_glasses_count = 0;
    m.RerackInternal();
    assert.equal(count(cells(m)), 0);
  }
});

test("rack layouts match upstream's CupsManager.cs (golden vectors), every shape, rows 0-12", () => {
  let compared = 0;
  for (const shape of SHAPES) {
    for (const v of golden.placements[shape]!) {
      const m = manager(1);
      const placed = (m[PLACE[shape]] as (rows: number) => number).call(m, v.rows);
      assert.equal(placed, v.count, `${shape} ${v.rows} rows: count`);
      assert.equal(cells(m), v.cells, `${shape} ${v.rows} rows: layout`);
      compared++;
    }
  }
  assert.equal(compared, 52);
  // the counts PORT.md derived by hand for rows 1..11 (item 54)
  const counts = (shape: string) => golden.placements[shape]!.slice(1, 12).map((v) => v.count);
  assert.deepEqual(counts("triangle"), [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]);
  assert.deepEqual(counts("square"), [1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121]);
  assert.deepEqual(counts("circle"), [1, 4, 4, 14, 15, 30, 26, 56, 53, 76, 80]);
  assert.deepEqual(counts("hashtag"), [0, 5, 5, 16, 16, 33, 33, 56, 56, 85, 85]);
});

test("reracks match upstream for 0-121 cups left, except the HashTag cases upstream loses cups on (fixed)", () => {
  const capacity = { triangle: 66, square: 121, circle: 80, hashtag: 85 };
  let same = 0;
  const fixed: string[] = [];
  for (const shape of SHAPES) {
    for (const v of golden.reracks[shape]!) {
      const m = manager(1);
      m._shape = SHAPES.indexOf(shape);
      m._existing_glasses_count = v.n;
      m.RerackInternal();
      const mine = cells(m);
      if (mine === v.cells) {
        same++;
        continue;
      }
      // upstream lost cups here; the port keeps them (never more than were left), still taking the surplus from the end
      assert.equal(shape, "hashtag", `only HashTag reracks differ from upstream (${shape} ${v.n})`);
      assert.ok(count(mine) > count(v.cells) && count(mine) <= v.n, `hashtag rerack of ${v.n}: ${count(mine)} kept, upstream ${count(v.cells)}`);
      if (v.n <= capacity.hashtag) assert.equal(count(mine), v.n, `hashtag rerack of ${v.n} keeps every cup`);
      fixed.push(`${v.n}:${count(v.cells)}->${count(mine)}`);
    }
  }
  assert.equal(same + fixed.length, 4 * 122);
  // 55 reachable cases (1 to 81 cups left lose some upstream) and 6 more beyond an 11-row HashTag's 85 cups
  assert.equal(fixed.filter((f) => Number(f.split(":")[0]) <= capacity.hashtag).length, 55, `fixed cases: ${fixed.join(" ")}`);
});

test("ResetGlassesInternal with Game's overwrites matches upstream (King of the Hill tiers 176 cups, Big Pong, inactive side)", () => {
  const byName = new Map(golden.resets.map((r) => [r.name, r]));
  const run = (name: string, side: number, rows: number, shape: number, overwrite: () => (m: CupsManager) => void) => {
    const m = manager(side);
    m._rows = rows;
    m._shape = shape;
    overwrite()(m);
    m.ResetGlassesInternal();
    const v = byName.get(name)!;
    assert.equal(m.SyncedCount, v.count, name);
    assert.equal(cells(m), v.cells, name);
    return m.SyncedCount;
  };
  let koth = 0;
  for (let i = 0; i < 4; i++) koth += run(`king of the hill tier ${i}`, i, 5, CupsShape.Triangle, () => (m) => m.SetOverwrite(CupsShape.Circle, 10 - i * 2));
  assert.equal(koth, 176);
  assert.equal(run("big pong, side 0", 0, 5, CupsShape.Triangle, () => (m) => m.SetOverwriteRows(1)), 1);
  assert.equal(run("big pong, side 0 with hashtag", 0, 5, CupsShape.HashTag, () => (m) => m.SetOverwriteRows(1)), 0);
  assert.equal(run("inactive side", 3, 7, CupsShape.Square, () => (m) => m.SetOverwriteRows(0)), 0);
  assert.equal(run("normal, square 4", 2, 4, CupsShape.Square, () => (m) => m.DisableOverwrite()), 16);
});
