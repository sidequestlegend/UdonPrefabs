// Port helper (no upstream file): C# semantics the translated code needs that JavaScript spells differently.
// (Vector3.Angle / Reflect, Quaternion.Angle / LookRotation and Unity's Random come from the kit's values.ts.)

/** C#'s `(int)x` for a float: truncation toward zero; NaN and infinities become int.MinValue as on x86/x64. */
export function CastInt(value: number): number {
  if (!Number.isFinite(value)) return -2147483648;
  return Math.trunc(value);
}

/** C#'s `ToString("D4")` on an int: at least four digits, minus sign in front. */
export function FormatD4(value: number): string {
  const v = Math.trunc(value);
  const digits = String(Math.abs(v)).padStart(4, "0");
  return v < 0 ? "-" + digits : digits;
}

/** C#'s `ToString("F0")` on a float: rounded half away from zero (.NET Core 3.0+ and Mono agree on this format). */
export function FormatF0(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "-∞" : "NaN";
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? "0" : String(rounded);
}
