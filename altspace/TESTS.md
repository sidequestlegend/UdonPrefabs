# beer-pong: test evidence

Everything here ran on 2026-11-25 (the re-sync to portkit `c971100`, PORT.md 0.00, after the review fix pass, 0.0) on
Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor, on the kit rebuilt with portkit `c971100` and the
port's own models. Nothing ran in the
Altspace app, on a Quest, or with controllers (rung 5: not run; worlds stay Private).

How to run each rung again:

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python altspace/tools/make_models.py
                                                                              the generated models and wood texture
cd altspace/ts && npm test                                                    rungs 0 and 1
cd altspace/ts && npm run golden                                              remake vectors/upstream.json (dotnet 8)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Prefabs"            the kit (Logs/portkit_kits.txt), ts/bindings.json
cd altspace/ts && npm run build                                               the script
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Bundles" 900        then touch a script and compile
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                    rung 2 (Logs/portkit_check.txt)
rm altspace/Logs/portkit_playtest_arm.txt before each run (a stale DONE ends a run early)
portkit/tools/playtest.sh altspace altspace/playtest/single.json beer-pong   rung 3 (no second player active)
portkit/tools/playtest.sh altspace altspace/playtest/start3.json beer-pong   rung 3, a fresh 3-side table
portkit/tools/playtest.sh altspace altspace/playtest/multi.json beer-pong    rung 4 (starts Player 2 itself)
```

## Canvas colliders, 2026-11-25 evening (portkit 16be5ff: 476075d and 425bd55)

In world 9d7311 the SDK's `BSKitItem` gave every world-space canvas without a BoxCollider a solid one when the kit
loaded: rect x scale, on the canvas's layer. rp-toolkit's head-label canvas then pushed its wearer about (measured in
the hub's Play mode, portkit GAPS.md "Fourth pass"). Re-synced to portkit `476075d`, whose builder gives every
world-space canvas a trigger box of its own first, and whose `PortKit/Kit/Check` fails a canvas that would end up
solid; `425bd55` also makes the page load kit items one at a time (overlapping loads lost relay graphs in the app). Rebuilt:

- Build Prefabs: 12 trigger boxes added to world-space canvases, 0 canvas boxes made triggers.
- rung 0/1: `npm test` **38 of 38** (0 failed). `npm run build`: 566156 bytes.
- rung 2: Check all PASS (bindings `8f35e60a`, the new "canvas colliders" line, both bundles). Android 2320 KiB, Windows 3100 KiB.
- rung 3 (`playtest/single.json`, bp-single): **17 passed, 0 failed**, 0 console error lines (`playtest/evidence_single.txt`).
- rung 4 (`playtest/multi.json`, bp-multi): **19 passed, 0 failed**, 0 console error lines (`playtest/evidence_multi.txt`).
- `dist/` exported: 10 files (5 licence texts), footprint 1.51 x 1.14 x 2.96 m, bindings 8f35e60a95820777ff417e7fd59ad47c6caa7025.

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint`: clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **38 tests, 38 pass, 0 fail**, on the real `bindings.json` the kit builder wrote (hash
`8f35e60a95820777ff417e7fd59ad47c6caa7025`, unchanged by the rebuild).

- Golden vectors (`test/racks.test.ts`, tests 1-5): upstream's own `CupsManager.cs`, compiled unchanged with dotnet 8
  against portkit's `golden/UdonStubs.cs`; 52 layouts, 488 re-racks, 8 resets; the only allowed differences are the
  HashTag re-racks upstream loses cups on (PORT.md 0.5, bug 1).
- Review fixes (`test/review.test.ts`, tests 6-20): each fix's test failed with the fix undone (checked one by one:
  the removal request turned back into a direct removal fails test 6; the start-up teleport, 10-11; the Big Pong
  skill, 12; eager test hooks, 13; launches without the queue, 20). Tests 14-19 make the old tests' names true (hits
  that land in Big Pong, Mayhem, with teams, from the AI).
