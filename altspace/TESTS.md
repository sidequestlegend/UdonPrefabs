# beer-pong: test evidence

Everything here ran on 2026-11-24 on Windows (the rung 3 and 4 runs quoted are the last ones, on the exported bundles), Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor. Nothing ran
in the Altspace app, on a Quest, or with controllers (rung 5: not run; worlds stay Private).

How to run each rung again:

```
cd altspace/ts && npm test                                                    rungs 0 and 1
cd altspace/ts && npm run golden                                              remake vectors/upstream.json (dotnet 8)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                    rung 2 (Logs/portkit_check.txt)
portkit/tools/playtest.sh altspace altspace/playtest/single.json beer-pong   rung 3 (no second player active)
portkit/tools/remote.sh altspace menu "PortKit/Multiplayer/Activate Player 2"
portkit/tools/playtest.sh altspace altspace/playtest/multi.json beer-pong    rung 4
```

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint`: clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **19 tests, 19 pass, 0 fail**, on the real `bindings.json` the kit builder wrote (hash
`b0ffe6c7f5ea1a226b458559a7d4477228174cea`).

- Golden vectors (`test/racks.test.ts`, tests 3-5): upstream's own `CupsManager.cs`, compiled unchanged with dotnet 8
  against portkit's `golden/UdonStubs.cs` (re-synced; the harness's own Mathf / Vector3 / Random shadows are gone, only
  VRC's `Utilities.IsValid` is still shadowed). `vectors/upstream.json` was regenerated and is byte-identical to the one
  before the re-sync. 52 layouts, 488 re-racks, 8 resets; the only allowed differences are the HashTag re-racks upstream
  loses cups on (PORT.md 0.5, bug 1).
- Fake-room scenarios (`test/scenarios.test.ts`, 14): the game's own relay ops (`cupPlace`, `cupInside`, `bpLaunch`) are
  declared to the fake graph with `room.defineRelayOp`, so no "unknown op" is filtered any more; `problems(world)` is the
  room's own list and is empty at the end of every scenario. Contacts arrive as the kit's multi-argument
  `collisionEnter` object event; cups are counted from the standard `spawn` / `despawn` records (each copy must also be
  placed with `cupPlace`). Test 19 is new: a desktop page (`scene.IsVR()` false) throws an uncharged drop at once
  without waiting for a VR release report, and the ball graph's `bpStill` / `bpLow` reports are misses on the owner's
  page and nothing on another page's.

```
ok 1 - rack layouts worked out by hand from the code
ok 2 - rerack rules worked out by hand from the code
ok 3 - rack layouts match upstream's CupsManager.cs (golden vectors), every shape, rows 0-12
ok 4 - reracks match upstream for 0-121 cups left, except the HashTag cases upstream loses cups on (fixed)
ok 5 - ResetGlassesInternal with Game's overwrites matches upstream (King of the Hill tiers 176 cups, Big Pong, inactive side)
ok 6 - two sides play until one rack is empty: hits keep the ball, misses pass it, every client agrees
ok 7 - a hit reported by the thrower removes exactly that cup on every client; others' reports change nothing
ok 8 - rim shot: 2 points, the rim angle travels as int(angle / 2), the cup is removed after the spiral and 2 s
ok 9 - a re-rack from the panel lays the remaining cups out again, on every client
ok 10 - settings changed on one panel reach every client and every other panel
ok 11 - King of the Hill: four stacked circle racks of 176 cups, inside the room's state budgets
ok 12 - a player leaves mid-throw, with the ball in a cup, and while holding it: the referee finishes each once
ok 13 - a late joiner sees the racks, the scores and the ball as they are
ok 14 - two tables in one room keep their racks, scores and balls apart
ok 15 - desktop: holding the throw key charges the throw, letting go throws along the ball's forward axis
ok 16 - AI against AI: turns pass, AI throws and hits are not counted, nothing stalls
ok 17 - aim assist: strength 0 leaves the throw alone; a throw that would land near a cup is steered into it
ok 18 - scoring and collision rules per mode (Game.cs:478-511), on a live table
ok 19 - the ball graph's own reports: a desktop drop throws at once, a still ball and a low ball are misses
```

## Rung 2: the kit in edit mode (`PortKit/Kit/Check`)

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS beer-pong bindings: 254 objects resolve by path; hash matches (b0ffe6c7f5ea1a226b458559a7d4477228174cea)
PASS beer-pong android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 1043/3610, behaviours 1018, scripts 18, ...
PASS beer-pong windows bundle: PASS Kind=Pass Reasons=[] Reports=[] ...
DONE
```

Kit: 868 objects, 254 bound (4 synced, 4 grabbable, 4 clickable), 245 refs, 93 behaviours, 124 events. Graphs: the
relay (2,395 units, 51 distinct members; ops: the standard set plus `cupPlace`, `cupInside`, `bpLaunch`) and one ball
graph per ball (`beer-pong_ball0..3`, 483 units, 28 distinct members), all members on the SDK allow list of 29,061.
Bundles: Android 4,462 KiB, Windows 5,165 KiB, each with the third-party notices inside.

