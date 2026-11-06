/* eslint-disable no-console -- CLI script; console output is intentional */

/**
 * Bring every condominium's and HOA's compliance checklist in line with the
 * templates in `packages/shared/src/compliance/templates.ts`.
 *
 * Two things change when a template changes, and only one of them happens on
 * its own:
 *
 *   - A NEW template row reaches each community without this script:
 *     `ensureTransparencyChecklistInitialized` inserts missing keys the next time
 *     anyone opens the website home. This script inserts them now instead.
 *   - A changed title, description, category, citation or conditional flag on
 *     an EXISTING row never reaches it except through this script.
 *
 * It never touches `deadline`, `rolling_window`, the linked document, or a
 * manager's not-applicable decision.
 *
 * A DRY RUN IS THE DEFAULT. It reads, prints what it would insert and change,
 * and writes nothing. Review that output first, then run with --apply.
 *
 * Usage (a person runs these; `.env.local`'s DATABASE_URL is PRODUCTION, so the
 * wrapper targets production, and the script prints the host and database it
 * is about to use before it reads anything). Rebuild `@propertypro/shared`
 * first: this reads its `dist/`, so a stale build plans the OLD templates.
 *
 *   pnpm --filter @propertypro/shared build
 *
 *   1. Dry run, every non-deleted condominium and HOA (narrow with --community):
 *        scripts/with-env-local.sh pnpm exec tsx --tsconfig apps/web/tsconfig.json \
 *          scripts/backfill-compliance-templates.ts
 *
 *   2. Apply, after the dry run has been reviewed:
 *        scripts/with-env-local.sh pnpm exec tsx --tsconfig apps/web/tsconfig.json \
 *          scripts/backfill-compliance-templates.ts --apply --operator "Your Name"
 *
 * Flags:
 *   --apply              write the changes (default: dry run)
 *   --community <id>     only this community; repeatable. An id that does not
 *                        exist, is deleted, or is not a condominium or HOA is
 *                        reported and skipped.
 *   --operator <name>    who is running this; REQUIRED with --apply. Written to
 *                        every audit row as metadata.operator. See "Prod Data
 *                        Repairs" in .claude/rules/migration-safety.md.
 *
 * Each community is one transaction, and every inserted or changed row writes
 * its `data_repair` audit entry inside that same transaction, so a change cannot
 * land without its record. Re-running is safe: a community already in line
 * plans nothing.
 */
import {
  communities,
  complianceChecklistItems,
  logAuditEvent,
} from '@propertypro/db';
import { and, eq, inArray, isNull } from '@propertypro/db/filters';
// AUTHZ: CLI/seed script — runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  calculatePostingDeadline,
  getComplianceTemplate,
  type ComplianceTemplateItem,
  type CommunityType,
} from '@propertypro/shared';
import { runOpsScript } from './lib/run-ops-script';

const BACKFILL_COMMUNITY_TYPES = ['condo_718', 'hoa_720'] as const satisfies readonly CommunityType[];
const SCRIPT_NAME = 'backfill-compliance-templates';

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
    const eqAt = token.indexOf('=');
    const flag = token.startsWith('--') && eqAt > 0 ? token.slice(0, eqAt) : token;
    const inlineValue = flag !== token ? token.slice(eqAt + 1) : undefined;
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

/** The fields this script keeps in line with the template. */
interface SyncedFields {
  title: string;
  description: string | null;
  category: string;
  statuteReference: string | null;
  isConditional: boolean;
}

export interface ExistingRow extends SyncedFields {
  id: number;
  templateKey: string;
}

export interface PlannedUpdate {
  id: number;
  templateKey: string;
  /** Only the fields that differ, before and after. */
  before: Partial<SyncedFields>;
  after: Partial<SyncedFields>;
}

export interface CommunityPlan {
  inserts: ComplianceTemplateItem[];
  updates: PlannedUpdate[];
}

function syncedFields(item: ComplianceTemplateItem): SyncedFields {
  return {
    title: item.title,
    description: item.description ?? null,
    category: item.category,
    statuteReference: item.statuteReference ?? null,
    isConditional: item.isConditional ?? false,
  };
}

