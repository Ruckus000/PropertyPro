export const ADMIN_USER_ID_HEADER = 'x-user-id';
export const ADMIN_USER_EMAIL_HEADER = 'x-user-email';
export const ADMIN_ROLE_HEADER = 'x-platform-admin-role';

export const ADMIN_FORWARDED_HEADERS = [
  'x-community-id',
  'x-tenant-slug',
  ADMIN_USER_ID_HEADER,
  'x-tenant-source',
  ADMIN_USER_EMAIL_HEADER,
  ADMIN_ROLE_HEADER,
] as const;

export function normalizeAdminHeaderValue(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}
