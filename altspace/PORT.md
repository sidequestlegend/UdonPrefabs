# Beer pong: port analysis

Analysis written 2026-11-24 before any work; section 0 is the port's status since. In the analysis nothing was built, compiled, run or opened in Unity. Every statement
about upstream was read from the clone at `C:\workspace\AltspaceGames\beer-pong`; statements about
the platform come from `portkit/README.md`, the approved plan and the SDK 4.0.29 `Docs/` folder.
Where something could not be determined it says so.

Reference style: a bare script name is under `_Internal/BeerPong/scripts/` (`Ball.cs:423` means
`_Internal/BeerPong/scripts/Ball.cs` line 423). `UI/x.cs` is `_Internal/UI/x.cs`, `_Scripts/x.cs` is
`_Internal/_Scripts/x.cs`, `HandCollider.cs` is `_Internal/HandColliderSystem/HandCollider.cs`.
Prefab objects are given by hierarchy path inside `BeerPong.prefab` (repo root, 75,690 lines).
"Slot" means one of the four `Player` objects (a side of the table), not a person.

---

## 0. Port status: the TypeScript rules (2026-11-24)

This section is the state of the port; where it differs from the analysis below (written before the work), it wins.
Rung 1 only: nothing has been built or run in Unity yet, and `ts/bindings.json` is provisional (see "Bindings").

### 0.1 Decisions (coordinator, after the analysis)

- **The ball in flight is a real Unity rigidbody**, owned and simulated by the thrower's client and transform-synced
  (`sync: "transform"`), as upstream lets the owner's PhysX decide. The formula replay and the contact solver of
  section 8.3 (`BallFlight.ts`, the `motion` op, the segment table, time stretching) are **not built**; nor is the
  `vel` relay op: the ball graph reports the release instead (below).
- **Cup hits are decided by the thrower's client** from contacts the kit's ball graph reports to the page
  (graph-to-page event `bpContact`); every client's graph may report, only the ball's owner acts (Ball.cs:1000).
- The TypeScript owns: modes and settings, racks, re-racks, removal and colours (King of the Hill up to 176 cups),
  turns, scores, announcements, the start of a throw (VR release velocity from the graph event `bpRelease`; desktop
  charge on a key), hit and miss bookkeeping, the AI, the settings panels' logic.
- Dead upstream features are not ported: the adaptive aim assist and its toggle (item 77), the `Locked` state and
  the throw-indicator arrow (item 10). Also left out: avatar theme colour (16), Index trigger release (18), developer
  cheat (78), click sound and haptic (93).
- Other rules are literal; plain bugs are fixed and listed (0.5).
- A fresh table takes its starting values from the snippet's attributes (section 8.2); a table resumed or joined
  keeps what the room holds.

### 0.2 What was built (`altspace/ts/`)

| File | From | Notes |
|---|---|---|
| `src/Game.ts` | `Game.cs` | modes, side count, options, scoring, turns, AI targeting; the table's frame (holder pose x synced size) |
| `src/CupsManager.ts` | `CupsManager.cs` | grid rules line for line; one-pass diff instead of the per-frame walk; cups through the `cup` op |
| `src/Player.ts` | `Player.cs` | one side: score, colour, AI turn, panel state |
| `src/Cup.ts` | `Cup.cs` | a plain object per cup copy (no behaviour); King of the Hill colours from Unity's generator (`src/Unity.ts`) |
| `src/PlayerScoreAnnouncement.ts` | `PlayerScoreAnnouncement.cs` | |
| `src/Ball.ts` | `Ball.cs` | state machine, throw start, aim assist and AI vectoring (:645-877 literal), rim, in-cup timers, misses; no motion |
| `src/ThryBehaviour.ts` | `_Scripts/ThryBehaviour.cs`, `Logging.cs`, `Helpers.cs` (Duplicate) | |
| `src/SimpleUISetterExtension.ts`, `src/SimpleUIInput.ts`, `src/SimpleUIToggle.ts`, `src/SimpleUISlider.ts`, `src/SimpleUIOptionSelector.ts`, `src/SimpleUIInteract.ts`, `src/SimpleUIToggleGroup.ts` | `_Internal/UI/` | the editor post-processes that fill `_simpleUIReferences`, `LinkedInputs` and `UdonBehaviours` are redone at run time from bindings |
| `src/PortOps.ts`, `src/Unity.ts` | none | workarounds for runtime gaps (0.6) |
| `tools/make-bindings.ts` -> `bindings.json` | section 5 | **provisional** object model (210 objects, 89 behaviours, 116 events); marked `"provisional"` in the file |
| `golden/` -> `vectors/upstream.json` | `CupsManager.cs` | upstream's file compiled **unchanged** with dotnet 8 against `portkit/golden/UdonStubs.cs` (`npm run golden`) |
| `test/racks.test.ts`, `test/scenarios.test.ts`, `test/helpers.ts` | | 18 tests (5 rules/vectors, 13 FakeRoom scenarios) |

