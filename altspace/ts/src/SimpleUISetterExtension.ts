// _Internal/UI/SimpleUISetterExtension.cs (Thryrallo/UdonPrefabs, MIT).
//
// Upstream fills `_simpleUIReferences` and `_otherExtensions` in an editor post-process (lines 40-58). Here they are
// worked out the same way on first use, from the inputs in bindings.json, so the kit builder does not have to.

import type { SimpleUIInput } from "./SimpleUIInput.ts";
import { GetProgramVariable, SetProgramVariable, SIMPLE_UI_TYPES } from "./SimpleUIInput.ts";
import { ThryBehaviour } from "./ThryBehaviour.ts";

export abstract class SimpleUISetterExtension extends ThryBehaviour {
  private _simpleUIReferences: SimpleUIInput[] | null = null;
  private _otherExtensions: SimpleUISetterExtension[] | null = null;

  SimpleUI_BlockVariableChanged = false;

  /** SimpleUISetterExtension.cs:44-55: the inputs whose first target is this behaviour, ordered by name. */
  private References(): SimpleUIInput[] {
    if (this._simpleUIReferences) return this._simpleUIReferences;
    const all: SimpleUIInput[] = [];
    for (const type of SIMPLE_UI_TYPES) all.push(...this.FindBehavioursOfType<SimpleUIInput>(type));
    this._simpleUIReferences = all.filter((s) => s.UdonBehaviours.indexOf(this) >= 0).sort((a, b) => (a.gameObject.name < b.gameObject.name ? -1 : a.gameObject.name > b.gameObject.name ? 1 : 0));
    // Other behaviours of the same type that the same inputs target. Upstream's query also returns this behaviour
    // itself, which only re-assigns the value it already holds; it is left out here.
    const others = new Set<SimpleUISetterExtension>();
    for (const input of this._simpleUIReferences) {
      for (const target of input.UdonBehaviours) {
        if (target !== this && target && target.constructor === this.constructor) others.add(target as SimpleUISetterExtension);
      }
    }
    this._otherExtensions = [...others];
    return this._simpleUIReferences;
  }

  /** SimpleUISetterExtension.cs:21-38 */
  protected VariableChangedFromBehaviour(varialbeName: string): void {
    if (this.SimpleUI_BlockVariableChanged) return;
    const val = GetProgramVariable(this, varialbeName);
    for (const script of this.References()) {
      if (script.VariableName === varialbeName) script.SetValue(val);
    }
    for (const extension of this._otherExtensions ?? []) {
      extension.SimpleUI_BlockVariableChanged = true;
      SetProgramVariable(extension, varialbeName, val);
      extension.SimpleUI_BlockVariableChanged = false;
    }
  }
}
