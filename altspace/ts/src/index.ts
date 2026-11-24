// beer-pong: the beer pong table of Thryrallo/UdonPrefabs (`_Internal/BeerPong`, MIT) on the portkit runtime.
// The classes bindings.json names by `type`; the build bundles this with bindings.json into pk-beer-pong.js.

import type { GameDefinition } from "../portkit/src/index.ts";
import { Ball } from "./Ball.ts";
import { CupsManager } from "./CupsManager.ts";
import { Game } from "./Game.ts";
import { Player } from "./Player.ts";
import { PlayerScoreAnnouncement } from "./PlayerScoreAnnouncement.ts";
import { SimpleUIInteract } from "./SimpleUIInteract.ts";
import { SimpleUIOptionSelector } from "./SimpleUIOptionSelector.ts";
import { SimpleUISlider } from "./SimpleUISlider.ts";
import { SimpleUIToggle } from "./SimpleUIToggle.ts";
import { SimpleUIToggleGroup } from "./SimpleUIToggleGroup.ts";

const game: GameDefinition = {
  slug: "beer-pong",
  behaviours: {
    Game,
    Player,
    CupsManager,
    Ball,
    PlayerScoreAnnouncement,
    SimpleUIToggle,
    SimpleUISlider,
    SimpleUIOptionSelector,
    SimpleUIInteract,
    SimpleUIToggleGroup,
  },
};

export default game;
