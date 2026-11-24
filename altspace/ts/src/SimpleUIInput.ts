// _Internal/UI/SimpleUIInput.cs (Thryrallo/UdonPrefabs, MIT), the runtime part (lines 23-182).
//
// Upstream sets a few things in editor post-processes that the prefab relies on: `UdonBehaviours` for inputs that
// name a script type (singletons), `LinkedInputs` (lines 431-445) and `_clickSound`. Here `UdonBehaviours` comes from
// bindings.json and `LinkedInputs` is worked out on first use with the same rule. The click sound and its haptic
// pulse are left out (PORT.md item 93).
//
// A uGUI control's value reaches the page through the relay graph (`uiToggle` / `uiSlider`, bound in bindings.json
// to OnValueChanged); the page sets a control with the kit's ops `uiSetToggle` / `uiSetSlider` (SetIsOnWithoutNotify,
// SetValueWithoutNotify: nothing comes back).

import { Behaviour, type AnimatorRef, type BehaviourClass } from "../portkit/src/index.ts";
import type { SimpleUISetterExtension } from "./SimpleUISetterExtension.ts";

/** The bindings types of every SimpleUIInput subclass, for the editor-time searches done at run time. */
export const SIMPLE_UI_TYPES = ["SimpleUIToggle", "SimpleUISlider", "SimpleUIOptionSelector", "SimpleUIInteract", "SimpleUIToggleGroup"];

type ValueType = "bool" | "int" | "float" | null;

/** UdonBehaviour.GetProgramVariable */
export function GetProgramVariable(target: Behaviour, name: string): unknown {
  return (target as unknown as Record<string, unknown>)[name];
}

/**
 * UdonBehaviour.SetProgramVariable. On a field with a [FieldChangeCallback] it goes through the property, as
 * UdonSharp does, when the value differs. `localChangeCallbacks` names the callbacks of fields that are not synced.
 */
export function SetProgramVariable(target: Behaviour, name: string, value: unknown): void {
  const cls = target.constructor as BehaviourClass & { localChangeCallbacks?: Readonly<Record<string, string>> };
  const property = cls.fieldChangeCallbacks?.[name] ?? cls.localChangeCallbacks?.[name];
  const bag = target as unknown as Record<string, unknown>;
  if (property === undefined) {
    bag[name] = value;
    return;
  }
  if (bag[name] === value) return;
  bag[property] = value;
}

function typeOf(value: unknown): ValueType {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return null;
}

export abstract class SimpleUIInput extends Behaviour {
  /** Nothing here is run by another client: a networked control writes synced state (SimpleUIInput.cs:127-160). */
  static override networkCallable: readonly string[] = [];
  // user configured (bindings.json)
  UdonBehaviours: Behaviour[] = [];
  VariableName = "";
  NetworkVariable = false;
  EventName = "";
  /** The control's own Animator, when it has one ("isOn" for toggles). */
  animator: AnimatorRef | null = null;

  private _linkedInputs: SimpleUIInput[] | null = null;
  private _isUdonTargetAvailable = false;
  private _isVariableTargetAvailable = false;
  private _isEventTargetAvailable = false;
  private _isInit = false;
  protected _vibrationFeedback = true;
  protected _supressExecutes = false;

  protected abstract get VariableType(): ValueType;
  protected abstract Init(): void;
  protected abstract get UIValue(): unknown;
  protected abstract set UIValue(value: unknown);

  /** SimpleUIInput.cs:431-445 (editor post-process), done on first use. */
  get LinkedInputs(): SimpleUIInput[] {
    if (this._linkedInputs) return this._linkedInputs;
    const all: SimpleUIInput[] = [];
    for (const type of SIMPLE_UI_TYPES) all.push(...this.FindBehavioursOfType<SimpleUIInput>(type));
    this._linkedInputs =
      this.UdonBehaviours.length > 0
        ? all.filter((s) => s !== this && s.VariableName === this.VariableName && s.UdonBehaviours.length > 0 && s.UdonBehaviours[0] === this.UdonBehaviours[0])
        : [];
    return this._linkedInputs;
  }

  /** SimpleUIInput.cs:54-75 */
  private InternalInit(updateOptionals: boolean): void {
    if (this._isInit) return;
    this._isInit = true;
    // FillAfterAutoReference (editor, :78-88)
    this.UdonBehaviours = this.UdonBehaviours.filter((u) => u !== null && u !== undefined);
    this._isUdonTargetAvailable = this.UdonBehaviours.length > 0;
    this._isEventTargetAvailable = this._isUdonTargetAvailable && !!this.EventName;

    this.Init();
    this.FillVariableReference();

    let changed = false;
    if (this._isVariableTargetAvailable) {
      const target = GetProgramVariable(this.UdonBehaviours[0]!, this.VariableName);
      changed = this.UIValue !== target;
      this.UIValue = target;
    }
    if (updateOptionals) this.UpdateOptionals(false, changed);
  }

  /** SimpleUIInput.cs:90-102. An int-valued float field (0.0) reads as "int" in JavaScript, so float takes both. */
  private FillVariableReference(): void {
    if (!this._isUdonTargetAvailable || !this.VariableName) return;
    const value = GetProgramVariable(this.UdonBehaviours[0]!, this.VariableName);
    const type = typeOf(value);
    if (type === null) return;
    const wanted = this.VariableType;
    this._isVariableTargetAvailable = type === wanted || (wanted === "float" && type === "int");
  }

  /** OnEnable at start (:104-109). */
  override Start(): void {
    if (this._isInit) this.UpdateOptionals(false, false);
    else this.InternalInit(true);
  }

  /** SimpleUIInput.cs:111-116 */
  SetValue(value: unknown): void {
    this.InternalInit(false);
    this.UIValue = value;
    this.UpdateOptionals(false, true);
  }

  /** SimpleUIInput.cs:118-125 */
  private SyncValueToOtherUIS(): void {
    const value = this.UIValue;
    for (const input of this.LinkedInputs) input.SetValue(value);
  }

  /** SimpleUIInput.cs:127-160 */
  Execute(): void {
    if (this._supressExecutes) return;
    this.InternalInit(false);

    if (this._isVariableTargetAvailable) {
      if (GetProgramVariable(this.UdonBehaviours[0]!, this.VariableName) === this.UIValue) return;

      this.SyncValueToOtherUIS();

      for (const b of this.UdonBehaviours) {
        if (this.NetworkVariable) this.Networking.SetOwner(this.Networking.LocalPlayer, b);
        const extension = b as SimpleUISetterExtension;
        extension.SimpleUI_BlockVariableChanged = true;
        SetProgramVariable(b, this.VariableName, this.UIValue);
        extension.SimpleUI_BlockVariableChanged = false;
        if (this.NetworkVariable) b.RequestSerialization();
      }
    }

    this.UpdateOptionals(true, true);
    // PlayClick(): left out (item 93).

    if (this._isEventTargetAvailable) for (const b of this.UdonBehaviours) b.SendCustomEvent(this.EventName);
  }

  /** SimpleUIInput.cs:162-174 */
  protected UpdateOptionals(_wasUserInput: boolean, _valueChanged: boolean): void {
    if (this.animator && this.VariableType === "bool") this.animator.SetBool("isOn", this.UIValue === true);
  }
}
