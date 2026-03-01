# Task 0.1 — Local Development Infrastructure

> **Context files to read first:** `SHARED-CONTEXT.md`
> **Branch:** `feat/dev-infrastructure`
> **Estimated time:** 30 minutes
> **Wave 2** — run after Wave 1 merges.

## Objective

Update build tooling and docs to support a two-app monorepo (`apps/web` + `apps/admin`).

## Deliverables

### 1. Update `scripts/setup.sh`

Add symlink creation for `apps/admin/.env.local → ../../.env.local` (same pattern as existing `apps/web` symlink). Guard with `if [ -d "apps/admin" ]` so it doesn't fail before Phase 1 creates the directory.

### 2. Update `apps/web/package.json`

Add explicit port to dev script: `"dev": "next dev --port 3000"`

### 3. Update `apps/web/next.config.ts`

Add to the config object: `env: { NEXT_PUBLIC_APP_ROLE: 'web' }`

### 4. Update `turbo.json`

No changes needed — `dev` task already has `"cache": false, "persistent": true` and Turbo will run `dev` for all apps in the workspace. The `apps/*` glob in `pnpm-workspace.yaml` handles discovery.

### 5. Update root `README.md`

Add a "Local Development" section:

```markdown
## Local Development

### Prerequisites
- Node.js 20 (see `.nvmrc`)
- pnpm 10.28.0+

### Setup
\`\`\`bash
./scripts/setup.sh   # Creates .env.local symlinks
pnpm install
\`\`\`

### Running
\`\`\`bash
pnpm dev              # Starts all apps (web :3000, admin :3001)
pnpm --filter apps/web dev    # Web only
pnpm --filter apps/admin dev  # Admin only
\`\`\`

### Ports
| App | Port | URL |
|-----|------|-----|
| web | 3000 | http://localhost:3000 |
| admin | 3001 | http://localhost:3001 |
```

## Do NOT

- Do not create `apps/admin` directory — that's Phase 1
- Do not modify `pnpm-workspace.yaml` — `apps/*` glob already covers future apps

## Acceptance Criteria

- [ ] `scripts/setup.sh` handles both app directories
- [ ] `apps/web` dev script includes `--port 3000`
- [ ] README documents the setup
- [ ] `pnpm dev` still starts `apps/web` normally
