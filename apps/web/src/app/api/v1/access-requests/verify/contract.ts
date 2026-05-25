/**
 * Contract for POST /api/v1/access-requests/verify.
 *
 * Plan A1 drain #41. **First NO-AUTH POST in the contract corpus.** The route
 * is a public endpoint — it carries no `requireAuthenticatedUserId`,
 * `requireCommunityMembership`, or RBAC permission gate. It is registered in
 * `TOKEN_AUTH_ROUTES` (see `apps/web/src/middleware.ts`), which lets
 * middleware allow the request through without a session cookie. The handler
 * body is the minimal possible shape: body-validate → service call → return.
 *
 * Body: `{ requestId: positive int, otp: 6-char string, communityId: positive
 * int }` — preserved verbatim from the pre-migration `verifySchema`. The
 * service signature `verifyOtp({ requestId, otp, communityId })` consumes the
 * validated body object directly.
 *
 * Response modeling: loose `z.unknown()` — `verifyOtp` returns a service
 * shape that we do not want to over-pin at the wire boundary (drain
 * #9/#14/#18 precedent — the runner's `safeParse` runs BEFORE
 * `NextResponse.json` serializes, so any tight schema needs to model the
 * pre-serialization Date/object shape exactly, not the eventual JSON shape).
 *
 * `permission` field is OMITTED. Public routes do not carry RBAC metadata.
 * The contract author convention (drain #4 / #19 precedent) is to add a
 * placeholder `{ resource, action }` ONLY when the runtime route has an
 * `isAdminRole` or similar gate that we want to document — here there is no
 * gate to document, so the field is left off entirely.
 *
 * Behavior change vs. pre-migration:
 *   - Body validation 400 now uses the runner's canonical `VALIDATION_ERROR`
 *     envelope (was hand-constructed `ValidationError('Validation failed')`).
 *     Status code 400 unchanged. The legacy error message text is dropped in
 *     favor of the runner's structured field-level errors.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const accessRequestsVerifyContract = defineRoute({
  method: 'POST',
  path: '/api/v1/access-requests/verify',
  request: {
    body: z.object({
      requestId: z.number().int().positive(),
      otp: z.string().length(6),
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
});
