/**
 * Captured help screenshots, keyed `<section>/<category>/<slug>/<name>` →
 * [width, height, capture date] of the 1x file. Written by `pnpm help:capture` (never by
 * hand), so an article can name a shot before it has been captured: an
 * uncaptured shot renders nothing rather than a broken image.
 *
 * Files: /help/<section>/<category>/<slug>/<name>.webp and <name>@2x.webp
 * under apps/web/public.
 */
import mediaIndex from '@/content/help/media-index.json';

export interface HelpShot {
  src: string;
  src2x: string;
  width: number;
  height: number;
}

export type MediaIndexEntry = readonly [width: number, height: number, capturedOn?: string];

const INDEX = mediaIndex as unknown as Readonly<Record<string, MediaIndexEntry>>;

/** `base` is `<section>/<category>/<slug>`. */
export function resolveHelpShot(base: string, name: string): HelpShot | null {
  const size = INDEX[`${base}/${name}`];
  if (!size) return null;
  return {
    src: `/help/${base}/${name}.webp`,
    src2x: `/help/${base}/${name}@2x.webp`,
    width: size[0],
    height: size[1],
  };
}

export function listCapturedShots(): string[] {
  return Object.keys(INDEX);
}
