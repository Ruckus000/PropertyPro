# Task 3.3 — Public Site Renderer

> **Context files to read first:** `SHARED-CONTEXT.md`, then read:
> - `apps/web/src/middleware.ts` (understand subdomain routing, auth-split logic)
> - `packages/db/src/schema/site-blocks.ts` (created in 3.1)
> - `packages/shared/src/site-blocks.ts` (block content types from 3.1)
> - `packages/theme/src/index.ts` (resolveTheme, toCssVars, toFontLinks from 0.4)
> - `apps/web/src/lib/api/branding.ts` (getBrandingForCommunity)
> - `apps/web/src/app/(authenticated)/layout.tsx` (understand route group pattern)
> **Branch:** `feat/public-site`
> **Estimated time:** 3-4 hours
> **Wave 5** — depends on 3.1-3.2 being merged. Can run parallel with 2.7-2.11.

## Objective

Create the public site route that renders a community's published site blocks at the subdomain root for unauthenticated visitors.

## Routing Design

**Key insight:** The middleware already resolves community by subdomain and sets `x-community-id` and `x-tenant-slug` headers. For public sites, we need an auth-split:

- **Unauthenticated visitor on subdomain** → shows the public site
- **Authenticated user on subdomain** → shows the dashboard (existing behavior)

This is handled by a middleware modification + a new route group.

## Deliverables

### 1. Middleware modification for auth-split

**Modify:** `apps/web/src/middleware.ts`

Add logic for the public site auth-split. Find the section where the middleware handles the root path (`/`) on a community subdomain. Add a check:

```typescript
// When a community subdomain requests '/' and user is NOT authenticated:
// Let the request through to the (public-site) route group.
// When authenticated: redirect to /dashboard (existing behavior).
```

Read the middleware carefully to understand the exact location. The key conditions are:
1. Request path is `/` (or the public site path pattern)
2. `x-tenant-slug` header is set (it's a community subdomain)
3. No valid Supabase session
4. → Allow request to proceed to the public site page

**Do not break existing behavior.** Authenticated users must still reach the dashboard.

### 2. Public site page

**Create:** `apps/web/src/app/(public-site)/page.tsx`

This is a **server component**. The `(public-site)` route group means the URL is just `/` (no prefix in the URL).

```typescript
import { headers } from 'next/headers';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { getBrandingForCommunity } from '@/lib/api/branding';
// Import your DB client + schema

export default async function PublicSitePage() {
  const headersList = await headers();
  const communityId = headersList.get('x-community-id');
  const slug = headersList.get('x-tenant-slug');

  if (!communityId) {
    // Not a community subdomain — show a 404 or redirect to marketing
    return notFound();
  }

  // 1. Get community info
  // Query communities table for name, community_type, branding, site_published_at
  // If site_published_at is null, show a "Coming Soon" placeholder

  // 2. Get published blocks
  // SELECT * FROM site_blocks
  //   WHERE community_id = ? AND is_draft = false
  //   ORDER BY block_order ASC

  // 3. Resolve theme
  const branding = await getBrandingForCommunity(Number(communityId));
  const theme = resolveTheme(branding, community.name, community.communityType);
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  // 4. Render
  return (
    <>
      {fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars as React.CSSProperties}>
        <PublicSiteHeader community={community} theme={theme} />
        {blocks.map((block) => {
          const Renderer = BLOCK_RENDERERS[block.blockType];
          if (!Renderer) return null;
          return <Renderer key={block.id} content={block.content} theme={theme} />;
        })}
        <PublicSiteFooter community={community} />
      </div>
    </>
  );
}
```

### 3. Public site layout

**Create:** `apps/web/src/app/(public-site)/layout.tsx`

Minimal layout — no sidebar, no navigation chrome. Just:
```tsx
export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">{children}</body>
    </html>
  );
}
```

**Note:** Check if the root layout (`apps/web/src/app/layout.tsx`) already wraps with `<html>` and `<body>`. If so, the public-site layout should NOT include those tags — just render a wrapper div instead. Next.js App Router only allows one root layout with `<html>`.

### 4. Block renderer components

**Create directory:** `apps/web/src/components/public-site/blocks/`

Create one component per block type. Each receives `{ content, theme }` props.

**`HeroBlock.tsx`:**
```tsx
import type { HeroBlockContent } from '@propertypro/shared';

export function HeroBlock({ content }: { content: HeroBlockContent }) {
  return (
    <section
      className="relative flex min-h-[400px] items-center justify-center px-6 py-16 text-center text-white"
      style={{
        backgroundColor: 'var(--theme-primary)',
        backgroundImage: content.backgroundImageUrl
          ? `url(${content.backgroundImageUrl})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {content.backgroundImageUrl && (
        <div className="absolute inset-0 bg-black/40" />
      )}
      <div className="relative z-10 max-w-2xl">
        <h1
          className="mb-4 text-4xl font-bold"
          style={{ fontFamily: 'var(--theme-font-heading)' }}
        >
          {content.headline}
        </h1>
        <p className="mb-8 text-lg opacity-90">{content.subheadline}</p>
        <a
          href={content.ctaHref}
          className="inline-block rounded-lg px-6 py-3 font-semibold text-white"
          style={{ backgroundColor: 'var(--theme-secondary)' }}
        >
          {content.ctaLabel}
        </a>
      </div>
    </section>
  );
}
```

**`AnnouncementsBlock.tsx`:**
- Server component that queries announcements for the community
- Displays most recent `content.limit` announcements (default 5)
- Each announcement: title, date, truncated body

**`DocumentsBlock.tsx`:**
- Server component that queries documents
- Filter by `content.categoryIds` if non-empty, otherwise show all
- Each document: title, category badge, date, download link

**`MeetingsBlock.tsx`:**
- Server component that queries upcoming meetings (date >= now)
- Each meeting: title, date/time, location

**`ContactBlock.tsx`:**
- Static render from `content` fields
- Board email (mailto link), management company, phone, address

**`TextBlock.tsx`:**
- Renders `content.body` as markdown or plain text
- If markdown: use a simple renderer (split on `\n\n` for paragraphs at minimum)

**`ImageBlock.tsx`:**
- `<figure>` with `<img>` and optional `<figcaption>`
- `alt` from content, lazy loading

### 5. Block renderer map

**Create:** `apps/web/src/components/public-site/blocks/index.ts`

```typescript
import type { ComponentType } from 'react';
import { HeroBlock } from './HeroBlock';
import { AnnouncementsBlock } from './AnnouncementsBlock';
import { DocumentsBlock } from './DocumentsBlock';
import { MeetingsBlock } from './MeetingsBlock';
import { ContactBlock } from './ContactBlock';
import { TextBlock } from './TextBlock';
import { ImageBlock } from './ImageBlock';

