# Spec: P4-59 — CI/CD Pipeline

> Set up GitHub Actions CI/CD pipeline with lint, typecheck, test, build, and deploy stages.

## Phase
4

## Priority
P0

## Dependencies
- P4-58

## Functional Requirements
- GitHub Actions workflow: pnpm install → pnpm lint → pnpm typecheck → pnpm test → pnpm build
- Run on push to main and all PRs
- Deploy to Vercel on main branch merge
- Preview deploys on PR branches
- Cache pnpm dependencies and Turborepo build cache
- Fail the pipeline if any stage fails
- Environment secrets for Supabase, Stripe, Resend, Sentry

## Acceptance Criteria
- [ ] Pipeline runs on every PR
- [ ] All stages execute in correct order
- [ ] Failing tests block merge
- [ ] Successful main branch push deploys to Vercel
- [ ] Preview URLs generated for PRs
- [ ] `pnpm test` passes

## Technical Notes
- Use actions/cache for pnpm and Turborepo caching
- Set up branch protection rules requiring pipeline success
- Monitor workflow duration and optimize if exceeding 10 minutes
- Store secrets in GitHub repository settings
- Consider using Codecov for coverage reports

## Files Expected
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `turbo.json` (cache configuration)

## Attempts
0
