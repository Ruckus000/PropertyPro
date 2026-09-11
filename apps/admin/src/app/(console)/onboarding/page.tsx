/**
 * /onboarding — the four-stage onboarding pipeline (spec D21).
 *
 * Leads → demos → trials → newly active, every stage DERIVED from a table that
 * already exists. The placeholder this replaces recorded why the route had to
 * exist first: the rail has linked here since Wave 1, and an unmatched URL
 * renders the ROOT not-found, which sits OUTSIDE this route group — no rail, no
 * top bar, no way back. That is also why `requireAdminPageSession()` stays on
 * the first line.
 *
 * ## All four data states, per `.claude/rules/design.md`
 *
 * - **loading** — `loading.tsx`. The route is `force-dynamic`, so the Suspense
 *   boundary is real.
 * - **error** — propagates to `app/error.tsx`. Deliberately NOT caught here: a
 *   board that rendered four empty columns because a read failed would assert
 *   "no leads, no demos, no trials" as a fact, which is the one wrong answer a
 *   pipeline must never give.
 * - **empty** — the whole-board `EmptyState` below, with a constructive action.
 * - **success** — the board plus the focused checklist.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { Rocket } from 'lucide-react';
import Link from 'next/link';
import { Button, EmptyState, PageBody } from '@propertypro/ui';

import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { PipelineBoard } from '@/components/onboarding/PipelineBoard';
import { TrialChecklist } from '@/components/onboarding/TrialChecklist';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { STAGES, getPipeline, trialBlocker } from '@/lib/server/onboarding';

export const dynamic = 'force-dynamic';

/**
 * `?community=` is untrusted — a bookmark, a hand-edited URL. Anything that is
 * not a positive integer is dropped rather than passed on, so the focus falls
 * back to "the trial ending soonest" instead of matching nothing.
 */
function parseCommunityParam(raw: string | string[] | undefined): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageSession();

  const params = await searchParams;
  const pipeline = await getPipeline(parseCommunityParam(params.community));

  const total = STAGES.reduce((sum, stage) => sum + pipeline.stages[stage].length, 0);
  const blocked = STAGES.reduce(
    (sum, stage) => sum + pipeline.stages[stage].filter((c) => c.blocker !== null).length,
    0,
  );

  if (total === 0) {
    return (
      <PageBody>
        <AdminPageHeader
          title="Onboarding"
          description="Leads, demos and trials on their way to a paying community."
        />
        <EmptyState
          icon={Rocket}
          title="Nothing is in the pipeline yet"
          description="Leads captured by the compliance checker land in the first column. Until one arrives there is no pipeline to show — this is an empty funnel, not a failed read."
          action={
            <Button asChild>
              <Link href="/leads">Go to Leads</Link>
            </Button>
          }
        />
      </PageBody>
    );
  }

  // Reuses the card's own countdown rule rather than formatting a date here, so
  // the checklist header and the trial card can never disagree about how long
  // is left. `null` outside the seven-day window is the right answer for both.
  const endsAtLabel = pipeline.checklist
    ? trialBlocker(pipeline.checklist.trialEndsAt, new Date(pipeline.generatedAt))
    : null;

  return (
    <PageBody>
      <AdminPageHeader
        title="Onboarding"
        description={
          blocked === 0
            ? `${total} in the pipeline, none blocked.`
            : `${total} in the pipeline · ${blocked} blocked.`
        }
      />

      <PipelineBoard stages={pipeline.stages} />

      {pipeline.checklist && (
        <TrialChecklist checklist={pipeline.checklist} endsAtLabel={endsAtLabel} />
      )}
    </PageBody>
  );
}
