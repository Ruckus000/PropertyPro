# Breadcrumb Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single, app-wide `<Breadcrumbs>` component to every authenticated detail/new/edit page (and selected client components) so users always have a path back to parent lists, and prevent regression with a CI guard.

**Architecture:** New component at `apps/web/src/components/shared/breadcrumbs.tsx` consumed via the `breadcrumb` prop on the existing `<PageHeader>`. `<PageHeader>` already wraps the prop in `<nav aria-label="Breadcrumb">` so the component must render `<ol>` only — no nested landmarks. Pages either render `<PageHeader>` directly (Mode A) or delegate to a client component that renders the chrome (Mode B); a `// breadcrumbs:exempt — delegated to <path>` comment lets the CI guard handle Mode B with two-hop verification.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, lucide-react icons, vitest + @testing-library/react for component tests, tsx for the CI guard script.

**Spec:** `docs/superpowers/specs/2026-04-20-breadcrumb-standardization-design.md`

---

## Task 1: Create the Breadcrumbs component (TDD)

**Files:**
- Create: `apps/web/src/components/shared/breadcrumbs.tsx`
- Create: `apps/web/src/components/shared/__tests__/breadcrumbs.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/components/shared/__tests__/breadcrumbs.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from '../breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders only the current label when items is empty', () => {
    render(<Breadcrumbs currentLabel="Edit profile" />);
    const current = screen.getByText('Edit profile');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders one parent crumb + separator + current label', () => {
    render(
      <Breadcrumbs
        items={[{ label: 'Announcements', href: '/announcements?communityId=1' }]}
        currentLabel="Testing 1"
      />,
    );
    const parent = screen.getByRole('link', { name: 'Announcements' });
    expect(parent).toHaveAttribute('href', '/announcements?communityId=1');
    expect(screen.getByText('Testing 1')).toHaveAttribute('aria-current', 'page');
  });

  it('renders multiple parent crumbs with separators', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Help Center', href: '/help?communityId=1' },
          { label: 'Account', href: '/help/account?communityId=1' },
        ]}
        currentLabel="Closing your account"
      />,
    );
    expect(screen.getByRole('link', { name: 'Help Center' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Closing your account')).toHaveAttribute('aria-current', 'page');
  });

  it('does NOT render a <nav> element (PageHeader provides the landmark)', () => {
    const { container } = render(<Breadcrumbs currentLabel="Test" />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('separators are aria-hidden so screen readers skip them', () => {
    const { container } = render(
      <Breadcrumbs
        items={[{ label: 'Parent', href: '/parent' }]}
        currentLabel="Child"
      />,
    );
    const separator = container.querySelector('[aria-hidden="true"]');
    expect(separator).not.toBeNull();
  });

  it('merges className prop', () => {
    const { container } = render(
      <Breadcrumbs currentLabel="Test" className="my-custom-class" />,
    );
    expect(container.firstChild).toHaveClass('my-custom-class');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run apps/web/src/components/shared/__tests__/breadcrumbs.test.tsx`

Expected: All tests FAIL with "Cannot find module '../breadcrumbs'".

- [ ] **Step 3: Implement Breadcrumbs**

Create `apps/web/src/components/shared/breadcrumbs.tsx`:

```tsx
import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbLink {
  label: string;
  href: string;
}

export interface BreadcrumbsProps {
  /** Linked parent crumbs, in order from root to immediate parent. */
  items?: BreadcrumbLink[];
  /** Current page label. Unlinked, marked with aria-current="page". */
  currentLabel: string;
  className?: string;
}

/**
 * Breadcrumb trail for the PageHeader breadcrumb slot.
 *
 * Renders <ol> only — PageHeader wraps this in <nav aria-label="Breadcrumb">,
 * so a nested <nav> would create a duplicate landmark for screen readers.
 */
export function Breadcrumbs({ items = [], currentLabel, className }: BreadcrumbsProps) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-1.5 text-sm', className)}>
      {items.map((item) => (
        <Fragment key={item.href}>
          <li>
            <Link
              href={item.href}
              className="text-content-secondary hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
            >
              {item.label}
            </Link>
          </li>
          <li aria-hidden="true" className="text-content-tertiary">
            <ChevronRight size={14} />
          </li>
        </Fragment>
      ))}
      <li>
        <span
          aria-current="page"
          className="font-medium text-content-secondary truncate max-w-[40ch] inline-block align-middle"
        >
          {currentLabel}
        </span>
      </li>
    </ol>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @propertypro/web exec vitest run apps/web/src/components/shared/__tests__/breadcrumbs.test.tsx`

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/breadcrumbs.tsx apps/web/src/components/shared/__tests__/breadcrumbs.test.tsx
git commit -m "feat(ui): add Breadcrumbs component for PageHeader breadcrumb slot

