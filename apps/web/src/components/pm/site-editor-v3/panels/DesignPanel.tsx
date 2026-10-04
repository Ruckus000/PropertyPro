'use client';

/**
 * The Design tool (website builder v4, Phase 4b): template, colour set, and —
 * on Professional — custom colours, which save as a draft and go live on
 * Publish (`site-design-service`). The logos at the bottom are the exception:
 * they are live as soon as they save (see `LogosSection`).
 *
 * Templates are named (layout, colour set) pairs — see `design-templates.ts`
 * for why they carry no pages. The colour-set grid is the wizard's own
 * `PresetCards`, so a set looks the same in both places.
 *
 * No plan lock on templates or colour sets: Essentials could already pick any
 * set in the wizard, and the Design panel does not take that away. Only the
 * custom-colours section is Professional, as it always was.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import type { CommunityType, SiteLook } from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PresetCards,
  type PresetCardData,
} from '@/components/pm/onboarding-wizard/PresetChooser';
import { useSaveSiteDesign, useSiteDesign } from '@/hooks/use-site-design';
import { DESIGN_TEMPLATES, LAYOUT_NAMES, type DesignTemplate } from '../design-templates';
import { LogosSection } from './LogosSection';
import { StylingPanel, type StylingPanelTheme } from './StylingPanel';

export interface DesignPanelProps {
  communityId: number;
  communityType: CommunityType;
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
  communityType,
  presets,
  hasSiteCustomCss,
  theme,
}: DesignPanelProps) {
  const design = useSiteDesign(communityId);
  const save = useSaveSiteDesign(communityId);
  const [showAll, setShowAll] = useState(false);

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
  const presetSlugs = new Set(presets.map((p) => p.slug));
  const presetName = new Map(presets.map((p) => [p.slug, p.displayName]));
  // A template whose colour set was archived is hidden, not offered broken.
  const available = DESIGN_TEMPLATES.filter((t) => presetSlugs.has(t.presetSlug));
  const own = available.filter((t) => t.forType === communityType);
  const templates = showAll || own.length === 0 ? available : own;
  const customColoursActive =
    look.customCssOverrides != null && Object.keys(look.customCssOverrides).length > 0;

  function chooseTemplate(template: DesignTemplate) {
    if (look.layoutId === template.layoutId && look.themePresetSlug === template.presetSlug) return;
    save.mutate(
      { layoutId: template.layoutId, themePresetSlug: template.presetSlug },
      {
        onSuccess: () =>
          toast.success(`Now using ${template.name}. Publish to put it on your website.`),
        onError: (err) => toast.error(err.message),
      },
    );
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
        A template sets the overall look. Your words, photos, and sections stay the same when
        you switch. Template and colour changes wait until you publish.
      </p>

      <section aria-labelledby="design-template-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="design-template-heading" className="text-sm font-semibold text-content">
            Template
          </h3>
          <span className="text-xs text-content-tertiary">Your sections stay the same</span>
        </div>
        <div role="radiogroup" aria-label="Template" className="space-y-2">
          {templates.map((template) => {
            const selected =
              look.layoutId === template.layoutId && look.themePresetSlug === template.presetSlug;
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={save.isPending}
                data-testid={`design-template-${template.id}`}
                onClick={() => chooseTemplate(template)}
                className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors disabled:opacity-60 ${
                  selected
                    ? 'border-interactive ring-2 ring-interactive'
                    : 'border-edge hover:border-interactive-hover'
                }`}
              >
                <span className="block text-sm font-semibold text-content">{template.name}</span>
                <span className="block text-xs text-content-tertiary">
                  {LAYOUT_NAMES[template.layoutId]} · {presetName.get(template.presetSlug)}
                </span>
                <span className="mt-1 block text-xs text-content-secondary">
                  {template.description}
                </span>
              </button>
            );
          })}
        </div>
        {own.length > 0 && own.length < available.length ? (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full items-center justify-center gap-1 text-sm font-medium text-interactive hover:text-interactive-hover"
          >
            {showAll ? 'Show fewer templates' : 'Show all templates'}
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${showAll ? 'rotate-180' : ''}`}
            />
          </button>
        ) : null}
      </section>

      <section aria-labelledby="design-colours-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="design-colours-heading" className="text-sm font-semibold text-content">
            Colours &amp; fonts
          </h3>
          <span className="text-xs text-content-tertiary">Works with any template</span>
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
