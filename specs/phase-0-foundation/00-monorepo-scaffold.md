# Spec: P0-00 — Monorepo Scaffold

> Initialize the Turborepo monorepo with pnpm workspaces and all package directories.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- None

## Functional Requirements
- Set up Turborepo config with build, dev, lint, test, and typecheck pipelines
- Create pnpm-workspace.yaml with all workspace declarations
- Initialize apps/web directory with Next.js 14+ App Router and TypeScript
- Create packages/ui for design system components
- Create packages/shared for shared utilities and types
- Create packages/db for database client and schema
- Create packages/email for email template handling
- Configure TypeScript path aliases across all packages via tsconfig.json
- Configure transpilePackages in next.config.ts for all internal packages
- Create .env.example with all required environment variables
- Set up comprehensive .gitignore for monorepo

## Acceptance Criteria
- [ ] `pnpm install` succeeds without errors or warnings
- [ ] `pnpm build` completes successfully for all packages
- [ ] `pnpm dev` starts the Next.js dev server on port 3000
- [ ] All packages resolve cross-references via TypeScript path aliases
- [ ] `transpilePackages` configured in next.config.ts for packages/ui, packages/shared, packages/db, packages/email
- [ ] `pnpm typecheck` passes across all packages
- [ ] Root turbo.json defines correct pipeline dependencies

## Technical Notes
- Budget 1-2 days. pnpm workspace resolution and cross-package TypeScript references add real setup time.
- Use `postgres-js` driver, not `node-postgres`.
- Use `transpilePackages` in next.config.ts for every internal package to enable proper code splitting.
- Ensure all workspace packages have correct package.json exports field.
- Configure tsconfig with consistent baseUrl and paths across all packages.

## Files Expected
- turbo.json
- pnpm-workspace.yaml
- package.json (root + apps/web + packages/ui + packages/shared + packages/db + packages/email)
- tsconfig.json (root + apps/web + packages/ui + packages/shared + packages/db + packages/email)
- apps/web/next.config.ts
- apps/web/tailwind.config.ts
- .env.example
- .gitignore

## Attempts
0
