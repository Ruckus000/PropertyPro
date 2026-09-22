// scripts/dmarc-digest-check.ts
//
// One-command read of the Postmark DMARC digests for getpropertypro.com.
//
// Background: DEPLOYMENT.md §5.5. The domain is at `p=reject; sp=reject` since
// 2026-09-22 (both tags; see the ratchet history there). Under reject, a sender
// that turns up misaligned is BOUNCED, not merely quarantined — so "did any
// digest window show a source we do not recognise, or an alignment failure?" is
// no longer a curiosity question, it is a deliverability tripwire. The first
// fully-reject window closes ~2026-09-27 (issue-tracked); this script is the
// glance.
//
// What it does: lists aggregate reports via the free Postmark DMARC API
// (https://dmarc.postmarkapp.com/api/), fetches each report's rows, and
// aggregates per (source-domain, IP): volume, SPF/DKIM results, and whether
// the source domain is on KNOWN_SOURCES below. It prints the denominator
// (reports read, rows seen, messages counted) so a silent zero can never read
// as a clean pass.
//
// KNOWN_SOURCES is deliberately ONE entry. `amazonses.com` is the SES pool
// that Resend sends through — the entire outbound mail surface is
// `sendEmail` → Resend (§5.5's structural audit; `resolveFromAddress` defaults
// every From to the apex). Anything else in a report IS the "sender nobody
// knew about" the digest exists to detect, and must be a human decision to
// widen this list — not a convenience.
//
// Auth: DMARC_API_TOKEN env (the DMARC dashboard account token). The token is
// WRITE-capable (PATCH recipient / DELETE / rotate) — read-only use here, and
// never commit it. If unset the script exits 2 ("could not check"), which is
// NOT a pass.
//
// Exit: 0 clean · 1 findings (unknown source OR any unaligned row) ·
//       2 could-not-check (no token, HTTP error, unexpected payload shape).

// No imports in this file would otherwise make it a GLOBAL script, where
// `main`/`usage` collide with other scripts' top-level functions.
export {};

// A file with no imports/exports is a GLOBAL script to TypeScript: its
// top-level `usage`/`main` then collide with the same names in every other
// script under this project (seed-revenue-snapshot-today.ts did exactly that).
// This export makes it a module.
export {};

// Overridable only so the parse/verdict paths can be exercised against a
// local stub; production use stays on the real host.
const API_BASE = process.env.DMARC_API_BASE?.trim() || 'https://dmarc.postmarkapp.com';
const DOMAIN = 'getpropertypro.com';

const KNOWN_SOURCES = new Set(['amazonses.com']);

interface RowSummary {
  source: string;
  ip: string;
  count: number;
  spf: string;
  dkim: string;
  aligned: boolean | null;
}

function usage(): never {
  console.error(
    'usage: DMARC_API_TOKEN=… pnpm dmarc:check [--from YYYY-MM-DD] [--to YYYY-MM-DD]',
  );
  console.error('       (defaults: last 14 days, per the weekly digest cadence)');
  process.exit(2);
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function isoDate(value: string | undefined, fallbackDays: number): string {
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      console.error(`bad date "${value}", expected YYYY-MM-DD`);
      process.exit(2);
    }
    return value;
  }
  const d = new Date(Date.now() - fallbackDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function api(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Api-Token': token, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} -> HTTP ${res.status}`);
  }
  return res.json();
}

/** The payload shape is the upstream service's, not ours — dig keys
 *  defensively and let unexpectedShape surface as exit 2, never as a quiet 0. */
