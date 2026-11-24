// _Internal/UI/SimpleUIToggleGroup.cs (Thryrallo/UdonPrefabs, MIT): the settings panel's tab bar.
//
// Each tab Toggle reports its value through the relay graph (uiToggle) to _Toggle0 .. _Toggle5. Upstream's Toggles
// also switch their tab's content with a UnityEvent (Toggle -> GameObject.SetActive), which stays on the Unity side:
// setting a tab from here therefore sets isOn *with* notification (uiSetToggle ... |1).
//
// Change: a tab Toggle turning off is ignored. In Unity the ToggleGroup turns the old tab off before the new one on,
// so upstream briefly writes -1 ("no tab") to the synced field before the new index; here only the new index is sent.

import type { GameObject } from "../portkit/src/index.ts";
import { RememberValueOp, SendValueOp } from "./PortOps.ts";
import { SimpleUIInput } from "./SimpleUIInput.ts";

export class SimpleUIToggleGroup extends SimpleUIInput {
  Toggles: GameObject[] = [];
  private _states: boolean[] = [];

  protected override get VariableType(): "int" {
    return "int";
  }

  protected override get UIValue(): unknown {
    for (let i = 0; i < this.Toggles.length; i++) if (this._states[i]) return i;
    return -1;
  }
  protected override set UIValue(value: unknown) {
    const index = Math.trunc(Number(value));
    this._supressExecutes = true;
    for (let i = 0; i < this.Toggles.length; i++) {
      this._states[i] = i === index;
      SendValueOp(this.Host, "uiSetToggle", this.Toggles[i]!.key, [i === index ? "1" : "0", "1"]);
    }
    this._supressExecutes = false;
  }

  protected override Init(): void {
    this._states = this.Toggles.map((_, i) => i === 0);
  }

  private Clicked(index: number, isOn: boolean): void {
    if (!isOn) return;
    for (let i = 0; i < this.Toggles.length; i++) {
      this._states[i] = i === index;
      RememberValueOp(this.Host, "uiSetToggle", this.Toggles[i]!.key, [i === index ? "1" : "0", "1"]);
    }
    this.Execute();
  }

  _Toggle0(isOn: boolean): void { this.Clicked(0, isOn); }
  _Toggle1(isOn: boolean): void { this.Clicked(1, isOn); }
  _Toggle2(isOn: boolean): void { this.Clicked(2, isOn); }
  _Toggle3(isOn: boolean): void { this.Clicked(3, isOn); }
  _Toggle4(isOn: boolean): void { this.Clicked(4, isOn); }
  _Toggle5(isOn: boolean): void { this.Clicked(5, isOn); }
}
