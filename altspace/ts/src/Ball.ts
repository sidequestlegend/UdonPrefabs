// _Internal/BeerPong/scripts/Ball.cs (Thryrallo/UdonPrefabs, MIT): the ball's rules, without its physics. Line numbers
// in comments are upstream's.
//
// How the ball moves here (coordinator's decision, PORT.md "Decisions"): the ball is a real Unity rigidbody, owned
// and simulated by the thrower's client and transform-synced to everyone (`sync: "transform"` in bindings.json: the
// script gives it its network id and a BS Synced Object), as upstream lets the owner's physics decide. The owner
// starts a throw with the kit's `rbLaunch` op (through Game.Launch, one launch at a time); every other client keeps the
// body kinematic (`rbKinematic` / `rbVelocity`) so the synced transform alone moves it. The kit's ball graph (one per ball, BeerPongKitBuilder) reports what the page
// cannot see, through the graph-to-page channel:
//   bpRelease|<ball>|<vx>|<vy>|<vz>|<max angular deg/s>   On Release of a grab: Ball.cs:226-233 and :511-527 computed
//                                                         per frame in the graph (the mean of the non-zero velocity
//                                                         samples of the last 10 frames, its length raised by
//                                                         min(1.5, max angular / 2000)); the page multiplies by
//                                                         `throw-vr` (1.5) as upstream (:547)
//   collisionEnter|<ball key>|<other name>|<px>|<py>|<pz>|<nx>|<ny>|<nz>|<own 1/0>|<bx>|<by>|<bz>|<vx>|<vy>|<vz>|<cx>|<cy>|<cz>|<cup top y>
//                                                         OnCollisionEnter (:982-1022) as the kit's multi-argument
//                                                         collision event (the "bpContact" report): the other
//                                                         collider's object name, the contact point and normal, whether
//                                                         the other belongs to this kit, the ball's position and its
//                                                         velocity of the last physics step before the contact, and for
//                                                         a cup its position and the top of its collider's bounds
//   bpStill|<ball>, bpLow|<ball>                          while the body is dynamic: still (speed^2 <= 0.5) for 1 s,
//                                                         and below the respawn height (:264-289), from the physics
//                                                         step (PORT.md 0.8: how often transform reports arrive)
// Every client's graph may report contacts; only the ball's owner acts on them, as upstream (:1000).
//
// Changes (PORT.md section 10):
//   - Not ported (dead upstream): the Locked state and the throw indicator arrow (no code enters Locked), the
//     developer cheat (:494-500, :532, :578), the Index-trigger release (:502-508), the avatar theme colour (:436-439).
//   - The held ball is shown to others by platform transform sync, not by following the owner's hand bones (:248-262,
//     :461-491); `_isRightHand` and the hand-relative pose are gone.
//   - Bounces, the rim edge and the inside of a cup are the owner's PhysX; other clients see the synced transform.
//     The owner drives the rim spiral (:291-305) and the transform sync carries it.
//   - Timers of a state (in the cup 1 / 2 / 3 / 20 s, the rim's length) run on the synced clock from the moment the
//     state was set (`_stateServerTime`), so whoever owns the ball next continues them.
//   - `_countedHit` is synced (upstream it is local, :60): a thrower who leaves after counting is not counted twice.
//   - The referee finishes what a thrower who left started: a ball in the hand respawns for the same side, a ball
//     in flight is a miss, a ball on the rim or in a cup is counted once and removed as usual.
//   - Desktop: the charge is a key (`throw-key`, default F) instead of the right mouse button, and it is cleared after
//     each throw (upstream reuses the last charge, item 22). The release is GameObject.ReleaseGrab(). A drop on a
//     desktop page (Input.IsVR false) never waits for the graph's VR release report.
//   - Bug fixed: a VR release with no non-zero velocity sample divided by zero (NaN velocity, :523); it is zero here.
//   - Bug fixed: the miss checks (:264-289) could each fire in the same frame (two turn changes); the first miss ends them.
//   - The AI is also started by the referee when an AI side's ball has waited 6 s with nobody driving it (the client
//     that respawned it left, item 98).
//   - Collision sounds play with upstream's volume scale clamp01(|v|^2 / 10) (relay op `audioScaled`).

import {
  Behaviour,
  Quaternion,
  Vector3,
  type AudioClipRef,
  type AudioSourceRef,
  type HostEventDetail,
  type ParticleSystemRef,
  type Player as NetPlayer,
  type RendererRef,
} from "../portkit/src/index.ts";
import type { Cup } from "./Cup.ts";
import { GameMode, type Game } from "./Game.ts";
import { CastInt } from "./CSharp.ts";
import { CupInside } from "./PortOps.ts";

/** Ball.cs:11-19 */
export const BallState = { Idle: 0, InHand: 1, Locked: 2, Flying: 3, Rimming: 4, InCup: 5 } as const;

const RIMMING_TOTAL_AGULAR_ROTATION = 3000;
const RIMMING_SPEED = 1300;
const MAX_MOUSE_DOWN_THROW_TIME = 1;
const MAX_THROW_STRENGTH = 5;
const BOUND_DRAG = 0.9;
const COLLISION_MAXIMUM_DISTANCE_FROM_CENTER = 0.95;
const GRAVITY = -9.81;
/** HandCollider.cs: a hand's trigger sphere (radius 0.5 at scale 0.2, scaled by avatar height upstream). */
const HAND_RADIUS = 0.09;
/** Frames a VR drop waits for the graph's release velocity before it throws without one. */
const RELEASE_WAIT_FRAMES = 10;
/** Seconds an AI side's ball may wait before the referee drives the AI itself. */
const AI_FALLBACK_SECONDS = 6;

