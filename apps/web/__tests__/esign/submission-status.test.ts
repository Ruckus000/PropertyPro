/**
 * One derived reading of a signature request.
 *
 * The E-Sign screen asks the same question from three ends — what did we send,
 * who is holding something up, what can we send again — and every one of those
 * needs the same handful of facts about a request. They live here so the three
 * views provably agree, and so they can be tested without a DOM.
 *
 * The sequential-blocking rule in particular was written THREE times before
 * this module existed: privately in `submission-detail.tsx`, again inside
 * `sendReminder`, and a third time as `getSignerContext`'s `isWaiting`. The
 * restructure needed it in three more places.
 */
import { describe, expect, it } from 'vitest';
import {
  ESIGN_URGENT_WINDOW_DAYS,
  canRemind,
  canShareLink,
  countByStatus,
  daysLeft,
  describeExpiry,
  filterRequests,
  blockingPriorSignerFor,
  isOpenSigner,
  mostUrgentRequest,
  outstandingSigners,
  requestTitle,
  signatureProgress,
  type EsignRequest,
  type EsignRequestSigner,
} from '@/lib/esign/submission-status';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function at(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY).toISOString();
}

function signer(over: Partial<EsignRequestSigner> = {}): EsignRequestSigner {
  return {
    id: 1,
    // Required by the type but never read by this module and never asserted
    // here; `null` is its "external party" value, which is what an absent
    // property already meant to every code path under test.
    userId: null,
    name: 'Alice Owner',
    email: 'alice@test.com',
    role: 'owner',
    status: 'pending',
    sortOrder: 0,
    slug: 'slug-alice',
    completedAt: null,
    lastReminderAt: null,
    reminderCount: 0,
    ...over,
  };
}

function request(over: Partial<EsignRequest> = {}): EsignRequest {
  return {
    id: 10,
    externalId: 'sub-ext-10',
    messageSubject: 'Limited proxy',
    templateName: 'Proxy Designation Form',
    status: 'pending',
    effectiveStatus: 'pending',
    signingOrder: 'parallel',
    expiresAt: at(10),
    completedAt: null,
    createdAt: at(-2),
    signedDocumentPath: null,
    signers: [signer()],
    ...over,
  };
}

describe('requestTitle', () => {
  it('prefers the subject the sender wrote', () => {
    expect(requestTitle(request())).toBe('Limited proxy');
  });

  it('falls back to the template, then to the id — never to blank', () => {
    expect(requestTitle(request({ messageSubject: null }))).toBe('Proxy Designation Form');
    expect(requestTitle(request({ messageSubject: '   ' }))).toBe('Proxy Designation Form');
    expect(requestTitle(request({ messageSubject: null, templateName: null }))).toBe(
      'Request #10',
    );
  });
});

describe('signatureProgress', () => {
  it('counts only completed signers', () => {
    const r = request({
      signers: [
        signer({ id: 1, status: 'completed' }),
        signer({ id: 2, status: 'opened' }),
        signer({ id: 3, status: 'declined' }),
      ],
    });
    // A declined signer is neither signed nor outstanding — it is a dead end,
    // and counting it either way misreports the request.
    expect(signatureProgress(r)).toEqual({ signed: 1, total: 3, percent: 33 });
  });

  it('reports 0% rather than NaN when a request somehow has no signers', () => {
    expect(signatureProgress(request({ signers: [] }))).toEqual({
      signed: 0,
      total: 0,
      percent: 0,
    });
  });
});

describe('findBlockingPriorSigner', () => {
  const first = signer({ id: 1, sortOrder: 0, name: 'First' });
  const second = signer({ id: 2, sortOrder: 1, name: 'Second' });

  it('never blocks under a parallel order', () => {
    const r = request({ signingOrder: 'parallel', signers: [first, second] });
    expect(blockingPriorSignerFor(r, second)).toBeNull();
  });

  it('blocks a later signer while an earlier one is outstanding', () => {
    const r = request({ signingOrder: 'sequential', signers: [first, second] });
    expect(blockingPriorSignerFor(r, second)?.name).toBe('First');
    expect(blockingPriorSignerFor(r, first)).toBeNull();
  });

  it('unblocks once the earlier signer completes', () => {
    const done = { ...first, status: 'completed' as const };
    const r = request({ signingOrder: 'sequential', signers: [done, second] });
    expect(blockingPriorSignerFor(r, second)).toBeNull();
  });

  it('still blocks when the earlier signer DECLINED', () => {
    // Declining is not completing. The request is going nowhere, and saying
    // the next signer's turn is active would invite a reminder the API rejects.
    const declined = { ...first, status: 'declined' as const };
    const r = request({ signingOrder: 'sequential', signers: [declined, second] });
    expect(blockingPriorSignerFor(r, second)?.name).toBe('First');
  });

  it('does not let signers who share a sortOrder block each other', () => {
    const a = signer({ id: 1, sortOrder: 0, name: 'A' });
    const b = signer({ id: 2, sortOrder: 0, name: 'B' });
    const r = request({ signingOrder: 'sequential', signers: [a, b] });
    expect(blockingPriorSignerFor(r, b)).toBeNull();
  });
});

