// _Internal/BeerPong/scripts/Player.cs (Thryrallo/UdonPrefabs, MIT): one side ("slot") of the table. Line numbers in
// comments are upstream's.
//
// Changes (PORT.md section 10):
//   - Bug fixed: ResetPlayer wrote `_score = 0` past the property (:295), so the resetting client's own score plate
//     kept the old score; it goes through Score here.
//   - The avatar theme colour (item 16) is not ported: its toggle is hidden, as upstream hides it without the
//     AvatarThemeColor object the stock prefab lacks.
//   - Bug fixed: King of the Hill cups could keep side colours on other clients (see DoRandomColor).
//   - AI_Aim does nothing when the ball is no longer waiting (a person picked it up during the 2 s), instead of
//     pulling it out of their hand.
//   - The counts a turn changes on a side (throws, hits, score, the last aim assist, the AI's adaptive skill) are
//     requests to the referee, their one writer during play (networkCallable); upstream the scorer wrote its
//     team-mate's side and lost the race with that team-mate's own throw (PORT.md 0.10).
//   - Where a side stands is kept as a kit-relative pose (set by Game.ChangePlayerTransform); world positions of its
//     spawn points come from that pose and the table's frame.

import { Color, Quaternion, Vector3, type AnimatorRef, type ComponentRef, type GameObject, type RendererRef, type TextRef } from "../portkit/src/index.ts";
import type { Ball } from "./Ball.ts";
import type { CupsManager } from "./CupsManager.ts";
import type { Game } from "./Game.ts";
import type { PlayerScoreAnnouncement } from "./PlayerScoreAnnouncement.ts";
import { SimpleUISetterExtension } from "./SimpleUISetterExtension.ts";
import { FormatD4, FormatF0 } from "./CSharp.ts";

export class Player extends SimpleUISetterExtension {
  /**
   * Run only on the referee, as commands: the counts a turn changes on a side (throws, hits, score, the last aim
   * assist, the AI's adaptive skill). The referee is their one writer during play, so a scorer adding to a team-mate's
   * side and that team-mate's own throw at the same moment no longer race for the side's ownership (PORT.md 0.10).
   */
  static override networkCallable: readonly string[] = ["ThrowCommand", "HitCommand", "ScoreCommand", "AimAssistCommand", "AiSkillCommand"];
  static override synced = [
    "_lastAimAssistStrength",
    "_numberOfThrows",
    "_numberOfHits",
    "_score",
    "_activeColor",
    "_doRandomCupColor",
    "_isAI",
    "_useAdaptiveAISkill",
    "_aiSkill",
    "_areSettingsOpen",
    "_settingsNavbar",
  ];
  static override fieldChangeCallbacks = {
    _score: "Score",
    _activeColor: "ActiveColor",
    _doRandomCupColor: "DoRandomColor",
    _isAI: "IsAI",
    _useAdaptiveAISkill: "UseAdaptiveAISkill",
    _aiSkill: "AiSkill",
    _areSettingsOpen: "AreSettingsOpen",
    _settingsNavbar: "SettingsNavbar",
  };

  // bindings.json (:15-33)
  CupsManager!: CupsManager;
  ScoreAnnouncement!: PlayerScoreAnnouncement;
  UIAnimator: AnimatorRef | null = null;
  /** The renderer of `UiButton` (the table-edge "Open Settings" button), whose material shows the side's colour. */
  UiButtonRenderer: RendererRef | null = null;
  LastAimAssitDisplay: TextRef | null = null;
  UI_score_boards: TextRef[] = [];
  UiImagesUsingPlayerColor: ComponentRef[] = [];
  /** The alpha each of those images has in the prefab ("keep original alpha", :70-73). */
  UiImageAlphas: number[] = [];
  _avatarThemeColorToggle: GameObject | null = null;
  _aiNavButton: GameObject | null = null;
  _aiSettings: GameObject | null = null;
  _aimAssistSettings: GameObject | null = null;
  /** The "Adaptive" aim assist toggle: dead upstream (item 77), not ported, hidden. */
  _adaptiveAimToggle: GameObject | null = null;
  /** Layout, relative to this side's object (the kit builder measures them): BallSpawnPoint, AI_SpawnPoint, the rack anchor. */
  BallSpawnLocal = new Vector3(0.552, 0.01, -1.311);
  AiBallSpawnLocal = new Vector3(0, 0.42, -1.547);
  CupsAnchorLocal = new Vector3(0, 0, -1.317);
  /** Kit path of `[GamemodeNormal]Cups Anchor` under this side. */
  CupsAnchorPath = "";

