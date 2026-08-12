/**
 * Which ARC actions a submission's status permits — one lookup, both views.
 *
 * Deliberately NOT a client-side state machine mirroring the server. The
 * authority is `violations-service.ts` (`reviewArcSubmissionForCommunity`,
 * `decideArcSubmissionForCommunity`, `withdrawArcSubmissionForCommunity`), each
 * of which re-checks status and throws `UnprocessableEntityError`. A second
 * implementation of those rules would be a copy that silently drifts.
 *
 * This exists for one narrow job: not offering a button that is guaranteed to
 * 422. It is a display concern, and it is shared by the reviewer table and the
 * resident list so the two cannot disagree about what a status means.
 *
 * Keep the mapping below in sync with the service. It is asserted against the
 * service's own error branches in `__tests__/arc-actions.test.ts`.
 */
import type { ArcSubmissionStatus } from '@/hooks/use-arc';

export type ArcAction = 'review' | 'decide' | 'withdraw';

/**
 * Actions the status allows, ignoring who is asking.
 *
 * Role and ownership are a separate axis and stay with the caller: `review` and
 * `decide` are reviewer-only (`requireArcReviewPermission`), `withdraw` is
 * submitter-only (checked against `submittedByUserId` in the service). Folding
 * those in here would make this function need a membership and stop being a
 * lookup.
 */
const ACTIONS_BY_STATUS: Record<ArcSubmissionStatus, readonly ArcAction[]> = {
  // Freshly submitted: a reviewer can start review or decide outright, and the
  // resident can still pull it.
  submitted: ['review', 'decide', 'withdraw'],
  // Review can be re-entered to amend notes before deciding.
  under_review: ['review', 'decide', 'withdraw'],
  // Terminal. `decideArcSubmissionForCommunity` rejects an already-decided
  // submission, and withdrawing a decided one is refused too.
  approved: [],
  denied: [],
  // The service would technically permit withdrawing an already-withdrawn
  // submission (it only blocks `approved`/`denied`), but re-withdrawing is a
  // no-op the resident cannot want. Nothing is offered.
  withdrawn: [],
};

export function allowedArcActions(status: ArcSubmissionStatus): readonly ArcAction[] {
  return ACTIONS_BY_STATUS[status] ?? [];
}

export function isArcActionAllowed(
  status: ArcSubmissionStatus,
  action: ArcAction,
): boolean {
  return allowedArcActions(status).includes(action);
}

/** True when the submission has reached a state nothing can move it out of. */
export function isArcDecided(status: ArcSubmissionStatus): boolean {
  return status === 'approved' || status === 'denied';
}
