# Task 2.7–2.11 — Demo UI (Auto-Auth, Preview Pages, Demo List, Mobile Polish)

> **Context files to read first:** `SHARED-CONTEXT.md`, then read:
> - `packages/shared/src/auth/demo-token.ts` (token validation)
> - `packages/db/src/schema/demo-instances.ts` (demo schema)
> - `apps/web/src/middleware.ts` (token-auth allowlist pattern)
> - `apps/web/src/components/mobile/PhoneFrame.tsx` (will be moved to packages/ui)
> - `packages/db/src/supabase/admin.ts` (admin client for session creation)
> **Branch:** `feat/demo-ui`
> **Estimated time:** 4-6 hours
> **Wave 4 (sequential)** — depends on 2.3 being merged first.

## Objective

Build the demo auto-auth endpoint, split-screen preview, full-screen mobile preview, demo list page, and mobile page header polish.

## Deliverables

### 1. Demo auto-auth endpoint (2.7 in v4.1 spec)

**Create:** `apps/web/src/app/api/v1/auth/demo-login/route.ts`

**`GET /api/v1/auth/demo-login?token=...`** — token-authenticated, NOT session-authenticated.

```typescript
import { extractDemoIdFromToken, validateDemoToken } from '@propertypro/shared';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { demoInstances } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // 1. Extract demoId (before signature verification — just to look up the secret)
  const demoId = extractDemoIdFromToken(token);
  if (!demoId) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_token', request.url));
  }

  // 2. Look up demo instance to get the HMAC secret
  const db = createAdminClient();  // service_role — demo_instances is service_role only
  const rows = await db
    .select()
    .from(demoInstances)
    .where(eq(demoInstances.id, demoId))
    .limit(1);

  const instance = rows[0];
  if (!instance) {
    return NextResponse.redirect(new URL('/auth/login?error=demo_not_found', request.url));
  }

  // 3. Validate token with the demo's secret
  const payload = validateDemoToken(token, instance.authTokenSecret);
  if (!payload) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_token', request.url));
  }

  // 4. Determine which demo user to authenticate as
  const userId = payload.role === 'resident'
    ? instance.demoResidentUserId
    : instance.demoBoardUserId;
  const email = payload.role === 'resident'
    ? instance.demoResidentEmail
    : instance.demoBoardEmail;

  if (!userId) {
    return NextResponse.redirect(new URL('/auth/login?error=demo_user_missing', request.url));
  }

  // 5. Create a Supabase session via admin API
  //    Read packages/db/src/supabase/admin.ts to understand the client config.
  //    Use supabase.auth.admin.generateLink({ type: 'magiclink', email })
  //    Then redirect through the magic link to establish the session.
  //    Alternatively, if the Supabase client supports it:
  //    const { data } = await supabase.auth.admin.createUser({ ... })
  //    Check Supabase docs for @supabase/supabase-js@2.95.3

  // 6. Set session cookie and redirect
  const communityId = instance.seededCommunityId;
  const redirectUrl = payload.role === 'resident'
    ? `/mobile?communityId=${communityId}`
    : `/dashboard?communityId=${communityId}`;

  // Set Referrer-Policy to prevent token leakage
  const response = NextResponse.redirect(new URL(redirectUrl, request.url));
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}
```

**Important implementation note:** The exact Supabase admin session creation method depends on the Supabase JS client version. Read `packages/db/src/supabase/admin.ts` to understand how the admin client is configured. You may need to use `supabase.auth.admin.generateLink()` to create a magic link, then exchange it for a session. Check the Supabase documentation for the correct approach with `@supabase/supabase-js@2.95.3`.

### 2. Add demo-login to middleware token-auth allowlist

**Modify:** `apps/web/src/middleware.ts`

Find the section that defines token-authenticated routes (routes that skip session checks). Add `/api/v1/auth/demo-login` to that list. Pattern should match the existing entries for `/api/v1/auth/signup`, `/api/v1/webhooks/stripe`, etc.

### 3. Move PhoneFrame to packages/ui

**Move:** `apps/web/src/components/mobile/PhoneFrame.tsx` → `packages/ui/src/components/PhoneFrame.tsx`

Simplify props to accept `src: string` (iframe URL). Export from `packages/ui/src/index.ts`:
```typescript
export { PhoneFrame } from './components/PhoneFrame';
```

Update any existing imports in `apps/web` to use `import { PhoneFrame } from '@propertypro/ui'`.

### 4. Split-screen preview page (2.9 in v4.1 spec)

**Create:** `apps/admin/src/app/demo/[id]/preview/page.tsx`

This is a **server component** that:
1. Calls `requirePlatformAdmin()`
2. Queries `demo_instances` by ID via `createAdminClient()`
3. Generates fresh tokens (1-hour TTL) for both resident and board roles
4. Renders the split-screen layout

