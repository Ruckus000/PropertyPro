/**
 * A look preview: the real site, with the association's own content, as it
 * would be after choosing a look (D8). It is an iframe of the signed-in
 * `/pm/site-preview` route with `look=<id>`, which plans the switch without
 * writing anything. `preview=true` is what lets middleware relax the frame
 * headers for same-origin framing (the wizard's live preview set this up first).
 *
 * The frame is a picture, not a page to use: it is `inert`, hidden from
 * assistive tech and out of the tab order, so a keyboard or screen-reader user
 * meets each look once, as the card's button, and never the links inside the
 * preview. It loads lazily, so cards below the fold cost nothing until seen.
 *
 * `scale` shrinks the full-size page into a thumbnail: the iframe keeps its real
 * width (so the layout lays out as it would on that screen) and is scaled down
 * from its top-left corner inside a box of the scaled size.
 */
import type { LookId } from '@/lib/site-looks/looks';
import { cn } from '@/lib/utils';

/** The preview of choosing `lookId`; null previews the site as it is (draft over live). */
export function lookPreviewUrl(communityId: number, lookId: LookId | null): string {
  const qs = new URLSearchParams({ communityId: String(communityId) });
  if (lookId) qs.set('look', lookId);
  qs.set('preview', 'true');
  return `/pm/site-preview?${qs.toString()}`;
}

interface LookPreviewFrameProps {
  communityId: number;
  lookId: LookId | null;
  /** Names the frame for anyone who inspects it; it is hidden from assistive tech. */
  title: string;
  /** The page's own width and height, in CSS pixels, before scaling. */
  width: number;
  height: number;
  scale?: number;
  className?: string;
}

export function LookPreviewFrame({
  communityId,
  lookId,
  title,
  width,
  height,
  scale = 1,
  className,
}: LookPreviewFrameProps) {
  const src = lookPreviewUrl(communityId, lookId);
  return (
    <div
      className={cn('overflow-hidden bg-surface-card', className)}
      style={{ width: width * scale, height: height * scale }}
    >
      <iframe
        // A new look is a new page: remount rather than navigate the frame.
        key={src}
        src={src}
        title={title}
        inert
        aria-hidden="true"
        tabIndex={-1}
        loading="lazy"
        data-testid="look-preview-frame"
        className="origin-top-left border-0 bg-surface-card"
        style={{ width, height, transform: scale === 1 ? undefined : `scale(${scale})` }}
      />
    </div>
  );
}
