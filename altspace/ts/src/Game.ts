// _Internal/BeerPong/scripts/Game.cs (Thryrallo/UdonPrefabs, MIT): modes, side count, rules options, scoring, turns.
// Line numbers in comments are upstream's.
//
// Changes (PORT.md section 10):
//   - Not ported (dead upstream): the adaptive aim assist (`_doAdaptiveAimAssist`, UpdateLocalPlayerAdaptiveAimAssist
//     :300-335, the recent-throws ring it reads, :234-237 and :438, :471-474) and the avatar theme colour option
//     (`_useAvatarThemeColor`, :59, :201-215; needs an object the stock prefab does not have).
//   - Bug fixed: the Size setter refreshed the Aim Assist sliders (:119 passes `_aimAssist`); it refreshes Size.
//   - Bug fixed: ResetBalls respawned balls the caller might not own, so the reset never reached others
//     (:719, :727); Ball.Respawn takes ownership first.
//   - Bug fixed: CountCupHit wrote `_recentThrowsHits[-1]` on a client that scores without having thrown (:438);
//     that ring belongs to the dead adaptive aim assist and is gone.
//   - A fresh table takes its starting values from the snippet's attributes (players, mode, rows, shape, size, ...);
//     the owner's start-up writes (Init's ResetGlasses / RequestSerialization) happen once, in OnInstanceStart, for
//     a fresh table only. A table resumed or joined keeps what the room holds.
//   - The table material's indicator colour is set on each table model's own renderer (upstream shares one material
//     instance across the three models of one table, :268-287).
//   - Teleport on a side-count change (:738-779) is kept, but not at start-up, and only when the local player's
//     position is known (the page learns it from pose updates).
//   - The table's frame (where the holder stands, its rotation, scale and the synced size) is computed here: the
//     page cannot read kit transforms back after the script moves things, so world positions of anchors, spawn
//     points and cups come from the layout numbers in bindings.json.

import { Color, Mathf, Quaternion, Vector3, type AnimatorRef, type RendererRef, type StartKind } from "../portkit/src/index.ts";
import type { Ball } from "./Ball.ts";
import type { Cup } from "./Cup.ts";
import { CupsShape } from "./CupsManager.ts";
import type { Player } from "./Player.ts";
import { SendValueOp } from "./PortOps.ts";
import { SimpleUISetterExtension } from "./SimpleUISetterExtension.ts";
import { Angle } from "./Unity.ts";

/** Game.cs:10-16 */
export const GameMode = { Normal: 0, KingOfTheHill: 1, BigPong: 2, Mayham: 3 } as const;

export interface TeamPose {
  position: Vector3;
  /** Degrees about Y. */
  yaw: number;
}

const AIM_ASSIST_DEFAULT = 0.3;
const MODE_NAMES: Record<string, number> = { normal: 0, king: 1, koth: 1, big: 2, "big-pong": 2, mayhem: 3 };
const SHAPE_NAMES: Record<string, number> = { triangle: 0, square: 1, circle: 2, hashtag: 3 };

export class Game extends SimpleUISetterExtension {
  static override synced = [
    "_gameMode",
    "_playerCount",
    "_aimAssist",
    "_size",
    "_useBarrier",
    "_doTeams",
    "_allowSelfFire",
    "_allowFriendlyFire",
    "_doAutoRespawnBalls",
    "_showPointsPopup",
    "_lastAimAssist",
  ];
  static override fieldChangeCallbacks = {
    _gameMode: "Gamemode",
    _playerCount: "PlayerCount",
    _aimAssist: "AimAssist",
    _size: "Size",
    _useBarrier: "UseBarrier",
    _doTeams: "DoTeams",
    _allowSelfFire: "AllowSelfFire",
    _allowFriendlyFire: "AllowFriendlyFire",
    _doAutoRespawnBalls: "DoAutoRespawnBalls",
    _showPointsPopup: "ShowPointsPopup",
    _lastAimAssist: "LastAimAssist",
  };
  /** [FieldChangeCallback] on a field that is not synced (`_volume`, :62). */
  static localChangeCallbacks = { _volume: "Volume" };

