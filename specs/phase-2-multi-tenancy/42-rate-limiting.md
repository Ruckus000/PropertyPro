# Spec: P2-42 — Rate Limiting

> Implement rate limiting on all API endpoints to prevent abuse.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P0-07

## Functional Requirements
- Authenticated endpoints: 100 requests/minute
- Unauthenticated (login, signup, password reset): 20 requests/minute
- File uploads: 10 uploads/minute per user
- Return 429 Too Many Requests with Retry-After header
- Dev: simple in-memory rate limiter
- Production: @upstash/ratelimit with Redis

## Acceptance Criteria
- [ ] Exceeding rate limit returns 429 with Retry-After header
- [ ] Authenticated and unauthenticated have different limits
- [ ] Upload-specific limit enforced
- [ ] pnpm test passes

## Technical Notes
- Use Upstash Redis for distributed rate limiting in production
- Implement sliding window algorithm
- Add x-ratelimit-* headers to responses

## Files Expected
- apps/api/src/middleware/rate-limit.ts
- apps/api/src/lib/rate-limiter.ts
- apps/api/src/services/upstash-service.ts

## Attempts
0
