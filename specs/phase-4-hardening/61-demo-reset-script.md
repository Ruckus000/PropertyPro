# Spec: P4-61 — Demo Reset Script

> Build the nightly demo reset script that restores demo instances to a known good state.

## Phase
4

## Priority
P1

## Dependencies
- P1-29
- P2-44

## Functional Requirements
- Script in scripts/reset-demo.ts
- Deletes all data in demo communities (Palm Gardens + Sunset Ridge)
- Re-seeds with predefined demo data
- Resets demo user passwords
- Triggered via Vercel Cron at 3:00 AM ET daily (or GitHub Actions scheduled workflow)
- Idempotent — safe to run multiple times
- Demo credentials documented internally, never in code

## Acceptance Criteria
- [ ] Running script resets both demo communities completely
- [ ] All demo screens show correct data after reset
- [ ] Script completes without errors
- [ ] Cron trigger configured
- [ ] `pnpm test` passes

## Technical Notes
- Store demo seed data in JSON fixtures for reproducibility
- Use service_role key to bypass RLS during reset
- Implement idempotency checks to prevent duplicate data
- Log reset operations for auditing
- Test reset script in staging before enabling production cron

## Files Expected
- `scripts/reset-demo.ts`
- `scripts/fixtures/demo-data.json`
- `.github/workflows/reset-demo.yml` (optional: GitHub Actions cron)
- `vercel.json` (cron configuration, optional)

## Attempts
0