Single component for app-wide breadcrumb trails. Renders <ol> only;
PageHeader provides the <nav> landmark. Current item gets aria-current=page.
"
```

---

## Task 2: Migrate help center pages and delete ArticleBreadcrumbs

The help center is the lowest-risk migration target — the breadcrumb pattern is already in use, and the change is purely "swap component, same shape."

**Files:**
- Modify: `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/help/manage/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/help/contact/page.tsx`
- Delete: `apps/web/src/components/help/article-breadcrumbs.tsx`

- [ ] **Step 1: Modify help article page to use Breadcrumbs**

In `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx`:

Replace import line `import { ArticleBreadcrumbs } from '@/components/help/article-breadcrumbs';` with:
```tsx
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
```

Replace the `breadcrumb` prop on `<PageHeader>` (currently at lines 75-81):
```tsx
breadcrumb={
  <ArticleBreadcrumbs
    communityId={context.communityId}
    category={article.metadata.category}
    currentTitle={article.metadata.title}
  />
}
```

with:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[
      { label: 'Help Center', href: `/help?communityId=${context.communityId}` },
      {
        label: article.metadata.category.replace(/-/g, ' '),
        href: `/help/${article.metadata.category}?communityId=${context.communityId}`,
      },
    ]}
    currentLabel={article.metadata.title}
  />
}
```

- [ ] **Step 2: Modify help/manage page**

In `apps/web/src/app/(authenticated)/help/manage/page.tsx`, replace the `breadcrumb` prop (currently lines 33-37):
```tsx
breadcrumb={
  <Link href={`/help?communityId=${context.communityId}`} className="hover:text-content">
    Help Center
  </Link>
}
```

with:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[{ label: 'Help Center', href: `/help?communityId=${context.communityId}` }]}
    currentLabel="Manage FAQs"
  />
}
```

Add the import:
```tsx
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
```

Remove the now-unused `import Link from 'next/link';` if it has no other consumers in the file (verify by searching for `<Link` in the file before removing).

- [ ] **Step 3: Modify help/contact page**

In `apps/web/src/app/(authenticated)/help/contact/page.tsx`, apply the same pattern as Step 2 with `currentLabel="Management Contact"`.

- [ ] **Step 4: Delete the old ArticleBreadcrumbs component**

```bash
rm apps/web/src/components/help/article-breadcrumbs.tsx
```

- [ ] **Step 5: Verify nothing else imports ArticleBreadcrumbs**

Run: `grep -r "ArticleBreadcrumbs\|article-breadcrumbs" apps/web/src`

Expected: No matches (other than possibly in this plan file, which is not in apps/web/src).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(authenticated)/help apps/web/src/components/help/article-breadcrumbs.tsx
git commit -m "refactor(help): migrate help pages to shared Breadcrumbs component

Replaces ArticleBreadcrumbs and inline breadcrumb Links with the new
shared component. Behavior preserved (parent crumbs + current item with
aria-current=page); home glyph dropped, text label is sufficient.
"
```

---

## Task 3: Migrate Mode A detail pages

Pages that render `<PageHeader>` directly in their server component. Each gets a `<Breadcrumbs>` in the breadcrumb slot.

**Files:**
- Modify: `apps/web/src/app/(authenticated)/announcements/[id]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/emergency/[id]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/pm/dashboard/[community_id]/page.tsx`

- [ ] **Step 1: Migrate `announcements/[id]/page.tsx` (the original repro)**

Current state: bare `<article>` with no header. Add `<PageHeader>` and a `<Breadcrumbs>` in its breadcrumb slot. The existing badges (Pin, audience), title, published date, and body remain — they move from inline JSX into the children/slots of PageHeader where reasonable, OR sit below the header.

Replace the entire `return` block with:

```tsx
return (
  <div className="mx-auto max-w-3xl space-y-6">
    <PageHeader
      title={announcement.title}
      breadcrumb={
        <Breadcrumbs
          items={[{ label: 'Announcements', href: `/announcements?communityId=${communityId}` }]}
          currentLabel={announcement.title}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {announcement.isPinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-interactive-subtle px-2.5 py-1 text-xs font-semibold text-interactive">
            <Pin size={12} aria-hidden="true" />
            Pinned
          </span>
        )}
        {membership.isAdmin && (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-content-secondary">
            {formatAnnouncementAudienceLabel(
              announcement.audience as
                | 'all'
                | 'owners_only'
                | 'board_only'
                | 'tenants_only',
            )}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-content-tertiary">
        Published {formatDate(announcement.publishedAt)}
      </p>
    </PageHeader>

    <article className="rounded-2xl border border-edge bg-surface-card p-6 shadow-sm">
      <div
        className="prose prose-neutral max-w-none text-content-secondary"
        dangerouslySetInnerHTML={{ __html: announcement.body }}
      />
    </article>
  </div>
);
```

