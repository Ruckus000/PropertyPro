/* eslint-disable no-console -- CLI script; console output is intentional */

/**
 * Backfill the automatic links between documents already posted and the
 * Florida records (checklist items) they are.
 *
 * Automatic linking (record-auto-link-service) only covers documents posted
 * from now on. This links the ones a community posted before it existed, by the
 * same rules: a document links only when it is the item's single candidate and
 * fits no other open item. Anything less clear is listed as ambiguous and left
 * to a person.
 *
 * A DRY RUN IS THE DEFAULT. It reads, prints what it would link and what is
 * ambiguous, and writes nothing. Review that output first (with the product
 * owner), then run with --apply.
 *
 * Usage (a person runs these; `.env.local`'s DATABASE_URL is PRODUCTION, so the
 * wrapper below targets production, and the script prints the host and database
 * it is about to use before it reads anything):
 *
 *   1. Dry run, every non-deleted condominium and HOA:
 *        scripts/with-env-local.sh pnpm exec tsx --tsconfig apps/web/tsconfig.json \
 *          scripts/backfill-record-auto-links.ts
 *      Narrow it with one or more --community <id>:
 *        scripts/with-env-local.sh pnpm exec tsx --tsconfig apps/web/tsconfig.json \
 *          scripts/backfill-record-auto-links.ts --community 12 --community 31
 *
 *   2. Apply, after the dry run has been reviewed:
 *        scripts/with-env-local.sh pnpm exec tsx --tsconfig apps/web/tsconfig.json \
 *          scripts/backfill-record-auto-links.ts --apply --operator "Your Name"
 *
 * Flags:
 *   --apply              write the links (default: dry run)
 *   --community <id>     only this community; repeatable. An id that does not
 *                        exist, is deleted, or is not a condominium or HOA is
 *                        reported and skipped. Apartments are never linked.
 *   --operator <name>    who is running this; REQUIRED with --apply. Written to
 *                        every audit row as metadata.operator (with
 *                        source: 'backfill'; the audit user id is null, a
 *                        system actor). See "Prod Data Repairs" in
 *                        .claude/rules/migration-safety.md.
 *
 * A community whose checklist was never created (it is created the first time
 * someone opens the website home) has no records to link yet. --apply creates
 * its checklist first, then plans and links. A dry run writes nothing, so it
 * plans those records in memory instead and says so ("checklist not created
 * yet: N records would be checked").
 *
 * Exit codes: 0 done · 1 a community failed (the others still ran) ·
 * 2 bad usage, the communities could not be listed, or there was nothing to
 * check (no community left to examine).
 *
 * Every write goes through applyRecordLinks, whose guarded UPDATE links only an
 * item still unlinked and a document still posted and eligible, in the same
 * community. Re-running is safe: a linked item is no longer open.
 */
import { communities, createScopedClient, documents } from '@propertypro/db';
import { and, inArray, isNull } from '@propertypro/db/filters';
// The `communities` table is the root tenant table and cannot be scoped by
// community_id; this CLI lists which communities to visit, then does every
// per-community read and write through the service's scoped client.
// AUTHZ: ops CLI — out-of-band of tenant scoping with explicit operator authorization.
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import { getComplianceTemplate, type CommunityType } from '@propertypro/shared';
import { isMainModule } from './lib/is-main-module';
// Relative, not `@/`: scripts/vitest.config.ts has no `@/` alias. The service's own
// `@/` imports resolve at run time because the command above passes apps/web's tsconfig.
import {
  applyRecordLinks,
  planCommunityRecordLinks,
} from '../apps/web/src/lib/services/record-auto-link-service';
import { ensureTransparencyChecklistInitialized } from '../apps/web/src/lib/services/transparency-service';

/** The only community types that keep these records. An apartment never does. */
const BACKFILL_COMMUNITY_TYPES = ['condo_718', 'hoa_720'] as const satisfies readonly CommunityType[];

