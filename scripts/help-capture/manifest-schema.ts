import { z } from 'zod';

/**
 * One manifest per article: scripts/help-capture/manifests/<category>/<slug>.json
 * Re-running `pnpm help:capture <category>/<slug>` reproduces every asset.
 */
export const captureActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), selector: z.string() }),
  z.object({ type: z.literal('fill'), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal('waitFor'), selector: z.string() }),
  z.object({ type: z.literal('wait'), ms: z.number().int().positive().max(10_000) }),
  z.object({ type: z.literal('scrollTo'), selector: z.string() }),
]);

export const captureShotSchema = z.object({
  /** Output name without extension; written as <name>.webp (+ @2x). */
  name: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['still', 'clip']),
  route: z.string().startsWith('/'),
  /** /dev/agent-login role, e.g. "cam", "owner", "board_president". */
  role: z.string().min(1),
  actions: z.array(captureActionSchema).default([]),
  /** Optional CSS selector to clip the screenshot to (stills only). */
  clipTo: z.string().optional(),
  /** Clip duration in ms (clips only, max 8s — budget is 1.5MB). */
  durationMs: z.number().int().positive().max(8_000).optional(),
});

export const captureManifestSchema = z.object({
  category: z.string().min(1),
  slug: z.string().min(1),
  viewport: z
    .object({ width: z.number().int(), height: z.number().int() })
    .default({ width: 1440, height: 900 }),
  shots: z.array(captureShotSchema).min(1),
});

export type CaptureManifest = z.infer<typeof captureManifestSchema>;
export type CaptureShot = z.infer<typeof captureShotSchema>;
