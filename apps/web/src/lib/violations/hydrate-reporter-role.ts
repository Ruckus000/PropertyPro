import { userRoles, type ScopedClient } from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';

export type ReportedByRole = 'resident' | 'staff' | null;

export interface HasReporter {
  reportedByUserId: string | null;
  [key: string]: unknown;
}

export type WithReportedByRole<T extends HasReporter> = T & { reportedByRole: ReportedByRole };

/**
 * Hydrates violation rows with `reportedByRole` by joining user_roles through
 * the scoped client (so the role reflects the reporter's standing in THIS
 * community). Unknown or removed reporters resolve to `null`.
 */
export async function hydrateReportedByRole<T extends HasReporter>(
  scoped: ScopedClient,
  rows: T[],
): Promise<WithReportedByRole<T>[]> {
  const reporterIds = Array.from(
    new Set(
      rows
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

  return rows.map((v) => ({
    ...v,
    reportedByRole: v.reportedByUserId ? (roleByUser.get(v.reportedByUserId) ?? null) : null,
  }));
}
