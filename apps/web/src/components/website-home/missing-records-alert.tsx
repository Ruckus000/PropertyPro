'use client';

/**
 * The website home's Records section (spec C2, D11), shaped by the statute's
 * `requirementLevel`:
 *
 * - `required`, with records missing and the alert not snoozed: the amber
 *   alert. It says how many records linked themselves from Documents, lists
 *   each missing one with **Upload**, offers the documents that may be it
 *   ("Use this one"), and lists the records that may not apply with their hint
 *   and **Doesn't apply**. It ends with **Add several at once**, **Remind me
 *   next week** and the statute line.
 * - `recommended`: one sentence, no alert.
 * - `none` (apartments): nothing.
 *
 * Every link is the person's choice and the only one: an upload here asks the
 * server not to link the document itself (`skipAutoLink`), then links it to
 * this row's record. Otherwise posting could link it to another record the
 * rules prefer, and one file would fill two.
 *
 * After any change the page is refreshed (`router.refresh`), so the list is
 * read again by the page's loader rather than patched here.
 */
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BellOff, CircleAlert, CircleCheck, Clock, FileText, TriangleAlert } from 'lucide-react';
import type { RequirementLevel } from '@propertypro/shared';
import { getTemplateDocumentCategory } from '@/components/compliance/compliance-visibility';
import { Button } from '@/components/ui/button';
import { useComplianceMutations } from '@/hooks/use-compliance-mutations';
import { useRecordsAlert } from '@/hooks/use-records-alert';
import type { MissingRecord } from '@/lib/site-editor/records-status';
import { cn } from '@/lib/utils';
import { APPLIES_HINT } from './records/applies-hint';
import { TOUCH } from './touch';
import { LazyAddRecordsDrawer, LazyNotApplicableDialog, LazyUploadDocumentModal } from './website-home-lazy';

export const STATUTE_LINE = "This list shows what the statute names. It isn't legal advice.";

export interface MissingRecordsAlertProps {
  communityId: number;
  records: {
    level: RequirementLevel;
    missing: MissingRecord[];
    conditional: MissingRecord[];
    autoLinked: number;
    candidates: Record<number, Array<{ documentId: number; title: string }>>;
    snoozedUntil: string | null;
  };
  /** Formats the snooze's end date, in the community's time zone. */
  formatDate: (iso: string) => string;
}