- Team-mates scoring at the same moment (`test/review.test.ts`, tests 21-24, PORT.md 0.10, closed in 0.00): Mayhem, 4
  sides, teams, three pages, four seeds, the referee one of the scorers (21-22) or an opponent (23-24). (1) Ann hits as
  her team-mate Cat throws; (2) Ann and Cat hit at the same moment; (3) Cat moves her side's AI-skill slider (her own
  claim of side 2) in the moment she throws. Every score, throw and hit, and the slider's value, on every page. With
  the old code (the scorer writes its team-mate's side) all four fail at (2) (scores 2,0,2,0 for 3,0,3,0). With the
  new code on the old kit (`812f285`, no write mark on commands) all four fail at (3): the referee's write of the
  throw and Cat's claim race (the slider value or the throw is lost). Both pass on `c971100`.
- Fake-room scenarios (`test/scenarios.test.ts`, tests 25-38): the game's relay ops (`cupPlace`, `cupInside`) are
  declared to the fake graph with `room.defineRelayOp`; a throw is the kit's `rbLaunch`; `problems(world)` is empty at
  the end of every scenario.

```
ok 1 - rack layouts worked out by hand from the code
ok 2 - rerack rules worked out by hand from the code
ok 3 - rack layouts match upstream's CupsManager.cs (golden vectors), every shape, rows 0-12
ok 4 - reracks match upstream for 0-121 cups left, except the HashTag cases upstream loses cups on (fixed)
ok 5 - ResetGlassesInternal with Game's overwrites matches upstream (King of the Hill tiers 176 cups, Big Pong, inactive side)
ok 6 - King of the Hill: two balls land in one tier 0 ms apart: both cups go, on every client
ok 7 - King of the Hill: two balls land in one tier 100 ms apart: both cups go, on every client
ok 8 - King of the Hill: two balls land in one tier 300 ms apart: both cups go, on every client
ok 9 - a removal asked twice for one cup (two reports of one hit) removes it once
ok 10 - a fresh 3-side table does not teleport its starter; changing the side count later does
ok 11 - a fresh 4-side table does not teleport its starter; changing the side count later does
ok 12 - Big Pong: an AI side with no cups of its own gets a skill in [0, 1] (no Infinity or NaN), the same everywhere
ok 13 - the game's test helpers (remove a cup, aim a throw) reach the page registry only on a test page, and do nothing until called
ok 14 - Big Pong: a ball in the big cup scores 2 after 3 s (rim 1), the cup stays, the scorer keeps the ball
ok 15 - Mayhem: every side has its own ball; a cup of another colour scores 1, one of the thrower's own colour costs 1
ok 16 - teams (0 and 2 against 1 and 3): a hit scores for both team-mates; a team-mate's cup costs both 3
ok 17 - King of the Hill: the AI at skill 1 throws from its spawn point into a cup at the table's centre
ok 18 - Big Pong: the AI at skill 1 throws from its spawn point into a cup at the table's centre
ok 19 - an AI throw that lands scores for its side, and is counted neither as a throw nor as a hit (Game.cs:440, :470)
ok 20 - launches from one page go out one at a time, LAUNCH_GAP apart
ok 21 - teams, several balls (Mayhem, 4 sides): team-mates who score and throw at the same moment lose nothing (seed 81, a scorer is the referee)
ok 22 - teams, several balls (Mayhem, 4 sides): team-mates who score and throw at the same moment lose nothing (seed 82, a scorer is the referee)
ok 23 - teams, several balls (Mayhem, 4 sides): team-mates who score and throw at the same moment lose nothing (seed 83, an opponent is the referee)
ok 24 - teams, several balls (Mayhem, 4 sides): team-mates who score and throw at the same moment lose nothing (seed 84, an opponent is the referee)
ok 25 - two sides play until one rack is empty: hits keep the ball, misses pass it, every client agrees
ok 26 - a hit reported by the thrower removes exactly that cup on every client; others' reports change nothing
ok 27 - rim shot: 2 points, the rim angle travels as int(angle / 2), the cup is removed after the spiral and 2 s
ok 28 - a re-rack from the panel lays the remaining cups out again, on every client
ok 29 - settings changed on one panel reach every client and every other panel
ok 30 - King of the Hill: four stacked circle racks of 176 cups, inside the room's state budgets
ok 31 - a player leaves mid-throw, with the ball in a cup, and while holding it: the referee finishes each once
ok 32 - a late joiner sees the racks, the scores and the ball as they are
ok 33 - two tables in one room keep their racks, scores and balls apart
ok 34 - desktop: holding the throw key charges the throw, letting go throws along the ball's forward axis
ok 35 - AI against AI: turns pass, AI throws and hits are not counted, nothing stalls
ok 36 - aim assist: strength 0 leaves the throw alone; a throw that would land near a cup is steered into it
ok 37 - scoring and collision rules per mode (Game.cs:478-511), on a live table
ok 38 - the ball graph's own reports: a desktop drop throws at once, a still ball and a low ball are misses
```

## Rung 2: the kit in edit mode (`PortKit/Kit/Check`)

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS beer-pong bindings: 254 objects resolve by path; hash matches (8f35e60a95820777ff417e7fd59ad47c6caa7025)
PASS beer-pong android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 1036/3557, behaviours 1010, scripts 19, ...
PASS beer-pong windows bundle: PASS Kind=Pass Reasons=[] Reports=[] ...
DONE
```

The build (`Logs/portkit_kits.txt`): the generated meshes have upstream's sizes (`bp_table2` centre (0, 0.4099, 0),
extents (0.7570, 0.4099, 1.4795); its collider the same; `bp_cup_lod0` extents (0.0521, 0.0760, 0.0521);
`bp_settings_button` centre (-0.5530, 0.8206, -1.3108), which also shows the axis change came through the FBX), "23
meshes from Assets/Kit/Models, 8 materials", table top 0.820, ball radius 0.0300, and **"no replaced upstream art: 29
assets checked; models: Assets/Kit/Models/bp_table.fbx, Assets/Kit/Models/bp_cup.fbx"**. Kit: 852 objects, 254 bound
(4 synced, 4 grabbable, 4 clickable), 245 refs, 93 behaviours, 124 events; bindings hash unchanged. Graphs: the relay
(2,496 units, 54 distinct members, was 2,441 and 51 on `812f285`; ops: the standard set, now with `pkHead`, and
`rbLaunch` with one pending launch per target (`PkLaunchSteps` / `PkLaunchVelocity` on each ball), plus `cupPlace` and
`cupInside`) and one ball graph per ball (449 units, 27 distinct members, unchanged), all members on the SDK allow list
of 29,061. Each ball (the four grabbables) now carries the kit's `BSPlayerEvents` with its events made (the SDK click
workaround): 4 more behaviours and one more script type in the bundle check (1,010 and 19, was 1,006 and 18).

Bundles (`Logs/portkit_bundles.txt`), each with `THIRD-PARTY-NOTICES.md` and the licence texts `CC0-1.0.txt`,
`Dosis-OFL.txt`, `MaterialIcons-Apache-2.0.txt`, `UdonPrefabs-LICENSE.txt`, `LiberationSans - OFL.txt`:

| | review pass, before (Tsuna's art) | review pass (generated art), portkit `812f285` | now, portkit `c971100` |
|---|---|---|---|
| Android | 4,462 KiB | 2,309 KiB (2,363,993 bytes) | 2,323 KiB (2,378,500 bytes, +14,507) |
| Windows | 5,165 KiB | 3,089 KiB (3,163,530 bytes) | 3,105 KiB (3,179,226 bytes, +15,696) |

The growth is the kit's: graph blobs 2,233 -> 2,266 KiB (the relay's `pkHead` and per-target launch), the balls'
`BSPlayerEvents`.

Artifacts (`PortKit/Kit/Take Photos`, `PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): `android/beer-pong`,
`windows/beer-pong`, `pk-beer-pong.js` (564,869 bytes, the script rungs 3 and 4 ran; UdonPrefabs' MIT notice, then
portkit's; the committed `Assets/WebRoot` copy is 564,889 bytes, rebuilt after the runs with three comments about the
launch spacing corrected, code unchanged), `beer-pong.jpg` (retaken: the generated 2-side table, 35 renderers, 34
bound objects off), `beer-pong.snippet.html`, new `licenses/beer-pong/` (the five licence texts the bundles carry,
each with its sha1 in the manifest), `manifest.json` (10 files; checks android PASS, windows PASS, bindings
`8f35e60a...`, footprint 1.51 x 1.14 x 2.96 m, unchanged by the kit now counting world-space uGUI).