  private _playerIndex = 0;
  private _gameManager!: Game;

  get PlayerIndex(): number {
    return this._playerIndex;
  }
  get GameManager(): Game {
    return this._gameManager;
  }

  // [UdonSynced] (:41-57)
  _lastAimAssistStrength = 0;
  _numberOfThrows = 0;
  _numberOfHits = 0;
  _score = 0;
  _activeColor = new Color(0, 0, 0, 0);
  private _originalColor = new Color(0, 0, 0, 0);
  _doRandomCupColor = false;
  _isAI = false;
  _useAdaptiveAISkill = true;
  _aiSkill = 0.3;
  _areSettingsOpen = false;
  _settingsNavbar = 0;

  /** Where this side stands, relative to the kit root (Game.ChangePlayerTransform). */
  kitPosition = new Vector3(0, 0.8, 0);
  kitRotation = Quaternion.identity;

  protected override get LogPrefix(): string {
    return "Thry.BeerPong.Player";
  }

  /** :60-84 (the owner's first RequestSerialization happens in Game.OnInstanceStart for a fresh table). */
  Init(gameManager: Game, playerIndex: number, initalColor: Color, showAvatarColorOptions: boolean, enableAI: boolean, enableAimAssist: boolean): void {
    this._playerIndex = playerIndex;
    this._gameManager = gameManager;
    this._originalColor = initalColor.clone();
    this.UiButtonRenderer?.SetColor(this._activeColor);
    this.ColorImages();

    // No AvatarThemeColor in the stock prefab (`_themeColor` null), so the toggle is hidden (:76).
    this._avatarThemeColorToggle?.SetActive(false && showAvatarColorOptions);
    this._aiSettings?.SetActive(enableAI);
    this._aimAssistSettings?.SetActive(enableAimAssist);
    this._aiNavButton?.SetActive(enableAI || enableAimAssist);
    this._adaptiveAimToggle?.SetActive(false);

    this.CupsManager.Init();
    this.ActiveColor = initalColor;
  }

  private ColorImages(): void {
    this.UiImagesUsingPlayerColor.forEach((image, i) => {
      const c = this._activeColor.clone();
      c.a = this.UiImageAlphas[i] ?? 1;
      this.Host.uiColor(image.gameObject.key, c);
    });
  }

  /** :86-95 */
  get AreSettingsOpen(): boolean {
    return this._areSettingsOpen;
  }
  set AreSettingsOpen(value: boolean) {
    this._areSettingsOpen = value;
    this.VariableChangedFromBehaviour("_areSettingsOpen");
    this.UIAnimator?.SetBool("isOn", this._areSettingsOpen);
  }

  /** :97-105 */
  get SettingsNavbar(): number {
    return this._settingsNavbar;
  }
  set SettingsNavbar(value: number) {
    this._settingsNavbar = value;
    this.VariableChangedFromBehaviour("_settingsNavbar");
  }

  /** :107-112 */
  ToggleSettings(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this.AreSettingsOpen = !this.AreSettingsOpen;
    this.RequestSerialization();
  }

  /** :114-140 */
  get IsAI(): boolean {
    return this._isAI;
  }
  set IsAI(value: boolean) {
    this._isAI = value;
    this.VariableChangedFromBehaviour("_isAI");
  }
  get UseAdaptiveAISkill(): boolean {
    return this._useAdaptiveAISkill;
  }
  set UseAdaptiveAISkill(value: boolean) {
    this._useAdaptiveAISkill = value;
    this.VariableChangedFromBehaviour("_useAdaptiveAISkill");
  }
  get AiSkill(): number {
    return this._aiSkill;
  }
  set AiSkill(value: number) {
    this._aiSkill = value;
    this.VariableChangedFromBehaviour("_aiSkill");
  }

  /** :142-151 */
  get LastAimAssistStrength(): number {
    return this._lastAimAssistStrength;
  }
  /** A request to the referee (AimAssistCommand), see networkCallable. */
  set LastAimAssistStrength(value: number) {
    this.AskReferee("AimAssistCommand", value);
  }