Artifacts (`PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): `android/beer-pong`, `windows/beer-pong`,
`pk-beer-pong.js` (MIT header), `beer-pong.jpg`, `beer-pong.snippet.html` (the game's 19 settings, `position="0 0 0"`),
`manifest.json` (checks android PASS, windows PASS, bindings `b0ffe6c7...`, footprint 3.31 x 4.06 x 2.96 m).

## Rung 3: Play mode, one player (`playtest/single.json`)

A hand-written `<bs-snippet name="beer-pong" ... position="0 0 1.65" aim-assist="1">` with the built script and both
bundles from the test's local server, and `Assets/WebRoot/playtest/bp-playtest.js`, which drives the table through the
SDK's desktop player with portkit's InputSim (its own mouse and keyboard: the SDK casts its own rays and raises grab,
drop, clicks and uGUI events) and reads Unity back with the kit's `probe` and beer pong's own readers
(`Assets/Kit/Editor/BeerPongProbe.cs`: cups per anchor, cup names and colours, the ball's body, rays, graph variables).
**RESULT 15 passed, 0 failed** on the exported bundles (`playtest/evidence_single.txt`, picture
`playtest/evidence_single_table.jpg`). The one console error line is the editor's own search indexer
(`UnityEditor.Search.SearchDatabase`), not the kit.

```
PASS a fresh table takes the element's settings: 2 sides, Normal, 5-row triangles (15 cups each), aim assist 1
PASS every cup the page made exists in Unity (spawned from the anchor's template): at start: page 15,15,0,0, Unity 15,15,0,0,0
PASS a cup of side 1 has side 1's colour on its LOD renderers (cupPlace): [ThryBP]Cup 1 7 0.745 0.000 0.218
PASS the ball rests kinematic at side 0's spawn: True 0.000 0.000 0.000 0.552 0.852 0.339
PASS the desktop key throw: grab the ball, hold F to charge (the bar fills), let go of F: the ball is thrown by its owner's physics:
     held true, state Flying, charge bar cutoff while charging 0.362, body False -0.807 -1.373 3.232 ...
PASS the key throw ends (a hit, or a miss that passes the turn): a miss
PASS a hit in a cup (the thrower's physics; the contact reported by the ball graph) removes that cup, in the page and in Unity:
     the ball let fall onto a cup: side 0: 15 -> 14 cups; Unity lost [ThryBP]Cup 0 99; scores 0,1,0,0
PASS the thrower's side scores, and its score plate shows it in Unity: scores 0,1,0,0, plate 0001
PASS the table-edge button opens the side's settings panel (click on the UI layer): [true,false,false,false]
PASS the Player tab opens (uGUI toggle through the relay graph; the page switches the content): tab 2, content True
PASS Rerack from the panel re-lays the side's remaining cups (Unity's copies follow): after the re-rack: page 13,15,0,0, Unity 13,15,0,0,0
PASS a setting changed on the panel (Rows slider) reaches the rules and the kit: rows 5 -> 10; after the rows change: page 55,15,0,0, Unity 55,15,0,0,0
PASS Barrier on the panel raises the divider (synced setting, animator in Unity): barrier true, divider collider active True
```

How the run goes, and what to know about it:

- **The throw's hit.** In the final run the key throw (aim assist 1) met the front cup's rim and missed, both AI-aimed
  throws (`Player.AI_Aim` / `AI_Shoot` with skill 1, through a debug hook) met rims too (`d 1.29`, `d 1.39` cup radii
  from the centre), and the ball let fall onto a cup went in. In the run before, the first AI-aimed throw went in as a
  rim shot (2 points: `[ThryBP]Cup 1 99: ball y 1.003 top 0.952 d 0.81`); in earlier runs the key throw went in (score
  1, `Cup 1 99` gone). Real physics decides: a 3 cm ball on a flat arc clips the rim of the cup in front of
  the one aimed at (the contacts the thrower judged are in the log, `cup contacts ...`). The test therefore tries the
  key throw, then up to two AI throws, then lets the ball fall onto a cup from 35 cm above (no aim involved), and checks
  whichever lands first. Hit -> removal -> score is always the real path: the ball graph's `collisionEnter`, the owner's
  rule (Ball.cs:931-980), the synced rack, `despawn` in Unity.
- **The re-rack** needs a gap that moves: a hit takes the front cup, the highest grid index, which a re-rack leaves
  empty anyway, so the test removes one back-row cup through the rules (`CupsManager.RemoveCup`, a debug hook) first.
- **Reach.** The table-edge "Open Settings" button keeps upstream's 1 m reach (from the nearest of head and hands), so the
  table stands 1.65 m in front of the test's player; the opened panel then reaches back past the table's end, and the
  test steps the player back (`scene.TeleportTo`) to use it, or to the other end for side 1's panel.
- **Transform reports of a physics ball** (how often its position reaches the page; PORT.md 0.7): while it moves, about
  every frame (585 reports in 2.00 s, longest gap 7.4 ms; 689 in 2.34 s during the key throw). While it lies still,
  none: gaps of 0.7 to 4.3 s were seen (1.27 s in the final run). The page's own "still for 1 s" check (from reported positions) therefore cannot
  see a ball at rest, so the ball graph reports `bpStill` and `bpLow` from the physics step; both were seen in the runs
  (`collisionEnter ... ; bpStill 0`, `bpLow 0`). Both checks stay; whichever fires first ends the throw once.
- The first grab of a Play session let go at once in some runs and held in others (spikes/RESULTS.md S6); the test makes
  a warm-up grab first.

Found in Play mode and fixed on the way (kit builder or script): upstream's ball collider is off in the prefab (Ball.cs
switches it on at run time); the ball's spawn point is inside the table's convex collider (a physics ball fell through
and the desktop ray could not reach it): the ball now rests on the table; a velocity sent with `rbKinematic 0` is lost
(the SDK's synced-object handoff gives the body its tracked velocity, zero, in its first dynamic step): game op
`bpLaunch` and the ball graph's second-step launch; speculative continuous collision fired `OnCollisionEnter` near cups
the ball never touched: continuous dynamic; contacts report the body's position (the transform is interpolated); one
graph asset per ball (four machines shared the last one).

## Rung 4: two Local Multiplayer players (`playtest/multi.json`)

The main editor and a Multiplayer Play Mode clone (`PortKit/Multiplayer/Activate Player 2`) open the same page. The
player whose session sorts first throws, the other watches; they exchange checkpoints as one-shots (which the runtime
ignores). Two rounds: an AI-aimed throw across the table (the watcher samples the ball in its own Unity during the
flight), then, if that missed, the ball let fall onto a cup; then the watcher reloads its page. **RESULT 19 passed,
0 failed** on the exported bundles (`playtest/evidence_multi.txt`).

```
(In this run Player 2's session sorted first: it threw; the main editor watched and reloaded.)
[main]  PASS two players in the room: Main Editor, Player 2
[vp-..] PASS round 0: the thrower's throw removes one cup of side 1: [ThryBP]Cup 1 99
[main]  PASS round 0: the watcher sees the ball fly (its synced transform in this page's Unity): 38 samples, 22 distinct positions, height 0.86..1.50, 2.49 m across
[main]  PASS round 0: the same cup is removed on the watcher's page and in its Unity: here [ThryBP]Cup 1 99 / thrower [ThryBP]Cup 1 99; cups 15,14,0,0
[vp-..] PASS round 1: the thrower's throw removes one cup of side 1: [ThryBP]Cup 1 78
[main]  PASS round 1: the watcher sees the ball fly ...: 37 samples, 23 distinct positions, height 0.47..1.50, 2.75 m across
[main]  PASS round 1: the same cup is removed on the watcher's page and in its Unity: here [ThryBP]Cup 1 78 / thrower [ThryBP]Cup 1 78; cups 15,13,0,0
[vp-..] PASS the watcher reached the same state digest after each throw
[main]  (the watcher reloads its page)
[main]  PASS after reloading its page the watcher sees the remaining cups and the scores (late join), in the page and in Unity:
     after the reload: page 15,13,0,0, Unity 15,13,0,0,0; scores 2,0,0,0; thrower said cups 15,13,0,0, scores 2,0,0,0
[main]  PASS the reloaded page holds the same state as the thrower's (digest): 5b6d1611 / 5b6d1611
[vp-..] PASS after the reload both pages hold the same state (digest): 5b6d1611 / 5b6d1611
```

In this run both rounds' hits came from the let-fall (the aimed throws met rims); the flights the watcher saw are the
aimed throws. Two earlier runs failed one round each (18 and 17 of 19): a let-fall that did not count, once with the
ball still where the last owner's sync had put it, once with no cause in the log (the ball hung still and the page's own
"still for 1 s" rule called the miss, consistent with the body not yet released to this player's physics). The test now
waits until Unity has the ball where the page put it and lets it fall up to three times. Whether a thrower who has just
taken the ball over can be left with a body that does not fly is open (PORT.md 0.7).

## What remains unverified

- **Everything in the app and in a headset (rung 5):** the VR throw (the graph's release velocity from a real hand,
  `bpRelease` was seen in Play mode only for desktop drops, where it reports zero and is ignored), laser clicks on the
  uGUI panels, haptics on panel clicks, sounds (the `audioScaled` records are checked in the fake room; nobody listened),
  frame time on Quest with up to 176 cups, each with its own material instances, and whether the app's synced-object
  handoff behaves as the editor's mirror of it (`bpLaunch` relies on its first-step velocity override).
- **King of the Hill, Big Pong, Mayhem, 3 and 4 sides, teams, AI turns and rim spirals in Play mode:** Node only (the
  rim shot in rung 3 was counted, its spiral not watched).
- **A rim spiral and an in-cup rattle on a remote page:** the watcher saw flights and removals only.
- **Leaving mid-throw with two real clients:** Node only.
- **Two tables in one Play-mode page:** Node only.