## Rung 3: Play mode, one player (`playtest/single.json`, `playtest/start3.json`)

A hand-written `<bs-snippet name="beer-pong" ... position="0 0 1.65" aim-assist="1">` with the built script and both
bundles from the test's local server, and `Assets/WebRoot/playtest/bp-playtest.js`, which drives the table through the
SDK's desktop player with portkit's InputSim and reads Unity back with the kit's `probe` and beer pong's own readers
(`Assets/Kit/Editor/BeerPongProbe.cs`). **`single`: RESULT 17 passed, 0 failed, three runs in a row** on the
`c971100` kit (`playtest/evidence_single.txt` is the last; picture `playtest/evidence_single_table.jpg`, from the review
pass: the generated table and cups in Play mode, behind the test player's avatar). The console had 0 error lines in
each run. In every run the key throw missed and the let-fall went in (side 0: 15 -> 14, `[ThryBP]Cup 0 99`, scores
0,1,0,0, plate 0001); `rbLaunch` off by 0.000 m/s each time.

```
PASS a fresh table takes the element's settings: 2 sides, Normal, 5-row triangles (15 cups each), aim assist 1
PASS every cup the page made exists in Unity (spawned from the anchor's template): at start: page 15,15,0,0, Unity 15,15,0,0,0
PASS a cup of side 1 has side 1's colour on its LOD renderers (cupPlace): [ThryBP]Cup 1 7 0.745 0.000 0.218
PASS the ball rests kinematic at side 0's spawn: True 0.000 0.000 0.000 0.552 0.853 0.339
PASS the table, the panel fittings and the cups draw and collide with the generated models: table bp_table2,bp_divider2_rail,
     bp_divider2_pane,... | bp_table2_collider,...; fittings bp_fixture,bp_fixture_slider,bp_fixture_panel,bp_settings_button;
     cup bp_cup_lod0,bp_cup_lod1,bp_cup_lod2,bp_liquid_lod0,... | bp_cup_collider
PASS the desktop key throw: grab the ball, hold F to charge (the bar fills), let go of F: the ball is thrown by its owner's physics:
     held true, state Flying, charge bar cutoff while charging 0.378, body False -0.785 -0.981 ...
PASS the key throw ends (a hit, or a miss that passes the turn): a miss
PASS a throw is the kit's rbLaunch: 150 ms later the body is dynamic with the throw's horizontal velocity:
     thrown 0.000,1.855,-5.105, body False 0.000 0.678 -5.105 ..., off by 0.000 m/s
PASS a hit in a cup (the thrower's physics; the contact reported by the ball graph) removes that cup, in the page and in Unity:
     the ball let fall onto a cup: side 0: 15 -> 14 cups; Unity lost [ThryBP]Cup 0 99; scores 0,1,0,0
PASS the thrower's side scores, and its score plate shows it in Unity: scores 0,1,0,0, plate 0001
PASS the table-edge button opens the side's settings panel (click on the UI layer): [true,false,false,false]
PASS the Player tab opens (uGUI toggle through the relay graph; the page switches the content): tab 2, content True
PASS Rerack from the panel re-lays the side's remaining cups (Unity's copies follow): after the re-rack: page 13,15,0,0, Unity 13,15,0,0,0
PASS a setting changed on the panel (Rows slider) reaches the rules and the kit: rows 5 -> 10; after the rows change: page 55,15,0,0, Unity 55,15,0,0,0
PASS Barrier on the panel raises the divider (synced setting, animator in Unity): barrier true, divider collider active True
```

**`start3` (review finding 3): RESULT 5 passed, 0 failed, three runs in a row** on the `c971100` kit
(`playtest/evidence_start3.txt`):

```
PASS a fresh table takes players="3": three sides, the 3-side table shown: players 3, table3 active True
PASS the player who starts a 3-side table is not teleported (the first side count is not a change):
     head before 0.000 1.600 0.000, after 0.000 1.600 0.000, moved 0.000 m
PASS the third side's rack is made in Unity too: 3 sides: page 15,15,15,0, Unity 15,15,15,0,0
```

Whether this Play-mode check would have caught the old start-up teleport was not tried (the fix was not undone in
Unity); the Node tests 10-11 did fail without it.

How the run goes, and what to know about it:

- **The throw's hit.** Real physics decides: in all three runs the key throw and both AI-aimed throws (skill 1) met cup
  rims and missed, and the ball let fall onto a cup from 35 cm above went in. The test tries the key throw, then up to
  two AI throws, then the let-fall, and checks whichever lands first. Hit -> removal -> score is always the real path:
  the ball graph's `collisionEnter`, the owner's rule (Ball.cs:931-980), the removal request the referee runs (here the
  same page), the synced rack, `despawn` in Unity. The generated cups' colliders (upstream's convex shape) took hits as
  the old ones did.
