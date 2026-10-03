'use client';

/**
 * "Page by page" — each page's own search title and description (website
 * builder v4, Phase 5b). Live on save, like a page rename: page metadata is
 * not part of the draft layer.
 *
 * The home page is left out. Its title and description are the site's, in the
 * card above, so offering them twice would give one value two homes.
 *
 * Empty means "use the default", and the placeholders show what that default
 * is — the page name with the site name, and the site's description.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSitePages, useUpdateSitePage, type SitePageSummary } from '@/hooks/use-site-pages';
import { SEO_DESCRIPTION_MAX_LENGTH, SEO_TITLE_MAX_LENGTH } from '@/lib/site-editor/site-settings';

/**
 * Code points of the value the server will store: it collapses whitespace runs
 * and trims before checking the cap, so a stray double space must not count.
 */
function count(value: string): number {
  return [...value.replace(/\s+/gu, ' ').trim()].length;
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = count(value);
  return (
    <span
      className={n > max ? 'text-sm text-status-danger' : 'text-sm text-content-tertiary'}
      aria-live={n > max ? 'polite' : 'off'}
    >
      {n}/{max}
    </span>
  );
}

export interface PageSeoCardProps {
  communityId: number;
  communityName: string;
  /** The site's own description, shown as the fallback. */
  siteDescription: string | null;
}

export function PageSeoCard({ communityId, communityName, siteDescription }: PageSeoCardProps) {
  const { data: pages } = useSitePages(communityId);
  const subPages = (pages ?? []).filter((p) => !p.isHome);
  const [pageId, setPageId] = useState<number | null>(null);
  const selected = subPages.find((p) => p.id === pageId) ?? subPages[0] ?? null;

  return (
    <section aria-labelledby="page-seo-heading" className="space-y-4">
      <h3 id="page-seo-heading" className="text-sm font-semibold text-content">
        Page by page
      </h3>
      <p className="text-sm text-content-tertiary">
        Each page uses its own name and your site name unless you write something here. The
        home page uses the title and description above.
      </p>
      {selected === null ? (
        <p className="text-sm text-content-secondary" data-testid="page-seo-empty">
          Your site has only a home page. Add a page and its search settings appear here.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="page-seo-page">Page</Label>
            <select
              id="page-seo-page"
              value={selected.id}
              onChange={(e) => setPageId(Number(e.target.value))}
              className="h-10 w-full rounded-[var(--radius-md)] border border-edge bg-surface-card px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {subPages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {/* Keyed on the page, so switching pages starts from that page's values. */}
          <PageSeoForm
            key={`${selected.id}:${selected.seoTitle ?? ''}:${selected.seoDescription ?? ''}`}
            communityId={communityId}
            page={selected}
            defaultTitle={`${selected.name} · ${communityName}`}
            siteDescription={siteDescription}
          />
        </>
      )}
    </section>
  );
}

function PageSeoForm({
  communityId,
  page,
  defaultTitle,
  siteDescription,
}: {
  communityId: number;
  page: SitePageSummary;
  defaultTitle: string;
  siteDescription: string | null;
}) {
  const update = useUpdateSitePage(communityId);
  const [title, setTitle] = useState(page.seoTitle ?? '');
  const [description, setDescription] = useState(page.seoDescription ?? '');
  const [error, setError] = useState<string | null>(null);
  const overLimit =
    count(title) > SEO_TITLE_MAX_LENGTH || count(description) > SEO_DESCRIPTION_MAX_LENGTH;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        update.mutate(
          {
            pageId: page.id,
            // Blank clears back to the default.
            seoTitle: title.trim() || null,
            seoDescription: description.trim() || null,
          },
          {
            onSuccess: () => toast.success(`Saved the search settings for ${page.name}.`),
            onError: (err) => setError(err.message),
          },
        );
      }}
    >
      {error ? <AlertBanner status="danger" title={error} /> : null}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="page-seo-title">Title</Label>
          <Counter value={title} max={SEO_TITLE_MAX_LENGTH} />
        </div>
        <Input
          id="page-seo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="page-seo-description">Description</Label>
          <Counter value={description} max={SEO_DESCRIPTION_MAX_LENGTH} />
        </div>
        <Textarea
          id="page-seo-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={siteDescription ?? undefined}
        />
        <p className="text-sm text-content-tertiary">
          Leave these empty to use the wording shown in grey.
        </p>
      </div>
      <div className="space-y-2 border-t border-edge pt-4">
        <Button type="submit" disabled={update.isPending || overLimit}>
          {update.isPending ? 'Saving…' : 'Save page settings'}
        </Button>
        <p className="text-sm text-content-tertiary">
          These take effect as soon as you save. They aren&apos;t part of Publish.
        </p>
      </div>
    </form>
  );
}
