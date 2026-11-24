// Port helper (no upstream file): the UnityEngine members beer pong uses that portkit's values.ts does not have.
// Listed in PORT.md as a runtime gap ("Vector3.Angle / Reflect, Quaternion.Angle, LookRotation, Unity's Random").

import { Mathf, Quaternion, Vector3 } from "../portkit/src/index.ts";

/** Vector3.Angle: unsigned degrees between two vectors (0 when either is near zero). */
export function Angle(from: Vector3, to: Vector3): number {
  const denominator = Math.sqrt(from.sqrMagnitude * to.sqrMagnitude);
  if (denominator < 1e-15) return 0;
  const dot = Mathf.Clamp(Vector3.Dot(from, to) / denominator, -1, 1);
  return Math.acos(dot) * Mathf.Rad2Deg;
}

/** Vector3.Reflect: `direction` reflected off the plane with normal `normal`. */
export function Reflect(direction: Vector3, normal: Vector3): Vector3 {
  const factor = -2 * Vector3.Dot(normal, direction);
  return new Vector3(factor * normal.x + direction.x, factor * normal.y + direction.y, factor * normal.z + direction.z);
}

/** Quaternion.Angle in degrees. */
export function QuaternionAngle(a: Quaternion, b: Quaternion): number {
  const dot = Math.min(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w), 1);
  return dot > 1 - 1e-6 ? 0 : Math.acos(dot) * 2 * Mathf.Rad2Deg;
}

/** Quaternion.LookRotation with up = Vector3.up: only the yaw and pitch of `forward`. */
export function LookRotation(forward: Vector3): Quaternion {
  const f = forward.normalized;
  if (f.sqrMagnitude === 0) return Quaternion.identity;
  const yaw = Math.atan2(f.x, f.z) * Mathf.Rad2Deg;
  const pitch = -Math.asin(Mathf.Clamp(f.y, -1, 1)) * Mathf.Rad2Deg;
  return Quaternion.Euler(pitch, yaw, 0);
}

/** C#'s `(int)x` for a float: truncation toward zero; NaN and infinities become int.MinValue as on x86/x64. */
export function CastInt(value: number): number {
  if (!Number.isFinite(value)) return -2147483648;
  return Math.trunc(value);
}

/** C#'s `%` on ints: the sign follows the dividend (as JavaScript's). */
export function Mod(a: number, b: number): number {
  return a % b;
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

/**
 * UnityEngine.Random's generator (xorshift128, seeded as Unity seeds it), so that King of the Hill cup colours,
 * which upstream draws after `Random.InitState(gridIndex)` (Cup.cs:36-37), come out the same on every client.
 * The algorithm is the one widely documented for Unity 5.4 and later; it has not been compared with Unity itself
 * in this job (no Unity), only made deterministic.
 */
export class UnityRandom {
  private x = 0;
  private y = 0;
  private z = 0;
  private w = 0;

  constructor(seed = 0) {
    this.InitState(seed);
  }

  InitState(seed: number): void {
    this.x = seed >>> 0;
    this.y = (Math.imul(this.x, 1812433253) + 1) >>> 0;
    this.z = (Math.imul(this.y, 1812433253) + 1) >>> 0;
    this.w = (Math.imul(this.z, 1812433253) + 1) >>> 0;
  }

  private next(): number {
    const t = (this.x ^ (this.x << 11)) >>> 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = (this.w ^ (this.w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return this.w;
  }

  /** Random.value: a float in [0, 1], both ends included. */
  get value(): number {
    return (this.next() & 0x7fffff) / 8388607;
  }
}