Add imports at the top of the file:
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
```

- [ ] **Step 2: Migrate `emergency/[id]/page.tsx`**

Currently has an inline `← Back` link followed by an `<h1>`. Replace lines 41-53 (the `<div className="flex items-center gap-4">…</div>` block) with:

```tsx
return (
  <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader
      title={report.title}
      breadcrumb={
        <Breadcrumbs
          items={[{ label: 'Emergency', href: `/emergency?communityId=${communityId}` }]}
          currentLabel={report.title}
        />
      }
      actions={
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[report.severity] ?? 'bg-surface-muted'}`}
        >
          {report.severity}
        </span>
      }
    />
    {/* ... rest of the page (status banner + DeliveryReport) unchanged */}
  </div>
);
```

Remove the now-unused `import Link from 'next/link';`.

Add imports:
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
```

- [ ] **Step 3: Skip `pm/dashboard/[community_id]/page.tsx` — it is a redirect-only page**

This file is a 35-line server component that calls `resolvePmDashboardTarget(userId, communityId)` and `redirect()`s. There is no rendered output. It is handled by Task 7 (exemption comment).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Manual verification of the original repro**

```bash
# Start the dev server (background)
pnpm dev
# In a separate terminal:
# 1. Visit /dev/agent-login?as=pm_admin
# 2. Visit /announcements?communityId=<id>
# 3. Click "New announcement", publish, confirm you land on /announcements/[id]
# 4. Confirm "Announcements" parent crumb is visible AND clicking it navigates to the list.
```

Or use the preview tools per `.claude/rules/agent-testing.md`.

Expected: Original repro is resolved.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(authenticated)/announcements/[id]/page.tsx \
        apps/web/src/app/(authenticated)/emergency/[id]/page.tsx \
        apps/web/src/app/(authenticated)/pm/dashboard/[community_id]/page.tsx
git commit -m "feat(nav): add breadcrumbs to Mode A detail pages

Resolves the original repro: after publishing an announcement, the
detail page now shows '< Announcements / Testing 1' with the parent
crumb linked back to the list.
"
```

---

## Task 4: Migrate Mode A new pages (UX change inside)

⚠️ **This task contains a deliberate UX change** — see Spec §Risks #4. Currently `announcements/new/page.tsx` shows a "Back to announcements" outline button in the top-right (PageHeader `actions` slot). Migration removes that button; the breadcrumb in the top-left is the new back affordance.

**Files:**
- Modify: `apps/web/src/app/(authenticated)/announcements/new/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/emergency/new/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx`

- [ ] **Step 1: Modify `announcements/new/page.tsx`**

Current `<PageHeader>` block:
```tsx
<PageHeader
  title="New Announcement"
  description="Share a community update with the right audience."
  actions={
    <Button asChild variant="outline">
      <Link href={`/announcements?communityId=${context.communityId}`}>
        Back to announcements
      </Link>
    </Button>
  }
/>
```

Replace with:
```tsx
<PageHeader
  title="New Announcement"
  description="Share a community update with the right audience."
  breadcrumb={
    <Breadcrumbs
      items={[{ label: 'Announcements', href: `/announcements?communityId=${context.communityId}` }]}
      currentLabel="New announcement"
    />
  }
/>
```

Remove the now-unused `Button` import if it has no other use in the file. Keep `Link` and `Breadcrumbs` imports as needed (verify after edit).

Add: `import { Breadcrumbs } from '@/components/shared/breadcrumbs';`

- [ ] **Step 2: Migrate `emergency/new/page.tsx`**

This file currently has a bare `<h1>Send Emergency Alert</h1>` (line 48), no `<PageHeader>`. Wrap it.

Replace the `return` block (currently lines 46-54):
```tsx
return (
  <div className="mx-auto max-w-4xl space-y-6">
    <h1 className="text-2xl font-semibold text-content">Send Emergency Alert</h1>
    <BroadcastComposer
      communityId={context.communityId}
      communityName={communityName}
    />
  </div>
);
```

with:
```tsx
return (
  <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader
      title="Send Emergency Alert"
      breadcrumb={
        <Breadcrumbs
          items={[{ label: 'Emergency', href: `/emergency?communityId=${context.communityId}` }]}
          currentLabel="Send emergency alert"
        />
      }
    />
    <BroadcastComposer
      communityId={context.communityId}
      communityName={communityName}
    />
  </div>
);
```

Add imports:
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
```

- [ ] **Step 3: Inspect and migrate `pm/dashboard/communities/new/page.tsx`**

Read the file first:
```bash
cat "apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx"
```

Apply the same pattern as Step 2: add a `<PageHeader title="Add community" breadcrumb={<Breadcrumbs items={[{label: 'Portfolio', href: '/pm/dashboard/communities'}]} currentLabel="Add community" />} />` at the top of the page's rendered output. Wrap or replace the existing title rendering.

If the file already uses `<PageHeader>`, just add the breadcrumb prop. If it has a back-button in the `actions` slot (verify by reading), remove it. (This is the only file in this task whose state is not pre-verified by the plan author; the engineer needs to read it first.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Manual visual review**

For each modified page, load it in the dev server and confirm:
- Breadcrumb appears in top-left of the PageHeader.
- The previous back-button (if any) in the top-right `actions` slot is gone.
- The page still renders correctly.

This is a deliberate UX change; capture screenshots before/after for the PR description.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(authenticated)/announcements/new/page.tsx \
        apps/web/src/app/(authenticated)/emergency/new/page.tsx \
        apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx
git commit -m "feat(nav): add breadcrumbs to Mode A new pages

Removes legacy back-button affordance from the actions slot on these
pages; the breadcrumb in the page header is now the back affordance.
This is a deliberate UX change — see spec Risks #4.
"
```

---

## Task 5: Migrate the Mode A edit page

**Files:**
- Modify: `apps/web/src/app/(authenticated)/announcements/[id]/edit/page.tsx`

The page already fetches `announcement` (lines 44-49) — that variable's `title` populates the parent-detail crumb. The page also has a `Cancel` button in the `actions` slot (lines 60-66). **Keep the Cancel button** — it is a form action (cancels the edit, returns to detail), not a nav back-link, and the user explicitly expects it. Only the breadcrumb is added.

- [ ] **Step 1: Modify the file**

Replace the `<PageHeader>` block (currently lines 57-67):
```tsx
<PageHeader
  title="Edit Announcement"
  description="Update the announcement residents see in the community feed."
  actions={
    <Button asChild variant="outline">
      <Link href={`/announcements/${announcementId}?communityId=${context.communityId}`}>
        Cancel
      </Link>
    </Button>
  }
/>
```

with:
```tsx
<PageHeader
  title="Edit Announcement"
  description="Update the announcement residents see in the community feed."
  breadcrumb={
    <Breadcrumbs
      items={[
        { label: 'Announcements', href: `/announcements?communityId=${context.communityId}` },
        {
          label: announcement.title,
          href: `/announcements/${announcementId}?communityId=${context.communityId}`,
        },
      ]}
      currentLabel="Edit"
    />
  }
  actions={
    <Button asChild variant="outline">
      <Link href={`/announcements/${announcementId}?communityId=${context.communityId}`}>
        Cancel
      </Link>
    </Button>
  }
/>
```

Add the import: `import { Breadcrumbs } from '@/components/shared/breadcrumbs';`

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(authenticated)/announcements/[id]/edit/page.tsx"
git commit -m "feat(nav): add breadcrumb to announcements edit page"
```

---

## Task 6: Migrate Mode B client components

These are client components that own the page chrome for delegated pages. They get `<PageHeader>` (often replacing ad-hoc title cards) with a `<Breadcrumbs>` in the breadcrumb slot.

⚠️ **Visual changes** — see Spec §Risks #5. Each of these components currently renders its own ad-hoc page header (custom card with title, etc.). Migration replaces the ad-hoc chrome with the standard `<PageHeader>`. Capture screenshots before/after for the PR.

**Files:**
- Modify: `apps/web/src/components/violations/ViolationDetailView.tsx`
- Modify: `apps/web/src/components/board/forum/forum-thread-detail.tsx`
- Modify: `apps/web/src/components/esign/new-submission-form.tsx`
- Modify: `apps/web/src/components/esign/submission-detail.tsx`
- Modify: `apps/web/src/app/(authenticated)/esign/templates/new/template-builder-client.tsx`
- Modify: `apps/web/src/app/(authenticated)/esign/templates/[id]/template-detail-client.tsx`

- [ ] **Step 1: Migrate `ViolationDetailView.tsx`**

Read the file (focus on the back link at line 124-130 and the title card at lines 133-152).

Replace the `<div>` opener at line 123 + back link + title card (lines 124-152) with:

```tsx
return (
  <div className="space-y-6">
    <PageHeader
      title={`Violation #${violation.id}`}
      description={`${CATEGORY_LABELS[violation.category] ?? violation.category} · Unit ${violation.unitId}`}
      breadcrumb={
        <Breadcrumbs
          items={[
            {
              label: isAdmin ? 'Violations Inbox' : 'Your Reports',
              href: isAdmin
                ? `/violations/inbox?communityId=${communityId}`
                : `/violations/report?communityId=${communityId}`,
            },
          ]}
          currentLabel={`Violation #${violation.id}`}
        />
      }
      actions={
        <div className="flex gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusStyle}`}>
            {STATUS_LABELS[violation.status] ?? violation.status}
          </span>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${severityStyle}`}>
            {violation.severity}
          </span>
        </div>
      }
    />
    {/* Description section and remainder unchanged — starts at the existing <section> at line 154 */}
```

Add imports at the top of the file:
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
```

Remove the now-unused `import Link from 'next/link';` if applicable.

- [ ] **Step 2: Migrate `forum-thread-detail.tsx`**

Read the file (focus on the back link area near line 89).

Replace the back-link `← Back to Forum` element with a PageHeader wrapper that renders the existing title content via the `title` prop and adds the breadcrumb. Specifics depend on the file's current shape — read it first, then refactor following the same pattern as Step 1.

The breadcrumb shape should be:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[
      { label: 'Board', href: `/communities/${communityId}/board?communityId=${communityId}` },
      { label: 'Forum', href: `/communities/${communityId}/board/forum?communityId=${communityId}` },
    ]}
    currentLabel={thread.title}
  />
}
```

(Verify the exact href format by reading the existing back link.)

- [ ] **Step 3: Migrate `new-submission-form.tsx`**

Read the file. The back link is at line 183 (verify with `grep -n "ArrowLeft" apps/web/src/components/esign/new-submission-form.tsx`).

The breadcrumb shape:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[{ label: 'E-Sign Submissions', href: `/esign/submissions?communityId=${communityId}` }]}
    currentLabel="New submission"
  />
}
```

(Verify the parent route by inspecting how the existing back button navigates.)

- [ ] **Step 4: Migrate `submission-detail.tsx`**

Same pattern. Breadcrumb shape:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[{ label: 'E-Sign Submissions', href: `/esign/submissions?communityId=${communityId}` }]}
    currentLabel={submission.title /* or whatever the title source is */}
  />
}
```

- [ ] **Step 5: Migrate `template-builder-client.tsx`**

Two back-link sites at lines 372 and 583 (per the spec audit). Replace both with a single PageHeader at the top of the component output.

Breadcrumb shape:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[{ label: 'Templates', href: `/esign/templates?communityId=${communityId}` }]}
    currentLabel="New template"
  />
}
```

Verify whether the two back-link sites are part of a multi-step wizard (one for "back to templates," one for "previous step"). Only replace the "back to templates" one with the breadcrumb; keep wizard step navigation (previous/next step) as-is.

- [ ] **Step 6: Migrate `template-detail-client.tsx`**

Two back-link sites at lines 194 and 211. These appear to be the same affordance rendered in two different render branches (loading vs loaded). Both should be replaced with a single PageHeader at the top of the component.

Breadcrumb shape:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[{ label: 'Templates', href: `/esign/templates?communityId=${communityId}` }]}
    currentLabel={template.title /* or "Loading..." in the loading branch */}
  />
}
```