  // ---- bindings.json (:21-47) ----
  _initialPlayerColors: Color[] = [Color.red, Color.blue, Color.green, Color.yellow];
  _allowAvatarThemeColorUsage = true;
  _allowAimAssist = true;
  _allowAI = true;
  /** The four Player behaviours in child order of `Players` (upstream finds them at Start, :250-261). */
  PlayersList: Player[] = [];
  _tablesAnimator: AnimatorRef | null = null;
  Balls: Ball[] = [];
  _teamIndicatorMaterialIndex = 3;
  /** Renderers of the table models by side count: [null, null, 2 sides, 3 sides, 4 sides]. */
  _tables: Array<RendererRef | null> = [];
  _twoTeamPositions: TeamPose[] = [];
  _threeTeamPositions: TeamPose[] = [];
  _fourTeamPositions: TeamPose[] = [];
  /** Kit-relative positions of `RespawnHeight`, `KingOfTheHillPosition` (also TableHeight) and its kit path. */
  _respawnHeightLocal = new Vector3(0, 0.4, 0);
  _kingOfTheHillLocal = new Vector3(0, 0.8, 0);
  KingOfTheHillPath = "KingOfTheHillPosition";
  /** The ball's radius at table size 1 (mean renderer bounds extent, Ball.cs:110). */
  ballRadiusLocal = 0.03;

  Players: Player[] = [];

  // ---- [UdonSynced] (:49-64) ----
  _gameMode: number = GameMode.Normal;
  _playerCount = 2;
  _aimAssist = AIM_ASSIST_DEFAULT;
  _size = 1;
  _useBarrier = false;
  _doTeams = false;
  _allowSelfFire = false;
  _allowFriendlyFire = true;
  _doAutoRespawnBalls = true;
  _showPointsPopup = true;
  _volume = 0.5;
  _lastAimAssist = 0;

  private _teamSize = 1;
  /** Owner writes are held back until the instance knows whether the table is fresh, resumed or joined. */
  private _ready = false;

  // the holder's transform (snippet attributes position / rotation / scale)
  private _holderPosition = Vector3.zero;
  private _holderRotation = Quaternion.identity;
  private _holderScale = 1;

  protected override get LogPrefix(): string {
    return "Thry.BeerPong.Game";
  }

  // ---- properties (:68-225) ----

  get Volume(): number {
    return this._volume;
  }
  set Volume(value: number) {
    this._volume = value;
    for (const b of this.Balls) if (b._audioSource) SendValueOp(this.Host, "audioVolume", b._audioSource.gameObject.key, [this._volume]);
  }

  get Gamemode(): number {
    return this._gameMode;
  }
  set Gamemode(value: number) {
    this._gameMode = value;
    this.VariableChangedFromBehaviour("_gameMode");
    this.ChangeGameMode();
  }

  get PlayerCount(): number {
    return this._playerCount;
  }
  set PlayerCount(value: number) {
    this._playerCount = value;
    this.VariableChangedFromBehaviour("_playerCount");
    this.ChangeAmountOfPlayers();
  }

  get AimAssist(): number {
    return this._aimAssist;
  }
  set AimAssist(value: number) {
    this._aimAssist = value;
    this.VariableChangedFromBehaviour("_aimAssist");
  }

  get Size(): number {
    return this._size;
  }
  set Size(value: number) {
    this._size = value;
    this.VariableChangedFromBehaviour("_size"); // upstream passes "_aimAssist" here (bug, :119)
    SendValueOp(this.Host, "scale", "@", [this._size]);
  }

  get UseBarrier(): boolean {
    return this._useBarrier;
  }
  set UseBarrier(value: boolean) {
    this._useBarrier = value;
    this.VariableChangedFromBehaviour("_useBarrier");
    this.ChangeBarrier();
  }

  get DoTeams(): boolean {
    return this._doTeams;
  }
  set DoTeams(value: boolean) {
    this._doTeams = value;
    this.VariableChangedFromBehaviour("_doTeams");
    this.ChangeTeams();
  }

