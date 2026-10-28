/**
 * Route contracts for `/api/v1/community/profile`.
 *
 * The association's own details: its name (and an optional short name for
 * headlines), the office address, the office hours and the public contact
 * details. Sign-up collects the name and address once; this is where an admin
 * changes them afterwards. The public website follows the change on its next
 * request, because the public site renders dynamically.
 *
 *   GET   — read the profile
 *   PATCH — change any of it
 *
 * Both verbs are for community admins only (`membership.isAdmin`); a demo in
 * its grace window is read-only. The unit (or parcel) count comes back in the
 * profile so the Settings card can show it, but it is read-only here: it keeps
 * its own route, `PATCH /api/v1/community/unit-count`, so a body that carries
 * one is refused.
 *
 * PATCH body. Strings are trimmed. `name` is required when present, 1 to 120
 * characters, and cannot be cleared. Every other field is clearable: send
 * `null`, or a string that is blank once trimmed, and the stored value becomes
 * NULL; leave a field out and it is left alone. Unknown keys are refused, so a
 * misspelt field cannot pass silently.
 *
 * The limits mirror the columns: `short_name` and `office_hours` carry DB
 * CHECKs of 60 and 200 characters (migration 0095), and a state is the
 * two-letter capital sign-up stores.
 *
 * The response is the profile's twelve fields as plain strings, numbers and
 * nulls (no dates), so it is typed tightly. A column that is not part of the
 * profile (billing ids, branding) can never reach the wire through it.
 *
 * `permission` is metadata only; the handlers check `membership.isAdmin`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * The profile as the API returns it. The response is deliberately loose about
 * CONTENT: a value stored before these rules existed (a state spelled out, a
 * ZIP with a stray space) must still be readable, so it is not re-validated
 * here. Only a write is held to the rules below.
 */
export const communityProfileSchema = z.object({
  name: z.string(),
  shortName: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  unitCount: z.number().int().nullable(),
  officeHours: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
});

export type CommunityProfilePayload = z.infer<typeof communityProfileSchema>;

/** Trim a string; a blank one means "clear this field", which is null. Anything else is the schema's to judge. */
function blankToNull(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * A field an admin may clear. `null` and a blank string both store NULL; an
 * absent key leaves the stored value alone. The rule applies to the trimmed
 * text, so the length limit is measured after trimming, and a blank string
 * never reaches a format check (an empty email is a cleared email, not a bad
 * one).
 */
function clearable(text: z.ZodType<string>) {
  return z.preprocess(blankToNull, text.nullable()).optional();
}

const profilePatchBodySchema = z
  .object({
    communityId: z.number().int().positive(),
    name: z.string().trim().min(1).max(120).optional(),
    shortName: clearable(z.string().max(60)),
    addressLine1: clearable(z.string().max(120)),
    addressLine2: clearable(z.string().max(120)),
    city: clearable(z.string().max(80)),
    state: clearable(z.string().regex(/^[A-Z]{2}$/, 'Use the two-letter state code in capitals, like FL.')),
    zipCode: clearable(
      z.string().regex(/^\d{5}(-\d{4})?$/, 'Use a 5-digit ZIP code, like 33139, or ZIP+4, like 33139-1234.'),
    ),
    officeHours: clearable(z.string().max(200)),
    contactName: clearable(z.string().max(120)),
    contactEmail: clearable(z.string().max(254).email('Enter a valid email address.')),
    contactPhone: clearable(z.string().max(40)),
  })
  .strict();

export type CommunityProfilePatchBody = z.infer<typeof profilePatchBodySchema>;

export const communityProfileGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/community/profile',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: communityProfileSchema,
  permission: { resource: 'settings', action: 'read' },
  // The app-bound runner reconciles `query.communityId` with the middleware
  // `x-community-id` header (header authoritative) and injects it.
  tenantScope: { in: 'query' },
});

export const communityProfilePatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/community/profile',
  request: {
    body: profilePatchBodySchema,
  },
  response: communityProfileSchema,
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'body' },
});
