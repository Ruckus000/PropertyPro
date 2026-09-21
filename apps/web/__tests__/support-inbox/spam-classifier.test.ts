import { describe, expect, it } from 'vitest';

import { emptyModel, score, tokenize, train } from '@/lib/services/support-inbox/naive-bayes';
import {
  COLD_START_MIN_DOCUMENTS,
  SPAM_SHELF_THRESHOLD,
  planSpamScan,
  type ScannableMessage,
} from '@/lib/services/support-inbox/spam-scan-plan';

/**
 * Shapes taken from the six messages this inbox has actually received (all
 * spam, all authenticated Gmail cold outreach) and plausible support mail for
 * the ham side, which the production inbox has never seen.
 */
const SPAM_SAMPLES = [
  'More Revenue From the Buyers Already in Your Pipeline\nWe help brands unlock revenue from leads already in your funnel. Book a call.',
  "A private system I'd love to show your team\nI run a private system for growth. Happy to show your team on a quick call.",
  'Reaching Out About a Private System by LUX\nOur private system generates qualified leads for brands like yours. Book a demo.',
  'Your Brand Deserves a Better Website\nWe redesign websites for brands. Quick call to show you what we would change?',
];

const HAM_SAMPLES = [
  'Question about my documents\nHi, I cannot find the 2026 budget in the document portal. Could you help?',
  'Request for meeting minutes\nPlease could you send the minutes from the February board meeting?',
  'Gate remote not working\nMy gate remote stopped working yesterday. Who do I contact for a replacement?',
  'Assessment payment question\nI paid my assessment on the 3rd but the portal still shows it as due.',
];

function corpus(spam: number, ham: number) {
  const documents = [];
  for (let i = 0; i < spam; i += 1) {
    documents.push({ text: `${SPAM_SAMPLES[i % SPAM_SAMPLES.length]} ${i}`, label: 'spam' as const });
  }
  for (let i = 0; i < ham; i += 1) {
    documents.push({ text: `${HAM_SAMPLES[i % HAM_SAMPLES.length]} ${i}`, label: 'ham' as const });
  }
  return documents;
}

function message(id: number, text: string): ScannableMessage {
  const [subject, ...body] = text.split('\n');
  return { id, threadId: id * 10, subject: subject ?? null, textBody: body.join('\n') || null };
}

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumerics', () => {
    expect(tokenize('Hello, WORLD! 42')).toEqual(['hello', 'world', '42']);
  });

  it('drops single characters and very long runs', () => {
    // The long run stands in for base64, tracking ids and URL fragments, which
    // are unique per message and teach the model to memorise rather than
    // generalise.
    expect(tokenize(`a bb ${'x'.repeat(31)}`)).toEqual(['bb']);
  });
});

describe('score', () => {
  it('has no opinion when a class is unseen', () => {
    // This inbox's literal starting condition: six spam messages, zero ham.
    const model = train(corpus(6, 0));
    expect(score(model, SPAM_SAMPLES[0]!)).toBe(0.5);
  });

  it('has no opinion on an untrained model or empty text', () => {
    expect(score(emptyModel(), 'anything')).toBe(0.5);
    expect(score(train(corpus(4, 4)), '')).toBe(0.5);
  });

  it('separates the two classes once both are present', () => {
    const model = train(corpus(20, 20));
    expect(score(model, SPAM_SAMPLES[0]!)).toBeGreaterThan(0.9);
    expect(score(model, HAM_SAMPLES[0]!)).toBeLessThan(0.1);
  });

  it('does not underflow on a long document', () => {
    // The defect that made log-space scoring necessary: multiplying raw
    // probabilities over a few hundred tokens collapses to 0 for BOTH classes,
    // and 0/0 is NaN. A cold-outreach email is exactly this long.
    const model = train(corpus(20, 20));
    const long = `${SPAM_SAMPLES.join(' ')} `.repeat(40);

    const result = score(model, long);

    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0.5);
  });

  it('stays within [0, 1]', () => {
    const model = train(corpus(20, 20));
    for (const sample of [...SPAM_SAMPLES, ...HAM_SAMPLES, 'totally unrelated words here']) {
      const result = score(model, sample);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

describe('planSpamScan — the cold-start floor', () => {
  const model = train(corpus(200, 200));
  const messages = [message(1, SPAM_SAMPLES[0]!), message(2, HAM_SAMPLES[0]!)];

  it('scores but shelves NOTHING below the floor', () => {
    const plan = planSpamScan({
      model,
      spamCount: COLD_START_MIN_DOCUMENTS,
      hamCount: COLD_START_MIN_DOCUMENTS - 1,
      messages,
    });

    expect(plan.advisoryOnly).toBe(true);
    expect(plan.scores).toHaveLength(2);
    expect(plan.shelfThreadIds).toEqual([]);
  });

  it('shelves only the spam once both corpora reach the floor', () => {
    const plan = planSpamScan({
      model,
      spamCount: COLD_START_MIN_DOCUMENTS,
      hamCount: COLD_START_MIN_DOCUMENTS,
      messages,
    });

    expect(plan.advisoryOnly).toBe(false);
    expect(plan.shelfThreadIds).toEqual([messages[0]!.threadId]);
  });

  it('is the SPAM corpus that must reach the floor too, not just ham', () => {
    const plan = planSpamScan({
      model,
      spamCount: COLD_START_MIN_DOCUMENTS - 1,
      hamCount: COLD_START_MIN_DOCUMENTS * 10,
      messages,
    });

    expect(plan.advisoryOnly).toBe(true);
    expect(plan.shelfThreadIds).toEqual([]);
  });
});

describe('planSpamScan — scoring rules', () => {
  const model = train(corpus(200, 200));
  const atFloor = { spamCount: COLD_START_MIN_DOCUMENTS, hamCount: COLD_START_MIN_DOCUMENTS };

  it('emits no score for a message with nothing to classify', () => {
    // Leaving spam_score NULL keeps "not scored" and "scored 0.5" apart, and
    // the row is picked up again for free if a body ever arrives.
    const plan = planSpamScan({
      model,
      ...atFloor,
      messages: [{ id: 1, threadId: 10, subject: null, textBody: null }],
    });

    expect(plan.scores).toEqual([]);
    expect(plan.shelfThreadIds).toEqual([]);
  });

  it('scores a subject-only message rather than skipping it', () => {
    const plan = planSpamScan({
      model,
      ...atFloor,
      messages: [{ id: 1, threadId: 10, subject: SPAM_SAMPLES[0]!.split('\n')[0]!, textBody: null }],
    });

    expect(plan.scores).toHaveLength(1);
  });

  it('records a verdict alongside every score', () => {
    const plan = planSpamScan({ model, ...atFloor, messages: [message(1, HAM_SAMPLES[1]!)] });

    expect(plan.scores[0]!.verdict).toBe('ham');
    expect(plan.scores[0]!.score).toBeLessThan(SPAM_SHELF_THRESHOLD);
  });

  it('dedupes threads when several messages in one thread score as spam', () => {
    const plan = planSpamScan({
      model,
      ...atFloor,
      messages: [
        { id: 1, threadId: 99, subject: SPAM_SAMPLES[0]!, textBody: SPAM_SAMPLES[0]! },
        { id: 2, threadId: 99, subject: SPAM_SAMPLES[1]!, textBody: SPAM_SAMPLES[1]! },
      ],
    });

    expect(plan.shelfThreadIds).toEqual([99]);
  });
});
