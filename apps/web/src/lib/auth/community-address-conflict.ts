/**
 * One community per street address.
 *
 * A second community at an address that already has one splits its owners,
 * documents and compliance record across two tenants, and nothing downstream
 * can merge them. So signup refuses an address that matches a live community,
 * or a signup that has already paid for one, and points the caller at the
 * join-request flow instead.
 *
 * The answer is a boolean. Which community matched is never returned, so the
 * caller learns only that the address is taken — the same thing the
 * association's own public website already says. Even that is a probe of who
 * our customers are, so `checkSignupAddress` meters every check, conflict or
 * not: a cap that counted only conflicts would itself answer the question once
 * spent.
 *
 * Matching is deliberately narrow: ZIP plus a canonical street line. An address
 * we cannot canonicalize (no house number, no 5-digit ZIP) never blocks, because
 * a false block strands a paying customer while a missed duplicate is merely
 * the status quo.
 */
// AUTHZ: Pre-tenant signup check across every community; returns only a boolean, never a row or id.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, pendingSignups } from '@propertypro/db';
import { and, eq, inArray, isNull, like, ne } from '@propertypro/db/filters';
import { consumeKeyedRateLimit } from '@/lib/api/keyed-rate-limit';
import { normalizeAddressAutocompleteText } from '@/lib/address-autocomplete';

export const COMMUNITY_EXISTS_FIELD = 'communityExists';
export const COMMUNITY_EXISTS_MESSAGE =
  'This address already has a PropertyPro community. Ask to join it instead.';

const STREET_WORDS: Readonly<Record<string, string>> = {
  street: 'st',
  avenue: 'ave',
  av: 'ave',
  boulevard: 'blvd',
  drive: 'dr',
  road: 'rd',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  terrace: 'ter',
  circle: 'cir',
  parkway: 'pkwy',
  highway: 'hwy',
  trail: 'trl',
  square: 'sq',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
};

/** Everything from one of these on names a unit inside the building, not the building. */
const UNIT_DESIGNATORS = new Set([
  'apt', 'apartment', 'unit', 'ste', 'suite', 'bldg', 'building', 'fl', 'floor', 'rm', 'room',
  'ph', 'penthouse', 'lot', 'spc', 'space', 'trlr',
]);

/** Canonical suffixes; a bare number after one of these is a unit (`100 Ocean Dr 401`). */
const STREET_SUFFIXES = new Set(['st', 'ave', 'blvd', 'dr', 'rd', 'ln', 'ct', 'pl', 'ter', 'cir', 'pkwy', 'hwy', 'trl', 'sq', 'way']);

const ZIP_PATTERN = /^\s*(\d{5})(?:-\d{4})?\s*$/;
/** A one-line address ending in its ZIP: `123 Ocean Dr, Miami FL 33139`. */
const TRAILING_ZIP_PATTERN = /[\s,](\d{5})(?:-\d{4})?\s*$/;

/**
 * `"123 N. Ocean Boulevard, Apt 4"` + `"33139-1234"` → `"33139|123 n ocean blvd"`.
 * Returns null when the address cannot be compared safely.
 *
 * With no ZIP field, a one-line address (the form flow's free-text `address`,
 * which leaves the structured fields empty) is read for a trailing ZIP and the
 * street before its first comma, so that shape cannot skip the check.
 */
export function buildAddressKey(addressLine1: string | null | undefined, zipCode: string | null | undefined): string | null {
  if (!addressLine1) return null;
  let zip = ZIP_PATTERN.exec(zipCode ?? '')?.[1];
  let line = addressLine1;
  if (!zip && !zipCode?.trim()) {
    zip = TRAILING_ZIP_PATTERN.exec(addressLine1)?.[1];
    line = addressLine1.split(',')[0] ?? '';
  }
  if (!zip) return null;

  // `#` is a unit marker too, but normalization turns it into a space, so cut first.
  const street = normalizeAddressAutocompleteText(line.split('#')[0] ?? '');
  const tokens: string[] = [];
  for (const token of street.split(' ')) {
    if (!token) continue;
    if (UNIT_DESIGNATORS.has(token)) break;
    const word = STREET_WORDS[token] ?? token;
    const previous = tokens[tokens.length - 1];
    if (tokens.length >= 3 && previous && STREET_SUFFIXES.has(previous) && /\d/.test(word)) break;
    tokens.push(word);
  }
  if (tokens.length < 2 || !/^\d+[a-z]?$/.test(tokens[0]!)) return null;
  return `${zip}|${tokens.join(' ')}`;
}

/**
 * Checks per signup email per hour at the details step, where a signed-in
 * founder can change the address without re-verifying. One per save; a real
 * founder spends one per plan change, so this is well above any honest session.
 * Checkout is not metered: the address there is the row's, and changing a
 * row's address costs a fresh verification email (form flow) or a metered save.
 */
const ADDRESS_CHECKS_PER_EMAIL = 30;
const ADDRESS_CHECK_WINDOW_MS = 60 * 60 * 1000;

const PAID_NOT_PROVISIONED = ['payment_completed', 'provisioning'] as const;

/**
 * True when a live, non-demo community — or another signup that has already
 * paid and is being provisioned — sits at the same address.
 * `excludeSignupRequestId` is the caller's own pending row.
 */
export async function hasConflictingCommunity(params: {
  addressLine1: string | null | undefined;
  zipCode: string | null | undefined;
  excludeSignupRequestId?: string;
}): Promise<boolean> {
  const key = buildAddressKey(params.addressLine1, params.zipCode);
  if (!key) return false;
  const zip = key.slice(0, 5);
  // `zip_code` may hold ZIP+4 (the signup schema accepts it), so match the prefix.
  const zipPrefix = `${zip}%`;
  const db = createUnscopedClient();

  const paidFilters = [
    like(pendingSignups.zipCode, zipPrefix),
    inArray(pendingSignups.status, [...PAID_NOT_PROVISIONED]),
  ];
  if (params.excludeSignupRequestId) {
    paidFilters.push(ne(pendingSignups.signupRequestId, params.excludeSignupRequestId));
  }
  const [live, paid] = await Promise.all([
    db
      .select({ addressLine1: communities.addressLine1, zipCode: communities.zipCode })
      .from(communities)
      .where(and(like(communities.zipCode, zipPrefix), isNull(communities.deletedAt), eq(communities.isDemo, false))),
    db
      .select({ addressLine1: pendingSignups.addressLine1, zipCode: pendingSignups.zipCode })
      .from(pendingSignups)
      .where(and(...paidFilters)),
  ]);
  return [...live, ...paid].some((row) => buildAddressKey(row.addressLine1, row.zipCode) === key);
}

export type SignupAddressCheck = 'available' | 'taken' | 'rate_limited';

/**
 * `hasConflictingCommunity`, metered per signup email. The budget is spent
 * BEFORE the answer is computed, so an exhausted caller learns nothing about
 * the address either way.
 */
export async function checkSignupAddress(params: {
  email: string;
  addressLine1: string | null | undefined;
  zipCode: string | null | undefined;
  excludeSignupRequestId?: string;
}): Promise<SignupAddressCheck> {
  if (!buildAddressKey(params.addressLine1, params.zipCode)) return 'available';
  const budget = await consumeKeyedRateLimit(
    `rl:signup-address-check:${params.email.trim().toLowerCase()}`,
    ADDRESS_CHECKS_PER_EMAIL,
    ADDRESS_CHECK_WINDOW_MS,
  );
  if (!budget.allowed) return 'rate_limited';
  return (await hasConflictingCommunity(params)) ? 'taken' : 'available';
}
