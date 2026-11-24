// Port helper (no upstream script): what a uGUI Toggle's UnityEvent did in the prefab, `GameObject.SetActive(bool)` on
// another object (the panel's Volume toggle opens its slider, PORT.md 5.4). The kit carries no UnityEvent calls, so the
// page does it. Local to the clicking player, as upstream.

import { Behaviour, type GameObject } from "../portkit/src/index.ts";

export class ToggleActive extends Behaviour {
  static override networkCallable: readonly string[] = [];
  /** The object the toggle shows and hides. */
  Target: GameObject | null = null;

  override Start(): void {
    this.Target?.SetActive(false);
  }

  /** Toggle.onValueChanged (bindings: uiToggle on the toggle's object). */
  OnValueChanged(isOn: boolean): void {
    this.Target?.SetActive(isOn === true);
  }
}
