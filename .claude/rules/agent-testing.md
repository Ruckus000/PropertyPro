<important if="testing authenticated features, using preview tools, or verifying UI">

# Agent Testing

**DO NOT read `.env.local` or try to extract credentials.** Use the `/dev/agent-login` endpoint instead.

**Integration tests: use the LOCAL DB runner, never prod.** `.env.local`'s
`DATABASE_URL` points at **production**, so running the integration suite via
`scripts/with-env-local.sh` seeds/mutates prod (this is how test communities
leaked). Instead run `pnpm test:integration:local` (or `pnpm db:test-local:setup`
/ `:reset`) — it uses a disposable localhost Postgres mirroring CI. See
[integration README](../../apps/web/__tests__/integration/README.md).

## How to Log In as a Demo User

The dev server exposes `/dev/agent-login?as=<role>` which authenticates the browser session as a demo user without needing any passwords or env vars.

**Step 1** — Start the dev server (if not already running):
```
preview_start("web")
```

**Step 2** — Navigate to the agent-login endpoint:
```
preview_eval: window.location.href = '/dev/agent-login?as=owner'
```

**Step 3** — Verify the login worked:
```
preview_snapshot()
```

## Available Roles

| `?as=` value | Role | Community |
|---|---|---|
| `owner` | Unit Owner | Sunset Condos |
| `tenant` | Tenant/Renter | Sunset Condos |
| `board_president` | Board President | Sunset Condos |
| `board_member` | Board Member | Sunset Condos |
| `cam` | Community Assoc. Manager | Sunset Condos |
| `pm_admin` | PM Company Admin | Sunset Condos |
| `founding_admin` | Root Manager (Essentials) | Palm Shores HOA |
| `site_manager` | Site Manager | Sunset Ridge Apartments |

## Switching Roles

Navigate to the endpoint again with a different role:
```
preview_eval: window.location.href = '/dev/agent-login?as=cam'
```

## Making Authenticated API Calls

After logging in, session cookies are set. Use `fetch()` in the preview browser:
```javascript
preview_eval: fetch('/api/v1/documents').then(r => r.json()).then(d => JSON.stringify(d, null, 2))
```

## JSON Mode

Add `Accept: application/json` header for a JSON response instead of a redirect:
```javascript
preview_eval: fetch('/dev/agent-login?as=owner', { headers: { 'Accept': 'application/json' } }).then(r => r.json())
// Returns: { ok: true, user: {...}, community: {...}, portal: "..." }
```

</important>
