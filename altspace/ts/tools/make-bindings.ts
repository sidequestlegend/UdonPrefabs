// Writes a PROVISIONAL ts/bindings.json from the object model in ../PORT.md (section 5: hierarchy, serialized fields,
// UI wiring). The kit builder (Assets/Kit/Editor/BeerPongKitBuilder.cs, not written yet) replaces it with the real
// file: paths it could not confirm, measured sizes and positions, refs order and the bundle addresses.
//
//   node --disable-warning=ExperimentalWarning tools/make-bindings.ts        (npm run bindings)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Obj {
  path: string;
  sync: "none" | "transform";
  grab: boolean;
  click: boolean;
  seat: boolean;
}

const objects: Record<string, Obj> = {};
const refs: string[] = [];
const behaviours: Array<{ id: string; type: string; object: string | null; fields: Record<string, Json> }> = [];
const events: Array<Record<string, Json>> = [];

const TOP = "BeerPong";
function obj(key: string, path: string, options: Partial<Obj> & { ref?: boolean } = {}): string {
  path = path ? `${TOP}/${path}` : TOP;
  objects[key] = { path, sync: options.sync ?? "none", grab: options.grab ?? false, click: options.click ?? false, seat: false };
  if (options.ref !== false) refs.push(key);
  return key;
}
const comp = (key: string, kind: string): Json => ({ $comp: key, kind });
const beh = (id: string): Json => ({ $beh: id });
const v3 = (x: number, y: number, z: number): Json => ({ $v3: [x, y, z] });

const PLAYER_NAMES = ["Player", "Player (1)", "Player (2)", "Player (3)"];
const BALL_NAMES = ["Ball", "Ball (1)", "Ball (2)", "Ball (3)"];
// Game._initialPlayerColors in the prefab (PORT.md item 2)
const COLORS = [
  [0.237, 0.745, 0, 1],
  [0.745, 0, 0.218, 1],
  [0, 0.569, 0.764, 1],
  [0.84, 0.698, 0, 1],
];

// ---- table, balls, effects ----
obj("beerPong", "", { ref: false });
obj("table", "table");
for (const n of [2, 3, 4]) obj(`table${n}`, `table/[ThryBP]${n}Players`);
obj("splash", "SplashParticles");
for (let i = 0; i < 4; i++) {
  obj(`ball${i}`, BALL_NAMES[i]!, { sync: "transform", grab: true });
  obj(`ball${i}Bar`, `${BALL_NAMES[i]}/StrengthBar`);
}