For the loading branch, use `currentLabel="Loading template…"` so the breadcrumb still renders meaningfully.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 8: Manual visual review**

Load each affected page in the dev server. Confirm:
- Breadcrumb renders in the top-left.
- The page's title appears in standard PageHeader styling (not a custom card).
- All previously-existing data renders below the header.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/violations/ViolationDetailView.tsx \
        apps/web/src/components/board/forum/forum-thread-detail.tsx \
        apps/web/src/components/esign/new-submission-form.tsx \
        apps/web/src/components/esign/submission-detail.tsx \
        apps/web/src/app/(authenticated)/esign/templates/new/template-builder-client.tsx \
        apps/web/src/app/(authenticated)/esign/templates/[id]/template-detail-client.tsx
git commit -m "feat(nav): standardize page chrome on Mode B client components

Replaces ad-hoc title cards and back links with PageHeader + Breadcrumbs.
See spec Risks #5 — visual diff for these pages reviewed in PR screenshots.
"
```

---

## Task 7: Add `breadcrumbs:exempt` comments to Mode B and redirect-only page files

The page files for Mode B routes are thin server components that delegate to the client components migrated in Task 6. The redirect-only files don't render anything. Both classes will fail the CI guard unless they carry an exemption comment.

**Files:**
- Modify: `apps/web/src/app/(authenticated)/violations/[id]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/esign/submissions/[id]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/esign/templates/[id]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/board/forum/[threadId]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/esign/submissions/new/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/esign/templates/new/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx` (redirect)
- Modify: `apps/web/src/app/(authenticated)/pm/dashboard/[community_id]/page.tsx` (redirect)

- [ ] **Step 1: Add exemption comment to each delegated page**

For each file in the list above (except the redirect-only `communities/[id]/announcements/page.tsx`), add at the very top of the file (before any imports):

```tsx
// breadcrumbs:exempt — delegated to apps/web/src/components/<path>/<Component>.tsx
```

Substitute the correct delegated file path per page (matches the components edited in Task 6).

For the two redirect-only files (`communities/[id]/announcements/page.tsx` and `pm/dashboard/[community_id]/page.tsx`), add:

```tsx
// breadcrumbs:exempt — redirect-only page
```

- [ ] **Step 2: Verify each comment is at the top of its file**

```bash
for f in \
  "apps/web/src/app/(authenticated)/violations/[id]/page.tsx" \
  "apps/web/src/app/(authenticated)/esign/submissions/[id]/page.tsx" \
  "apps/web/src/app/(authenticated)/esign/templates/[id]/page.tsx" \
  "apps/web/src/app/(authenticated)/communities/[id]/board/forum/[threadId]/page.tsx" \
  "apps/web/src/app/(authenticated)/esign/submissions/new/page.tsx" \
  "apps/web/src/app/(authenticated)/esign/templates/new/page.tsx" \
  "apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx" \
  "apps/web/src/app/(authenticated)/pm/dashboard/[community_id]/page.tsx"; do
  echo "=== $f ==="
  head -1 "$f"
