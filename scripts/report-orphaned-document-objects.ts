/**
 * Orphaned `documents`-bucket objects — REPORT ONLY. Deletes nothing, ever.
 *
 * ## The problem
 *
 * Uploading a document is two-phase and only the first phase is durable.
 * `POST /api/v1/upload` presigns a path and creates NO row of any kind — the
 * `documentId` it returns is a `crypto.randomUUID()` used solely to namespace
 * the path. The browser PUTs the bytes. Only then does
 * `POST /api/v1/documents` write the metadata row. If that third step fails —
 * a validation error, an authz gate, the redaction attestation, a dropped
 * connection — the bytes exist and nothing in the database knows they do.
 *
 * Nothing reclaims them. There is no cron in either `vercel.json`, no bucket
 * lifecycle rule, and this bucket is deliberately permanent
 * (`storage-buckets.ts`: "exports expire; documents are permanent"). An orphan
 * is therefore invisible and undeletable through every product surface: no
 * board can list it, download it, or remove it.
 *
 * ## Why this reports instead of deleting
 *
 * The same split as `reconcile-site-assets-usage.ts`, for the same reason.
 * Measuring is safe and re-runnable; deleting is destructive, irreversible,
 * and correct only if the reference model is COMPLETE. A missed reference
 * source does not fail loudly — it prints a LIVE document as an orphan, and
 * that is how data gets deleted by someone who trusted the report. Run it,
 * read it, then decide separately.
 *
 * There is deliberately no `--delete` flag, not even an inert one.
 *
 * The reference model, the six writers it covers, and the two path shapes that
 * are indistinguishable from each other all live in
 * `scripts/lib/document-object-orphans.ts` — read that before trusting any
 * number this prints.
 *
 * ## Exit codes
 *
 * 0  a report was produced — WHATEVER IT SAYS. Finding orphans is still 0.
 * 1  a report could NOT be produced: the database was unreachable, the bucket
 *    returned zero objects, or zero communities were scanned.
 *
 * There is deliberately no distinct "orphans were found" exit code, because
 * the first thing someone does with one is wire it into CI. A non-zero exit
 * from this script NEVER means orphans exist — it means the scan did not
 * happen. Do not add this to localci's `gate` or `suite`.
 *
 * Usage:
 *   pnpm documents:orphan-report
 *   pnpm documents:orphan-report --json
 *   pnpm documents:orphan-report --max-age-hours=48
 */
// Operator-run maintenance CLI, never reachable from a request path. It compares
// the whole documents bucket against every tenant's rows, so a per-tenant scoped
// client cannot express the query by construction.
// AUTHZ: Cross-tenant storage-orphan reporting; operator-run CLI, no request path.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  analyzeOrphans,
  communitiesQuery,
  parseReportArgs,
  referencePathsQuery,
  storageObjectsQuery,
  KIND_NOTES,
  type CommunityRow,
  type OrphanReportResult,
  type ReferencePathRow,
  type StorageObjectRow,
} from './lib/document-object-orphans';
import { runOpsScript } from './lib/run-ops-script';

function mib(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function printReport(result: OrphanReportResult): void {
  console.log(
    `\nScanned ${result.totalObjects} objects in the "${result.bucket}" bucket against ` +
      `${result.referencePathCount} reference paths across ${result.communityCount} communities.\n\n` +
      `  referenced   ${result.referencedObjects}\n` +
      `  too new      ${result.tooNewObjects}  (under the age cutoff — may still be mid-flight)\n` +
      `  unmodelled   ${result.unmodelledObjects} (${mib(result.unmodelledBytes)})  authored-assets/ —\n` +
      '               referenced from inside HTML, so NOT counted as orphans\n',
  );

  if (result.orphanCount === 0) {
    console.log('✅ No orphaned objects under the modelled path shapes.\n');
    return;
  }

  for (const group of result.groups) {
    const name =
      group.communityId === null
        ? 'no community segment in path'
        : `${group.slug ?? '(community row gone)'} (#${group.communityId})`;
    console.log(name);
    if (group.communityRowMissing) {
      console.log('  NOTE: no community row. documents.community_id is ON DELETE cascade, so');
      console.log('        hard-deleting a community removed its documents rows and stranded');
      console.log('        these bytes. Different cause from a failed upload, different decision.');
    }
    console.log(`  ORPHANS ${group.orphanCount} objects, ${mib(group.orphanBytes)}`);
    for (const orphan of group.orphans.slice(0, 10)) {
      console.log(`          ${orphan.path}`);
      console.log(`            ${orphan.kind} — ${KIND_NOTES[orphan.kind]}`);
    }
    if (group.orphans.length > 10) {
      console.log(`          … and ${group.orphans.length - 10} more`);
    }
    console.log('');
  }

  console.log(`Total orphaned: ${result.orphanCount} objects, ${mib(result.orphanBytes)}.`);
  console.log('This script does not delete anything. That is a separate decision.\n');
}

async function run(): Promise<void> {
  const { asJson, maxAgeHours } = parseReportArgs(process.argv.slice(2));
  const db = createUnscopedClient();

  const objects = (await db.execute(storageObjectsQuery())) as unknown as StorageObjectRow[];
  const communities = (await db.execute(communitiesQuery())) as unknown as CommunityRow[];
  const references = (await db.execute(referencePathsQuery())) as unknown as ReferencePathRow[];

  const result = analyzeOrphans({
    objects,
    communities,
    references,
    ...(maxAgeHours !== undefined ? { maxAgeHours } : {}),
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printReport(result);
}

void runOpsScript({ name: 'report-orphaned-document-objects', url: import.meta.url, run });
