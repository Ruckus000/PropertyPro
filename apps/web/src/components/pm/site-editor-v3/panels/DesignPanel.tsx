'use client';

/**
 * The Design tool (website builder v4, Phase 4b; looks, Phase 2B): look, colour
 * set, and — on Professional — custom colours, which save as a draft and go live
 * on Publish (`site-design-service`). The logos at the bottom are the exception:
 * they are live as soon as they save (see `LogosSection`).
 *
 * A look is a whole design: a layout, a colour set and the home page's starting
 * sections (D1). Choosing one drafts it through `PATCH /api/v1/pm/site/look`,
 * which keeps every section the manager has edited (D5). It lists
 * `LOOK_SUMMARIES`, not the registry, so the panel's chunk stays small.
 *
 * ponytail: this list of looks is interim. Trigger: the look picker
 * (`/pm/website/looks`) exists; the Design tab then keeps colours, fonts and
 * logos and links to the picker instead of listing looks.
 *
 * The colour-set grid is the wizard's own `PresetCards`, so a set looks the same
 * in both places.
 *
 * No plan lock on looks or colour sets: Essentials could already pick any set in
 * the wizard, and the Design panel does not take that away. Only the
 * custom-colours section is Professional, as it always was.
 */

import { toast } from 'sonner';
import { Check } from 'lucide-react';
import type { SiteLook } from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PresetCards,
  type PresetCardData,
} from '@/components/pm/onboarding-wizard/PresetChooser';
import { useDraftSiteLook } from '@/hooks/use-draft-site-look';
import { useSaveSiteDesign, useSiteDesign } from '@/hooks/use-site-design';
import { LOOK_SUMMARIES, type LookSummary } from '@/lib/site-looks/look-summaries';
import { LogosSection } from './LogosSection';
import { StylingPanel, type StylingPanelTheme } from './StylingPanel';

export interface DesignPanelProps {
  communityId: number;
  /** Non-archived `site_theme_presets`, from the page's server render. */
  presets: PresetCardData[];
  hasSiteCustomCss: boolean;
  /** What the canvas shows now; seeds the custom-colour pickers. */
  theme: StylingPanelTheme;
}

/** The look a visitor will see after Publish: the draft over the live look. */
function nextLook(design: { live: SiteLook; draft: SiteLook }): SiteLook {
  return { ...design.live, ...design.draft };
}

export function DesignPanel({
  communityId,
  presets,
  hasSiteCustomCss,
  theme,
}: DesignPanelProps) {
  const design = useSiteDesign(communityId);
  const save = useSaveSiteDesign(communityId);
  const draftLook = useDraftSiteLook(communityId);

  if (design.isError) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="Couldn't load your site's design"
        action={
          <Button variant="outline" size="sm" onClick={() => void design.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!design.data) {
    return (
      <div role="status" aria-label="Loading design" className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const look = nextLook(design.data);
  const presetName = new Map(presets.map((p) => [p.slug, p.displayName]));
  // A look's id is its layout id (D2), so the look that will publish is the one
  // whose id is the layout the draft-over-live design carries. None when the
  // site is on a layout that predates the looks.
  const selectedLookId = LOOK_SUMMARIES.find((summary) => summary.id === look.layoutId)?.id ?? null;
  const busy = save.isPending || draftLook.isPending;
  const customColoursActive =
    look.customCssOverrides != null && Object.keys(look.customCssOverrides).length > 0;

  function chooseLook(summary: LookSummary) {
    if (summary.id === selectedLookId) return;
    draftLook.mutate(summary.id, {
      onSuccess: () =>
        toast.success(`Now using ${summary.name}. Publish to put it on your website.`),
      onError: (err) => toast.error(err.message),
    });
  }

  function chooseColourSet(slug: string) {
    if (look.themePresetSlug === slug) return;
    save.mutate(
      { themePresetSlug: slug },
      {
        onSuccess: () =>
          toast.success(
            `Changed colours to ${presetName.get(slug) ?? slug}. Publish to put them on your website.`,
          ),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="space-y-8" data-testid="tool-panel-design">
      <p className="text-sm text-content-secondary">
        A look sets your site&apos;s design and the sections on its home page. Sections you&apos;ve
        edited stay as they are. Look and colour changes wait until you publish.
      </p>

      <section aria-labelledby="design-look-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="design-look-heading" className="text-sm font-semibold text-content">
            Look
          </h3>
          <span className="text-xs text-content-tertiary">Your edits stay</span>
        </div>
        {selectedLookId === null ? (
          <p data-testid="design-older-look-note" className="text-sm text-content-secondary">
            Your site uses an older look. Choose one below to switch to it.
          </p>
        ) : null}
        <div role="radiogroup" aria-label="Look" className="space-y-2">
          {LOOK_SUMMARIES.map((summary) => {
            const selected = summary.id === selectedLookId;
            return (
              <button
                key={summary.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                data-testid={`design-look-${summary.id}`}
                onClick={() => chooseLook(summary)}
                className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors disabled:opacity-60 ${
                  selected
                    ? 'border-interactive ring-2 ring-interactive'
                    : 'border-edge hover:border-interactive-hover'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="block text-sm font-semibold text-content">{summary.name}</span>
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center gap-1 rounded-full bg-interactive px-2 py-0.5 text-xs font-medium text-content-inverse"
                    >
                      <Check className="h-3 w-3" />
                      Selected
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-content-secondary">
                  {summary.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="design-colours-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="design-colours-heading" className="text-sm font-semibold text-content">
            Colours &amp; fonts
          </h3>
          <span className="text-xs text-content-tertiary">Works with any look</span>
        </div>
        {customColoursActive ? (
          <AlertBanner
            status="info"
            variant="subtle"
            data-testid="design-custom-colours-note"
            title="Your own colours are replacing this set's"
            description="Colour sets change fonts and the colours you haven't set yourself."
            action={
              <Button
                variant="outline"
                size="sm"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    { customCssOverrides: null },
                    {
                      onSuccess: () =>
                        toast.success('Using the colour set again. Publish to put it on your website.'),
                      onError: (err) => toast.error(err.message),
                    },
                  )
                }
              >
                Use the set&apos;s colours instead
              </Button>
            }
          />
        ) : null}
        {presets.length === 0 ? (
          <p className="text-sm text-content-secondary">No colour sets are available yet.</p>
        ) : (
          <PresetCards
            presets={presets}
            selected={look.themePresetSlug ?? null}
            onChoose={chooseColourSet}
            name="design-colour-set"
          />
        )}
      </section>

      <section aria-labelledby="design-custom-heading" className="space-y-3">
        <h3 id="design-custom-heading" className="text-sm font-semibold text-content">
          Your own colours
        </h3>
        <StylingPanel communityId={communityId} hasSiteCustomCss={hasSiteCustomCss} theme={theme} />
      </section>

      <LogosSection communityId={communityId} />
    </div>
  );
}