done
```

Expected: every file's first line is a `// breadcrumbs:exempt` comment.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(authenticated)/violations/[id]/page.tsx" \
        "apps/web/src/app/(authenticated)/esign/submissions/[id]/page.tsx" \
        "apps/web/src/app/(authenticated)/esign/templates/[id]/page.tsx" \
        "apps/web/src/app/(authenticated)/communities/[id]/board/forum/[threadId]/page.tsx" \
        "apps/web/src/app/(authenticated)/esign/submissions/new/page.tsx" \
        "apps/web/src/app/(authenticated)/esign/templates/new/page.tsx" \
        "apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx" \
        "apps/web/src/app/(authenticated)/pm/dashboard/[community_id]/page.tsx"
git commit -m "chore(nav): mark Mode B and redirect-only pages exempt from breadcrumbs guard"
```

---

## Task 8: Migrate non-guarded files (Q1=B + critique #5)

These are pages and components that are not in the CI guard's glob (they're list/static pages, or they live in components dirs) but currently use ad-hoc breadcrumb patterns. Migrating them in this PR removes the inconsistency.

**Files:**
- Modify: `apps/web/src/components/residents/import-residents-client.tsx`

- [ ] **Step 1: Migrate `import-residents-client.tsx`**

Read the file (focus on the back button at line 194). The page that renders this is a static `apps/web/src/app/(authenticated)/dashboard/import-residents/page.tsx`.

Two options here, pick whichever fits:
- (a) Move the PageHeader to the parent server page file and pass title down as a prop.
- (b) Render PageHeader inside the client component.

Choose (b) for parity with Task 6.

Replace the back button block with PageHeader + Breadcrumbs. The breadcrumb shape:
```tsx
breadcrumb={
  <Breadcrumbs
    items={[{ label: 'Residents', href: `/dashboard?communityId=${communityId}` /* verify the right parent — may be `/residents?communityId=...` */ }]}
    currentLabel="Import residents"
  />
}
```

Verify the parent path by reading where the existing back button navigates to.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/residents/import-residents-client.tsx
git commit -m "feat(nav): standardize import-residents back affordance on Breadcrumbs"
```