  /** :153-175 */
  get ActiveColor(): Color {
    return this._activeColor;
  }
  set ActiveColor(value: Color) {
    this._activeColor = value.clone();
    this.UiButtonRenderer?.SetColor(this._activeColor);
    this.CupsManager.SyncColor();
    this.ColorImages();
    // sync balls
    for (const b of this._gameManager?.Balls ?? []) {
      if (b.gameObject.activeSelf && b.CurrentPlayer === this.PlayerIndex) b._SetColor();
    }
  }

  /** :177-183 */
  SetColor(c: Color): void {
    if (this.ActiveColor.equals(c)) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this.ActiveColor = c;
    this.RequestSerialization();
  }

  /** :185-188 */
  ResetColor(): void {
    this.SetColor(this._originalColor);
  }

  /**
   * :190-198. Bug fixed: upstream's SyncColor skips every cup while random colours are on, so on a client where a
   * rack arrived before this flag (the order of two objects' updates is not fixed), King of the Hill cups kept their
   * side colours. Switching the flag recolours this side's cups either way.
   */
  get DoRandomColor(): boolean {
    return this._doRandomCupColor;
  }
  set DoRandomColor(value: boolean) {
    this._doRandomCupColor = value;
    this.CupsManager.SyncColor(true);
  }

  /** :200-206 */
  SetDoRandomColor(doRandom: boolean): void {
    if (doRandom === this.DoRandomColor) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this.DoRandomColor = doRandom;
    this.RequestSerialization();
  }

  /** :208-211 */
  PublishAimAssistValue(value: number): void {
    if (this.LastAimAssitDisplay) this.LastAimAssitDisplay.text = FormatF0(value * 100) + "%";
  }

  /** :213-218, a request to the referee (ThrowCommand). */
  AddThrow(): void {
    this.AskReferee("ThrowCommand");
  }

  /** :220-225, a request to the referee (HitCommand). */
  AddHit(): void {
    this.AskReferee("HitCommand");
  }

  // ---- the referee's side of the requests (anyone may ask, as anyone could write these upstream: PORT.md 0.9) ----

  /**
   * The referee runs its own request at once, in the turn that made it (as upstream's owner wrote at once: its throw
   * counts even if it leaves a moment later); anyone else sends it (SendCommand). The counts only add up, so a request
   * of the referee's that overtakes one of its own still queued from before it became referee changes nothing.
   */
  private AskReferee(name: "ThrowCommand" | "HitCommand" | "ScoreCommand" | "AimAssistCommand" | "AiSkillCommand", ...args: unknown[]): void {
    if (this.Networking.IsReferee) (this[name] as (...a: unknown[]) => void).apply(this, args);
    else this.SendCommand(name, ...args);
  }

  /** The referee writes this side: it owns it from here on (a panel change may take it back meanwhile). */
  private RefereeWrite(change: () => void): void {
    if (!this.Networking.IsReferee) return;
    if (!this.Networking.IsOwner(this)) this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    change();
    this.RequestSerialization();
  }

  ThrowCommand(): void {
    this.RefereeWrite(() => this._numberOfThrows++);
  }

  HitCommand(): void {
    this.RefereeWrite(() => this._numberOfHits++);
  }

  /** A score change is one of Game.AddToScore's: -3, -1, 1 or 2 (0 is never sent). */
  ScoreCommand(a: unknown): void {
    if (typeof a !== "number" || !Number.isInteger(a) || a === 0 || Math.abs(a) > 3) return;
    this.RefereeWrite(() => (this.Score += a));
  }

  AimAssistCommand(value: unknown): void {
    if (typeof value !== "number" || !(value >= 0 && value <= 1)) return;
    this.RefereeWrite(() => (this._lastAimAssistStrength = value));
  }

  /** AI_Shoot's adaptive skill (Player.cs:258-259): the skill and the last aim assist shown. */
  AiSkillCommand(skill: unknown, adaptive: unknown): void {
    if (typeof skill !== "number" || !(skill >= 0 && skill <= 1)) return;
    this.RefereeWrite(() => {
      if (adaptive === true) this.AiSkill = skill;
      this._lastAimAssistStrength = skill;
    });
  }