const CUP_NAME = /^\[ThryBP\]Cup (\d+) (\d+)$/;

export class Ball extends Behaviour {
  /** Nothing here is run by another client: the ball travels as synced state and its synced transform. */
  static override networkCallable: readonly string[] = [];
  static override synced = ["_state", "CurrentPlayer", "_start_position", "_start_rotation", "_start_velocity", "_stateServerTime", "_countedHit", "_holder"];

  // ---- bindings.json (:41-52, :94-97) ----
  index = 0;
  _throwVelocityMultiplierVR = 1.5;
  _throwVelocityMultiplierDekstop = 1;
  _gameManager!: Game;
  _renderer: RendererRef | null = null;
  _splashParticles: ParticleSystemRef | null = null;
  _audioSource: AudioSourceRef | null = null;
  _strengthIndicatorDesktop: RendererRef | null = null;
  _audio_collision_table: AudioClipRef | null = null;
  _audio_collision_glass: AudioClipRef | null = null;
  _audio_water_splash: AudioClipRef | null = null;

  // ---- [UdonSynced] (:55-72) and the port's additions ----
  _state: number[] = [0, 0, 0, 0, 0, 0];
  CurrentPlayer = 0;
  _start_position = Vector3.zero;
  _start_rotation = Quaternion.identity;
  _start_velocity = Vector3.zero;
  /** Synced clock (seconds) when the owner set the current state. */
  _stateServerTime = 0;
  /** The hit of the current throw has been counted (Normal mode). */
  _countedHit = false;
  /** Player id of whoever holds or threw the ball; -1 when nobody (respawned). */
  _holder = -1;

  // ---- local ----
  /** The cup contacts the owner judged (for Play-mode tests). */
  readonly contactTrace: string[] = [];
  _localState = 0;
  private _stateStartTime = 0;
  private _rimming = 0;
  private _timeStartBeingStill = 0;
  private _lastPosition = Vector3.zero;
  private _lastVelocity = Vector3.zero;
  /** Velocity before the last contact (the graph's report), for the rim test (:948) and the drop into a cup (:975). */
  private _contactVelocity = Vector3.zero;

  // desktop charge (:31-35)
  private _throwKey = "F";
  private _keyDownStart = 0;
  private _charging = false;
  private _throwStrengthPercent = 0;
  private _keyUsedThisHold = false;
  // VR release
  private _releaseVelocity = Vector3.zero;
  private _releaseFresh = false;
  private _dropPending = false;
  private _dropWaitFrames = 0;
  // knock-out (:1024-1040)
  private _lastHands: [Vector3, Vector3] | null = null;
  private _lastHandsTime = 0;

  get BallAudio(): AudioSourceRef | null {
    return this._audioSource;
  }

  override Start(): void {
    this.RegisterGraphEvent("bpRelease", "OnGraphRelease");
    this.RegisterGraphEvent("bpStill", "OnGraphStill");
    this.RegisterGraphEvent("bpLow", "OnGraphLow");
    const key = this.Settings.get("throw-key");
    if (key) this._throwKey = key;
    const vr = Number(this.Settings.get("throw-vr"));
    if (this.Settings.has("throw-vr") && Number.isFinite(vr)) this._throwVelocityMultiplierVR = vr;
    const desktop = Number(this.Settings.get("throw-desktop"));
    if (this.Settings.has("throw-desktop") && Number.isFinite(desktop)) this._throwVelocityMultiplierDekstop = desktop;
  }

  /** :103-124 (the owner's first pose is set by Game's ResetBalls on a fresh table). */
  Init(game: Game): void {
    this._gameManager = game;
    this._SetColor();
  }

  private get _radius(): number {
    return this._gameManager.BallRadius();
  }

  private ServerNow(): number {
    return this.Networking.GetServerTimeInSeconds();
  }

  /** :126-129 */
  private PlayAudio(clip: AudioClipRef | null, strength: number): void {
    if (clip && this._audioSource) this._audioSource.PlayOneShot(clip, Math.min(1, Math.max(0, strength)));
  }

  /** The body follows the owner's physics (false) or stands still where the page puts it (true). */
  private SetKinematic(kinematic: boolean): void {
    if (kinematic) {
      // a launch still waiting its turn (Game.Launch) is void once the ball is held still again
      this._gameManager?.CancelLaunch(this);
      this.Host.rbVelocity(this.gameObject.key, Vector3.zero);
    }
    // (not the cached rbKinematic: a grab changes the body behind the page's back)
    this.Host.op("rbKinematic", this.gameObject.key, [kinematic]);
  }

  /** `_pickup.pickupable`: the Grabbable layer when it may be taken, the UI layer when not. */
  private SetPickupable(pickupable: boolean): void {
    this.gameObject.layer = pickupable ? 20 : 5;
  }

  /** :131-191 */
  override OnDeserialization(): void {
    // Only the owner simulates the ball; everyone else draws it where the synced transform says.
    if (!this.Networking.IsOwner(this)) this.SetKinematic(true);
    this.SetPickupable(this._state[0] === BallState.Idle || (this._state[0] === BallState.InCup && !this._gameManager.DoAutoRespawnBalls));
    this._SetColor();

    if (this._state[0] === BallState.Rimming) {
      this._rimming = this._state[4]! * 2;
    } else if (this._state[0] === BallState.InCup) {
      const cup = this._gameManager.GetCup(this._state[1]!, this._state[2]!, this._state[3]!);
      if (cup) this.SetCupInside(cup, true);
    }

    if (this._state[0] !== this._localState) {
      this._localState = this._state[0]!;
      this._stateStartTime = this.Time.time;
      if (this._localState === BallState.Idle || this._localState === BallState.Flying) this.ResetLastCupsColliders();
      if (this._localState === BallState.InCup) this._TriggerSplash();
    }
  }

