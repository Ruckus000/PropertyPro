#!/usr/bin/env tsx
/**
 * Weekly help-content-gaps report.
 *
 * Aggregates the three help-center signals captured via Sentry messages
 * (see WS7 in the help-center-overhaul plan):
 *
 *   - help_search_no_results     — query landed on zero articles AND zero
 *                                  FAQs (q ≥ 3 chars)
 *   - help_feedback_negative     — user thumbs-down with comment
 *   - help_contextual_no_match   — three consecutive routes had zero contextual help
 *
 * Two run modes:
 *
 *   1. Live mode (default):
 *      Requires SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT env vars.
 *      Calls the Sentry events API for each signature, aggregates by frequency,
 *      and prints a markdown report to stdout.
 *
 *   2. Fixture mode:
 *      Pass --fixture path/to/events.json to skip the Sentry call. Useful for
 *      seed-data smoke tests and local dev. The fixture is an array of event
 *      objects with shape { message, extra: { ... } }.
 *
 * The output is markdown so it can be redirected to a file or piped into a
 * comment on a content-team tracking ticket. No HTML, no auth, no PII beyond
 * what was already truncated server-side (comments capped at 500 chars in
 * apps/web/src/app/api/v1/help/feedback/route.ts; queries capped at 100 chars
 * in apps/web/src/app/api/v1/help/search/route.ts).
 *
 * Caveats / limitations:
 *
 *   - Sentry pagination is not implemented. The events API returns at most
 *     ~100 events per signature per call. At current help-center scale this
 *     is fine, but if any signature exceeds ~100 events in the report window
 *     the count will silently undercount. Add cursor-based pagination
 *     (Link header) when traffic warrants it.
 *
 *   - help_contextual_no_match fires based on URL navigation patterns, not
 *     on whether the user actually opened the help widget. Read it as
 *     "routes for which we've defined no contextual help," not "routes
 *     where users wanted help and found none." Both readings are useful;
 *     they're not the same.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface SentryEvent {
  message?: string;
  extra?: Record<string, unknown>;
}

interface Signature {
  name: string;
  description: string;
}

const SIGNATURES: Signature[] = [
  {
    name: 'help_search_no_results',
    description:
      'Search queries (≥ 3 chars) that returned zero articles AND zero FAQs.',
  },
  {
    name: 'help_feedback_negative',
    description: 'Articles where users left a thumbs-down with a comment.',
  },
  {
    name: 'help_contextual_no_match',
    description:
      'Route runs of length 3 with no contextual help — candidates for new contextPaths.',
  },
];

interface CliOptions {
  fixture?: string;
  windowDays: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { windowDays: 7 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixture' && argv[i + 1]) {
      opts.fixture = argv[i + 1];
      i++;
    } else if (arg === '--window' && argv[i + 1]) {
      opts.windowDays = Math.max(1, parseInt(argv[i + 1]!, 10) || 7);
      i++;
    }
  }
  return opts;
}

async function fetchEventsFromSentry(
  signature: Signature,
  windowDays: number,
): Promise<SentryEvent[]> {
  // NOTE: returns at most ~100 events per signature per call. Cursor-based
  // pagination (parsing the `Link: …rel="next"` header) is not yet implemented
  // — see the leading docstring's "Caveats" section. Add it when traffic
  // warrants.
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) {
    throw new Error(
      'SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT must be set for live mode (or pass --fixture).',
    );
  }
  const url = new URL(
    `https://sentry.io/api/0/projects/${org}/${project}/events/`,
  );
  url.searchParams.set('query', `message:${signature.name}`);
  url.searchParams.set('statsPeriod', `${windowDays}d`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Sentry API ${res.status} ${res.statusText} for ${signature.name}`,
    );
  }
  const json = (await res.json()) as { events?: SentryEvent[] };
  return Array.isArray(json) ? json : (json.events ?? []);
}

function loadFixture(path: string): SentryEvent[] {
  const raw = readFileSync(resolve(process.cwd(), path), 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('fixture must be a JSON array of events');
  }
  return parsed as SentryEvent[];
}

function aggregateBy(
  events: SentryEvent[],
  field: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const value = event.extra?.[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function topN(counts: Map<string, number>, n: number): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function renderReport(
  windowDays: number,
  perSignature: Array<{ signature: Signature; events: SentryEvent[] }>,
): string {
  const lines: string[] = [];
  lines.push(`# Help content gaps report — last ${windowDays} day(s)`);
  lines.push('');

  for (const { signature, events } of perSignature) {
    lines.push(`## ${signature.name}`);
    lines.push('');
    lines.push(`_${signature.description}_`);
    lines.push('');
    lines.push(`Total events: **${events.length}**`);
    lines.push('');

    if (events.length === 0) {
      lines.push('_No events in window._');
      lines.push('');
      continue;
    }

    if (signature.name === 'help_search_no_results') {
      const top = topN(aggregateBy(events, 'query'), 20);
      lines.push('| Query | Count |');
      lines.push('| --- | --: |');
      for (const [q, n] of top) {
        lines.push(`| \`${q}\` | ${n} |`);
      }
    } else if (signature.name === 'help_feedback_negative') {
      const top = topN(aggregateBy(events, 'articleSlug'), 20);
      lines.push('| Article slug | Thumbs-down comments |');
      lines.push('| --- | --: |');
      for (const [slug, n] of top) {
        lines.push(`| \`${slug}\` | ${n} |`);
      }
      lines.push('');
      lines.push('### Recent comments (truncated at 500 chars server-side)');
      lines.push('');
      const recent = events.slice(0, 10);
      for (const event of recent) {
        const slug = event.extra?.['articleSlug'];
        const comment = event.extra?.['comment'];
        if (typeof slug === 'string' && typeof comment === 'string') {
          lines.push(`- **${slug}** — ${comment}`);
        }
      }
    } else if (signature.name === 'help_contextual_no_match') {
      // Single-pass: count path occurrences directly while iterating events.
      const counts = new Map<string, number>();
      for (const event of events) {
        const paths = event.extra?.['paths'];
        if (!Array.isArray(paths)) continue;
        for (const p of paths) {
          if (typeof p !== 'string') continue;
          counts.set(p, (counts.get(p) ?? 0) + 1);
        }
      }
      const top = topN(counts, 20);
      lines.push('| Path | Times in no-match runs |');
      lines.push('| --- | --: |');
      for (const [p, n] of top) {
        lines.push(`| \`${p}\` | ${n} |`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  let perSignature: Array<{ signature: Signature; events: SentryEvent[] }>;

  if (opts.fixture) {
    // Single-pass bucketing of fixture events by message into pre-seeded
    // signature buckets — preserves SIGNATURES ordering in the output.
    const buckets = new Map<string, SentryEvent[]>();
    for (const sig of SIGNATURES) buckets.set(sig.name, []);
    for (const event of loadFixture(opts.fixture)) {
      if (event.message && buckets.has(event.message)) {
        buckets.get(event.message)!.push(event);
      }
    }
    perSignature = SIGNATURES.map((signature) => ({
      signature,
      events: buckets.get(signature.name)!,
    }));
  } else {
    // Fan out per-signature fetches in parallel; each Sentry API call is
    // already scoped to a single signature, so no secondary filter pass.
    perSignature = await Promise.all(
      SIGNATURES.map(async (signature) => ({
        signature,
        events: await fetchEventsFromSentry(signature, opts.windowDays),
      })),
    );
  }

  process.stdout.write(renderReport(opts.windowDays, perSignature) + '\n');
}

main().catch((err) => {
  console.error(`help-content-gaps-report failed: ${(err as Error).message}`);
  process.exit(1);
});
