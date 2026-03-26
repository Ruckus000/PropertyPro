/**
 * Assessment automation service — Phase 1A
 *
 * Four automated operations called by daily/monthly cron endpoints:
 *
 * 1. processOverdueTransitions() — Daily at 06:00 UTC
 *    Moves pending line items past their due date to 'overdue' status.
 *
 * 2. processLateFees() — Daily at 07:00 UTC (after overdue transitions)
 *    Applies late fees to overdue items based on assessment rules.
 *
 * 3. processRecurringAssessments() — Monthly on the 1st at 05:00 UTC
 *    Auto-generates line items for active recurring assessments.
 *
 * 4. processAssessmentDueReminders() — Daily at 08:00 UTC
 *    Sends reminder emails 7 days before assessment due dates.
 *
 * All four use createUnscopedClient() because they scan across communities.
 * Each uses createScopedClient() for tenant-scoped mutations.
 */
import { createElement } from 'react';
import { addDays, format } from 'date-fns';
import {
  assessmentLineItems,
  assessments,
  communities,
  createScopedClient,
  postLedgerEntry,
  units,
  users,
  userRoles,
} from '@propertypro/db';
import { and, eq, inArray, isNull, lt, lte, ne } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { AssessmentDueReminderEmail, sendEmail } from '@propertypro/email';
import { generateAssessmentLineItemsForCommunity } from '@/lib/services/finance-service';
import type { AssessmentFrequency } from '@/lib/services/finance-service';
import { centsToDollars } from '@/lib/finance/common';

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. Overdue status transitions
// ─────────────────────────────────────────────────────────────────────────────

export interface OverdueTransitionSummary {
  communitiesScanned: number;
  itemsTransitioned: number;
  errors: number;
}

/**
 * Finds all pending line items with due_date < today and transitions them
 * to 'overdue' status. Scans across all non-deleted communities.
 */
