import { createAdminClient } from '@propertypro/db/supabase/admin';

interface UserDisplayNameRow {
  id: string;
  full_name: string | null;
}

function getFallbackUserDisplayName(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

export async function resolveUserDisplayNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId) => typeof userId === 'string' && userId.length > 0)),
  );

  const displayNames = new Map<string, string>();

  if (uniqueUserIds.length === 0) {
    return displayNames;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, full_name')
    .in('id', uniqueUserIds);

  if (error) {
    throw new Error(`Failed to resolve user display names: ${error.message}`);
  }

  const rows = (data ?? []) as UserDisplayNameRow[];
  for (const row of rows) {
    displayNames.set(
      row.id,
      row.full_name?.trim() || getFallbackUserDisplayName(row.id),
    );
  }

  for (const userId of uniqueUserIds) {
    if (!displayNames.has(userId)) {
      displayNames.set(userId, getFallbackUserDisplayName(userId));
    }
  }

  return displayNames;
}
