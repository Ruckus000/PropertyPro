'use client';

/**
 * The Guided panel's "Next steps" checklist (website builder v4, Phase 3).
 *
 * The rules live in `lib/site-editor/next-steps.ts` (#1295): which items exist,
 * their order and wording, and when each is done. This file draws them and
 * turns a step's action into a move in the editor. Two actions are resolved
 * here because they need the editor's own state — showing a hidden required
 * section (`showSection`, with the cross-page fallback) and selecting the home
 * page's welcome section — and the rest go to `onAction`.
 *
 * Code-split: only Guided mode renders it.
 */

import { CircleCheck, Circle, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { resolveHeroPhotos, type HeroBlockContent } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useComplianceChecklist } from '@/hooks/use-compliance-checklist';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import type { SiteEditorPreferences } from '@/hooks/use-site-editor-preferences';
import { summarizeRecords } from '@/lib/site-editor/records-status';
import {
  buildNextSteps,
  type MarkableStep,
  type NextStep,
  type NextStepAction,
} from '@/lib/site-editor/next-steps';
import { useSiteEditor } from '../editor-context';
import { useRequiredSections } from '../required-sections-context';
import type { SlotTarget } from '../publish/PublishSheet';

/** The actions `EditorRoot` carries out; the other two are resolved here. */
export type EditorStepAction = Exclude<
  NextStepAction,
  { kind: 'show-section' } | { kind: 'select-hero' }
>;

export interface NextStepsProps {
  communityId: number;
  communityType: string;
  /** The page being edited, to tell whether the welcome section is on screen. */
  pageId: number | null;
  homePageId: number | null;
  /** The home page's welcome section, from the whole site's blocks. */
  homeHero: SiteBlockSummary | null;
  everPublished: boolean;
  pendingChanges: number;
  preferences: Pick<SiteEditorPreferences, 'marked' | 'visited'>;
  onMark: (step: MarkableStep) => void;
  onAction: (action: EditorStepAction) => void;
  /** Takes the PM to a section on another page (`EditorRoot`'s slot hand-off). */
  onGoToSlot: (target: SlotTarget) => void;
  onWarnResidents: () => void;
}

function heroHasImage(hero: SiteBlockSummary | null): boolean {
  if (!hero || typeof hero.content !== 'object' || hero.content === null) return false;
  return resolveHeroPhotos(hero.content as HeroBlockContent).length > 0;
}

export function NextSteps({
  communityId,
  communityType,
  pageId,
  homePageId,
  homeHero,
  everPublished,
  pendingChanges,
  preferences,
  onMark,
  onAction,
  onGoToSlot,
  onWarnResidents,
}: NextStepsProps) {
  const { level, statuses, lawFor, showSection } = useRequiredSections();
  const { blocks, select } = useSiteEditor();
  // Same query key as the Documents tool and the rail's count: no new request.
  // Apartments have no records checklist (the route refuses them).
  const checklist = useComplianceChecklist(communityId, {
    enabled: communityType !== 'apartment',
  });

  const result = buildNextSteps({
    level,
    sections: statuses,
    lawFor,
    records: checklist.data ? summarizeRecords(checklist.data) : null,
    marked: preferences.marked,
    visited: preferences.visited,
    heroHasImage: heroHasImage(homeHero),
    everPublished,
    pendingChanges,
  });

  const run = (action: NextStepAction) => {
    if (action.kind === 'show-section') {
      const hiddenAt = statuses.find((s) => s.blockType === action.blockType)?.hiddenAt;
      if (hiddenAt && !showSection(hiddenAt)) onGoToSlot(hiddenAt);
      return;
    }
    if (action.kind === 'select-hero') {
      // On the home page already: select it in place, so the checklist stays
      // open beside its settings. Otherwise hand off to the home page.
      const onScreen = pageId === homePageId && blocks.find((b) => b.blockType === 'hero');
      if (onScreen) select(onScreen.id);
      else if (homeHero && homePageId !== null)
        onGoToSlot({ pageId: String(homePageId), slot: homeHero.blockOrder });
      return;
    }
    onAction(action);
  };

  const percent = result.total === 0 ? 0 : Math.round((result.done / result.total) * 100);

  return (
    <div className="space-y-5" data-testid="next-steps">
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-edge p-4">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-content">
            {result.done} of {result.total} done
          </span>
          {result.minutesLeft > 0 ? (
            <span className="text-xs text-content-tertiary">
              About {result.minutesLeft} min left
            </span>
          ) : null}
        </p>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${result.done} of ${result.total} done`}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full rounded-full bg-interactive" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {result.groups.map((group) => (
        <section key={group.id} aria-labelledby={`next-steps-${group.id}`} className="space-y-2">
          <h3
            id={`next-steps-${group.id}`}
            className="flex items-center gap-1.5 text-sm font-semibold text-content"
          >
            {group.id === 'rules' ? (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {group.title}
          </h3>
          <ul className="space-y-2">
            {group.steps.map((step) => (
              <StepRow
                key={step.key}
                step={step}
                rules={group.id === 'rules'}
                // Every open rules item is shown in full; of the setup steps,
                // only the first open one is, as the design draws it.
                expanded={!step.done && (group.id === 'rules' || step.key === result.firstOpenKey)}
                onRun={run}
                onMark={onMark}
              />
            ))}
          </ul>
        </section>
      ))}

      <button
        type="button"
        onClick={onWarnResidents}
        className="flex w-full items-start gap-3 rounded-[var(--radius-lg)] border border-status-warning-border bg-status-warning-bg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" aria-hidden="true" />
        <span>
          <span className="block text-sm font-semibold text-content">
            Need to warn residents now?
          </span>
          <span className="block text-sm text-content-secondary">
            Post an urgent notice. It goes live right away.
          </span>
        </span>
      </button>
    </div>
  );
}

function StepRow({
  step,
  rules,
  expanded,
  onRun,
  onMark,
}: {
  step: NextStep;
  rules: boolean;
  expanded: boolean;
  onRun: (action: NextStepAction) => void;
  onMark: (step: MarkableStep) => void;
}) {
  const Icon = step.done ? CircleCheck : rules ? ShieldAlert : Circle;
  const { action, key } = step;
  const markKey: MarkableStep | null =
    step.markable && (key === 'welcome' || key === 'photo') ? key : null;
  return (
    <li
      data-testid={`next-step-${step.key}`}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-md)] border p-3',
        expanded && rules && 'border-status-danger-border bg-status-danger-bg',
        expanded && !rules && 'border-2 border-interactive',
        !expanded && 'border-edge',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0',
          step.done ? 'text-status-success' : rules ? 'text-status-danger' : 'text-content-tertiary',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p
          className={cn(
            'text-sm font-medium',
            step.done ? 'text-content-secondary' : 'text-content',
          )}
        >
          {step.title}
          {step.done ? <span className="sr-only"> (done)</span> : null}
        </p>
        {expanded ? (
          <>
            <p className="text-sm text-content-secondary">{step.detail}</p>
            {step.law ? <p className="text-xs text-content-tertiary">{step.law}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {step.cta && action ? (
                <Button
                  size="sm"
                  variant={rules ? 'destructive' : 'default'}
                  onClick={() => onRun(action)}
                >
                  {step.cta}
                </Button>
              ) : null}
              {markKey ? (
                <Button size="sm" variant="ghost" onClick={() => onMark(markKey)}>
                  Mark as done
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
