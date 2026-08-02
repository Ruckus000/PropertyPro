'use client';

/**
 * The review-and-publish sheet (Phase 5).
 *
 * ## It is atomic, and that is a decision, not an omission
 *
 * There are no tick boxes here, no "select all", no per-change staging and no
 * dependency gating. Selective publish was cut permanently: the data model has
 * no stable section identity (every write soft-deletes and re-inserts, so row
 * ids churn and draft/published rows correlate only by slot), which means a
 * "publish only these three" selection cannot be expressed against the rows the
 * server would have to promote. A UI that offered the choice would be offering
 * a guess. The sheet therefore reviews the whole draft and promotes the whole
 * draft — which is also exactly what `POST /api/v1/pm/site/publish` does.
 *
 * ## Blocking names the offender
 *
 * `publishBlocked` is a boolean, but a disabled button next to "fix errors
 * first" is a dead end — the PM has no idea which of eleven sections is wrong.
 * Every blocking issue is listed with the section it belongs to, and each one
 * offers "Fix this", which closes the sheet and hands the slot back to the
 * editor via `onFixIssue`. The sheet does not import the editor context: it is
 * code-split and mounted on demand, and reaching into a provider it may not be
 * rendered under is how a review surface becomes untestable.
 *
 * ## Zero changes is impossible, not a no-op
 *
 * The server can answer `{ published: false, reason: 'nothing-to-publish' }`,
 * but firing a request that we can already prove is pointless teaches the PM
 * that Publish sometimes does nothing for no visible reason. When the diff is
 * empty the action is disabled and says so.
 *
 * ## Failure gets a receipt, not a toast
 *
 * See `Receipt.tsx`. Success closes the sheet and toasts through the root
 * layout's single `<Toaster/>` — no second Toaster is mounted here.
 *
 * ## Pages (Phase 11b-3)
 *
 * Two page-level facts are pending at publish time and nothing else is: a page
 * that has never been published (it appears), and a page staged for removal (it
 * disappears). Both arrive as `page:<id>` changes from `diffPages` via
 * `useSiteDiff`, and both are grouped under the page they are about, so a new
 * page's creation heads the list of the sections it brought with it.
 *
 * **The staged removal carries an undo, and that is not a convenience.** It is
 * the only place in the product where a PM sees "this page is about to
 * disappear from your live site" next to the button that would do it. A review
 * surface that states a destructive pending change without offering to cancel
 * it forces the PM to leave, find the Pages panel, and remember which page it
 * was — or to publish and hope. The undo is a `DELETE … { unstage: true }`,
 * which is the exact inverse of what staged the removal.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Info, Undo2 } from 'lucide-react';
import {
  contrastIssues,
  publishBlocked,
  siteIssues,
  type Change,
  type Issue,
  type ResolvedBrandColors,
  type SiteSnapshot,
} from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useSitePublishToken } from '@/hooks/use-content-blocks';
import {
  usePublishSite,
  PublishConflictError,
  type PublishSiteResult,
} from '@/hooks/use-publish-site';
import { useUnstageSitePageDelete } from '@/hooks/use-site-pages';
import { issueTarget } from '@/lib/site-editor/to-snapshot';
import { cn } from '@/lib/utils';
import { SITE_CHANGE_GROUP, useSiteDiff } from '../use-site-diff';
import { ApiRequestError } from '@/lib/api/request-json';
import { describePublishedCounts } from '@/lib/site-editor/describe-publish-outcome';
import { Receipt, type ReceiptStatus } from './Receipt';

export interface PublishSheetProps {
  /** Controlled — the editor's top bar owns the open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  /**
   * Already-resolved brand colours (`resolveTheme` output), when the editor
   * has them. Passed in rather than resolved here so this tree keeps no
   * dependency on `packages/theme`; omit and the contrast advisories are simply
   * not shown. Never blocking — see the long note on `contrastIssues`.
   */
  brandColors?: ResolvedBrandColors;
  /**
   * Jump to the section a blocking issue is about. The sheet closes first, then
   * calls this with the section's `block_order` slot; the editor owns selection.
   */
  onFixIssue?: (slot: number) => void;
  /**
   * Open the Pages panel. Page-SET problems (a duplicate address, no home page)
   * block a publish but have no section slot, so `onFixIssue` cannot reach
   * them — this is their equivalent, and without it they are the only blocking
   * issues the sheet reports with no way to act on them.
   *
   * REQUIRED, unlike `onFixIssue` above. A missing `onFixIssue` merely hides a
   * shortcut to a section the PM can also reach by scrolling; a missing
   * `onGoToPages` removes the ONLY action on a class of blocking issue, and it
   * does so silently — no crash, no broken control, just the "blocked with
   * nothing to press" state this prop was added to end. That is the shape that
   * shipped 11b-1's dead publish button, and this sheet has exactly one caller
   * (`PublishSheetMount`), so requiring it costs nothing.
   */
  onGoToPages: () => void;
}

