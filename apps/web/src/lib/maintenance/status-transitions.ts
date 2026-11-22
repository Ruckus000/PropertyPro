/**
 * Maintenance request status transitions — the one table both sides read.
 *
 * The PATCH route (`api/v1/maintenance-requests/[id]/route.ts`) refuses any
 * move this table does not list, and the manager's status form
 * (`components/maintenance/StatusUpdateForm.tsx`) offers only what it lists, so
 * the form can never offer a move the server will reject.
 *
 * `open` is the legacy name for `submitted`: rows may still carry it in the
 * database, and the API shows it to clients as `submitted`.
 *
 * No imports, so the client bundle can take it without pulling in server code.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  open: ['submitted', 'acknowledged', 'in_progress'],
  submitted: ['acknowledged', 'in_progress'],
  acknowledged: ['submitted', 'in_progress'],
  in_progress: ['submitted', 'resolved'],
  resolved: ['closed'],
  closed: [],
};

/** The statuses a request in `current` may move to. Unknown statuses move nowhere. */
export function allowedNextStatuses(current: string): readonly string[] {
  // Own keys only: a status named like an Object.prototype member must not read one.
  return Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, current)
    ? ALLOWED_TRANSITIONS[current]!
    : [];
}

export function isAllowedStatusTransition(from: string, to: string): boolean {
  return allowedNextStatuses(from).includes(to);
}
