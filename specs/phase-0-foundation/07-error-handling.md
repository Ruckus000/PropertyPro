# Spec: P0-07 — Error Handling

> Build the withErrorHandler API wrapper and React Error Boundaries for consistent error handling.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-00

## Functional Requirements
- Create withErrorHandler higher-order function for API routes that catches exceptions and returns structured JSON: { error: { code, message, details? } }
- Map known errors to HTTP status codes: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 422 (unprocessable), 429 (rate limited)
- Unknown errors return 500 status with generic message "Something went wrong" without leaking stack trace to client
- Log actual error details server-side (via Sentry in production)
- Generate UUID per request in middleware as X-Request-ID header
- Create React Error Boundary component at portal layout level with "Something went wrong" fallback and retry button
- Create toast notification system for API errors (shows error.message from API response)
- Create Zod error formatter that converts Zod validation errors to human-readable messages for inline form validation
- All error responses follow consistent shape: { error: { code: string, message: string, details?: object } }
- Track request ID through entire request lifecycle for correlation with logs

## Acceptance Criteria
- [ ] API route throwing ValidationError returns 400 with error details
- [ ] API route throwing UnauthorizedError returns 401 with appropriate message
- [ ] API route throwing NotFoundError returns 404
- [ ] Unknown error thrown in API route returns 500 without stack trace exposure
- [ ] X-Request-ID header is present on every response
- [ ] Error Boundary catches unhandled render-time errors and shows fallback
- [ ] Toast notification appears on API error with error message
- [ ] Zod error formatter converts validation errors to readable inline messages
- [ ] `pnpm test` passes for error handler tests
- [ ] Request ID is consistent across logs and Sentry for same request

## Technical Notes
- Use a custom AppError base class that all domain errors extend (ValidationError, UnauthorizedError, etc.).
- Request ID should be generated in middleware and attached to NextRequest object.
- Error Boundary should use reset() callback to allow retry after error is fixed.
- Toast system can use simple in-memory state or a library like React Hot Toast.
- Do NOT log sensitive data (passwords, tokens, PII) in error messages or stack traces.
- Consider creating a useErrorHandler React hook that integrates with the toast system for client-side error handling.

## Files Expected
- apps/web/src/lib/api/error-handler.ts
- apps/web/src/lib/api/request-id.ts
- apps/web/src/lib/errors/AppError.ts
- apps/web/src/lib/errors/ValidationError.ts
- apps/web/src/lib/errors/UnauthorizedError.ts
- apps/web/src/lib/errors/NotFoundError.ts
- apps/web/src/lib/errors/index.ts
- apps/web/src/lib/zod/error-formatter.ts
- apps/web/src/components/ErrorBoundary.tsx
- apps/web/src/components/Toast.tsx
- apps/web/src/components/ToastContainer.tsx
- apps/web/middleware.ts (update with request ID)
- packages/shared/src/errors.ts (shared error types)
- tests/lib/error-handler.test.ts
- tests/lib/zod-formatter.test.ts

## Attempts
0
