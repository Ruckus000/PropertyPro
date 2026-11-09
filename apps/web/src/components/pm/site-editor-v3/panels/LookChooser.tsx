'use client';

/**
 * The four looks as a choice, inside the editor: Simple's Look row and
 * Advanced's Design panel both render this.
 *
 * Choosing a card DRAFTS the look (`PATCH /api/v1/pm/site/look`,
 * `draftLookSwitch`), the editor's rule for everything: the canvas and the
 * Simple preview show it at once (`applyDesignToCanvas` reads the drafted
 * layout), and Publish makes it live. Sections the manager edited stay as they
 * are (`planLookSwitch`).
 *
 * Text cards, not previews: the editor already shows the chosen look on the
 * page beside it, and a preview per card would be four more server renders.
 *
 * "Keep my current look" appears while a look is drafted. It takes the drafted
 * look back off (`withdrawDraftedLook`), which is the only way back for a site
 * whose live layout is a legacy one that no card can return to.
 *
 * Native radio inputs inside a fieldset, so arrow keys, the group's name and
 * the checked state come from the platform.
 */
import { useId } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSiteDesign } from '@/hooks/use-site-design';
import { useKeepCurrentLook, useSelectLook } from '@/hooks/use-site-look';
import { LOOK_SUMMARIES } from '@/lib/site-looks/look-summaries';
import type { LookId } from '@/lib/site-looks/looks';
import { cn } from '@/lib/utils';

/** A look's id is its layout id (D2), so a layout that is not a look's is a legacy one. */
function lookFor(layoutId: string | null | undefined) {
  return LOOK_SUMMARIES.find((look) => look.id === layoutId) ?? null;
}

export interface LookChooserProps {
  communityId: number;
  /** The fieldset's visible legend; Simple's row already has a heading, so it can hide it. */
  hideLegend?: boolean;
}

export function LookChooser({ communityId, hideLegend = false }: LookChooserProps) {
  const name = useId();
  const design = useSiteDesign(communityId);
  const select = useSelectLook(communityId);
  const keep = useKeepCurrentLook(communityId);

  if (design.isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-status-danger">We couldn&apos;t load your looks.</p>
        <Button variant="outline" size="sm" onClick={() => void design.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!design.data) {
    return (
      <div role="status" aria-label="Loading looks" className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  const live = lookFor(design.data.live.layoutId);
  const draftedLayout = design.data.draft.layoutId;
  const drafted =
    draftedLayout && draftedLayout !== design.data.live.layoutId ? lookFor(draftedLayout) : null;
  const chosen = drafted ?? live;
  const busy = select.isPending || keep.isPending;

  function choose(id: LookId) {
    // Ignored rather than disabled while a look is saving: disabling the radio
    // a keyboard user just moved to would drop their focus to the page.
    if (busy || id === chosen?.id) return;
    const summary = LOOK_SUMMARIES.find((look) => look.id === id);
    select.mutate(id, {
      onSuccess: () =>
        toast.success(
          id === live?.id
            ? `Back to ${summary?.name ?? 'your live look'}.`
            : `${summary?.name ?? 'That look'} is ready. Publish to put it on your website.`,
        ),
      onError: (err) => toast.error(err.message),
    });
  }

  function keepCurrent() {
    keep.mutate(undefined, {
      onSuccess: () => toast.success('Kept your current look.'),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2" aria-busy={busy}>
        <legend className={hideLegend ? 'sr-only' : 'mb-1 text-sm font-semibold text-content'}>
          Look
        </legend>
        <p className="text-sm text-content-secondary">
          Sets how your whole site is laid out. Sections you&apos;ve edited stay as they are.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LOOK_SUMMARIES.map((look) => {
            const checked = look.id === chosen?.id;
            const inputId = `${name}-${look.id}`;
            return (
              <label
                key={look.id}
                htmlFor={inputId}
                className={cn(
                  'relative flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-[var(--radius-md)] border bg-surface-card p-3 text-left has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
                  checked ? 'border-interactive' : 'border-edge-strong hover:bg-surface-hover',
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={name}
                  value={look.id}
                  checked={checked}
                  onChange={() => choose(look.id)}
                  className="sr-only"
                />
                <span className="flex items-center gap-1.5 text-sm font-semibold text-content">
                  {checked ? (
                    <Check className="h-4 w-4 shrink-0 text-interactive" aria-hidden="true" />
                  ) : null}
                  {look.name}
                </span>
                <span className="text-xs text-content-secondary">{look.description}</span>
                {look.id === live?.id ? (
                  <span className="mt-1 text-xs font-medium text-status-success">Live now{/* page-state-copy:exempt — the look in use, not a page's visibility */}</span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      {drafted ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-content-secondary">
            {`${drafted.name} isn't published yet.`} {/* page-state-copy:exempt — a drafted look, not a page's visibility */}
          </p>
          <Button variant="outline" size="sm" disabled={busy} onClick={keepCurrent}>
            {live ? `Keep ${live.name}` : 'Keep my current look'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