- **The launch.** `rbLaunch` was checked on the first aimed throw: 150 ms after the op the body is dynamic and its
  horizontal velocity equals the throw's (vertical: gravity), off by 0.000 m/s in each run.
- **Probes run ahead of the relay.** The test asks Unity again (up to 3 s) until its cup copies match the page's count
  before naming the cup that went (the first run of this pass read once, saw the count right but named no cup).
- **The re-rack** needs a gap that moves: a hit takes the front cup, which a re-rack leaves empty anyway, so the test
  removes one back-row cup through the rules (`CupsManager.RemoveCup`, a test-page hook) first.
- **Reach.** The table-edge button keeps upstream's 1 m reach, so the table stands 1.65 m in front of the test's
  player; the opened panel reaches back past the table's end, and the test steps the player back to use it.
- **Transform reports of a physics ball**: while it moves, about every frame (835 reports in 2.38 s during the key
  throw, longest gap 33 ms); while it lies still, none (a gap of 1.27 s). The ball graph's `bpStill` / `bpLow` cover the
  still ball (PORT.md 0.7).

## Rung 4: two Local Multiplayer players (`playtest/multi.json`)

The main editor and a Multiplayer Play Mode clone open the same page; the player whose session sorts first throws, the
other watches; two rounds (an AI-aimed throw, then, if that missed, the let-fall), then the watcher reloads its page.
Digests are compared only at equal `version()` (portkit README, "Comparing pages"). **RESULT 19 passed, 0 failed,
twice in a row** on the `c971100` kit, with each side's counts routed through the referee (PORT.md 0.00). Which page
throws depends on the session ids, so the two runs covered both roads: in the first (`playtest/evidence_multi_1.txt`)
Player 2 threw while the main editor was the referee, so every throw, hit and score of the thrower was a request the
other page ran (`Player.ThrowCommand`, `HitCommand`, `ScoreCommand`, `AimAssistCommand`), and the watcher's reload
still found scores 2,0,0,0 and the same digest (`34:dc1842af 37deff4f` on both); in the second
(`playtest/evidence_multi.txt`) the main editor threw and was the referee (its own counts written at once; digest
`32:640689bf af7e3be1` on both after Player 2's reload). The excerpt below is from the review pass's run, which had
the same shape as the first run here.

```
(Player 2 threw; the main editor watched, was the referee while the throws went on, and reloaded.)
[vp-..] INFO the referee is the other page                        <- each hit's removal crossed pages as a request
[vp-..] PASS round 0: the thrower's throw removes one cup of side 1: [ThryBP]Cup 1 99
[main]  PASS round 0: the watcher sees the ball fly (its synced transform in this page's Unity): 36 samples, 22 distinct positions, height 0.85..1.14, 0.54 m across
[main]  PASS round 0: the same cup is removed on the watcher's page and in its Unity: here [ThryBP]Cup 1 99 / thrower [ThryBP]Cup 1 99; cups 15,14,0,0
[vp-..] PASS round 1: the thrower's throw removes one cup of side 1: [ThryBP]Cup 1 78
[main]  PASS round 1: the watcher sees the ball fly ...: 36 samples, 23 distinct positions, height 0.89..1.43, 1.68 m across
[main]  PASS round 1: the same cup is removed on the watcher's page and in its Unity: here [ThryBP]Cup 1 78 / thrower [ThryBP]Cup 1 78; cups 15,13,0,0
[vp-..] PASS the watcher reached the same state after each throw (digest at the same version): 22:ef136a41 e25d5f5a, 33:08865792 cdbcd1f9 on both
[main]  PASS after reloading its page the watcher sees the remaining cups and the scores (late join), in the page and in Unity:
        after the reload: page 15,13,0,0, Unity 15,13,0,0,0; scores 2,0,0,0; thrower said cups 15,13,0,0, scores 2,0,0,0
[main]  PASS the reloaded page holds the same state as the thrower's (digest at the same version): 33:08865792 cdbcd1f9 / 33:08865792 cdbcd1f9
[vp-..] PASS after the reload both pages hold the same state (digest at the same version)
```

Runs of the review pass (portkit `812f285`): 19/19, then 17/19, then 19/19 and 19/19 after a test fix. The failed run's two FAILs were the test:
with the thrower not the referee, a hit's cup now goes one round trip after the ball is back (the removal is the
referee's write), and the driver read the cup list as soon as the ball was idle; it saw no cup gone, dropped the ball
again and lost its count. The driver now waits (up to 4 s) for the count to fall after a throw that went into a cup,
and polls Unity's copies before naming the cup. In-game this lag is a round trip (about 100-300 ms in the editor) after
the 2 s the ball already sits in the cup.

## What remains unverified

- **Everything in the app and in a headset (rung 5):** the VR throw (the graph's release velocity from a real hand),
  laser clicks on the uGUI panels, haptics, sounds, frame time on Quest with up to 176 cups (each with its own material
  instances), whether the app's synced-object handoff behaves as the editor's mirror (`rbLaunch` relies on its second
  step), and how the generated table and cups look on a Quest.
- **King of the Hill, Big Pong, Mayhem, 3 and 4 sides in play, teams, AI turns and rim spirals in Play mode:** Node only
  (a fresh 3-side table was started in Play mode, not played). Two balls landing in one rack at once (the removal race)
  is Node only.
- **Team-mates scoring at the same moment** (PORT.md 0.10, closed): Node only (tests 21-24); the referee road for a
  side's counts ran in Play mode with one thrower (rung 4, first run), not with two at once.
- **One page launching two balls within two physics steps** (the kit's one pending launch until `f7547fb`, now one per
  target; the game keeps its 0.15 s spacing): the spacing is Node
  only.
- **A rim spiral and an in-cup rattle on a remote page; leaving mid-throw with two real clients; two tables in one
  Play-mode page:** Node only.
