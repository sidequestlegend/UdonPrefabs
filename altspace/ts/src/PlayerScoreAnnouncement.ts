// _Internal/BeerPong/scripts/PlayerScoreAnnouncement.cs (Thryrallo/UdonPrefabs, MIT): the points popup over a rack.

import { Behaviour, type AnimatorRef, type TextRef } from "../portkit/src/index.ts";
import type { Player } from "./Player.ts";
import { FormatD4, FormatF0 } from "./Unity.ts";

export class PlayerScoreAnnouncement extends Behaviour {
  // bindings.json
  _animator: AnimatorRef | null = null;
  _textScore: TextRef | null = null;
  _textSkill: TextRef | null = null;
  _player!: Player;

  private _lastScore = -1;

  /** PlayerScoreAnnouncement.cs:20-32 */
  ShowScore(score: number): void {
    if (score === this._lastScore) return;
    this._lastScore = score;

    const s = FormatD4(score);
    if (this._textScore) this._textScore.text = s;
    const skill = this._player.LastAimAssistStrength * 100;
    if (this._textSkill) this._textSkill.text = FormatF0(skill) + "%";
    this._animator?.SetTrigger("show");
  }

  /** :34-37 */
  ResetScore(): void {
    this._lastScore = -1;
  }
}
