/**
 * The spam-scan decision, with no database in it.
 *
 * Split from `spam-classifier-service.ts` so the rules that matter — the
 * cold-start floor, the shelving threshold, what counts as classifiable — can
 * be tested against real inputs. Importing the service pulls in
 * `@propertypro/db/unsafe`, which throws at module load without a
 * `DATABASE_URL`; these rules deserve a test that does not need one.
 */
import { score as scoreText, type NaiveBayesModel } from './naive-bayes';

/**
 * Below this many labelled documents on EITHER side, the job scores but does
 * not act.
 *
 * This is the single most important number in the file. The inbox's entire
 * history at the time of writing is six messages, all of them spam and none of
 * them replied to — a model trained on that has never seen a legitimate email
 * and classifies everything as spam. Scoring from day one is useful (the score
 * is visible on the row); acting on it before there is a ham corpus would shelve
 * the first real customer who ever wrote in.
 *
 * Deleting this check is what the revert-check in the test file targets.
 */
export const COLD_START_MIN_DOCUMENTS = 50;

/**
 * P(spam) at or above which a thread is shelved, once the floor above is met.
 *
 * Deliberately far above 0.5. A false positive here is a real person's support
 * request silently leaving the queue, and `nextThreadStatus()` makes `spam`
 * sticky — the thread never reopens on a reply. A false negative is one click.
 */
export const SPAM_SHELF_THRESHOLD = 0.95;

/**
 * How much of one message is fed to the tokenizer.
 *
 * Bounds both the training pass and the per-message scoring pass so a single
 * pathological message cannot dominate the model or the job's memory. Real
 * support mail is a few hundred to a few thousand characters; the six spam
 * samples run 663-1,945.
 */
const MAX_TEXT_CHARS = 16_000;

/** Float noise floor — a re-score that differs only in the last bits is not a change. */
const EPSILON = 1e-9;


/** Subject and body are both optional; scoring text is whatever exists. */
export function buildText(subject: string | null, textBody: string | null): string {
  return `${subject ?? ''}\n${textBody ?? ''}`.trim().slice(0, MAX_TEXT_CHARS);
}

export interface ScannableMessage {
  id: number;
  threadId: number;
  subject: string | null;
  textBody: string | null;
  /** The score already stored on the row, so an unchanged one is not rewritten. */
  currentScore: number | null;
}

export interface ScoredMessage {
  id: number;
  threadId: number;
  score: number;
}

export interface SpamScanPlan {
  /** True when the model exists but the cold-start floor is not yet met. */
  advisoryOnly: boolean;
/** One entry per message whose score CHANGED. Unchanged rows are left alone. */
  scores: ScoredMessage[];
  /** Threads to shelve. Empty whenever `advisoryOnly` is true. */
  shelfThreadIds: number[];
}

/**
 * Decide what the scan should do. Pure — no database, no clock.
 *
 * Split out from `runInboxSpamScan` so the rules that matter can be tested
 * against real inputs instead of a mocked query builder. Everything below this
 * function is transport.
 */
export function planSpamScan(input: {
  model: NaiveBayesModel;
  spamCount: number;
  hamCount: number;
  messages: readonly ScannableMessage[];
}): SpamScanPlan {
  const advisoryOnly =
    input.spamCount < COLD_START_MIN_DOCUMENTS || input.hamCount < COLD_START_MIN_DOCUMENTS;

  const scores: ScoredMessage[] = [];
  const shelfThreadIds = new Set<number>();

  /*
   * A model that has seen only one class has no opinion: `score()` returns
   * exactly 0.5 for every input. Writing that 0.5 to the rows would be actively
   * harmful, not merely useless — see the re-scoring note below for why a
   * persisted non-finding used to be permanent.
   *
   * This inbox's entire history is one class (six spam, zero ham), so this is
   * the branch that runs today and will keep running until somebody replies to
   * a real email.
   */
  if (input.model.documents.spam === 0 || input.model.documents.ham === 0) {
    return { advisoryOnly, scores, shelfThreadIds: [] };
  }

  for (const message of input.messages) {
    const text = buildText(message.subject, message.textBody);
    // Nothing to classify. Leaving spam_score NULL keeps "no body" and "scored"
    // distinguishable, and the row is picked up for free if a body arrives.
    if (text.length === 0) continue;

    const score = scoreText(input.model, text);

    /*
     * EVERY message is re-scored on every run, not just the ones with no score
     * yet, and only a CHANGED score is written back.
     *
     * The first version of this job scored only rows where `spam_score IS
     * NULL`. Combined with the cold-start branch above writing 0.5 to
     * everything, that meant the whole existing corpus got stamped with a
     * meaningless 0.5 on the first run and was then excluded from scoring
     * forever — the filter's opening move was to blind itself to its own
     * history, permanently, with no way back short of a manual UPDATE.
     *
     * Re-scoring removes the failure mode rather than guarding it: there is no
     * "already scored" state to get wrong, and every score always reflects the
     * current model. The write filter keeps the steady-state cost at zero.
     */
    if (message.currentScore === null || Math.abs(score - message.currentScore) > EPSILON) {
      scores.push({ id: message.id, threadId: message.threadId, score });
    }

    // The cold-start floor. Removing this line is what the revert-check in
    // spam-classifier.test.ts targets: without it, a model trained on an
    // all-spam history shelves the first real customer who ever writes in.
    if (!advisoryOnly && score >= SPAM_SHELF_THRESHOLD) shelfThreadIds.add(message.threadId);
  }

  return { advisoryOnly, scores, shelfThreadIds: [...shelfThreadIds] };
}