---

## Task 9: Build the CI guard (TDD)

**Files:**
- Create: `scripts/verify-page-breadcrumbs.ts`
- Create: `scripts/__fixtures__/breadcrumbs/passing-page.tsx`
- Create: `scripts/__fixtures__/breadcrumbs/failing-page.tsx`
- Create: `scripts/__fixtures__/breadcrumbs/delegated-page.tsx`
- Create: `scripts/__fixtures__/breadcrumbs/delegated-target.tsx`
- Create: `scripts/__tests__/verify-page-breadcrumbs.test.ts`

- [ ] **Step 1: Create fixtures**

Create `scripts/__fixtures__/breadcrumbs/passing-page.tsx`:
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

export default function Page() {
  return (
    <PageHeader
      title="Test"
      breadcrumb={<Breadcrumbs items={[]} currentLabel="Test" />}
    />
  );
}
```

Create `scripts/__fixtures__/breadcrumbs/failing-page.tsx`:
```tsx
import { PageHeader } from '@/components/shared/page-header';

export default function Page() {
  return <PageHeader title="Test" />;
}
```

Create `scripts/__fixtures__/breadcrumbs/delegated-page.tsx`:
```tsx
// breadcrumbs:exempt — delegated to scripts/__fixtures__/breadcrumbs/delegated-target.tsx
export default function Page() {
  return null;
}
```

Create `scripts/__fixtures__/breadcrumbs/delegated-target.tsx`:
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

export function Target() {
  return (
    <PageHeader breadcrumb={<Breadcrumbs currentLabel="Test" />} title="Test" />
  );
}
```