// ---- one side ----
function side(s: number): void {
  const base = `Players/${PLAYER_NAMES[s]}`;
  const ui = `${base}/Fixture UI/Slider/Panel/UI`;
  const k = (name: string) => `p${s}${name}`;
  obj(k(""), base);
  obj(k("score"), `${base}/ScoreTable/Points`);
  obj(k("uiButton"), `${base}/Fixture UI/Button Open Settings`, { click: true });
  obj(k("uiAnim"), `${base}/Fixture UI`);
  obj(k("popup"), `${base}/Temp Scoreboard`);
  obj(k("popupScore"), `${base}/Temp Scoreboard/Canvas/Score`);
  obj(k("popupAssist"), `${base}/Temp Scoreboard/Canvas/Player Aim Assist/Value`);
  obj(k("popupBg0"), `${base}/Temp Scoreboard/Canvas/BG_scoreboard`);
  obj(k("popupBg1"), `${base}/Temp Scoreboard/Canvas/BG_scoreboard/BG`);
  obj(k("lastAssist"), `${ui}/Last Aim Assist/Value`);
  const tabs = ["Game", "Rules", "Player", "AI", "Visual", "Credits"];
  obj(k("navbar"), `${ui}/NavBar`);
  tabs.forEach((t) => obj(k("tab" + t), `${ui}/NavBar/${t}`));
  obj(k("aiSettings"), `${ui}/Main/AI/AI`);
  obj(k("aimAssistSettings"), `${ui}/Main/AI/AimAssist`);
  obj(k("avatarColor"), `${ui}/Main/Visual/UseAvatarThemeColor`);

  behaviours.push({
    id: `p${s}`,
    type: "Player",
    object: k(""),
    fields: {
      CupsManager: beh(`cm${s}`),
      ScoreAnnouncement: beh(`ann${s}`),
      UIAnimator: comp(k("uiAnim"), "Animator"),
      UiButtonRenderer: comp(k("uiButton"), "Renderer"),
      LastAimAssitDisplay: comp(k("lastAssist"), "Text"),
      UI_score_boards: [comp(k("score"), "Text")],
      UiImagesUsingPlayerColor: [comp(k("popupBg0"), "Image"), comp(k("popupBg1"), "Image")],
      UiImageAlphas: [1, 1],
      _avatarThemeColorToggle: { $obj: k("avatarColor") },
      _aiNavButton: { $obj: k("tabAI") },
      _aiSettings: { $obj: k("aiSettings") },
      _aimAssistSettings: { $obj: k("aimAssistSettings") },
      _adaptiveAimToggle: { $obj: obj(k("adaptiveAim"), `${ui}/Main/AI/AimAssist/AdaptiveAim`) },
      BallSpawnLocal: v3(0.552, 0.01, -1.311),
      AiBallSpawnLocal: v3(0, 0.42, -1.547),
      CupsAnchorLocal: v3(0, 0, -1.317),
      CupsAnchorPath: `${TOP}/${base}/[GamemodeNormal]Cups Anchor`,
    },
  });
  behaviours.push({
    id: `cm${s}`,
    type: "CupsManager",
    object: obj(k("cupsAnchor"), `${base}/[GamemodeNormal]Cups Anchor`, { ref: false }),
    // Glass_LOD0 bounds of the template from glass.dae (import scale 0.0375): radius 0.052, height 0.152 (PORT.md 3.6)
    fields: { Glass: { boundsExtents: v3(0.052, 0.076, 0.052), lossyScale: v3(1, 1, 1) }, SidePlayer: beh(`p${s}`), LogMinLevel: 1 },
  });
  behaviours.push({
    id: `ann${s}`,
    type: "PlayerScoreAnnouncement",
    object: k("popup"),
    fields: { _animator: comp(k("popup"), "Animator"), _textScore: comp(k("popupScore"), "TMP"), _textSkill: comp(k("popupAssist"), "TMP"), _player: beh(`p${s}`) },
  });

  // ---- the panel's inputs (PORT.md 5.4) ----
  const input = (id: string, type: string, key: string, fields: Record<string, Json>) =>
    behaviours.push({ id: `p${s}_${id}`, type, object: key, fields: { NetworkVariable: false, EventName: "", VariableName: "", ...fields } });
  const toggle = (id: string, path: string, target: string, variable: string) => {
    const key = obj(k("_" + id), `${ui}/${path}`);
    input(id, "SimpleUIToggle", key, { UdonBehaviours: [beh(target)], VariableName: variable, NetworkVariable: true });
    events.push({ object: key, kind: "uiToggle", behaviour: `p${s}_${id}`, method: "OnValueChanged" });
  };
  const slider = (id: string, path: string, target: string, variable: string, networked: boolean, whole: boolean, extra: Record<string, Json> = {}) => {
    const key = obj(k("_" + id), `${ui}/${path}`);
    input(id, "SimpleUISlider", key, { UdonBehaviours: [beh(target)], VariableName: variable, NetworkVariable: networked, wholeNumbers: whole, ...extra });
    events.push({ object: key, kind: "uiSlider", behaviour: `p${s}_${id}`, method: "OnValueChanged" });
    return key;
  };
  const selector = (id: string, path: string, target: string, variable: string, networked: boolean, options: string[], eventName = "") => {
    const key = obj(k("_" + id), `${ui}/${path}`);
    const label = obj(k("_" + id + "Label"), `${ui}/${path}/Label`);
    input(id, "SimpleUIOptionSelector", key, { UdonBehaviours: [beh(target)], VariableName: variable, NetworkVariable: networked, EventName: eventName, Options: options, Label: comp(label, "Text") });
    events.push({ object: obj(k("_" + id + "Left"), `${ui}/${path}/Left`), kind: "uiButton", behaviour: `p${s}_${id}`, method: "Prev" });
    events.push({ object: obj(k("_" + id + "Right"), `${ui}/${path}/Right`), kind: "uiButton", behaviour: `p${s}_${id}`, method: "Next" });
  };
  const button = (id: string, path: string, behaviour: string, method: string) => {
    events.push({ object: obj(k("_" + id), `${ui}/${path}`), kind: "uiButton", behaviour, method });
  };

  // Game tab
  selector("mode", "Main/Game/Gamemode", "game", "_gameMode", true, ["Normal", "King of the Pong", "Big Pong", "Mayhem"]);
  const countHandle = obj(k("_countHandle"), `${ui}/Main/Game/PlayerCount/Handle Slide Area/Handle/Text`);
  slider("count", "Main/Game/PlayerCount", "game", "_playerCount", true, true, { Handle: comp(countHandle, "Text") });
  toggle("teams", "Main/Game/TeamsBarrier/Teams", "game", "_doTeams");
  toggle("barrier", "Main/Game/TeamsBarrier/Barrier", "game", "_useBarrier");
  // Rules tab
  toggle("selfFire", "Main/Rules/Self Fire", "game", "_allowSelfFire");
  toggle("friendlyFire", "Main/Rules/Friendly Fire (Teams):", "game", "_allowFriendlyFire");
  toggle("autoRespawn", "Main/Rules/Auto Respawn Balls", "game", "_doAutoRespawnBalls");
  // Player tab: rows and shape are this side's, not networked, then ResetGlasses
  const rowsHandle = obj(k("_rowsHandle"), `${ui}/Main/Player/Options/Rows/Handle Slide Area/Handle/Text`);
  slider("rows", "Main/Player/Options/Rows", `cm${s}`, "_rows", false, true, { EventName: "ResetGlasses", Handle: comp(rowsHandle, "Text") });
  selector("shape", "Main/Player/Options/Shape", `cm${s}`, "_shape", false, ["Triangle", "Square", "Circle", "HashTag"], "ResetGlasses");
  button("reset", "Main/Player/Options/Buttons/Reset", `p${s}`, "ResetPlayer");
  button("rerack", "Main/Player/Options/Buttons/Rerack", `cm${s}`, "Rerack");
  button("sync", "Main/Player/Global/Sync", `p${s}`, "SyncSettingsToAllPlayers");
  button("resetAll", "Main/Player/Global/Reset", `p${s}`, "ResetAllPlayers");
  // AI tab
  toggle("ai", "Main/AI/AI/AI", `p${s}`, "_isAI");
  toggle("aiAdaptive", "Main/AI/AI/Adaptive", `p${s}`, "_useAdaptiveAISkill");
  slider("aiSkill", "Main/AI/AI/AI Skill", `p${s}`, "_aiSkill", true, false);
  slider("aimAssist", "Main/AI/AimAssist/AimAssist", "game", "_aimAssist", true, false);
  // Visual tab
  toggle("pointsPopup", "Main/Visual/Points Popup", "game", "_showPointsPopup");
  slider("size", "Main/Visual/Size/Slider", "game", "_size", true, false, { resetValue: 1 });
  button("sizeReset", "Main/Visual/Size/Reset", `p${s}_size`, "ResetValue");
  // Volume (local)
  slider("volume", "Volume/Container/Volume", "game", "_volume", false, false);
  // the speaker button opens the volume slider (local)
  const volumeToggle = obj(k("_volumeToggle"), `${ui}/Volume/Toggle`);
  behaviours.push({ id: `p${s}_volumeOpen`, type: "ToggleActive", object: volumeToggle, fields: { Target: { $obj: obj(k("_volumeContainer"), `${ui}/Volume/Container`) } } });
  events.push({ object: volumeToggle, kind: "uiToggle", behaviour: `p${s}_volumeOpen`, method: "OnValueChanged" });
  // Tabs
  input("nav", "SimpleUIToggleGroup", k("navbar"), {
    UdonBehaviours: [beh(`p${s}`)],
    VariableName: "_settingsNavbar",
    NetworkVariable: true,
    Toggles: tabs.map((t) => ({ $obj: k("tab" + t) })),
    Contents: tabs.map((t) => ({ $obj: obj(k("content" + t), `${ui}/Main/${t}`) })),
  });
  tabs.forEach((t, i) => events.push({ object: k("tab" + t), kind: "uiToggle", behaviour: `p${s}_nav`, method: `_Toggle${i}` }));
  // Open Settings (click on the table edge, reach 1 m)
  input("open", "SimpleUIInteract", k("uiButton"), { UdonBehaviours: [beh(`p${s}`)], EventName: "ToggleSettings" });
}

