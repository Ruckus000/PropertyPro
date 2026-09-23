/**
 * Multinomial naive Bayes, vendored.
 *
 * The algorithm is textbook; the shape of this module follows the `bayes`
 * package (MIT, Tolga Tezel), which is the right dependency for this job and
 * was rejected only on supply-chain grounds: it was last published in 2020,
 * ships no TypeScript types, declares `engines.node >= 0.8.0`, and resolves
 * through `"main": "./lib/naive_bayes"` with no file extension. Taking it would
 * have cost a package plus an ambient `.d.ts` shim to obtain the arithmetic
 * below. Copying ~100 lines is the smaller diff and the smaller risk.
 *
 * Two deliberate departures from that package:
 *
 *   1. Scoring is done in LOG space. The original multiplies raw probabilities,
 *      which underflows to zero on documents of a few hundred tokens — and a
 *      cold-outreach email is exactly that long. Underflow there does not throw;
 *      it silently returns the same score for every message.
 *   2. `score()` returns a calibrated 0..1 probability rather than a label, so
 *      the caller owns the threshold and can record the number.
 *
 * Deliberately NOT here: stemming, stopword lists, n-grams, TF-IDF, language
 * detection. Each is a plausible accuracy win and none can be evaluated, because
 * this inbox has no ham corpus to measure against yet. Add one when there is a
 * measurement that says it helped.
 */

export type SpamLabel = 'spam' | 'ham';

export interface NaiveBayesModel {
  /** Token -> per-label occurrence counts. */
  readonly tokens: Record<string, { spam: number; ham: number }>;
  /** Total token occurrences per label, i.e. the denominators. */
  readonly totals: { spam: number; ham: number };
  /** Documents seen per label, for the class priors. */
  readonly documents: { spam: number; ham: number };
}

/**
 * A token is a run of letters or digits, lowercased.
 *
 * Length bounds drop two kinds of noise that dominate email: single characters
 * (which carry no signal and inflate the vocabulary) and the very long runs that
 * base64 payloads, tracking ids and URL fragments decompose into — those are
 * effectively unique per message, so they train a model that memorises rather
 * than generalises.
 */
const MIN_TOKEN = 2;
const MAX_TOKEN = 30;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= MIN_TOKEN && token.length <= MAX_TOKEN);
}

function emptyModel(): NaiveBayesModel {
  return { tokens: {}, totals: { spam: 0, ham: 0 }, documents: { spam: 0, ham: 0 } };
}

export function train(documents: ReadonlyArray<{ text: string; label: SpamLabel }>): NaiveBayesModel {
  const model = emptyModel();
  const tokens = model.tokens as Record<string, { spam: number; ham: number }>;
  const totals = model.totals as { spam: number; ham: number };
  const docs = model.documents as { spam: number; ham: number };

  for (const document of documents) {
    docs[document.label] += 1;
    for (const token of tokenize(document.text)) {
      const entry = tokens[token] ?? (tokens[token] = { spam: 0, ham: 0 });
      entry[document.label] += 1;
      totals[document.label] += 1;
    }
  }

  return model;
}

/**
 * P(spam | text), in [0, 1].
 *
 * Returns exactly 0.5 — "no opinion" — when either class is unseen. That is the
 * honest answer for an untrained model and it keeps the caller's threshold from
 * firing on a model that has only ever seen spam, which is this inbox's literal
 * starting condition. Callers must not persist a 0.5 as though it were a
 * finding; `planSpamScan` declines to score at all in that state.
 */
export function score(model: NaiveBayesModel, text: string): number {
  const { spam: spamDocs, ham: hamDocs } = model.documents;
  if (spamDocs === 0 || hamDocs === 0) return 0.5;

  const tokens = tokenize(text);
  if (tokens.length === 0) return 0.5;

  const vocabulary = Object.keys(model.tokens).length;

  // Class priors, in log space like everything below.
  let spamLog = Math.log(spamDocs / (spamDocs + hamDocs));
  let hamLog = Math.log(hamDocs / (spamDocs + hamDocs));

  for (const token of tokens) {
    const counts = model.tokens[token];
    // Skip tokens the model has never seen. NOT because they cancel out — they
    // do not: including one would add log(1/(totals.spam + V)) to one side and
    // log(1/(totals.ham + V)) to the other, which differ whenever the two class
    // token totals differ, tilting every novel word toward whichever class has
    // seen fewer tokens overall. That is noise, not evidence. Scoring on
    // observed evidence only is both the correct answer and the cheaper one.
    if (!counts) continue;
    // Laplace (add-one) smoothing: a token seen only in spam must not drive
    // P(ham) to zero, which in log space is -Infinity and unrecoverable.
    spamLog += Math.log((counts.spam + 1) / (model.totals.spam + vocabulary));
    hamLog += Math.log((counts.ham + 1) / (model.totals.ham + vocabulary));
  }

  // Softmax over two log-scores, computed against the max so the exponential
  // cannot overflow. This is the step that makes the log-space detour worth it.
  const max = Math.max(spamLog, hamLog);
  const spamExp = Math.exp(spamLog - max);
  const hamExp = Math.exp(hamLog - max);
  return spamExp / (spamExp + hamExp);
}