  get AllowSelfFire(): boolean {
    return this._allowSelfFire;
  }
  set AllowSelfFire(value: boolean) {
    this._allowSelfFire = value;
    this.VariableChangedFromBehaviour("_allowSelfFire");
  }

  get AllowFriendlyFire(): boolean {
    return this._allowFriendlyFire;
  }
  set AllowFriendlyFire(value: boolean) {
    this._allowFriendlyFire = value;
    this.VariableChangedFromBehaviour("_allowFriendlyFire");
  }

  get DoAutoRespawnBalls(): boolean {
    return this._doAutoRespawnBalls;
  }
  set DoAutoRespawnBalls(value: boolean) {
    this._doAutoRespawnBalls = value;
    this.VariableChangedFromBehaviour("_doAutoRespawnBalls");
  }

  get LastAimAssist(): number {
    return this._lastAimAssist;
  }
  set LastAimAssist(value: number) {
    this._lastAimAssist = value;
    for (const p of this.Players) p.PublishAimAssistValue(this._lastAimAssist);
  }

  get ShowPointsPopup(): boolean {
    return this._showPointsPopup;
  }
  set ShowPointsPopup(value: boolean) {
    this._showPointsPopup = value;
    this.VariableChangedFromBehaviour("_showPointsPopup");
  }

  get AllowAimAssist(): boolean {
    return this._allowAimAssist;
  }

  // ---- start (:246-292) ----

  override Start(): void {
    this.ReadLocalSettings();
    this.Players = this.PlayersList.slice();
    for (let i = 0; i < this.Players.length; i++) {
      this.Players[i]!.Init(this, i, this._initialPlayerColors[i] ?? Color.white, this._allowAvatarThemeColorUsage, this._allowAI, this._allowAimAssist);
    }
    for (const b of this.Balls) b.Init(this);
    this.Volume = this._volume;
    this.Log(2, `Initialized. Players: ${this.Players.length}, Balls: ${this.Balls.length}, Tables: ${this._tables.length}`);
    this.ChangeAmountOfPlayers();
  }

  override OnInstanceStart(kind: StartKind): void {
    this._ready = true;
    if (kind === "fresh") this.StartFreshTable();
  }

  /** True when this client may act as the Game's owner (Networking.IsOwner(gameObject) upstream). */
  private OwnerActs(): boolean {
    return this._ready && this.Networking.IsOwner(this);
  }

