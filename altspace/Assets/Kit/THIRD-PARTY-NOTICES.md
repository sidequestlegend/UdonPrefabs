# Beer Pong: third-party notices

Beer Pong (snippet `beer-pong`, script `pk-beer-pong.js`, kit bundles `beer-pong`) is a port of the beer pong table of
Thryrallo's UdonPrefabs to Altspace. Port source: https://github.com/sidequestlegend/UdonPrefabs (branch `altspace`,
folder `altspace/`). A copy of this file is inside every kit bundle (`Assets/Kit/THIRD-PARTY-NOTICES.md`), with the full
licence texts it names (`Assets/Kit/Licenses/`, and TextMesh Pro's `LiberationSans - OFL.txt`, which the kit build adds
because the popups use Liberation Sans). The built script `pk-beer-pong.js` starts with the UdonPrefabs MIT notice
(`ts/script-header.txt`), then portkit's own MIT notice.

## UdonPrefabs: code and prefab

- Source: https://github.com/Thryrallo/UdonPrefabs (commit `bd0b6ab`), folder `_Internal/BeerPong/`, `BeerPong.prefab`
  and the shared scripts it needs (`_Internal/UI/`, `_Internal/_Scripts/`).
- Author: Thryrallo. Licence: MIT License, Copyright (c) 2022 Thryrallo; full text in
  `Assets/Kit/Licenses/UdonPrefabs-LICENSE.txt` (the repository's `LICENSE`). The README asks for a credit; it is on
  every panel's Credits tab.
- What of it is here: the gameplay scripts translated to TypeScript (`altspace/ts/src/`, bundled into
  `pk-beer-pong.js`), and the prefab's layout, UI, animations, physics materials and the ball in the kit. Changes are
  listed in `altspace/PORT.md` (sections 0 and 10).

## Made for this port

| What | Made by | Licence | Replaces (upstream file, and why) |
|---|---|---|---|
| `Assets/Kit/Models/bp_table.fbx` (the 2-, 3- and 4-side tables and their convex colliders, the barrier rails and panes, the settings fitting and the table-edge button), `Assets/Kit/Models/bp_cup.fbx` (the cup in three levels of detail, its drink, its collider) | `altspace/tools/make_models.py` (Blender 5.2, headless); only upstream's sizes were reused | MIT (this port) | `_Internal/BeerPong/3dmodels/table.dae`, `glass.dae`: credited in upstream's README to TsunaMoo (who sells models on Booth) but with no licence of their own; their terms could not be verified, so they are not shipped |
| `Assets/Kit/Textures/bp_wood.png` | the same script (noise, no source image) | MIT (this port) | `materials/plen_DefaultMaterial_BaseMap.png`, `plen_DefaultMaterial_Normal.png` (wood), `GlassLOD2.png`: the same art, the same reason |
| The materials in `Assets/Kit/Materials/` (`BP Metal`, `BP Wood`, `BP Shell`, `BP Indicator`, `BP Glass`, `BP Cup`, `BP Liquid`, `BP Button`, and the URP versions of upstream's ball and particle materials) | the kit builder | MIT (this port) | `Metall`, `DarkMetall`, `Wood30`, `Wood30 1`, `Glass`, `Glass LOD2`, `Fluid`, `PlayerIndicator` (the table and cup art's set-ups) |

## Fonts

| Font | Where | Licence and copyright |
|---|---|---|
| Dosis (`_Internal/_Assets/Dosis-VariableFont_wght.ttf`), drawn as a TextMesh Pro atlas named `PongDisplay SDF` (`Assets/Kit/Fonts/PongDisplay SDF.asset`) | the panels and score plates | SIL Open Font License 1.1. Copyright (c) 2011, Edgar Tolentino and Pablo Impallari (www.impallari.com, impallari@gmail.com); Copyright (c) 2011, Igino Marini (www.ikern.com, mail@iginomarini.com); with Reserved Font Names "Dosis". The atlas is a modified form of the font (a subset drawn to a texture), so it does not carry the reserved name. Full text: `Assets/Kit/Licenses/Dosis-OFL.txt` (upstream's `OFL.txt`) |
| Liberation Sans SDF (TextMesh Pro's essentials) | the points popups | SIL Open Font License 1.1. Digitized data copyright (c) 2010 Google Corporation, with Reserved Font Arimo, Tinos and Cousine; Copyright (c) 2012 Red Hat, Inc., with Reserved Font Name Liberation. Full text: TextMesh Pro's `LiberationSans - OFL.txt`, packed by the kit build |

## Checkmark icon

`_Internal/_Assets/Textures/outline_done_white_48dp.png` (the ticks of the panels' toggles): Google's Material Icons
"done", outlined, 48 dp at 2x, in white. Checked on 2026-11-24 against
`png/action/done/materialiconsoutlined/48dp/2x/outline_done_black_48dp.png` of https://github.com/google/material-design-icons:
the alpha channel is identical pixel for pixel (only the colour differs). Licence: Apache License 2.0 (the repository's
`LICENSE`), full text in `Assets/Kit/Licenses/MaterialIcons-Apache-2.0.txt`. Not changed.

## Sounds (replacements; upstream's came through converter sites and have no known source)

| File in the kit | Replaces | Source | Licence |
|---|---|---|---|
| `Assets/Kit/Sounds/bp_table.ogg` | `sounds/collide 1.mp3` | `impactWood_light_000.ogg`, Kenney "Impact Sounds" 1.0, https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `Assets/Kit/Sounds/bp_glass.ogg` | `sounds/pling (3).mp3` | `impactGlass_light_000.ogg`, the same pack | CC0 1.0 |
| `Assets/Kit/Sounds/bp_splash.ogg` | `sounds/splonk.mp3` | `water_splash-03.flac` of "6 Short water splashes" by ezwa (submitted by qubodup), https://opengameart.org/content/6-short-water-splashes, made from pdsounds.org recordings; converted to Ogg Vorbis | CC0 1.0 |
| `Assets/Kit/Sounds/bp_click.ogg` | `_Internal/SwipeMenu/Sounds/click.mp3` | `click_001.ogg`, Kenney "Interface Sounds", https://kenney.nl/assets/interface-sounds | CC0 1.0 |

Each licence was read on the download page and in the pack's own `License.txt` / `info.txt` on 2026-11-24. The CC0 1.0
legal code is in `Assets/Kit/Licenses/CC0-1.0.txt`.

## Not shipped

The table and cup models and textures above (replaced), the throw-indicator arrow (`arrow.dae`, never shown upstream),
the two flag images of the language menu (unknown origin; the menu is not ported), and the Dosis font file itself (only
the atlas drawn from it).

## Other

- The portkit runtime inside the script: MIT License, Copyright (c) 2026 the portkit authors (its notice is the second
  comment block of `pk-beer-pong.js`).
- Other UI images of the prefab (`circle`, `circle_border`, `triangle`, `VolumeHighIcon`, `logo`, `GoodJob`): from the
  UdonPrefabs repository with no separate terms; taken as covered by its MIT licence (PORT.md 0.8).
