/**
 * P4-64: Community data export service.
 *
 * Generates CSV exports for community data (residents, documents,
 * maintenance requests, announcements) using the scoped client for
 * tenant isolation. Reuses the existing RFC 4180-compliant CSV
 * generator with formula-injection sanitization.
 *
 * The residents export requires an unscoped lookup on the `users` table
 * (which has no community_id column). This file is allowlisted in
 * scripts/verify-scoped-db-access.ts for that reason.
 */
import { createScopedClient } from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  userRoles,
  users,
  documents,
  maintenanceRequests,
  announcements,
  units,
} from '@propertypro/db';
import type {
  UserRoleRecord,
  Unit,
  Document,
  MaintenanceRequest,
  Announcement,
} from '@propertypro/db';
import { generateCSV } from './csv-export';

const MAX_EXPORT_ROWS = 10_000;

/** Format a date value for CSV export as ISO 8601, handling null/non-Date values. */
function formatDateForExport(date: unknown): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  return String(date ?? '');
}

export interface ExportedCSV {
  filename: string;
  content: string;
  rowCount: number;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Residents export (user_roles + users join)
// ---------------------------------------------------------------------------

const RESIDENTS_HEADERS = [
  { key: 'userId', label: 'User ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'unitNumber', label: 'Unit Number' },
  { key: 'memberSince', label: 'Member Since' },
] as const;

export async function exportResidents(communityId: number): Promise<ExportedCSV> {
  const scoped = createScopedClient(communityId);

  // Tenant-scoped: user roles for this community
  const roleRows = await scoped
    .selectFrom(userRoles, {})
    .limit(MAX_EXPORT_ROWS);
  const typedRoles = roleRows as unknown as UserRoleRecord[];

  // Collect referenced unit IDs and user IDs from role rows
  const unitIds = [
    ...new Set(
      typedRoles.map((r) => r.unitId).filter(Boolean) as number[],
    ),
  ];
  const userIds = [...new Set(typedRoles.map((r) => r.userId))];

  // Fetch units (scoped) and users (unscoped) in parallel — independent queries
  const [unitRows, userRows] = await Promise.all([
    unitIds.length > 0
      ? scoped.selectFrom(units, {}, inArray(units.id, unitIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? createUnscopedClient()
          .select({ id: users.id, fullName: users.fullName, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const unitMap = new Map<number, string>();
  for (const u of unitRows as unknown as Unit[]) {
    unitMap.set(u.id, u.unitNumber ?? '');
  }

  const userMap = new Map<string, { fullName: string; email: string }>();
  for (const u of userRows as Array<{ id: string; fullName: string | null; email: string }>) {
    userMap.set(u.id, { fullName: u.fullName ?? '', email: u.email });
  }

  const rows = typedRoles.map((role) => {
    const user = userMap.get(role.userId);
    return {
      userId: role.userId,
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      role: role.role,
      unitNumber: role.unitId ? (unitMap.get(role.unitId) ?? '') : '',
      memberSince: formatDateForExport(role.createdAt),
    };
  });

  return {
    filename: 'residents.csv',
    content: generateCSV(RESIDENTS_HEADERS, rows),
    rowCount: rows.length,
    truncated: typedRoles.length >= MAX_EXPORT_ROWS,
  };
}

// ---------------------------------------------------------------------------
// Documents export (metadata only — no file contents)
// ---------------------------------------------------------------------------

const DOCUMENTS_HEADERS = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'fileName', label: 'File Name' },
  { key: 'fileSize', label: 'File Size (bytes)' },
  { key: 'mimeType', label: 'MIME Type' },
  { key: 'categoryId', label: 'Category ID' },
  { key: 'createdAt', label: 'Created At' },
  { key: 'updatedAt', label: 'Updated At' },
] as const;

export async function exportDocuments(communityId: number): Promise<ExportedCSV> {
  const scoped = createScopedClient(communityId);
  const rawRows = await scoped
    .selectFrom(documents, {})
    .limit(MAX_EXPORT_ROWS);
  const typedRows = rawRows as unknown as Document[];

  const rows = typedRows.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    fileName: row.fileName ?? '',
    fileSize: row.fileSize ?? '',
    mimeType: row.mimeType ?? '',
    categoryId: row.categoryId ?? '',
    createdAt: formatDateForExport(row.createdAt),
    updatedAt: formatDateForExport(row.updatedAt),
  }));

  return {
    filename: 'documents.csv',
    content: generateCSV(DOCUMENTS_HEADERS, rows),
    rowCount: rows.length,
    truncated: typedRows.length >= MAX_EXPORT_ROWS,
  };
}

// ---------------------------------------------------------------------------
// Maintenance requests export
// ---------------------------------------------------------------------------

const MAINTENANCE_HEADERS = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'submittedById', label: 'Submitted By' },
  { key: 'assignedToId', label: 'Assigned To' },
  { key: 'resolutionDescription', label: 'Resolution' },
  { key: 'resolutionDate', label: 'Resolution Date' },
  { key: 'createdAt', label: 'Created At' },
  { key: 'updatedAt', label: 'Updated At' },
] as const;

export async function exportMaintenanceRequests(communityId: number): Promise<ExportedCSV> {
  const scoped = createScopedClient(communityId);
  const rawRows = await scoped
    .selectFrom(maintenanceRequests, {})
    .limit(MAX_EXPORT_ROWS);
  const typedRows = rawRows as unknown as MaintenanceRequest[];

  const rows = typedRows.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    status: row.status ?? '',
    priority: row.priority ?? '',
    category: row.category ?? '',
    submittedById: row.submittedById ?? '',
    assignedToId: row.assignedToId ?? '',
    resolutionDescription: row.resolutionDescription ?? '',
    resolutionDate: formatDateForExport(row.resolutionDate),
    createdAt: formatDateForExport(row.createdAt),
    updatedAt: formatDateForExport(row.updatedAt),
  }));

  return {
    filename: 'maintenance-requests.csv',
    content: generateCSV(MAINTENANCE_HEADERS, rows),
    rowCount: rows.length,
    truncated: typedRows.length >= MAX_EXPORT_ROWS,
  };
}

// ---------------------------------------------------------------------------
// Announcements export
// ---------------------------------------------------------------------------

const ANNOUNCEMENTS_HEADERS = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'body', label: 'Body' },
  { key: 'audience', label: 'Audience' },
  { key: 'isPinned', label: 'Pinned' },
  { key: 'archivedAt', label: 'Archived At' },
  { key: 'publishedBy', label: 'Published By' },
  { key: 'publishedAt', label: 'Published At' },
  { key: 'createdAt', label: 'Created At' },
] as const;

export async function exportAnnouncements(communityId: number): Promise<ExportedCSV> {
  const scoped = createScopedClient(communityId);
  const rawRows = await scoped
    .selectFrom(announcements, {})
    .limit(MAX_EXPORT_ROWS);
  const typedRows = rawRows as unknown as Announcement[];

  const rows = typedRows.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    body: row.body ?? '',
    audience: row.audience ?? '',
    isPinned: row.isPinned ? 'Yes' : 'No',
    archivedAt: formatDateForExport(row.archivedAt),
    publishedBy: row.publishedBy ?? '',
    publishedAt: formatDateForExport(row.publishedAt),
    createdAt: formatDateForExport(row.createdAt),
  }));

  return {
    filename: 'announcements.csv',
    content: generateCSV(ANNOUNCEMENTS_HEADERS, rows),
    rowCount: rows.length,
    truncated: typedRows.length >= MAX_EXPORT_ROWS,
  };
}