  /** :193-198 */
  private _TriggerSplash(): void {
    if (this._splashParticles) {
      this._splashParticles.transform.position = this.transform.position;
      this._splashParticles.Play();
    }
    this.PlayAudio(this._audio_water_splash, 1);
  }

  /** PostLateUpdate (:200-224), at the runtime's 20 Hz. */
  override Update(): void {
    if (!this._gameManager) return;
    switch (this._localState) {
      case BallState.InHand:
        if (this.Networking.IsOwner(this)) this.ThrowStrengthCheck();
        break;
      case BallState.Flying:
        this.UpdateVelocityTracking();
        if (this.Networking.IsOwner(this)) this.BallRespawnChecks();
        break;
      case BallState.Rimming:
        this.CheckKnockOut();
        this.DoRimming();
        break;
      case BallState.InCup:
        this.DoInCup();
        break;
      case BallState.Idle:
        this.AIFallback();
        break;
    }
  }

  /** :226-233, from the synced transform as the page sees it. */
  private UpdateVelocityTracking(): void {
    const position = this.transform.position;
    const dt = this.Time.deltaTime > 0 ? this.Time.deltaTime : 0.05;
    this._lastVelocity = position.sub(this._lastPosition).scale(1 / dt);
    this._lastPosition = position;
  }

  /** :235-246: the desktop charge, on a key. */
  private ThrowStrengthCheck(): void {
    if (!this._charging) return;
    this._throwStrengthPercent = (this.Time.time - this._keyDownStart) / MAX_MOUSE_DOWN_THROW_TIME;
    this.ShowStrength(this._throwStrengthPercent);
  }

  /**
   * The desktop charge bar (upstream: a screen-space quad with its own shader, StrengthIndicator.shader). Here a small
   * bar by the ball, drawn with URP's Unlit shader and alpha clipping: its texture's alpha falls from 1 to 0 left to
   * right, so a clip threshold of 1 - charge shows the left `charge` of it. Hidden below 1 %, as upstream (:27-35).
   */
  private ShowStrength(strength: number): void {
    const cutoff = strength < 0.01 ? 1.01 : 1 - Math.min(1, strength);
    this._strengthIndicatorDesktop?.SetFloat("_Cutoff", cutoff);
  }

  override OnKeyPressed(key: string): void {
    if (key !== this._throwKey || this._localState !== BallState.InHand || !this.HeldByMe()) return;
    this._charging = true;
    this._keyUsedThisHold = true;
    this._keyDownStart = this.Time.time;
  }

  override OnKeyReleased(key: string): void {
    if (key !== this._throwKey || !this._charging) return;
    this._charging = false;
    this._throwStrengthPercent = (this.Time.time - this._keyDownStart) / MAX_MOUSE_DOWN_THROW_TIME;
    // Letting go of the key throws: the page lets go of the ball, and the drop starts the throw.
    this.gameObject.ReleaseGrab();
  }

  private HeldByMe(): boolean {
    return this.Networking.IsOwner(this) && this._holder === this.Networking.LocalPlayer.playerId;
  }

  /** :264-289 (a miss ends the checks: see the header) */
  private BallRespawnChecks(): void {
    if (this.transform.position.y < this._gameManager.RespawnHeightWorld()) {
      this.Debug.Log("[ThryBP] Ball below respawn point. Respawning for other team.");
      this.Miss();
      return;
    }
    if (this._lastVelocity.sqrMagnitude > 0.5) {
      this._timeStartBeingStill = this.Time.time;
    } else if (this.Time.time - this._timeStartBeingStill > 1.0 && this.Time.time - this._stateStartTime > 1.0) {
      this.Debug.Log("[ThryBP] Ball idle for more than 1 second. Respawning for other team.");
      this.Miss();
    } else if (this.Time.time - this._stateStartTime > 15) {
      this.Debug.Log("[ThryBP] Ball Timeout. Respawning for other team.");
      this.Miss();
    }
  }

  private Miss(): void {
    this.NextTeam();
    this.Respawn();
  }

  /** The synced-clock time at which a rim shot drops in (the rim's length is (3000 - start) / 1300 s). */
  private RimEndServerTime(): number {
    return this._stateServerTime + (RIMMING_TOTAL_AGULAR_ROTATION - this._state[4]! * 2) / RIMMING_SPEED;
  }