  /** :227-232 */
  GetSkill(): number {
    if (this._isAI) return this.AiSkill;
    if (this._numberOfThrows === 0) return 0.5;
    return this._numberOfHits / this._numberOfThrows;
  }

  private currentBall: Ball | null = null;
  /** True while this client has an AI turn scheduled for this side. */
  aiTurnPending = false;

  /** :234-242 */
  ItsYourTurn(ball: Ball): void {
    this.currentBall = ball;
    if (this._isAI) {
      this.aiTurnPending = true;
      this.SendCustomEventDelayedSeconds("AI_Aim", 2);
    }
  }

  /** :244-249 */
  AI_Aim(): void {
    const ball = this.currentBall;
    if (!ball || !ball.WaitingForThrow(this.PlayerIndex)) {
      this.aiTurnPending = false;
      return;
    }
    ball.OnPickupAI(); // For when AutoRespawnBallAfterCupHit is off & the ball is still in the cup state
    const spawn = this.AiBallSpawnWorld();
    ball.SetPositionRotation(spawn.position, spawn.rotation);
    this.SendCustomEventDelayedSeconds("AI_Shoot", 1);
  }

  /** :251-264 */
  AI_Shoot(): void {
    this.aiTurnPending = false;
    const ball = this.currentBall;
    if (!ball || !this.Networking.IsOwner(ball)) return;

    // Update and Publish Skill (the side's part as a request to the referee, AiSkillCommand)
    const adaptive = this.UseAdaptiveAISkill;
    const skill = adaptive ? this.GameManager.GetAdaptiveAIStrength(this.PlayerIndex) : this.AiSkill;
    this.GameManager.SetLastAimAssist(skill);
    this.AskReferee("AiSkillCommand", skill, adaptive);

    ball.ShootAI(skill);
  }

  /** :266-278 */
  SyncSettingsToAllPlayers(): void {
    const src = this.CupsManager;
    for (let i = 0; i < this.GameManager.Players.length; i++) {
      const p = this.GameManager.Players[i]!;
      if (p === this) continue;
      p.CupsManager.Rows = src.Rows;
      p.CupsManager.Shape = src.Shape;
      p.CupsManager.NetworkChanges();
    }
  }

  /** :280-287 */
  ResetAllPlayers(): void {
    for (let i = 0; i < this.GameManager.Players.length; i++) this.GameManager.Players[i]!.ResetPlayer();
  }

  /** :289-297 (bug fixed: the score goes through its property, see the header) */
  ResetPlayer(): void {
    this.CupsManager.ResetGlasses();
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this._numberOfHits = 0;
    this._numberOfThrows = 0;
    this.Score = 0;
    this.RequestSerialization();
  }

  // ======= Score ==========

  /** :302-312 */
  get Score(): number {
    return this._score;
  }
  set Score(value: number) {
    this._score = value;
    if (this._score === 0) this.ScoreAnnouncement.ResetScore();
    this.UpdateUI();
  }

  /** :315-322, a request to the referee (ScoreCommand). */
  AddToScore(a: number): void {
    if (a === 0) return;
    this.AskReferee("ScoreCommand", a);
  }

  /** :324-330 */
  private UpdateUI(): void {
    const s = FormatD4(this._score);
    for (const t of this.UI_score_boards) t.text = s;
    if (this._score !== 0 && this.GameManager?._showPointsPopup) this.ScoreAnnouncement.ShowScore(this._score);
  }

  // ---- where things are (port) --------------------------------------------------------------------------------

  /** BallSpwanpoint.position / rotation, in the world. */
  BallSpawnWorld(): { position: Vector3; rotation: Quaternion } {
    return this.LocalToWorld(this.BallSpawnLocal);
  }

  /** AiBallSpawn.position / rotation, in the world. */
  AiBallSpawnWorld(): { position: Vector3; rotation: Quaternion } {
    return this.LocalToWorld(this.AiBallSpawnLocal);
  }

  /** transform.forward in the world. */
  get ForwardWorld(): Vector3 {
    return this.GameManager.KitToWorldRotation(this.kitRotation).rotate(Vector3.forward);
  }

  private LocalToWorld(local: Vector3): { position: Vector3; rotation: Quaternion } {
    const game = this.GameManager;
    return { position: game.KitToWorld(this.kitPosition.add(this.kitRotation.rotate(local))), rotation: game.KitToWorldRotation(this.kitRotation) };
  }
}
