import { describe, expect, it } from 'vitest';

import {
  buildDedupeKey,
  collectAncestorIds,
  nextThreadStatus,
  normalizeMessageId,
  normalizeSubject,
  parseMessageIdList,
} from '@/lib/services/support-inbox/threading';
import type { InboundEmail } from '@/lib/services/support-inbox/types';

function email(overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    mailbox: 'support',
    deliveredTo: 'support@getpropertypro.com',
    from: { email: 'jane@example.com', name: 'Jane Doe' },
    to: [{ email: 'support@getpropertypro.com', name: null }],
    cc: [],
    subject: 'Question about my documents',
    textBody: 'Hello there',
    htmlBody: null,
    rfcMessageId: 'abc123@mail.example.com',
    inReplyTo: null,
    references: [],
    sentAt: new Date('2026-09-05T10:00:00.000Z'),
    hasAttachments: false,
    ...overrides,
  };
}

describe('normalizeSubject', () => {
  it('collapses stacked reply and forward prefixes', () => {
    expect(normalizeSubject('Re: Re: Question')).toBe('question');
    expect(normalizeSubject('RE: FWD: Re : Question')).toBe('question');
    expect(normalizeSubject('Fwd: [EXTERNAL] Question')).toBe('question');
  });

  it('keeps a subject that merely starts with similar words', () => {
    // Control: "Rebate" must not lose its first three letters to the Re: rule.
    expect(normalizeSubject('Rebate for my unit')).toBe('rebate for my unit');
    expect(normalizeSubject('Review of the budget')).toBe('review of the budget');
  });

  it('treats a null subject as empty rather than throwing', () => {
    expect(normalizeSubject(null)).toBe('');
  });
});

describe('normalizeMessageId', () => {
  it('strips angle brackets and surrounding whitespace', () => {
    expect(normalizeMessageId('  <abc@mail.example.com>  ')).toBe('abc@mail.example.com');
  });

  it('preserves case', () => {
    // RFC 5322 local parts are case-sensitive; folding merges distinct ids and
    // silently glues unrelated conversations together.
    expect(normalizeMessageId('<AbC123@Mail.Example.COM>')).toBe('AbC123@Mail.Example.COM');
  });

  it('returns null for absent or empty values', () => {
    expect(normalizeMessageId(null)).toBeNull();
    expect(normalizeMessageId(undefined)).toBeNull();
    expect(normalizeMessageId('<>')).toBeNull();
    expect(normalizeMessageId('   ')).toBeNull();
  });
});

describe('parseMessageIdList', () => {
  it('splits a whitespace-separated References header and dedupes', () => {
    expect(parseMessageIdList('<a@x> <b@x>  <a@x>')).toEqual(['a@x', 'b@x']);
  });

  it('accepts an already-split array', () => {
    expect(parseMessageIdList(['<a@x>', '<b@x>'])).toEqual(['a@x', 'b@x']);
  });

  it('returns an empty list for absent input', () => {
    expect(parseMessageIdList(null)).toEqual([]);
    expect(parseMessageIdList(undefined)).toEqual([]);
  });
});

describe('collectAncestorIds', () => {
  it('puts In-Reply-To first, then References walked backwards', () => {
    // Nearest ancestor first: when one chain spans two of our threads, the
    // most recent ancestor is the correct thread to join.
    expect(
      collectAncestorIds(
        email({ inReplyTo: '<c@x>', references: ['a@x', 'b@x', 'c@x'] }),
      ),
    ).toEqual(['c@x', 'b@x', 'a@x']);
  });

  it('is empty when the message carries no threading headers', () => {
    expect(collectAncestorIds(email({ inReplyTo: null, references: [] }))).toEqual([]);
  });
});

describe('buildDedupeKey', () => {
  it('is a 64-character hex digest, matching the CHECK constraint', () => {
    expect(buildDedupeKey(email())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for identical input', () => {
    expect(buildDedupeKey(email())).toBe(buildDedupeKey(email()));
  });

  it('differs for the same Message-ID delivered to two mailboxes', () => {
    // Addressing both support@ and privacy@ is two threads, not one duplicate.
    expect(buildDedupeKey(email({ mailbox: 'support' }))).not.toBe(
      buildDedupeKey(email({ mailbox: 'privacy' })),
    );
  });

  it('still distinguishes two messages when neither has a Message-ID', () => {
    // Message-ID is an OPTIONAL header. This is the case a
    // `UNIQUE (rfc_message_id)` index would silently fail to dedupe, because
    // Postgres treats NULLs as distinct.
    const a = buildDedupeKey(email({ rfcMessageId: null, textBody: 'first' }));
    const b = buildDedupeKey(email({ rfcMessageId: null, textBody: 'second' }));
    expect(a).not.toBe(b);
    expect(a).toBe(buildDedupeKey(email({ rfcMessageId: null, textBody: 'first' })));
  });
});

describe('nextThreadStatus', () => {
  it('reopens a closed thread', () => {
    expect(nextThreadStatus('closed')).toBe('open');
  });

  it('leaves open and pending threads open', () => {
    expect(nextThreadStatus('open')).toBe('open');
    expect(nextThreadStatus('pending')).toBe('open');
  });

  it('does NOT reopen a thread the operator marked spam', () => {
    // Otherwise the spam button is useless: the sender's next message puts the
    // thread straight back in the inbox.
    expect(nextThreadStatus('spam')).toBe('spam');
  });
});