  /** :291-334. The owner moves the ball; every client switches to "in the cup" at the same synced moment. */
  private DoRimming(): void {
    const cup = this._gameManager.GetCup(this._state[1]!, this._state[2]!, this._state[3]!);
    if (!cup) {
      if (this.Networking.IsOwner(this)) this.Respawn();
      return;
    }
    this._rimming = this._state[4]! * 2 + RIMMING_SPEED * (this.ServerNow() - this._stateServerTime);
    if (this._rimming < RIMMING_TOTAL_AGULAR_ROTATION) {
      if (!this.Networking.IsOwner(this)) return;
      const inside = 0.9 - (this._rimming / RIMMING_TOTAL_AGULAR_ROTATION) * 0.15;
      const downwards = 1 - (this._rimming / RIMMING_TOTAL_AGULAR_ROTATION) * 0.3;
      const angle = ((this._rimming - Math.pow(this._rimming * 0.009, 2)) / cup.GlobalCircumfrence) * 0.4;
      const position = cup.position
        .add(Vector3.up.scale(cup.GlobalHeight * downwards))
        .add(Quaternion.Euler(0, angle, 0).rotate(Vector3.forward).scale(cup.GlobalRadius * cup.lossyScaleX * inside - this._radius));
      this.transform.position = position;
      return;
    }
    this.SetCupInside(cup, true);
    if (this.Networking.IsOwner(this)) {
      let newVelocity = Quaternion.Euler(0, 90 + this._rimming, 0).rotate(Vector3.forward).scale(0.3); // in circle
      newVelocity = newVelocity.add(Quaternion.Euler(0, this._rimming + 180, 0).rotate(Vector3.forward).scale(0.1)); // inwards
      newVelocity = newVelocity.add(Vector3.down.scale(0.1)); // downwards
      this.Launch(this.transform.position, newVelocity);
    }
    this._localState = BallState.InCup;
    this._stateStartTime = this.Time.time;
    this._TriggerSplash();
    this.SetPickupable(!this._gameManager.DoAutoRespawnBalls);
  }

  /** Seconds the ball has been in the cup, on the synced clock. */
  private TimeInCup(): number {
    const since = this._state[0] === BallState.Rimming ? this.RimEndServerTime() : this._stateServerTime;
    return this.ServerNow() - since;
  }

  /** :336-401. (The containment snap at :342-354 is the owner's physics here.) */
  private DoInCup(): void {
    const game = this._gameManager;
    const cup = game.GetCup(this._state[1]!, this._state[2]!, this._state[3]!);
    if (!cup) {
      if (this.Networking.IsOwner(this)) this.Respawn();
      return;
    }
    if (!this.Networking.IsOwner(this)) return;
    const scoreType = this._state[0] === BallState.Rimming ? 1 : 0;
    const t = this.TimeInCup();
    if (game.Gamemode === GameMode.Normal) {
      if (!this._countedHit) {
        this._countedHit = true;
        game.CountCupHit(cup.PlayerCupOwner.PlayerIndex, this.CurrentPlayer, scoreType);
        if (!game.DoAutoRespawnBalls) {
          this.NextTeam();
          this.SendCustomEventDelayedSeconds("SendItsYourTurn", 2);
        }
        this.RequestSerialization();
      }
      if (t > 2 && (game.DoAutoRespawnBalls || t > 20)) {
        game.RemoveCup(cup, this.CurrentPlayer);
        this.Respawn();
      }
    } else if (game.Gamemode === GameMode.KingOfTheHill || game.Gamemode === GameMode.Mayham) {
      if (t > 1) {
        if (!this._countedHit) game.CountCupHit(cup.PlayerCupOwner.PlayerIndex, this.CurrentPlayer, scoreType);
        this._countedHit = true;
        game.RemoveCup(cup, this.CurrentPlayer);
        this.Respawn();
      }
    } else if (game.Gamemode === GameMode.BigPong) {
      if (t > 3) {
        if (!this._countedHit) game.CountCupHit(cup.PlayerCupOwner.PlayerIndex, this.CurrentPlayer, scoreType);
        this._countedHit = true;
        this.Respawn();
      }
    }
  }

  /** :403-408 */
  private SetState(s: number): void {
    this._state[0] = s;
    this._localState = s;
    this._stateStartTime = this.Time.time;
    this._stateServerTime = this.ServerNow();
  }

  /** :410-417 */
  SetPositionRotation(position: Vector3, rotation: Quaternion): void {
    this.SetKinematic(true);
    this.transform.SetPositionAndRotation(position, rotation);
    this._start_position = position.clone();
    this._start_rotation = rotation.clone();
    this.RequestSerialization();
  }

  /** True while the ball waits at a side's spawn (or in a cup it may be taken out of) for that side to throw. */
  WaitingForThrow(side: number): boolean {
    if (this.CurrentPlayer !== side) return false;
    return this._state[0] === BallState.Idle || (this._state[0] === BallState.InCup && !this._gameManager.DoAutoRespawnBalls);
  }

  /** :420-442 */
  override OnPickup(): void {
    this._countedHit = false;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    if (this._localState === BallState.InCup) {
      const cup = this._gameManager.GetCup(this._state[1]!, this._state[2]!, this._state[3]!);
      this._gameManager.RemoveCup(cup, this.CurrentPlayer);
    }
    this.SetState(BallState.InHand);
    this._holder = this.Networking.LocalPlayer.playerId;
    this._keyUsedThisHold = false;
    this._charging = false;
    this._throwStrengthPercent = 0;
    this._releaseFresh = false;
    this.SetPickupable(false);
    // upstream serialises the hand-relative pose 2 frames later (:424, :461-491); the state goes now
    this.RequestSerialization();
  }

  /** :444-459 */
  OnPickupAI(): void {
    this._countedHit = false;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    if (this._localState === BallState.InCup) {
      const cup = this._gameManager.GetCup(this._state[1]!, this._state[2]!, this._state[3]!);
      this._gameManager.RemoveCup(cup, this.CurrentPlayer);
    }
    this.SetState(BallState.Idle);
    this._holder = this.Networking.LocalPlayer.playerId;
  }