/** `'site'` sorts first; page groups follow, in the site's own nav order. */
const SITE_GROUP = SITE_CHANGE_GROUP;

const KIND_LABEL: Record<Change['kind'], string> = {
  added: 'Added',
  edited: 'Edited',
  removed: 'Removed',
  reordered: 'Reordered',
};

const GROUP_LABEL: Record<string, string> = {
  [SITE_GROUP]: 'Across the site',
};

/**
 * A heading for one group.
 *
 * `pageLabels` comes from the pages query, so a page group is named after the
 * page rather than its id. The raw group id is the last resort and is reached
 * only if the pages query has not resolved — never a lie, just unhelpful.
 */
function groupLabel(group: string, pageLabels: ReadonlyMap<string, string>): string {
  return GROUP_LABEL[group] ?? pageLabels.get(group) ?? group;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Groups changes by `change.group`, site-wide first.
 *
 * Insertion order within a group is preserved: `diffSite` emits in a stable
 * order and re-sorting would only make two consecutive reviews of the same
 * draft disagree about where a row sits.
 *
 * `rank` orders the page groups by their position in the site's nav, which is
 * the order the PM sees everywhere else. Without it page groups would sort by
 * id STRING — where page 10 precedes page 2 — so the fallback is deliberately
 * `localeCompare` on the raw id rather than a numeric compare: an unranked
 * group is one the pages query has not resolved, and inventing a numeric order
 * for it would claim a nav position that may not be its own.
 */
export function groupChanges(
  changes: readonly Change[],
  rank: ReadonlyMap<string, number> = new Map(),
): Array<{ group: string; changes: Change[] }> {
  const byGroup = new Map<string, Change[]>();
  for (const change of changes) {
    const bucket = byGroup.get(change.group);
    if (bucket) bucket.push(change);
    else byGroup.set(change.group, [change]);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === SITE_GROUP) return -1;
      if (b === SITE_GROUP) return 1;
      const rankA = rank.get(a);
      const rankB = rank.get(b);
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
      if (rankA !== undefined) return -1;
      if (rankB !== undefined) return 1;
      return a.localeCompare(b);
    })
    .map(([group, groupedChanges]) => ({ group, changes: groupedChanges }));
}

/**
 * Whether this change is a page removal the PM can still call off.
 *
 * `change.page.deleteStaged` is the discriminator, not `kind === 'removed'`.
 * `diffPages` also emits `removed` for a published page that has vanished from
 * the pages list entirely — a state 11b cannot produce, but if it ever occurs
 * there is nothing staged to unstage and offering an undo would be an
 * affordance for a request the server would reject.
 *
 * **Exported for its own test.** That reason had no coverage: the only
 * assertion touching it was satisfied by `Number(undefined) → NaN` failing the
 * safe-integer check below — a different mechanism reaching the same answer, so
 * deleting the `deleteStaged` line changed nothing observable. The shape it
 * guards cannot be produced through the sheet's queries (`useSiteDiff` builds
 * both sides of `diffPages` from one page list, so a page cannot be in the
 * baseline and absent from `next`), which is exactly why it is defensive — and
 * why it has to be asserted here rather than through a render.
 */
