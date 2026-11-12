/**
 * The rows every new community starts with, shared by the two creation paths:
 * self-serve provisioning (`provisioning-service.ts`, after Stripe checkout) and
 * a property manager adding a community (`lib/pm/create-community.ts`).
 *
 * They drifted: the PM path omitted `isSystem` on the default document
 * categories (so they were treated as manager-made and could be renamed or
 * deleted like one) and set only `emailFrequency` on the creator's preferences.
 * Both paths build their rows here so they cannot drift again.
 *
 * Pure on purpose: no `@propertypro/db` import, so loading it never needs a
 * database URL.
 */

export interface DefaultCategoryTemplate {
  name: string;
  description: string;
}

/** Default document categories are system categories, on every creation path. */
export function buildDefaultDocumentCategoryRows(
  communityId: number,
  templates: readonly DefaultCategoryTemplate[],
) {
  return templates.map((t) => ({
    communityId,
    name: t.name,
    description: t.description,
    isSystem: true,
  }));
}

/** The creator's notification preferences: every email and in-app channel on. */
export function buildCreatorNotificationPreferences(userId: string, communityId: number) {
  return {
    userId,
    communityId,
    emailFrequency: 'immediate' as const,
    emailAnnouncements: true,
    emailMeetings: true,
    inAppEnabled: true,
  };
}