  /** The graph's release report: the drop velocity of :511-527, angular boost included (see the header). */
  OnGraphRelease(ball: string, vx: string, vy: string, vz: string): void {
    if (Number(ball) !== this.index) return;
    // all-zero samples give zero here (upstream divided by zero: NaN, :523)
    this._releaseVelocity = new Vector3(Number(vx) || 0, Number(vy) || 0, Number(vz) || 0);
    this._releaseFresh = true;
  }

  /** The graph saw the dynamic ball still for over a second (:273-282). */
  OnGraphStill(ball: string): void {
    if (Number(ball) !== this.index || !this.Networking.IsOwner(this) || this._localState !== BallState.Flying) return;
    if (this.Time.time - this._stateStartTime <= 1.0) return;
    this.Debug.Log("[ThryBP] Ball idle for more than 1 second. Respawning for other team. (ball graph)");
    this.Miss();
  }

  /** The graph saw the dynamic ball below the respawn height (:267-272). */
  OnGraphLow(ball: string): void {
    if (Number(ball) !== this.index || !this.Networking.IsOwner(this) || this._localState !== BallState.Flying) return;
    this.Debug.Log("[ThryBP] Ball below respawn point. Respawning for other team. (ball graph)");
    this.Miss();
  }

  /** :511-530 */
  override OnDrop(): void {
    if (this._localState !== BallState.InHand || !this.Networking.IsOwner(this)) return;
    this._dropPending = true;
    this._dropWaitFrames = 0;
    this.SendCustomEventDelayedFrames("OnDropDelayed", 1);
  }

  /** :533-594 */
  OnDropDelayed(): void {
    if (!this._dropPending) return;
    const desktop = this._keyUsedThisHold || this.Input.IsVR === false;
    if (!desktop && !this._releaseFresh && this._dropWaitFrames < RELEASE_WAIT_FRAMES) {
      this._dropWaitFrames++;
      this.SendCustomEventDelayedFrames("OnDropDelayed", 1);
      return;
    }
    this._dropPending = false;
    const game = this._gameManager;
    if (!desktop && this._releaseFresh) {
      this._start_velocity = this._releaseVelocity.scale(this._throwVelocityMultiplierVR);
    } else {
      const strength = Math.min(MAX_THROW_STRENGTH, this._throwStrengthPercent * MAX_THROW_STRENGTH);
      this.ShowStrength(0);
      this._start_velocity = this.transform.rotation.rotate(Vector3.forward).scale(strength * this._throwVelocityMultiplierDekstop);
    }
    this._throwStrengthPercent = 0;
    this._keyUsedThisHold = false;
    this._releaseFresh = false;

    this._start_position = this.transform.position;
    this._start_rotation = this.transform.rotation;
    this.SetPickupable(false);

    // Aim assist
    const aimAssist = game.AimAssist;
    if (game.AllowAimAssist && aimAssist > 0) this._start_velocity = this.DoAimAssistVectoring(this._start_velocity, this._start_position, aimAssist);

    game.Players[this.CurrentPlayer]!.LastAimAssistStrength = aimAssist;
    game.SetLastAimAssist(aimAssist);

    this.BeginFlight();
    game.CountThrow(this.CurrentPlayer);
  }

  /** :596-616 */
  ShootAI(skill: number): void {
    const game = this._gameManager;
    this._start_velocity = game.GetAIThrowVector(this.transform.position, this.CurrentPlayer).scale(MAX_THROW_STRENGTH * this._throwVelocityMultiplierDekstop);
    this._start_position = this.transform.position;
    this._start_rotation = this.transform.rotation;
    this.SetPickupable(false);
    this._start_velocity = this.DoAIVectoring(this._start_velocity, this._start_position, skill);
    this.BeginFlight();
  }

  /** SetState(Flying), the launch and the serialisation every throw ends with (:567-591, :601-615). */
  private BeginFlight(): void {
    this.SetState(BallState.Flying);
    this._holder = this.Networking.LocalPlayer.playerId;
    this._lastPosition = this._start_position.clone();
    this._lastVelocity = this._start_velocity.clone();
    this._timeStartBeingStill = this.Time.time;
    this.Launch(this._start_position, this._start_velocity);
    this.RequestSerialization();
  }

  /**
   * Hands the throw to the owner's physics: the kit's `rbLaunch` makes the body dynamic and gives it `velocity` on the
   * second physics step (seen in Play mode: a velocity set in the step the body leaves kinematic is lost to the SDK's
   * synced-object handoff, PORT.md 0.6). Game.Launch sends one launch at a time (see there). It starts where it is: every caller launches from the ball's current position.
   */
  private Launch(_position: Vector3, velocity: Vector3): void {
    this._gameManager.Launch(this, velocity);
  }

  // ========= Prediction ========== (:643-877)

  private PositionAtTime(start: Vector3, startVelocity: Vector3, time: number): Vector3 {
    const y = start.y + (GRAVITY * time * time) / 2 + startVelocity.y * time;
    const out = start.add(startVelocity.scale(time));
    out.y = y;
    return out;
  }

  VelocityAtTime(startVelocity: Vector3, time: number): Vector3 {
    const out = startVelocity.clone();
    out.y = GRAVITY * time + startVelocity.y;
    return out;
  }

