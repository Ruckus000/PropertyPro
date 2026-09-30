import { z } from 'zod';

/**
 * One manifest per article:
 *   scripts/help-capture/manifests/<section>/<category>/<slug>.json
 * Re-running `pnpm help:capture <section>/<category>/<slug>` reproduces every
 * asset into apps/web/public/help/<section>/<category>/<slug>/ and records
 * each still in apps/web/src/content/help/media-index.json, which is what
 * lets `<Step shot="…">` / `<Figure shot="…">` render it.
 */
export const captureActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), selector: z.string() }),
  z.object({ type: z.literal('fill'), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal('waitFor'), selector: z.string() }),
  z.object({ type: z.literal('wait'), ms: z.number().int().positive().max(10_000) }),
  z.object({ type: z.literal('scrollTo'), selector: z.string() }),
  z.object({ type: z.literal('press'), key: z.string() }),
]);

/** Seeded demo communities (scripts/config/demo-data.ts), by type. */
export const CAPTURE_COMMUNITIES = {
  condo: 'sunset-condos',
  hoa: 'palm-shores-hoa',
  apartment: 'sunset-ridge-apartments',
} as const;

export const captureShotSchema = z.object({
  /** Output name without extension; the `shot` name the article uses. */
  name: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['still', 'clip']),
  /** App route. `{cid}` is replaced with the seeded community's id. */
  route: z.string().startsWith('/'),
  /** /dev/agent-login role, e.g. "cam", "owner", "board_member", "site_manager". */
  role: z.string().min(1),
  /** Which seeded community `{cid}` resolves to. */
  community: z.enum(['condo', 'hoa', 'apartment']).default('condo'),
  actions: z.array(captureActionSchema).default([]),
  /**
   * Playwright selector(s) (CSS, `text=`, `role=`, …) the still is cropped to:
   * the union of their boxes plus `pad`. Omit for the whole viewport.
   */
  clipTo: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
  /** Crop padding in CSS px around `clipTo`. */
  pad: z.number().int().nonnegative().max(200).default(16),
  /** Control to outline in the brand colour (the design's step callout). */
  highlight: z.string().optional(),
  /** Step number drawn on the highlight's corner. Needs `highlight`. */
  step: z.number().int().positive().optional(),
  /** Clip duration in ms (clips only, max 8s — budget is 1.5MB). */
  durationMs: z.number().int().positive().max(8_000).optional(),
});

export const captureManifestSchema = z.object({
  section: z.enum(['resident', 'manager']),
  category: z.string().min(1),
  slug: z.string().min(1),
  viewport: z
    .object({ width: z.number().int(), height: z.number().int() })
    .default({ width: 1440, height: 900 }),
  shots: z.array(captureShotSchema).min(1),
});

export type CaptureManifest = z.infer<typeof captureManifestSchema>;
export type CaptureShot = z.infer<typeof captureShotSchema>;