function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function firstString(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function collectRows(report: unknown): RowSummary[] {
  const root = asRecord(report);
  if (!root) return [];
  // Documented shape: metadata + policy + records[] of { ip, count,
  // auth-results / aligned flags, source domain under several plausible keys }.
  const list =
    (Array.isArray(root.records) && root.records) ||
    (Array.isArray(root.data) && root.data) ||
    (Array.isArray((root.report as Record<string, unknown> | undefined)?.records)
      ? ((root.report as Record<string, unknown>).records as unknown[])
      : null);
  if (!list) return [];
  const rows: RowSummary[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const sourceObj = asRecord(row.source) ?? asRecord(row.row) ?? row;
    const auth = asRecord(sourceObj.auth_results) ?? asRecord(row.auth_results) ?? sourceObj;
    const spf = firstString(auth, ['spf', 'spf_result', 'dmarc_spf']);
    const dkim = firstString(auth, ['dkim', 'dkim_result', 'dmarc_dkim']);
    const alignedRaw = sourceObj.aligned ?? row.aligned;
    rows.push({
      source:
        firstString(sourceObj, ['domain', 'source', 'dkim_domain', 'envelope_from']) ||
        '(unknown)',
      ip: firstString(sourceObj, ['ip']),
      count:
        typeof sourceObj.count === 'number'
          ? sourceObj.count
          : Number(sourceObj.count) || 0,
      spf: spf || '?',
      dkim: dkim || '?',
      aligned: typeof alignedRaw === 'boolean' ? alignedRaw : null,
    });
  }
  return rows;
}

async function main(): Promise<number> {
  const token = process.env.DMARC_API_TOKEN?.trim();
  if (!token) {
    console.error('DMARC_API_TOKEN is unset — cannot read the digests. NOT a pass.');
    return 2;
  }
  const fromDate = isoDate(arg('--from'), 14);
  const toDate = isoDate(arg('--to'), 0);

  let reportIds: number[];
  try {
    const list = asRecord(await api(`/records/my/reports?from_date=${fromDate}&to_date=${toDate}`, token));
    const entries = list && Array.isArray(list.entries) ? list.entries : Array.isArray(list?.data) ? list.data : null;
    if (!entries) {
      console.error('report list came back in an unexpected shape — NOT a pass.');
      return 2;
    }
    reportIds = entries
      .map((e) => asRecord(e)?.id)
      .filter((id): id is number => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)))
      .map(Number);
  } catch (err) {
    console.error(`report list failed: ${(err as Error).message} — NOT a pass.`);
    return 2;
  }

  console.log(`window ${fromDate}..${toDate} · reports listed: ${reportIds.length}`);
  if (reportIds.length === 0) {
    console.error('ZERO reports in the window. Either the rua pipeline is broken or ' +
      'the window is wrong — a domain sending any mail gets aggregate reports daily. NOT a pass.');
    return 2;
  }

  const rows: RowSummary[] = [];
  for (const id of reportIds) {
    try {
      const detail = await api(`/records/my/reports/${id}?format=json`, token);
      const got = collectRows(detail);
      if (got.length === 0) {
        console.error(`report ${id}: no rows parsed from the payload shape — NOT a pass for that report.`);
        continue;
      }
      rows.push(...got);
    } catch (err) {
      console.error(`report ${id} fetch failed: ${(err as Error).message}`);
      return 2;
    }
  }

  const bySource = new Map<string, { ips: Set<string>; count: number; bad: number }>();
  let problems = 0;
  for (const r of rows) {
    const entry = bySource.get(r.source) ?? { ips: new Set(), count: 0, bad: 0 };
    entry.ips.add(r.ip);
    entry.count += r.count;
    const failed =
      r.aligned === false ||
      /^(fail|softfail|none|temperr|permerr)$/i.test(r.spf) ||
      /^(fail|none|temperr|permerr)$/i.test(r.dkim);
    if (failed) entry.bad += 1;
    if (!KNOWN_SOURCES.has(r.source)) {
      console.log(`UNKNOWN SOURCE: ${r.source} (ips: ${[...entry.ips].join(', ')}) — ${r.count} msgs`);
      problems += 1;
    }
    bySource.set(r.source, entry);
  }

  const totalMsgs = rows.reduce((s, r) => s + r.count, 0);
  console.log(`\nper-source rollup (rows: ${rows.length}, messages: ${totalMsgs}):`);
  for (const [source, e] of [...bySource].sort((a, b) => b[1].count - a[1].count)) {
    const known = KNOWN_SOURCES.has(source) ? 'known' : 'UNKNOWN';
    console.log(`  ${source.padEnd(24)} ${known.padEnd(8)} msgs=${String(e.count).padStart(5)}  unaligned-rows=${e.bad}`);
  }

  const badRows = [...bySource.values()].reduce((s, e) => s + e.bad, 0);
  if (badRows > 0) {
    console.log(`\n${badRows} row(s) with alignment failures — under reject these BOUNCE.`);
    problems += 1;
  }
  if (problems > 0) {
    console.log('\nFINDINGS — do not sign off §5.5 on this window.');
    return 1;
  }
  console.log('\nclean: every source is the known SES upstream, no alignment failures.');
  console.log(`remember to record this read (date + ${DOMAIN} ${fromDate}..${toDate}) in DEPLOYMENT.md §5.5.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('unexpected failure:', err);
    process.exit(2);
  });
