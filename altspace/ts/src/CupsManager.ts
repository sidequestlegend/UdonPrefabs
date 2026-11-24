// _Internal/BeerPong/scripts/CupsManager.cs (Thryrallo/UdonPrefabs, MIT). Line numbers in comments are upstream's.
//
// Changes (PORT.md section 10):
//   - Cups appear and disappear at once: _SyncGlass's one-grid-position-per-frame walk (:421-478) becomes one pass
//     over the 242 positions, and only what changed is sent to the kit (game op `cup`).
//   - Bug fixed: re-creating a cup whose owner, scale, anchor or offset changed appended the new copy to
//     _activeCupsList as well as putting it in the old copy's place (:456-459 with :548), so the list grew a
//     duplicate each time. Here the new copy only takes the old one's place.
//   - Bug fixed: a HashTag rerack lost cups (see RerackInternal).
//   - Init's "owner resets the rack" (:78-81) happens in Game.OnInstanceStart for a fresh table, so a player who
//     arrives later never resets a rack in play.
//   - Bug fixed: a hit's removal (:169-184) took the rack's ownership and wrote the whole grid from the hitter's copy,
//     so two hits on one rack at nearly the same moment (several balls) lost one removal. A hit now asks the referee
//     (RequestRemoveCup, a command), which removes each requested cup from its own copy, one request at a time.

import { Quaternion, Vector3 } from "../portkit/src/index.ts";
import { Cup, type CupTemplate } from "./Cup.ts";
import type { Player } from "./Player.ts";
import { CUP_TEMPLATE, CupPlace } from "./PortOps.ts";
import { SimpleUISetterExtension } from "./SimpleUISetterExtension.ts";
import { CastInt } from "./CSharp.ts";

/** CupsManager.cs:11-18 */
export const CupsShape = { None: -1, Triangle: 0, Square: 1, Circle: 2, HashTag: 3 } as const;

/** GameMode values (Game.cs:10-16), repeated here to avoid an import cycle. */
const MODE_MAYHAM = 3;
const MODE_NORMAL = 0;

export class CupsManager extends SimpleUISetterExtension {
  static override synced = ["_cupOwnersAtPositions", "_scale", "_anchor_id", "_position_offset", "_hit", "_existing_glasses_count", "_shape", "_rows"];
  static override fieldChangeCallbacks = { _shape: "Shape", _rows: "Rows" };
  /** Run for another client only on the referee, as a command: a hit's cup removal (RequestRemoveCup). */
  static override networkCallable: readonly string[] = ["RemoveCupCommand"];

  static readonly PLAYER_VALUE_NONE = 255;
  static readonly MAX_ROWS = 11;
  X_PER_ROW = 22;

  // bindings.json
  Glass!: CupTemplate;
  /** Upstream `Player` (renamed: the runtime's Behaviour already has a `Player` member). */
  SidePlayer!: Player;

  /** The measured template (upstream: the `Cup` on `[ThryBP]glass`). */
  private _glass!: Cup;
  private _activeCupsByPosition: Array<Cup | null> = [];
  private _activeCupsList: Cup[] = [];
  private _activeCupsLength = 0;

  // [UdonSynced] (:33-39, :84, :95)
  _cupOwnersAtPositions: number[] = new Array(11 * 22).fill(255);
  _scale = 1;
  _anchor_id = 0;
  _position_offset = Vector3.zero;
  _hit = 0;
  _existing_glasses_count = 0;
  _shape: number = CupsShape.Triangle;
  _rows = 5;

  private _overwriteShape: number = CupsShape.None;
  private _overwriteRows = -1;