  /** :659-697 */
  DoAimAssistVectoring(velocity: Vector3, position: Vector3, strength: number): Vector3 {
    if (strength === 0) return velocity;
    const tableHeight = this._gameManager.TableHeightWorld();
    const predictedTableHitTime = this.PredictTableHitTime(velocity, position, tableHeight);
    const predictionTableHit = this.GetTableHitPosition(velocity, position, tableHeight, predictedTableHitTime);
    let cup = this.GetClosestGlassToPredictedTableCollision(predictionTableHit);
    if (cup === null) return velocity;
    let cupOpening = cup.position.add(Vector3.up.scale(cup.GlobalHeight + this._radius));
    const hitOnCupPlane = this.PredictTableHit(velocity, position, cupOpening.y);
    if (Vector3.Distance(cupOpening, hitOnCupPlane) > strength) {
      const reflectVel = Vector3.Reflect(this.VelocityAtTime(velocity, predictedTableHitTime), Vector3.up).scale(BOUND_DRAG);
      const predictedCupHeightTime2 = this.PredictTableHitTime(reflectVel, predictionTableHit, cupOpening.y);
      const predictionCupHeightPosition2 = this.GetTableHitPosition(reflectVel, predictionTableHit, cupOpening.y, predictedCupHeightTime2);
      cup = this.GetClosestGlassToPredictedTableCollision(predictionCupHeightPosition2)!;
      cupOpening = cup.position.add(Vector3.up.scale(cup.GlobalHeight + this._radius));
      if (Vector3.Distance(cupOpening, predictionCupHeightPosition2) < strength) {
        const correctDirection = this.OptimalVectorJustChangeY(velocity, position, cup);
        const xzThrowDistance = this.XZDistance(position, predictionCupHeightPosition2);
        const targetXZDistance = this.XZDistance(position, cupOpening);
        const multiplier = targetXZDistance / xzThrowDistance;
        correctDirection.x *= multiplier;
        correctDirection.z *= multiplier;
        return correctDirection;
      }
      const flatVelocity = new Vector3(velocity.x, 0, velocity.z).normalized;
      const distance = Vector3.Cross(flatVelocity, new Vector3(cupOpening.x, 0, cupOpening.z).sub(new Vector3(position.x, 0, position.z))).magnitude;
      if (distance < strength) return this.OptimalVectorJustChangeY(velocity, position, cup);
      return velocity;
    }
    return this.OptimalVectorChangeStrength(velocity, position, cup);
  }

  private XZDistance(a: Vector3, b: Vector3): number {
    return Vector3.Distance(new Vector3(a.x, 0, a.z), new Vector3(b.x, 0, b.z));
  }

  /** :706-721 */
  private DoAIVectoring(velocity: Vector3, position: Vector3, skill: number): Vector3 {
    if (skill === 0) return velocity;
    const predictionTableHit = this.PredictTableHit(velocity, position, this._gameManager.TableHeightWorld());
    const cup = this.GetClosestGlassToPredictedTableCollision(predictionTableHit);
    if (cup === null) return velocity;
    const optimalVector = this.OptimalVectorChangeStrength(velocity, position, cup);
    let lerping = this.Random.Range(0, 1);
    if (lerping < skill) lerping = 1; // hit
    else lerping = (1 - lerping) * 0.85; // miss
    return Vector3.Lerp(velocity, optimalVector, lerping);
  }

  /** :723-755 */
  OptimalVectorChangeStrength(velocity: Vector3, position: Vector3, cup: Cup): Vector3 {
    const cupOpening = cup.position.add(Vector3.up.scale(cup.GlobalHeight + this._radius));
    const horizonzalVector = cupOpening.sub(position);
    horizonzalVector.y = 0;
    const horizonzalVelocity = velocity.clone();
    horizonzalVelocity.y = 0;
    const d = horizonzalVector.magnitude;
    const y0 = position.y;
    const y = cupOpening.y;
    const w = (Math.PI / 180) * Vector3.Angle(horizonzalVelocity, velocity);
    const g = -GRAVITY;
    const v0 = d / Math.sqrt((2 * (y0 - y + Math.tan(w) * d)) / g) / Math.cos(w);
    if (Number.isNaN(v0)) return velocity;
    const newDirection = horizonzalVector.normalized.scale(horizonzalVelocity.magnitude);
    newDirection.y = velocity.y;
    return newDirection.normalized.scale(v0);
  }

  /** :757-766 */
  private OptimalVectorJustChangeY(velocity: Vector3, position: Vector3, cup: Cup): Vector3 {
    const horizonzalVector = cup.position.sub(position);
    horizonzalVector.y = 0;
    const horizonzalVelocity = velocity.clone();
    horizonzalVelocity.y = 0;
    const newDirection = horizonzalVector.normalized.scale(horizonzalVelocity.magnitude);
    newDirection.y = velocity.y;
    return newDirection;
  }

  /** :795-822 */
  private GetClosestGlassToPredictedTableCollision(prediction: Vector3): Cup | null {
    const game = this._gameManager;
    let aimedCup: Cup | null = null;
    let closestDistance = Number.MAX_VALUE;
    const disallowOwnCups = game.ShouldAimAssistAimForOwnCups() === false;
    const disallowOwnSide = game.ShouldAimAssistAimAtOwnSide() === false;
    for (let p = 0; p < game.PlayerCount; p++) {
      const manager = game.Players[p]!.CupsManager;
      const cups = manager.List;
      for (let i = 0; i < manager.Length; i++) {
        const cup = cups[i];
        if (!cup) continue;
        if (disallowOwnCups && cup.PlayerCupOwner.PlayerIndex === this.CurrentPlayer) continue;
        if (disallowOwnSide && cup.PlayerAnchorSide.PlayerIndex === this.CurrentPlayer) continue;
        const d = Vector3.Distance(cup.position, prediction);
        if (d < closestDistance) {
          closestDistance = d;
          aimedCup = cup;
        }
      }
    }
    return aimedCup;
  }

