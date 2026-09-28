/**
 * Resolve a membership to the SET of help audiences it belongs to.
 *
 * A viewer is one base audience plus their board designation, if any:
 *   property_manager / root_manager → manager
 *   resident                        → owner | tenant (by isUnitOwner)
 *   + board_member | board_president when `designation` holds one
 *
 * It is a set, not a single role, because "owner AND board member" is one
 * person. The previous resolver returned one string: it read the designation
 * only for property managers (who lose it on promotion), so a board-designated
 * resident never matched a `board_*` tag — and a designated manager resolved to
 * `board_*` ALONE, losing every manager article.
 *
 * Content vocabulary and tagging rule: HELP_AUDIENCES in
 * packages/shared/src/role-transition.ts.
 */
import { hasBoardDesignation, type HelpAudience } from '@propertypro/shared';

export interface HelpViewerMembership {
  role: string;
  designation?: string | null;
  isUnitOwner?: boolean;
}

export function resolveHelpViewerTokens(
  membership: HelpViewerMembership,
): readonly HelpAudience[] {
  const tokens: HelpAudience[] = [];
  if (membership.role === 'property_manager' || membership.role === 'root_manager') {
    tokens.push('manager');
  } else if (membership.role === 'resident') {
    tokens.push(membership.isUnitOwner ? 'owner' : 'tenant');
  }
  if (hasBoardDesignation(membership.designation)) {
    tokens.push(membership.designation);
  }
  return tokens;
}

/**
 * Whether content tagged `audiences` is visible to a viewer holding `tokens`.
 * Untagged content is visible to everyone; tagged content needs one shared
 * token. The single visibility rule for articles and FAQs alike (the FAQ SQL
 * path in faq-service mirrors it).
 */
export function isVisibleToAudience(
  audiences: readonly string[] | null | undefined,
  tokens: readonly string[],
): boolean {
  if (!audiences || audiences.length === 0) return true;
  return tokens.some((token) => audiences.includes(token));
}