for (let s = 0; s < 4; s++) side(s);

for (let i = 0; i < 4; i++) {
  behaviours.push({
    id: `ball${i}`,
    type: "Ball",
    object: `ball${i}`,
    fields: {
      index: i,
      _throwVelocityMultiplierVR: 1.5,
      _throwVelocityMultiplierDekstop: 1,
      _gameManager: beh("game"),
      _renderer: comp(`ball${i}`, "Renderer"),
      _splashParticles: comp("splash", "ParticleSystem"),
      _audioSource: comp(`ball${i}`, "AudioSource"),
      _strengthIndicatorDesktop: comp(`ball${i}Bar`, "Renderer"),
      _audio_collision_table: { $clip: 0 },
      _audio_collision_glass: { $clip: 1 },
      _audio_water_splash: { $clip: 2 },
    },
  });
  events.push({ object: `ball${i}`, kind: "collisionEnter", behaviour: `ball${i}`, method: "OnBallCollision" });
}

const pose = (yaw: number): Json => ({ position: v3(0, 0.8, 0), yaw });
behaviours.unshift({
  id: "game",
  type: "Game",
  object: "beerPong",
  fields: {
    _initialPlayerColors: COLORS.map((c) => ({ $color: c })),
    _allowAvatarThemeColorUsage: true,
    _allowAimAssist: true,
    _allowAI: true,
    PlayersList: [0, 1, 2, 3].map((s) => beh(`p${s}`)),
    _tablesAnimator: comp("table", "Animator"),
    Balls: [0, 1, 2, 3].map((i) => beh(`ball${i}`)),
    _teamIndicatorMaterialIndex: 3,
    _tables: [null, null, comp("table2", "Renderer"), comp("table3", "Renderer"), comp("table4", "Renderer")],
    _twoTeamPositions: [pose(0), pose(180)],
    _threeTeamPositions: [pose(0), pose(240), pose(120)],
    _fourTeamPositions: [pose(0), pose(180), pose(90), pose(270)],
    _respawnHeightLocal: v3(0, 0.4, 0),
    _kingOfTheHillLocal: v3(0, 0.8, 0),
    KingOfTheHillPath: `${TOP}/KingOfTheHillPosition`,
    ballRadiusLocal: 0.03,
    LogMinLevel: 1,
  },
});

const bindings = {
  schema: 1,
  slug: "beer-pong",
  hash: "",
  provisional:
    "Written by ts/tools/make-bindings.ts from PORT.md section 5, not by the kit builder: paths, sizes and positions are unconfirmed and refs order will change.",
  bundles: { windows: "", android: "" },
  objects,
  refs,
  behaviours,
  events,
};

const out = fileURLToPath(new URL("../bindings.json", import.meta.url));
writeFileSync(out, JSON.stringify(bindings, null, 2) + "\n");
console.log(`wrote ${out}: ${Object.keys(objects).length} objects, ${refs.length} refs, ${behaviours.length} behaviours, ${events.length} events`);