export function stagedPageRemoval(change: Change): number | null {
  if (change.kind !== 'removed') return null;
  if (change.page?.deleteStaged !== true) return null;
  const pageId = Number(change.page.pageId);
  return Number.isSafeInteger(pageId) && pageId > 0 ? pageId : null;
}

/**
 * What the publish outcome should say.
 *
 * The counts live in `describePublishedCounts`, shared with the onboarding
 * wizard's final step — which had its own section-only copy and was reachable
 * with a page-only publish, because the wizard is entered FROM this editor
 * while the Pages tool is open. Only the `published: false` sentence is local:
 * the two surfaces say different things about it on purpose.
 */
function describeOutcome(result: PublishSiteResult): string {
  if (!result.published) return 'The server found nothing left to publish.';
  return describePublishedCounts(result);
}

interface ReceiptState {
  status: ReceiptStatus;
  attempted: string;
  outcome: string;
  nextStep: string;
  /** Per-field reasons from a server `ValidationError` — see `ReceiptProps.reasons`. */
  reasons?: string[];
}

export function PublishSheet({
  open,
  onOpenChange,
  communityId,
  brandColors,
  onFixIssue,
  onGoToPages,
}: PublishSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Review and publish</SheetTitle>
          <SheetDescription>
            Everything below goes live together. Publishing is all-or-nothing —
            there is no way to ship part of a draft.
          </SheetDescription>
        </SheetHeader>
        {/* Mounted only while open so the blocks query fires on demand rather
            than for every PM who never reviews. */}
        {open ? (
          <PublishSheetBody
            communityId={communityId}
            brandColors={brandColors}
            onFixIssue={onFixIssue}
            onGoToPages={onGoToPages}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface BodyProps {
  communityId: number;
  brandColors?: ResolvedBrandColors;
  onFixIssue?: (slot: number) => void;
  // Required all the way down, matching `PublishSheetProps`. An optional
  // restatement here would put the hole straight back: `PublishSheet` forwards
  // this prop by name to `PublishSheetBody`, and it is THIS interface the
  // render reads — so a required outer prop and an optional inner one buys
  // nothing beyond a typecheck that passes.
  onGoToPages: () => void;
  onOpenChange: (open: boolean) => void;
}

function PublishSheetBody({ communityId, brandColors, onFixIssue, onGoToPages, onOpenChange }: BodyProps) {
  // The same hook the top bar's Publish button reads, so the button's enabled
  // state and this sheet's change count are one computation, not two.
  const {
    diff,
    next,
    pageLabels,
    pageRank,
    slotGroups,
    pageIssues: pageSetIssues,
    isPending: diffPending,
    isError,
    error: diffError,
    refetch: refetchDiff,
  } = useSiteDiff(communityId);
  // The authoritative token: max(published_at) over ALL published rows,
  // including rows shadowed by a draft. Deriving it from the merged list would
  // drop exactly those rows and 409 against a publish nobody else made.
  const tokenQuery = useSitePublishToken(communityId);
  const publish = usePublishSite(communityId);
  const unstagePage = useUnstageSitePageDelete(communityId);

  const [receipt, setReceipt] = useState<ReceiptState | null>(null);

  const issues: Issue[] = useMemo(() => {
    const structural = siteIssues(next);
    // Advisory at publish on purpose: branding is unstaged and already live on
    // the public site, so blocking here cannot un-ship a bad ratio — it would
    // only stop an unrelated copy fix. See the note on `contrastIssues`.
    const contrast = brandColors ? contrastIssues(brandColors, { severity: 'warning' }) : [];
    /*
     * The PAGE-SET rules, which this sheet did not run at all until round 5.
     *
     * The server runs them inside the publish transaction and refuses on no
     * home, two homes, a duplicate name or slug, or a reserved slug — so a PM
     * in any of those states saw an enabled Publish button, clicked it, and got
     * a receipt reading "This site cannot be published yet… Try publishing
     * again": advice for the one action guaranteed to fail forever.
     *
     * `useSiteDiff` computes them from the page rows it already holds, so this
     * costs no request. It is a strict subset of the server's run (the redirect
     * table is server-only), which is the only safe direction: it can miss a
     * refusal, never invent one.
     */
    return [...structural, ...pageSetIssues, ...contrast];
  }, [next, brandColors, pageSetIssues]);

  const blocking = useMemo(() => issues.filter((i) => i.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter((i) => i.severity === 'warning'), [issues]);
  const blocked = publishBlocked(issues);

  const isPending = diffPending || tokenQuery.isPending;
  const hasChanges = diff.changes.length > 0;

  function fixIssue(slot: number) {
    onOpenChange(false);
    onFixIssue?.(slot);
  }

  // Same shape as `fixIssue`: close first, then hand over. A sheet left open
  // over the panel the PM was just sent to is a second thing to dismiss.
  function goToPages() {
    onOpenChange(false);
    onGoToPages();
  }

  /**
   * Cancel a staged page removal without leaving the review.
   *
   * The sheet stays open on success: the PM came here to decide what ships, and
   * closing it would make cancelling one removal cost them the whole review.
   * The pages query invalidates, so the row simply leaves the list.
   */
  async function undoPageRemoval(pageId: number, label: string) {
    try {
      await unstagePage.mutateAsync({ pageId });
      toast.success(`${label} will stay on your site.`);
    } catch (error) {
      // A toast, not a receipt: a receipt describes the outcome of a publish,
      // and nothing was published. The staged removal is untouched and the row
      // is still on screen saying so, so the sheet is already truthful.
      toast.error(
        error instanceof Error
          ? `We couldn't cancel that removal. ${error.message}`
          : "We couldn't cancel that removal. Please try again.",
      );
    }
  }

  async function onPublish() {
    setReceipt(null);
    /*
     * "tried to", not "published" — this line is computed BEFORE the request and
     * is only ever RENDERED on the paths where it failed. Success toasts and
     * closes the sheet (below), so the receipt is a failure surface: the past
     * tense put "You published 3 changes." directly above "…so nothing was
     * published" and "Your live site is unchanged."
     *
     * `ReceiptProps.attempted` documents itself as "What was attempted, e.g.
     * 'Publishing 3 changes'" — the caller was the half that drifted.
     *
     * Pre-dates this phase (Phase 5, `93bf00bc`); repaired here because it sits
     * on the journey this PR rewrites and reads as a false claim to any PM whose
     * publish is refused on page grounds — which 11b-3 newly makes possible.
     */
    const attempted = `You tried to publish ${plural(diff.changes.length, 'change')}.`;
    try {
      const result = await publish.mutateAsync({
        expectedPublishedAt: tokenQuery.data ?? null,
      });
      if (!result.published) {
        setReceipt({
          status: 'nothing',
          attempted,
          outcome: describeOutcome(result),
          nextStep:
            'Your live site is unchanged. Close this and reload the editor — someone may have already published these changes.',
        });
        return;
      }
      toast.success(describeOutcome(result));
      onOpenChange(false);
    } catch (error) {
      if (error instanceof PublishConflictError) {
        setReceipt({
          status: 'conflict',
          attempted,
          outcome: 'Someone else published while you were working, so nothing was published.',
          nextStep:
            'Reload the editor to pick up their changes, check yours still make sense, then publish again.',
        });
        return;
      }
      /*
       * A refusal the server can EXPLAIN gets the explanation, and different
       * advice.
       *
       * "Try publishing again" is right for a transient failure and wrong for
       * a validation refusal, which will fail identically forever — the PM has
       * to change something first. The reasons are already on the wire in
       * `ValidationError`'s `fields`, page-qualified; `requestJson` used to
       * drop them, and `ApiRequestError` now carries them through.
       *
       * With the page-set gate above running client-side this should be
       * unreachable for the page rules. It is kept because it is not
       * unreachable for all of them: the retired-slug rule is server-only, and
       * a co-manager can create the offending state between this sheet's read
       * and the publish click.
       */
      const fields = error instanceof ApiRequestError ? error.fields : undefined;
      setReceipt({
        status: 'error',
        attempted,
        outcome: error instanceof Error ? error.message : 'The publish request failed.',
        nextStep: fields
          ? 'Your live site is unchanged and your draft is safe. Fix the problems above in the Pages panel, then publish again.'
          : 'Your live site is unchanged and your draft is safe. Try publishing again.',
        ...(fields ? { reasons: fields.map((f) => f.message) } : {}),
      });
    }
  }

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Loading your changes</span>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't work out what's changed"
        description={diffError?.message ?? 'Please try again.'}
        action={
          <Button variant="outline" size="sm" onClick={refetchDiff}>
            Try again
          </Button>
        }
      />
    );
  }

  const grouped = groupChanges(diff.changes, pageRank);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {receipt ? (
        <Receipt
          status={receipt.status}
          attempted={receipt.attempted}
          outcome={receipt.outcome}
          {...(receipt.reasons ? { reasons: receipt.reasons } : {})}
          nextStep={receipt.nextStep}
          onDismiss={() => setReceipt(null)}
        />
      ) : null}

      {blocking.length > 0 ? (
        <BlockingIssues
          issues={blocking}
          snapshot={next}
          pageLabels={pageLabels}
          slotGroups={slotGroups}
          onFix={fixIssue}
          canFix={onFixIssue !== undefined}
          onGoToPages={goToPages}
        />
      ) : null}

      <section aria-labelledby="publish-changes-heading" className="space-y-4">
        <h3 id="publish-changes-heading" className="text-sm font-semibold text-content">
          {hasChanges
            ? `${plural(diff.changes.length, 'change')} ready to publish`
            : 'Nothing to publish'}
        </h3>

        {diff.firstPublish && hasChanges ? (
          <p className="text-sm text-content-secondary">
            This is your site&apos;s first publish, so everything on it is new.
          </p>
        ) : null}

        {hasChanges ? (
          grouped.map(({ group, changes }) => (
            <div key={group} data-testid={`change-group-${group}`} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                {groupLabel(group, pageLabels)}
              </h4>
              <ul className="space-y-2">
                {changes.map((change) => {
                  const undoablePageId = stagedPageRemoval(change);
                  return (
                    <ChangeRow
                      key={`${change.key}-${change.kind}`}
                      change={change}
                      {...(undoablePageId !== null
                        ? {
                            onUndoRemoval: () =>
                              void undoPageRemoval(undoablePageId, change.title),
                            undoPending: unstagePage.isPending,
                          }
                        : {})}
                    />
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
            Your draft matches what&apos;s already live, so there&apos;s nothing to
            publish. Edit a section and it will show up here.
          </p>
        )}
      </section>

      {warnings.length > 0 ? <WarningList issues={warnings} /> : null}

      <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-4">
        <Button
          type="button"
          onClick={() => void onPublish()}
          disabled={blocked || !hasChanges || publish.isPending}
          loading={publish.isPending}
        >
          {publish.isPending ? 'Publishing…' : 'Publish changes'}
        </Button>
        <p className="text-xs text-content-secondary" data-testid="publish-hint">
          {blocked
            ? 'Fix the problems above before publishing.'
            : !hasChanges
              ? "There's nothing to publish yet."
              : 'All of these changes go live at once.'}
        </p>
      </div>
    </div>
  );
}

interface ChangeRowProps {
  change: Change;
  /** Present only on a staged page removal — see `stagedPageRemoval`. */
  onUndoRemoval?: () => void;
  undoPending?: boolean;
}

function ChangeRow({ change, onUndoRemoval, undoPending = false }: ChangeRowProps) {
  const page = change.page;
  return (
    <li className="rounded-md border border-edge bg-surface-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
          {KIND_LABEL[change.kind]}
        </span>
        <span className="text-sm font-medium text-content">{change.title}</span>
        {change.alsoMoved ? (
          <span className="text-xs text-content-secondary">and moved</span>
        ) : null}
      </div>
      {page ? (
        // The public address, because it is the one thing that tells a PM which
        // URL is about to start or stop working — and neither `key` nor `group`
        // can be parsed back into it.
        <p className="mt-1 text-xs text-content-secondary">
          {page.isHome ? 'Your site\u2019s front page' : `/${page.slug}`}
        </p>
      ) : null}
      {/*
       * The accessible name CONTAINS the visible label, per WCAG 2.5.3 (Label
       * in Name). It used to read "Keep the Contact page" against a button
       * showing "Keep this page" — no overlap, so voice control could not
       * activate the only control that prevents a page being deleted at
       * publish: the user says what they see and nothing happens.
       */}
      {onUndoRemoval ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUndoRemoval}
            disabled={undoPending}
            aria-label={`Keep this page: ${change.title}`}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Keep this page
          </Button>
        </div>
      ) : null}
      {change.degraded ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-content-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            We couldn&apos;t read this section&apos;s saved settings, so it may be listed
            as changed even if you didn&apos;t touch it.
          </span>
        </p>
      ) : null}
    </li>
  );
}

interface BlockingIssuesProps {
  issues: readonly Issue[];
  snapshot: SiteSnapshot;
  /** Group id → page name, so a page issue names the page and not `page:47`. */
  pageLabels: ReadonlyMap<string, string>;
  /**
   * `block_order` → group id, so a SECTION issue can name its page too.
   *
   * Already built by `useSiteDiff` for change grouping; this reuses it rather
   * than deriving a second slot→page map that could disagree with the one the
   * change list is grouped by.
   */
  slotGroups: ReadonlyMap<number, string>;
  onFix: (slot: number) => void;
  canFix: boolean;
  /**
   * Opens the Pages panel. Page-set problems are fixed there and nowhere else,
   * and `issueTarget` cannot produce a slot for them — so without this they
   * were the only blocking issues with no route out of the sheet at all.
   *
   * Required for the same reason as `PublishSheetProps.onGoToPages`: its absence
   * deletes the action rather than degrading it.
   */
  onGoToPages: () => void;
}

function BlockingIssues({
  issues,
  snapshot,
  pageLabels,
  slotGroups,
  onFix,
  canFix,
  onGoToPages,
}: BlockingIssuesProps) {
  return (
    <section
      role="alert"
      aria-labelledby="publish-blocking-heading"
      className={cn(
        'space-y-3 rounded-md border border-status-danger-border bg-status-danger-bg p-4',
      )}
    >
      <h3
        id="publish-blocking-heading"
        className="flex items-center gap-2 text-sm font-semibold text-content"
      >
        <AlertTriangle className="h-4 w-4 text-status-danger" aria-hidden="true" />
        {issues.length === 1
          ? 'One problem is stopping this publish'
          : `${issues.length} problems are stopping this publish`}
      </h3>
      <ul className="space-y-3">
        {issues.map((issue, index) => {
          const target = issueTarget(issue.field, snapshot);
          const name = describeTarget(issue, snapshot, pageLabels, slotGroups);
          const isPageIssue = issue.field.startsWith('page:') || issue.field.startsWith('pages.');
          return (
            <li key={`${issue.field}-${index}`} className="space-y-1 text-sm">
              <p className="font-medium text-content">{name}</p>
              <p className="text-content-secondary">{issue.message}</p>
              {canFix && target ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // Disambiguated: every issue renders a button reading "Fix
                  // this", so a screen-reader user tabbing the list hears the
                  // same name N times. The visible label is contained in the
                  // accessible one, which keeps it WCAG 2.5.3-safe.
                  aria-label={`Fix this: ${name}`}
                  onClick={() => onFix(target.slot)}
                >
                  Fix this
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : isPageIssue ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Go to Pages: ${name}`}
                  onClick={onGoToPages}
                >
                  Go to Pages
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A human name for whatever an issue is about.
 *
 * Names the offender rather than the field path: "Section 4 (FAQ)" is
 * actionable, `sections.2.content.items.0.question` is not. Falls back to the
 * raw field only for issues that are not about a section at all.
 */
function describeTarget(
  issue: Issue,
  snapshot: SiteSnapshot,
  pageLabels: ReadonlyMap<string, string>,
  slotGroups: ReadonlyMap<number, string>,
): string {
  if (issue.field === 'hero' || issue.field.startsWith('hero.')) {
    return 'Welcome section';
  }
  const target = issueTarget(issue.field, snapshot);
  if (target) {
    /*
     * Named with its PAGE once the site has more than one.
     *
     * `Section 12 (faq)` is a slot number, and a slot number appears on no
     * other surface in the editor — not on a `SectionList` row, not on the
     * canvas — so on a multi-page site it named an offender the PM could not
     * locate without pressing "Fix this" and being carried away from the list
     * they were triaging. Cross-page issues are the norm, not an edge: the
     * publish diff is whole-site by design (D-C2) while the editor context is
     * page-scoped, which is the entire reason `handleSelectSlot` exists.
     *
     * The page branch below has named its page since round 6; this branch is
     * the half of the same function that was left in machine syntax.
     *
     * Omitted, not defaulted, when the slot maps to no page: a bare section
     * name is honest, "— site" is not. (`buildSlotGroups` `continue`s on a null
     * `pageId` and only ever stores `String(block.pageId)`, so the site-wide
     * sentinel is never a VALUE here — only `groupForChange` mints it. An
     * earlier version of this comment named that branch as reachable.)
     *
     * And omitted entirely on a ONE-page site, where every section is on the
     * only page there is and the suffix would be pure noise — the ambiguity
     * this resolves does not exist until there are two pages to confuse.
     */
    const pageLabel =
      pageLabels.size > 1 ? pageLabels.get(slotGroups.get(target.slot) ?? '') : undefined;
    const suffix = pageLabel ? ` — ${pageLabel}` : '';
    return `Section ${target.slot} (${target.blockType})${suffix}`;
  }
  /*
   * Page-SET issues, which reach this component for the first time in 11b-3.
   *
   * `pageIssues` emits `page:<id>.<field>` and `pages.home`, and neither is a
   * `sections.<n>` path, so both fell through to the raw `issue.field` — the
   * PM was shown a heading reading `page:47.slug`. Making the block visible
   * before the button (which is what running `pageIssues` client-side bought)
   * is only half the job if the offender is named in machine syntax.
   */
  const pageMatch = /^page:([^.]+)\./.exec(issue.field);
  if (pageMatch) {
    const label = pageLabels.get(pageMatch[1]!);
    // The label, not the id, and never the raw field. A page the pages query
    // has not resolved falls back to a phrase that is still a sentence.
    return label ? `${label} page` : 'One of your pages';
  }
  if (issue.field === 'pages.home') return 'Your site as a whole';
  return issue.field;
}

function WarningList({ issues }: { issues: readonly Issue[] }) {
  return (
    <section aria-labelledby="publish-warnings-heading" className="space-y-2">
      <h3
        id="publish-warnings-heading"
        className="flex items-center gap-2 text-sm font-semibold text-content"
      >
        <Info className="h-4 w-4 text-status-warning" aria-hidden="true" />
        {issues.length === 1
          ? "One thing worth a look — it won't stop you publishing"
          : `${issues.length} things worth a look — they won't stop you publishing`}
      </h3>
      <ul className="space-y-1 text-sm text-content-secondary">
        {issues.map((issue, index) => (
          <li key={`${issue.field}-${index}`}>{issue.message}</li>
        ))}
      </ul>
    </section>
  );
}