  /** :824-828 */
  private PredictTableHit(orignVelocity: Vector3, orignPosition: Vector3, tableHeight: number): Vector3 {
    const t = this.PredictTableHitTime(orignVelocity, orignPosition, tableHeight);
    return this.GetTableHitPosition(orignVelocity, orignPosition, tableHeight, t);
  }

  /** :830-833 */
  private GetTableHitPosition(orignVelocity: Vector3, orignPosition: Vector3, tableHeight: number, t: number): Vector3 {
    return new Vector3(orignPosition.x + orignVelocity.x * t, tableHeight + this._radius, orignPosition.z + orignVelocity.z * t);
  }

  /** :835-848 */
  PredictTableHitTime(orignVelocity: Vector3, orignPosition: Vector3, tableHeight: number): number {
    const c0 = GRAVITY / 2;
    const c1 = orignVelocity.y;
    const c2 = orignPosition.y - (tableHeight + this._radius);
    const quadraticOut = [0, 0];
    const quadratic = SolveQuadric(c0, c1, c2, quadraticOut);
    let t = 0;
    if (quadratic === 1) t = quadraticOut[0]!;
    else if (quadratic === 2 && quadraticOut[0]! > 0 && quadraticOut[0]! > quadraticOut[1]!) t = quadraticOut[0]!;
    else if (quadratic === 2 && quadraticOut[1]! > 0) t = quadraticOut[1]!;
    return t;
  }

  /** The parabola of :645-651 (kept for tests of the aim assist). */
  PositionAt(start: Vector3, velocity: Vector3, time: number): Vector3 {
    return this.PositionAtTime(start, velocity, time);
  }

  // ========= Collision Code ======

  /** :881-889 */
  private ResetLastCupsColliders(): void {
    const cup = this._gameManager.GetCup(this._state[1]!, this._state[2]!, this._state[3]!);
    if (cup) this.SetCupInside(cup, false);
  }

  /** cup.ColliderForThrow.enabled = !inside; cup.ColliderInside.SetActive(inside): game op `cupInside`. */
  private SetCupInside(cup: Cup, inside: boolean): void {
    if (!cup.spawned) return;
    CupInside(this.Host, "@" + cup.manager.CupPath(cup), inside);
  }

  /** :891-905, taking ownership first (fix for Game.cs:719, :727). */
  Respawn(): void {
    if (!this.Networking.IsOwner(this)) this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this._dropPending = false;
    this.SetState(BallState.Idle);
    const spawn = this._gameManager.GetBallSpawn(this.CurrentPlayer);
    this.SetKinematic(true);
    this.transform.SetPositionAndRotation(spawn.position, spawn.rotation);
    this._start_position = spawn.position.clone();
    this._start_rotation = spawn.rotation.clone();
    this._start_velocity = Vector3.zero;
    this._holder = -1;
    this.SetPickupable(true);
    this._gameManager.Players[this.CurrentPlayer]!.ItsYourTurn(this);
    this.ResetLastCupsColliders();
    this.RequestSerialization();
  }

  /** :907-910 */
  SendItsYourTurn(): void {
    this._gameManager.Players[this.CurrentPlayer]!.ItsYourTurn(this);
  }

  /** :912-921 */
  private NextTeam(): void {
    this.CurrentPlayer = this._gameManager.GetNextPlayer(this.CurrentPlayer);
    if (this.CurrentPlayer >= this._gameManager.PlayerCount) this.CurrentPlayer = 0;
    this._SetColor();
    this.RequestSerialization();
  }

  /** :923-927 */
  _SetColor(): void {
    const player = this._gameManager?.Players[this.CurrentPlayer];
    if (!player) return;
    const color = player.ActiveColor;
    this._renderer?.SetColor(color);
    this._gameManager.SetActivePlayerColor(color);
  }

  /** :931-980, on what the graph reported. */
  private BallGlassCollision(ballPos: Vector3, cupPos: Vector3, cupTop: number, hitGlass: Cup): void {
    const isCollisionOnTop = cupTop < ballPos.y;
    const p1 = new Vector3(ballPos.x, 0, ballPos.z);
    const p2 = new Vector3(cupPos.x, 0, cupPos.z);
    const distanceFromCenter = Vector3.Distance(p1, p2) / hitGlass.GlobalRadius;
    this.contactTrace.push(`${hitGlass.name}: ball y ${ballPos.y.toFixed(3)} top ${cupTop.toFixed(3)} d ${distanceFromCenter.toFixed(2)}`);
    if (this.contactTrace.length > 20) this.contactTrace.shift();
    if (!isCollisionOnTop) return;
    if (distanceFromCenter >= COLLISION_MAXIMUM_DISTANCE_FROM_CENTER) return;

    const angle = Vector3.Angle(this._contactVelocity, Vector3.down);
    // C# `&&`: the second number is drawn only when the first test passes
    const tripOnEdge = distanceFromCenter > this.Random.Range(0.4, 0.7) && angle > this.Random.RangeInt(45, 80);

    if (tripOnEdge) {
      this.SetState(BallState.Rimming);
      this._state[1] = hitGlass.PlayerAnchorSide.PlayerIndex;
      this._state[2] = hitGlass.Row;
      this._state[3] = hitGlass.Column;
      const toCup = p2.sub(p1);
      this._rimming = Vector3.Angle(hitGlass.rotation.rotate(Vector3.forward), toCup);
      if (toCup.x > 0) this._rimming = 360 - this._rimming;
      this._rimming = this._rimming % 360;
      this._state[4] = CastInt(this._rimming / 2);
      this._state[5] = CastInt(distanceFromCenter * 100);
      this.SetKinematic(true);
    } else {
      this.SetCupInside(hitGlass, true);
      this.SetPickupable(!this._gameManager.DoAutoRespawnBalls);
      this.SetState(BallState.InCup);
      this._state[1] = hitGlass.PlayerAnchorSide.PlayerIndex;
      this._state[2] = hitGlass.Row;
      this._state[3] = hitGlass.Column;
      this._TriggerSplash();
      // upstream: Vector3.down * |segment velocity|, already reflected and times 0.9 (:975, :997)
      this.Launch(ballPos, Vector3.down.scale(this._contactVelocity.magnitude * BOUND_DRAG));
    }
    this.RequestSerialization();
  }