**Layout:** CSS Grid:
```tsx
<div className="grid h-screen" style={{ gridTemplateColumns: '1fr 430px' }}>
  {/* Left: Desktop board member view */}
  <div className="border-r">
    <iframe
      src={`https://${instance.slug}.getpropertypro.com/api/v1/auth/demo-login?token=${boardToken}`}
      className="h-full w-full"
      title="Board member dashboard preview"
    />
  </div>

  {/* Right: Mobile resident view in PhoneFrame */}
  <div className="flex items-center justify-center bg-gray-100 p-4">
    <PhoneFrame
      src={`https://${instance.slug}.getpropertypro.com/api/v1/auth/demo-login?token=${residentToken}`}
    />
  </div>
</div>
```

**Header bar** above the grid with:
- Back button → `/demo` (demo list)
- Prospect name
- Template type badge
- "Open Full Screen Mobile" link → `/demo/[id]/mobile`
- "Copy Shareable Link" button (copies mobile preview URL)

### 5. Full-screen mobile preview (2.10 in v4.1 spec)

**Create:** `apps/admin/src/app/demo/[id]/mobile/page.tsx`

Server component:
1. `requirePlatformAdmin()`
2. Query `demo_instances`, generate resident token (1-hour TTL)
3. Render:
```tsx
<div className="flex min-h-screen items-center justify-center bg-gray-950">
  <PhoneFrame
    src={`https://${instance.slug}.getpropertypro.com/api/v1/auth/demo-login?token=${residentToken}`}
  />
</div>
```

No admin chrome. This is the page you'd show a prospect on a large screen.

### 6. Demo list page (2.11 in v4.1 spec)

**Create:** `apps/admin/src/app/demo/page.tsx`

Server component:
1. `requirePlatformAdmin()`
2. Query: `SELECT * FROM demo_instances ORDER BY created_at DESC` via `createAdminClient()`

**Table columns:**
- Prospect name (text)
- Template type (badge: blue for condo, green for HOA, purple for apartment)
- Created date (formatted)
- Age (computed: days since `created_at`)
- Age badge color: green (<10 days), yellow (10-19), orange (20-29), red (30+)
- Actions:
  - Split-screen preview icon → `/demo/[id]/preview`
  - Mobile preview icon → `/demo/[id]/mobile`
  - External CRM link icon (if `external_crm_url` is set, opens in new tab)
  - Notes indicator (tooltip with `prospect_notes` if set)
  - Delete button (red)

**Delete flow:**
- Confirmation dialog: "Delete demo for {prospectName}? This will remove all demo data."
- On confirm: `DELETE /api/admin/demos/[id]`
- API implementation: delete `demo_instances` row (community cascades via FK), deactivate demo users in Supabase Auth via `supabase.auth.admin.deleteUser(userId)`

**Create:** `apps/admin/src/app/api/admin/demos/[id]/route.ts`

```typescript
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  await requirePlatformAdmin(request);
  // 1. Look up demo instance
  // 2. Delete demo users from Supabase Auth (admin.deleteUser)
  // 3. Delete demo_instances row (community cascades)
  return NextResponse.json({ success: true });
}
```

### 7. Mobile page headers (2.8 in v4.1 spec)

**Modify:** All files in `apps/web/src/app/mobile/*/page.tsx`

For each mobile page (documents, announcements, meetings, maintenance, and any others), add a themed header at the top of the page content:

```tsx
<header
  className="px-4 py-3 text-white text-base font-semibold"
  style={{ backgroundColor: 'var(--theme-primary, #2563EB)' }}
>
  {/* Page title: "Documents", "Announcements", "Meetings", "Maintenance" */}
</header>
```

Read each file first to understand its current structure. The header should be the first child element of the page's main content area.

### 8. Navigation integration

Add "Demos" link to the admin sidebar nav, pointing to `/demo`. Should appear after the portfolio/communities link.

## Do NOT

- Do not modify `packages/theme` (created in Task 0.4)
- Do not modify `packages/shared/src/auth/demo-token.ts` (created in Task 2.2)
- Do not modify the seed script (refactored in Task 0.8)
- Do not create the demo generator wizard — that's Task 2.3
- Do not create the public site renderer — that's Phase 3

## Acceptance Criteria

- [ ] Demo auto-auth endpoint validates tokens and creates Supabase sessions
- [ ] Endpoint redirects: resident → `/mobile`, board → `/dashboard`
- [ ] `Referrer-Policy: no-referrer` set on auto-auth responses
- [ ] Endpoint added to middleware token-auth allowlist
- [ ] PhoneFrame moved to `packages/ui` and importable as `@propertypro/ui`
- [ ] Split-screen preview shows desktop + mobile side by side
- [ ] Full-screen mobile preview renders on dark background
- [ ] Demo list shows all demos with age badges
- [ ] Delete flow removes demo instance + users + community
- [ ] Mobile pages have themed headers
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
