# Performance Learnings (Bolt Persona)

- Resolving N+1 logging latency (e.g. `apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts`) by batching logging calls with `Promise.all` yields immense latency reductions (down from ~1s to ~13ms for 100 iterations on mocked data). This should be a standard pattern when auditing batch events.
- Sandbox CI database access (via `DATABASE_URL`) cannot be locally created if Postgres service is not installed natively in the container, meaning DB tests fail due to connection refused. Performance improvement testing is typically verified purely on logic changes or mocking.
