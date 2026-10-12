/**
 * Where the dashboard remembers that someone closed their setup checklist.
 *
 * Two facts, each keyed by person AND community:
 * - `dismissed`: they closed the in-progress checklist ("I'll handle this later").
 * - `celebrated`: they closed the all-complete celebration.
 *
 * They are separate on purpose. Closing an unfinished checklist must not hide
 * the celebration they later earn, and closing the celebration must keep it
 * closed. One shared flag could not do both: the old code cleared it on every
 * all-complete render, so the celebration's close button never worked.
 *
 * Keys used to carry only the community id, so on a shared browser one
 * person's dismissal hid the checklist from everyone else in that community.
 * A legacy key is moved to the current person on first read and removed.
 *
 * Browser storage can be unavailable (private mode, blocked site data); every
 * access is guarded, and an unreadable store reads as "not dismissed".
 */

export type ChecklistDismissal = 'dismissed' | 'celebrated';

export function checklistStorageKey(
  userId: string,
  communityId: number,
  kind: ChecklistDismissal,
): string {
  return `onboarding-checklist:${userId}:${communityId}:${kind}`;
}

export function legacyChecklistStorageKey(communityId: number): string {
  return `onboarding-checklist-dismissed-${communityId}`;
}

export function readChecklistDismissal(
  userId: string,
  communityId: number,
): Record<ChecklistDismissal, boolean> {
  try {
    const dismissedKey = checklistStorageKey(userId, communityId, 'dismissed');
    let dismissed = localStorage.getItem(dismissedKey) === 'true';
    const legacyKey = legacyChecklistStorageKey(communityId);
    if (localStorage.getItem(legacyKey) === 'true') {
      if (!dismissed) {
        localStorage.setItem(dismissedKey, 'true');
        dismissed = true;
      }
      localStorage.removeItem(legacyKey);
    }
    const celebrated =
      localStorage.getItem(checklistStorageKey(userId, communityId, 'celebrated')) === 'true';
    return { dismissed, celebrated };
  } catch {
    return { dismissed: false, celebrated: false };
  }
}

export function writeChecklistDismissal(
  userId: string,
  communityId: number,
  kind: ChecklistDismissal,
): void {
  try {
    localStorage.setItem(checklistStorageKey(userId, communityId, kind), 'true');
  } catch {
    /* storage unavailable: the close still applies for this page view */
  }
}