describe('isOpenSigner', () => {
  it('is pending or opened, but only while the request itself is pending', () => {
    const r = request();
    expect(isOpenSigner(r, signer({ status: 'pending' }))).toBe(true);
    expect(isOpenSigner(r, signer({ status: 'opened' }))).toBe(true);
    expect(isOpenSigner(r, signer({ status: 'completed' }))).toBe(false);
    expect(isOpenSigner(r, signer({ status: 'declined' }))).toBe(false);
  });

  it('is false on an expired request even though the signer row still says pending', () => {
    // Expiry is derived from the submission; nothing writes the signer rows.
    // Reading the signer alone would report work that can no longer be done.
    const expired = request({ effectiveStatus: 'expired', expiresAt: at(-1) });
    expect(isOpenSigner(expired, signer({ status: 'pending' }))).toBe(false);
  });
});

describe('canShareLink', () => {
  it('offers the link to an open, unblocked signer who has one', () => {
    expect(canShareLink(request(), signer())).toBe(true);
    // Still true at the reminder cap — running out of reminders does not stop
    // you handing someone the link yourself.
    expect(canShareLink(request(), signer({ reminderCount: 3 }))).toBe(true);
  });

  it('withholds it from a signer whose turn has not come', () => {
    // The signing page refuses a blocked signer, so offering the URL would be
    // handing over something that does not work.
    const first = signer({ id: 1, sortOrder: 0 });
    const second = signer({ id: 2, sortOrder: 1 });
    const r = request({ signingOrder: 'sequential', signers: [first, second] });
    expect(canShareLink(r, second)).toBe(false);
  });

  it('withholds it when there is no link, or the request is closed', () => {
    expect(canShareLink(request(), signer({ slug: null }))).toBe(false);
    expect(canShareLink(request({ effectiveStatus: 'expired' }), signer())).toBe(false);
  });
});

describe('canRemind', () => {
  it('allows a reminder to an open, unblocked signer under the cap', () => {
    expect(canRemind(request(), signer({ reminderCount: 2 }))).toBe(true);
  });

  it('refuses at the cap', () => {
    expect(canRemind(request(), signer({ reminderCount: 3 }))).toBe(false);
  });

  it('refuses a signer whose turn has not come', () => {
    const first = signer({ id: 1, sortOrder: 0 });
    const second = signer({ id: 2, sortOrder: 1 });
    const r = request({ signingOrder: 'sequential', signers: [first, second] });
    expect(canRemind(r, second)).toBe(false);
    expect(canRemind(r, first)).toBe(true);
  });

  it('refuses when there is no signing link to remind them about', () => {
    expect(canRemind(request(), signer({ slug: null }))).toBe(false);
  });

  it('refuses on a request that is no longer pending', () => {
    expect(canRemind(request({ effectiveStatus: 'completed' }), signer())).toBe(false);
  });
});

describe('daysLeft / describeExpiry', () => {
  it('floors to whole elapsed days rather than rounding', () => {
    expect(daysLeft(at(6.9), NOW)).toBe(6);
    expect(daysLeft(at(-0.5), NOW)).toBe(-1);
  });

  it('reads today, future and past differently', () => {
    expect(describeExpiry(at(3), NOW)?.label).toBe('3 days left');
    expect(describeExpiry(at(1), NOW)?.label).toBe('1 day left');
    expect(describeExpiry(at(0.5), NOW)?.label).toBe('Expires today');
    expect(describeExpiry(at(-2), NOW)?.label).toBe('Expired 2 days ago');
  });

  it('escalates tone only inside the urgent window', () => {
    expect(describeExpiry(at(30), NOW)?.tone).toBe('neutral');
    expect(describeExpiry(at(ESIGN_URGENT_WINDOW_DAYS), NOW)?.tone).toBe('warning');
    expect(describeExpiry(at(-1), NOW)?.tone).toBe('danger');
  });

  it('says nothing at all when a request does not expire', () => {
    expect(describeExpiry(null, NOW)).toBeNull();
    expect(daysLeft(null, NOW)).toBeNull();
  });
});

