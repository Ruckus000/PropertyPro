import { describe, expect, it } from 'vitest';

import {
  buildQuotedText,
  buildReplyHeaders,
  buildReplyReferences,
  buildReplySubject,
  replyFromAddress,
} from '@/lib/server/inbox-threading';

describe('buildReplySubject', () => {
  it('adds exactly one Re:', () => {
    expect(buildReplySubject('Question about my documents')).toBe(
      'Re: Question about my documents',
    );
  });

  it('collapses an accumulated prefix chain instead of stacking another', () => {
    expect(buildReplySubject('Re: Re: Question')).toBe('Re: Question');
    expect(buildReplySubject('RE: Fwd: Re : Question')).toBe('Re: Question');
  });

  it('does not eat a subject that merely starts with similar letters', () => {
    // Control: "Rebate" must keep its first three letters.
    expect(buildReplySubject('Rebate for my unit')).toBe('Re: Rebate for my unit');
  });

  it('handles a missing subject without producing a bare "Re:"', () => {
    expect(buildReplySubject(null)).toBe('Re: (no subject)');
    expect(buildReplySubject('   ')).toBe('Re: (no subject)');
  });
});

describe('buildReplyReferences', () => {
  it('appends the parent Message-ID to the parent chain', () => {
    expect(
      buildReplyReferences({ rfcMessageId: 'c@x', references: ['a@x', 'b@x'] }),
    ).toEqual(['a@x', 'b@x', 'c@x']);
  });

  it('does not duplicate an id already in the chain', () => {
    expect(
      buildReplyReferences({ rfcMessageId: 'b@x', references: ['a@x', 'b@x'] }),
    ).toEqual(['a@x', 'b@x']);
  });

  it('handles a parent with no chain of its own', () => {
    expect(buildReplyReferences({ rfcMessageId: 'a@x', references: null })).toEqual(['a@x']);
  });

  it('keeps the TAIL when trimming a very long chain', () => {
    // RFC 5322 permits trimming the middle; the recent ancestors are the ones
    // clients actually thread on, so dropping the head is the safe end.
    const references = Array.from({ length: 30 }, (_, i) => `id${i}@x`);
    const result = buildReplyReferences({ rfcMessageId: 'newest@x', references });

    expect(result).toHaveLength(20);
    expect(result.at(-1)).toBe('newest@x');
    expect(result).not.toContain('id0@x');
  });
});

describe('buildReplyHeaders', () => {
  it('emits In-Reply-To and References in angle brackets', () => {
    expect(buildReplyHeaders({ rfcMessageId: 'b@x', references: ['a@x'] })).toEqual({
      'In-Reply-To': '<b@x>',
      References: '<a@x> <b@x>',
    });
  });

  it('emits NOTHING when the parent has no Message-ID', () => {
    // A malformed `In-Reply-To: <>` is worse than an absent one: some clients
    // drop the message, others start a new thread anyway.
    expect(buildReplyHeaders({ rfcMessageId: null, references: ['a@x'] })).toEqual({});
  });
});

describe('replyFromAddress', () => {
  it('answers a privacy thread from privacy@', () => {
    expect(replyFromAddress('privacy')).toBe(
      'PropertyPro Privacy <privacy@getpropertypro.com>',
    );
  });

  it('answers a support thread from support@', () => {
    expect(replyFromAddress('support')).toBe(
      'PropertyPro Support <support@getpropertypro.com>',
    );
  });

  it('never returns the noreply default', () => {
    for (const mailbox of ['support', 'privacy', 'contact'] as const) {
      expect(replyFromAddress(mailbox)).not.toContain('noreply@');
    }
  });
});

describe('buildQuotedText', () => {
  it('returns the parent text as-is when short', () => {
    expect(buildQuotedText({ textBody: 'Hello there' })).toBe('Hello there');
  });

  it('truncates a very long body', () => {
    const long = 'x'.repeat(5000);
    const quoted = buildQuotedText({ textBody: long });
    expect(quoted?.length).toBeLessThan(long.length);
    expect(quoted?.endsWith('[...]')).toBe(true);
  });

  it('returns undefined for an empty or missing body', () => {
    expect(buildQuotedText({ textBody: null })).toBeUndefined();
    expect(buildQuotedText({ textBody: '   ' })).toBeUndefined();
  });
});
