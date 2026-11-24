# Beer Pong: third-party notices

Beer Pong (snippet `beer-pong`, script `pk-beer-pong.js`, kit bundles `beer-pong`) is a port of the beer pong table of
Thryrallo's UdonPrefabs to Altspace. Port source: https://github.com/sidequestlegend/UdonPrefabs (branch `altspace`,
folder `altspace/`). A copy of this file is inside every kit bundle (`Assets/Kit/THIRD-PARTY-NOTICES.md`).

## UdonPrefabs: code and prefab

- Source: https://github.com/Thryrallo/UdonPrefabs (commit `bd0b6ab`), folder `_Internal/BeerPong/`, `BeerPong.prefab`
  and the shared scripts it needs (`_Internal/UI/`, `_Internal/_Scripts/`).
- Author: Thryrallo. Licence: MIT (below). The README asks for a credit; it is on every panel's Credits tab.
- What of it is here: the gameplay scripts translated to TypeScript (`altspace/ts/src/`, bundled into
  `pk-beer-pong.js`), and the prefab, its materials, animations and physics materials in the kit. Changes are listed in
  `altspace/PORT.md` (sections 0 and 10).

```
MIT License

Copyright (c) 2022 Thryrallo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Table and cup art

- Models `table.dae`, `glass.dae` and the wood and glass textures, by **TsunaMoo** (Tsuna; https://tsunamoo.booth.pm/,
  https://tsuna.dev/), in the same repository. They have no licence of their own: they are covered by the repository's
  MIT licence above by inclusion, and the README asks for a credit to Tsuna, which is kept (the Credits tab, the
  snippet's description, this file).
- Changed for this port: materials remade for the Universal Render Pipeline; Android textures at most 1024 px.

## Sounds (replacements; upstream's came through converter sites and have no known source)

| File in the kit | Replaces | Source | Licence |
|---|---|---|---|
| `Assets/Kit/Sounds/bp_table.ogg` | `sounds/collide 1.mp3` | `impactWood_light_000.ogg`, Kenney "Impact Sounds" 1.0, https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `Assets/Kit/Sounds/bp_glass.ogg` | `sounds/pling (3).mp3` | `impactGlass_light_000.ogg`, the same pack | CC0 1.0 |
| `Assets/Kit/Sounds/bp_splash.ogg` | `sounds/splonk.mp3` | `water_splash-03.flac` of "6 Short water splashes" by ezwa (submitted by qubodup), https://opengameart.org/content/6-short-water-splashes, made from pdsounds.org recordings; converted to Ogg Vorbis | CC0 1.0 |
| `Assets/Kit/Sounds/bp_click.ogg` | `_Internal/SwipeMenu/Sounds/click.mp3` | `click_001.ogg`, Kenney "Interface Sounds", https://kenney.nl/assets/interface-sounds | CC0 1.0 |

Each licence was read on the download page and in the pack's own `License.txt` / `info.txt` on 2026-11-24.

Not shipped: the two flag images of the language menu (unknown origin; the menu is not ported).

## Font: Dosis

`_Internal/_Assets/Dosis-VariableFont_wght.ttf`, drawn here as a TextMesh Pro font asset (`Assets/Kit/Fonts/Dosis SDF.asset`).

```
Copyright (c) 2011, Edgar Tolentino and Pablo Impallari (www.impallari.com|impallari@gmail.com),
Copyright (c) 2011, Igino Marini. (www.ikern.com|mail@iginomarini.com),
with Reserved Font Names "Dosis".

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Other

- Liberation Sans SDF (TextMesh Pro's essentials), SIL Open Font License 1.1.
- The portkit runtime inside the script: MIT, AltspaceGames.