const STATE: Record<MissingRecord['state'], { label: string; Icon: typeof CircleAlert; tone: string }> = {
  nothing_posted: { label: 'Not posted yet', Icon: CircleAlert, tone: 'text-status-danger' },
  not_posted: { label: 'Saved as a draft, not posted', Icon: FileText, tone: 'text-status-warning' },
  out_of_date: { label: 'Out of date: a newer one is due', Icon: Clock, tone: 'text-status-warning' },
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function MissingRecordsAlert({ communityId, records, formatDate }: MissingRecordsAlertProps) {
  const router = useRouter();
  const { linkDocument } = useComplianceMutations(communityId);
  const { snooze } = useRecordsAlert(communityId, { enabled: false });
  const [uploading, setUploading] = useState<MissingRecord | null>(null);
  const [applying, setApplying] = useState<MissingRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(records.snoozedUntil);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ itemId: number; text: string } | null>(null);

  if (records.level === 'none') return null;

  const { missing, conditional, autoLinked, candidates } = records;

  async function link(item: MissingRecord, documentId: number, failure: string) {
    setLinkingId(item.itemId);
    setRowError(null);
    try {
      await linkDocument.mutateAsync({ itemId: item.itemId, documentId });
      router.refresh();
    } catch {
      setRowError({ itemId: item.itemId, text: failure });
    } finally {
      setLinkingId(null);
    }
  }

  function remindNextWeek() {
    snooze.mutate(undefined, {
      onSuccess: ({ snoozedUntil: until }) => {
        setSnoozedUntil(until);
        router.refresh();
      },
      onError: () => toast.error("We couldn't snooze the reminder just now. Please try again."),
    });
  }

  function renderRow(item: MissingRecord, kind: 'missing' | 'conditional') {
    const matches = candidates[item.itemId] ?? [];
    const busy = linkingId === item.itemId;
    const state = STATE[item.state];
    return (
      <li key={item.itemId} className="rounded-md border border-edge bg-surface-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-content">{item.title}</p>
            {kind === 'missing' ? (
              <p className={cn('flex items-center gap-1.5 text-sm', state.tone)}>
                <state.Icon className="size-4 shrink-0" aria-hidden="true" />
                {state.label}
              </p>
            ) : (
              APPLIES_HINT[item.templateKey] && (
                <p className="text-sm text-content-secondary">{APPLIES_HINT[item.templateKey]}</p>
              )
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={TOUCH}
              aria-label={`Upload: ${item.title}`}
              disabled={busy}
              onClick={() => setUploading(item)}
            >
              Upload
            </Button>
            {kind === 'conditional' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={TOUCH}
                aria-label={`Doesn't apply: ${item.title}`}
                disabled={busy}
                onClick={() => setApplying(item)}
              >
                Doesn&apos;t apply
              </Button>
            )}
          </div>
        </div>
        {matches.length > 0 && (
          <div className="mt-3 border-t border-edge-subtle pt-3">
            <p className="text-sm text-content-secondary">Possible matches in Documents:</p>
            <ul className="mt-1 space-y-1">
              {matches.map((match) => (
                <li key={match.documentId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-sm text-content">{match.title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={TOUCH}
                    aria-label={`Use ${match.title} for ${item.title}`}
                    disabled={busy}
                    onClick={() =>
                      void link(item, match.documentId, `We couldn't link ${match.title} to ${item.title}. Please try again.`)
                    }
                  >
                    Use this one
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {rowError?.itemId === item.itemId && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-status-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {rowError.text}
          </p>
        )}
      </li>
    );
  }

  let body: ReactNode;
  if (records.level === 'recommended') {
    body = (
      <p className="text-sm text-content-secondary">
        Florida&apos;s website rule doesn&apos;t cover associations of this size, so this list is a recommendation.
        Many associations post these records anyway.
      </p>
    );
  } else if (missing.length > 0 && snoozedUntil) {
    body = (
      <p className="flex items-start gap-2 text-sm text-content-secondary">
        <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {missing.length} {plural(missing.length, 'record is', 'records are')} still missing. We&apos;ll remind you
          again on {formatDate(snoozedUntil)}.
        </span>
      </p>
    );
  } else if (missing.length > 0) {
    body = (
      <div
        data-testid="missing-records-alert"
        className="space-y-4 rounded-md border border-status-warning-border bg-status-warning-bg p-4"
      >
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-status-warning" aria-hidden="true" />
          <div className="space-y-1 text-sm text-content">
            {autoLinked > 0 && (
              <p>
                {autoLinked} {plural(autoLinked, 'record was', 'records were')} linked automatically from Documents.
              </p>
            )}
            <p className="font-semibold">
              {missing.length} {plural(missing.length, 'record is', 'records are')} still missing:
            </p>
          </div>
        </div>
        <ul className="space-y-2">{missing.map((item) => renderRow(item, 'missing'))}</ul>
        {conditional.length > 0 && (
          <>
            <p className="text-sm font-semibold text-content">These may not apply to you:</p>
            <ul className="space-y-2">{conditional.map((item) => renderRow(item, 'conditional'))}</ul>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" className={TOUCH} onClick={() => setDrawerOpen(true)}>
            Add several at once
          </Button>
          <Button type="button" variant="ghost" className={TOUCH} disabled={snooze.isPending} onClick={remindNextWeek}>
            Remind me next week
          </Button>
        </div>
        <p className="text-xs text-content-secondary">{STATUTE_LINE}</p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-content">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
          No records are missing from your website.
        </p>
        {conditional.length > 0 && (
          <>
            <p className="text-sm font-semibold text-content">These may apply to you:</p>
            <ul className="space-y-2">{conditional.map((item) => renderRow(item, 'conditional'))}</ul>
          </>
        )}
        <p className="text-xs text-content-secondary">{STATUTE_LINE}</p>
      </div>
    );
  }

  return (
    <section id="records" aria-labelledby="records-heading" className="scroll-mt-6 space-y-3">
      <h2 id="records-heading" className="text-lg font-semibold text-content">
        Records
      </h2>
      {body}

      {uploading && (
        <LazyUploadDocumentModal
          communityId={communityId}
          defaultTitle={uploading.title}
          categoryName={getTemplateDocumentCategory(uploading.templateKey, uploading.category)}
          skipAutoLink
          onUploaded={(documentId) => {
            const item = uploading;
            void link(
              item,
              documentId,
              `Your file is posted in Documents, but we couldn't link it to ${item.title}. You can link it from the Compliance page.`,
            );
          }}
          onClose={() => setUploading(null)}
        />
      )}
      {applying && (
        <LazyNotApplicableDialog
          communityId={communityId}
          item={applying}
          onDone={(marked) => {
            setApplying(null);
            if (marked) router.refresh();
          }}
        />
      )}
      {drawerOpen && (
        <LazyAddRecordsDrawer
          communityId={communityId}
          missing={missing}
          conditional={conditional}
          onClose={() => {
            setDrawerOpen(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
