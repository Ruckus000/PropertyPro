/**
 * Printable audit record: everything that happened to one person or item (or
 * the whole community, for a period), oldest first, laid out for paper or PDF.
 * It is what a board gives an attorney or an owner asks for in a dispute.
 *
 * Route: /audit-trail/print?communityId=X&<audit query> (see lib/audit/audit-query.ts)
 * Lives in its own route group so the app shell (sidebar, top bar) never
 * prints. Same gate as the audit trail page: managers only.
 *
 * Producing the record writes an `audit_evidence_generated` entry
 * (buildAuditPrintRecord), because it can show who opened what.
 */
// responsive-geometry:exempt — print layout: the shared Table's scroll box would clip columns on paper.
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { isAdminRole } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { AuditQueryError, parseAuditQuery, periodStartDate } from '@/lib/audit/audit-query';
import { AUDIT_VIEW_PHRASES, periodLabel } from '@/lib/audit/audit-catalog';
import { describeAuditEvent, formatDateTime, type DescribeContext } from '@/lib/audit/describe-event';
import { AUDIT_PRINT_MAX_ENTRIES, buildAuditPrintRecord } from '@/lib/services/audit-trail-service';
import { AuditPrintActions } from '@/components/audit/AuditPrintActions';

export const metadata: Metadata = { title: 'Audit record', robots: { index: false } };

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function one(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default async function AuditPrintPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);
  if (!isAdminRole(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  const backParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && key !== 'label') backParams.set(key, value);
  }
  const backHref = `/audit-trail?${backParams.toString()}`;

  let query;
  try {
    query = parseAuditQuery((key) => one(params[key]));
  } catch (err) {
    if (err instanceof AuditQueryError) redirect(`/audit-trail?communityId=${communityId}`);
    throw err;
  }

  const record = await buildAuditPrintRecord({
    communityId,
    actorUserId: userId,
    filters: { view: query.view, scope: query.scope, startDate: periodStartDate(query.period) },
    fallbackLabel: one(params['label']),
  });

  const timeZone = membership.timezone;
  const ctx: DescribeContext = { users: record.users, resources: record.resources, timeZone };
  const generatedBy = record.users[userId] ?? 'a manager';
  const subject = record.scopeLabel ?? (query.scope ? 'the selected item' : membership.communityName);
  const described = record.entries.map((entry) => ({ entry, d: describeAuditEvent(entry, ctx) }));
  const main = described.filter((x) => !x.d.routine);
  const routine = described.filter((x) => x.d.routine);
  const where = [membership.city, membership.state].filter(Boolean).join(', ');

  return (
    <main className="mx-auto max-w-3xl bg-surface-card px-6 py-10 text-content print:max-w-none print:px-0 print:py-0">
      <AuditPrintActions backHref={backHref} />

      <header className="border-b-2 border-content pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl">Audit record: {subject}</h1>
            <p className="mt-1 text-base text-content-secondary">
              {membership.communityName}
              {where && ` · ${where}`}
            </p>
          </div>
          <p className="text-right text-sm text-content-secondary">
            Generated {formatDateTime(new Date().toISOString(), timeZone)}
            <br />
            by {generatedBy}
          </p>
        </div>
      </header>

      <section className="mt-4 space-y-1 text-sm text-content-secondary">
        <p>
          Showing: {AUDIT_VIEW_PHRASES[query.view]}, {periodLabel(query.period).toLowerCase()}.{' '}
          {record.entries.length.toLocaleString('en-US')} {record.entries.length === 1 ? 'entry' : 'entries'}, oldest
          first.
        </p>
        <p>
          Each entry was recorded when the action happened and cannot be edited or deleted. Each record number matches an
          entry in the association’s audit trail.
        </p>
        {record.truncated && (
          <p className="font-medium text-status-warning">
            This history is longer than {AUDIT_PRINT_MAX_ENTRIES.toLocaleString('en-US')} entries, so only the most recent{' '}
            {AUDIT_PRINT_MAX_ENTRIES.toLocaleString('en-US')} are included. Choose a shorter period to print the rest.
          </p>
        )}
      </section>

      {main.length === 0 && routine.length === 0 ? (
        <p className="mt-8 text-base text-content-secondary">Nothing was recorded for this selection.</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge-strong text-left text-content-tertiary">
              <th scope="col" className="w-20 py-2 pr-3 font-medium">Record</th>
              <th scope="col" className="w-44 py-2 pr-3 font-medium">When</th>
              <th scope="col" className="py-2 font-medium">What happened</th>
            </tr>
          </thead>
          <tbody>
            {main.map(({ entry, d }) => (
              <tr key={entry.id} className="break-inside-avoid border-b border-edge align-top">
                <td className="py-2.5 pr-3 font-mono text-xs text-content-tertiary">#{entry.id}</td>
                <td className="py-2.5 pr-3">{formatDateTime(entry.createdAt, timeZone, true)}</td>
                <td className="py-2.5">
                  <p>
                    {d.sentence}
                    {d.badge && <span className="font-medium"> [{d.badge.label}]</span>}
                  </p>
                  {d.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-content-secondary">
                      {d.changes.map((c) => (
                        <li key={c.label}>
                          {c.label}:{' '}
                          {c.before !== null && c.after !== null
                            ? `${c.before} → ${c.after}`
                            : c.after !== null
                              ? c.after
                              : `${c.before} (removed)`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.note && <p className="mt-1 text-content-secondary">Note: {d.note.text}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {routine.length > 0 && (
        <section className="mt-10 break-before-page">
          <h2 className="font-display text-xl">Appendix: routine activity</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Document views, automatic charges and similar entries, listed separately so the main record stays readable.
          </p>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-edge-strong text-left text-content-tertiary">
                <th scope="col" className="w-20 py-2 pr-3 font-medium">Record</th>
                <th scope="col" className="w-44 py-2 pr-3 font-medium">When</th>
                <th scope="col" className="py-2 font-medium">What happened</th>
              </tr>
            </thead>
            <tbody>
              {routine.map(({ entry, d }) => (
                <tr key={entry.id} className="break-inside-avoid border-b border-edge align-top">
                  <td className="py-1.5 pr-3 font-mono text-xs text-content-tertiary">#{entry.id}</td>
                  <td className="py-1.5 pr-3">{formatDateTime(entry.createdAt, timeZone)}</td>
                  <td className="py-1.5">{d.sentence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-10 border-t border-edge pt-3 text-xs text-content-tertiary">
        Contains personal information. Share only with people authorized to see official records.
      </footer>
    </main>
  );
}