export async function processOverdueTransitions(
  now: Date = new Date(),
): Promise<OverdueTransitionSummary> {
  const db = createUnscopedClient();
  const today = format(now, 'yyyy-MM-dd');

  const activeCommunities = await db
    .select({ id: communities.id })
    .from(communities)
    .where(isNull(communities.deletedAt));

  const summary: OverdueTransitionSummary = {
    communitiesScanned: activeCommunities.length,
    itemsTransitioned: 0,
    errors: 0,
  };

  for (const community of activeCommunities) {
    try {
      const scoped = createScopedClient(community.id);
      const pendingOverdue = await scoped.selectFrom<{
        id: number;
        unitId: number;
        amountCents: number;
        dueDate: string;
      }>(
        assessmentLineItems,
        {
          id: assessmentLineItems.id,
          unitId: assessmentLineItems.unitId,
          amountCents: assessmentLineItems.amountCents,
          dueDate: assessmentLineItems.dueDate,
        },
        and(
          eq(assessmentLineItems.status, 'pending'),
          lt(assessmentLineItems.dueDate, today),
        ),
      );

      for (const item of pendingOverdue) {
        await scoped.update(
          assessmentLineItems,
          { status: 'overdue' },
          eq(assessmentLineItems.id, item.id),
        );
        summary.itemsTransitioned += 1;
      }
    } catch (err) {
      console.error(
        `[assessment-overdue] Failed for community ${community.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      summary.errors += 1;
    }
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Late fee calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface LateFeeSummary {
  communitiesScanned: number;
  feesApplied: number;
  totalFeeCents: number;
  errors: number;
}

/**
 * For each overdue line item, checks the parent assessment's late fee
 * configuration and applies fees if:
 * - lateFeeAmountCents > 0
 * - days overdue > lateFeeDaysGrace
 * - late fee hasn't already been applied (lateFeeCents === 0)
 *
 * Late fee is applied once (flat fee per line item), not compounding.
 */
export async function processLateFees(
  now: Date = new Date(),
): Promise<LateFeeSummary> {
  const db = createUnscopedClient();
  const today = format(now, 'yyyy-MM-dd');

  const activeCommunities = await db
    .select({ id: communities.id })
    .from(communities)
    .where(isNull(communities.deletedAt));

  const summary: LateFeeSummary = {
    communitiesScanned: activeCommunities.length,
    feesApplied: 0,
    totalFeeCents: 0,
    errors: 0,
  };

  for (const community of activeCommunities) {
    try {
      const scoped = createScopedClient(community.id);

      // Get overdue items that don't have a late fee yet
      const overdueItems = await scoped.selectFrom<{
        id: number;
        assessmentId: number | null;
        unitId: number;
        dueDate: string;
        lateFeeCents: number;
      }>(
        assessmentLineItems,
        {
          id: assessmentLineItems.id,
          assessmentId: assessmentLineItems.assessmentId,
          unitId: assessmentLineItems.unitId,
          dueDate: assessmentLineItems.dueDate,
          lateFeeCents: assessmentLineItems.lateFeeCents,
        },
        and(
          eq(assessmentLineItems.status, 'overdue'),
          eq(assessmentLineItems.lateFeeCents, 0),
        ),
      );

      if (overdueItems.length === 0) continue;

      // Load all assessments for this community to get fee config
      const assessmentRows = await scoped.selectFrom<{
        id: number;
        lateFeeAmountCents: number;
        lateFeeDaysGrace: number;
      }>(
        assessments,
        {
          id: assessments.id,
          lateFeeAmountCents: assessments.lateFeeAmountCents,
          lateFeeDaysGrace: assessments.lateFeeDaysGrace,
        },
      );
      const assessmentMap = new Map(assessmentRows.map((a) => [a.id, a]));

      for (const item of overdueItems) {
        if (!item.assessmentId) continue;
        const assessment = assessmentMap.get(item.assessmentId);
        if (!assessment || assessment.lateFeeAmountCents <= 0) continue;

        // Check grace period
        const dueDate = new Date(`${item.dueDate}T00:00:00.000Z`);
        const daysOverdue = Math.floor(
          (now.getTime() - dueDate.getTime()) / 86_400_000,
        );
        if (daysOverdue <= assessment.lateFeeDaysGrace) continue;

        // Apply late fee
        const feeCents = assessment.lateFeeAmountCents;
        await scoped.update(
          assessmentLineItems,
          { lateFeeCents: feeCents },
          eq(assessmentLineItems.id, item.id),
        );

        // Post ledger entry for the late fee
        await postLedgerEntry(scoped, {
          entryType: 'fee',
          amountCents: feeCents,
          description: `Late fee applied for overdue assessment (line item #${item.id})`,
          sourceType: 'assessment',
          sourceId: String(item.id),
          unitId: item.unitId,
          createdByUserId: null,
          metadata: {
            lineItemId: item.id,
            assessmentId: item.assessmentId,
            notes: `Late fee: ${daysOverdue} days overdue, grace period: ${assessment.lateFeeDaysGrace} days`,
          },
        });

        summary.feesApplied += 1;
        summary.totalFeeCents += feeCents;
      }
    } catch (err) {
      console.error(
        `[late-fee-processor] Failed for community ${community.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      summary.errors += 1;
    }
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Recurring assessment line item generation
// ─────────────────────────────────────────────────────────────────────────────

export interface RecurringAssessmentSummary {
  communitiesScanned: number;
  assessmentsProcessed: number;
  totalInserted: number;
  totalSkipped: number;
  errors: number;
}

/**
 * For each active recurring assessment (monthly, quarterly, annual) across
 * all communities, generates line items for the current period.
 *
 * Quarterly: only generates in months 1, 4, 7, 10.
 * Annual: only generates in month 1 (or the assessment's start month).
 * One-time: skipped (handled manually).
 *
 * Uses the existing generateAssessmentLineItemsForCommunity() which has
 * built-in skip logic for already-generated periods.
 */
export async function processRecurringAssessments(
  now: Date = new Date(),
): Promise<RecurringAssessmentSummary> {
  const db = createUnscopedClient();
  const currentMonth = now.getMonth() + 1; // 1-12

  const activeCommunities = await db
    .select({ id: communities.id })
    .from(communities)
    .where(isNull(communities.deletedAt));

  const summary: RecurringAssessmentSummary = {
    communitiesScanned: activeCommunities.length,
    assessmentsProcessed: 0,
    totalInserted: 0,
    totalSkipped: 0,
    errors: 0,
  };

  for (const community of activeCommunities) {
    try {
      const scoped = createScopedClient(community.id);

      // Get active recurring assessments (exclude one_time)
      const activeAssessments = await scoped.selectFrom<{
        id: number;
        frequency: string;
        startDate: string;
        endDate: string | null;
        isActive: boolean;
      }>(
        assessments,
        {
          id: assessments.id,
          frequency: assessments.frequency,
          startDate: assessments.startDate,
          endDate: assessments.endDate,
          isActive: assessments.isActive,
        },
        and(
          eq(assessments.isActive, true),
          ne(assessments.frequency, 'one_time'),
        ),
      );

      for (const assessment of activeAssessments) {
        // Check if this assessment should generate this month
        if (!shouldGenerateThisMonth(assessment.frequency as AssessmentFrequency, currentMonth, assessment.startDate)) {
          continue;
        }

        // Check end date
        if (assessment.endDate) {
          const endDate = new Date(`${assessment.endDate}T00:00:00.000Z`);
          if (now > endDate) continue;
        }

        try {
          const result = await generateAssessmentLineItemsForCommunity(
            community.id,
            assessment.id,
            null,
          );
          summary.assessmentsProcessed += 1;
          summary.totalInserted += result.insertedCount;
          summary.totalSkipped += result.skippedCount;
        } catch (err) {
          console.error(
            `[generate-assessments] Failed for assessment ${assessment.id} in community ${community.id}:`,
            err instanceof Error ? err.message : String(err),
          );
          summary.errors += 1;
        }
      }
    } catch (err) {
      console.error(
        `[generate-assessments] Failed for community ${community.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      summary.errors += 1;
    }
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Assessment due date reminders
// ─────────────────────────────────────────────────────────────────────────────

export interface DueReminderSummary {
  communitiesScanned: number;
  emailsSent: number;
  errors: number;
}

/**
 * Sends reminder emails to unit owners whose assessment line items are due
 * in exactly 7 days. Scans across all non-deleted communities.
 *
 * Only sends to 'pending' line items (not already paid/overdue/waived).
 * Looks up the unit owner via userRoles → users join.
 */
export async function processAssessmentDueReminders(
  now: Date = new Date(),
): Promise<DueReminderSummary> {
  const db = createUnscopedClient();
  const reminderDate = format(addDays(now, 7), 'yyyy-MM-dd');

  const activeCommunities = await db
    .select({ id: communities.id, name: communities.name })
    .from(communities)
    .where(isNull(communities.deletedAt));

  const summary: DueReminderSummary = {
    communitiesScanned: activeCommunities.length,
    emailsSent: 0,
    errors: 0,
  };

  for (const community of activeCommunities) {
    try {
      const scoped = createScopedClient(community.id);

      // Find pending line items due in exactly 7 days
      const dueItems = await scoped.selectFrom<{
        id: number;
        assessmentId: number | null;
        unitId: number;
        amountCents: number;
        dueDate: string;
        lateFeeCents: number;
      }>(
        assessmentLineItems,
        {
          id: assessmentLineItems.id,
          assessmentId: assessmentLineItems.assessmentId,
          unitId: assessmentLineItems.unitId,
          amountCents: assessmentLineItems.amountCents,
          dueDate: assessmentLineItems.dueDate,
          lateFeeCents: assessmentLineItems.lateFeeCents,
        },
        and(
          eq(assessmentLineItems.status, 'pending'),
          eq(assessmentLineItems.dueDate, reminderDate),
        ),
      );

      if (dueItems.length === 0) continue;

      // Load assessment titles
      const assessmentIds = [...new Set(dueItems.map((i) => i.assessmentId).filter(Boolean))] as number[];
      const assessmentRows = assessmentIds.length > 0
        ? await scoped.selectFrom<{ id: number; title: string }>(
            assessments,
            { id: assessments.id, title: assessments.title },
            inArray(assessments.id, assessmentIds),
          )
        : [];
      const assessmentMap = new Map(assessmentRows.map((a) => [a.id, a.title]));

      // Find unit owners: look up via userRoles which unit each user owns
      const unitIds = [...new Set(dueItems.map((i) => i.unitId))];

      // Get all owner-role users for these units in this community
      const ownerRows = await db
        .select({
          unitId: units.id,
          email: users.email,
          fullName: users.fullName,
        })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.userId, users.id))
        .innerJoin(units, eq(userRoles.unitId, units.id))
        .where(
          and(
            eq(userRoles.communityId, community.id),
            eq(userRoles.role, 'resident'),
            inArray(units.id, unitIds),
            isNull(users.deletedAt),
          ),
        );

      const ownerByUnit = new Map(
        ownerRows.map((r) => [r.unitId, { email: r.email, fullName: r.fullName }]),
      );

      const portalUrl = `${getBaseUrl()}/payments?communityId=${community.id}`;

      for (const item of dueItems) {
        const owner = ownerByUnit.get(item.unitId);
        if (!owner?.email) continue;

        const assessmentTitle = (item.assessmentId && assessmentMap.get(item.assessmentId)) || 'Assessment';
        const totalCents = item.amountCents + item.lateFeeCents;
        const dueDate = format(new Date(`${item.dueDate}T00:00:00.000Z`), 'MMM d, yyyy');

        try {
          await sendEmail({
            to: owner.email,
            subject: `Reminder: ${assessmentTitle} of $${centsToDollars(totalCents)} due ${dueDate}`,
            category: 'transactional',
            react: createElement(AssessmentDueReminderEmail, {
              branding: { communityName: community.name },
              recipientName: owner.fullName ?? owner.email,
              assessmentTitle,
              amountDue: `$${centsToDollars(totalCents)}`,
              dueDate,
              portalUrl,
            }),
          });
          summary.emailsSent += 1;
        } catch (emailErr) {
          console.error(
            `[due-reminders] Email failed for unit ${item.unitId} in community ${community.id}:`,
            emailErr instanceof Error ? emailErr.message : String(emailErr),
          );
          summary.errors += 1;
        }
      }
    } catch (err) {
      console.error(
        `[due-reminders] Failed for community ${community.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      summary.errors += 1;
    }
  }

  return summary;
}

function shouldGenerateThisMonth(
  frequency: AssessmentFrequency,
  currentMonth: number,
  startDate: string,
): boolean {
  switch (frequency) {
    case 'monthly':
      return true;
    case 'quarterly': {
      // Generate in months that align with the start month's quarter cycle
      const startMonth = new Date(`${startDate}T00:00:00.000Z`).getMonth() + 1;
      return (currentMonth - startMonth) % 3 === 0;
    }
    case 'annual': {
      const startMonth = new Date(`${startDate}T00:00:00.000Z`).getMonth() + 1;
      return currentMonth === startMonth;
    }
    case 'one_time':
      return false;
    default:
      return false;
  }
}
