# Task 2.4–2.6 — Theme Injection (Mobile + Desktop + Auto-Auth Endpoint)

> **Context files to read first:** `SHARED-CONTEXT.md`, then read:
> - `apps/web/src/app/mobile/layout.tsx`
> - `apps/web/src/app/(authenticated)/layout.tsx`
> - `apps/web/src/lib/api/branding.ts`
> - `apps/web/src/middleware.ts` (lines related to token-auth allowlist)
> **Branch:** `feat/theme-injection`
> **Estimated time:** 3-4 hours
> **Wave 4** — can run in parallel with 2.1 and 2.2. No shared files.

## Objective

Wire the `packages/theme` system into `apps/web` layouts so community branding is reflected in the UI. Also create the demo auto-auth endpoint.

## Deliverables

### 1. Theme injection in mobile layout

**Modify:** `apps/web/src/app/mobile/layout.tsx`

After the existing `requireCommunityMembership()` call (around line 47), add:

```typescript
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { getBrandingForCommunity } from '@/lib/api/branding';

// After membership check succeeds:
const branding = await getBrandingForCommunity(communityId);
const theme = resolveTheme(branding, membership.communityName ?? '', communityType);
const cssVars = toCssVars(theme);
const fontLinks = toFontLinks(theme);
```

Update the JSX return:
```tsx
return (
  <>
    {fontLinks.map((href) => (
      <link key={href} rel="stylesheet" href={href} />
    ))}
    <div className="mobile-shell" style={cssVars as React.CSSProperties}>
      <main id="main-content" className="mobile-content">{children}</main>
      <BottomTabBar features={features} communityId={communityId} />
    </div>
  </>
);
```

**Why `style={cssVars}` is safe:** React's style prop escapes values. CSS custom properties set via `style` cannot execute JavaScript. This is the correct sanitization approach for user-supplied color values.

### 2. Theme injection in authenticated layout

**Modify:** `apps/web/src/app/(authenticated)/layout.tsx`

Read this file first to understand its structure. It likely has a session check and community resolution. After resolving the community, add the same theme injection pattern:

```typescript
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { getBrandingForCommunity } from '@/lib/api/branding';

const branding = await getBrandingForCommunity(communityId);
const theme = resolveTheme(branding, community.name, community.communityType);
const cssVars = toCssVars(theme);
const fontLinks = toFontLinks(theme);
```

Apply `style={cssVars}` to the root wrapper div.
Inject font `<link>` tags in the `<head>`.

Then update specific elements to use theme variables. **Only replace semantically "brand" colors:**

- Sidebar/header background that uses `bg-blue-600` → add `style={{ backgroundColor: 'var(--theme-primary)' }}`
- Active nav items using `text-blue-600` → add `style={{ color: 'var(--theme-primary)' }}`
- Primary action buttons using `bg-blue-600` → add `style={{ backgroundColor: 'var(--theme-primary)' }}`
- Accent borders using `border-blue-600` → add `style={{ borderColor: 'var(--theme-primary)' }}`

**DO NOT replace:**
- Error states (red)
- Success states (green)
- Warning states (amber)
- Gray text or borders
- White backgrounds

**Scope:** Aim for 15-20 CSS changes maximum. This is a targeted replacement, not a full design system migration.

### 3. Mobile screen headers

**Modify** each mobile page in `apps/web/src/app/mobile/*/page.tsx`:

Add a themed header to each page (documents, announcements, meetings, maintenance):

```tsx
<header
  className="px-4 py-3 text-white text-base font-semibold"
  style={{ backgroundColor: 'var(--theme-primary, #2563EB)' }}
>
  {/* Page title, e.g., "Documents", "Announcements" */}
</header>
```

The community name and logo can be shown in the mobile layout's top area (not per-page).

### 4. Demo auto-auth endpoint

**Create:** `apps/web/src/app/api/v1/auth/demo-login/route.ts`

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
  const supabase = createAdminClient();  // This needs the Supabase admin client, not Drizzle
  // Use supabase.auth.admin to generate a magic link or session
  // Implementation depends on which Supabase admin auth method is available
  // Option A: supabase.auth.admin.generateLink({ type: 'magiclink', email })
  // Option B: Create a custom session token

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

### 5. Add demo-login to middleware token-auth allowlist

**Modify:** `apps/web/src/middleware.ts`

Find the section that defines token-authenticated routes (routes that skip session checks). Add `/api/v1/auth/demo-login` to that list. Pattern should match the existing entries for `/api/v1/auth/signup`, `/api/v1/webhooks/stripe`, etc.

### 6. Snapshot tests

**Create:** `apps/web/__tests__/theme/theme-injection-mobile.test.tsx`

Test that `MobileLayout`:
- Injects `--theme-primary` CSS variable into the shell div's style
- Includes Google Fonts `<link>` tags
- Falls back to defaults when community has no custom branding

**Create:** `apps/web/__tests__/theme/theme-injection-desktop.test.tsx`

Same pattern for the authenticated layout.

## Do NOT

- Do not modify `packages/theme` (that was created in Task 0.4)
- Do not modify `mobile.css` (that was updated in Task 0.5)
- Do not create the demo generator UI (that's Task 2.3)
- Do not create the split-screen preview (that's Task 2.7-2.11)

## Acceptance Criteria

- [ ] Mobile layout injects CSS variables from community branding
- [ ] Mobile layout injects Google Fonts links
- [ ] Authenticated layout injects CSS variables
- [ ] 15-20 brand color references in desktop layout use `var(--theme-primary)` etc.
- [ ] Mobile pages have themed headers
- [ ] Demo auto-auth endpoint validates HMAC tokens
- [ ] Demo auto-auth endpoint creates Supabase session and redirects
- [ ] Endpoint added to middleware token-auth allowlist
- [ ] `Referrer-Policy: no-referrer` set on demo-login responses
- [ ] Snapshot tests pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
