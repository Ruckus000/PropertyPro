# Spec: P4-60 — Production Deployment

> Configure the production environment on Vercel with custom domain, SSL, and environment variables.

## Phase
4

## Priority
P0

## Dependencies
- P4-59

## Functional Requirements
- Vercel project configured for monorepo (apps/web as root)
- Custom domain: getpropertypro.com
- Wildcard subdomain: *.getpropertypro.com
- SSL certificates
- All production environment variables set
- Database connection to Supabase production instance
- Cloudflare DNS configuration
- Verify build and deployment succeed

## Acceptance Criteria
- [ ] Production site loads at getpropertypro.com
- [ ] Wildcard subdomains resolve correctly
- [ ] SSL valid
- [ ] All environment variables present
- [ ] Database connected
- [ ] `pnpm build` succeeds on Vercel

## Technical Notes
- Use Vercel's automatic SSL provisioning via Let's Encrypt
- Configure Cloudflare for DNS with Vercel nameservers
- Store production secrets in Vercel Environment Variables (not in code)
- Document custom domain setup steps for future reference
- Set up monitoring and alerting for deployment health

## Files Expected
- `vercel.json` (project configuration)
- `.env.example` (documented environment variables)
- `docs/DEPLOYMENT.md` (deployment procedures)

## Attempts
0
