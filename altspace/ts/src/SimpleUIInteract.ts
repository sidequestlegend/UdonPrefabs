// _Internal/UI/SimpleUIInteract.cs (Thryrallo/UdonPrefabs, MIT): a collider on the UI layer whose click runs the
// input's event ("Open Settings" on the table edge: Player.ToggleSettings). Upstream's interaction reach is 1 m.

import { SimpleUIInput } from "./SimpleUIInput.ts";

export class SimpleUIInteract extends SimpleUIInput {
  static override interactReach = 1;
  private _value: unknown = null;

  protected override get VariableType(): null {
    return null;
  }

  protected override get UIValue(): unknown {
    return this._value;
  }
  protected override set UIValue(value: unknown) {
    this._value = value;
  }

  protected override Init(): void {}

  override Interact(): void {
    this.Execute();
  }
}
