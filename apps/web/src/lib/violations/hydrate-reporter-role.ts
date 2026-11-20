import { userRoles, type ScopedClient } from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { redactViolationReporter } from '@/lib/violations/common';

export type ReportedByRole = 'resident' | 'staff' | null;

export interface HasReporter {
  reportedByUserId: string | null;
  [key: string]: unknown;
}

export type WithReportedByRole<T extends HasReporter> = T & { reportedByRole: ReportedByRole };

/** Who is reading the rows — decides whose reporter may be named (D1b). */
export interface ReporterViewer {
  membership: Pick<CommunityMembership, 'isAdmin' | 'designation'>;
  userId: string;
}

/**
 * Hydrates violation rows with `reportedByRole` by joining user_roles through
 * the scoped client (so the role reflects the reporter's standing in THIS
 * community). Unknown or removed reporters resolve to `null`.
 *
 * `viewer` is required: a row whose reporter the viewer may not see
 * (`redactViolationReporter`, D1b) comes back with both `reportedByUserId` and
 * `reportedByRole` null, and its reporter is never looked up.
 */
export async function hydrateReportedByRole<T extends HasReporter>(
  scoped: ScopedClient,
  rows: T[],
  viewer: ReporterViewer,
): Promise<WithReportedByRole<T>[]> {
  const visible = rows.map((v) => redactViolationReporter(v, viewer.membership, viewer.userId));
  const reporterIds = Array.from(
    new Set(
      visible
        .map((v) => v.reportedByUserId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );

  const roleByUser = new Map<string, Exclude<ReportedByRole, null>>();
  if (reporterIds.length > 0) {
    const reporterRoles = await scoped.selectFrom<{ userId: string; role: string }>(
      userRoles,
      { userId: userRoles.userId, role: userRoles.role },
      inArray(userRoles.userId, reporterIds),
    );
    for (const r of reporterRoles) {
      roleByUser.set(r.userId, r.role === 'resident' ? 'resident' : 'staff');
    }
  }

  return visible.map((v) => ({
    ...v,
    reportedByRole: v.reportedByUserId ? (roleByUser.get(v.reportedByUserId) ?? null) : null,
  }));
}
