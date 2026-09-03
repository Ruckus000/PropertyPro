/**
 * Route contracts for the async community-export job API.
 *
 * ── Two constraints shaped these ──
 *
 * 1. Everything returns 200. `runRoute` hardcodes 200, so a 202-Accepted for
 *    "queued" is not expressible; the job's `status` field carries that instead.
 *    That is fine — the client polls on status anyway.
 * 2. The download route returns JSON `{ url }` rather than a 302. The runner
 *    cannot express a redirect, and a JSON URL is better here regardless: the
 *    caller can show an expiry and re-request without following a redirect it
 *    cannot inspect.
 *
 * Responses are modelled LOOSE (`z.unknown()` for the job payload) deliberately:
 * the service returns Drizzle rows carrying `Date` values, and the runner
 * `safeParse`s BEFORE `NextResponse.json` serialises them — a tight schema would
 * 500 on every real request. Documented tradeoff, per the corpus convention.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const communityIdQuery = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const createExportJobContract = defineRoute({
  method: 'POST',
  path: '/api/v1/export/jobs',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      /** Set false for a fast metadata-only archive. */
      includeDocumentFiles: z.boolean().optional(),
    }),
  },
  response: z.object({
    job: z.unknown(),
    /** True when an in-flight job already existed and was returned instead. */
    deduplicated: z.boolean(),
  }),
  permission: { resource: 'settings', action: 'read' },
});

export const listExportJobsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/export/jobs',
  request: { query: communityIdQuery },
  response: z.object({ jobs: z.array(z.unknown()) }),
  permission: { resource: 'settings', action: 'read' },
});

export const getExportJobContract = defineRoute({
  method: 'GET',
  path: '/api/v1/export/jobs/[jobId]',
  request: {
    params: z.object({ jobId: z.coerce.number().int().positive() }),
    query: communityIdQuery,
  },
  response: z.object({
    job: z.unknown(),
    parts: z.array(z.unknown()),
  }),
  permission: { resource: 'settings', action: 'read' },
});

export const cancelExportJobContract = defineRoute({
  method: 'POST',
  path: '/api/v1/export/jobs/[jobId]/cancel',
  request: {
    params: z.object({ jobId: z.coerce.number().int().positive() }),
    body: z.object({ communityId: z.number().int().positive() }),
  },
  response: z.object({ cancelled: z.boolean() }),
  permission: { resource: 'settings', action: 'read' },
});

export const downloadExportPartContract = defineRoute({
  method: 'GET',
  path: '/api/v1/export/jobs/[jobId]/parts/[partIndex]/download',
  request: {
    params: z.object({
      jobId: z.coerce.number().int().positive(),
      partIndex: z.coerce.number().int().min(0),
    }),
    query: communityIdQuery,
  },
  response: z.object({
    url: z.string(),
    expiresInSeconds: z.number(),
    fileName: z.string(),
    byteSize: z.number().int().nonnegative(),
  }),
  permission: { resource: 'settings', action: 'read' },
});
