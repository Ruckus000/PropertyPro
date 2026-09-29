'use client';

/**
 * The unit panel: everything about one unit — who lives there, where the
 * renewal stands, the lease terms, the §83.49 deposit record, and the lease
 * history — with the actions that apply right now. The title is the unit,
 * not the resident's name again (v2 refinement).
 *
 * Statute facts are shown as information, never as advice; the panel footer
 * carries the not-legal-advice line whenever one is shown.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { Button } from '@/components/ui/button';
import {
  depositDispositionDeadlines,
  depositNoticeDue,
  depositNoticeLate,
  nonRenewalNoticeDeadline,
  termMonthsFor,
} from '@/lib/leases/lease-state';
import { initials, inDays, peopleOn, type PersonDirectory, type RosterLease, type UnitModel } from '@/lib/leases/roster-model';
import type { RosterDialog } from './types';
import { LeaseStatus } from './LeaseStatus';
import { HELD_OPTIONS } from './dialogs/form-kit';
import { LEASE_HELP_SLUGS } from './help-slugs';

const fmt = (d: string | null | undefined) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : '—';
const money = (v: string | null | undefined) =>
  v == null ? 'Not recorded' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const HELD: Record<string, string> = Object.fromEntries(HELD_OPTIONS.map((o) => [o.value, o.label]));

type Fact = { tone: 'info' | 'warning'; text: string };

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-edge-subtle py-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-content">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-content-secondary">{label}</dt>
      <dd className="text-right text-content">{value}</dd>
    </div>
  );
}

function termText(l: RosterLease): string {
  if (!l.endDate) return 'Month-to-month';
  const n = termMonthsFor(l.startDate, l.endDate);
  return n ? `${n} ${n === 1 ? 'month' : 'months'}` : 'Custom term';
}

export function UnitPanel({
  model,
  communityId,
  today,
  directory,
  onClose,
  onDialog,
  onQuickAction,
  onHelp,
}: {
  model: UnitModel | null;
  communityId: number;
  today: string;
  directory: PersonDirectory;
  onClose: () => void;
  onDialog: (d: RosterDialog) => void;
  /** One-click changes the page performs (with a confirmation toast and undo). */
  onQuickAction: (a: { kind: 'cancel-move-out' | 'convert-m2m'; lease: RosterLease }) => void;
  onHelp?: (slug: string) => void;
}) {
  if (!model) return null;
  const m = model;
  const c = m.current;
  const s = m.state;
  const unitId = m.unit.id;
  const facts: Fact[] = [];
  let citesStatute = false;

  // Whether the deposit is travelling with a transfer is recorded on the
  // deposit itself, not implied by how the lease ends.
  const depositCarried = !!c?.deposits?.some((d) => d.disposition === 'carried_to_transfer');
  if (c && s.stopDate && !depositCarried) {
    const { refundBy, claimBy } = depositDispositionDeadlines(s.stopDate);
    facts.push({ tone: 'info', text: `After move-out: return the deposit by ${fmt(refundBy)}, or send a claim notice by certified mail by ${fmt(claimBy)} (§83.49).` });
    citesStatute = true;
  }
  if (c && depositCarried) {
    facts.push({ tone: 'info', text: 'The deposit moves to the new lease, so no §83.49 refund or claim is due for this unit.' });
    citesStatute = true;
  }
  if (c && !s.stopDate && c.endDate && c.noticeDays && !s.renewalSigned) {
    const deadline = nonRenewalNoticeDeadline(c.endDate, c.noticeDays)!;
    facts.push(
      deadline >= today
        ? { tone: 'info', text: `The resident must give ${c.noticeDays} days’ notice to move out at term end, by ${fmt(deadline)} (§83.575).` }
        : { tone: 'warning', text: `The ${c.noticeDays}-day notice deadline passed on ${fmt(deadline)} with no notice recorded (§83.575).` },
    );
    citesStatute = true;
  }
  if (s.kind === 'holdover' && c?.endDate) {
    facts.push({ tone: 'warning', text: `The lease ended on ${fmt(c.endDate)} and the resident is still in the unit. Send a renewal offer or record a move-out.` });
  }
  if (c?.rentAmount == null && c) {
    facts.push({ tone: 'warning', text: 'Rent is not recorded for this lease. Edit the lease to add it.' });
  }

  // A renewal with an unchanged deposit keeps it on the lease it renews, so
  // look back along the renewal chain before saying "not recorded".
  const depositOf = (l: RosterLease | null | undefined) =>
    l?.deposits?.filter((d) => !d.disposition).at(-1) ?? l?.deposits?.at(-1) ?? null;
  let depositLease: RosterLease | null = c;
  let deposit = depositOf(c);
  for (let prevId = c?.previousLeaseId ?? null; !deposit && prevId != null; ) {
    const prev = m.past.find((l) => l.id === prevId) ?? null;
    deposit = depositOf(prev);
    if (deposit) depositLease = prev;
    prevId = prev?.previousLeaseId ?? null;
  }
  const noticeDue = deposit ? depositNoticeDue(deposit.receivedOn) : null;
  if (deposit && !deposit.noticeSentOn && noticeDue) {
    facts.push({
      tone: noticeDue < today ? 'warning' : 'info',
      text: `Deposit notice ${noticeDue < today ? 'was due' : 'is due'} by ${fmt(noticeDue)} (§83.49(2)).`,
    });
    citesStatute = true;
  }

  // ── Actions that apply now ─────────────────────────────────────────────
  const act: Array<{ label: string; primary?: boolean; run: () => void }> = [];
  if (s.kind === 'offline') {
    act.push({ label: 'Bring back online', primary: true, run: () => onDialog({ kind: 'offline', unitId }) });
  } else if (!c && !m.next) {
    act.push({ label: 'New lease', primary: true, run: () => onDialog({ kind: 'lease', mode: 'new', unitId }) });
    act.push({ label: 'Take offline', run: () => onDialog({ kind: 'offline', unitId }) });
  } else if (c) {
    if (s.kind === 'holdover' && !s.movingOut) {
      // An offer cannot fix a holdover: the new term would start in the past.
      // Either the resident stays month to month, or they are leaving.
      act.push({ label: 'Convert to month-to-month', primary: true, run: () => onQuickAction({ kind: 'convert-m2m', lease: c }) });
      act.push({ label: 'Record move-out', run: () => onDialog({ kind: 'move-out', unitId, mode: 'notice' }) });
    } else if (s.kind === 'month_to_month' && !s.movingOut && !m.next && (m.stage === null || m.stage === 'offer_expired')) {
      act.push({ label: 'Offer a fixed term', run: () => onDialog({ kind: 'offer', unitId }) });
    } else if (m.stage === 'not_started' || m.stage === 'offer_expired') {
      act.push({ label: m.stage === 'offer_expired' ? 'Resend offer' : 'Send offer', primary: true, run: () => onDialog({ kind: 'offer', unitId }) });
    }
    if (m.stage === 'offer_sent') act.push({ label: 'Record response', primary: true, run: () => onDialog({ kind: 'offer-response', unitId }) });
    if (m.stage === 'accepted') {
      act.push({ label: 'Record renewal', primary: true, run: () => onDialog({ kind: 'record-renewal', unitId }) });
      // The resident can still change their mind before signing.
      act.push({ label: 'Change response', run: () => onDialog({ kind: 'offer-response', unitId }) });
    }
    if (s.movingOut && !m.next) act.push({ label: 'Pre-lease this unit', primary: true, run: () => onDialog({ kind: 'lease', mode: 'new', unitId }) });
    if (s.movingOut && !m.next) {
      act.push({
        label: c.endVia === 'early' ? 'Cancel early end' : 'Cancel move-out',
        run: () => onQuickAction({ kind: 'cancel-move-out', lease: c }),
      });
    }
    if (!s.movingOut && !m.next && s.kind !== 'holdover' && m.stage !== 'signed') {
      act.push({ label: 'Resident gave notice', run: () => onDialog({ kind: 'move-out', unitId, mode: 'notice' }) });
      act.push({ label: 'End early', run: () => onDialog({ kind: 'move-out', unitId, mode: 'early' }) });
      act.push({ label: 'Transfer to another unit', run: () => onDialog({ kind: 'transfer', unitId }) });
    }
    act.push({ label: 'Edit lease', run: () => onDialog({ kind: 'lease', mode: 'edit', unitId, leaseId: c.id }) });
    act.push({ label: 'Deposit', run: () => onDialog({ kind: 'deposit', unitId, leaseId: (depositLease ?? c).id }) });
  }
  if (c && s.movingOut && c.endVia === 'transfer') {
    facts.push({ tone: 'info', text: 'To cancel this transfer, cancel the upcoming lease on the new unit first, then choose Cancel move-out here.' });
  }

  const nextPeople = peopleOn(m.next, directory);

  return (
    <SlideOverPanel open onClose={onClose} title={`Unit ${m.unit.unitNumber}`} description={[m.unit.building, m.unit.floor != null ? `Floor ${m.unit.floor}` : null].filter(Boolean).join(' · ') || undefined}>
      <div className="flex flex-col">
        <div className="mb-4 flex items-center gap-3">
          <LeaseStatus status={m.status} />
          {c?.endDate && s.daysUntil !== null && s.kind !== 'ending' && (
            <span className="text-sm text-content-secondary">Ends {fmt(c.endDate)} · {inDays(s.daysUntil)}</span>
          )}
        </div>

        {facts.length > 0 && (
          <ul className="mb-4 space-y-2">
            {facts.map((f) => (
              <li
                key={f.text}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm',
                  f.tone === 'warning'
                    ? 'border-status-warning-border bg-status-warning-bg text-content'
                    : 'border-edge bg-surface-muted text-content',
                )}
              >
                {f.text}
              </li>
            ))}
          </ul>
        )}

        {act.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {act.map((a) => (
              <Button key={a.label} size="sm" variant={a.primary ? 'default' : 'outline'} onClick={a.run}>
                {a.label}
              </Button>
            ))}
          </div>
        )}

        {(c || m.next) && (
          <Section title="Residents">
            <ul className="space-y-2">
              {(c ? m.people : nextPeople).map((p) => (
                <li key={`${p.userId ?? ''}${p.contactId ?? ''}`} className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-content-secondary">
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-content">{p.name}</div>
                    <div className="truncate text-xs text-content-secondary">
                      {p.isPrimary ? 'Primary' : 'Co-tenant'}
                      {p.email ? ` · ${p.email}` : p.contactId ? ' · No email — notices by mail or hand' : ''}
                    </div>
                  </div>
                  {p.userId && (
                    <Link
                      href={`/dashboard/residents?communityId=${communityId}`}
                      aria-label={`View resident: ${p.name}`}
                      className="rounded text-sm font-medium text-interactive hover:text-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
                    >
                      View resident
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {m.offer && c && (
          <Section
            title="Renewal"
            action={
              onHelp ? (
                <button type="button" onClick={() => onHelp(s.kind === 'holdover' ? LEASE_HELP_SLUGS.moveOutAndHoldovers : LEASE_HELP_SLUGS.renewingALease)} className="rounded text-xs font-medium text-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus">
                  How renewals work
                </button>
              ) : undefined
            }
          >
            <dl>
              <Row label="Offer" value={`${money(m.offer.offerRent)} · ${m.offer.termMonths ? `${m.offer.termMonths} months` : m.offer.customEndDate ? 'Custom term' : 'Month-to-month'}`} />
              <Row label="Sent" value={fmt(m.offer.sentOn)} />
              <Row label="Expires" value={fmt(m.offer.expiresOn)} />
              <Row label="Starts" value={fmt(m.offer.startDate)} />
            </dl>
          </Section>
        )}

        {c && (
          <Section title="Current lease">
            <dl>
              <Row label="Term" value={`${fmt(c.startDate)} – ${c.endDate ? fmt(c.endDate) : 'no end date'} · ${termText(c)}`} />
              <Row label="Rent" value={c.zeroRentReason ? `$0 · ${c.zeroRentReason.replace(/_/g, ' ')}` : money(c.rentAmount)} />
              <Row label="Move-out notice required" value={c.endDate ? (c.noticeDays ? `${c.noticeDays} days` : 'Not recorded') : '30 days (§83.57)'} />
              {c.signedDocumentId ? <Row label="Signed lease" value="Attached" /> : null}
              {c.notes && <Row label="Notes" value={<span className="whitespace-pre-wrap">{c.notes}</span>} />}
            </dl>
          </Section>
        )}

        {m.next && (
          <Section title={s.renewalSigned ? 'Signed renewal' : 'Upcoming lease'}>
            <dl>
              <Row label="Term" value={`${fmt(m.next.startDate)} – ${m.next.endDate ? fmt(m.next.endDate) : 'no end date'}`} />
              <Row label="Rent" value={money(m.next.rentAmount)} />
              {!c && <Row label="Residents" value={nextPeople.map((p) => p.name).join(', ') || '—'} />}
            </dl>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onDialog({ kind: 'lease', mode: 'edit', unitId, leaseId: m.next!.id })}>
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDialog({ kind: 'cancel-lease', unitId, leaseId: m.next!.id })}>
                Cancel before move-in
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDialog({ kind: 'deposit', unitId, leaseId: m.next!.id })}>
                Deposit
              </Button>
            </div>
          </Section>
        )}

        {c && (
          <Section title="Deposit (§83.49)">
            {deposit ? (
              <dl>
                <Row label="Amount" value={money(deposit.amount)} />
                <Row label="How it is held" value={deposit.heldMethod ? HELD[deposit.heldMethod] : 'Not recorded'} />
                <Row
                  label="Written notice"
                  value={
                    deposit.noticeSentOn
                      ? `Sent ${fmt(deposit.noticeSentOn)}${depositNoticeLate(deposit.receivedOn, deposit.noticeSentOn) ? ' (late)' : ''}`
                      : 'Not sent'
                  }
                />
              </dl>
            ) : (
              <p className="text-sm text-content-secondary">Deposit not recorded.</p>
            )}
          </Section>
        )}

        {m.past.length > 0 && (
          <Section title="Lease history">
            <ul className="space-y-2">
              {m.past.map((l) => (
                <li key={l.id} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-content">
                      {peopleOn(l, directory).map((p) => p.name).join(', ') || 'Unknown resident'}
                    </div>
                    {/* Refunds and claims (§83.49(3)) are recorded AFTER the lease ends. */}
                    <button
                      type="button"
                      onClick={() => onDialog({ kind: 'deposit', unitId, leaseId: l.id })}
                      className="shrink-0 rounded text-xs font-medium text-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
                    >
                      Deposit
                    </button>
                  </div>
                  <div className="text-xs text-content-secondary">
                    {l.status === 'cancelled'
                      ? `Cancelled · was to start ${fmt(l.startDate)}${l.cancelledReason ? ` · ${l.cancelledReason}` : ''}`
                      : `${fmt(l.startDate)} – ${fmt(l.moveOutOn ?? l.endDate)} · ${money(l.rentAmount)}`}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {citesStatute && (
          <p className="mt-2 text-xs text-content-tertiary">
            Florida statute references are for orientation, not legal advice.
          </p>
        )}
      </div>
    </SlideOverPanel>
  );
}