/** What one community needs, from its rows and its template. Pure. */
export function planCommunity(
  template: readonly ComplianceTemplateItem[],
  existingRows: readonly ExistingRow[],
): CommunityPlan {
  const existingByKey = new Map(existingRows.map((row) => [row.templateKey, row]));
  const inserts: ComplianceTemplateItem[] = [];
  const updates: PlannedUpdate[] = [];

  for (const item of template) {
    const existing = existingByKey.get(item.templateKey);
    if (!existing) {
      inserts.push(item);
      continue;
    }
    const target = syncedFields(item);
    const before: Partial<SyncedFields> = {};
    const after: Partial<SyncedFields> = {};
    for (const key of Object.keys(target) as Array<keyof SyncedFields>) {
      const current = key === 'description' || key === 'statuteReference'
        ? (existing[key] ?? null)
        : existing[key];
      if (current !== target[key]) {
        (before as Record<string, unknown>)[key] = current;
        (after as Record<string, unknown>)[key] = target[key];
      }
    }
    if (Object.keys(after).length > 0) {
      updates.push({ id: existing.id, templateKey: item.templateKey, before, after });
    }
  }

  return { inserts, updates };
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

interface CommunityRow {
  id: number;
  slug: string;
  communityType: CommunityType;
  deletedAt: Date | null;
}

export async function runBackfill(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const db = createUnscopedClient();

  console.log(`[${SCRIPT_NAME}] ${args.apply ? 'APPLY' : 'DRY RUN (nothing is written)'}`);
  console.log(`[${SCRIPT_NAME}] target: ${describeTarget(process.env.DATABASE_URL)}`);

  const rows = (await db
    .select({
      id: communities.id,
      slug: communities.slug,
      communityType: communities.communityType,
      deletedAt: communities.deletedAt,
    })
    .from(communities)
    .where(
      args.communityIds.length > 0
        ? inArray(communities.id, args.communityIds)
        : and(inArray(communities.communityType, [...BACKFILL_COMMUNITY_TYPES]), isNull(communities.deletedAt)),
    )) as CommunityRow[];

  const targets: CommunityRow[] = [];
  for (const id of args.communityIds) {
    const row = rows.find((r) => r.id === id);
    if (!row) console.log(`[${SCRIPT_NAME}] skip community ${id}: not found`);
    else if (row.deletedAt) console.log(`[${SCRIPT_NAME}] skip ${row.slug}: deleted`);
    else if (!(BACKFILL_COMMUNITY_TYPES as readonly string[]).includes(row.communityType)) {
      console.log(`[${SCRIPT_NAME}] skip ${row.slug}: ${row.communityType} keeps no checklist`);
    } else targets.push(row);
  }
  if (args.communityIds.length === 0) targets.push(...rows);

  if (targets.length === 0) {
    throw new UsageError('no condominium or HOA community to examine');
  }

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const community of targets) {
    const template = getComplianceTemplate(community.communityType);
    const existingRows = (await db
      .select({
        id: complianceChecklistItems.id,
        templateKey: complianceChecklistItems.templateKey,
        title: complianceChecklistItems.title,
        description: complianceChecklistItems.description,
        category: complianceChecklistItems.category,
        statuteReference: complianceChecklistItems.statuteReference,
        isConditional: complianceChecklistItems.isConditional,
      })
      .from(complianceChecklistItems)
      .where(
        and(
          eq(complianceChecklistItems.communityId, community.id),
          isNull(complianceChecklistItems.deletedAt),
        ),
      )) as ExistingRow[];

    const plan = planCommunity(template, existingRows);
    for (const item of plan.inserts) {
      console.log(`[${SCRIPT_NAME}] ${community.slug}: insert ${item.templateKey}`);
    }
    for (const update of plan.updates) {
      console.log(
        `[${SCRIPT_NAME}] ${community.slug}: update ${update.templateKey} ${JSON.stringify(update.before)} -> ${JSON.stringify(update.after)}`,
      );
    }

    if (args.apply && (plan.inserts.length > 0 || plan.updates.length > 0)) {
      const metadata = { source: 'backfill', script: SCRIPT_NAME, operator: args.operator };
      await db.transaction(async (tx) => {
        const now = new Date();
        if (plan.inserts.length > 0) {
          const inserted = await tx
            .insert(complianceChecklistItems)
            .values(
              plan.inserts.map((item) => ({
                communityId: community.id,
                templateKey: item.templateKey,
                ...syncedFields(item),
                deadline: item.deadlineDays ? calculatePostingDeadline(now, item.deadlineDays) : null,
                rollingWindow: item.rollingMonths ? { months: item.rollingMonths } : null,
                documentId: null,
                documentPostedAt: null,
                lastModifiedBy: null,
              })),
            )
            .returning({ id: complianceChecklistItems.id, templateKey: complianceChecklistItems.templateKey });
          for (const row of inserted) {
            await logAuditEvent(
              {
                userId: null,
                action: 'data_repair',
                resourceType: 'compliance_checklist_item',
                resourceId: String(row.id),
                communityId: community.id,
                newValues: { templateKey: row.templateKey, inserted: true },
                metadata: { ...metadata, reason: 'template row added' },
              },
              tx,
            );
          }
        }
        for (const update of plan.updates) {
          await tx
            .update(complianceChecklistItems)
            .set({ ...update.after, updatedAt: now })
            .where(
              and(
                eq(complianceChecklistItems.id, update.id),
                eq(complianceChecklistItems.communityId, community.id),
                isNull(complianceChecklistItems.deletedAt),
              ),
            );
          await logAuditEvent(
            {
              userId: null,
              action: 'data_repair',
              resourceType: 'compliance_checklist_item',
              resourceId: String(update.id),
              communityId: community.id,
              oldValues: update.before,
              newValues: update.after,
              metadata: { ...metadata, reason: 'template wording or citation changed', templateKey: update.templateKey },
            },
            tx,
          );
        }
      });
    }

    totalInserted += plan.inserts.length;
    totalUpdated += plan.updates.length;
    console.log(
      `[${SCRIPT_NAME}] ${community.slug} (${community.communityType}) inserts=${plan.inserts.length} updates=${plan.updates.length}`,
    );
  }

  console.log(
    `[${SCRIPT_NAME}] ${args.apply ? 'done' : 'dry run done'} communities=${targets.length} inserts=${totalInserted} updates=${totalUpdated}`,
  );
}

void runOpsScript({ name: SCRIPT_NAME, url: import.meta.url, run: () => runBackfill() });