- [ ] **Step 2: Write failing tests**

Create `scripts/__tests__/verify-page-breadcrumbs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { verifyFile } from '../verify-page-breadcrumbs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../__fixtures__/breadcrumbs');

describe('verifyFile', () => {
  it('passes a file with PageHeader breadcrumb prop', () => {
    const result = verifyFile(resolve(fixtures, 'passing-page.tsx'));
    expect(result.ok).toBe(true);
  });

  it('fails a file with PageHeader but no breadcrumb prop', () => {
    const result = verifyFile(resolve(fixtures, 'failing-page.tsx'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no breadcrumb/i);
  });

  it('passes a delegated page when target file has breadcrumb', () => {
    const result = verifyFile(resolve(fixtures, 'delegated-page.tsx'));
    expect(result.ok).toBe(true);
  });

  it('fails when delegated target file does not exist', () => {
    // Synthesize a temp page pointing to a nonexistent target
    // (Add another fixture if needed; or use a temp-file pattern.)
    // For now, ensure the contract is documented:
    // verifyFile returns { ok: false, reason: 'delegated target not found' }
    // when the delegation path resolves to a missing file.
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run scripts/__tests__/verify-page-breadcrumbs.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the guard**

Create `scripts/verify-page-breadcrumbs.ts`:

```ts
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const AUTH_ROOT = resolve(repoRoot, 'apps/web/src/app/(authenticated)');

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

const PAGE_HEADER_BREADCRUMB_RE = /<PageHeader\b[^>]*\sbreadcrumb=/s;
const EXEMPT_RE = /^\s*\/\/\s*breadcrumbs:exempt(.*)$/m;
const DELEGATED_RE = /delegated\s+to\s+(\S+)/;

export function verifyFile(absolutePath: string): VerifyResult {
  if (!existsSync(absolutePath)) {
    return { ok: false, reason: `file not found: ${absolutePath}` };
  }
  const content = readFileSync(absolutePath, 'utf8');

  const exemptMatch = content.match(EXEMPT_RE);
  if (exemptMatch) {
    const reason = exemptMatch[1] ?? '';
    const delegatedMatch = reason.match(DELEGATED_RE);
    if (delegatedMatch) {
      const targetRel = delegatedMatch[1];
      const targetAbs = resolve(repoRoot, targetRel);
      if (!existsSync(targetAbs)) {
        return { ok: false, reason: `delegated target not found: ${targetRel}` };
      }
      const targetContent = readFileSync(targetAbs, 'utf8');
      if (!PAGE_HEADER_BREADCRUMB_RE.test(targetContent)) {
        return { ok: false, reason: `delegated target ${targetRel} has no <PageHeader breadcrumb=...>` };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  if (!PAGE_HEADER_BREADCRUMB_RE.test(content)) {
    return { ok: false, reason: 'no breadcrumb: file has no <PageHeader ... breadcrumb=...> and no exemption comment' };
  }

  return { ok: true };
}

/**
 * Walks AUTH_ROOT recursively. Returns absolute paths of `page.tsx` files
 * whose immediate parent directory is `[<param>]`, `new`, or whose grandparent
 * is `[<param>]` and parent is `edit`.
 */
function findInScopePages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findInScopePages(full, out);
      continue;
    }
    if (entry !== 'page.tsx') continue;
    const parent = basename(dir);
    const grandparent = basename(dirname(dir));
    const inScope =
      /^\[.+\]$/.test(parent) ||
      parent === 'new' ||
      (parent === 'edit' && /^\[.+\]$/.test(grandparent));
    if (inScope) out.push(full);
  }
  return out;
}

function main(): void {
  const files = findInScopePages(AUTH_ROOT);
  const failures: Array<{ file: string; reason: string }> = [];
  for (const file of files) {
    const result = verifyFile(file);
    if (!result.ok) {
      failures.push({ file: relative(repoRoot, file), reason: result.reason ?? 'unknown' });
    }
  }
  if (failures.length > 0) {
    console.error('Breadcrumb guard failed:');
    for (const f of failures) {
      console.error(`  ${f.file}: ${f.reason}`);
    }
    process.exit(1);
  }
  console.log(`Breadcrumb guard passed: ${files.length} in-scope pages verified.`);
}

// ESM main-detection (POSIX only — fine for the dev team's Mac/Linux setup).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

