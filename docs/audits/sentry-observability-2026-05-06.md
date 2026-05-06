# Sentry Observability Audit (2026-05-06)

Phase 0.3 of the verification gate from `~/.claude/plans/draft-a-plan-that-reflective-pie.md`.

Queries executed via the Sentry MCP against the **propertypro** org / **property-pro** project (region `https://us.sentry.io`).

---

## Original 0.3 hypothesis

The original 0.3 step was to baseline-search for three known signatures over 90 days:
1. `[approve-join-request] notification insert failed`
2. `[deny-join-request] notification insert failed`
3. HTTP 429 on `/api/v1/esign/sign/`

These would be the metrics C2 (esign rate limit) and C3 (in-tx notifications) should be moving once shipped.

## What the queries returned

| Query | Dataset | Period | Results |
|---|---|---|---|
| `"notification insert failed"` | logs | 90d | 0 |
| `"notification insert failed"` | issues | 90d | 0 |
| `http.response.status_code:429 url:*esign/sign*` | spans | 90d | 0 |
| `url:*esign/sign*` (any status) | spans | 90d | 0 |
| `http.response.status_code:429` (any URL) | spans | 90d | 0 |
| `"rate-limit"` | errors | 90d | 0 |
| `url:*api/v1*` (any) | spans | 90d | 0 |
| `firstSeen:-90d` (any issue) | issues | 90d | 0 |
| `is:unresolved` (any issue, default range) | issues | — | 0 |
| `*` (any span) | spans | 7d | 0 |

## The real finding

**Sentry has zero captured data for PropertyPro.** Not zero on the specific signatures, zero across the board. No spans, no issues, no errors, no firstSeen-in-90d events.

The integration *exists in code* — `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts` — but the production deployment is not producing observable telemetry to the configured Sentry org.

## Implications

1. **The original 0.3 question is answered, but only partially.** The "notification insert failed" zero result is consistent with 0.2 (the codepath has never run in prod, since `community_join_requests` is empty), so that result is meaningful even with broken Sentry. The 429 question is **not** answered — we cannot tell whether the rate limiter has fired in prod or not, because Sentry isn't capturing request spans either way.

2. **The architectural plan's mining assumption is broken.** Plan A1's resume condition "Bug-driven pull: a real bug is traced to inconsistent response shapes (mine 0.3's baseline forward)" presupposes a working Sentry. Cannot mine forward from a baseline of zero. Phase B's "monitor Sentry for regressions during route migrations" is also blocked.

3. **The team's incident-detection posture is weaker than assumed.** A class of customer-impacting errors (5xx that don't crash the app, malformed responses, slow queries) currently has no observability in production. The team thinks they have error monitoring; the data says they do not.

## Possible root causes (not investigated)

- DSN environment variable is unset or wrong in the Vercel production deployment. Highest-probability cause.
- Sample rate effectively zero. Check `tracesSampleRate`, `replaysSessionSampleRate`, etc.
- Source-map upload failing silently and breaking event ingestion. Less likely but possible.
- Events going to a different Sentry org/project not visible from this MCP token. Visible orgs: just `propertypro`. Visible projects: just `property-pro`.

This needs DevOps/SRE to investigate. It is not a code fix.

## Recommended actions

| Action | Severity | Owner |
|---|---|---|
| **Verify DSN** is set in Vercel production for `apps/web` and pointing to the `property-pro` project (DSN format includes the project ID — confirm via `find_projects` or Sentry UI). | High | SRE / DevOps |
| **Trigger a synthetic error** in production (e.g., a `/_test_sentry` endpoint that calls `Sentry.captureException` with a known message) and verify it appears in the Sentry org within a minute. | High | SRE / DevOps |
| **Check sample rates** in `sentry.server.config.ts` and the others. If `tracesSampleRate` is 0 (or unset), spans won't be captured. | High | Eng |
| **Re-run Phase 0.3 once Sentry is live.** Three signatures over the *next* 90 days will be the real baseline. C2's success depends on observing 429s; right now the rate limiter is firing into the void. | Medium (gating) | Whoever resumes Phase 0 |

## Net

The zero-result for "notification insert failed" is meaningful (consistent with 0.2). The zero-result for "429 on esign" is **inconclusive** because the underlying instrumentation isn't capturing request data. The honest interpretation: **Phase 0.3 cannot be completed today**; it needs a working Sentry first. That, in turn, is a higher-priority finding than any individual rate-limit baseline.

---

## Resolution (2026-05-06, same day)

**Root cause:** `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts` were located at `apps/web/` (project root) instead of `apps/web/src/`. Per Next.js convention, when a project uses a `src/` directory (which `apps/web` does — `apps/web/src/app/`), the instrumentation file must live at `src/instrumentation.ts`. At project root it is silently ignored. The SDK was therefore never initialized in any environment since the `src/`-layout migration. This explains why the Sentry org had captured zero events for 90 days despite the integration "existing in code."

**Diagnostic path (in chronological order, for future reference):**

1. Confirmed `SENTRY_DSN` was set in Vercel production with valid host + project ID.
2. Discovered three Vercel env vars that were missing: `NEXT_PUBLIC_SENTRY_DSN` (zero browser events), `SENTRY_ORG`, `SENTRY_PROJECT` (broken build-time wrapper). Added.
3. Discovered `SENTRY_PROJECT` had been set to `propertypro` instead of `property-pro` (the actual slug, with hyphen). Build logs showed `error: Project not found` from `sentry-cli`. Corrected.
4. Build clean, runtime endpoint returned HTTP 200 with `Sentry.captureException + flush`, but Sentry still empty.
5. Instrumented the test endpoint with `Sentry.getClient()` and friends. Diagnostics returned `hasClient: false, dsnInfo: null, flushed: false` — proving the SDK was never initialized at runtime, despite env vars being correct.
6. Inspected file layout: instrumentation files at `apps/web/`, app code at `apps/web/src/app/`. Mismatch found.
7. Moved the four files into `src/`. Redeployed preview. Diagnostics flipped to `hasClient: true, flushed: true`. Synthetic event ID `4a1ecb720f534800827fd6b83eaaacd4` landed in Sentry under environment `vercel-preview` within ~60s of the request. End-to-end ingestion confirmed.

**The fix is a single commit** (file move only; no logic changes): `a9c78e01` on the throwaway branch `chore/sentry-verification`. To land on main, cherry-pick that commit and force a production redeploy so prod picks up the new instrumentation file location.

**Vercel env-var corrections that must persist on main's deploy:**
- `NEXT_PUBLIC_SENTRY_DSN` — added (Production + Preview)
- `SENTRY_ORG=propertypro` — added
- `SENTRY_PROJECT=property-pro` — corrected (was `propertypro` with no hyphen)

**Side-finding worth chasing later:** Vercel runtime log surfaced the warning `NODE_ENV was incorrectly set to "development", this value is being overridden to "production"`. Per Next.js docs, `NODE_ENV` should not be set as a Vercel env var — the framework manages it automatically. Likely set as a project-wide env at some point. Doesn't affect Sentry, but worth removing.

**Next step (still owed for Phase 0.3):** with Sentry live, re-run the original three-signature baseline search (`[approve-join-request] notification insert failed`, `[deny-join-request] notification insert failed`, `429 on /api/v1/esign/sign/`) over the *next* 30-90 days, not the past. The historical baseline is permanently zero by virtue of the SDK never running.