  /** Settings that are the same on every client and never synced: the holder's frame, colours, switches, volume. */
  private ReadLocalSettings(): void {
    const s = this.Settings;
    const vec = (name: string, fallback: Vector3): Vector3 => {
      const parts = (s.get(name) ?? "").trim().split(/[\s,]+/).map(Number);
      return parts.length === 3 && parts.every(Number.isFinite) ? new Vector3(parts[0], parts[1], parts[2]) : fallback;
    };
    this._holderPosition = vec("position", Vector3.zero);
    const euler = vec("rotation", Vector3.zero);
    this._holderRotation = Quaternion.Euler(euler.x, euler.y, euler.z);
    const scale = vec("scale", Vector3.one).x;
    this._holderScale = scale > 0 ? scale : 1;
    for (let i = 0; i < 4; i++) {
      const parts = (s.get(`color-${i + 1}`) ?? "").trim().split(/[\s,]+/).map(Number);
      if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) this._initialPlayerColors[i] = new Color(parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1);
    }
    if (s.has("allow-aim-assist")) this._allowAimAssist = s.get("allow-aim-assist") !== "false";
    if (s.has("allow-ai")) this._allowAI = s.get("allow-ai") !== "false";
    const volume = Number(s.get("volume"));
    if (s.has("volume") && Number.isFinite(volume)) this._volume = Mathf.Clamp01(volume);
  }

  /** A fresh table: the attributes' starting values, then the owner's start-up (Init's resets, :78-81 and Player.cs:83). */
  private StartFreshTable(): void {
    const s = this.Settings;
    const flag = (name: string, fallback: boolean) => (s.has(name) ? s.get(name) !== "false" : fallback);
    const num = (name: string, fallback: number, lo: number, hi: number) => {
      const v = Number(s.get(name));
      return s.has(name) && Number.isFinite(v) ? Mathf.Clamp(v, lo, hi) : fallback;
    };
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this._playerCount = Math.round(num("players", 2, 2, 4));
    this._gameMode = MODE_NAMES[(s.get("mode") ?? "").toLowerCase()] ?? GameMode.Normal;
    this._size = num("size", 1, 0.5, 1.5);
    this._aimAssist = num("aim-assist", AIM_ASSIST_DEFAULT, 0, 1);
    this._useBarrier = flag("barrier", false);
    this._doTeams = flag("teams", false);
    this._allowSelfFire = flag("self-fire", false);
    this._allowFriendlyFire = flag("friendly-fire", true);
    this._doAutoRespawnBalls = flag("auto-respawn", true);
    this._showPointsPopup = flag("points-popup", true);
    const rows = Math.round(num("rows", 5, 3, 11));
    const shape = SHAPE_NAMES[(s.get("shape") ?? "").toLowerCase()] ?? CupsShape.Triangle;
    for (const name of Game.synced) this.VariableChangedFromBehaviour(name);
    for (const p of this.Players) {
      p.CupsManager.Rows = rows;
      p.CupsManager.Shape = shape;
    }

    this.Size = this._size;
    this.ChangeTeams();
    this.ChangeAmountOfPlayers();
    this.ChangeGameMode(); // the owner resets every rack, sets the colour mode and respawns the balls
    for (const p of this.Players) {
      this.Networking.SetOwner(this.Networking.LocalPlayer, p);
      p.RequestSerialization();
    }
    this.RequestSerialization();
  }

  /** :294-299 */
  SetLastAimAssist(assist: number): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this.LastAimAssist = assist;
    this.RequestSerialization();
  }

  /** :337-358 */
  GetAdaptiveAIStrength(playerIndex: number): number {
    let totalSkill = 0;
    let totalCupsOthers = 0;
    const skilledPlayerCount = this.PlayerCount;
    for (let i = 0; i < skilledPlayerCount; i++) {
      if (i !== playerIndex) {
        totalSkill += this.Players[i]!.GetSkill();
        totalCupsOthers += this.Players[i]!.CupsManager.SyncedCount;
      }
    }
    const myCups = this.Players[playerIndex]!.CupsManager.SyncedCount;
    const avgCups = totalCupsOthers / (skilledPlayerCount - 1);
    const valueSkill = totalSkill / (skilledPlayerCount - 1);
    const valueCups = avgCups / myCups;
    const rdm = this.Random.value * 0.3 - 0.15;
    return Mathf.Clamp01(valueSkill * valueCups + rdm);
  }

  /** :360-396 */
  GetAITnitalTarget(playerIndex: number): Vector3 {
    let target = Vector3.zero;
    const koth = this.KitToWorld(this._kingOfTheHillLocal);
    const up = this.KitToWorldRotation(Quaternion.identity).rotate(Vector3.up);
    if (this.Gamemode === GameMode.BigPong) {
      target = koth.add(up.scale(this.Players[0]!.CupsManager.GlobalHeight));
    } else if (this.Gamemode === GameMode.KingOfTheHill) {
      target = koth.add(up.scale(this.Players[0]!.CupsManager.GlobalHeight * 4));
    } else {
      let mostCups = -1;
      let mostCupsIndex = 0;
      for (let i = 0; i < this.PlayerCount; i++) {
        if (i !== playerIndex && (!this.DoTeams || !this.IsSameTeam(playerIndex, i))) {
          if (this.Players[i]!.CupsManager.SyncedCount > mostCups) {
            mostCups = this.Players[i]!.CupsManager.SyncedCount;
            mostCupsIndex = i;
          }
        }
      }
      target = this.Players[mostCupsIndex]!.CupsManager.CupAnchorPosition;
    }
    // add random xz offset, max 0.15m
    return target.add(new Vector3(this.Random.value * 0.3 - 0.15, 0, this.Random.value * 0.3 - 0.15));
  }

  /** :398-414 */
  GetAIThrowVector(ballPos: Vector3, playerIndex: number): Vector3 {
    const target = this.GetAITnitalTarget(playerIndex);
    const dir = target.sub(ballPos).normalized;
    if (this.Gamemode === GameMode.BigPong) return dir.add(Vector3.up.scale(2.0)).normalized;
    if (this.Gamemode === GameMode.KingOfTheHill) return dir.add(Vector3.up.scale(1.0)).normalized.scale(0.7 * this.LossyScale());
    return dir.add(Vector3.up.scale(0.5)).normalized.scale(0.7 * this.LossyScale());
  }

  /** :416-426 */
  RemoveCup(cup: Cup | null, _scoreingPlayer: number): void {
    if (!cup) return;
    if (cup.PlayerAnchorSide) {
      if (this.Gamemode !== GameMode.BigPong) cup.PlayerAnchorSide.CupsManager.RemoveCup(cup.Row, cup.Column);
    }
  }

  /** :428-431 */
  IsSameTeam(player1: number, player2: number): boolean {
    return player1 % this._teamSize === player2 % this._teamSize;
  }

  /** :433-465 (the dead recent-throws ring left out) */
  CountCupHit(cupOwner: number, scoreingPlayer: number, scoreType: number): void {
    this.Log(3, `CountCupHit: ${cupOwner} ${scoreingPlayer} ${scoreType} ${this.Players[scoreingPlayer]!._isAI}`);
    if (!this.Players[scoreingPlayer]!._isAI) this.Players[scoreingPlayer]!.AddHit();
    if (cupOwner < this.Players.length) {
      const add = this.AddToScore(scoreingPlayer, cupOwner, scoreType);
      if (this.DoTeams) {
        if (add !== 0) {
          for (let i = scoreingPlayer % this._teamSize; i < this.Players.length; i = i + this._teamSize) this.Players[i]!.AddToScore(add);
        }
      } else if (add !== 0) {
        this.Players[scoreingPlayer]!.AddToScore(add);
      }
    }
  }

  /** :467-476 */
  CountThrow(playerIndex: number): void {
    if (this.Players[playerIndex]!._isAI) return; // AI throws are not counted
    this.Players[playerIndex]!.AddThrow();
  }

  /** :478-487 */
  AllowCollision(ballOwner: number, cupOwner: Player, cupSide: Player): boolean {
    if (cupOwner !== this.Players[cupOwner.PlayerIndex]) return false; // Ball is from other table
    if (this.Gamemode === GameMode.KingOfTheHill) return true;
    if (this.Gamemode === GameMode.BigPong) return true;
    if (this.Gamemode === GameMode.Mayham) return ballOwner !== cupSide.PlayerIndex; // check if is on own side
    if (ballOwner === cupOwner.PlayerIndex) return this.AllowSelfFire;
    if (this.DoTeams && ballOwner % this._teamSize === cupOwner.PlayerIndex % this._teamSize) return this.AllowFriendlyFire;
    return true;
  }

  /** :489-500 */
  ShouldAimAssistAimForOwnCups(): boolean {
    return this.Gamemode === GameMode.KingOfTheHill || this.Gamemode === GameMode.BigPong;
  }
  ShouldAimAssistAimAtOwnSide(): boolean {
    return this.Gamemode !== GameMode.Mayham;
  }

  /** :502-511. Score type 0: normal, 1: rimming. */
  AddToScore(ballOwner: number, cupOwner: number, scoreType: number): number {
    if (this.Gamemode === GameMode.KingOfTheHill) return 2 - scoreType;
    if (this.Gamemode === GameMode.BigPong) return 2 - scoreType;
    if (ballOwner === cupOwner) return -1;
    if (this.DoTeams && ballOwner % this._teamSize === cupOwner % this._teamSize) return -3;
    return 1 + scoreType;
  }

  /** :513-516 */
  GetCup(p: number, x: number, y: number): Cup | null {
    const player = this.Players[p];
    return player ? player.CupsManager.GetCup(x, y) : null;
  }

  /** :518-522, in the world. */
  GetBallSpawn(player: number): { position: Vector3; rotation: Quaternion } {
    if (player < this.Players.length) return this.Players[player]!.BallSpawnWorld();
    return { position: this.KitToWorld(Vector3.zero), rotation: this.KitToWorldRotation(Quaternion.identity) };
  }

  /** :524-532: colour and emission of material slot 3 of each table model. */
  SetActivePlayerColor(col: Color): void {
    if (this.Gamemode === GameMode.KingOfTheHill || this.Gamemode === GameMode.Mayham) return;
    if (!this._allowAvatarThemeColorUsage) return;
    this.SetIndicatorColor(col);
  }

  private SetIndicatorColor(col: Color): void {
    for (const table of this._tables) {
      if (!table) continue;
      table.SetColor(col, "_BaseColor", this._teamIndicatorMaterialIndex);
      table.SetColor(col, "_EmissionColor", this._teamIndicatorMaterialIndex);
    }
  }

  /** :534-542 */
  PlayersWithCupsLeft(): number {
    let t = 0;
    for (let i = 0; i < this.Players.length && i < this.PlayerCount; i++) if (this.Players[i]!.CupsManager.SyncedCount > 0) t++;
    return t;
  }

  /** :544-557 */
  GetNextPlayer(c: number): number {
    if (this.Gamemode === GameMode.KingOfTheHill || this.Gamemode === GameMode.Mayham) return c;
    c = (c + 1) % this.PlayerCount;
    if (this.PlayersWithCupsLeft() > 1) {
      while (this.Players[c]!.CupsManager.SyncedCount === 0) c = (c + 1) % this.PlayerCount;
    }
    return c;
  }

  /**
   * :559-579. Change: only the Game's owner recolours the sides. Upstream every client that receives the change
   * calls SetColor, which takes ownership of the side and writes it (a needless race for the same value).
   */
  private ChangeTeams(): void {
    if (!this.Players.length) return;
    if (this.DoTeams) {
      this._teamSize = 2;
      if (!this.OwnerActs()) return;
      for (let i = this._teamSize; i < this.Players.length; i++) this.Players[i]!.SetColor(this.Players[i % this._teamSize]!.ActiveColor);
    } else {
      this._teamSize = 1;
      if (!this.OwnerActs()) return;
      for (let i = this._teamSize; i < this.Players.length; i++) this.Players[i]!.ResetColor();
    }
  }

  /** :581-590 */
  private ChangeBarrier(): void {
    this.SetDividersActive(this.UseBarrier && this.Gamemode !== GameMode.KingOfTheHill && this.Gamemode !== GameMode.BigPong);
  }

  private SetDividersActive(active: boolean): void {
    this._tablesAnimator?.SetBool("dividers", active);
  }

  /** :592-632 */
  private ChangeGameMode(): void {
    if (!this.Players.length) return;
    let enableDeviders = false;
    let doRandomColor = false;
    switch (this.Gamemode) {
      case GameMode.KingOfTheHill:
        enableDeviders = false;
        doRandomColor = true;
        break;
      case GameMode.BigPong:
        enableDeviders = false;
        doRandomColor = false;
        break;
      case GameMode.Mayham:
      case GameMode.Normal:
        enableDeviders = true;
        doRandomColor = false;
        break;
    }
    this.ConfigureCups();
    this.SetDividersActive(enableDeviders && this.UseBarrier);
    if (this.OwnerActs()) {
      for (let i = 0; i < this.Players.length; i++) {
        if (this.Gamemode === GameMode.Mayham) this.Players[i]!.CupsManager.SetRows(6);
        this.Players[i]!.CupsManager.ResetGlasses();
        this.Players[i]!.SetDoRandomColor(doRandomColor);
      }
    }
    this.ResetBalls();
  }

  /** :634-649 */
  private ConfigureCups(): void {
    switch (this.Gamemode) {
      case GameMode.KingOfTheHill:
        this.ConfigureCupsKingOfTheHill();
        break;
      case GameMode.BigPong:
        this.ConfigureCupsBigPong();
        break;
      default:
        this.ConfigureCupsNormal();
        break;
    }
  }

  /** :651-664 */
  private ConfigureCupsKingOfTheHill(): void {
    let height = 0;
    for (let i = 0; i < this.Players.length; i++) {
      const rows = 10 - i * 2;
      const zOffsetPerCup = Vector3.back.scale(this.Players[i]!.CupsManager.UnscaledLocalLength);
      this.Players[i]!.CupsManager.SetOverwrite(CupsShape.Circle, rows);
      this.Players[i]!.CupsManager.ChangeConfiguration(1, 1, Vector3.up.scale(height).add(zOffsetPerCup.scale(rows / 2.0)));
      height += this.Players[i]!.CupsManager.LocalHeight;
    }
  }

  /** :666-675 */
  private ConfigureCupsBigPong(): void {
    for (let i = 1; i < this.Players.length; i++) {
      this.Players[i]!.CupsManager.SetOverwriteRows(0);
      this.Players[i]!.CupsManager.ChangeConfiguration(1, 0, Vector3.zero);
    }
    this.Players[0]!.CupsManager.SetOverwriteRows(1);
    this.Players[0]!.CupsManager.ChangeConfiguration(10, 2, Vector3.zero);
  }

  /** :677-689 */
  private ConfigureCupsNormal(): void {
    for (let i = 0; i < this.PlayerCount; i++) {
      this.Players[i]!.CupsManager.DisableOverwrite();
      this.Players[i]!.CupsManager.ChangeConfiguration(1, 0, Vector3.zero);
    }
    for (let i = this.PlayerCount; i < this.Players.length; i++) {
      this.Players[i]!.CupsManager.SetOverwriteRows(0);
      this.Players[i]!.CupsManager.ChangeConfiguration(1, 0, Vector3.zero);
    }
  }

  /** :711-736 (Respawn takes ownership itself: fix for :719, :727) */
  private ResetBalls(): void {
    if (!this.Balls.length) return;
    if (this.Gamemode === GameMode.Normal || this.Gamemode === GameMode.BigPong) {
      for (let i = 1; i < this.Balls.length; i++) this.Balls[i]!.gameObject.SetActive(false);
      this.Balls[0]!.gameObject.SetActive(true);
      this.Balls[0]!._SetColor();
      if (this.OwnerActs()) this.Balls[0]!.Respawn();
    } else {
      for (let i = 0; i < this.Balls.length; i++) {
        this.Balls[i]!.gameObject.SetActive(i < this.PlayerCount);
        this.Balls[i]!.CurrentPlayer = i;
        this.Balls[i]!._SetColor();
        if (this.OwnerActs() && i < this.PlayerCount) this.Balls[i]!.Respawn();
      }
      if (this._allowAvatarThemeColorUsage) this.SetIndicatorColor(Color.white);
    }
  }

  /** :738-759 */
  private DetermineLocalPlayerIndex(): number {
    const me = this.Input.Position;
    if (!me) return -1;
    let index = -1;
    // the vector from the local player to the table centre, flattened onto the table's plane
    const toCentre = this._holderRotation.inverse.rotate(this.KitToWorld(Vector3.zero).sub(me));
    toCentre.y = 0;
    const compareVec = this._holderRotation.rotate(toCentre);
    let minAngle = 360;
    for (let i = 0; i < this.Players.length; i++) {
      if (!this.Players[i]!.gameObject.activeSelf) continue;
      const angle = Angle(compareVec, this.Players[i]!.ForwardWorld);
      if (angle < minAngle) {
        minAngle = angle;
        index = i;
      }
    }
    return index;
  }

  /** :761-779: moves a side to a team anchor; the local player moves with it, keeping where they stood relative to it. */
  private ChangePlayerTransform(player: Player, pose: TeamPose, teleportPlayer: boolean): void {
    const newRotation = Quaternion.Euler(0, pose.yaw, 0);
    const me = this.Input.Position;
    if (teleportPlayer && me) {
      const oldWorldRot = this.KitToWorldRotation(player.kitRotation);
      const relativePos = oldWorldRot.inverse.rotate(me.sub(this.KitToWorld(player.kitPosition)));
      const head = this.Input.Poses?.head.rotation ?? Quaternion.identity;
      const relativeDir = oldWorldRot.inverse.rotate(head.rotate(Vector3.forward));
      player.kitPosition = pose.position.clone();
      player.kitRotation = newRotation;
      const newWorldRot = this.KitToWorldRotation(newRotation);
      const newPos = this.KitToWorld(pose.position).add(newWorldRot.rotate(relativePos));
      const newDir = newWorldRot.rotate(relativeDir);
      this.Input.TeleportTo(newPos, Math.atan2(newDir.x, newDir.z) * Mathf.Rad2Deg);
    } else {
      player.kitPosition = pose.position.clone();
      player.kitRotation = newRotation;
    }
    player.transform.localPosition = pose.position;
    player.transform.localRotation = newRotation;
  }

  /** :781-822 */
  private ChangeAmountOfPlayers(): void {
    if (!this.Players.length) return;
    this.Log(2, `ChangeAmountOfPlayers ${this.PlayerCount}`);
    if (this.PlayerCount <= this._tables.length && this.PlayerCount <= this.Players.length) {
      this.ConfigureCups();
      for (let i = 0; i < this._tables.length; i++) this._tables[i]?.gameObject.SetActive(i === this.PlayerCount);
      const doTeleportPlayer = this.OwnerActs();
      const localPlayerIndex = doTeleportPlayer ? this.DetermineLocalPlayerIndex() : -1;
      for (let i = 0; i < this.Players.length; i++) {
        if (!this.Players[i]!.gameObject.activeSelf && this.OwnerActs()) this.Players[i]!.CupsManager.ResetGlasses();
        this.Players[i]!.gameObject.SetActive(i < this.PlayerCount);
        if (i < this.PlayerCount) {
          const poses = this.PlayerCount === 2 ? this._twoTeamPositions : this.PlayerCount === 3 ? this._threeTeamPositions : this._fourTeamPositions;
          const pose = poses[i];
          if (pose) this.ChangePlayerTransform(this.Players[i]!, pose, doTeleportPlayer && i === localPlayerIndex);
        }
      }
      this.ResetBalls();
    }
  }

  // ---- the table's frame (port) -------------------------------------------------------------------------------

  /** The table root's lossy scale: the holder's scale times the synced size. */
  LossyScale(): number {
    return this._holderScale * this._size;
  }

  KitToWorld(local: Vector3): Vector3 {
    return this._holderPosition.add(this._holderRotation.rotate(local.scale(this.LossyScale())));
  }

  KitToWorldRotation(local: Quaternion): Quaternion {
    return this._holderRotation.mul(local);
  }

  /** The pose of a rack anchor relative to the kit root: 0 the side's own end, 1 and 2 the table centre (CupsManager.cs:61-62). */
  AnchorPose(side: number, anchorId: number): { position: Vector3; rotation: Quaternion } {
    if (anchorId === 0) {
      const p = this.Players[side]!;
      return { position: p.kitPosition.add(p.kitRotation.rotate(p.CupsAnchorLocal)), rotation: p.kitRotation.clone() };
    }
    return { position: this._kingOfTheHillLocal.clone(), rotation: Quaternion.identity };
  }

  AnchorPath(side: number, anchorId: number): string {
    return anchorId === 0 ? this.Players[side]!.CupsAnchorPath : this.KingOfTheHillPath;
  }

  AnchorWorldPosition(side: number, anchorId: number): Vector3 {
    return this.KitToWorld(this.AnchorPose(side, anchorId).position);
  }

  /** TableHeight.position.y (Ball.cs:123; computed when asked, so a size change is not missed). */
  TableHeightWorld(): number {
    return this.KitToWorld(this._kingOfTheHillLocal).y;
  }

  RespawnHeightWorld(): number {
    return this.KitToWorld(this._respawnHeightLocal).y;
  }

  BallRadius(): number {
    return this.ballRadiusLocal * this.LossyScale();
  }

  /** For tests: every cup copy of every rack. */
  AllCups(): Cup[] {
    const out: Cup[] = [];
    for (const p of this.Players) out.push(...p.CupsManager.List);
    return out;
  }
}
