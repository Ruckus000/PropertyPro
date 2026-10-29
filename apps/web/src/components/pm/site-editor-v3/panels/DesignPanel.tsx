'use client';

/**
 * The Design panel (website builder v4, Phase 4b; Site settings, combined plan
 * Task 27): colour set, fonts, on Professional custom colours, and the logos.
 * Colour, font and custom-colour changes save as a draft and go live on
 * Publish (`site-design-service`). The logos at the bottom are the exception:
 * they are live as soon as they save (see `LogosSection`).
 *
 * It lists no looks. A look is a whole design (a layout, a colour set and the
 * home page's starting sections), and choosing one is the look picker's job
 * (`/pm/website/looks`); this panel links to it.
 *
 * The colour-set grid is `PresetCards`.
 *
 * No plan lock on colour sets: Essentials could already pick any set, and the
 * Design panel does not take that away. Only the custom-colours section is
 * Professional, as it always was.
 */

import Link from 'next/link';
import { toast } from 'sonner';
import type { SiteLook } from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSaveSiteDesign, useSiteDesign } from '@/hooks/use-site-design';
import { LogosSection } from './LogosSection';
import { PresetCards, type PresetCardData } from './preset-cards';
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
  const busy = save.isPending;
  const customColoursActive =
    look.customCssOverrides != null && Object.keys(look.customCssOverrides).length > 0;

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
      <section aria-labelledby="design-look-heading" className="space-y-3">
        <h3 id="design-look-heading" className="text-sm font-semibold text-content">
          Look
        </h3>
        <p className="text-sm text-content-secondary">
          A look sets how your whole website is laid out and what your home page starts with. You
          choose it on the look picker. Sections you&apos;ve edited stay as they are.
        </p>
        <Button asChild variant="outline" className="min-h-11 md:min-h-9">
          <Link href={`/pm/website/looks?communityId=${communityId}`}>Change look</Link>
        </Button>
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
            disabled={busy}
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