export const BLOCK_RENDERERS: Record<string, ComponentType<{ content: any }>> = {
  hero: HeroBlock,
  announcements: AnnouncementsBlock,
  documents: DocumentsBlock,
  meetings: MeetingsBlock,
  contact: ContactBlock,
  text: TextBlock,
  image: ImageBlock,
};
```

### 6. Public site header and footer

**Create:** `apps/web/src/components/public-site/PublicSiteHeader.tsx`

Simple header with:
- Community logo (from theme `--theme-logo-url`) or community name as text
- Background: `var(--theme-primary)`
- "Resident Login" link in top-right → `/auth/login`

**Create:** `apps/web/src/components/public-site/PublicSiteFooter.tsx`

Simple footer with:
- Community name
- "Powered by PropertyPro" attribution
- Copyright year

### 7. "Coming Soon" placeholder

If `community.site_published_at` is null (site never published), show a simple placeholder page instead of blocks:

```tsx
<div className="flex min-h-screen items-center justify-center">
  <div className="text-center">
    <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--theme-font-heading)' }}>
      {community.name}
    </h1>
    <p className="mt-2 text-gray-500">Website coming soon</p>
    <a href="/auth/login" className="mt-4 inline-block text-sm underline">
      Resident Login
    </a>
  </div>
</div>
```

### 8. Tests

**Create:** `apps/web/__tests__/public-site/block-rendering.test.tsx`

Test each block renderer with mock content:
1. HeroBlock renders headline, subheadline, CTA
2. HeroBlock with background image renders overlay
3. ContactBlock renders email as mailto link
4. TextBlock renders paragraphs
5. ImageBlock renders img with alt and optional caption
6. AnnouncementsBlock renders with mock announcements data
7. DocumentsBlock renders with mock documents data

**Create:** `apps/web/__tests__/public-site/community-resolution.test.ts`

Test the middleware auth-split logic:
1. Unauthenticated request on subdomain → serves public site
2. Authenticated request on subdomain → redirects to dashboard
3. Request on main domain → does NOT serve public site

## Do NOT

- Do not create the site builder UI — that's Task 3.4
- Do not create block CRUD API routes — that's Task 3.4
- Do not implement custom domain routing — `custom_domain` exists for future use only
- Do not modify `packages/theme` — just import and use it
- Do not add authentication to the public site page — it must be accessible without login

## Acceptance Criteria

- [ ] Middleware auth-split works: unauthed → public site, authed → dashboard
- [ ] Public site renders published blocks in order
- [ ] All 7 block types render correctly
- [ ] Theme applied via CSS variables (primary, secondary, accent, fonts)
- [ ] Font links injected in head
- [ ] "Coming Soon" shows when no blocks published
- [ ] Header shows community branding, "Resident Login" link
- [ ] Dynamic blocks (announcements, documents, meetings) query real data
- [ ] Block rendering tests pass
- [ ] Community resolution tests pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
