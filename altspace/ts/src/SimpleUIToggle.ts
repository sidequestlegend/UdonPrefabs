// _Internal/UI/SimpleUIToggle.cs (Thryrallo/UdonPrefabs, MIT). The behaviour sits on the Toggle's object.

import { SimpleUIInput } from "./SimpleUIInput.ts";

export class SimpleUIToggle extends SimpleUIInput {
  /** The Toggle's isOn, as last set or reported. */
  private _isOn = false;

  protected override get VariableType(): "bool" {
    return "bool";
  }

  protected override Init(): void {}

  protected override get UIValue(): unknown {
    return this._isOn;
  }
  protected override set UIValue(value: unknown) {
    // _toggle.SetIsOnWithoutNotify((bool)value)
    this._isOn = value === true;
    this.Host.uiSetToggle(this.gameObject.key, this._isOn);
  }

  /** Toggle.onValueChanged -> Execute (bindings: uiToggle on this object). */
  OnValueChanged(isOn: boolean): void {
    this._isOn = isOn === true;
    // the control already shows it: telling the host keeps its last-sent value true (a later set back is sent)
    this.Host.uiSetToggle(this.gameObject.key, this._isOn);
    this.Execute();
  }
}
