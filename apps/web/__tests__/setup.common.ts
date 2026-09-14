// Setup shared by BOTH the `node` and `jsdom` vitest projects.
//
// Keep this file free of DOM imports. It is loaded by every test file, and the
// ~505 node-project tests must not pay to load @testing-library or jsdom
// matchers — that split is the whole point of the two-project layout in
// vitest.config.ts. DOM-only setup belongs in setup.jsdom.ts.
import { vi } from 'vitest';

// `hashOtp` in access-request-service now THROWS when OTP_HMAC_SECRET is unset
// (it used to fall back to a hardcoded 'dev-secret', which shipped to
// production and made the 10^6 OTP keyspace trivially precomputable). Tests
// need a real value; this one is deliberately not the old literal, so a test
// that still assumes the fallback fails loudly instead of passing by accident.
process.env.OTP_HMAC_SECRET ??= 'test-otp-hmac-secret-not-a-real-secret';

// PdfViewer uses a runtime-only `import('/pdfjs/pdf.mjs')` from a same-origin
// public asset path. Vite cannot statically resolve that path during test
// transform, which breaks any test that transitively imports DocumentViewer.
// Stub it globally so test files don't have to mock it individually. Per-file
// vi.mock calls (e.g. in document-viewer.test.tsx) still take precedence.
//
// No node-project test imports this directly today, but it stays in the shared
// setup rather than the jsdom one because the hazard is a *transitive* import
// from a service module, and the factory has no import cost.
vi.mock('@/components/pdf/pdf-viewer', () => ({
  PdfViewer: () => null,
}));

// The lapsed read-entitlement guard reads the DB via createUnscopedClient, so
// importing it pulls in `@propertypro/db` (which throws "Missing DATABASE_URL"
// when the unit-test job has no database, and otherwise silently hits the real
// DB). Route unit tests don't provision that and shouldn't exercise the guard —
// its behavior is covered by read-entitlement-guard.test.ts (real impl) and a
// DB-backed integration test. No-op it globally so every gated route's GET test
// stays hermetic. Per-file vi.mock still takes precedence: ledger-route.test.ts
// asserts it IS called, and read-entitlement-guard.test.ts restores the real
// implementation via vi.mock(..., importActual).
//
// This one is MANDATORY for the node project — the ~306 next/server route tests
// depend on it. Without it a route test asserting a non-2xx path could pass for
// the wrong reason.
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: vi.fn(),
}));

// `withCronJob` — the identity wrapper on EVERY cron route — calls
// `recordCronRun` and `registerCronJobs`, and both reach the database through
// `createUnscopedClient()`. Importing them pulls `@propertypro/db/unsafe` →
// `drizzle.ts`, which throws "Missing DATABASE_URL" at module scope. Four route
// test files (account-lifecycle ×2, coupon-sync-retry, provisioning-watchdog)
// never mocked it, so they failed at COLLECTION here and, with any DATABASE_URL
// set, spent 5s per test on a connection that could not be made — reported as a
// vitest timeout, which is what the timeout is for.
//
// The 5s failure was the benign outcome. `recordCronRun` is an UPSERT on
// `cron_runs` keyed by `jobSlug`, and `recordHeartbeat` swallows every error, so
// on a machine whose DATABASE_URL resolves — which for this repo's `.env.local`
// is PRODUCTION — those tests silently overwrite the live heartbeat row for
// three real jobs, `lastError` and `consecutiveFailures` included. That is the
// admin console's /health screen, rewritten by a unit test, with nothing said.
//
// No coverage is lost. The heartbeat contract is asserted against these two
// functions in `__tests__/cron/with-cron-job.test.ts` (which mocks them itself,
// with assertions) and against a real database in
// `__tests__/integration/cron-run-heartbeat.integration.test.ts`, which the unit
// projects exclude. Per-file `vi.mock` still takes precedence, which is how
// cron-health-route and revenue-snapshot-route keep their own stubs.
//
// All THREE runtime exports are stubbed, not just the two that reach
// `withCronJob`. A factory replaces the whole module, so omitting `listCronRuns`
// would leave `/internal/cron-health` calling `undefined` the moment its test
// stopped mocking the module itself — the trap documented in
// provisioning-watchdog-route.test.ts, installed globally.
vi.mock('@/lib/services/cron-run-service', () => ({
  recordCronRun: vi.fn().mockResolvedValue(undefined),
  registerCronJobs: vi.fn().mockResolvedValue(undefined),
  listCronRuns: vi.fn().mockResolvedValue([]),
}));
