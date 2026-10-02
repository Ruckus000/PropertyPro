import { hasBoardDesignation } from '@propertypro/shared';

/**
 * Who may sit on the committee that approves a violation fine
 * (§718.303(3) / §720.305(2): members who are not officers, directors or
 * employees). A unit owner with no board seat, other than the person imposing
 * the fine. Client-safe: the fine form's picker and the fine service both use
 * it, so the form never offers someone the server refuses.
 */
export interface FiningCommitteeCandidate {
  userId: string;
  role: string;
  isUnitOwner: boolean | null;
  designation: string | null;
}

export type FiningCommitteeIneligibility = 'not_an_owner' | 'board_seat' | 'imposing_the_fine';

export function finingCommitteeIneligibility(
  member: FiningCommitteeCandidate,
  actorUserId: string,
): FiningCommitteeIneligibility | null {
  if (member.userId === actorUserId) return 'imposing_the_fine';
  if (hasBoardDesignation(member.designation)) return 'board_seat';
  if (member.role !== 'resident' || member.isUnitOwner !== true) return 'not_an_owner';
  return null;
}

export function isFiningCommitteeEligible(member: FiningCommitteeCandidate, actorUserId: string): boolean {
  return finingCommitteeIneligibility(member, actorUserId) === null;
}

/** §718.303(3) / §720.305(2): "a committee of at least three members". */
export const FINING_COMMITTEE_MIN_MEMBERS = 3;

/**
 * Accepted by the person imposing a fine with a committee smaller than three,
 * allowed only when the community has fewer than three eligible owners. The
 * version and text are written to the audit log with who accepted and when, so
 * change the version whenever the text changes.
 */
export const SMALL_COMMITTEE_DISCLAIMER_VERSION = '2026-10-02.2';
// States the requirement and the shortfall, and predicts no legal outcome:
// PropertyPro gives no legal advice (florida-compliance.md), and this text is
// kept in the append-only audit log, so it must not claim consequences the
// statute does not state.
export const SMALL_COMMITTEE_DISCLAIMER =
  'Florida law requires a fine to be approved by a committee of at least three members who are not '
  + 'officers, directors or employees of the association, or their relatives (Fla. Stat. §718.303(3) / '
  + '§720.305(2)). This committee has fewer than three. PropertyPro does not give legal advice and cannot '
  + 'say how a fine approved this way would be treated if challenged; the association’s attorney can. '
  + 'I am going ahead on the association’s behalf.';

/**
 * Whether a committee of `size` needs the disclaimer, or is refused outright.
 * Fewer than three is refused while three eligible owners exist to pick from.
 */
export function smallCommitteeRule(
  size: number,
  eligibleCount: number,
): 'ok' | 'needs_disclaimer' | 'pick_more' {
  if (size >= FINING_COMMITTEE_MIN_MEMBERS) return 'ok';
  return eligibleCount >= FINING_COMMITTEE_MIN_MEMBERS ? 'pick_more' : 'needs_disclaimer';
}
