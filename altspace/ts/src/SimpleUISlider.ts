// _Internal/UI/SimpleUISlider.cs (Thryrallo/UdonPrefabs, MIT). The behaviour sits on the Slider's object.

import type { TextRef } from "../portkit/src/index.ts";
import { RememberValueOp, SendValueOp } from "./PortOps.ts";
import { SimpleUIInput } from "./SimpleUIInput.ts";

export class SimpleUISlider extends SimpleUIInput {
  Handle: TextRef | null = null;
  HandlePrefix = "";
  HandlePostfix = "";
  /** Slider.wholeNumbers (bindings.json, from the prefab). */
  wholeNumbers = false;
  /**
   * The value a "Reset" button next to the slider puts back. Upstream wires that button straight to
   * `Slider.set_value(1)` (prefab `Main/Visual/Size/Reset`); here the button calls ResetValue().
   */
  resetValue = 1;

  /** Slider.value, as last set or reported. */
  private _value = 0;

  protected override get VariableType(): "int" | "float" {
    return this.wholeNumbers ? "int" : "float";
  }

  protected override Init(): void {
    this._vibrationFeedback = false;
  }

  protected override get UIValue(): unknown {
    return this.wholeNumbers ? Math.trunc(this._value) : this._value;
  }
  protected override set UIValue(value: unknown) {
    // _slider.SetValueWithoutNotify((float)value)
    this._value = Number(value);
    SendValueOp(this.Host, "uiSetSlider", this.gameObject.key, [this._value]);
  }

  /** SimpleUISlider.cs:84-91 */
  protected override UpdateOptionals(wasUserInput: boolean, valueChanged: boolean): void {
    super.UpdateOptionals(wasUserInput, valueChanged);
    if (this.Handle && valueChanged) this.Handle.text = this.HandlePrefix + String(this._value) + this.HandlePostfix;
  }

  /** Slider.onValueChanged -> Execute (bindings: uiSlider on this object). */
  OnValueChanged(value: number): void {
    this._value = Number(value);
    RememberValueOp(this.Host, "uiSetSlider", this.gameObject.key, [this._value]);
    this.Execute();
  }

  /** The Reset button: Slider.set_value(resetValue), which raises onValueChanged. */
  ResetValue(): void {
    this.UIValue = this.resetValue;
    this.Execute();
  }
}
