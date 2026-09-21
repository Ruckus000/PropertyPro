/**
 * Spam classification for the platform support inbox.
 *
 * Runs out of band, from the `inbox-spam-scan` cron — never from the inbound
 * webhook. That route's deferral invariant means any throw inside it answers
 * 429 and parks the sender's mail in a 24-72 hour retry queue, so adding a
 * classifier to the ingest path would trade a spam message for a delayed real
 * one. Scoring fifteen minutes late costs nothing; this inbox receives on the
 * order of one message a day.
 *
 * Unscoped by necessity, not by shortcut: `support_inbox_*` has no
 * `community_id` (see `rls-config.ts`), so `createScopedClient` cannot express
 * these tables at all.
 */
// AUTHZ: platform support inbox — tables have no community_id; no tenant data read.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { supportInboxMessages, supportInboxThreads } from '@propertypro/db';
import { and, desc, eq, inArray, isNull, ne } from '@propertypro/db/filters';

import { train, type NaiveBayesModel, type SpamLabel } from './naive-bayes';
import { buildText, planSpamScan } from './spam-scan-plan';

/**
 * Ceiling on rows read in one run, mirroring the admin console's list limit.
 *
 * The corpus is the whole labelled history, so without a cap this grows without
 * bound. At today's volume the cap is unreachable; it exists so that the job's
 * cost is knowable rather than discovered.
 */
const MAX_CORPUS_ROWS = 500;
const MAX_SCORE_BATCH = 200;

export interface SpamScanSummary {
  trained: boolean;
  spamCount: number;
  hamCount: number;
  scored: number;
  shelved: number;
  /** True when the model exists but the cold-start floor is not yet met. */
  advisoryOnly: boolean;
}

type Db = ReturnType<typeof createUnscopedClient>;

/**
 * Gather the labelled corpus.
 *
 * `spam` is unambiguous — an operator pressed the button. Ham is NOT "every
 * thread not marked spam": most of those are simply unreviewed, and training on
 * them would feed the model the very backlog it is supposed to triage. A thread
 * counts as ham only once a human has demonstrably engaged with it, which means
 * it carries an outbound reply or an internal note.
 */
async function collectCorpus(db: Db): Promise<Array<{ text: string; label: SpamLabel }>> {
  const spamThreads = await db
    .select({ id: supportInboxThreads.id })
    .from(supportInboxThreads)
    .where(eq(supportInboxThreads.status, 'spam'))
    .orderBy(desc(supportInboxThreads.id))
    .limit(MAX_CORPUS_ROWS);

  // A thread a human answered or annotated. `direction` covers both shapes:
  // 'outbound' is a sent reply, 'internal' is a note.
  const engaged = await db
    .selectDistinct({ threadId: supportInboxMessages.threadId })
    .from(supportInboxMessages)
    .innerJoin(supportInboxThreads, eq(supportInboxThreads.id, supportInboxMessages.threadId))
    .where(
      and(
        ne(supportInboxThreads.status, 'spam'),
        inArray(supportInboxMessages.direction, ['outbound', 'internal']),
      ),
    )
    .limit(MAX_CORPUS_ROWS);

  const labels = new Map<number, SpamLabel>();
  for (const row of spamThreads) labels.set(row.id, 'spam');
  for (const row of engaged) if (!labels.has(row.threadId)) labels.set(row.threadId, 'ham');
  if (labels.size === 0) return [];

  // Only INBOUND text trains the model. Our own replies are written in our own
  // voice and appear exclusively in ham threads, so including them would teach
  // the classifier to recognise us rather than the correspondent.
  const messages = await db
    .select({
      threadId: supportInboxMessages.threadId,
      subject: supportInboxMessages.subject,
      textBody: supportInboxMessages.textBody,
    })
    .from(supportInboxMessages)
    .where(
      and(
        inArray(supportInboxMessages.threadId, [...labels.keys()]),
        eq(supportInboxMessages.direction, 'inbound'),
      ),
    );

  const corpus: Array<{ text: string; label: SpamLabel }> = [];
  for (const message of messages) {
    const label = labels.get(message.threadId);
    if (!label) continue;
    const text = buildText(message.subject, message.textBody);
    if (text.length > 0) corpus.push({ text, label });
  }
  return corpus;
}

/**
 * Build the model from scratch, in memory, on every run.
 *
 * Nothing is persisted, deliberately. An earlier draft of this job stored the
 * serialized model in a `support_inbox_spam_model` table and rebuilt it every
 * run anyway — so the row was written and never read, and it was the only place
 * in the system holding a token-frequency table derived from real message
 * bodies. Dropping it removed a table, a migration, a `jsonb` column of
 * PII-adjacent derived text, and the retention question that column raised.
 *
 * Rebuilding costs a few queries and microseconds of arithmetic at this inbox's
 * volume, and it is what makes a hard-deleted thread fall out of the model with
 * no further machinery: the corpus is simply whatever rows still exist.
 */
async function buildModel(db: Db): Promise<{ model: NaiveBayesModel; spam: number; ham: number }> {
  const corpus = await collectCorpus(db);
  const model = train(corpus);
  return { model, spam: model.documents.spam, ham: model.documents.ham };
}

/**
 * One pass: build the model, score everything unscored, shelve what the floor
 * allows.
 *
 * Returns a summary rather than logging one. Nothing here may log message text
 * or the model — the first is third-party correspondence and the second is
 * derived from it.
 */
export async function runInboxSpamScan(): Promise<SpamScanSummary> {
  const db = createUnscopedClient();
  const { model, spam, ham } = await buildModel(db);

  const unscored = await db
    .select({
      id: supportInboxMessages.id,
      threadId: supportInboxMessages.threadId,
      subject: supportInboxMessages.subject,
      textBody: supportInboxMessages.textBody,
    })
    .from(supportInboxMessages)
    .where(
      and(
        eq(supportInboxMessages.kind, 'email'),
        eq(supportInboxMessages.direction, 'inbound'),
        isNull(supportInboxMessages.spamScore),
      ),
    )
    .orderBy(desc(supportInboxMessages.id))
    .limit(MAX_SCORE_BATCH);

  const plan = planSpamScan({ model, spamCount: spam, hamCount: ham, messages: unscored });
  const classifiedAt = new Date();

  for (const scored of plan.scores) {
    await db
      .update(supportInboxMessages)
      .set({ spamScore: scored.score, spamVerdict: scored.verdict, classifiedAt })
      .where(eq(supportInboxMessages.id, scored.id));
  }

  let shelved = 0;
  if (plan.shelfThreadIds.length > 0) {
    // `spam` is a shelf, not a delete — the thread stays readable and one click
    // in StatusControl reverses it. Only threads still 'open' are touched, so
    // the job can never undo an operator's own triage.
    const updated = await db
      .update(supportInboxThreads)
      .set({ status: 'spam', updatedAt: classifiedAt })
      .where(
        and(
          inArray(supportInboxThreads.id, plan.shelfThreadIds),
          eq(supportInboxThreads.status, 'open'),
        ),
      )
      .returning({ id: supportInboxThreads.id });
    shelved = updated.length;
  }

  return {
    trained: true,
    spamCount: spam,
    hamCount: ham,
    scored: plan.scores.length,
    shelved,
    advisoryOnly: plan.advisoryOnly,
  };
}
