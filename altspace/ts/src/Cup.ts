// _Internal/BeerPong/scripts/Cup.cs (Thryrallo/UdonPrefabs, MIT).
//
// Upstream a Cup is an UdonBehaviour on each instantiated copy of the `[ThryBP]glass` template. Here a cup copy is a
// plain object the CupsManager keeps; the Unity copy is made, moved, coloured and destroyed with the game op `cup`
// (spawn / despawn and the game op `cupPlace`, PortOps.ts). The template's measurements (InitPrefab, Cup.cs:90-108) come from bindings.json, where the kit
// builder writes the renderer bounds it measured.

import { Color, Quaternion, UnityRandom, Vector3 } from "../portkit/src/index.ts";
import type { CupsManager } from "./CupsManager.ts";
import type { Player } from "./Player.ts";

/** What the kit builder measures on the template (Glass_LOD0 renderer bounds with the cup unrotated). */
export interface CupTemplate {
  /** Renderer bounds extents in world units, as Unity reports them on the template in the prefab. */
  boundsExtents: Vector3;
  /** The template's lossyScale. */
  lossyScale: Vector3;
}

const unityRandom = new UnityRandom();

export class Cup {
  // [NonSerialized] public fields (Cup.cs:18-30)
  PlayerCupOwner!: Player;
  PlayerAnchorSide!: Player;
  Row = 0;
  Column = 0;
  Anchor_id = 0;
  Position_offset = Vector3.zero;
  LocalRadius = -1;
  LocalDiameter = -1;
  LocalCircumfrence = -1;
  LocalHeight = -1;

  /** The CupsManager that made this copy (upstream: the copy's parent transform and TableScaleTransform). */
  readonly manager: CupsManager;
  /** Position relative to its anchor, and uniform scale (CupsManager.InstanciateCup, :523-530). */
  localPosition = Vector3.zero;
  localScale = 1;
  /** Index in the rack grid (row * 22 + column). */
  index = 0;
  /** The colour last given, for the `cupPlace` op. */
  color = Color.white;
  /** The copy exists in the kit (spawned and not despawned since). */
  spawned = false;

  constructor(manager: CupsManager) {
    this.manager = manager;
  }

  /** The copy's name in the kit: the relay graph creates it under the anchor, and the ball graph reports it back. */
  get name(): string {
    return `[ThryBP]Cup ${this.PlayerAnchorSide.PlayerIndex} ${this.index}`;
  }

  /** Cup.cs:32-43. King of the Hill colours: Unity's generator seeded with the grid index, the same everywhere. */
  UpdateColor(index: number): void {
    if (this.PlayerCupOwner.DoRandomColor) {
      unityRandom.InitState(index);
      const r = unityRandom.value;
      const g = unityRandom.value;
      const b = unityRandom.value;
      this.SetColor(new Color(r, g, b));
    } else {
      this.SetColor(this.PlayerCupOwner.ActiveColor);
    }
  }

  /** Cup.cs:45-51: material slot 0 of the three LOD renderers (the `cup` op colours all three). */
  SetColor(c: Color): void {
    this.color = c.clone();
    this.manager.EmitCup(this, true);
  }

  // ---- where the copy is, from the table's layout (upstream reads its transform) ------------------------------

  get position(): Vector3 {
    return this.manager.CupWorldPosition(this);
  }

  get rotation(): Quaternion {
    return this.manager.AnchorWorldRotation(this.Anchor_id);
  }

  /** transform.lossyScale.x: the copy's own scale times the table's. */
  get lossyScaleX(): number {
    return this.localScale * this.manager.TableLossyScale();
  }

  /** Cup.cs:53-56: the renderer bounds, from the measured template (centre and size). */
  GetBounds(): { center: Vector3; max: Vector3 } {
    const p = this.position;
    const h = this.GlobalHeight;
    return { center: p.add(new Vector3(0, h / 2, 0)), max: p.add(new Vector3(0, h, 0)) };
  }

  /** Cup.cs:58-88 */
  get GlobalHeight(): number {
    return this.LocalHeight * this.manager.TableLossyScale();
  }
  get GlobalRadius(): number {
    return this.LocalRadius * this.manager.TableLossyScale();
  }
  get GlobalDiameter(): number {
    return this.LocalDiameter * this.manager.TableLossyScale();
  }
  get GlobalCircumfrence(): number {
    return this.LocalCircumfrence * this.manager.TableLossyScale();
  }

  /**
   * Cup.cs:90-108, on the template's measurements. The quirk is kept: "circumference" is pi times the *height*
   * (line 107); the rim spiral's speed depends on it.
   */
  InitPrefab(template: CupTemplate): void {
    const radius = (template.boundsExtents.x + template.boundsExtents.z) / 2;
    const height = template.boundsExtents.y * 2;
    this.LocalRadius = radius / template.lossyScale.x;
    this.LocalHeight = height / template.lossyScale.y;
    this.LocalDiameter = 2 * this.LocalRadius;
    this.LocalCircumfrence = Math.PI * this.LocalHeight;
  }
}