Not translated in this job: `UI/Localization.cs`, `UI/LocalizationMenu.cs` (labels ship in English, item 92),
`HandCollider.cs` (the knock-out reads the page's hand poses instead), `VRDesktopToggler.cs` and `ClickSound.cs`
(Unity side / left out).

### 0.3 Kit side the TypeScript expects (the kit builder and its graphs must provide)

Game relay ops (sent by `PortOps.ts`; add them in `BeerPongKitBuilder.RelayOps` and to the README op table):
`cup|@<anchorPath>|<name>|<on>|lx|ly|lz|scale|r|g|b` (instantiate / move / colour all three LODs, or destroy, a copy
of `[ThryBP]glass` named `[ThryBP]Cup <side> <index>`), `cupInside|@<cupPath>|1/0`, `ballPhys|<ball>|rest` and
`ballPhys|<ball>|fly|px|py|pz|vx|vy|vz` (kinematic / dynamic with gravity), `uiSetToggle|<ref>|1/0|notify`,
`uiSetSlider|<ref>|value`, `scale|@|s` (kit root scale = table size), `audioVolume|<ref>|v`.

Ball graph (per ball, owner's physics) to page: `bpRelease|<ball>|vx|vy|vz|maxAngularDegPerSec` on a VR release (mean
of the non-zero samples of the last 10 frames, Ball.cs:226-233, :511-527) and
`bpContact|<ball>|<other name>|<own 1/0>|bx|by|bz|vx|vy|vz|cx|cy|cz|cupTopY` on every collision (the other object's
name, whether it is under this kit's root, ball position and velocity before the contact, and for a cup its position
and bounds top). The splash particle system's burst must be 20 (`particles|play`). The desktop strength bar
(`_Strength` via `matFloat` on `Strength Indicator/Quad`) needs the shader remade. Layout numbers in bindings (team
anchors, spawn points, cup bounds, ball radius) are from section 5 and the model files, to be re-measured.

### 0.4 Checklist status (101 items of section 2)

| Status | Count | Items |
|---|---|---|
| Ported and covered by a Node test | 67 | 1, 2, 3, 5, 6, 9, 11, 12, 13, 17, 19, 20, 22, 23, 24, 28, 30, 31, 32, 33, 35, 37, 39, 41, 44, 45, 46, 47, 48, 50, 51, 52, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 66, 67, 68, 69, 70, 71, 72, 74, 76, 79, 80, 84, 85, 86, 87, 88, 89, 90, 91, 94, 96, 97, 98, 101 |
| Ported, not yet covered by a test | 19 | 4 (teleport), 7 (dividers), 8 (table indicator colour), 15, 29, 36 (knock-out from hand poses), 40, 42, 43, 49, 53 (cup positions: provisional sizes), 65, 73, 75, 81, 82, 83, 99, 100 |
| Moved to the Unity side (owner's PhysX, platform sync, kit graph); the TypeScript part is done | 8 | 14, 21, 25, 26, 27 (sounds play, without the volume scale), 34, 38, 95 |
| Left out | 6 | 10, 16, 18, 77, 78, 93 |
| Not done in this job | 1 | 92 (localisation: English labels only) |

Tests (`npm test`: typecheck, lint, 18 tests, all pass): rack layouts worked out by hand from the code with line
references; all four shapes x rows 0-12 and every re-rack of 0-121 cups against upstream's own compiled
`CupsManager.cs` (52 layouts, 488 reracks, 8 resets with Game's overwrites); scenarios on the fake room: two sides play
a rack to the end; a hit reported by the thrower removes exactly that cup on every client while other clients'
reports change nothing; a rim shot; a re-rack from the panel; settings changed on one panel reach every client and
all four panels (teams, rules, aim assist, side count, mode selector, rows/shape, sync, size + reset, volume local,
reset all, panel open and tab); King of the Hill 176 cups (27 state keys, largest leaf 1,151 bytes, no refused or
rate-limited write); the thrower leaves mid-flight, with the ball in a cup (counted once), and while holding it; a
late joiner; two tables in one room; desktop key throw; AI against AI; aim assist; scoring and collision rules per
mode. `npm run build` gives a 449 KB `pk-beer-pong.js`.

### 0.5 Bugs fixed (upstream behaviour changed on purpose)

1. A HashTag re-rack lost cups: only 0, 5, 16, 33, 56 or 85 cups fit its row counts, so e.g. 6 left became 5
   (55 reachable cases, found by the golden vectors). Rows are added until the remaining cups fit (`CupsManager.ts`).
2. Re-creating a changed cup appended a duplicate to `_activeCupsList` (CupsManager.cs:456-459 with :548).
3. The template cup has no `TableScaleTransform`, so `CupsManager.GlobalHeight` threw when the AI aimed in King of the
   Hill or Big Pong (Game.cs:366, :372; Cup.cs:58-61).
4. King of the Hill cups kept side colours on a client where a rack arrived before the side's random-colour flag
   (SyncColor skips everything while random is on, CupsManager.cs:497); switching the flag now recolours.
5. `ResetPlayer` set `_score` past its property, so the resetting client's own plate kept the old score (Player.cs:295).
6. The Size setter refreshed the Aim Assist sliders (Game.cs:119), item 90.
7. `ResetBalls` respawned balls the caller might not own (Game.cs:719, :727), item 99: Respawn takes ownership.
8. `CountCupHit` wrote `_recentThrowsHits[-1]` (Game.cs:438), item 100: the ring belonged to the dead adaptive aim
   assist and is gone.
9. A VR release with no non-zero velocity sample gave a NaN velocity (Ball.cs:523): zero.
10. The miss checks could each fire in one frame, passing the turn twice (Ball.cs:264-289): the first miss ends them.
11. The desktop charge was never cleared (item 22).
12. `_countedHit` was local (Ball.cs:60): synced, so a hit is counted once whoever finishes the turn (item 96).
13. Nobody could take a ball whose holder left (item 97); a ball in flight whose thrower left was decided by
    whichever client inherited it (item 96): the referee now respawns (held) or calls a miss (in flight); on the rim or
    in a cup the new owner finishes the turn on the synced clock.
14. An AI turn was lost when the client driving it left (item 98): the referee starts the AI after 6 s.
15. Volume started at 1.0 until the slider moved (item 91): the `volume` setting (0.5) applies at start.
16. Teams on/off made every receiving client take ownership of sides 2-3 to recolour them (Game.cs:559-579): only the
    Game's owner does.

Other changes (not bugs): cups appear at once (item 60); timers of a ball state run on the synced clock; the AI does
not pull a ball out of a person's hand; the tab bar ignores a tab turning off (upstream briefly synced -1); the rim
spiral starts from the synced `int(angle / 2)` on every client including the owner.

### 0.6 Runtime gaps (portkit not edited; local workarounds in the game's files)

1. **No way for game code to send a game-defined relay op.** The README lets games add ops (`KitBuilder.RelayOps`), but
   `HostActions` is a fixed list. `PortOps.ts` calls the relay host's private batching sender `event`; the fake room's
   graph notes "unknown op" for them (the tests filter exactly these seven names).
2. No relay op to **set a uGUI Toggle or Slider** (only to receive `uiToggle` / `uiSlider`): game ops `uiSetToggle`,
   `uiSetSlider`.
3. No **rigidbody** control (kinematic, velocity) and no way to **create or destroy** copies of a kit object: game ops
   `ballPhys`, `cup`, `cupInside`.
4. No way to **scale the kit root** from game code (table Size): game op `scale` on `@`.
5. No **AudioSource.volume** op, and `PlayOneShot` has no volume scale: `audioVolume` op; collision sounds play at the
   source volume.
6. `GameObject` has no **ReleaseGrab()**: `gameObject.host?.releaseGrab()` (an `@internal` member).
7. No **IsVR** in the runtime: a hold in which the throw key was used is a desktop throw; otherwise the drop waits up to
   10 ticks for `bpRelease`, then throws without it.
8. `values.ts` lacks **Vector3.Angle, Vector3.Reflect, Quaternion.Angle, LookRotation and Unity's Random.InitState**:
   `src/Unity.ts` (the xorshift128 generator is the widely documented one, not checked against Unity).
9. Graph events with a reserved object kind (`collisionEnter`, `triggerEnter`) carry one argument after the target,
   too few for a contact; the ball graph uses its own event name (`bpContact`).
10. `Behaviour` has a `Player` getter, so upstream's field `CupsManager.Player` is `SidePlayer` here.
11. `[FieldChangeCallback]` on a field that is not synced (`Game._volume`): a local `static localChangeCallbacks` map,
    read by `SetProgramVariable` in `SimpleUIInput.ts`.
12. Golden stubs lack `Mathf.Sqrt/Pow`, `Vector3 ==`, `Utilities` and `UnityEngine.Random`: shadowed in
    `golden/Harness.cs` without editing `portkit/golden/UdonStubs.cs`.
13. The fake room: its KeyCode table has only a few keys (the desktop test uses R), `ReleaseGrab` raises no drop (the
    test drops), and its graph does not run game ops.

### 0.7 Open

- Everything Unity: the kit builder, real `bindings.json`, the game ops and the ball graph (0.3), rung 2-4.
- Whether the platform's `drop` comes before or after the graph's `bpRelease` in the app (both orders are handled).
- Whether `watchTransform` reports a physics-driven ball often enough for the "still for 1 s" and respawn-height misses
  on the owner's page; if not, the ball graph should report those misses too.
- Sounds' licence (section 6) and the art credit are unchanged from the analysis.

---

## 1. Upstream at a glance

| Item | Value |
|---|---|
| Repo | Thryrallo/UdonPrefabs, clone at commit `bd0b6aba388f26887cd44064738b666b808f8e0e` (2025-04-09, "Forgot to prefab the swipemenu") |
| Last commit touching `_Internal/BeerPong/` | `d5e378c` (2025-04-09); the folder has one commit, so no history to mine |
| Entry prefab | `BeerPong.prefab` (repo root; 2,559,831 bytes; 3,148 YAML objects: 805 GameObjects, 885 MonoBehaviours, 7 nested prefab instances) |
| Own gameplay C# | 6 files, 2,907 lines: `Ball.cs` 1,053, `Game.cs` 823, `CupsManager.cs` 552, `Player.cs` 332, `Cup.cs` 109, `PlayerScoreAnnouncement.cs` 38 |
| Shared C# it needs (outside the folder) | 17 files, about 830 runtime lines once editor-only blocks are removed; list in section 7 |
| Unity version | **Not recorded in the repo** (no `ProjectSettings/`, no package manifest). Evidence only: collider YAML has `m_IncludeLayers` / `m_ProvidesContacts` (Unity 2022.2+), scripts call `GameObject.FindObjectsByType` (`UI/SimpleUIInput.cs:410`). That fits VRChat's Unity 2022.3 line |
| SDK | VRChat Worlds SDK3 + UdonSharp 1.x (program assets carry `scriptVersion: 2`, `compiledVersion: 2`; proxies carry `_udonSharpBackingUdonBehaviour`). Exact SDK version not determinable. Uses `VRCPlayerApi.GetCurrentLanguage()` (`UI/Localization.cs:68`) and `GetAvatarEyeHeightAsMeters()` (`HandCollider.cs:50`), so a 2023-or-later SDK |
| Render pipeline | Built-in. Every material is Unity `Standard` (built-in shader id 46) or a built-in particle shader (id 211) except one custom shader, `StrengthIndicator.shader` |
| Code licence | MIT, "Copyright (c) 2022 Thryrallo" (`LICENSE`). `README.md:1-3` asks for a credit ("would be greatly appreciated") |
| Art licence | **No separate licence.** `README.md:7-11` and `README.md:33-36` credit Tsuna for the beer pong table (model and textures); the files sit inside the MIT repo with no other terms. The in-world credits tab says "TsunaMoo, 3d modeling & textures, https://tsunamoo.booth.pm/" and "Thryrallo, code & unity setup, https://thry.dev/d" (prefab `.../UI/Main/Credits/*`) |
| Font | `_Internal/_Assets/Dosis-VariableFont_wght.ttf` with `_Internal/_Assets/OFL.txt` (SIL OFL 1.1) |
| Sounds | No source or licence stated. Download markers committed beside them show they came through online converter sites (section 6) |

---

## 2. Feature checklist

Each line is a testable statement of what upstream does. Tag: **K** keep as is, **C** changed in the
port (reason in section 10), **X** left out (reason in section 10).

### A. Table, sides, layout

1. **K** Four slots, index 0-3, are built from the children of `Players` at start; each gets its index, start colour, cups manager and settings panel (`Game.cs:250-261`, `Player.cs:60-84`). Nothing binds a person to a slot.
2. **K** Start colours come from the prefab, not the code default: slot 0 (0.237, 0.745, 0), slot 1 (0.745, 0, 0.218), slot 2 (0, 0.569, 0.764), slot 3 (0.840, 0.698, 0) (prefab `Game._initialPlayerColors`; code default at `Game.cs:22`).
3. **K** Player count is 2, 3 or 4 (synced, default 2). Exactly one table model is active: `_tables[count]` = `[ThryBP]2Players` / `3Players` / `4Players`; slots `i < count` are active and are moved to that table's `Team<i+1>` anchor. Anchor yaw: 2 sides 0/180; 3 sides 0/240/120; 4 sides 0/180/90/270 degrees (`Game.cs:781-822`; prefab anchors under the nested table model).
4. **C** When the count changes, the client that owns `Game` is teleported together with "its" side: the active side whose forward is closest to the direction from that player to the table centre; position relative to the side is kept (`Game.cs:738-779`, `794-816`).
5. **K** On a count change the Game owner resets the racks of slots that were inactive (`Game.cs:799-802`), then balls are reset (`Game.cs:820`). Scores and active racks are not reset.
6. **K** Table size 0.5 to 1.5 (synced, default 1) sets the uniform scale of the prefab root (`Game.cs:113-123`). A Reset button puts the slider back to 1 (prefab `Main/Visual/Size/Reset` calls `Slider.set_value(1)`).
7. **K** Barrier option (synced, default off): dividers are up only when the option is on and the mode is Normal or Mayhem (`Game.cs:581-590`, `597-619`). Animator bool `dividers` scales each divider mesh in Y between 0.05 and 1 and switches its collider object on or off (`animations/DeviderOn.anim`, `DeviderOff.anim`, 1 s blend in `Table.controller`).
8. **K** Material slot 3 of the table (one instance shared by the three table models) shows the colour of the slot holding the ball, colour and emission; white in King of the Hill and Mayhem (`Game.cs:268-287`, `524-532`, `730-734`).

### B. Ball states and pick-up

9. **K** Ball states: Idle 0, InHand 1, Locked 2, Flying 3, Rimming 4, InCup 5 (`Ball.cs:11-19`).
10. **X** `Locked` is never entered: no code writes it (it is only read at `Ball.cs:148`, `208`, `539`, `555`). The `ThrowIndicator` arrow is therefore never shown.
11. **K** Normal and Big Pong: only ball 0 is active. King of the Hill and Mayhem: balls `i < count` are active and ball i belongs to slot i (`Game.cs:711-736`).
12. **K** A ball rests at its current slot's `BallSpawnPoint` and has that slot's colour (`Ball.cs:891-905`, `923-927`).
13. **K** A ball can be picked up when Idle, or when InCup with auto respawn off; never otherwise (`Ball.cs:133`, `327`, `573`, `901`, `968`). **Anyone** may pick it up, whatever side they stand on.
14. **C** Picking up makes the picker the network owner and sets InHand (`Ball.cs:420-442`). The ball's pose relative to the hand and the hand side are synced two frames after pick-up and again after 1 s (`Ball.cs:461-491`); other clients then draw the ball at the owner's hand bone every frame (`Ball.cs:248-262`).
15. **K** Picking the ball out of a cup (auto respawn off) removes that cup (`Ball.cs:426-434`).
16. **X** If an `AvatarThemeColor` object is in the scene and the option is on, picking up recolours the current slot with the picker's avatar colour (`Ball.cs:436-439`). The stock prefab has no such object (`Ball._avatarThemeColor` and `Player._themeColor` are null), so the toggle is hidden (`Player.cs:76`).
17. **K** Every drop is a throw; the ball cannot be put down (`Ball.cs:511-530`, `533-594`).
18. **X** On Index controllers releasing the trigger drops the ball (`Ball.cs:502-508`).

### C. Throw

19. **C** VR: start velocity = mean of the non-zero entries of the last 10 per-frame ball velocity samples; its length is increased by `min(1.5, maxAngularSpeed / 2000)` (degrees per second over the same frames); then times 1.5 (`Ball.cs:226-233`, `511-527`, `547`; prefab `_throwVelocityMultiplierVR` 1.5).
20. **C** Desktop: holding the right mouse button charges `strength = seconds held / 1`; throw speed = `min(5, strength * 5) * 1.0` m/s along the ball's forward axis (`Ball.cs:32-33`, `240-245`, `552-563`; prefab `_throwVelocityMultiplierDekstop` 1).
21. **C** Desktop only (`_Scripts/VRDesktopToggler.cs:15-20`): a screen-space bar shows the charge: fills left to right, red to green, hidden below 1 percent, with a text texture on top; cleared on throw (`Ball.cs:244`, `553`; `materials/StrengthIndicator.shader:27-35`, `73-88`). It draws nothing in stereo (`StrengthIndicator.shader:28-29`).
22. **C** Quirk: the charge value is not cleared after a throw, so a later drop with no right-button press reuses the last strength (`Ball.cs:240-245`: assigned only while the button is down).
23. **K** The throw starts from the ball's transform one frame after the drop. Start position, rotation, velocity and state Flying are serialized once (`Ball.cs:529`, `567-591`).
24. **K** Each human throw adds 1 to the slot's throw counter and records the aim assist used on the slot and on the game (`Ball.cs:587-593`, `Game.cs:467-476`, `Player.cs:142-151`, `213-218`).

### D. Flight (motion model in section 3.6)

25. **C** While Flying every client sets the ball each frame to `start + v*t`, with `y = y0 + vy*t + g*t*t/2`, `g = Physics.gravity.y` (`Ball.cs:213`, `645-651`). Each client starts `t` when the state arrives (`Ball.cs:155-163`). There is no air drag.
26. **C** Any collision of the ball on any client restarts that client's parabola at the current position with the velocity reflected about world up and multiplied by 0.9, whatever the real contact normal (`Ball.cs:38`, `996-998`).
27. **K** Each collision plays the glass clip (cup) or the table clip (anything else) at volume `clamp01(|v|^2 / 10)` where `v` is the start velocity of the segment that just ended (`Ball.cs:126-129`, `986-994`).
28. **C** Owner only: touching a collider that is not a cup and whose object name does not start with `[ThryBP]` is a miss (`Ball.cs:1013-1019`). The divider colliders are such objects (named `Collider` / `Cube`), so touching a raised barrier is a miss; so is any world geometry.
29. **K** Owner only: a miss when the ball centre is below `RespawnHeight` (0.4 above the table base; the top is at 0.8) (`Ball.cs:267-272`).
30. **K** Owner only: a miss when the last velocity sample has squared length <= 0.5 for more than 1 s and more than 1 s has passed since the throw; a miss at 15 s in any case (`Ball.cs:273-288`).
31. **K** A cup the thrower is not allowed to hit (items 62-64) only bounces the ball (guard at `Ball.cs:1008`; the bounce at `996-998` has already happened).

### E. Hit, rim, in the cup

32. **K** Only the ball's owner decides (`Ball.cs:1000`). On contact with an allowed cup, it is a hit when the ball centre is above the top of the cup's renderer bounds and the horizontal distance from the cup origin is under 0.95 cup radii (`Ball.cs:929-946`).
33. **K** A hit becomes a rim shot when `distance > Random.Range(0.4, 0.7)` and the travel direction is more than `Random.Range(45, 80)` (integer, 45-79) degrees from straight down; otherwise the ball is in the cup at once (`Ball.cs:948-976`).
34. **C** Any contact with an allowed cup turns the owner's ball into a real rigidbody (`Ball.cs:936`, `634-641`); if it was not a hit it keeps bouncing by PhysX while still "Flying" on the network, and other clients keep their own parabola.
35. **K** Rimming: every client runs a spiral for `(3000 - start) / 1300` seconds (about 2.0 to 2.3 s), then drops the ball in with a splash (`Ball.cs:27-28`, `291-334`). The start angle is synced as `int(angle / 2)` (`Ball.cs:958-961`, `166`). Formula in section 3.6.
36. **C** While Rimming, a hand collider touching the ball knocks it out: the toucher becomes owner and the ball flies off with the hand's velocity (`Ball.cs:1024-1040`, `HandCollider.cs:59-73`). No points unless it lands in a cup again.
37. **K** Entering InCup emits 20 splash particles at the ball and plays the splash clip at full volume once per client (`Ball.cs:186-189`, `193-198`, `326`, `974`).
38. **C** In the cup the cup's solid collider is off and its inner box colliders are on, so the owner's physical ball rattles inside (`Ball.cs:172-173`, `316-317`, `966-967`). Other clients snap the ball to the centre of the cup's bounds when it is more than 1 cm outside the cup hull and either not moving or outside the bounds grown by 1 m in height (`Ball.cs:343-354`).
39. **K** Normal mode: the hit is counted once (`Ball.cs:359-362`). After 2 s with auto respawn on, the cup is removed and the ball respawns for the **same** slot, so a scorer throws again (`Ball.cs:369-376`).
40. **K** Normal mode, auto respawn off: the turn passes at once, the next slot is notified after 2 s, the ball stays in the cup and can be picked out; after 20 s the cup is removed and the ball respawns (`Ball.cs:363-367`, `371`).
41. **K** King of the Hill and Mayhem: after 1 s the hit is counted, the cup removed, the ball respawned (`Ball.cs:378-386`).
42. **K** Big Pong: after 3 s the hit is counted and the ball respawned; the cup stays (`Ball.cs:387-394`, `Game.cs:421`).
43. **K** If the target cup no longer exists during Rimming or InCup, the ball respawns (`Ball.cs:306-309`, `329-332`, `397-400`).

### F. Turns

44. **K** Normal and Big Pong: a miss gives the ball to slot `(index + 1) mod count`, skipping slots with no cups while more than one slot still has cups (`Ball.cs:912-921`, `Game.cs:534-557`).
45. **K** King of the Hill and Mayhem: no turns; each ball stays with its slot (`Game.cs:546`).
46. **K** There is **no win or game-over**: nothing reacts to a side reaching zero cups except the skip in item 44 (no code).
47. **K** A respawn tells the slot it is its turn; an AI slot then starts its throw (`Ball.cs:902`, `907-910`, `Player.cs:235-242`).

### G. Scoring

48. **K** Points per hit (`Game.cs:504-511`): King of the Hill and Big Pong 2, rim shot 1. Otherwise: own cup -1; team-mate's cup -3 (teams on); else 1, rim shot 2.
49. **K** Teams on: the points go to every slot with the scorer's parity, inactive ones included (`Game.cs:444-453`); off: to the scorer only (`Game.cs:456-463`).
50. **K** Score shows as four digits (`ToString("D4")`, so -1 is `-0001`) on each side's score plate (`Player.cs:324-327`).
51. **K** Points popup (synced option, default on): when a slot's score changes to a non-zero value, a board above its rack pops in, shows the score and "Assist NN%" (the slot's last aim assist), holds about 5 s and shrinks away (`Player.cs:328-329`, `PlayerScoreAnnouncement.cs:21-32`, `animations/Temp Scoreboard.controller`). A score of 0 re-arms it (`Player.cs:308-309`).
52. **K** Each slot keeps synced throw and hit counts; skill = hits / throws, or 0.5 with no throws, or the AI skill for an AI (`Player.cs:213-232`). Human hits add to the hit count (`Game.cs:436-440`).

### H. Cups

53. **K** A rack is a grid of 11 rows by 22 columns of owner bytes (255 = empty). The cup at (row, col) stands at `((col - 11) * R * s, 0, row * 2R * s)` plus an offset, relative to the rack anchor, R = template cup radius, s = rack scale (`CupsManager.cs:22-24`, `68-76`, `521-530`).
54. **K** Shapes Triangle, Square, Circle, HashTag (`CupsManager.cs:11-18`, `294-419`); rows 3 to 11 on the slider (code default 5, `CupsManager.cs:95`). Cup counts by rows 1..11 (hand-derived, to be confirmed by golden vectors): triangle 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66; square 1, 4, 9, ... 121; circle 1, 4, 4, 14, 15, 30, 26, 56, 53, 76, 80; hashtag 0, 5, 5, 16, 16, 33, 33, 56, 56, 85, 85.
55. **K** Rows and shape are per side. Changing either on a side's panel resets that side's rack (prefab: `Rows` and `Shape` inputs target that side's `CupsManager`, event `ResetGlasses`; `CupsManager.cs:113-117`, `242-280`).
56. **K** "Sync settings to all players" copies this side's rows and shape to the other three and syncs them, without resetting their racks (`Player.cs:267-278`).
57. **K** "Reset" (side): rack reset, throws, hits and score to 0 (`Player.cs:289-297`). "Reset all players": the same for all four (`Player.cs:281-287`). Neither moves the ball.
58. **K** "Rerack" (Normal mode only): the remaining number of cups is re-laid in the smallest version of the side's shape that holds them, and the surplus is removed from the highest grid indices (`CupsManager.cs:127-132`, `195-240`). Available to anyone at any time, also during a flight.
59. **K** Removing a cup sets its byte to 255, adds 1 to `_hit`, subtracts 1 from the count (`CupsManager.cs:170-184`). Big Pong never removes (`Game.cs:421`).
60. **C** Cups are created and destroyed one grid position per frame, 242 frames for a full pass, restarting from position 0 on every change (`CupsManager.cs:423-478`).
61. **K** A cup has its owner slot's colour on material slot 0 of its three LOD renderers (`Cup.cs:45-51`, prefab `_playerColorMaterialIncicies` = 0, 0, 0). In King of the Hill each cup instead gets a pseudo-random colour seeded by its grid index, the same on every client (`Cup.cs:32-43`, `Game.cs:602-605`, `Player.cs:190-206`). A slot colour change recolours its cups, its UI and its ball (`Player.cs:153-175`).

### I. Rules options (all synced, on every side's panel)

62. **K** Self fire (default off): the thrower's own cups can be hit (`Game.cs:484`).
63. **K** Friendly fire (default on, only with teams): team-mates' cups can be hit (`Game.cs:485`).
64. **K** A ball never interacts with cups of another table instance (`Game.cs:480`).
65. **K** Auto respawn balls (default on): see items 39-40.
66. **K** Teams (default off): team size 2, teams by parity (0+2 against 1+3); slots 2 and 3 take the colours of slots 0 and 1; switching off restores start colours for slots 1-3 (`Game.cs:428-431`, `559-579`).

### J. Modes (synced; selector order Normal, King of the Pong, Big Pong, Mayhem)

67. **K** Changing mode: racks are reconfigured, dividers updated, the Game owner resets every rack and sets random-colour mode, balls are reset (`Game.cs:592-632`).
68. **K** Normal: active slots use their own rows and shape at their own end; inactive slots have no cups (`Game.cs:677-689`).
69. **K** King of the Hill: all four racks become circles of 10, 8, 6 and 4 rows stacked at the table centre, each one cup-height higher than the last, shifted back by half their depth (`Game.cs:651-664`). Any cup can be hit by anyone (`Game.cs:481`); dividers off; random cup colours; aim assist may pick any cup (`Game.cs:489-494`).
70. **K** Big Pong: slot 0's rack is one cup at 10 times scale at the centre; other racks are empty (`Game.cs:666-675`). One ball, turns as in Normal, anyone may hit it, it is never removed. With slot 0's shape set to HashTag the rack is empty (hashtag with 1 row yields 0 cups, `CupsManager.cs:393-419`).
71. **K** Mayhem: Normal layout with rows forced to 6 and every cup's owner drawn at random from all **four** slots, also with fewer sides (`Game.cs:625`, `CupsManager.cs:272-275`, `282-292`). Every active slot has a ball. A thrower cannot hit cups standing on its own side (`Game.cs:483`); hitting a cup of its own colour elsewhere costs 1 point (`Game.cs:508`).

### K. Aim assist

72. **K** Prefab switch `_allowAimAssist` (true) and synced strength 0 to 1, default 0.3 (`Game.cs:24`, `51`, `244`). Applied by the thrower only, baked into the synced start velocity (`Ball.cs:577-585`). The strength is a distance in metres.
73. **K** Target cup: the cup nearest to where the throw would first reach table height, skipping cups owned by the thrower (Normal, Mayhem) and cups on the thrower's side (Mayhem); team-mates' cups are not skipped (`Ball.cs:795-822`, `Game.cs:489-500`).
74. **K** If the throw would cross the cup-opening height within `strength` of that cup's opening, direction and speed are replaced so the ball lands in it, keeping the launch elevation (`Ball.cs:667-670`, `696`, `723-755`).
75. **K** Otherwise, if the first bounce would come within `strength` of a cup opening, the throw is steered so the bounce lands in it (`Ball.cs:672-690`); otherwise, if the throw line passes within `strength` of that cup, only the heading is turned toward it (`Ball.cs:691-693`, `757-766`); otherwise unchanged.
76. **K** The strength used by the last throw is synced and shown as "Last Assist NN%" on every panel and in the points popup (`Game.cs:189-199`, `294-299`, `Player.cs:208-211`).
77. **X** "Adaptive" aim assist toggle (synced, default on) does nothing: `UpdateLocalPlayerAdaptiveAimAssist` (`Game.cs:300-335`) is never called and its result `_myAimAssistValue` is never used by a throw.
78. **X** Developer cheat: users named Thryrallo, Thry or Katy get strength 1000 after three trigger presses or with the index trigger held (`Ball.cs:497-500`, `532`, `578`).

### L. AI opponent

79. **K** Each slot has synced "AI" (default off), "Skill" 0 to 1 (default 0.3) and "Adaptive" (default on) (`Player.cs:52-54`); the AI tab is hidden when the prefab switch `_allowAI` is false (`Player.cs:77-79`).
80. **K** When an AI slot is told it is its turn: after 2 s the ball is taken (removing the cup it sits in, if any) and placed at the slot's `AI_SpawnPoint`; 1 s later it is thrown (`Player.cs:235-264`, `Ball.cs:444-459`, `410-417`).
81. **K** AI aim: toward the rack anchor of the opposing slot with most cups (not itself, not a team-mate), plus up to 0.15 m random offset in X and Z; King of the Hill and Big Pong aim at the centre (`Game.cs:360-396`). Launch direction and speed per mode at `Game.cs:398-414`, times 5 (`Ball.cs:599`).
82. **K** AI accuracy: a random number under the skill gives the exact hit vector; otherwise the throw is blended `(1 - r) * 0.85` of the way to it (`Ball.cs:706-721`).
83. **K** Adaptive skill, before each AI throw: mean skill of the other active slots times (their mean cup count / its own cup count) plus a random +-0.15, clamped 0-1 (`Game.cs:337-358`, `Player.cs:256-259`). The value is shown as the last assist.
84. **K** AI throws are not counted as throws and AI hits not as hits (`Game.cs:436-440`, `470`).
85. **C** The AI runs on the client that respawned the ball (delayed events are local, `Player.cs:240`, `248`). An AI switched on while its ball is already waiting does not start until the next respawn.

### M. Settings panel and other UI (one identical panel per side)

86. **K** A button on the table edge ("Open Settings", reach 1 m) toggles the side's panel; the open state is synced; the panel slides out 0.317 m and tilts up 130 degrees in 1 s (`UI/SimpleUIInteract.cs:17-20`, `Player.cs:86-112`, `animations/TableUIAnim.anim`).
87. **K** Tabs Game, Rules, Player, AI, Visual, Credits; the selected tab is synced per side (`Player.cs:57`, `97-105`; prefab `NavBar`).
88. **K** Game tab: mode selector (left/right buttons, wraps), player count slider with number on the handle, Teams and Barrier toggles. Rules tab: Self Fire, Friendly Fire, Auto Respawn Balls. Player tab: Rows, Shape, Reset, Rerack, Sync, Reset all. AI tab: AI, Skill, Adaptive, Aim Assist, Adaptive (aim). Visual tab: Points Popup, Use Avatar Colour (hidden, item 16), Size and its Reset. Credits tab: two credits with URLs. (Wiring table in section 5.3.)
89. **K** A game-wide setting changed on one panel updates the same control on the other three panels on every client (`UI/SimpleUISetterExtension.cs:21-39`, `UI/SimpleUIInput.cs:118-125`).
90. **C** Quirk: after a Size change the other panels refresh their Aim Assist sliders instead of their Size sliders (`Game.cs:119` passes the wrong name).
91. **K** Volume: a speaker button opens a slider 0 to 1 (shown at 0.5) that sets the volume of all ball sounds for the local player only (`Game.cs:62`, `68-77`). Quirk: the sources start at 1.0 until the slider is first moved.
92. **C** Language: labels come from `beerpong_localization.csv` (37 rows: 29 labels and two 4-entry lists; English and German; one German value is empty). The start language follows the VRChat client language; a flag menu on each panel switches it locally (`UI/Localization.cs:65-94`, `96-120`, `UI/LocalizationMenu.cs:15-23`).
93. **X** Every UI action plays a click sound at the control and, in VR, a haptic pulse (`UI/SimpleUIInput.cs:176-182`, `UI/ClickSound.cs:26-42`); sliders skip the haptic (`UI/SimpleUISlider.cs:37`).

### N. Network behaviour and edge cases

94. **K** Late joiner: every synced variable of the 13 synced objects arrives with its last value (VRChat manual sync). Racks then build over up to 242 frames (item 60); scores, colours, options, panel state and tab apply at once through the change callbacks.
95. **C** Late joiner during a flight: the ball restarts the first parabola from the throw point at arrival time (`Ball.cs:155-163`), so it is out of step until the next state. During Rimming the spiral restarts from the synced angle (`Ball.cs:164-166`).
96. **C** Thrower leaves during a flight: no handling in the code (no `OnPlayerLeft` anywhere in scope). VRChat hands the object to another client, whose own local replay then decides the outcome. `_countedHit` is a local flag (`Ball.cs:60`), so a hit can be counted twice if the leaver had counted it.
97. **C** A player leaves while holding the ball: the state stays InHand and nobody can pick the ball up (item 13) until the Game owner changes mode or player count.
98. **C** The client driving an AI turn leaves during its 3 s: the AI turn is lost; the ball waits at the spawn point for anyone.
99. **C** `Game.ResetBalls` calls `Respawn` on balls the caller may not own; the request to sync is then ignored by VRChat and the reset does not reach others (`Game.cs:719`, `727`, `Ball.cs:891-905`).
100. **C** Latent crash: `CountCupHit` writes `_recentThrowsHits[-1]` on a client that scores without ever having thrown, for example after a hand knock-out lands in a cup (`Game.cs:236`, `438`).
101. **K** Several tables can stand in one world (`Game.cs:480` and all state being per object).

---

## 3. State and messages

### 3.1 Synced variables

All four synced classes use `BehaviourSyncMode.Manual` (`Ball.cs:21`, `Game.cs:18`, `CupsManager.cs:19`,
`Player.cs:12`); the prefab's UdonBehaviours have `_syncMethod: 3`. `Cup` and
`PlayerScoreAnnouncement` are `None`. Instances: 1 Game, 4 Ball, 4 Player, 4 CupsManager = 13 synced
objects, 38 distinct fields, 113 field instances. "Writer" is whoever owns the object when
`RequestSerialization()` runs; ownership moves as listed in 3.3.

**Game** (`BeerPong` root)

| Field | Type | Default | Written when | Ref |
|---|---|---|---|---|
| `_gameMode` | enum int 0-3 | Normal | mode selector | `Game.cs:49`, `79-89` |
| `_playerCount` | int | 2 | slider 2-4 | `Game.cs:50`, `91-101` |
| `_aimAssist` | float | 0.3 | slider 0-1 | `Game.cs:51`, `103-111` |
| `_size` | float | 1 | slider 0.5-1.5, reset button | `Game.cs:52`, `113-123` |
| `_useBarrier` | bool | false | toggle | `Game.cs:53` |
| `_doTeams` | bool | false | toggle | `Game.cs:54` |
| `_doAdaptiveAimAssist` | bool | true | toggle (no effect) | `Game.cs:55` |
| `_allowSelfFire` | bool | false | toggle | `Game.cs:56` |
| `_allowFriendlyFire` | bool | true | toggle | `Game.cs:57` |
| `_doAutoRespawnBalls` | bool | true | toggle | `Game.cs:58` |
| `_useAvatarThemeColor` | bool | true | toggle (hidden) | `Game.cs:59` |
| `_showPointsPopup` | bool | true | toggle | `Game.cs:60` |
| `_lastAimAssist` | float | 0 | every throw, by the thrower or AI driver | `Game.cs:64`, `294-299` |

`_volume` (`Game.cs:62`) is local, not synced. All of these apply through `FieldChangeCallback`
setters; `Game` has no `OnDeserialization`.

**Ball** (x4)

| Field | Type | Meaning | Written when | Ref |
|---|---|---|---|---|
| `_state` | int[6] | [0] state; [1] side index of the cup's rack; [2] row; [3] column; [4] rim start angle / 2; [5] distance from centre x 100 (written, never read) | every state change by the owner | `Ball.cs:55-56`, `403-408`, `954-972` |
| `CurrentPlayer` | int | slot the ball belongs to | `NextTeam`; also set locally on every client by `ResetBalls` in KotH/Mayhem | `Ball.cs:62-63`, `912-921`, `Game.cs:725` |
| `_start_position` | Vector3 | Idle/Flying: world position. InHand: offset in the hand's frame | init, respawn, hand offset, throw, AI placement, knock-out | `Ball.cs:65-66`, `117`, `414`, `478-488`, `567`, `899`, `1036` |
| `_start_rotation` | Quaternion | as above | same | `Ball.cs:67-68` |
| `_isRightHand` | bool | which hand holds it | hand offset sync | `Ball.cs:69-70`, `475` |
| `_start_velocity` | Vector3 | throw velocity after aim assist | throw, AI throw, knock-out | `Ball.cs:71-72`, `542-563`, `583`, `599`, `611`, `1035` |

**Player** (x4)

| Field | Type | Default | Written when | Ref |
|---|---|---|---|---|
| `_lastAimAssistStrength` | float | 0 | every throw into this slot's turn | `Player.cs:41`, `142-151` |
| `_numberOfThrows` | int | 0 | human throw; reset | `Player.cs:42`, `213-218`, `294` |
| `_numberOfHits` | int | 0 | human hit; reset | `Player.cs:43`, `220-225`, `293` |
| `_score` | int | 0 | hit; reset | `Player.cs:44`, `302-322`, `295` |
| `_activeColor` | Color | slot start colour | init, teams on/off, avatar colour | `Player.cs:46-47`, `153-188` |
| `_doRandomCupColor` | bool | false | mode change | `Player.cs:50`, `190-206` |
| `_isAI` | bool | false | toggle | `Player.cs:52` |
| `_useAdaptiveAISkill` | bool | true | toggle | `Player.cs:53` |
| `_aiSkill` | float | 0.3 | slider; adaptive update before each AI throw | `Player.cs:54`, `256-257` |
| `_areSettingsOpen` | bool | false | table-edge button | `Player.cs:56`, `107-112` |
| `_settingsNavbar` | int 0-5 | 0 | tab click | `Player.cs:57` |

**CupsManager** (x4)

| Field | Type | Default | Written when | Ref |
|---|---|---|---|---|
| `_cupOwnersAtPositions` | byte[242] | all 255 | reset, rerack, remove | `CupsManager.cs:34`, `69-76` |
| `_scale` | float | 1 | set locally by `ConfigureCups` on every client; rides along with the next serialization | `CupsManager.cs:35`, `135-140` |
| `_anchor_id` | int | 0 | same (0 own end, 1 and 2 table centre) | `CupsManager.cs:36` |
| `_position_offset` | Vector3 | 0 | same | `CupsManager.cs:37` |
| `_hit` | int | 0 | remove (+1), reset (0); never read | `CupsManager.cs:38`, `178`, `277` |
| `_existing_glasses_count` | int | 0 | reset, remove | `CupsManager.cs:39`, `179`, `260-269` |
| `_shape` | enum int | Triangle | shape selector, "Sync settings" | `CupsManager.cs:84-93` |
| `_rows` | int | 5 | rows slider, Mayhem (6), "Sync settings" | `CupsManager.cs:95-104`, `Game.cs:625` |

`_overwriteShape` / `_overwriteRows` (`CupsManager.cs:43-44`) are not synced: each client derives
them from mode and player count (`Game.cs:634-689`).

### 3.2 Network events

None. `SendCustomNetworkEvent` does not occur in scope. Everything is variables plus ownership.

### 3.3 Ownership transfers (`Networking.SetOwner(LocalPlayer, ...)`)

| Object | Where | Trigger |
|---|---|---|
| Ball | `Ball.cs:423` | pick-up |
| Ball | `Ball.cs:447` | AI driver takes the ball |
| Ball | `Ball.cs:1031` | hand knocks a rimming ball |
| Game | `Game.cs:296` | every throw (`SetLastAimAssist`) |
| Game, Player, CupsManager | `UI/SimpleUIInput.cs:146` | any networked UI control, on each target object |
| CupsManager | `CupsManager.cs:115`, `122`, `130`, `174` | reset, "Sync settings", rerack, cup removed |
| Player | `Player.cs:109`, `147`, `180`, `203`, `215`, `222`, `253`, `292`, `319` | panel button, last assist, colour, random-colour flag, throw, hit, AI throw, reset, score |

`Networking.IsOwner` gates: who initialises (`Ball.cs:115`, `CupsManager.cs:78`, `Player.cs:83`),
flight decisions (`Ball.cs:205-215`, `355`, `1000`), mode and count side effects (`Game.cs:209`,
`621`, `719`, `727`, `794`, `799`). There is no master check and no ownership-request callback.

### 3.4 Timers

| Timer | Length | Ref |
|---|---|---|
| Hand offset sync after pick-up | 2 frames, and again at 1 s | `Ball.cs:424`, `468-469` |
| Throw after drop | 1 frame | `Ball.cs:529` |
| Rim spiral | (3000 - start) / 1300 s | `Ball.cs:293-298` |
| In cup, Normal | count at once; act at 2 s; 20 s limit with auto respawn off | `Ball.cs:369-376` |
| In cup, KotH / Mayhem; Big Pong | 1 s; 3 s | `Ball.cs:380`, `389` |
| "It's your turn" after a hit with auto respawn off | 2 s | `Ball.cs:366` |
| Miss: still | speed^2 <= 0.5 for > 1 s and > 1 s in state | `Ball.cs:273-282` |
| Miss: timeout | 15 s | `Ball.cs:283` |
| AI | 2 s to take the ball, 1 s more to throw | `Player.cs:240`, `248` |
| Rack build | 1 grid position per frame | `CupsManager.cs:476` |
| Desktop charge | 0 to 1 over 1 s | `Ball.cs:32`, `243` |
| Hand collider rescale | every 5 s | `HandCollider.cs:25`, `51` |
| Animations | dividers 1 s; panel 1 s; popup 0.7 s in, about 5 s hold (1 s clip at speed 0.2), 1 s out | controllers in `animations/` |

All of these use the local `Time.time` (19 uses, all in `Ball.cs`). No server time is used anywhere.

### 3.5 Random numbers and persistence

| Use | Who draws | Ref |
|---|---|---|
| Rim decision: `Range(0.4f, 0.7f)` and integer `Range(45, 80)` | ball owner | `Ball.cs:950` |
| AI accuracy `Range(0f, 1f)` | AI driver | `Ball.cs:715` |
| AI adaptive noise `value * 0.3 - 0.15` | AI driver | `Game.cs:355` |
| AI target offset, two draws | AI driver | `Game.cs:394` |
| Mayhem cup owners `Range(0, 4)` per cup | whoever resets the rack; result is synced | `CupsManager.cs:289` |
| King of the Hill cup colour: `InitState(gridIndex)` then three `value` | every client, same result | `Cup.cs:36-37` |

`Random.InitState` in `Cup.cs:36` reseeds Unity's global generator, so after a colour update the other
draws on that client are predictable. No draw needs to be hidden from players.
Persistence: none (no PlayerData, no PlayerObjects, nothing saved).

### 3.6 The ball's motion model, exactly

Constants: `g = Physics.gravity.y` (`Ball.cs:647`, `655`, `746`, `775`, `838`; VRChat default -9.81,
which upstream never sets); bounce factor `BOUND_DRAG = 0.9` (`Ball.cs:38`); ball radius = mean of
its renderer bounds extents (`Ball.cs:110`) = 0.03 m x table size (prefab ball scale 0.06 on Unity's
sphere); `tableHeight` = world Y of `KingOfTheHillPosition` (local 0.8), **cached at Init**
(`Ball.cs:123`) and so stale after a Size change.

**Rigidbody role.** During the scripted flight the rigidbody is non-kinematic with drag and angular
drag `float.MaxValue` and no gravity, only so PhysX reports contacts while the script teleports the
transform (`Ball.cs:625-632`). "Drag" is not part of the motion; there is no air resistance. The
prefab body is mass 1, `m_CollisionDetection: 3` (continuous speculative).

**Segment.** `p(t) = p0 + v0 * t`, with `p.y = p0.y + v0.y * t + g * t^2 / 2` (`Ball.cs:645-651`);
`v(t) = (v0.x, v0.y + g * t, v0.z)` (`Ball.cs:653-657`). Applied every frame in `PostLateUpdate`
on every client (`Ball.cs:213`). Remote clients take `p0`, `v0` from the synced start values and
start `t` at arrival (`Ball.cs:155-163`).

**Bounce.** On any `OnCollisionEnter`, on every client independently: `p0 = current position`,
`v0 = Reflect(v(t), up) * 0.9`, `t = 0` (`Ball.cs:996-998`). The contact normal is ignored: a hit
on a cup's side or a wall also only flips Y.

**Colliders the ball can meet** (prefab):
- Table: a **convex** `MeshCollider` on each `[ThryBP]NPlayers` object using that table's whole mesh, with `Table.physicMaterial` (friction 0.6, bounciness 0.7, combine average). Being a convex hull, its top is one flat face at the rim height. From the model file the rim is at about 0.820 and the nominal surface at 0.80 to 0.806, so the ball bounces about 2 cm above where the cups stand. For the 3 and 4 side tables the hull also closes any gaps between arms. (Measured from `3dmodels/table.dae` vertex data; the cooked hull itself was not inspected.)
- Cup: a convex `MeshCollider` on the cup root using mesh `Glass_LOD2` (`glass.dae` id 4300016), so the cup is a **solid closed shape with a lid**; no physic material. Inside it, inactive until a hit: `[ThryBP]InsideCollider` (box 0.1 x 0.08 x 0.1) with four thin wall boxes (0.13 x 0.2 x 0.01).
- Dividers (objects active only when raised): 2 sides one box 1.349 x 0.339 x 0.043; 4 sides two crossed boxes; 3 sides three boxes. Named `Collider` / `Cube`.
- Ball: sphere radius 0.5 (0.03 m scaled), `Ball.physicMaterial` (friction 0.6, bounciness 1, combine average).

Cup size from `glass.dae` with its import scale 0.0375: height 0.152 m, widest radius 0.052 m
(LOD0) / 0.051 m (LOD2) near the top, base about 0.042 m. `Cup.InitPrefab` measures radius as the mean
of the X and Z bounds extents and height as the Y size of the `Glass_LOD0` renderer (`Cup.cs:90-108`).
Quirk: "circumference" is computed as pi x **height** (`Cup.cs:107`).

**Who decides a hit.** Only the owner, and only while its synced state is Flying
(`Ball.cs:1000-1002`):
1. Contact with a cup allowed by `Game.AllowCollision` (`Game.cs:478-487`) calls `BallGlassCollision` (`Ball.cs:931-980`).
2. The owner's ball becomes dynamic: gravity on, drag 0, angular drag 0.5 (`Ball.cs:936`, `634-641`). From here the owner's ball is simulated by PhysX, not the formula.
3. `onTop = cupBounds.max.y < ball.y`. If not on top: nothing else; the ball stays "Flying" and bounces physically until a later contact or a miss rule.
4. If on top: `d = horizontalDistance(ball, cup origin) / cup.GlobalRadius`. If `d >= 0.95`: nothing else.
5. If `d < 0.95`: `angle = Angle(last velocity sample, down)`; `rim = d > Range(0.4, 0.7) && angle > Range(45, 80)`.
6. Rim: state Rimming, cup coordinates, start angle `a = Angle(cupForward, cup - ball)` on the ground plane, `a = 360 - a` when `(cup - ball).x > 0`, modulo 360, synced as `int(a / 2)` (`Ball.cs:954-962`).
7. Otherwise: state InCup, cup coordinates, splash, physical velocity straight down at the speed of the (already reflected, so x0.9) segment velocity (`Ball.cs:966-975`).
8. `RequestSerialization()` (`Ball.cs:977`).

Remote clients never decide. They keep bouncing their own parabola until the owner's state arrives.
Because contact detection is the owner's PhysX stepping a teleported body, the outcome depends on
the owner's frame rate, and a fast ball can skip thin geometry.

**Rim spiral** (`Ball.cs:291-305`), each frame while `rim < 3000`: `rim += 1300 * dt`;
`inside = 0.9 - rim / 3000 * 0.15`; `down = 1 - rim / 3000 * 0.3`;
`angle = (rim - (rim * 0.009)^2) / cup.GlobalCircumfrence * 0.4`;
`pos = cup.pos + up * cup.GlobalHeight * down + Euler(0, angle, 0) * forward * (cup.GlobalRadius * cup.lossyScale.x * inside - ballRadius)`.
Quirks kept by a literal port: the radius is multiplied by the scale twice; the circumference is
the wrong one. At `rim >= 3000`: inner colliders on, physical velocity
`Euler(0, 90 + rim, 0) * fwd * 0.3 + Euler(0, rim + 180, 0) * fwd * 0.1 + down * 0.1`, **local**
state InCup (the synced state stays Rimming, which is how a rim shot is recognised for scoring,
`Ball.cs:362`), splash (`Ball.cs:311-328`).

**Aim assist maths** (`Ball.cs:659-697`), with `r` the ball radius:
- `PredictTableHitTime(v, p, h)`: larger root of `g/2 * t^2 + v.y * t + (p.y - (h + r)) = 0` when positive, else 0 (`Ball.cs:835-848`, solver at `850-877`).
- `GetTableHitPosition` = `(p.x + v.x * t, h + r, p.z + v.z * t)` (`Ball.cs:830-833`).
- `cupOpening = cup.pos + up * (cup.GlobalHeight + r)` (`Ball.cs:667`). Note `PredictTableHit(v, p, cupOpening.y)` adds `r` again (`Ball.cs:668`, `832`).
- `OptimalVectorChangeStrength` (`Ball.cs:723-755`): `d` = horizontal distance to the opening, `w` = unsigned angle between velocity and its horizontal part, `v0 = d / sqrt(2 * (y0 - y + tan(w) * d) / -g) / cos(w)`; NaN returns the throw unchanged; result = `normalize(horizontalDirToCup * |v_horizontal| + up * v.y) * v0`.
- `OptimalVectorJustChangeY` (`Ball.cs:757-766`): same speed components, heading turned to the cup (the name is misleading).
- Bounce branch: `reflect = Reflect(v(tHit), up) * 0.9`, predict where it crosses opening height, pick the nearest cup again, and if within `strength` scale X and Z of the re-headed throw by `XZDistance(p, opening) / XZDistance(p, predicted)` (`Ball.cs:672-690`).

**How the thrower's result becomes final.** The picker took ownership at pick-up (`Ball.cs:423`).
Only that client writes `_state` and calls `Game.CountCupHit`, `Game.RemoveCup` and `Respawn`
(`Ball.cs:355-395`), taking ownership of the Player and CupsManager objects it writes
(`Player.cs:319`, `CupsManager.cs:174`). Others accept whatever arrives. There is no validation.

---

## 4. Platform-call census

Counts are occurrences in runtime code (editor-only blocks and comments removed). "Game" = the six
files in `_Internal/BeerPong/scripts/`; "shared" = the dependency files in section 7.

| API | Count | Files | Portkit equivalent, or gap and its cost |
|---|---|---|---|
| `[UdonSynced]` fields | 38 | Ball 6, Game 13, CupsManager 8, Player 11 | `synced` fields, one space-state leaf per behaviour (13 leaves). Largest leaf: the 242-entry rack array, well under 16,384 bytes |
| `[FieldChangeCallback]` | 24 (+1 shared) | Game 14, CupsManager 2, Player 8, Localization 1 | **Not named in the README runtime.** Needed: on a state update, call the setter of each changed synced field, then `OnDeserialization()`. Small runtime addition |
| `RequestSerialization()` | 24 (+1) | Ball 9, Game 1, CupsManager 4, Player 10, SimpleUIInput 1 | same name |
| `OnDeserialization()` | 2 | Ball, CupsManager | same name |
| `Networking.SetOwner` | 17 (+3) | Ball 3, Game 1, CupsManager 4, Player 9, SimpleUIInput 1, SimpleUIOptionSelector 2 | `Networking.SetOwner(player, behaviour)` |
| `Networking.IsOwner` | 15 | Ball 6, Game 7, CupsManager 1, Player 1 | `Networking.IsOwner(b)`; first owner of everything = the referee |
| `Networking.GetOwner` | 4 | Ball (remote hand follow) | Not needed: see hand bones below |
| `Networking.LocalPlayer` | 31 (+14) | all | `Networking.LocalPlayer` |
| `GetBonePosition` / `GetBoneRotation` | 4 + 4 (+2) | Ball; HandCollider | Local hands: `pose-update` (at most 30 a second, silent while still). **Remote hands: gap.** Cost avoided by letting the platform sync the held ball's transform (`BS.SyncedObject`, `takeOwnershipOnGrab`); others see it at network rate rather than glued to the hand |
| `GetTrackingData`, `GetAvatarEyeHeightAsMeters`, player `GetVelocity` | 2, 3, 1 | HandCollider | Hand pose from `pose-update`; avatar height: no API found, fixed hand radius 0.09 m. Cost: none visible |
| `IsUserInVR` | 2 (+3) | Ball, ClickSound, VRDesktopToggler, HandCollider | `scene.IsVR()` |
| `displayName` | 1 | Ball (developer list) | left out |
| player `GetPosition` / `GetRotation` / `TeleportTo` | 2 / 1 / 1 | Game | SDK docs list `scene.TeleportTo(pos, yDegrees, stop)`; position from the head pose. Not in the README's `Platform` list: add it. Cost if dropped: the player who changes the side count is left standing where they were |
| `VRC_Pickup` events `OnPickup`, `OnDrop` | 1, 1 | Ball | `grab` / `drop` events (with hand side) on a `BS.Grababble` |
| `VRC_Pickup.pickupable` | 6 | Ball | No per-object switch found. Hide the grab ball, or move it off the Grabbable layer, when it may not be taken |
| `VRC_Pickup.currentHand` | 1 | Ball | `e.detail.side` of `grab` |
| `VRC_Pickup.Drop()` | 1 | Ball | `obj.ReleaseGrab()` |
| `OnPickupUseDown` / `OnPickupUseUp`, `InputManager.GetLastUsedInputMethod` | 1, 1, 1 | Ball | Held-object buttons do not reach JavaScript (SDK `vr-interaction.md`, HeldEvents). Only used for the Index special case and the developer cheat: left out |
| `Input.GetMouseButton(1)` | 1 | Ball | **Gap: no mouse-button event for the page** (keyboard only: `key-press`, `key-release`, `scene.IsKeyDown`). Cost: desktop players charge with a key instead of the right mouse button |
| `Input.GetAxis(...)` | 1 | Ball (developer cheat) | left out |
| `Interact` | (1) | SimpleUIInteract | `click` on a layer-5 collider |
| `InputUse`, `PlayHapticEventInHand` | (1), (1) | ClickSound | SDK docs list `scene.SendHapticImpulse(strength, seconds, hand)`; **the plan says "no haptics"**. Either way optional |
| `VRCPlayerApi.GetCurrentLanguage` | (1) | Localization | `navigator.language` in the page |
| `SendCustomEventDelayedSeconds` | 4 (+1) | Ball 2, Player 2, HandCollider | same name |
| `SendCustomEventDelayedFrames` | 4 | Ball 3, CupsManager 1 | **Not in the README.** Map to the next tick; the rack's per-frame staggering goes away |
| `SendCustomEvent`, `GetProgramVariable`, `SetProgramVariable` | (5), (5), (6) | SimpleUI*, Localization | direct calls and property access by name in TypeScript |
| `Utilities.IsValid` | 9 (+3) | Ball, CupsManager, HandCollider | null check |
| `PostLateUpdate` | 1 (+1) | Ball, HandCollider | `Update()` at 20 Hz is too slow for the motion: see section 8.3 |
| `OnCollisionEnter`, `OnTriggerEnter` | 1, 1 (+1) | Ball, HandCollider | `collision-enter` / `trigger-enter` exist (needs `BS.ColliderEvents`) but arrive asynchronously and late. **Gap for rules**: replaced by a solver in the script (section 8.3). Cost: outcomes follow the port's solver, not PhysX |
| Rigidbody members | 16 | Ball | not used by the port's flight (formula-driven object) |
| `Collider.ClosestPoint`, `Renderer.bounds` | 1, 4 | Ball, Cup | dimensions measured by the kit builder into `bindings.json` |
| `Physics.gravity` | 5 | Ball | constant -9.81 in the script. A snippet must not change world gravity, and the page cannot read it |
| `Instantiate` / `Destroy` | 1 / 2 | CupsManager | `scene.Instantiate(original, parent)` and `obj.Destroy()` exist in the SDK docs; whether they work on kit-loaded objects is **unverified** (risk 3) |
| material colour / float | 9 | Ball, Game, Player, Cup | relay `color` op. **Needs a material-slot argument** (table slot 3, `Game.cs:34`, `278`) and a float op for `_Strength` |
| `AudioSource.PlayOneShot(clip, volume)` | 1 (+1 Play) | Ball; ClickSound | `BSAudioSource.PlayOneShot(index)`; volume by setting the source's `volume` first |
| `ParticleSystem.Emit(20)` at a position | 1 | Ball | move the object from the page, relay `particles|play` with the burst set to 20 by the kit builder |
| `Animator.SetBool` / `SetTrigger` | 2 (+1) / 1 | Game, Player, SimpleUIInput / ScoreAnnouncement | relay `animBool`, `animTrigger` |
| `GameObject.SetActive`, `transform.SetParent` | 20 (+2), 2 | all | `obj.SetActive`, `obj.SetParent` from the page, or relay `active` |
| UI text (`Text.text`, TMP) | 9 sites | Player 2, ScoreAnnouncement 2, SimpleUISlider 1, SimpleUIOptionSelector 2, Localization 2 | relay `text` |
| `UnityEngine.Random` | 11 | Ball 3, Game 3, CupsManager 1, Cup 4 | runtime PRNG; Unity's generator re-implemented only if upstream's exact King of the Hill colours are wanted |
| `Time.time` / `Time.deltaTime` | 19 / 3 (+1) | Ball, HandCollider | local clock for timers; synced clock (relay `clock` op) for flight start times |
| `Debug.Log`, `Log(LogLevel)` | 8 (+5), 11 (+3) | all | `console` behind a level |

---

## 5. Object model

### 5.1 Hierarchy (prefab root `BeerPong`)

```
BeerPong                         Game + UdonBehaviour (manual sync) + PrefabDependency (editor only)
  table                          nested model 3dmodels/table.dae; Animator -> Table.controller
    [ThryBP]2Players             active; convex MeshCollider (own mesh) + Table.physicMaterial
      2Divider / Mesh, Collider  Collider: BoxCollider 1.349 x 0.339 x 0.043, local (0, 0.8, 0)
      Team1, Team2               side anchors at (0, 0.8, 0), yaw 0 and 180
      Button1                    inactive
    [ThryBP]3Players             inactive; same pattern; 3Divider/Collider has 3 boxes; Team1-3 (yaw 0, 240, 120)
    [ThryBP]4Players             inactive; 4Divider/Collider has 2 crossed boxes; Team1-4 (yaw 0, 180, 90, 270)
    Fixture1 (+ Slider, Panel)   inactive; the model's own copy, unused
  Players
    Player, Player (1), Player (2), Player (3)     four identical subtrees, 191 objects each (5.2)
  Ball, Ball (1), Ball (2), Ball (3)               layer 13; child "Grip" (pickup grip point)
  ThrowIndicator                 inactive; sphere mesh + child "arrow" (3dmodels/arrow.dae); never shown
  RespawnHeight                  empty, local (0, 0.4, 0)
  Reflection Probe               realtime, refresh on awake, 128 px, 10 m box
  KingOfTheHillPosition          empty, local (0, 0.8, 0); also used as "table height"
  SplashParticles                ParticleSystem + renderer (GoodJobParticle.mat)
  CupsCollector                  empty, unused (Game._cupsCollector is never read)
  [ThryBP]glass                  nested model 3dmodels/glass.dae = the cup template: Cup + UdonBehaviour (no sync),
                                 convex MeshCollider (mesh Glass_LOD2), LODGroup (0.25 / 0.125 / 0.01),
                                 children Glass_LOD0-2, Liquid_LOD0-2
    [ThryBP]InsideCollider       inactive; BoxCollider + 4 child wall boxes "[ThryBP] Collider 1-4"
  Strength Indicator             VRDesktopToggler (desktop only) -> child quad, SkinnedMeshRenderer, StrengthIndicator.mat
  Localization                   Localization + UdonBehaviour; data: beerpong_localization.csv
```

`PrefabDependency` (editor only, `_Internal/PrefabDependency.cs:14-35`) adds two more prefabs to the
scene: `_Dependencies/[Thry]HandColliders.prefab` (two kinematic trigger spheres on layer 8,
radius 0.5 at scale 0.2, scripts `HandCollider_Left` / `_Right`) and
`_Dependencies/[Thry]ClickSound.prefab` (one AudioSource with `_Internal/SwipeMenu/Sounds/click.mp3`).

Layers used upstream: 17 (table, cups, most UI), 13 (balls), 5 (popup canvas), 4 (volume and
language widgets), 0, 8 (hand colliders). All must be remapped: balls to Grabbable (20), clickable
things to UI (5), the rest to Default (0).

### 5.2 One `Player` subtree

```
Player                           Player + UdonBehaviour (manual); layer 17; local (0, 0.8, 0)
  [GamemodeNormal]Cups Anchor    local (0, 0, -1.317): the rack's back row
    CupsManager                  CupsManager + UdonBehaviour (manual); moved under "Players" and renamed
                                 "<Player>_Cups" at Init so it stays active (CupsManager.cs:64-66)
  BallSpawnPoint                 local (0.552, 0.01, -1.311)
  ScoreTable                     world canvas 600 x 256 at scale 0.00039: RawImage (black), Points (Text, built-in Arial, 150)
  AI_SpawnPoint                  local (0, 0.42, -1.547)
  Fixture UI                     mesh + Animator -> TableUIController.controller
    Slider / Panel / UI          UI: inactive world canvas 4500 x 1100 at scale 0.00028, VRCUiShape, trigger BoxCollider
      NavBar                     ToggleGroup + SimpleUIToggleGroup: Game, Rules, Player, AI, Visual, Credits
      Main / Game | Rules | Player | AI | Visual | Credits      one object per tab
      Thry, Last Aim Assist (Label, Value), Volume (Toggle, Container/Volume), LocalizationMenu (nested prefab)
    Button Open Settings         mesh (table.dae Button1) + BoxCollider + SimpleUIInteract; text "Open Settings", reach 1
  Temp Scoreboard                Animator -> Temp Scoreboard.controller + PlayerScoreAnnouncement; local (0, 1.042, -1.317), yaw 180
    Canvas                       inactive; 720 x 480 at scale 0.001: BG_scoreboard (2 images), Score (TMP 160),
                                 Player Aim Assist (Label "Assist", Value "100%", TMP 100)
```

Per panel: 17 Toggles, 9 Buttons, 6 Sliders, 43 Text, 77 Images, 10 `SimpleUIToggle`, 6
`SimpleUISlider`, 2 `SimpleUIOptionSelector`, 1 `SimpleUIToggleGroup`, 1 `SimpleUIInteract`. The four
panels are wired identically (compared after normalising names: no differences).

### 5.3 Serialized fields

| Behaviour (object) | Field = value |
|---|---|
| `Game` (`BeerPong`) | `_initialPlayerColors` 4 colours (item 2); `_allowAvatarThemeColorUsage` 1; `_allowAimAssist` 1; `_allowAI` 1; `_playersParent` = `Players`; `_tablesAnimator` = Animator on `table`; `Balls` = the 4 balls; `_teamIndicatorMaterialIndex` 3; `_tables` = [null, null, `[ThryBP]2Players`, `3Players`, `4Players`]; `_twoTeamPositions` = Team1, Team2 of the 2-side table; `_threeTeamPositions` = Team1-3; `_fourTeamPositions` = Team1-4; `_respawnHeight` = `RespawnHeight`; `TableHeight` = `KingOfTheHillPosition`; `_cupsCollector` = `CupsCollector`; `_kingOfTheHillParent` = `KingOfTheHillPosition`; `LogMinLevel` 1; `_simpleUIReferences`, `_otherExtensions` empty (filled at build, below) |
| `Ball` (each) | `_throwIndicator` = `ThrowIndicator`; `_throwVelocityMultiplierVR` 1.5; `_throwVelocityMultiplierDekstop` 1; `_gameManager` = Game; `_pickup` = VRCPickup on the ball; `_rigidbody`, `_renderer`, `_audioSource` = own components; `_splashParticles` = `SplashParticles`; `_strengthIndicatorDesktop` = the indicator's SkinnedMeshRenderer; `_audio_collision_table` = `sounds/collide 1.mp3`; `_audio_collision_glass` = `sounds/pling (3).mp3`; `_audio_water_splash` = `sounds/splonk.mp3`; `_avatarThemeColor` null |
| Ball's other components | SphereCollider r 0.5 + `Ball.physicMaterial`; Rigidbody mass 1, kinematic, no gravity, drag 1e20, collision detection 3; VRCPickup: `ExactGun` = `Grip`, `orientation` 2, `AutoHold` 1, `proximity` 1, `pickupable` 1; AudioSource: no clip, play on awake off, volume 1, spatial, custom roll-off 0.32 to 3.06 m; VRCSpatialAudioSource gain 10, far 40 |
| `Player` (each) | `CupsManager`, `ScoreAnnouncement` = `Temp Scoreboard`, `UIAnimator` = `Fixture UI` Animator, `BallSpwanpoint`, `AiBallSpawn`, `UiButton` = `Button Open Settings`, `LastAimAssitDisplay` = `.../Last Aim Assist/Value`, `UI_score_boards` = [`ScoreTable/Points`], `UiImagesUsingPlayerColor` = the two popup backgrounds, `_avatarThemeColorToggle` = `Main/Visual/UseAvatarThemeColor`, `_aiNavButton` = `NavBar/AI`, `_aiSettings` = `Main/AI/AI`, `_aimAssistSettings` = `Main/AI/AimAssist`, `_themeColor` null |
| `CupsManager` (each) | `Glass` = the `Cup` on `[ThryBP]glass`; `Player` = its Player |
| `Cup` (template) | `ColliderForThrow` = its MeshCollider; `ColliderInside` = `[ThryBP]InsideCollider`; `BoundsRenderer` = `Glass_LOD0` renderer; `_playerColorRenderers` = `Glass_LOD0`, `_LOD1`, `_LOD2`; `_playerColorMaterialIncicies` = 0, 0, 0 (`BeerPong.prefab:74467`) |
| `PlayerScoreAnnouncement` (each) | `_animator` = own; `_textScore` = `Canvas/Score`; `_textSkill` = `Canvas/Player Aim Assist/Value`; `_player` = its Player |
| `VRDesktopToggler` | `vrObjects` empty; `desktopObjects` = [child `Strength Indicator`] |
| `Localization` | `_data` = [`beerpong_localization.csv`]; every other array empty until build |

Fields filled **at scene build** by editor code, so empty in the prefab and to be reconstructed by
the kit builder: `SimpleUISetterExtension._simpleUIReferences` / `_otherExtensions`
(`UI/SimpleUISetterExtension.cs:40-58`), `SimpleUIInput.LinkedInputs` and `_clickSound`
(`UI/SimpleUIInput.cs:397-469`), all `Localization` label tables (`UI/Localization.cs:127` onward),
singleton references (`_Internal/Attributes.cs:60-83`).

### 5.4 UI wiring (per panel; `~` = `Fixture UI/Slider/Panel/UI`)

UnityEvents call `UdonBehaviour.SendCustomEvent(<string>)` on the control's own behaviour unless noted.

| Control | Unity UI | Event | Script on the control: target, variable, networked, extra event |
|---|---|---|---|
| `Fixture UI/Button Open Settings` | collider | Interact | `SimpleUIInteract`: Player, event `ToggleSettings` |
| `~/NavBar/{Game,Rules,Player,AI,Visual,Credits}` | Toggle in group (Game on) | `SetActive(bool)` on `~/Main/<tab>`, then `Execute` on NavBar | `SimpleUIToggleGroup`: Player `_settingsNavbar`, networked |
| `~/Main/Game/Gamemode` Left / Right | Buttons | `Prev` / `Next` | `SimpleUIOptionSelector`: Game `_gameMode`, networked; options `bp:gamemode_values`, "King of the Pong", "Big Pong", "Mayhem" (replaced by the CSV array) |
| `~/Main/Game/PlayerCount` | Slider 2-4 whole | `Execute` | `SimpleUISlider`: Game `_playerCount`, networked; handle text |
| `~/Main/Game/TeamsBarrier/Teams`, `Barrier` | Toggles | `Execute` | `SimpleUIToggle`: Game `_doTeams`, `_useBarrier`, networked |
| `~/Main/Rules/Self Fire`, `Friendly Fire (Teams):`, `Auto Respawn Balls` | Toggles | `Execute` | Game `_allowSelfFire`, `_allowFriendlyFire`, `_doAutoRespawnBalls`, networked |
| `~/Main/Player/Options/Rows` | Slider 3-11 whole | `Execute` | this side's CupsManager `_rows`, not networked, then event `ResetGlasses` |
| `~/Main/Player/Options/Shape` Left / Right | Buttons | `Prev` / `Next` | this side's CupsManager `_shape`, not networked, then `ResetGlasses`; options `bp:shape_values`, Square, Circle, HashTag |
| `~/Main/Player/Options/Buttons/Reset`, `Rerack` | Buttons | `ResetPlayer` on Player; `Rerack` on CupsManager | direct |
| `~/Main/Player/Global/Sync`, `Reset` | Buttons | `SyncSettingsToAllPlayers`, `ResetAllPlayers` on Player | direct |
| `~/Main/AI/AI/AI`, `Adaptive` | Toggles | `Execute` (`Adaptive` also sends `OnInteraction`, which no script defines) | Player `_isAI`, `_useAdaptiveAISkill`, networked |
| `~/Main/AI/AI/AI Skill` | Slider 0-1 | `Execute` (+ `OnInteraction`) | Player `_aiSkill`, networked |
| `~/Main/AI/AimAssist/AimAssist` | Slider 0-1 | `Execute` | Game `_aimAssist`, networked |
| `~/Main/AI/AimAssist/AdaptiveAim` | Toggle | `Execute` (plus one call with a missing target) | Game `_doAdaptiveAimAssist`, networked |
| `~/Main/Visual/Points Popup`, `UseAvatarThemeColor` | Toggles | `Execute` | Game `_showPointsPopup`, `_useAvatarThemeColor`, networked |
| `~/Main/Visual/Size/Slider`; `Reset` | Slider 0.5-1.5; Button | `Execute`; `Slider.set_value(1)` | Game `_size`, networked |
| `~/Volume/Toggle`; `~/Volume/Container/Volume` | Toggle; Slider 0-1 | `SetActive(bool)` on Container; `Execute` | Game `_volume`, not networked |
| `~/LocalizationMenu` | 3 Toggles | (nested prefab) | `LocalizationMenu`: Localization `CurrentLaguage`, local |

A networked control takes ownership of the target, sets the variable with change callbacks
suppressed for UI echo, requests serialization, then raises the optional event
(`UI/SimpleUIInput.cs:127-160`).

### 5.5 Animators

| Controller | On | Parameters | States |
|---|---|---|---|
| `Table.controller` | `table` | `dividers` Bool; `players` Int (never set) | layer "Dividers": DeviderOff (default) <-> DeviderOn on `dividers`, 1 s, no exit time |
| `TableUIController.controller` | each `Fixture UI` | `isOn` Bool | Off (default, empty) -> Extend (`TableUIAnim`, speed 1) on `isOn`; Extend -> Pull in (same clip, speed -1) on not `isOn`; Pull in -> Extend |
| `Temp Scoreboard.controller` | each `Temp Scoreboard` | `show` Trigger | offScoreboard (default) -> showScoreboard on `show` -> onScoreboard (speed 0.2) -> hideScoreboard -> offScoreboard; onScoreboard -> showScoreboard on `show` |

Clips: `DeviderOn/Off` (mesh scale Y and collider active for the three dividers), `TableUIAnim`
(`Slider` Z to -0.317 in 0-0.5 s, `Slider/Panel` X rotation to 130 in 0.5-1 s, `Slider/Panel/UI`
active from the first frame), `show/on/hide/offScoreboard` (root scale and `Canvas` active).

### 5.6 Audio

| Source | Clips | Played |
|---|---|---|
| One AudioSource per ball (4) | `collide 1.mp3` (table), `pling (3).mp3` (cup), `splonk.mp3` (splash) through `PlayOneShot` | collisions at `clamp01(|v|^2 / 10)`, splash at 1 (`Ball.cs:126-129`, `197`, `989-993`) |
| `[Thry]ClickSound` (dependency prefab) | `_Internal/SwipeMenu/Sounds/click.mp3` | every UI action (`UI/ClickSound.cs:34-35`) |

---

## 6. Assets

Folder `_Internal/BeerPong/` is 30 MB on disk; about half is Blender source files not needed by the port.

| Kind | Count | Sizes | Notes |
|---|---|---|---|
| Models used | 3 `.dae` | `table.dae` 6,786,028 bytes, 48,390 triangles in 13 meshes (largest asset); `glass.dae` 467,883 bytes, 2,982 triangles in 6 LOD meshes; `arrow.dae` 105,690 bytes, 936 triangles | Blender 2.93 exports. Import scale: glass 0.0375, arrow 0.5. The three table bodies are 7,888 / 12,828 / 17,112 triangles; only one is visible at a time. A cup is 1,690 triangles at LOD0, 842 at LOD1, 450 at LOD2. The arrow is never shown (item 10) |
| Model sources, unused | 6 `.blend` / `.blend1` | 15.5 MB | not needed |
| Other prefabs in the folder, unused | 2 | `3dmodels/Beer Pong (1).prefab` 912 KB, `assets/Player1.prefab` 337 KB | not referenced by `BeerPong.prefab` |
| Textures in the folder | 5 PNG | `plen_DefaultMaterial_BaseMap.png` 2048 x 2048, 3.6 MB (largest); `plen_DefaultMaterial_Normal.png` 2048 x 2048, 2.5 MB; `GoodJob.png` 1024 x 1024; `throwStrengthText.png` 1024 x 256; `GlassLOD2.png` 279 x 444 | **None over 2048.** The two wood maps should be reduced to 1024 for Quest |
| Shared UI textures the prefab uses | 6 PNG (+2 flags through the language menu) | `VolumeHighIcon` 1024, `circle` 512, `circle_border` 512, `triangle` 512, `logo` 600, `outline_done_white_48dp` 96; flags 500 and 1000 | under `_Internal/_Assets/Textures/` |
| Audio | 5 mp3 in the folder (3 used) + 1 shared | 4,014 / 6,116 / 4,032 bytes used; `collide.mp3`, `pling.mp3` unused; `click.mp3` 3,272 | tiny |
| Materials | 14 `.mat` in the folder (11 used) + 1 embedded in the table model ("Button") | | Used: Ball, Metall, DarkMetall, Wood30, Wood30 1, PlayerIndicator, Glass, Glass LOD2, Fluid, GoodJobParticle, StrengthIndicator. `ThrowIndicator` only on the never-shown arrow. Unused: Droplet, PlayerIndicator 2 |
| Shaders | 1 custom | `materials/StrengthIndicator.shader`, 92 lines | see below |
| Fonts | 1 TTF + 2 external | `Dosis-VariableFont_wght.ttf` 138,656 bytes on 168 of 172 Text components; built-in Arial on the 4 score plates; TextMeshPro "LiberationSans SDF" (guid `8f586378...`, not in the repo) on the 12 popup texts | |
| Animation | 3 controllers, 7 clips | 5 to 15 KB each | plain transform and active curves; should import unchanged |
| Physics materials | 2 | | values in section 3.6 |
| Data | 1 CSV | 1,384 bytes | localisation |

**Shaders to re-make for URP / Quest**
- Every `Standard` material: converted to URP Lit by the kit builder. `Glass.mat` is transparent (fade); `ThrowIndicator.mat` transparent with emission; `PlayerIndicator.mat` uses emission, which the script recolours (`Game.cs:530-531`), so the URP material needs `_EmissionColor` and `_BaseColor` in place of `_Color`. `Wood30.mat` and `Wood30 1.mat` reference a `_SpecGlossMap` whose guid (`ca8307f1...`) is **not in the repo**; the metallic Standard shader ignores it.
- `GoodJobParticle.mat`: built-in particle shader (id 211, additive-style blend) to URP Particles/Unlit. Which exact built-in shader id 211 is was not verified.
- `StrengthIndicator.shader`: hand-written built-in-pipeline CG. It writes clip-space positions straight from UVs to draw a screen-fixed bar, is disabled in stereo, and uses `fwidth`. It must be rewritten (URP HLSL), or replaced by a small bar object in front of the desktop camera. Desktop only.

**Third-party content and provenance**

| Asset | What the repo says | Finding |
|---|---|---|
| Table, cup, arrow models; wood and glass textures | Art credited to Tsuna in `README.md`; no licence of its own | Covered only by the repo's MIT by inclusion. Marker files show the two wood maps were downloaded from Discord attachment URLs and `GlassLOD2.png` came out of pixlr.com (`materials/*_Zone.Identifier`) |
| `collide 1.mp3`, `pling (3).mp3`, `splonk.mp3` (and the two unused ones) | nothing | Marker files show downloads from mp3cutter.com / freeconvert.com, mp3louder.com / fileconverto.com and onlineconverter.com (`sounds/*_Zone.Identifier`). **Original source and licence unknown** |
| `click.mp3` | nothing | unknown origin |
| `Dosis-VariableFont_wght.ttf` | `_Internal/_Assets/OFL.txt` | SIL OFL 1.1; the notice must ship |
| `outline_done_white_48dp.png` | nothing | file name matches Google Material Icons (Apache-2.0); not stated |
| Flag images | nothing | unknown origin; only used by the language menu |
| `logo.png` | nothing | Thryrallo's logo, shown on the panel and credits |
| `GoodJob.png`, `throwStrengthText.png`, `VolumeHighIcon.png`, `circle*.png`, `triangle.png` | nothing | presumably the author's own; not stated |
| LiberationSans SDF | not in repo | ships with TextMeshPro (SIL OFL) |

---

## 7. Translation map (porting order)

Lines are upstream totals; "runtime" excludes `#if UNITY_EDITOR` blocks.

Shared scripts outside `_Internal/BeerPong/` that the in-scope code or prefab depends on:
- Base classes of `Game`, `CupsManager`, `Player`: `UI/SimpleUISetterExtension.cs` -> `_Scripts/ThryBehaviour.cs` (with `LogLevel`) -> `_Scripts/Logging.cs` (`Game.cs:19`, `CupsManager.cs:20`, `Player.cs:13`).
- `_Scripts/Helpers.cs`: `Collections.Duplicate` (`CupsManager.cs:61`).
- `HandColliderSystem/HandCollider.cs` with `HandCollider_Left.cs`, `HandCollider_Right.cs` (`Ball.cs:1028-1033`), brought in by `_Dependencies/[Thry]HandColliders.prefab`.
- `AvatarTheme/AvatarThemeColor.cs` (`Ball.cs:99`, `436-439`; `Player.cs:33`, `76`): referenced, null in the prefab.
- On prefab objects: `UI/SimpleUIInput.cs` and its five subclasses, `UI/Localization.cs`, `UI/LocalizationMenu.cs`, `_Scripts/VRDesktopToggler.cs`, `UI/ClickSound.cs` (through `_Dependencies/[Thry]ClickSound.prefab`), `_Internal/PrefabDependency.cs` (editor only).
- Editor-time wiring that the prefab relies on: `_Internal/Attributes.cs` (singleton references) and the post-process blocks inside `SimpleUIInput`, `SimpleUISetterExtension` and `Localization`.

| # | Upstream file | Lines | Target | Hard parts |
|---|---|---|---|---|
| 1 | `_Scripts/ThryBehaviour.cs`, `_Scripts/Logging.cs`, `_Scripts/Helpers.cs` (`Collections.Duplicate` only, line 140) | 29, 25, 8 of 260 | `ts/src/ThryBehaviour.ts` | none |
| 2 | `UI/SimpleUISetterExtension.cs` | 59 (36 runtime) | `ts/src/SimpleUISetterExtension.ts` | The reference arrays are built by editor code (`:40-58`); the kit builder must emit them into `bindings.json` |
| 3 | `UI/SimpleUIInput.cs` + `SimpleUIToggle.cs`, `SimpleUISlider.cs`, `SimpleUIOptionSelector.cs`, `SimpleUIInteract.cs`, `SimpleUIToggleGroup.cs` | 472 (162 runtime) + 32, 63, 48, 21, 47 | `ts/src/SimpleUIInput.ts` and one file each | Values must come from Unity UI controls to the page (toggle and slider values, not just clicks); `GetProgramVariable` by name; `LinkedInputs` built at build time (`:431-445`); echo suppression (`:147-149`) |
| 4 | `Cup.cs` | 109 | `ts/src/Cup.ts` | `InitPrefab` measures renderer bounds (`:90-108`): take the numbers from bindings. Keep the pi x height quirk (`:107`) or the rim spiral changes |
| 5 | `CupsManager.cs` | 552 | `ts/src/CupsManager.ts` | Pure grid logic translates line for line (best golden-vector target). C# integer division and remainder (`:299`, `:353`, `:397`), `(int)` of NaN for an empty rerack (`:209-222`), byte array. `_SyncGlass` staggering (`:426-478`) replaced by an immediate diff; cup objects through a view interface |
| 6 | `PlayerScoreAnnouncement.cs` | 38 | `ts/src/PlayerScoreAnnouncement.ts` | `ToString("D4")`, `ToString("F0")` formatting |
| 7 | `Player.cs` | 332 | `ts/src/Player.ts` | Setters with side effects on sync (`:153-175`, `:302-312`); ownership before every write; AI timers must survive the driver leaving |
| 8 | `Game.cs` | 823 | `ts/src/Game.ts` | 13 synced properties with setters; `ChangeAmountOfPlayers` moves sides and teleports (`:738-822`); shared material instance (`:268-287`); `ResetBalls` ownership fault (`:719`, `:727`); dead adaptive code kept or dropped (`:300-335`) |
| 9 | `Ball.cs` | 1,053 | `ts/src/Ball.ts` | About half translates directly: state machine, turn logic, aim assist and AI vectoring (`:645-877`), rim spiral, in-cup timers. The rest has no direct equivalent: per-frame velocity tracking (`:226-233`), remote hand follow (`:248-262`), PhysX contact callbacks (`:982-1040`), switching to a real rigidbody (`:936`), the in-cup containment test (`:343-354`), mouse charge (`:240-245`) |
| 10 | (new, no upstream file) | est. 400-600 | `ts/src/BallFlight.ts` | The contact solver that replaces PhysX: sphere against table top polygon, cup lid and frustum, divider boxes, respawn plane; produces the segment list and outcome (section 8.3) |
| 11 | `HandCollider.cs` (+ `_Left`, `_Right`) | 111 + 15 + 15 | `ts/src/HandCollider.ts` | Only the hand position and velocity part (`:59-73`); clap detection (`:75-110`) is another prefab's feature |
| 12 | `UI/Localization.cs`, `UI/LocalizationMenu.cs` | 342 (117 runtime), 24 | `ts/src/Localization.ts` | Label tables are built by editor code; kit builder must list every label whose text is a key |
| 13 | `_Scripts/VRDesktopToggler.cs` | 21 | `ts/src/VRDesktopToggler.ts` | none |
| 14 | `UI/ClickSound.cs` | 53 | `ts/src/ClickSound.ts` | optional |

Not translated: `_Internal/AvatarTheme/AvatarThemeColor.cs` (883 lines; referenced but null in the
prefab), `_Internal/PrefabDependency.cs` and `_Internal/Attributes.cs` (editor only),
`_Internal/_Scripts/Editor/Patcher.cs`, and the rest of the repo.

Also needed in the shared runtime rather than per game: Unity-compatible `Vector3` / `Quaternion` /
`Mathf` helpers (`Quaternion.Euler`, `Vector3.Angle`, `Vector3.Reflect`, `Lerp`, `InverseLerp`,
`Clamp01`), single-precision rounding where vectors must match.

---

## 8. Snippet design

### 8.1 Shape

- Slug `beer-pong`, `single="false"`: several tables must coexist, as upstream allows (item 101).
- **No seats.** Upstream has none; sides are places to stand, anyone may throw. 2 to 4 sides, any number of people.
- Kit: one prefab from `BeerPong.prefab` with the stand-ins stripped. Two ball objects per slot: a grabbable **hand ball** (`sync: "transform"`, shown while Idle and InHand) and an unsynced **flight ball** driven by a per-frame graph (shown while Flying, Rimming, InCup). Reason: a synced transform would fight a locally evaluated formula on non-owners.
- The reflection probe is dropped from the kit: a snippet should not change reflections of the host world.

### 8.2 Settings (flat attributes; applied only when the instance's shared state is empty)

| Attribute | Default | Upstream source |
|---|---|---|
| `position`, `rotation`, `scale` | `0 0 0`, `0 0 0`, `1 1 1` | holder transform (README) |
| `room` | empty | instance key (README) |
| `players` | `2` | `Game.cs:50` |
| `mode` | `normal` (`normal`, `king`, `big`, `mayhem`) | `Game.cs:49` |
| `rows` | `5` (3-11) | `CupsManager.cs:95` |
| `shape` | `triangle` (`triangle`, `square`, `circle`, `hashtag`) | `CupsManager.cs:84` |
| `size` | `1` (0.5-1.5) | `Game.cs:52` |
| `teams`, `barrier`, `self-fire` | `false` | `Game.cs:53-56` |
| `friendly-fire`, `auto-respawn`, `points-popup` | `true` | `Game.cs:57-60` |
| `aim-assist` | `0.3` (0-1, metres) | `Game.cs:244` |
| `allow-aim-assist`, `allow-ai` | `true` | prefab `Game._allowAimAssist`, `_allowAI` |
| `color-1` .. `color-4` | the four prefab colours as `r g b 1` | prefab `_initialPlayerColors` |
| `throw-vr`, `throw-desktop` | `1.5`, `1` | prefab ball multipliers |
| `throw-key` | `F` | new: desktop charge key |
| `volume` | `0.5` | `Game.cs:62` |
| `language` | empty (follow the browser) | `UI/Localization.cs:68` |

Gizmos: `<bs-gizmo type="position" attribute="position"/>`; `<bs-gizmo type="box" attribute="position" size="1.52 1.64 2.96"/>` (2-side table); `<bs-gizmo type="box" attribute="position" size="3.4 1.64 3.0"/>` (largest footprint, 3 and 4 sides); `<bs-gizmo type="sphere" attribute="position" radius="3"/>` (throwing room). A gizmo bound to an attribute is centred on it and cannot also take an offset, so the boxes are twice the table height (0.82) to show its top; half of each box is below the floor. Footprints are from the model bounds (2 sides: 1.51 x 2.96 m; 3 sides: 3.31 x 2.87 m; 4 sides: 2.96 x 2.96 m) and must be re-measured by the kit builder.

### 8.3 What runs per frame and what is precomputed

**Superseded (section 0.1):** the ball is a rigidbody simulated by the thrower's client; the solver, replay and
`motion` / `vel` ops below were not built.

Upstream does six things every frame (`Ball.cs:200-224`, `CupsManager.cs:476`). In the port:

| Upstream per-frame work | Port |
|---|---|
| Velocity samples of the held ball, 10-frame window (`Ball.cs:226-233`) | **Per frame, in a generated graph** on the hand ball, running only while the local player holds it: ring of 10 `(position - last) / deltaTime` and the largest rotation rate. On `drop` the page asks for the mean (new relay op `vel`). This keeps upstream's exact rule; 30 Hz hand poses with page-side timestamps would give about 4 noisy samples in the same window. Fallbacks, in order: one fresh read of the rigidbody velocity right after `drop`; finite differences of `pose-update` |
| Remote ball follows the owner's hand bone (`Ball.cs:248-262`) | Nothing in the script: platform transform sync of the hand ball |
| Parabola position (`Ball.cs:213`) | **Per frame, in a generated graph** on the flight ball: pick the segment whose start time is at or before `BS.SyncedClock.NowSeconds`, evaluate `p0 + v0 * t + (0, g/2 * t^2, 0)`, set the position. The segment table (at most about 12 rows of start time, p0, v0, g) is sent once per throw (new relay op `motion`) |
| Contacts and bounces (`Ball.cs:982-1022`, PhysX) | **Precomputed in the thrower's script at release** (`BallFlight.ts`): because there is no drag, every segment is closed-form, and the next contact is the earliest of: table top plane inside the table polygon, cup lid and cup frustum, divider boxes, the respawn plane, the 15 s limit and the "still for 1 s" rule. The result is the whole segment list plus the outcome (miss, cup r/c, rim with angle) and its time. The two random numbers of the rim decision are drawn at release |
| Rim spiral (`Ball.cs:291-305`) | **Per frame, same graph**, second formula mode: the spiral of section 3.6 from the synced clock, then a short settle to the cup centre |
| In-cup containment and timers (`Ball.cs:336-401`) | Script at 20 Hz: timers only. The flight ball is parked at the cup centre (what upstream's remote clients see) |
| Rack build, one position per frame (`CupsManager.cs:476`) | Script, immediate diff on each state change |
| Desktop charge bar (`Ball.cs:240-245`) | Script at 20 Hz through a material-float relay op; press and release times come from key events, so the strength itself is exact |
| Bounce and splash sounds | Fired by the flight graph when it crosses a segment boundary if the audio call is on the allow-list; otherwise scheduled from the script against the synced clock (up to about one tick late) |

**Making the thrower's result final.** The thrower's page writes one ball leaf containing the
upstream fields plus `t0` (synced clock at release), the segment table, the outcome with its end time
and a `counted` flag. Every page replays the same table. Remote pages stretch time so the path is the
same and the end time is the same instant for everybody: with `k = (tEnd - t0) / (tEnd - tArrival)`
they evaluate with velocities times `k` and gravity times `k^2`. At the end time the ball's owner
applies score, cup removal and respawn exactly as `Ball.cs:355-395`; if the owner has left, the
referee takes ownership and applies the stored outcome, and `counted` stops a second count. If a rack,
the mode, the size or the barrier changes while a ball is in the air (two balls in King of the Hill
and Mayhem, or a rerack), the owner recomputes the rest of the flight from the current point and
rewrites the leaf.

**The port's contact rules** (a design decision; upstream's are PhysX and frame-rate dependent):
table top, disallowed cups and dividers follow upstream's script rule (reflect about up, times 0.9;
a divider is then a miss). A lid contact inside 0.95 radii is a hit or rim exactly as items 32-33. A
cup contact that is not a hit (rim edge beyond 0.95, or the side) reflects about the true contact
normal with restitution 0.5 (the PhysX average of ball 1.0 and cup 0) and continues as formula
segments. World geometry other than the kit is unknown to the script: a ball that leaves the table
falls until the respawn plane, which is above the floor, so the miss still comes.

### 8.4 Additions this game needs in the contract (README says to extend and record)

| Addition | Why |
|---|---|
| Relay op `motion` (segment table and mode for a flight ball) and a generated per-frame graph | section 8.3 |
| Relay op `vel` (reply with the held ball's averaged velocity) and its graph | item 19 |
| Relay `color` with a material-slot argument; a material-float op | table slot 3 (`Game.cs:278`), cup slot 0 on three renderers (`Cup.cs:49`), `_Strength` (`Ball.cs:244`) |
| A way to create, destroy and colour cup copies (not in `refs`, which is a fixed list) | racks of 0 to 121 cups per side, 176 in King of the Hill. Either `scene.Instantiate` on the template, or a pool in the kit, or a rack op in the graph: to be settled by a spike |
| Event kinds carrying a value from Unity UI (`uiToggle`, `uiSlider`) | 17 toggles and 6 sliders per panel; `uiButton` alone covers only the 9 buttons |
| Runtime: `FieldChangeCallback` semantics; `SendCustomEventDelayedFrames`; orphaned behaviours pass to the referee | sections 4 and 2N |
| `Platform`: `pose-update`, `key-press` / `key-release`, `IsVR`, `TeleportTo`, `ReleaseGrab`, `grab` / `drop` with hand side | sections 4 and 8.5 |

### 8.5 Per instance

Network ids (`pk1/beer-pong/<inst>/ball0h` .. `ball3h` for the four hand balls); the 13 state leaves
plus the referee leaf under `pk1.beer-pong.<inst>.`; the relay and motion graphs filter on the holder
name; the table indicator and every cup colour are per-renderer material instances, never shared
materials (upstream shares one instance across the three table models of one table, `Game.cs:268-287`);
holder scale = `scale` setting x synced size. Local only: volume, language, the charge value, the
velocity ring. No user-state leaves are needed.

### 8.6 Player actions

| Action | VR | Desktop |
|---|---|---|
| Take the ball | Grab the hand ball (`grab`, hand side from the event). Allowed when Idle, or InCup with auto respawn off | Click-grab with the mouse (Play mode reports the right hand; behaviour in the app's desktop mode not verified) |
| Throw | Let go: release velocity from the 10-frame graph, x `throw-vr`, aim assist, flight computed, state written | Hold `throw-key` to charge 0 to 1 over 1 s (bar shown), release: script calls `ReleaseGrab()`, speed `min(5, 5 * charge) * throw-desktop` along the head's forward direction, from the ball's position. The charge is cleared after each throw (change from item 22) |
| Knock a rimming ball out | Local hand within hand radius + ball radius of the ball (checked on `pose-update`); velocity from the last two hand poses; the knocker becomes owner and a new flight is computed | Not possible (as upstream in practice) |
| Take the ball out of a cup (auto respawn off) | Grab the hand ball, which is placed in the cup for this state | same with the mouse |
| Open or close a side's panel | Click the table-edge button (layer 5 collider) | click |
| Tabs, toggles, sliders, selectors, buttons | Point and click on the world canvas | click; sliders by click or drag |
| Rerack, Reset, Reset all, Sync settings | buttons on the Player tab | same |
| AI on/off, skill | AI tab | same |
| Volume, language | panel widgets; stored in `localStorage` | same |
| Change the number of sides | slider; the changer is teleported with their side if `TeleportTo` is available | same |

---

## 9. Test plan

### 9.1 Golden vectors (upstream C# compiled with dotnet against stubs)

Stubs needed: `UnityEngine` (`Vector3`, `Quaternion`, `Mathf`, `Color`, `Bounds`, `Random`, `Time`,
a `Transform` with position, rotation and lossy scale), `UdonSharp` attributes and base class,
`VRC.SDKBase` (`Networking`, `Utilities.IsValid`, `VRC_Pickup`). They must be written from the public
documentation, not copied from Unity's reference source (its licence does not allow reuse). Most
targets are private instance methods: the harness needs reflection or a build step that widens
access. Compare integers and arrays exactly, floats with a tolerance (C# `float` against JavaScript
doubles); note that dotnet is not Udon's VM, so formatting and float edge cases are "C# semantics",
not proof of in-VRChat behaviour.

| Suite | Functions | Cases |
|---|---|---|
| Rack shapes | `PlaceCupsAsPyramid`, `Square`, `Circle`, `Hashtag` (`CupsManager.cs:294-419`) | rows 0-11 each: the full 242-byte array and the count |
| Rerack | `RerackInternal` (`CupsManager.cs:195-240`) | each shape x remaining count 0..max, including 0 (NaN path) |
| Rack edits | `RemoveCup`, `ResetGlassesInternal` with overwrites, `RandomizeCupOwnersOfExistingCups` with a scripted generator, `InstanciateCup` positions | indices at the grid edges; Mayhem with 2, 3, 4 sides |
| Scoring and rules | `AddToScore`, `AllowCollision`, `CountCupHit`, `GetNextPlayer`, `PlayersWithCupsLeft`, `IsSameTeam`, `ShouldAimAssist...` (`Game.cs:428-557`) | every mode x teams x self fire x friendly fire x score type x owner relation; elimination skipping with 2-4 sides |
| Trajectory | `PositionAtTime`, `VelocityAtTime`, `SolveQuadric`, `PredictTableHitTime`, `GetTableHitPosition`, `PredictTableHit` (`Ball.cs:645-657`, `824-877`) | grids of positions and velocities, including upward, downward, flat throws and no-solution cases |
| Aim assist | `DoAimAssistVectoring`, `OptimalVectorChangeStrength`, `OptimalVectorJustChangeY`, `GetClosestGlassToPredictedTableCollision`, `XZDistance` (`Ball.cs:659-704`, `723-766`, `795-822`) | fixed racks per mode; strengths 0, 0.1, 0.3, 1; direct, bounce, pass-by and no-change branches; NaN branch |
| AI | `DoAIVectoring`, `GetAIThrowVector`, `GetAITnitalTarget`, `GetAdaptiveAIStrength`, `GetSkill` (`Ball.cs:706-721`, `Game.cs:337-414`, `Player.cs:227-232`) | scripted random sequence; zero own cups; teams |
| Throw | the drop-velocity mean and angular boost (`Ball.cs:511-527`), desktop strength (`Ball.cs:552`) | sample rings with zeros, all zeros (NaN), boost cap |
| Hit decision | the body of `BallGlassCollision` (`Ball.cs:931-980`) with scripted randoms: on-top test, 0.95 limit, rim test, angle encoding | boundary values on each test |
| Rim spiral | position formula and end velocity (`Ball.cs:298-321`) | rim values 0..3000 in steps, two cup scales (1 and 10) |
| King of the Hill layout | `ConfigureCupsKingOfTheHill` offsets (`Game.cs:651-664`) | the four tiers |
| Text | `ToString("D4")`, `(v * 100).ToString("F0") + "%"` (`Player.cs:210`, `326`; `PlayerScoreAnnouncement.cs:27-30`) | negatives, .5 boundaries |

The port's own solver (`BallFlight.ts`) has no upstream counterpart: it gets property tests instead
(energy never rises; the ball is never inside the table or a cup wall; a throw produced by
`OptimalVectorChangeStrength` always ends as a hit on the intended cup; identical input gives
identical output).

### 9.2 Node scenarios (fake room, virtual time, several clients)

1. Two clients, Normal: scripted throw into a known cup. Both: cup gone, score 0001, same slot keeps the ball, equal digest.
2. Miss: turn passes; with three sides and one empty rack the empty side is skipped; with one side left, rotation continues (no game over).
3. Rim shot: +2, angle travels as `int(angle / 2)`, both clients end the spiral at the same clock time.
4. Four sides with teams: +1 to both team-mates; friendly fire -3; self fire -1; with both off the ball only bounces.
5. King of the Hill: four tiers identical on all clients; two throwers aim at the same cup at once: exactly one scores, the other flight is recomputed.
6. Big Pong: one cup, never removed, 2 and 1 points, ball back after 3 s; shape HashTag gives no cup.
7. Mayhem: owners equal on all clients; own-side cups cannot be hit; own colour costs 1.
8. Rerack after removals for each shape; rows and shape change reset only that side; Sync settings; Reset; Reset all.
9. Auto respawn off: ball waits in the cup, next side takes it and the cup goes; 20 s limit.
10. AI against AI for 200 turns: no stall, no error, scores only on AI sides, throw counters untouched.
11. Late join during Idle, InHand, Flying, Rimming, InCup: the joiner reaches the same digest and sees the full rack at once.
12. Thrower leaves mid-flight, mid-rim and in the cup: outcome applied exactly once by the referee. Leaves while holding: ball respawns for the same slot.
13. Referee leaves during an AI turn: the turn completes.
14. Every setting from every panel: value reaches all clients and the other three panels show it.
15. Two beer-pong instances plus another game in one room: no shared keys, ids or messages; deleting one prefix resets one table.
16. Budgets: each leaf under 16,384 bytes with four 11-row square racks; write rate under the shared 20 per second while a slider is dragged and during a King of the Hill volley.
17. Knock-out during a rim: new flight from the knock point, no score, ownership moved.
18. Join, leave and referee loss in random order across a scripted match: digests converge.

### 9.3 Play mode (one player, bot script)

Load the kit from a hand-written `<bs-snippet>`; every binding resolves. Bot: open each panel, click
every control and read back state; switch through the four modes and three side counts and count the
cup objects against state; inject throws with known velocities through a debug hook and check, by
watching the flight ball's transform, that it reaches the cup at the predicted time within a frame
or two; splash particles and the three sounds are requested; popup shows; size slider scales the
holder; grab with the mouse and throw with the charge key. PASS/FAIL lines to the console.

### 9.4 Local Multiplayer (two players)

Same state digest on both pages after a scripted ten-throw match; the held ball is visible on the
other page; a flight ends at the same synced-clock time on both (within 50 ms); a cup removed by one
is gone on the other; settings changed by one show on the other's panels; late join by reloading one
page mid-flight and mid-game; one page closes while holding the ball and while its throw is in the air.

---

## 10. Changed or left out, then risks

### 10.1 Changed

| Item | Change | Reason |
|---|---|---|
| 25, 26, 34, 38, 95 | One flight path, computed once by the thrower and replayed by all against the synced clock; no PhysX phase; ball parked at the cup centre when in | The page has no frame-synchronous contact callbacks and only an asynchronous bridge; upstream's result depends on the owner's frame rate and differs between clients anyway |
| 28 | Only the kit's own geometry is tested; world walls and props are not | The script cannot know the host world's colliders |
| 14 | Held ball shown to others by platform transform sync | Remote hands cannot be read |
| 19 | VR release velocity measured by a graph (same rule), with fallbacks | Hand poses reach the page at most 30 times a second |
| 20, 21, 22 | Desktop charge on a key; bar re-made; charge cleared after each throw | No mouse-button event; custom built-in shader; item 22 is a bug |
| 36 | Knock-out detected from the local hand pose; the knocker's client computes a proper new flight | Upstream's knocker keeps a stale parabola (`Ball.cs:1032-1038` never updates the local start values) |
| 60 | Cups appear and disappear at once | The staggering only spreads Udon's instantiate cost; it delays a removed cup by up to 242 frames |
| 85, 98 | AI turns are driven by the referee | Survives the previous thrower leaving |
| 96, 97, 99, 100 | `counted` is part of the ball's state; orphaned balls are respawned by the referee; a ball reset takes ownership first; the hit ring index is guarded | Upstream faults that would be worse here, where ownership is logical |
| 4 | Teleport only if the platform call is available; otherwise the changer stays put | Not in the README runtime |
| 90 | The Size slider refreshes the Size sliders | Upstream passes the wrong variable name (`Game.cs:119`) |
| 92 | Language from the browser; menu kept as text buttons | VRChat language API; flag images of unknown origin |
| Reflection probe | removed | A snippet runs in other people's worlds |
| Sounds | replaced unless their source is established | Section 6 |

### 10.2 Left out

| Item | Reason |
|---|---|
| 10 Throw indicator and `Locked` state | Dead code upstream; the arrow model is not shipped |
| 16 Avatar theme colour | Needs another prefab that the stock table does not include, and an avatar colour the platform does not expose (`user.color` is not the avatar's colour) |
| 18 Index trigger release | VRChat input-method specific |
| 77 Adaptive aim assist | Has no effect upstream; the toggle is kept visible only if the checklist reviewer wants a literal panel |
| 78 Developer cheat | Names hard-coded to the upstream author |
| 93 Click haptics | Optional; the plan and the SDK docs disagree on haptics |
| Clap detection in `HandCollider.cs:75-110` | Belongs to another prefab (Clapper) |

### 10.3 Open risks and questions, ranked

1. **The flight solver is new code, not a translation, and decides every score.** It replaces PhysX with rules of the port's own for cup-edge and side contacts. The plan's spike "beer pong replay versus synced rigidbody" is listed under wave 2 while this game is in wave 1; it should run before `Ball.ts` is written.
2. **Release velocity in VR.** Needs a per-frame graph using transform reads, `Time.deltaTime` and a list; none of these members has been checked against the allow-list, and the app enforces the list where Play mode does not. If it fails, throws are built from 30 Hz poses and will feel different from upstream.
3. **Cups as objects.** Up to 176 at once (King of the Hill), each with three LOD renderers needing its own colour. Whether `scene.Instantiate` works on kit objects, how fast, and how to colour copies through the bridge are all unverified. Quest draw-call cost of 176 uniquely coloured cups is also unmeasured.
4. **Sound licence.** The three effects have no stated source; they passed through converter sites. Replace them or get the author's word.
5. **Art licence.** Tsuna's models and textures have no terms of their own. MIT by inclusion is the only basis; the credit must stay visible (kept on the Credits tab and in `THIRD-PARTY-NOTICES.md`).
6. **Unity UI values to the page.** 17 toggles and 6 sliders per panel need value-carrying events; only `uiButton` exists in the contract. Fallback: rebuild the controls as layer-5 colliders using `click` and the hit point.
7. **Desktop grab and release in the app** (as opposed to Play mode) is not documented in what was read; the charge-key design assumes `ReleaseGrab()` works for a mouse-held object.
8. **Synced clock quality.** Flight end times assume the relay `clock` reply gives an offset good to a few tens of milliseconds on Quest.
9. **Table collision shape.** Upstream bounces on the convex hull of the table mesh (about 2 cm above the cups' base, and across any gaps on the 3 and 4 side tables). The kit builder must export that top polygon and height; the numbers here come from the model file, not from Unity.
10. **Write rate.** A throw is about 3 leaf writes and a hit about 4 more over 2 s; a dragged slider can exceed the shared 20 per second unless throttled.
11. **Upstream Unity version unknown.** Import of the 2021 Blender `.dae` files and 2022-era prefab YAML into Unity 6000.3 is untested; the table model's import table lists objects that the file no longer contains (stale names in `table.dae.meta`).
12. **Is "no game over" acceptable?** Upstream never ends a game. The port keeps that unless told otherwise.
13. **Golden vectors are C# semantics, not Udon's.** Float formatting and NaN casts may differ in VRChat; treated as acceptable.

### 10.4 Where this differs from the plan and the README contract

1. The plan's note lists four files (`Ball`, `Game`, `CupsManager`, `Player`). There are six gameplay files (also `Cup.cs`, `PlayerScoreAnnouncement.cs`) and 17 shared files the prefab cannot work without (section 7).
2. The plan says the throw "is replayed on every client from its synced start state (as upstream does)". Upstream syncs only the first parabola. Every bounce comes from each client's own PhysX contact (`Ball.cs:996-998`), the hit from the owner's PhysX (`Ball.cs:1000-1012`), and after a cup contact the owner's ball is a real rigidbody (`Ball.cs:936`). A faithful-looking replay therefore needs a contact solver that upstream does not contain.
3. The plan schedules the "beer pong replay versus synced rigidbody" spike in wave 2 but the game in wave 1.
4. The plan lists "no haptics" as a platform limit; the SDK 4.0.29 docs describe `scene.SendHapticImpulse` (`Docs/javascript-api/scene-settings.md`). Only the optional UI click buzz depends on it.
5. README: "near line-for-line translation" holds for five of the six files and for about half of `Ball.cs`; the other half is redesigned (section 7, row 9).
6. README runtime and relay tables lack what section 8.4 lists: change-callback semantics, frame-delayed events, value-carrying UI events, a material slot on `color`, a material float, per-frame motion and velocity ops, and a way to address objects created at run time. The README invites such extensions; none contradicts it.
7. Upstream has no seats, no player-to-side binding, no teams of people and no end of game, so "seats/players" in the snippet is simply "none".
