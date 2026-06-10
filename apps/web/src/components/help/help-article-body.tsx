'use client';

/**
 * <HelpArticleBody/> — article renderer for the help docs modal (sole
 * consumer; the /help route pages render their own JSX via compileMDX).
 *
 * The html prop is server-rendered, sanitized static markup. React event
 * handlers inside it do not exist — ALL interactivity is provided here by
 * delegation on the content container:
 *   - [data-zoomable] click  → lightbox
 *   - [data-media-play]      → toggle clip playback (reduced-motion path)
 *   - a[href^="#"]           → scroll within the modal, never mutate the URL
 *   - clips autoplay via IntersectionObserver unless prefers-reduced-motion
 */
import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { MediaFrame } from '@/components/help/media-frame';
import { HelpMediaLightbox, type LightboxMedia } from '@/components/help/help-media-lightbox';
import { ArticleFeedback } from '@/components/help/article-feedback';
import { ArticleViewTracker } from '@/components/help/article-view-tracker';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';

function formatUpdatedAt(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export interface HelpArticleBodyProps {
  html: string;
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
  communityId: number;
  onOpenArticle: (category: string, slug: string) => void;
  onLightboxOpenChange?: (open: boolean) => void;
}

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full border border-edge px-2.5 py-0.5 text-xs text-content-secondary';

export function HelpArticleBody({
  html,
  metadata,
  related,
  communityId,
  onOpenArticle,
  onLightboxOpenChange,
}: HelpArticleBodyProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const formattedUpdatedAt = formatUpdatedAt(metadata.updatedAt);

  useEffect(() => {
    onLightboxOpenChange?.(lightbox !== null);
  }, [lightbox, onLightboxOpenChange]);

  // Delegated interactivity over the injected static HTML.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;

      const playButton = target.closest<HTMLElement>('[data-media-play]');
      if (playButton) {
        e.preventDefault();
        const video = playButton.parentElement?.querySelector('video');
        if (video) {
          if (video.paused) void video.play().catch(() => {});
          else video.pause();
        }
        return;
      }

      const zoomable = target.closest<HTMLElement>('[data-zoomable]');
      if (zoomable) {
        e.preventDefault();
        const kind = zoomable.dataset.mediaKind === 'clip' ? 'clip' : 'image';
        const src =
          kind === 'clip'
            ? zoomable.querySelector('source')?.getAttribute('src')
            : zoomable.getAttribute('src');
        if (src) {
          setLightbox({
            src,
            alt: zoomable.dataset.mediaAlt ?? zoomable.getAttribute('alt') ?? '',
            kind,
          });
        }
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (anchor) {
        e.preventDefault();
        const id = decodeURIComponent(anchor.getAttribute('href')!.slice(1));
        if (!id) return;
        root!.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: 'start' });
      }
    }

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [html]);

  // Clip playback: autoplay in-viewport unless reduced motion; sync the
  // play-button overlay to playback state either way.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('video[data-media-kind="clip"]'));
    if (videos.length === 0) return;

    const cleanups: Array<() => void> = [];
    for (const video of videos) {
      const button = video.parentElement?.querySelector<HTMLElement>('[data-media-play]');
      if (button) {
        const sync = () => {
          button.toggleAttribute('hidden', !video.paused);
        };
        video.addEventListener('play', sync);
        video.addEventListener('pause', sync);
        cleanups.push(() => {
          video.removeEventListener('play', sync);
          video.removeEventListener('pause', sync);
        });
      }
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion && typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            if (entry.isIntersecting) void video.play().catch(() => {});
            else video.pause();
          }
        },
        { threshold: 0.4 },
      );
      videos.forEach((v) => io.observe(v));
      cleanups.push(() => io.disconnect());
    }

    return () => cleanups.forEach((fn) => fn());
  }, [html]);

  return (
    <div className="space-y-6 pb-4">
      <ArticleViewTracker
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-content">{metadata.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {typeof metadata.readTimeMinutes === 'number' && (
            <span className={CHIP_CLASS}>{metadata.readTimeMinutes} min read</span>
          )}
          {formattedUpdatedAt && <span className={CHIP_CLASS}>Updated {formattedUpdatedAt}</span>}
          {metadata.roles.length > 0 && (
            <span className={CHIP_CLASS}>
              {metadata.roles.map((r) => r.replace(/_/g, ' ')).join(' · ')}
            </span>
          )}
          {(metadata.statutes ?? []).map((statute) => (
            <a
              key={statute}
              href={`/help/statutes/${encodeURIComponent(statute)}?communityId=${communityId}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-full border border-status-brand-border bg-status-brand-subtle px-2.5 py-0.5 text-xs text-status-brand hover:underline"
              aria-label={`See all articles tagged with ${statute} (opens in a new tab)`}
            >
              {statute}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ))}
        </div>
      </header>

      {metadata.heroMedia && (
        <MediaFrame
          src={metadata.heroMedia.src}
          alt={metadata.heroMedia.alt}
          caption={metadata.heroMedia.caption}
          width={metadata.heroMedia.width}
          height={metadata.heroMedia.height}
          poster={metadata.heroMedia.poster}
        />
      )}

      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />

      <ArticleFeedback
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-content">Related guides</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {related.map((candidate) => (
              <button
                key={candidate.slug}
                type="button"
                onClick={() => onOpenArticle(candidate.category, candidate.slug)}
                className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 text-left transition-colors hover:border-edge-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <h3 className="text-sm font-semibold text-content">{candidate.title}</h3>
                <p className="mt-1 text-sm leading-6 text-content-secondary">
                  {candidate.description}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <HelpMediaLightbox media={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