export interface BackfillArgs {
  apply: boolean;
  communityIds: number[];
  operator: string | null;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Parses argv (without node and the script path). Throws UsageError on anything it does not understand. */
export function parseArgs(argv: readonly string[]): BackfillArgs {
  const args: BackfillArgs = { apply: false, communityIds: [], operator: null };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    const eq = token.indexOf('=');
    const flag = token.startsWith('--') && eq > 0 ? token.slice(0, eq) : token;
    const inlineValue = flag !== token ? token.slice(eq + 1) : undefined;
    const value = (): string => {
      const next = inlineValue ?? argv[++i];
      if (next === undefined || (inlineValue === undefined && next.startsWith('--'))) {
        throw new UsageError(`${flag} needs a value`);
      }
      return next;
    };

    switch (flag) {
      case '--apply':
        if (inlineValue !== undefined) throw new UsageError('--apply takes no value');
        args.apply = true;
        break;
      case '--community': {
        const raw = value();
        if (!/^[1-9]\d*$/.test(raw)) throw new UsageError(`--community needs a positive whole number, got "${raw}"`);
        const id = Number(raw);
        if (!args.communityIds.includes(id)) args.communityIds.push(id);
        break;
      }
      case '--operator': {
        const name = value().trim();
        if (name === '') throw new UsageError('--operator needs a name');
        args.operator = name;
        break;
      }
      default:
        throw new UsageError(`unknown argument "${token}"`);
    }
  }

  if (args.apply && args.operator === null) {
    throw new UsageError('--apply needs --operator <name>: the audit rows record who ran the backfill');
  }
  return args;
}

interface CommunityRow {
  id: number;
  slug: string;
  name: string;
  communityType: CommunityType;
}

function isBackfillType(type: string): boolean {
  return (BACKFILL_COMMUNITY_TYPES as readonly string[]).includes(type);
}

/**
 * Host, port and database name of DATABASE_URL, each named, and nothing else
 * from the URL: never its user, password or query string.
 */
export function describeTarget(raw: string | undefined): string {
  if (!raw) return '(DATABASE_URL is not set)';
  try {
    const url = new URL(raw);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return `host ${url.hostname} · port ${url.port || '(default)'} · database ${database || '(default)'}`;
  } catch {
    return '(DATABASE_URL could not be parsed)';
  }
}

/**
 * The communities to visit, and a note for each requested id that is not one.
 * Without --community: every non-deleted condominium and HOA.
 */
async function selectCommunities(
  requestedIds: readonly number[],
): Promise<{ selected: CommunityRow[]; skipped: string[] }> {
  const db = createUnscopedClient();
  const notDeleted = isNull(communities.deletedAt);
  const where =
    requestedIds.length > 0
      ? and(notDeleted, inArray(communities.id, [...requestedIds]))
      : and(notDeleted, inArray(communities.communityType, [...BACKFILL_COMMUNITY_TYPES]));
  const rows = (await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      communityType: communities.communityType,
    })
    .from(communities)
    .where(where)
    .orderBy(communities.id)) as CommunityRow[];

  // Checked again here, not only in the query: an apartment must never be linked
  // whatever the predicate above says.
  const selected = rows.filter((row) => isBackfillType(row.communityType));
  const skipped: string[] = [];
  for (const id of requestedIds) {
    const row = rows.find((r) => r.id === id);
    if (!row) skipped.push(`community ${id}: not found (or deleted); skipped`);
    else if (!isBackfillType(row.communityType)) {
      skipped.push(`community ${id} (${row.slug}): ${row.communityType} is not a condominium or HOA; skipped`);
    }
  }
  return { selected, skipped };
}

async function readDocumentTitles(communityId: number, documentIds: number[]): Promise<Map<number, string>> {
  const titles = new Map<number, string>();
  if (documentIds.length === 0) return titles;
  const rows = (await createScopedClient(communityId).selectFrom(
    documents,
    { id: documents.id, title: documents.title },
    inArray(documents.id, documentIds),
  )) as unknown as Array<{ id: number; title: string }>;
  for (const row of rows) titles.set(Number(row.id), String(row.title));
  return titles;
}

interface CommunityResult {
  planned: number;
  ambiguous: number;
  linked: number;
}

