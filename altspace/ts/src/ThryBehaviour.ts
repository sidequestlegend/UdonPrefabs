// _Internal/_Scripts/ThryBehaviour.cs, _Scripts/Logging.cs and the one helper beer pong uses from _Scripts/Helpers.cs
// (Collections.Duplicate, line 140). Upstream: Thryrallo/UdonPrefabs, MIT.

import { Behaviour } from "../portkit/src/index.ts";

/** ThryBehaviour.cs:6-12 */
export const LogLevel = { Error: 0, Warning: 1, Log: 2, Vervose: 3 } as const;
export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

/** ThryBehaviour.cs:14-29 */
export abstract class ThryBehaviour extends Behaviour {
  protected abstract get LogPrefix(): string;
  /** [SerializeField] LogMinLevel, default Warning (the prefab's Game has 1). */
  LogMinLevel: number = LogLevel.Warning;

  protected Log(level: LogLevelValue, message: string): void {
    if (level > this.LogMinLevel) return;
    const line = `[${this.LogPrefix}] ${message}`;
    if (level === LogLevel.Warning) this.Debug.LogWarning(line);
    else if (level === LogLevel.Error) this.Debug.LogError(line);
    else this.Debug.Log(line);
  }
}

/** Helpers.cs: Collections.Duplicate. */
export const Collections = {
  Duplicate<T>(array: readonly T[]): T[] {
    return array.slice();
  },
};