  get List(): Cup[] {
    return this._activeCupsList;
  }
  get Length(): number {
    return this._activeCupsLength;
  }
  get SyncedCount(): number {
    return this._existing_glasses_count;
  }
  /**
   * Glass.GlobalHeight. Bug fixed: upstream's template never gets a TableScaleTransform (only copies do, :540), so
   * this threw in Udon when the AI aimed in King of the Hill or Big Pong (Game.cs:366, :372).
   */
  get GlobalHeight(): number {
    return this._glass.GlobalHeight;
  }
  get LocalHeight(): number {
    return this._glass.LocalHeight * this._scale;
  }
  get UnscaledLocalLength(): number {
    return this._glass.LocalDiameter;
  }
  /** CupAnchor.position (:52): the world position of the anchor in use. */
  get CupAnchorPosition(): Vector3 {
    return this.SidePlayer.GameManager.AnchorWorldPosition(this.SidePlayer.PlayerIndex, this._anchor_id);
  }

  protected override get LogPrefix(): string {
    return "Thry.BeerPong.CupsManager";
  }

  /** CupsManager.cs:56-82. The anchors are the Game's (AnchorPose); the owner's first reset is Game's job. */
  Init(): void {
    this._glass = new Cup(this);
    this._glass.InitPrefab(this.Glass);
    this.X_PER_ROW = CupsManager.MAX_ROWS + CupsManager.MAX_ROWS;
    const size = CupsManager.MAX_ROWS * this.X_PER_ROW;
    this._activeCupsByPosition = new Array<Cup | null>(size).fill(null);
    this._activeCupsList = [];
    this._activeCupsLength = 0;
    if (this._cupOwnersAtPositions.length !== size) this._cupOwnersAtPositions = new Array(size).fill(CupsManager.PLAYER_VALUE_NONE);
  }

  /** :84-93 */
  get Shape(): number {
    return this._shape;
  }
  set Shape(value: number) {
    this._shape = value;
    this.VariableChangedFromBehaviour("_shape");
  }

  /** :95-104 */
  get Rows(): number {
    return this._rows;
  }
  set Rows(value: number) {
    this._rows = value;
    this.VariableChangedFromBehaviour("_rows");
  }

  SetRows(r: number): void {
    this.Rows = r;
  }

  /** :112-117 */
  ResetGlasses(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this.ResetGlassesInternal();
  }

  /** :119-124 */
  NetworkChanges(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this.RequestSerialization();
  }

  /** :126-132 */
  Rerack(): void {
    if (this.SidePlayer.GameManager.Gamemode !== MODE_NORMAL) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this.RerackInternal();
  }

  /** :134-140 */
  ChangeConfiguration(scale: number, anchor_id: number, position_offset: Vector3): void {
    this._scale = scale;
    this._anchor_id = anchor_id;
    this._position_offset = position_offset.clone();
  }

  /** :142-147 */
  SetOverwrite(shape: number, rows: number): void {
    this._overwriteRows = rows;
    this._overwriteShape = shape;
  }

  /** :149-154 (the one-argument overload) */
  SetOverwriteRows(rows: number): void {
    this._overwriteRows = rows;
    this._overwriteShape = CupsShape.None;
  }

  /** :156-161 */
  DisableOverwrite(): void {
    this._overwriteRows = -1;
    this._overwriteShape = CupsShape.None;
  }

  /** :163-167 */
  GetCup(r: number, c: number): Cup | null {
    return this._activeCupsByPosition[r * this.X_PER_ROW + c] ?? null;
  }

  /** The cup copy at a grid index, or null. */
  CupAtIndex(index: number): Cup | null {
    return this._activeCupsByPosition[index] ?? null;
  }

  /** :169-184 */
  RemoveCup(row: number, collum: number): void {
    if (this._cupOwnersAtPositions === null) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    const index = row * this.X_PER_ROW + collum;
    if (index < this._cupOwnersAtPositions.length) {
      this._hit++;
      this._existing_glasses_count--;
      this._cupOwnersAtPositions[index] = CupsManager.PLAYER_VALUE_NONE;
      this.SyncGlasses();
      this.RequestSerialization();
    }
  }

  /**
   * A hit's removal, asked of the referee: it removes the cup from its own copy of the rack (RemoveCup) and writes the
   * rack, so removals asked at the same moment are merged, not lost. `owner` is whose cup the hitter saw there.
   */
  RequestRemoveCup(row: number, collum: number): void {
    const index = row * this.X_PER_ROW + collum;
    this.SendCommand("RemoveCupCommand", row, collum, this._cupOwnersAtPositions[index] ?? CupsManager.PLAYER_VALUE_NONE);
  }

