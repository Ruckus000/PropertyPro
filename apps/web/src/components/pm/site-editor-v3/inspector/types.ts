/**
 * The contract every per-block inspector form implements.
 *
 * Kept in its own module so `form-registry.ts` can import the type without
 * pulling in a single form component — the registry's whole job is to make
 * those load lazily.
 */
import type { BlockType } from '@propertypro/shared';

export interface BlockFormProps {
  communityId: number;
  blockType: BlockType;
  /**
   * The section's slot. This is the form's identity.
   *
   * Note what is NOT here: `blockId`. Every write in this editor soft-deletes
   * the row and INSERTs a fresh one, so the id changes on every save. A form
   * that cannot see the id cannot key on it, cannot send it, and cannot hold a
   * stale one. The slot is stable across saves, and `useCanvasSelection`
   * re-anchors it across reorders.
   */
  blockOrder: number;
  /**
   * Raw stored content, straight from the blocks query — NOT parsed.
   *
   * Forms parse it themselves with their own schema, because the canvas
   * deliberately does not (see `CanvasBlock`): content that fails its schema
   * still has to be editable, or a PM whose block went invalid has no way to
   * fix it from the UI that owns it.
   */
  content: unknown;
}
