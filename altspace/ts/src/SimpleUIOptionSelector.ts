// _Internal/UI/SimpleUIOptionSelector.cs (Thryrallo/UdonPrefabs, MIT). The Left / Right buttons call Prev / Next
// (bindings: uiButton). The options are the English column of beerpong_localization.csv (localisation not ported).

import type { TextRef } from "../portkit/src/index.ts";
import { SimpleUIInput } from "./SimpleUIInput.ts";

export class SimpleUIOptionSelector extends SimpleUIInput {
  Options: string[] = [];
  Label: TextRef | null = null;
  private _selectedOption = 0;

  protected override get VariableType(): "int" {
    return "int";
  }

  protected override get UIValue(): unknown {
    return this._selectedOption;
  }
  protected override set UIValue(value: unknown) {
    this._selectedOption = Math.trunc(Number(value));
    if (this.Label) this.Label.text = this.Options[this._selectedOption] ?? "";
  }

  protected override Init(): void {}

  /** SimpleUIOptionSelector.cs:21-26. (Networking.SetOwner on the selector itself is a no-op: it has no synced fields.) */
  Next(): void {
    this.UIValue = (this._selectedOption + 1) % this.Options.length;
    this.Execute();
  }

  /** SimpleUIOptionSelector.cs:28-33 */
  Prev(): void {
    this.UIValue = (this._selectedOption - 1 + this.Options.length) % this.Options.length;
    this.Execute();
  }
}
