/**
 * <MediaFrame/> — the single renderer for help article media (hero, steps,
 * authored screenshots/clips). Renders in TWO pipelines:
 *
 *  1. Modal: serialize → renderToStaticMarkup → sanitizeHelpHtml →
 *     dangerouslySetInnerHTML. Static, inert markup; the delegation
 *     enhancer in HelpArticleBody provides all interactivity via the
 *     data-zoomable / data-media-kind / data-media-play hooks.
 *  2. Route pages: compileMDX live render (same markup, also inert).
 *
 * HARD CONSTRAINTS (pinned by sanitize-help-html.test.ts):
 *  - No inline styles: the sanitizer strips `style`. Aspect ratio comes
 *    from width/height attributes (native intrinsic-size behavior).
 *  - No `autoplay` attribute: playback is owned by the enhancer so
 *    prefers-reduced-motion users never see motion (no pre-JS flash).
 *  - No next/image: unexercised under renderToStaticMarkup, and it would
 *    bake /_next/image URLs into long-lived cached HTML.
 *  - No hooks/handlers: the static pipeline drops them silently.
 */
import { Play } from 'lucide-react';

const CLIP_EXTENSIONS = /\.(mp4|webm)$/i;

export type MediaKind = 'image' | 'clip';

export function mediaKindFromSrc(src: string): MediaKind {
  return CLIP_EXTENSIONS.test(src) ? 'clip' : 'image';
}

export interface MediaFrameProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  /** Optional retina source; emitted as `srcset="src 1x, src2x 2x"`. */
  src2x?: string;
  /** Required for clips: still frame shown before playback starts. */
  poster?: string;
}

export function MediaFrame({ src, alt, width, height, caption, src2x, poster }: MediaFrameProps) {
  const kind = mediaKindFromSrc(src);

  return (
    <figure className="my-6" data-media-frame>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge">
        <div className="flex items-center gap-1.5 border-b border-edge-subtle bg-surface-muted px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" aria-hidden="true" />
          <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" aria-hidden="true" />
          <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" aria-hidden="true" />
          {kind === 'clip' && (
            <span className="ml-auto text-xs font-medium tracking-wide text-content-tertiary">
              GIF
            </span>
          )}
        </div>
        {kind === 'clip' ? (
          <span className="relative block">
            <video
              muted
              loop
              playsInline
              preload="metadata"
              poster={poster}
              width={width}
              height={height}
              data-zoomable
              data-media-kind="clip"
              data-media-alt={alt}
              className="block h-auto w-full"
              aria-label={alt}
            >
              <source src={src} type={src.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
            </video>
            <button
              type="button"
              data-media-play
              aria-label={`Play: ${alt}`}
              className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-surface-card text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Play size={20} aria-hidden="true" />
            </button>
          </span>
        ) : (
          <img
            src={src}
            srcSet={src2x ? `${src} 1x, ${src2x} 2x` : undefined}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            data-zoomable
            data-media-kind="image"
            className="block h-auto w-full"
          />
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-content-tertiary">{caption}</figcaption>
      )}
    </figure>
  );
}