  /**
   * OnCollisionEnter (:982-1022), as the ball graph reports it (bindings: collisionEnter on the ball): `detail.args` is
   * <other name>, the point and normal, then <own>|<bx>|<by>|<bz>|<vx>|<vy>|<vz>|<cx>|<cy>|<cz>|<cup top y>.
   */
  OnBallCollision(detail: HostEventDetail): void {
    const extra = (detail.args ?? []).slice(7);
    const given = (i: number) => extra[i] !== undefined && extra[i] !== "" && Number.isFinite(Number(extra[i]));
    const num = (i: number) => (given(i) ? Number(extra[i]) : 0);
    const otherName = detail.otherName ?? "";
    const own = extra[0] === "1";
    const match = CUP_NAME.exec(otherName);
    const hasHitGlass = match !== null;
    const velocity = new Vector3(num(4), num(5), num(6));
    this.PlayAudio(hasHitGlass ? this._audio_collision_glass : this._audio_collision_table, velocity.sqrMagnitude / 10);
    if (!this.Networking.IsOwner(this) || this._state[0] !== BallState.Flying) return;
    this._contactVelocity = velocity;
    const ballPos = [1, 2, 3].every(given) ? new Vector3(num(1), num(2), num(3)) : this.transform.position;
    if (hasHitGlass) {
      if (!own) return; // a cup of another table: AllowCollision is false (Game.cs:480)
      const side = Number(match[1]);
      const player = this._gameManager.Players[side];
      const hitGlass = player ? player.CupsManager.CupAtIndex(Number(match[2])) : null;
      if (!hitGlass) return;
      if (!this._gameManager.AllowCollision(this.CurrentPlayer, hitGlass.PlayerCupOwner, hitGlass.PlayerAnchorSide)) return;
      const reported = [7, 8, 9, 10].every(given);
      const cupPos = reported ? new Vector3(num(7), num(8), num(9)) : hitGlass.position;
      const top = reported ? num(10) : hitGlass.GetBounds().max.y;
      this.BallGlassCollision(ballPos, cupPos, top, hitGlass);
    } else if (!otherName.startsWith("[ThryBP]")) {
      this.Debug.Log("[ThryBP] Ball hit non game object. Respawning for other team.");
      this.Miss();
    }
  }

  /** OnTriggerEnter with a hand collider while rimming (:1024-1040): the local hands, from the page's poses. */
  private CheckKnockOut(): void {
    const poses = this.Input.Poses;
    if (!poses) return;
    const hands: [Vector3, Vector3] = [poses.leftHand.position, poses.rightHand.position];
    const previous = this._lastHands;
    const dt = this.Time.time - this._lastHandsTime;
    this._lastHands = [hands[0].clone(), hands[1].clone()];
    this._lastHandsTime = this.Time.time;
    if (!this.transform.known) return;
    const ballPos = this.transform.position;
    for (let side = 0; side < 2; side++) {
      if (Vector3.Distance(hands[side]!, ballPos) >= HAND_RADIUS + this._radius) continue;
      const velocity = previous && dt > 0 ? hands[side]!.sub(previous[side]!).scale(1 / dt) : Vector3.zero;
      this.Networking.SetOwner(this.Networking.LocalPlayer, this);
      this._start_velocity = velocity;
      this._start_position = ballPos;
      this._start_rotation = this.transform.rotation;
      this.BeginFlight();
      return;
    }
  }

  /** Item 98: an AI side's ball nobody is driving is driven by the referee. */
  private AIFallback(): void {
    if (!this.Networking.IsMaster || !this.gameObject.activeSelf) return;
    const player = this._gameManager.Players[this.CurrentPlayer];
    if (!player || !player._isAI || player.aiTurnPending) return;
    if (this.ServerNow() - this._stateServerTime < AI_FALLBACK_SECONDS) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    this._stateServerTime = this.ServerNow();
    player.ItsYourTurn(this);
  }

  /** The referee finishes what a holder or thrower who left started (items 96, 97). */
  override OnPlayerLeft(player: NetPlayer): void {
    if (!this.Networking.IsMaster || player.playerId !== this._holder) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this);
    if (this._state[0] === BallState.InHand) this.Respawn();
    else if (this._state[0] === BallState.Flying) this.Miss();
    // Rimming and InCup: this client now owns the ball, and Update counts and removes as usual.
  }
}

/** :850-877 */
export function SolveQuadric(c0: number, c1: number, c2: number, s: number[]): number {
  const p = c1 / (2 * c0);
  const q = c2 / c0;
  const D = p * p - q;
  if (D === 0) {
    s[0] = -p;
    return 1;
  } else if (D < 0) {
    return 0;
  } else {
    const sqrt_D = Math.sqrt(D);
    s[0] = sqrt_D - p;
    s[1] = -sqrt_D - p;
    return 2;
  }
}
