import type { BlockVariant } from '@propertypro/shared';

/**
 * Layout variants for the authored blocks, as container widths.
 *
 * Two scales because the blocks start from different natural widths: prose
 * wants a measure of roughly 65-75 characters, while a grid of cards or a
 * full-bleed image wants more. Sharing one table would make `wide` mean
 * different things depending on which block you were looking at.
 *
 * `standard` is exactly what each block rendered before `variant` existed, and
 * an absent variant resolves to it — so this is additive for every stored row
 * and needs no backfill.
 *
 * Kept as complete literal class strings rather than interpolated fragments:
 * Tailwind scans source text, so `max-w-${x}` would emit no CSS at all.
 */
const WIDTHS: Record<'prose' | 'grid', Record<BlockVariant, string>> = {
  prose: { compact: 'max-w-xl', standard: 'max-w-3xl', wide: 'max-w-5xl' },
  grid: { compact: 'max-w-2xl', standard: 'max-w-4xl', wide: 'max-w-6xl' },
};

export function variantWidth(
  scale: 'prose' | 'grid',
  variant: BlockVariant | undefined,
): string {
  return WIDTHS[scale][variant ?? 'standard'];
}