describe('countByStatus', () => {
  it('counts on the derived status, so an elapsed request is Expired not Pending', () => {
    const rows = [
      request({ id: 1, effectiveStatus: 'pending' }),
      request({ id: 2, effectiveStatus: 'expired' }),
      request({ id: 3, effectiveStatus: 'completed' }),
    ];
    const counts = countByStatus(rows);
    expect(counts['']).toBe(3);
    expect(counts['pending']).toBe(1);
    expect(counts['expired']).toBe(1);
    expect(counts['completed']).toBe(1);
    // A bucket with nothing in it still reports a number — a blank pill reads
    // as broken, a zero reads as an answer.
    expect(counts['processing']).toBe(0);
  });
});

describe('filterRequests', () => {
  const rows = [
    request({ id: 1, messageSubject: 'Roof assessment', signers: [signer({ name: 'Alice Owner', email: 'alice@test.com' })] }),
    request({ id: 2, messageSubject: 'Parking waiver', effectiveStatus: 'completed', signers: [signer({ name: 'Bob Tenant', email: 'bob@example.org' })] }),
  ];

  it('matches the title, the template, and a signer by name or email', () => {
    expect(filterRequests(rows, { query: 'roof' }).map((r) => r.id)).toEqual([1]);
    expect(filterRequests(rows, { query: 'BOB' }).map((r) => r.id)).toEqual([2]);
    expect(filterRequests(rows, { query: 'example.org' }).map((r) => r.id)).toEqual([2]);
    expect(filterRequests(rows, { query: 'proxy designation' }).map((r) => r.id)).toEqual([1, 2]);
  });

  it('composes the status filter and the query as AND', () => {
    expect(filterRequests(rows, { status: 'completed', query: 'roof' })).toHaveLength(0);
    expect(filterRequests(rows, { status: 'completed', query: 'parking' }).map((r) => r.id)).toEqual([2]);
  });

  it('treats a blank or whitespace query as no filter at all', () => {
    expect(filterRequests(rows, { query: '   ' })).toHaveLength(2);
    expect(filterRequests(rows, {})).toHaveLength(2);
  });
});

describe('outstandingSigners', () => {
  it('flattens every open signer and puts the most pressing request first', () => {
    const later = request({ id: 1, expiresAt: at(9), signers: [signer({ id: 11 })] });
    const sooner = request({
      id: 2,
      expiresAt: at(2),
      signers: [signer({ id: 21, sortOrder: 1 }), signer({ id: 22, sortOrder: 0 })],
    });
    const done = request({ id: 3, effectiveStatus: 'completed', signers: [signer({ id: 31, status: 'completed' })] });

    const out = outstandingSigners([later, sooner, done], NOW);

    expect(out.map((o) => o.signer.id)).toEqual([22, 21, 11]);
    expect(out.every((o) => o.request.effectiveStatus === 'pending')).toBe(true);
  });

  it('puts a request with no expiry last rather than first', () => {
    // A null date sorts before everything under a naive comparison, which would
    // put the one request with no deadline at the top of a deadline-ordered view.
    const noExpiry = request({ id: 1, expiresAt: null, signers: [signer({ id: 11 })] });
    const soon = request({ id: 2, expiresAt: at(1), signers: [signer({ id: 21 })] });

    expect(outstandingSigners([noExpiry, soon], NOW).map((o) => o.signer.id)).toEqual([21, 11]);
  });
});

describe('mostUrgentRequest', () => {
  it('returns the soonest-expiring outstanding request inside the window', () => {
    const soon = request({ id: 1, expiresAt: at(2) });
    const later = request({ id: 2, expiresAt: at(5) });
    expect(mostUrgentRequest([later, soon], NOW)?.id).toBe(1);
  });

  it('stays quiet when nothing is pressing', () => {
    expect(mostUrgentRequest([request({ expiresAt: at(30) })], NOW)).toBeNull();
    expect(mostUrgentRequest([request({ effectiveStatus: 'completed' })], NOW)).toBeNull();
    expect(mostUrgentRequest([], NOW)).toBeNull();
  });

  it('does not surface an already-expired request', () => {
    // The strip is for chasing a signature. An expired request cannot be
    // chased — it has to be resent — and letting it sit at the top would push
    // out the request someone could actually still do something about. It is
    // still in the table below, badged Expired.
    const expired = request({ id: 7, effectiveStatus: 'expired', expiresAt: at(-1) });
    expect(mostUrgentRequest([expired], NOW)).toBeNull();
  });
});
