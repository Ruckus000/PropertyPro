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
