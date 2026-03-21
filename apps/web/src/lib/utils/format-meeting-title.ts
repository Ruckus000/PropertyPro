/**
 * Strips seeded artifacts from meeting titles.
 *
 * Removes:
 *   - Leading community-slug prefixes ("sunset-condos ")
 *   - Trailing parenthetical compliance annotations (" (48-hour notice)")
 *
 * In production, titles are user-authored and will not contain these patterns.
 * This guard is safe to apply universally — it only strips exact artifacts.
 */
export function formatMeetingTitle(raw: string): string {
  // Remove leading slug prefix: lowercase word(s) connected by hyphens, followed by a space
  let title = raw.replace(/^[a-z][a-z0-9-]* /, '');
  // Remove trailing parenthetical compliance annotations
  title = title.replace(/\s*\(\d+-(?:hour|day) notice\)$/i, '');
  return title.trim();
}
