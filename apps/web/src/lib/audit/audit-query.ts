/**
 * The audit trail's URL vocabulary, shared by the page (which writes it), the
 * API route and the print view (which read it). One parser, so a link copied
 * from the page opens the same view everywhere.
 *
 *   view    important | all | deleted | downloads | access | notices
 *   period  7 | 30 | 90 | 365 | all          (days back from today)
 *   person  a member's user id                (narrow to a person)
 *   entity  document | meeting | announcement | maintenance | violation
 *   item    that item's id                    (narrow to an item, with entity)
 *   entry   an entry id                       (page only: which panel is open)
 *
 * Pure: no database or React import.
 */
import {
  AUDIT_PERIODS,
  DEFAULT_AUDIT_PERIOD,
  isAuditPeriod,
  isAuditView,
  SCOPE_SOURCES,
  type AuditPeriod,
  type AuditView,
} from './audit-catalog';
import type { AuditScope } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditQueryState {
  view: AuditView;
  period: AuditPeriod;
  scope: AuditScope | null;
}

export const DEFAULT_AUDIT_QUERY: AuditQueryState = {
  view: 'important',
  period: DEFAULT_AUDIT_PERIOD,
  scope: null,
};

export class AuditQueryError extends Error {}

type Getter = (key: string) => string | null;

/**
 * Reads view, period and scope. Missing values take the defaults; values that
 * are present but malformed throw `AuditQueryError`, so a typo in a shared link
 * fails loudly instead of silently showing a different view.
 *
 * `defaults` lets the API keep its pre-redesign behaviour (no view filter,
 * no date bound) for callers that send none of the new parameters.
 */
export function parseAuditQuery(get: Getter): AuditQueryState {
  const rawView = get('view');
  const rawPeriod = get('period');
  const rawPerson = get('person');
  const rawEntity = get('entity');
  const rawItem = get('item');

  if (rawView && !isAuditView(rawView)) throw new AuditQueryError('view is not a recognised choice');
  if (rawPeriod && !isAuditPeriod(rawPeriod)) throw new AuditQueryError('period is not a recognised choice');

  let scope: AuditScope | null = null;
  if (rawPerson) {
    if (!UUID.test(rawPerson)) throw new AuditQueryError('person must be a user id');
    scope = { kind: 'person', userId: rawPerson };
  } else if (rawEntity || rawItem) {
    if (!rawEntity || !Object.prototype.hasOwnProperty.call(SCOPE_SOURCES, rawEntity)) {
      throw new AuditQueryError('entity is not a recognised item type');
    }
    if (!rawItem || !/^[1-9]\d{0,18}$/.test(rawItem)) throw new AuditQueryError('item must be a positive id');
    scope = { kind: 'item', entityType: rawEntity, resourceId: rawItem };
  }

  return {
    view: rawView && isAuditView(rawView) ? rawView : DEFAULT_AUDIT_QUERY.view,
    period: rawPeriod && isAuditPeriod(rawPeriod) ? rawPeriod : DEFAULT_AUDIT_QUERY.period,
    scope,
  };
}

/** True when the request uses the redesign's vocabulary at all. */
export function hasAuditQuery(get: Getter): boolean {
  return ['view', 'period', 'person', 'entity', 'item'].some((key) => get(key));
}

/** The earliest date (YYYY-MM-DD, UTC) a period includes, or null for all time. */
export function periodStartDate(period: AuditPeriod, now: Date = new Date()): string | null {
  const days = AUDIT_PERIODS.find((p) => p.value === period)?.days ?? null;
  if (days === null) return null;
  const start = new Date(now.getTime() - days * 86_400_000);
  return start.toISOString().slice(0, 10);
}

/** Writes state back to params, omitting defaults so URLs stay short. */
export function writeAuditQuery(params: URLSearchParams, state: AuditQueryState): URLSearchParams {
  for (const key of ['view', 'period', 'person', 'entity', 'item']) params.delete(key);
  if (state.view !== DEFAULT_AUDIT_QUERY.view) params.set('view', state.view);
  if (state.period !== DEFAULT_AUDIT_QUERY.period) params.set('period', state.period);
  if (state.scope?.kind === 'person') params.set('person', state.scope.userId);
  if (state.scope?.kind === 'item') {
    params.set('entity', state.scope.entityType);
    params.set('item', state.scope.resourceId);
  }
  return params;
}