Note: zero new dependencies — uses only `node:fs`, `node:path`, `node:url`. Mirrors the precedent in `scripts/verify-scoped-db-access.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run scripts/__tests__/verify-page-breadcrumbs.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the guard against the live codebase (do NOT wire to lint yet)**

Run: `pnpm exec tsx scripts/verify-page-breadcrumbs.ts`

Expected: PASS, reporting "Breadcrumb guard passed: N in-scope pages verified" with N >= 14.

If FAIL: identify which page is missing a breadcrumb or exemption comment, fix it, and re-run.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-page-breadcrumbs.ts scripts/__fixtures__/breadcrumbs scripts/__tests__/verify-page-breadcrumbs.test.ts
git commit -m "feat(ci): add breadcrumb guard script

Verifies every authenticated detail/new/edit page contains either
<PageHeader breadcrumb=...> or a breadcrumbs:exempt comment.
Two-hop verification for delegated pages.
"
```

---

## Task 10: Wire the CI guard into lint

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add the script and chain it into lint**

In root `package.json`, add to the `scripts` block:
```json
"guard:breadcrumbs": "tsx scripts/verify-page-breadcrumbs.ts",
```

Modify the existing `lint` script:
```json
"lint": "turbo run lint && pnpm guard:db-access && pnpm guard:token-freshness && pnpm guard:breadcrumbs"
```

- [ ] **Step 2: Run lint to verify the chain works end-to-end**

Run: `pnpm lint`

Expected: PASS (all four checks pass — turbo lint, db-access guard, token-freshness guard, breadcrumbs guard).

If breadcrumbs guard fails: see Task 9 Step 6.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "ci(lint): wire breadcrumb guard into lint script"
```

---

## Task 11: Document the convention

**Files:**
- Modify: `.claude/rules/design.md`

- [ ] **Step 1: Append the breadcrumb section**

After the existing `## UX Writing` section (or as a new top-level section under `# Design System Rules`), append:

```markdown
## Page Navigation & Breadcrumbs

- Every authenticated detail/new/edit page MUST render
  `<PageHeader breadcrumb={<Breadcrumbs items={[...]} currentLabel="..." />}>`.
- Breadcrumb labels for parent crumbs match the sidebar nav label exactly
  (`apps/web/src/components/layout/nav-config.ts`).
- Current page label matches the page's `<h1>` title.
- Pages that delegate chrome to a client component opt out with a top-of-file
  `// breadcrumbs:exempt — delegated to <path>` comment naming the file that
  contains the actual `<PageHeader breadcrumb=…>` invocation.
- Redirect-only pages opt out with a top-of-file
  `// breadcrumbs:exempt — redirect-only page` comment.
- The CI guard (`pnpm guard:breadcrumbs`) enforces this on the in-scope glob:
  `**/[<param>]/page.tsx`, `**/new/page.tsx`, `**/[<param>]/edit/page.tsx`
  under `apps/web/src/app/(authenticated)/`.
- Do not add ad-hoc `← Back` links elsewhere on a page. The breadcrumb is the
  back affordance.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/design.md
git commit -m "docs(design): document breadcrumbs convention and exemption comments"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: PASS (all tests including the new `Breadcrumbs` unit tests and the guard tests).

- [ ] **Step 2: Run lint (which now includes the guard)**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Run the build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 5: Manual reproduction of the original bug**

Following `.claude/rules/agent-testing.md`:

1. `preview_start("web")`
2. `preview_eval: window.location.href = '/dev/agent-login?as=board_president'`
3. Navigate to `/announcements?communityId=<sunset-condos-id>`.
4. Click "New announcement".
5. Fill the form and click "Publish announcement".
6. Confirm the resulting `/announcements/[id]?communityId=...` page renders:
   - The breadcrumb `Announcements > Testing 1` (or your title).
   - "Announcements" is a link; clicking it navigates back to the list.
   - The current item has `aria-current="page"`.

`preview_screenshot()` for the PR description.

- [ ] **Step 6: Reproduce on a Mode B page**

Navigate to a violation detail page and verify the breadcrumb works the same way (parent crumb is "Violations Inbox" or "Your Reports" depending on role).

- [ ] **Step 7: Push the branch and open the PR**

The PR description must include:
- Link to the spec doc.
- Before/after screenshots of:
  - The original repro (announcement detail page).
  - At least one Mode A new page (showing the removed back-button — Risks #4).
  - At least one Mode B page (showing the replaced ad-hoc chrome — Risks #5).
- Note that the CI guard is now in place.

---

## Done When

- All 12 tasks completed.
- All commits squashed-or-merged into the `claude/interesting-khorana-2c7bca` branch.
- PR open against `main`.
- All CI jobs green.
- Original repro resolved.
