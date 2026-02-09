# Spec: P4-56 — Security Audit

> Conduct a comprehensive security audit covering CORS, CSRF, input validation, and file upload sanitization.

## Phase
4

## Priority
P0

## Dependencies
- P4-55

## Functional Requirements
- Verify: CORS headers restrict to expected origins
- CSRF protection on state-changing requests
- All user input validated via Zod on both client and server
- File upload sanitization (magic bytes, size limits, presigned URL expiry)
- Presigned URLs expire after 15 minutes
- SQL injection prevention (Drizzle parameterized queries)
- XSS prevention (React auto-escaping, CSP headers)
- Auth tokens not leaked in URLs or logs

## Acceptance Criteria
- [ ] Security checklist document completed with pass/fail for each item
- [ ] No critical vulnerabilities found
- [ ] All findings documented with remediation status
- [ ] `pnpm test` passes

## Technical Notes
- Use OWASP Top 10 as checklist foundation
- Automate security scanning in CI/CD (e.g., npm audit, Snyk)
- Test for sensitive data in logs and error messages
- Verify rate limiting on auth endpoints
- Check for proper secret rotation procedures

## Files Expected
- `docs/SECURITY_AUDIT.md` (report)
- `apps/web/middleware.ts` (CORS, CSP headers)
- `apps/web/lib/validation/zod-schemas.ts`
- `apps/web/lib/services/file-upload.ts`

## Attempts
0