async function backfillCommunity(
  community: CommunityRow,
  options: { apply: boolean; operator: string | null },
): Promise<CommunityResult> {
  // --apply creates any checklist rows the community is missing, then plans
  // against them. A dry run writes nothing, so it plans those records in memory.
  if (options.apply) {
    await ensureTransparencyChecklistInitialized(community.id, community.communityType);
  }
  const plan = await planCommunityRecordLinks(community.id, { includeMissingTemplateItems: !options.apply });
  const itemTitles = new Map(getComplianceTemplate(community.communityType).map((t) => [t.templateKey, t.title]));
  const itemLabel = (templateKey: string): string => `${itemTitles.get(templateKey) ?? templateKey} [${templateKey}]`;
  const documentTitles = await readDocumentTitles(
    community.id,
    [...new Set([...plan.links.map((l) => l.documentId), ...plan.ambiguous.flatMap((a) => a.documentIds)])],
  );
  const documentLabel = (id: number): string => `#${id} "${documentTitles.get(id) ?? '(title not found)'}"`;

  console.log(`\n== Community ${community.id} · ${community.slug} · ${community.name} (${community.communityType})`);
  if (plan.notCreated > 0) {
    console.log(
      `   Note: checklist not created yet: ${plan.notCreated} records would be checked; --apply creates them before linking.`,
    );
  }
  console.log(`   Links planned: ${plan.links.length}`);
  for (const link of plan.links) {
    console.log(`     - ${itemLabel(link.templateKey)}  <-  document ${documentLabel(link.documentId)}`);
  }
  console.log(`   Ambiguous, left to a person: ${plan.ambiguous.length}`);
  for (const item of plan.ambiguous) {
    console.log(`     - ${itemLabel(item.templateKey)}  candidates: ${item.documentIds.map(documentLabel).join(', ')}`);
  }

  let linked = 0;
  if (options.apply && plan.links.length > 0) {
    linked = await applyRecordLinks(community.id, plan.links, null, {
      operator: options.operator as string,
      source: 'backfill',
    });
    console.log(`   Applied: ${linked} of ${plan.links.length} planned link(s) written`);
  }
  return { planned: plan.links.length, ambiguous: plan.ambiguous.length, linked };
}

/** Runs the backfill for argv (without node and the script path). Resolves to the exit code. */
export async function runBackfill(argv: readonly string[]): Promise<number> {
  let args: BackfillArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`backfill-record-auto-links: ${error.message}`);
    console.error('Usage: backfill-record-auto-links.ts [--apply --operator <name>] [--community <id> ...]');
    return 2;
  }

  console.log(args.apply ? 'MODE: APPLY (writes links)' : 'MODE: DRY RUN (writes nothing)');
  console.log(`Database: ${describeTarget(process.env.DATABASE_URL)}`);
  if (args.apply) console.log(`Operator: ${args.operator}`);

  let listing: Awaited<ReturnType<typeof selectCommunities>>;
  try {
    listing = await selectCommunities(args.communityIds);
  } catch (error) {
    console.error(
      `Could not list the communities: ${error instanceof Error ? error.message : String(error)}. Nothing was checked.`,
    );
    return 2;
  }
  const { selected, skipped } = listing;
  for (const note of skipped) console.log(note);
  if (selected.length === 0) {
    console.error('No condominium or HOA to examine; nothing was checked.');
    return 2;
  }

  let exitCode = 0;
  const totals = { communities: 0, planned: 0, ambiguous: 0, linked: 0, failed: 0 };
  for (const community of selected) {
    try {
      const result = await backfillCommunity(community, { apply: args.apply, operator: args.operator });
      totals.communities++;
      totals.planned += result.planned;
      totals.ambiguous += result.ambiguous;
      totals.linked += result.linked;
    } catch (error) {
      totals.failed++;
      exitCode = 1;
      console.error(
        `\n!! Community ${community.id} (${community.slug}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (args.apply) {
        console.error(
          '   Some of its links may already have been written. Re-run the dry run to see what is left before applying again.',
        );
      }
    }
  }

  console.log('\n== Totals');
  console.log(`   Communities examined: ${totals.communities}${totals.failed > 0 ? ` (${totals.failed} failed)` : ''}`);
  console.log(`   Links planned: ${totals.planned}`);
  console.log(`   Ambiguous, left to a person: ${totals.ambiguous}`);
  if (args.apply) console.log(`   Links written: ${totals.linked}`);
  else console.log('   Dry run: nothing was written. Re-run with --apply --operator <name> after review.');
  return exitCode;
}

if (isMainModule(import.meta.url)) {
  runBackfill(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeUnscopedClient());
}