  /** The referee's side of RequestRemoveCup. A cup already gone (a second report of it) or replaced is left alone. */
  RemoveCupCommand(row: unknown, collum: unknown, owner: unknown): void {
    if (!this.Networking.IsReferee) return;
    const int = (v: unknown, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < hi;
    if (!int(row, CupsManager.MAX_ROWS) || !int(collum, this.X_PER_ROW)) return;
    const index = (row as number) * this.X_PER_ROW + (collum as number);
    const there = this._cupOwnersAtPositions[index];
    if (there === CupsManager.PLAYER_VALUE_NONE || there !== owner) return;
    this.RemoveCup(row as number, collum as number);
  }

  /** :187-191 */
  override OnDeserialization(): void {
    if (this._cupOwnersAtPositions !== null) this.SyncGlasses();
  }

  // ======= Array reseting ========

  /** :195-240 */
  RerackInternal(): void {
    for (let i = 0; i < this._cupOwnersAtPositions.length; i++) this._cupOwnersAtPositions[i] = CupsManager.PLAYER_VALUE_NONE;

    let remove = 0;
    let rows = 0;
    const n = this._existing_glasses_count;
    switch (this.Shape) {
      case CupsShape.Square:
        rows = CastInt(Math.sqrt(n - 0.1)) + 1;
        break;
      case CupsShape.Circle:
        rows = CastInt(Math.sqrt((n - 0.1) * 2)) + 1;
        break;
      case CupsShape.HashTag:
        rows = CastInt(Math.sqrt(n - 0.1)) + 1;
        break;
      default:
        // sqrt(2 x+0.25)-0.5
        rows = CastInt(Math.sqrt(2 * (n - 0.1) + 0.25) - 0.5) + 1;
        break;
    }
    let placed = this.PlaceRows(rows);
    // Bug fixed: upstream places `rows` only, and a HashTag rack (which holds 0, 5, 16, 33, 56 or 85 cups) then lost
    // the cups that did not fit, e.g. 6 left became 5 (vectors/upstream.json, reracks.hashtag). Here rows are added
    // until the remaining cups fit (never beyond what 12 rows hold, the most the grid can take).
    while (placed < n && rows > 0 && rows <= CupsManager.MAX_ROWS) {
      rows++;
      for (let i = 0; i < this._cupOwnersAtPositions.length; i++) this._cupOwnersAtPositions[i] = CupsManager.PLAYER_VALUE_NONE;
      placed = this.PlaceRows(rows);
    }
    remove = placed - n;

    // Remove glasses placed too many
    for (let i = this._cupOwnersAtPositions.length - 1; i >= 0; i--) {
      if (this._cupOwnersAtPositions[i] !== CupsManager.PLAYER_VALUE_NONE && remove > 0) {
        this._cupOwnersAtPositions[i] = CupsManager.PLAYER_VALUE_NONE;
        remove--;
        if (remove === 0) break;
      }
    }

    this.SyncGlasses();
    this.RequestSerialization();
  }

  /** The shape's placement for a row count (the switch of :206-225). */
  private PlaceRows(rows: number): number {
    switch (this.Shape) {
      case CupsShape.Square:
        return this.PlaceCupsAsSquare(rows);
      case CupsShape.Circle:
        return this.PlaceCupsAsCircle(rows);
      case CupsShape.HashTag:
        return this.PlaceCupsAsHashtag(rows);
      default:
        return this.PlaceCupsAsPyramid(rows);
    }
  }

  /** :242-280 */
  ResetGlassesInternal(): void {
    for (let i = 0; i < this._cupOwnersAtPositions.length; i++) this._cupOwnersAtPositions[i] = CupsManager.PLAYER_VALUE_NONE;

    let placeRows = this.Rows;
    let shape = this.Shape;
    if (this._overwriteRows > -1) placeRows = this._overwriteRows;
    if (this._overwriteShape !== CupsShape.None) shape = this._overwriteShape;

    switch (shape) {
      case CupsShape.Square:
        this._existing_glasses_count = this.PlaceCupsAsSquare(placeRows);
        break;
      case CupsShape.Circle:
        this._existing_glasses_count = this.PlaceCupsAsCircle(placeRows);
        break;
      case CupsShape.HashTag:
        this._existing_glasses_count = this.PlaceCupsAsHashtag(placeRows);
        break;
      default:
        this._existing_glasses_count = this.PlaceCupsAsPyramid(placeRows);
        break;
    }
    if (this.SidePlayer.GameManager.Gamemode === MODE_MAYHAM) this.RandomizeCupOwnersOfExistingCups();

    this._hit = 0;
    this.SyncGlasses();
    this.RequestSerialization();
  }

  /** :282-292 */
  private RandomizeCupOwnersOfExistingCups(): void {
    const max = this.SidePlayer.GameManager.Players.length;
    for (let i = 0; i < this._cupOwnersAtPositions.length; i++) {
      if (this._cupOwnersAtPositions[i] !== CupsManager.PLAYER_VALUE_NONE) this._cupOwnersAtPositions[i] = this.Random.RangeInt(0, max);
    }
  }

  /** :294-320 */
  PlaceCupsAsPyramid(placeRows: number): number {
    const MAX_ROWS = CupsManager.MAX_ROWS;
    let existing_glasses_count = 0;
    for (let r = 0; r < MAX_ROWS; r++) {
      const evenRow = (placeRows - r) % 2 === 0;
      const cupsInRow = placeRows - r + 1;
      for (let c = 0; c < this.X_PER_ROW; c++) {
        if (r < placeRows) {
          const evenCollum = c % 2 === 0;
          const isInTriangle = Math.abs(c - MAX_ROWS) < cupsInRow;
          const isCup = evenRow === evenCollum && isInTriangle;
          if (isCup) {
            this._cupOwnersAtPositions[r * this.X_PER_ROW + c] = this.SidePlayer.PlayerIndex;
            existing_glasses_count++;
          }
        }
      }
    }
    return existing_glasses_count;
  }

  /** :322-347 */
  PlaceCupsAsSquare(placeRows: number): number {
    const MAX_ROWS = CupsManager.MAX_ROWS;
    let existing_glasses_count = 0;
    const placeOnEvens = placeRows % 2 === 0;
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < this.X_PER_ROW; c++) {
        if (r < placeRows) {
          const evenCollum = c % 2 === 0;
          const isInSquare = Math.abs(c - MAX_ROWS) < placeRows;
          const isCup = evenCollum === placeOnEvens && isInSquare;
          if (isCup) {
            this._cupOwnersAtPositions[r * this.X_PER_ROW + c] = this.SidePlayer.PlayerIndex;
            existing_glasses_count++;
          }
        }
      }
    }
    return existing_glasses_count;
  }

  /** :349-391. `placeRows / 2` is C# integer division (:353). */
  PlaceCupsAsCircle(placeRows: number): number {
    const MAX_ROWS = CupsManager.MAX_ROWS;
    let existing_glasses_count = 0;
    const isRowsCountEven = placeRows % 2 === 0;
    const radius = Math.trunc(placeRows / 2);
    let middleOfCircleY = radius;
    if (isRowsCountEven) middleOfCircleY -= 0.5;
    let placeOnEven: boolean;
    for (let r = 0; r < MAX_ROWS; r++) {
      const evenRow = (placeRows - r) % 2 === 0;
      if (isRowsCountEven) {
        placeOnEven = isRowsCountEven === evenRow;
        if (r > middleOfCircleY) placeOnEven = !placeOnEven; // mirror for rows bigger than radius
      } else {
        placeOnEven = isRowsCountEven === !evenRow;
      }
      for (let c = 0; c < this.X_PER_ROW; c++) {
        if (r < placeRows && (c % 2 === 0) === placeOnEven) {
          const x = (c - MAX_ROWS) / 2.0;
          let y = Math.abs(r - middleOfCircleY);
          if (y < 1) y = 0; // done to prevent weird bumps in the sides
          const isInCircle = Math.pow(x, 2) + Math.pow(y, 2) <= Math.pow(radius, 2);
          if (isInCircle) {
            this._cupOwnersAtPositions[r * this.X_PER_ROW + c] = this.SidePlayer.PlayerIndex;
            existing_glasses_count++;
          }
        }
      }
    }
    return existing_glasses_count;
  }

  /** :393-419 */
  PlaceCupsAsHashtag(placeRows: number): number {
    const MAX_ROWS = CupsManager.MAX_ROWS;
    let existing_glasses_count = 0;
    // always odd number of rows
    placeRows = Math.trunc(placeRows / 2) * 2 + 1;
    const oddCollumns = Math.trunc((placeRows - 1) / 2) % 2 === 0;
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < this.X_PER_ROW; c++) {
        if (r < placeRows) {
          const isInSquare = Math.abs(c - MAX_ROWS) < placeRows;
          const isCorrectRow = r % 2 === 1;
          const isCorrectCollumn = oddCollumns ? c % 4 === 1 : c % 4 === 3;
          const isInCorrectRowCollumn = c % 2 === 1;
          if (((isCorrectRow && isInCorrectRowCollumn) || (!isCorrectRow && isCorrectCollumn)) && isInSquare) {
            this._cupOwnersAtPositions[r * this.X_PER_ROW + c] = this.SidePlayer.PlayerIndex;
            existing_glasses_count++;
          }
        }
      }
    }
    return existing_glasses_count;
  }

  // ======= Glasses syncing ========

  /** :426-478, in one pass. */
  SyncGlasses(): void {
    if (!this._glass) return;
    for (let index = 0; index < this._cupOwnersAtPositions.length; index++) {
      const syncR = Math.trunc(index / this.X_PER_ROW);
      const syncC = index % this.X_PER_ROW;
      const owner = this._cupOwnersAtPositions[index]!;
      const existing = this._activeCupsByPosition[index] ?? null;
      if (owner !== CupsManager.PLAYER_VALUE_NONE) {
        if (existing) {
          // Cup is Incorrect
          if (
            existing.PlayerCupOwner.PlayerIndex !== owner ||
            existing.localScale !== this._scale ||
            existing.Anchor_id !== this._anchor_id ||
            !existing.Position_offset.equals(this._position_offset)
          ) {
            const indexList = this._activeCupsList.indexOf(existing);
            this.EmitCup(existing, false);
            this.InstanciateCup(syncR, syncC, index, owner, indexList);
          }
        } else {
          this.InstanciateCup(syncR, syncC, index, owner, -1);
        }
      } else if (existing) {
        this.DestroyCup(existing);
      }
    }
  }

  /** :480-493 */
  RemoveLocalGlasses(): void {
    for (let index = 0; index < this._activeCupsByPosition.length; index++) {
      const cup = this._activeCupsByPosition[index];
      if (cup) this.DestroyCup(cup);
    }
  }

  /**
   * :495-509. `force` (the port's): recolour even with random colours on, used when the random-colour flag itself
   * changes; see Player.DoRandomColor.
   */
  SyncColor(force = false): void {
    if (this.SidePlayer.DoRandomColor && !force) return; // upstream: random colours are not re-synced on a colour change
    for (let index = 0; index < this._activeCupsByPosition.length; index++) {
      const cup = this._activeCupsByPosition[index];
      if (this._cupOwnersAtPositions[index] !== CupsManager.PLAYER_VALUE_NONE && cup) cup.UpdateColor(index);
    }
  }

  /** :513-519 */
  DestroyCup(cup: Cup): void {
    const index = this._activeCupsList.indexOf(cup);
    if (index >= 0) {
      this._activeCupsList[index] = this._activeCupsList[this._activeCupsLength - 1]!;
      this._activeCupsLength--;
      this._activeCupsList.length = this._activeCupsLength;
    }
    if (this._activeCupsByPosition[cup.index] === cup) this._activeCupsByPosition[cup.index] = null;
    this.EmitCup(cup, false);
  }

  /** :521-551. `replaceAt` >= 0: the new copy takes the old copy's place in the list (bug fix, see the header). */
  InstanciateCup(row: number, collum: number, index: number, cupOwner: number, replaceAt: number): void {
    const relativeX = collum - CupsManager.MAX_ROWS;
    const position = new Vector3(relativeX * this._glass.LocalRadius * this._scale, 0, row * this._glass.LocalDiameter * this._scale);

    const cup = new Cup(this);
    cup.localPosition = position.add(this._position_offset);
    cup.localScale = this._scale;
    cup.index = index;
    cup.Row = row;
    cup.Column = collum;
    cup.PlayerCupOwner = this.SidePlayer.GameManager.Players[cupOwner]!;
    cup.PlayerAnchorSide = this.SidePlayer;
    cup.Anchor_id = this._anchor_id;
    cup.Position_offset = this._position_offset.clone();

    cup.LocalRadius = this._glass.LocalRadius * this._scale;
    cup.LocalDiameter = this._glass.LocalDiameter * this._scale;
    cup.LocalCircumfrence = this._glass.LocalCircumfrence * this._scale;
    cup.LocalHeight = this._glass.LocalHeight * this._scale;

    this._activeCupsByPosition[index] = cup;
    if (replaceAt >= 0) this._activeCupsList[replaceAt] = cup;
    else this._activeCupsList[this._activeCupsLength++] = cup;

    cup.UpdateColor(index); // sends the `cup` op that makes the copy
  }

  // ---- the kit side of a cup copy (port) ----------------------------------------------------------------------

  /**
   * Makes, moves and colours (on) or destroys (off) the cup copy in the kit: the standard ops `spawn` (a copy of the
   * anchor's inactive `CupTemplate`) and `despawn`, and the game op `cupPlace` (PortOps.ts).
   */
  EmitCup(cup: Cup, on: boolean): void {
    const anchor = this.SidePlayer.GameManager.AnchorPath(this.SidePlayer.PlayerIndex, cup.Anchor_id);
    const path = "@" + anchor + "/" + cup.name;
    if (!on) {
      if (cup.spawned) this.Host.despawn(path);
      cup.spawned = false;
      return;
    }
    if (!cup.spawned) {
      this.Host.spawn("@" + anchor + "/" + CUP_TEMPLATE, cup.name);
      cup.spawned = true;
    }
    CupPlace(this.Host, path, cup.localPosition, cup.localScale, cup.color);
  }

  /** The kit path of a cup copy, for `cupInside`. */
  CupPath(cup: Cup): string {
    return this.SidePlayer.GameManager.AnchorPath(this.SidePlayer.PlayerIndex, cup.Anchor_id) + "/" + cup.name;
  }

  CupWorldPosition(cup: Cup): Vector3 {
    const game = this.SidePlayer.GameManager;
    const anchor = game.AnchorPose(this.SidePlayer.PlayerIndex, cup.Anchor_id);
    return game.KitToWorld(anchor.position.add(anchor.rotation.rotate(cup.localPosition)));
  }

  AnchorWorldRotation(anchorId: number): Quaternion {
    const game = this.SidePlayer.GameManager;
    return game.KitToWorldRotation(game.AnchorPose(this.SidePlayer.PlayerIndex, anchorId).rotation);
  }

  TableLossyScale(): number {
    return this.SidePlayer.GameManager.LossyScale();
  }

  /** For tests and the debug view: the rack as 11 rows of 22 characters ('.' empty, else the owner's digit). */
  RackText(): string {
    const rows: string[] = [];
    for (let r = 0; r < CupsManager.MAX_ROWS; r++) {
      let row = "";
      for (let c = 0; c < this.X_PER_ROW; c++) {
        const v = this._cupOwnersAtPositions[r * this.X_PER_ROW + c]!;
        row += v === CupsManager.PLAYER_VALUE_NONE ? "." : String(v);
      }
      rows.push(row);
    }
    return rows.join("\n");
  }
}
