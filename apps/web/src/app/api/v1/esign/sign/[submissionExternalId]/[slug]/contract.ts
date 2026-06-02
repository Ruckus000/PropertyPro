/**
 * Contracts for `/api/v1/esign/sign/[submissionExternalId]/[slug]`.
 *
 * Plan A1 drain #176. Public token-authenticated signing (no session).
 * Mirrors drain #41 (`access-requests/verify`) no-auth convention — `permission`
 * omitted. Rate limiting remains in middleware (`ESIGN_SIGN_PATH_PREFIX`).
 *
 * GET: params-only; response `z.unknown()` (Date fields on submission, presigned
 * URL assembly in handler).
 *
 * POST: params + body `z.union([decline, submit])` with decline branch first
 * (matches pre-migration `declineSchema.safeParse` before submit schema).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const signParamsSchema = z.object({
  submissionExternalId: z.string().min(1),
  slug: z.string().min(1),
});

const signedFieldSchema = z.object({
  fieldId: z.string(),
  type: z.enum(['signature', 'initials', 'date', 'text', 'checkbox']),
  value: z.string(),
  signedAt: z.string().datetime(),
});

const submitSignatureBodySchema = z.object({
  signedValues: z
    .record(z.string(), signedFieldSchema)
    .refine((value) => Object.keys(value).length > 0, 'At least one signed field is required'),
  consentGiven: z.literal(true),
});

const declineBodySchema = z.object({
  action: z.literal('decline'),
  reason: z.string().max(2000).optional(),
});

export const esignSignGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/sign/[submissionExternalId]/[slug]',
  request: {
    params: signParamsSchema,
  },
  response: z.unknown(),
});

export const esignSignPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/sign/[submissionExternalId]/[slug]',
  request: {
    params: signParamsSchema,
    body: z.union([declineBodySchema, submitSignatureBodySchema]),
  },
  response: z.unknown(),
});
