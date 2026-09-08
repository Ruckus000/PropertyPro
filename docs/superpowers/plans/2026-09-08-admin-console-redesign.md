# Admin Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the redesigned PropertyPro operator console (`apps/admin`): a hover-expanding rail shell in the Florida Modern language, every existing screen restyled inside it, and five new operator subsystems — Tickets, Health, Billing, Onboarding, and notifications/search/PWA — each backed by real data.

**Architecture:** Incremental in-place migration. Wave 0 lifts the shadcn and shared components both apps need into `packages/ui`. Wave 1 replaces `AdminLayout`/`Sidebar` with an `(console)` route-group layout that renders `AdminShell` once and feeds it from a single `getShellSignals()` server module composed of per-domain provider files. Wave 2 restyles the ten existing screens in parallel slices with disjoint files. Wave 3 adds Tickets (migration `0072`), Health, Billing and Onboarding in parallel slices, each filling its own `signals/<domain>.ts`. Wave 4 adds preferences + push subscriptions (migration `0073`), the service worker, manifest and web push. Wave 5 closes out docs and the verification gate.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 + semantic tokens · `@propertypro/ui` (NavRail, Badge) · Radix (`react-dialog`, `react-alert-dialog`, `react-switch`, `react-slot`, `react-label`) · `cmdk` · `lucide-react` · Supabase service-role client (`createAdminClient` / `createAdminTypedClient`) · Drizzle migrations · Stripe SDK (`apps/admin/src/lib/stripe.ts`) · Sentry Issues API · `web-push` · `node:dns/promises` · Vitest · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-08-admin-console-redesign-design.md` — its **Decision ledger (§2, D1–D30) is normative**. An implementer who disagrees with a ledger entry files a finding; it does not stop and ask.

## Global Constraints

- **Ponytail ladder on every task**: does it need to exist → already in the codebase → stdlib → platform → installed dep → one line → minimum implementation. Non-negotiables never skipped: trust-boundary validation (Zod on every body/query), accessibility, audit logging of mutations, error handling that protects data. Document any deliberate shortcut with a `// ponytail:` comment naming the limitation and the upgrade path.
- Every admin route: `withAdminErrorHandler(async (request, ctx) => { const admin = await requirePlatformAdmin(); … })`. Bodies via `parseAdminBody(request, schema)`; query values via `parseAdminQuery(value, schema, name)`; both return a `NextResponse` on failure — `if (parsed instanceof NextResponse) return parsed;`.
- Every mutation calls `logAdminAction({ admin, action, resourceType, resourceId, communityId, oldValues, newValues, metadata })` **after** the write; new `action` values are added to the `AdminAuditAction` union in `apps/admin/src/lib/audit/log-admin-action.ts`.
- Semantic Tailwind classes only (`bg-surface-card`, `text-content-secondary`, `border-edge`, `bg-status-danger-subtle`, …). No raw hex, no palette classes, no slash-opacity on semantic tokens (`bg-interactive/10` emits **zero CSS**). For translucency use `bg-white/20` / `bg-black/40`. `guard:design-tokens` baseline is shrink-only; every new file must be clean.
- Status is never colour alone: icon + text + colour. Focus rings never suppressed. Tab strips use `useRovingTabs` from `@/components/a11y/use-roving-tabs`.
- Root font-size **18px**; page titles `font-display` (Fraunces) weight 500; body Inter.
- Pinned selectors that must survive: `role="tab"` named `Support`, heading `Support Access`, button `Start Session`, dialog labels `/impersonate user/i`, `/^Reason/i`, `/ticket id/i` (`apps/web/e2e/support-access.spec.ts`); sign-out semantics in `apps/admin/__tests__/components/sidebar-signout.test.tsx`.
- Migrations: `0072_support_tickets`, `0073_platform_admin_preferences` — scaffold with `pnpm db:migration:new <name>` (never hand-edit `meta/_journal.json`), both EXPAND, applied to prod **manually** via Supabase MCP `apply_migration` before the reading code deploys, ledger row hand-inserted, `scripts/with-env-local.sh pnpm db:ledger:verify` after. Before scaffolding, re-verify the number: `ls packages/db/migrations | tail -3` AND prod `list_migrations` AND `git for-each-ref refs/remotes/origin` + `git ls-tree` for `00(7[2-9])_`.
- Tests: `pnpm test <path>` (never `pnpm test -- <path>`, which runs the whole suite and exits 0). Admin jsdom tests start with `// @vitest-environment jsdom`. Every fix-shaped test records its revert check in the commit message: which production line, which tests go red, which controls stay green.
- Review gate: security review (`/security-review`) + code review (`feature-dev:code-reviewer` over `git diff main...HEAD`) **before each wave's PR**, not only the last.
- **Pre-dispatch verification (plans rot):** before dispatching each task, run one read-only Bash that greps every symbol, path and signature the task names; put corrections at the top of the dispatch prompt under "trust these over the plan".
- Secrets that must exist on the **admin** Vercel project before the wave that reads them: `SENTRY_API_TOKEN` (W3 Health), `CRON_SECRET` (W3 Health retry, W4 push), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (W4). `STRIPE_SECRET_KEY` and `RESEND_API_KEY` already exist there. Add each to `.env.example` with a one-line comment in the task that introduces it.

---

## File map and wave ownership

Waves run in order. Within a wave, slices own **disjoint** file sets so their branches merge without conflicts; a merge conflict means the ownership map below is wrong — stop and report rather than resolve by hand.

| Wave | Slice | Owns (create/modify) |
|---|---|---|
| W0 | foundations | `packages/ui/**`, `apps/web/src/components/ui/{button,badge,card,skeleton,sheet,dialog,alert-dialog,switch,input,textarea,label,command}.tsx`, `apps/web/src/components/shared/{kpi-card,quick-filter-tabs,alert-banner,empty-state,page-body}.tsx`, `apps/admin/src/app/layout.tsx`, `apps/admin/src/app/fonts/*`, `apps/admin/src/styles/globals.css`, `apps/admin/tailwind.config.ts`, `apps/admin/package.json`, `scripts/verify-admin-semantic-css.cjs` |
| W1 | shell | `apps/admin/src/components/shell/**`, `apps/admin/src/lib/server/shell-signals.ts`, `apps/admin/src/lib/server/signals/*`, `apps/admin/src/lib/server/search.ts`, `apps/admin/src/app/api/admin/{shell,search}/**`, `apps/admin/src/app/(console)/**` (moves), `apps/admin/src/components/{AdminLayout,Sidebar}.tsx` (delete), `apps/admin/src/components/loading/AdminPageLoading.tsx`, `apps/admin/src/app/communities/rootless/page.tsx`, `apps/web/e2e/admin-shell.spec.ts`, `apps/web/e2e/ci-safe-specs.json` |
| W2 | 2a dashboard+clients | `(console)/dashboard/**`, `components/dashboard/**`, `lib/server/dashboard.ts`, `(console)/clients/page.tsx`, `components/clients/ClientPortfolio.tsx` |
| W2 | 2b inbox | `(console)/inbox/**`, `components/inbox/**`, `lib/server/inbox.ts`, `packages/shared/src/support-inbox.ts`, `api/admin/leads/route.ts` |
| W2 | 2c workspace | `(console)/clients/[id]/**`, `components/clients/{ClientWorkspace,CommunityMembers,CommunityCompliance,WebsiteTabPanel,CommunityWebsiteEditor,SupportAccessTab,CommunitySettingsEditor,CommunityAccess}.tsx`, `api/admin/communities/[id]/website/dns/route.ts`, `lib/clients/dns.ts`, `lib/server/community-activity.ts` |
| W2 | 2d lists | `(console)/{leads,demo,deletion-requests,site-templates,settings}/**`, `components/{leads,demo/DemoListClient.tsx,deletion-requests,site-templates,settings}/**` |
| W3 | 3a tickets | `packages/db/migrations/0072_*`, `packages/db/src/schema/{support-tickets,support-ticket-events,index,rls-config}.ts`, `packages/db/src/supabase/admin-types.ts` (tickets block), `lib/server/tickets.ts`, `lib/server/signals/tickets.ts`, `api/admin/tickets/**`, `(console)/tickets/**`, `components/tickets/**`, `apps/web/__tests__/integration/support-tickets-rls.integration.test.ts` |
| W3 | 3b health | `lib/server/{sentry,health}.ts`, `lib/server/signals/health.ts`, `api/admin/health/**`, `(console)/health/**`, `components/health/**`, `components/shell/CriticalBanner.tsx` (wire only) |
| W3 | 3c billing | `lib/server/billing.ts`, `lib/server/signals/billing.ts`, `api/admin/billing/**`, `api/admin/communities/[id]/billing/**`, `(console)/billing/**`, `components/billing/**`, `components/clients/BillingTab.tsx`, `components/clients/ClientWorkspace.tsx` (add tab), `lib/audit/log-admin-action.ts` (billing actions) |
| W3 | 3d onboarding | `lib/server/onboarding.ts`, `lib/server/signals/onboarding.ts`, `api/admin/onboarding/route.ts`, `(console)/onboarding/**`, `components/onboarding/**` |
| W4 | prefs+pwa+push | `packages/db/migrations/0073_*`, schema files for the two tables, `admin-types.ts` (prefs block), `lib/server/{preferences,push}.ts`, `api/admin/{preferences,push,internal/push-dispatch}/**`, `app/manifest.ts`, `public/**`, `components/shell/{OfflineBanner,NotificationTray}.tsx` (wire), `components/settings/**`, `apps/admin/vercel.json`, `.env.example` |
| W5 | close-out | `CLAUDE.md`, `DESIGN.md`, `docs/**`, memory |

---

## Wave 0 — Foundations (`packages/ui` lift, admin typography)

### Task 1: `packages/ui` gets `cn()`, the Radix/cva/cmdk deps and updated tsup externals

**Files:**
- Create: `packages/ui/src/utils/cn.ts`
- Modify: `packages/ui/package.json`, `packages/ui/tsup.config.ts`, `packages/ui/src/index.ts`
- Test: `packages/ui/src/utils/__tests__/cn.test.ts`

**Interfaces:**
- Produces: `export function cn(...inputs: ClassValue[]): string` from `@propertypro/ui` (root export) and `packages/ui/src/utils/cn.ts` (internal relative import for lifted components).

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/utils/__tests__/cn.test.ts
import { describe, expect, it } from 'vitest';
import { cn } from '../cn';

describe('cn', () => {
  it('merges conflicting tailwind utilities, last wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @propertypro/ui exec vitest run src/utils/__tests__/cn.test.ts`
Expected: FAIL — `Cannot find module '../cn'`.

- [ ] **Step 3: Add deps and the util**

```bash
pnpm --filter @propertypro/ui add clsx@^2.1.1 tailwind-merge@^3.5.0 class-variance-authority@^0.7.1 lucide-react@^0.575.0 cmdk@^1.1.1 @radix-ui/react-slot@^1.2.4 @radix-ui/react-dialog@^1.1.15 @radix-ui/react-alert-dialog@^1.1.15 @radix-ui/react-switch@^1.2.6 @radix-ui/react-label@^2.1.8
```

```ts
// packages/ui/src/utils/cn.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** clsx + tailwind-merge — identical to apps/web/src/lib/utils.ts so lifted components behave the same. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Add to `packages/ui/src/index.ts`: `export { cn } from './utils/cn';`

Add to `tsup.config.ts` `external`: `"clsx", "tailwind-merge", "class-variance-authority", "lucide-react", "cmdk", "@radix-ui/react-slot", "@radix-ui/react-dialog", "@radix-ui/react-alert-dialog", "@radix-ui/react-switch", "@radix-ui/react-label"`.

- [ ] **Step 4: Run the test and the package build**

Run: `pnpm --filter @propertypro/ui exec vitest run src/utils/__tests__/cn.test.ts && pnpm --filter @propertypro/ui build`
Expected: PASS; build emits `dist/index.js` with the new externals unbundled (grep `dist/index.js` for `from "clsx"`).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/package.json packages/ui/tsup.config.ts packages/ui/src/index.ts packages/ui/src/utils pnpm-lock.yaml
git commit -m "feat(ui): add cn() and the Radix/cva/cmdk deps the lifted components need"
```

### Task 2: Lift the shadcn primitives into `packages/ui`; web re-exports them

**Files:**
- Create: `packages/ui/src/components/ui/{button,badge,card,skeleton,sheet,dialog,alert-dialog,switch,input,textarea,label,command}.tsx`, `packages/ui/src/components/ui/index.ts`
- Modify: `packages/ui/src/components/index.ts` (replace deprecated `Button`/`Card` exports), `packages/ui/src/components/Button.tsx` and `Card.tsx` (delete), `apps/web/src/components/ui/<same 12 files>.tsx` (become re-exports), `apps/admin/src/components/demo/*` files that import `Button`/`Card` from `@propertypro/ui` (2 files — grep before editing)
- Test: `packages/ui/src/components/ui/__tests__/button.test.tsx`

**Interfaces:**
- Produces from `@propertypro/ui`: `Button`, `buttonVariants`, `ButtonProps` (shadcn API: `variant` default/destructive/outline/secondary/ghost/link, `size` default/sm/lg/icon, `asChild`, `loading`); `ShadcnBadge`, `shadcnBadgeVariants`; `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`; `Skeleton`; `Sheet`, `SheetContent`, `SheetTitle`, `SheetDescription`, `SheetHeader`, `SheetFooter`, `SheetClose`, `SheetTrigger`; `Dialog*`; `AlertDialog*`; `Switch`; `Input`; `Textarea`; `Label`; `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut`.
- The deprecated `packages/ui` `Button` (`variant: primary|secondary|…`, `size: md`) and `Card` are **removed**. Admin's two call sites switch to the shadcn API (`variant="default"`, `size="default"`).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui/src/components/ui/__tests__/button.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../button';

describe('Button (lifted shadcn)', () => {
  it('renders a disabled spinner button while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeDisabled();
    expect(button.getAttribute('data-loading')).toBe('true');
  });
  it('applies the outline variant classes', () => {
    render(<Button variant="outline">Open</Button>);
    expect(screen.getByRole('button').className).toContain('border-edge');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @propertypro/ui exec vitest run src/components/ui/__tests__/button.test.tsx`
Expected: FAIL — module `../button` not found.

- [ ] **Step 3: Move the twelve files verbatim, fixing only imports**

```bash
for f in button badge card skeleton sheet dialog alert-dialog switch input textarea label command; do
  git mv apps/web/src/components/ui/$f.tsx packages/ui/src/components/ui/$f.tsx
done
# In each moved file: `import { cn } from "@/lib/utils"` → `import { cn } from "../../utils/cn"`
sed -i '' 's#from "@/lib/utils"#from "../../utils/cn"#; s#from '"'"'@/lib/utils'"'"'#from '"'"'../../utils/cn'"'"'#' packages/ui/src/components/ui/*.tsx
grep -n "@/" packages/ui/src/components/ui/*.tsx   # must print nothing
```

In `packages/ui/src/components/ui/badge.tsx` rename the exports: `Badge` → `ShadcnBadge`, `badgeVariants` → `shadcnBadgeVariants`, `BadgeProps` → `ShadcnBadgeProps` (the status `Badge` in `packages/ui/src/components/Badge.tsx` keeps its name — the design system README documents both names).

```ts
// packages/ui/src/components/ui/index.ts
export { Button, buttonVariants, type ButtonProps } from './button';
export { ShadcnBadge, shadcnBadgeVariants, type ShadcnBadgeProps } from './badge';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export { Skeleton } from './skeleton';
export * from './sheet';
export * from './dialog';
export * from './alert-dialog';
export { Switch } from './switch';
export { Input } from './input';
export { Textarea } from './textarea';
export { Label } from './label';
export * from './command';
```

In `packages/ui/src/components/index.ts`: delete the `Button`/`Card` lines and `git rm packages/ui/src/components/Button.tsx packages/ui/src/components/Card.tsx`; add `export * from './ui';`.

Recreate each web file as a re-export so hundreds of imports keep working, e.g.:

```ts
// apps/web/src/components/ui/button.tsx
export { Button, buttonVariants, type ButtonProps } from '@propertypro/ui';
```

```ts
// apps/web/src/components/ui/badge.tsx
export { ShadcnBadge as Badge, shadcnBadgeVariants as badgeVariants, type ShadcnBadgeProps as BadgeProps } from '@propertypro/ui';
```

Repeat for the other ten with their exact export lists (copy the `export` line from each moved file). Then fix admin's two `@propertypro/ui` `Button`/`Card` call sites to the shadcn props (`grep -rn "from '@propertypro/ui'" apps/admin/src | grep -E "Button|Card"`).

- [ ] **Step 4: Verify both apps and the package**

Run: `pnpm --filter @propertypro/ui exec vitest run src/components/ui && pnpm --filter @propertypro/ui build && pnpm --filter @propertypro/web typecheck && pnpm --filter @propertypro/admin typecheck && pnpm guard:class-resolution`
Expected: PASS everywhere. `guard:class-resolution` still scans `packages/ui/src` with web's config, so the moved classes resolve as before.

- [ ] **Step 5: Commit**

```bash
git add -A packages/ui/src/components apps/web/src/components/ui apps/admin/src
git commit -m "refactor(ui): lift the shadcn primitives into packages/ui; web re-exports them

Replaces the deprecated packages/ui Button/Card (admin-only) with the shadcn
versions so both apps share one Button, Card, Badge (ShadcnBadge), Skeleton,
Sheet, Dialog, AlertDialog, Switch, Input, Textarea, Label and Command."
```

### Task 3: Lift `KpiCard`, `QuickFilterTabs`, `AlertBanner`, `EmptyState`, `PageBody` into `packages/ui`

**Files:**
- Create: `packages/ui/src/components/shared/{kpi-card,quick-filter-tabs,alert-banner,empty-state,page-body}.tsx`, `packages/ui/src/components/shared/index.ts`
- Modify: `apps/web/src/components/shared/<same five>.tsx` (re-export; `empty-state.tsx` keeps the preset wrapper), `packages/ui/src/components/index.ts`
- Test: `packages/ui/src/components/shared/__tests__/kpi-card.test.tsx`, `.../empty-state.test.tsx`

**Interfaces:**
- `KpiCard` props: `{ title: string; value: string | number; delta?: number; deltaLabel?: string; trend?: 'up'|'down'|'neutral'; invertTrend?: boolean; icon?: LucideIcon; href?: string; linkComponent?: React.ComponentType<{ href: string; className?: string; children: React.ReactNode }>; onClick?: () => void; isLoading?: boolean }`. `deltaLabel` defaults to `'vs last 30 days'`. With `href` and no `linkComponent` it renders `<a>`; with `onClick` and no `href` it renders a `<button>` (the dashboard's KPI detail modal needs this).
- `QuickFilterTabs` props unchanged: `{ tabs: {label,value,count?}[]; active; onChange; className? }`, uses `ShadcnBadge`.
- `AlertBanner` props unchanged; `StatusVariant` now imported from `../../tokens` (packages/ui's own `StatusVariant`, which already has the same eight keys).
- `EmptyState` in packages/ui is **props-only**: `{ icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; size?: 'sm'|'md'|'lg' }`. The web wrapper keeps `preset` + the icon-key map and delegates.
- `PageBody` unchanged.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/src/components/shared/__tests__/kpi-card.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KpiCard } from '../kpi-card';

describe('KpiCard', () => {
  it('renders as a button when onClick is given without href', () => {
    const onClick = vi.fn();
    render(<KpiCard title="Open threads" value={7} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /open threads/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('uses the injected link component for href', () => {
    const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a data-testid="custom-link" href={href}>{children}</a>
    );
    render(<KpiCard title="MRR" value="$1" href="/billing" linkComponent={Link} />);
    expect(screen.getByTestId('custom-link').getAttribute('href')).toBe('/billing');
  });
  it('shows the delta with a custom label, never colour alone', () => {
    render(<KpiCard title="Past due" value="$240" delta={12} trend="up" invertTrend deltaLabel="vs. 30d" />);
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByText('vs. 30d')).toBeTruthy();
  });
});
```

```tsx
// packages/ui/src/components/shared/__tests__/empty-state.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inbox } from 'lucide-react';
import { EmptyState } from '../empty-state';

describe('EmptyState (props-only)', () => {
  it('renders title, description and action', () => {
    render(<EmptyState icon={Inbox} title="Nothing here" description="No open threads." action={<button>Refresh</button>} />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeTruthy();
    expect(screen.getByText('No open threads.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm --filter @propertypro/ui exec vitest run src/components/shared`
Expected: FAIL — modules not found.

- [ ] **Step 3: Move and adapt**

`git mv` the five files into `packages/ui/src/components/shared/`. Then:

- Replace `@/lib/utils` → `../../utils/cn`; `@/components/ui/card` → `../ui/card`; `@/components/ui/skeleton` → `../ui/skeleton`; `@/components/ui/badge` `Badge` → `ShadcnBadge` from `../ui/badge`; `@/lib/constants/status` `StatusVariant` → `import type { StatusVariant } from '../../tokens'`.
- `kpi-card.tsx`: remove `next/link`; add `deltaLabel`, `linkComponent`, `onClick`:

```tsx
const wrapperClass = cn(
  'block w-full text-left',
  (href || onClick) && 'transition-shadow duration-quick hover:shadow-md rounded-md',
);
if (href) {
  const LinkComp = linkComponent ?? 'a';
  return <LinkComp href={href} className={wrapperClass}>{content}</LinkComp>;
}
if (onClick) {
  return (
    <button type="button" onClick={onClick} className={wrapperClass} aria-label={title}>
      {content}
    </button>
  );
}
return content;
```
  and in the delta row replace the literal `vs last 30 days` with `{deltaLabel}` (prop default `'vs last 30 days'`).
- `empty-state.tsx`: delete the `EmptyStateIconKey` map and the `preset` branch; keep `sizeConfig`, `title`, `description`, `action`, `icon` (a `LucideIcon` only), and the `<h3>` for the title so the test's `heading` query passes.
- `packages/ui/src/components/shared/index.ts` exports all five; add `export * from './shared';` to `packages/ui/src/components/index.ts`.

Web re-exports:

```tsx
// apps/web/src/components/shared/kpi-card.tsx
'use client';
import Link from 'next/link';
import { KpiCard as UiKpiCard, type KpiCardProps as UiKpiCardProps } from '@propertypro/ui';
export type KpiCardProps = Omit<UiKpiCardProps, 'linkComponent'>;
/** Web binds next/link once so every existing call site keeps `href` semantics. */
export function KpiCard(props: KpiCardProps) {
  return <UiKpiCard {...props} linkComponent={Link} />;
}
```

```tsx
// apps/web/src/components/shared/empty-state.tsx — keep the ICON_MAP and preset lookup, delegate rendering:
import { EmptyState as UiEmptyState } from '@propertypro/ui';
// … resolve `preset` via getEmptyStateConfig / icon key via ICON_MAP exactly as today, then
return <UiEmptyState icon={resolvedIcon} title={title} description={description} action={action} size={size} {...rest} />;
```

`quick-filter-tabs.tsx`, `alert-banner.tsx`, `page-body.tsx` become one-line re-exports.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @propertypro/ui exec vitest run src/components/shared && pnpm --filter @propertypro/ui build && pnpm --filter @propertypro/web typecheck && pnpm test apps/web/src/components/shared && pnpm guard:class-resolution && pnpm guard:design-tokens`
Expected: all PASS; the web shared `__tests__` still pass through the re-exports; design-token baseline unchanged (moved files keep their counts — if the guard reports a moved file as "new", update `scripts/design-token-baseline.json` paths in the same commit, counts unchanged).

- [ ] **Step 5: Commit**

```bash
git add -A packages/ui/src/components apps/web/src/components/shared scripts/design-token-baseline.json
git commit -m "refactor(ui): lift KpiCard, QuickFilterTabs, AlertBanner, EmptyState, PageBody into packages/ui"
```

### Task 4: Admin typography foundation — Fraunces, 18px root, `font-display`, guard root

**Files:**
- Create: `apps/admin/src/app/fonts/fraunces-latin-var.woff2`, `fraunces-latin-var-italic.woff2`, `OFL-Fraunces.txt` (copied from `apps/web/src/app/fonts/`)
- Modify: `apps/admin/src/app/layout.tsx`, `apps/admin/src/styles/globals.css`, `apps/admin/tailwind.config.ts`, `scripts/verify-admin-semantic-css.cjs`
- Test: `apps/admin/__tests__/shell/typography.test.ts`

**Interfaces:**
- Produces: `font-display` Tailwind family in admin; CSS var `--font-display` set on `<html>` by `next/font/local`; `:root { font-size: 18px }`.

- [ ] **Step 1: Write the failing test** (a source-level pin, since fonts do not render in jsdom)

```ts
// apps/admin/__tests__/shell/typography.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

describe('admin typography foundation', () => {
  it('loads Fraunces as --font-display next to Inter', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toMatch(/fraunces-latin-var\.woff2/);
    expect(layout).toMatch(/variable: '--font-display'/);
    expect(layout).toMatch(/\$\{inter\.variable\} \$\{fraunces\.variable\}/);
  });
  it('sets the 18px root like apps/web', () => {
    expect(read('src/styles/globals.css')).toMatch(/:root\s*\{[^}]*font-size:\s*18px/);
  });
  it('exposes font-display in tailwind', () => {
    expect(read('tailwind.config.ts')).toMatch(/display: \['var\(--font-display\)', 'Fraunces'/);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/shell/typography.test.ts`
Expected: FAIL on all three.

- [ ] **Step 3: Implement**

```bash
cp apps/web/src/app/fonts/fraunces-latin-var.woff2 apps/web/src/app/fonts/fraunces-latin-var-italic.woff2 apps/web/src/app/fonts/OFL-Fraunces.txt apps/admin/src/app/fonts/
```

`apps/admin/src/app/layout.tsx` — add below `inter`:

```ts
// Display serif for page titles only (font-display); body/data stay on Inter.
// Vendored for the same reason as Inter: next/font/google downloads at build
// time and has taken CI down twice when fonts.gstatic.com was unreachable.
const fraunces = localFont({
  src: [
    { path: './fonts/fraunces-latin-var.woff2', weight: '100 900', style: 'normal' },
    { path: './fonts/fraunces-latin-var-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-display',
});
```
and `<html lang="en" className={`${inter.variable} ${fraunces.variable}`}>`.

`globals.css` `:root` block: add `font-size: 18px;` (keep the `--font-mono` line).

`tailwind.config.ts` `fontFamily`: add `display: ['var(--font-display)', 'Fraunces', 'Georgia', 'serif'],`.

`scripts/verify-admin-semantic-css.cjs`: where the source root is defined (`apps/admin/src`), scan **both** `apps/admin/src` and `packages/ui/src` — admin's Tailwind `content` already globs `../../packages/ui/src/**/*.{ts,tsx}`, and after Task 2 every lifted component's classes render in admin. Keep the tri-state exit and the non-zero population assertion; print both roots in the denominator line.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/shell/typography.test.ts && pnpm --filter @propertypro/admin build && node scripts/verify-admin-semantic-css.cjs && pnpm guard:token-coverage`
Expected: PASS; the semantic-css guard reports classes from both roots and exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app apps/admin/src/styles apps/admin/tailwind.config.ts scripts/verify-admin-semantic-css.cjs apps/admin/__tests__/shell
git commit -m "feat(admin): vendor Fraunces, 18px root, font-display; semantic-css guard scans packages/ui"
```

### Task 5: Wave 0 gate and PR

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test packages/ui && pnpm test apps/web/src/components && pnpm test apps/admin && pnpm --filter @propertypro/web build`
Expected: all green. If `guard:design-tokens` reports the moved files under new paths, the baseline edit from Task 3 covers it; counts must not grow.

- [ ] **Step 2: Security review + code review** (`/security-review`; `feature-dev:code-reviewer` over `git diff main...HEAD`). Fix real defects even below the reporting threshold.

- [ ] **Step 3: Open PR "W0 foundations: lift shared components into packages/ui; admin typography"**. Merge before starting Wave 1.

---

## Wave 1 — Shell (route-group layout, rail, top bar, palette, signals)

Wave 1 lands as one branch. Tasks 6–11 build the pieces bottom-up so each is testable alone; Task 11 is the switch-over.

### Task 6: `nav-config.ts` and `AdminPageHeader`

**Files:**
- Create: `apps/admin/src/components/shell/nav-config.ts`, `apps/admin/src/components/shell/AdminPageHeader.tsx`
- Test: `apps/admin/__tests__/shell/nav-config.test.ts`, `apps/admin/__tests__/shell/page-header.test.tsx`

**Interfaces:**
- Produces:
```ts
export type NavSignalKey = 'inbox' | 'tickets' | 'health' | 'onboarding' | 'billing' | 'leads' | 'deletion';
export interface AdminNavItem { id: string; label: string; href: string; icon: LucideIcon; signal?: NavSignalKey; tone?: 'danger' | 'warning' }
export interface AdminNavGroup { label: string; items: AdminNavItem[] }
export const NAV_GROUPS: AdminNavGroup[];
export const NAV_PAGES: { id: string; label: string; href: string }[];   // flat, for search
export function getActiveNavId(pathname: string): string | null;         // longest-prefix match; '/clients/12' → 'clients'
export function getPageTitle(pathname: string): string;                  // label of the active item, 'PropertyPro Ops' fallback
```
- `AdminPageHeader` props: `{ title: string; description?: string; eyebrow?: React.ReactNode; actions?: React.ReactNode; backHref?: string; backLabel?: string }`. Renders `<h1 className="font-display text-2xl font-medium tracking-tight md:text-3xl">`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/shell/nav-config.test.ts
import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, getActiveNavId, getPageTitle } from '@/components/shell/nav-config';

describe('nav-config', () => {
  it('has the three design groups in order', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Operate', 'Customers', 'Platform']);
  });
  it('does not list Rootless Communities (folded into Clients)', () => {
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href.includes('rootless'))).toBe(false);
  });
  it('resolves nested paths to their section by longest prefix', () => {
    expect(getActiveNavId('/clients/12')).toBe('clients');
    expect(getActiveNavId('/inbox/44')).toBe('inbox');
    expect(getActiveNavId('/site-templates/theme-presets')).toBe('templates');
    expect(getActiveNavId('/nope')).toBeNull();
  });
  it('titles mobile screens from the active item', () => {
    expect(getPageTitle('/deletion-requests')).toBe('Deletion requests');
  });
});
```

```tsx
// apps/admin/__tests__/shell/page-header.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';

describe('AdminPageHeader', () => {
  it('paints the title as the page h1 in the display face', () => {
    render(<AdminPageHeader title="Overview" description="Good morning" actions={<button>New ticket</button>} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Overview' });
    expect(h1.className).toContain('font-display');
    expect(screen.getByText('Good morning')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New ticket' })).toBeTruthy();
  });
  it('renders a back link when backHref is given', () => {
    render(<AdminPageHeader title="Bayview" backHref="/clients" backLabel="Clients" />);
    expect(screen.getByRole('link', { name: /clients/i }).getAttribute('href')).toBe('/clients');
  });
});
```

- [ ] **Step 2: Run to confirm both fail** — `pnpm --filter @propertypro/admin exec vitest run __tests__/shell/nav-config.test.ts __tests__/shell/page-header.test.tsx` → module not found.

- [ ] **Step 3: Implement**

```ts
// apps/admin/src/components/shell/nav-config.ts
import {
  Activity, Building2, CreditCard, Home, Inbox, Mail, MonitorPlay, Palette, Rocket, Settings, Ticket, Trash2,
  type LucideIcon,
} from 'lucide-react';

export type NavSignalKey = 'inbox' | 'tickets' | 'health' | 'onboarding' | 'billing' | 'leads' | 'deletion';

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which shell signal count badges this item. */
  signal?: NavSignalKey;
  /** Badge tone when the count is non-zero. Default neutral. */
  tone?: 'danger' | 'warning';
}
export interface AdminNavGroup { label: string; items: AdminNavItem[] }

export const NAV_GROUPS: AdminNavGroup[] = [
  { label: 'Operate', items: [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: Home },
    { id: 'inbox', label: 'Inbox', href: '/inbox', icon: Inbox, signal: 'inbox' },
    { id: 'tickets', label: 'Tickets', href: '/tickets', icon: Ticket, signal: 'tickets' },
    { id: 'health', label: 'Health', href: '/health', icon: Activity, signal: 'health', tone: 'danger' },
  ] },
  { label: 'Customers', items: [
    { id: 'clients', label: 'Clients', href: '/clients', icon: Building2 },
    { id: 'onboarding', label: 'Onboarding', href: '/onboarding', icon: Rocket, signal: 'onboarding' },
    { id: 'billing', label: 'Billing', href: '/billing', icon: CreditCard, signal: 'billing', tone: 'warning' },
    { id: 'leads', label: 'Leads', href: '/leads', icon: Mail, signal: 'leads' },
    { id: 'demos', label: 'Demos', href: '/demo', icon: MonitorPlay },
  ] },
  { label: 'Platform', items: [
    { id: 'deletion', label: 'Deletion requests', href: '/deletion-requests', icon: Trash2, signal: 'deletion', tone: 'warning' },
    { id: 'templates', label: 'Site templates', href: '/site-templates', icon: Palette },
    { id: 'settings', label: 'Settings', href: '/settings', icon: Settings },
  ] },
];

export const NAV_PAGES = NAV_GROUPS.flatMap((g) => g.items.map(({ id, label, href }) => ({ id, label, href })));

export function getActiveNavId(pathname: string): string | null {
  let best: AdminNavItem | null = null;
  for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
    const hit = pathname === item.href || pathname.startsWith(item.href + '/');
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.id ?? null;
}

export function getPageTitle(pathname: string): string {
  const id = getActiveNavId(pathname);
  return NAV_PAGES.find((p) => p.id === id)?.label ?? 'PropertyPro Ops';
}
```

```tsx
// apps/admin/src/components/shell/AdminPageHeader.tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** Badges / meta line under the title. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

/**
 * Admin paints its page title (spec D7): the console has no breadcrumb trail,
 * so the Fraunces h1 is how a screen names itself. Web's PageHeader is sr-only
 * by a different decision and is deliberately not reused.
 */
export function AdminPageHeader({ title, description, eyebrow, actions, backHref, backLabel }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backHref && (
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content">
            <ArrowLeft size={14} aria-hidden="true" />
            {backLabel ?? 'Back'}
          </Link>
        )}
        <h1 className="font-display text-2xl font-medium tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-content-secondary">{description}</p>}
        {eyebrow && <div className="mt-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests** — same command → PASS.
- [ ] **Step 5: Commit** — `git add apps/admin/src/components/shell apps/admin/__tests__/shell && git commit -m "feat(admin): nav-config and AdminPageHeader for the redesigned shell"`

### Task 7: Shell signals — server module, per-domain providers, API route

**Files:**
- Create: `apps/admin/src/lib/server/shell-signals.ts`, `apps/admin/src/lib/server/signals/{types,inbox,leads,deletion,tickets,health,billing,onboarding}.ts`, `apps/admin/src/app/api/admin/shell/signals/route.ts`
- Test: `apps/admin/__tests__/shell/shell-signals.test.ts`, `apps/admin/__tests__/shell/signals-route.test.ts`

**Interfaces:**
```ts
// signals/types.ts
export type SignalTone = 'danger' | 'warning' | 'info' | 'brand' | 'neutral';
export type SignalIcon = 'bug' | 'creditCard' | 'inbox' | 'trash' | 'mail' | 'ticket' | 'activity' | 'user' | 'building';
export interface ShellSignalItem { id: string; tone: SignalTone; icon: SignalIcon; title: string; meta: string; href: string; occurredAt: string }
export interface ShellCritical { fingerprint: string; text: string; shortText: string; href: string }
export interface ProviderResult { count: number; items: ShellSignalItem[]; critical?: ShellCritical | null }
export interface SignalProvider { key: NavSignalKey; load(): Promise<ProviderResult> }
// shell-signals.ts
export interface ShellSignals { counts: Record<NavSignalKey, number>; items: ShellSignalItem[]; critical: ShellCritical | null; generatedAt: string; failed: NavSignalKey[] }
export async function getShellSignals(providers?: SignalProvider[]): Promise<ShellSignals>;
```
- Providers that Wave 3 fills (`tickets`, `health`, `billing`, `onboarding`) are created here returning `{ count: 0, items: [] }` with a `// Filled by Wave 3 — spec D11` comment; Wave 3 replaces the body, never the export name.
- Route: `GET /api/admin/shell/signals` → `{ data: ShellSignals }`, `Cache-Control: private, no-store`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/shell/shell-signals.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
import { captureException } from '@sentry/nextjs';
import { getShellSignals } from '@/lib/server/shell-signals';
import type { SignalProvider } from '@/lib/server/signals/types';

const ok = (key: SignalProvider['key'], count: number, critical?: { fingerprint: string }): SignalProvider => ({
  key,
  load: async () => ({
    count,
    items: [{ id: `${key}-1`, tone: 'info', icon: 'inbox', title: key, meta: 'm', href: `/${key}`, occurredAt: '2026-09-08T10:00:00Z' }],
    critical: critical ? { ...critical, text: 't', shortText: 's', href: `/${key}` } : null,
  }),
});

describe('getShellSignals', () => {
  it('composes counts and newest-first items from every provider', async () => {
    const s = await getShellSignals([ok('inbox', 7), ok('leads', 6)]);
    expect(s.counts.inbox).toBe(7);
    expect(s.counts.leads).toBe(6);
    expect(s.counts.tickets).toBe(0);
    expect(s.items.map((i) => i.id)).toEqual(['inbox-1', 'leads-1']);
    expect(s.failed).toEqual([]);
  });
  it('a throwing provider yields 0, is reported to Sentry and named in `failed`, and never blanks the rest', async () => {
    const boom: SignalProvider = { key: 'health', load: async () => { throw new Error('sentry down'); } };
    const s = await getShellSignals([ok('inbox', 2), boom]);
    expect(s.counts.inbox).toBe(2);
    expect(s.counts.health).toBe(0);
    expect(s.failed).toEqual(['health']);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
  it('picks the first critical alert in provider order', async () => {
    const s = await getShellSignals([ok('billing', 1, { fingerprint: 'b' }), ok('health', 1, { fingerprint: 'h' })]);
    expect(s.critical?.fingerprint).toBe('b');
  });
});
```

```ts
// apps/admin/__tests__/shell/signals-route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';
const requirePlatformAdmin = vi.fn();
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: () => requirePlatformAdmin() }));
vi.mock('@/lib/server/shell-signals', () => ({
  getShellSignals: async () => ({ counts: { inbox: 1, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 }, items: [], critical: null, generatedAt: 'x', failed: [] }),
}));
import { GET } from '@/app/api/admin/shell/signals/route';

describe('GET /api/admin/shell/signals', () => {
  it('401s an anonymous caller before touching data', async () => {
    requirePlatformAdmin.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(new NextRequest('http://admin.test/api/admin/shell/signals'));
    expect(res.status).toBe(401);
  });
  it('returns the signals with no-store caching', async () => {
    requirePlatformAdmin.mockResolvedValueOnce({ id: 'u', email: 'e', role: 'super_admin' });
    const res = await GET(new NextRequest('http://admin.test/api/admin/shell/signals'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect((await res.json()).data.counts.inbox).toBe(1);
  });
});
```

- [ ] **Step 2: Run to confirm they fail** — `pnpm --filter @propertypro/admin exec vitest run __tests__/shell/shell-signals.test.ts __tests__/shell/signals-route.test.ts`.

- [ ] **Step 3: Implement**

```ts
// apps/admin/src/lib/server/signals/types.ts  (the interfaces above, verbatim)
```

```ts
// apps/admin/src/lib/server/signals/inbox.ts
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { SUPPORT_MAILBOX_LABELS } from '@propertypro/shared';
import type { SignalProvider } from './types';

/** Open support threads: count for the nav badge, the 5 newest for the tray. */
export const inboxSignals: SignalProvider = {
  key: 'inbox',
  async load() {
    const db = createAdminTypedClient();
    const { data, count, error } = await db
      .from('support_inbox_threads')
      .select('id, subject, participant_name, participant_email, mailbox, last_message_at', { count: 'exact' })
      .eq('status', 'open')
      .order('last_message_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(`inbox signals: ${error.message}`);
    return {
      count: count ?? 0,
      items: (data ?? []).map((t) => ({
        id: `thread-${t.id}`,
        tone: 'info',
        icon: 'inbox',
        title: `New reply from ${t.participant_name ?? t.participant_email}`,
        meta: `${t.subject} · ${SUPPORT_MAILBOX_LABELS[t.mailbox]}`,
        href: `/inbox/${t.id}`,
        occurredAt: t.last_message_at,
      })),
    };
  },
};
```

```ts
// apps/admin/src/lib/server/signals/leads.ts
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { SignalProvider } from './types';

const ICP_MIN_UNITS = 25;
const ICP_MAX_UNITS = 149;

/** New leads: badge = status 'new'; tray = newest ICP-band leads (25–149 units). */
export const leadsSignals: SignalProvider = {
  key: 'leads',
  async load() {
    const db = createAdminTypedClient();
    const { data, count, error } = await db
      .from('marketing_leads')
      .select('id, association_name, unit_count, created_at', { count: 'exact' })
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(`leads signals: ${error.message}`);
    const icp = (data ?? []).filter((l) => l.unit_count !== null && l.unit_count >= ICP_MIN_UNITS && l.unit_count <= ICP_MAX_UNITS).slice(0, 3);
    return {
      count: count ?? 0,
      items: icp.map((l) => ({
        id: `lead-${l.id}`, tone: 'brand', icon: 'mail',
        title: `New lead in ICP: ${l.association_name ?? 'Unnamed association'} (${l.unit_count} units)`,
        meta: 'Compliance checker', href: '/leads?status=new', occurredAt: l.created_at,
      })),
    };
  },
};
```

```ts
// apps/admin/src/lib/server/signals/deletion.ts
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { format } from 'date-fns';
import type { SignalProvider } from './types';

export const deletionSignals: SignalProvider = {
  key: 'deletion',
  async load() {
    const db = createAdminTypedClient();
    const { data, count, error } = await db
      .from('account_deletion_requests')
      .select('id, request_type, cooling_ends_at, created_at', { count: 'exact' })
      .eq('status', 'cooling')
      .order('cooling_ends_at', { ascending: true })
      .limit(5);
    if (error) throw new Error(`deletion signals: ${error.message}`);
    return {
      count: count ?? 0,
      items: (data ?? []).map((r) => ({
        id: `deletion-${r.id}`, tone: 'warning', icon: 'trash',
        title: `${r.request_type === 'community' ? 'Community' : 'Account'} deletion cooling ends ${format(new Date(r.cooling_ends_at), 'MMM d')}`,
        meta: `Requested ${format(new Date(r.created_at), 'MMM d')}`, href: '/deletion-requests', occurredAt: r.created_at,
      })),
    };
  },
};
```

```ts
// apps/admin/src/lib/server/signals/tickets.ts   (same shape for health.ts, billing.ts, onboarding.ts with their own key)
import type { SignalProvider } from './types';
/** Filled by Wave 3 (spec D11). The shell composes this key from day one so the nav badge slot exists. */
export const ticketsSignals: SignalProvider = { key: 'tickets', async load() { return { count: 0, items: [] }; } };
```

```ts
// apps/admin/src/lib/server/shell-signals.ts
import * as Sentry from '@sentry/nextjs';
import type { NavSignalKey } from '@/components/shell/nav-config';
import type { ShellCritical, ShellSignalItem, SignalProvider } from './signals/types';
import { inboxSignals } from './signals/inbox';
import { ticketsSignals } from './signals/tickets';
import { healthSignals } from './signals/health';
import { billingSignals } from './signals/billing';
import { onboardingSignals } from './signals/onboarding';
import { leadsSignals } from './signals/leads';
import { deletionSignals } from './signals/deletion';

export interface ShellSignals {
  counts: Record<NavSignalKey, number>;
  items: ShellSignalItem[];
  critical: ShellCritical | null;
  generatedAt: string;
  /** Providers that threw. The UI shows their sections' error state; the shell never blanks. */
  failed: NavSignalKey[];
}

/** Provider order is the critical-alert priority (spec D20): health, billing, then the rest. */
export const DEFAULT_PROVIDERS: SignalProvider[] = [
  healthSignals, billingSignals, inboxSignals, ticketsSignals, onboardingSignals, leadsSignals, deletionSignals,
];

const ZERO: Record<NavSignalKey, number> = { inbox: 0, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 };

export async function getShellSignals(providers: SignalProvider[] = DEFAULT_PROVIDERS): Promise<ShellSignals> {
  const settled = await Promise.allSettled(providers.map((p) => p.load()));
  const counts = { ...ZERO };
  const items: ShellSignalItem[] = [];
  const failed: NavSignalKey[] = [];
  let critical: ShellCritical | null = null;
  settled.forEach((result, i) => {
    const key = providers[i]!.key;
    if (result.status === 'rejected') {
      failed.push(key);
      Sentry.captureException(result.reason, { tags: { shell_signal: key } });
      return;
    }
    counts[key] = result.value.count;
    items.push(...result.value.items);
    if (!critical && result.value.critical) critical = result.value.critical;
  });
  items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return { counts, items: items.slice(0, 12), critical, generatedAt: new Date().toISOString(), failed };
}
```

```ts
// apps/admin/src/app/api/admin/shell/signals/route.ts
import { NextResponse } from 'next/server';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getShellSignals } from '@/lib/server/shell-signals';

export const dynamic = 'force-dynamic';

export const GET = withAdminErrorHandler(async () => {
  await requirePlatformAdmin();
  const data = await getShellSignals();
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
});
```

- [ ] **Step 4: Run tests** → PASS. Revert check: delete the `Sentry.captureException` line → the second signals test goes red with "expected 1, received 0"; the other two stay green. Restore.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): shell signals composed from per-domain providers + /api/admin/shell/signals"`

### Task 8: `AdminRail` (hover-expand on NavRail) and `AdminDrawer`

**Files:**
- Create: `apps/admin/src/components/shell/AdminRail.tsx`, `AdminDrawer.tsx`, `RailFooter.tsx`, `rail-preferences.ts`
- Move: `apps/admin/__tests__/components/sidebar-signout.test.tsx` → `apps/admin/__tests__/shell/rail-signout.test.tsx` (imports `RailFooter`, assertions unchanged)
- Test: `apps/admin/__tests__/shell/admin-rail.test.tsx`

**Interfaces:**
- `AdminRail` props: `{ activeId: string | null; counts: Record<NavSignalKey, number>; pinned: boolean; onPinnedChange: (v: boolean) => void; user: { email: string; initial: string } }`. Expanded = `pinned || hovered`; hover ignored when `matchMedia('(hover: none)').matches`.
- `AdminDrawer` props: `{ open: boolean; onOpenChange: (v: boolean) => void; activeId; counts; user }` — a left `Sheet` containing `NavRail expanded`.
- `RailFooter` = the existing `handleSignOut` moved verbatim (same `ADMIN_COOKIE_OPTIONS`, same `{ error }` inspection, same failure copy `Sign out failed — you are still signed in. Try again.`) plus the identity row; prop `{ user; expanded: boolean }`.
- `rail-preferences.ts`: `readPinned(): boolean` / `writePinned(v)` on `localStorage['ppro-admin-nav-pinned']`, try/catch wrapped.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/admin/__tests__/shell/admin-rail.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
vi.mock('next/navigation', () => ({ usePathname: () => '/inbox' }));
import { AdminRail } from '@/components/shell/AdminRail';

const counts = { inbox: 7, tickets: 0, health: 4, onboarding: 0, billing: 3, leads: 0, deletion: 2 };
const user = { email: 'ops@getpropertypro.com', initial: 'O' };

describe('AdminRail', () => {
  it('marks the active item and exposes counts as accessible badges', () => {
    render(<AdminRail activeId="inbox" counts={counts} pinned onPinnedChange={() => {}} user={user} />);
    const inbox = screen.getByRole('link', { name: 'Inbox' });
    expect(inbox.getAttribute('aria-current')).toBe('page');
    expect(inbox.textContent).toContain('7');
  });
  it('expands on hover when not pinned and collapses on leave', () => {
    const { container } = render(<AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={() => {}} user={user} />);
    const nav = container.querySelector('nav[aria-label="Main navigation"]')!;
    expect(nav.className).toContain('w-[72px]');
    fireEvent.mouseEnter(container.firstChild as Element);
    expect(nav.className).toContain('w-[260px]');
    fireEvent.mouseLeave(container.firstChild as Element);
    expect(nav.className).toContain('w-[72px]');
  });
  it('pin button toggles and is announced', () => {
    const onPinnedChange = vi.fn();
    render(<AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={onPinnedChange} user={user} />);
    const pin = screen.getByRole('button', { name: /keep navigation open/i });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(onPinnedChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `pnpm --filter @propertypro/admin exec vitest run __tests__/shell/admin-rail.test.tsx`.

- [ ] **Step 3: Implement**

```ts
// apps/admin/src/components/shell/rail-preferences.ts
const KEY = 'ppro-admin-nav-pinned';
export function readPinned(): boolean { try { return localStorage.getItem(KEY) === 'true'; } catch { return false; } }
export function writePinned(v: boolean): void { try { localStorage.setItem(KEY, String(v)); } catch { /* private mode */ } }
```

```tsx
// apps/admin/src/components/shell/AdminRail.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronsLeft, Pin } from 'lucide-react';
import { NavRail, type NavRailSection } from '@propertypro/ui';
import { NAV_GROUPS, type NavSignalKey } from './nav-config';
import { RailFooter } from './RailFooter';

interface AdminRailProps {
  activeId: string | null;
  counts: Record<NavSignalKey, number>;
  pinned: boolean;
  onPinnedChange: (v: boolean) => void;
  user: { email: string; initial: string };
}

function toSections(counts: AdminRailProps['counts']): NavRailSection[] {
  return NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({
      id: i.id, label: i.label, href: i.href, icon: i.icon,
      badge: i.signal ? counts[i.signal] : null,
      badgeVariant: i.tone ?? 'neutral',
    })),
  }));
}

export function AdminRail({ activeId, counts, pinned, onPinnedChange, user }: AdminRailProps) {
  const [hovered, setHovered] = useState(false);
  const canHover = typeof window === 'undefined' ? true : !window.matchMedia('(hover: none)').matches;
  const expanded = pinned || hovered;
  return (
    // The wrapper reserves the collapsed width; the overlay grows over content on hover (spec D8).
    <div
      className={expanded && pinned ? 'relative h-full w-[260px] shrink-0' : 'relative h-full w-[72px] shrink-0'}
      onMouseEnter={() => canHover && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={['absolute inset-y-0 left-0 z-40', expanded && !pinned ? 'shadow-e3' : ''].join(' ')}>
        <NavRail
          sections={toSections(counts)}
          activeView={activeId ?? ''}
          onViewChange={() => {}}
          expanded={expanded}
          renderLink={({ href, children, ...rest }) => <Link href={href} {...rest}>{children}</Link>}
          header={
            <div className="flex h-[60px] items-center gap-3 border-b border-nav-divider px-4 whitespace-nowrap">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-interactive font-display text-base font-semibold text-content-inverse">P</span>
              <span className={['text-sm font-semibold transition-opacity', expanded ? 'opacity-100' : 'opacity-0'].join(' ')}>PropertyPro</span>
              <button
                type="button"
                onClick={() => { onPinnedChange(!pinned); setHovered(false); }}
                aria-pressed={pinned}
                aria-label={pinned ? 'Collapse navigation' : 'Keep navigation open'}
                className={['ml-auto flex size-7 items-center justify-center rounded-sm text-content-tertiary hover:text-content transition-opacity', expanded ? 'opacity-100' : 'opacity-0', pinned ? 'bg-surface-muted' : ''].join(' ')}
              >
                {pinned ? <ChevronsLeft size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
              </button>
            </div>
          }
          footer={<RailFooter user={user} expanded={expanded} />}
        />
      </div>
    </div>
  );
}
```

`RailFooter.tsx`: move `handleSignOut` and the `signingOut`/`signOutFailed` state from `Sidebar.tsx` **unchanged**, render `<span class="size-8 rounded-full bg-surface-muted …">{user.initial}</span>`, the email (truncated, hidden when collapsed via opacity), the role line `Super admin`, and the sign-out button with `aria-label="Sign out"`; keep the `role="alert"` failure paragraph.

`AdminDrawer.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { NavRail, Sheet, SheetContent, SheetTitle } from '@propertypro/ui';
// … same toSections (import it: export it from AdminRail.tsx)
export function AdminDrawer({ open, onOpenChange, activeId, counts, user }: AdminDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(300px,84vw)] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <NavRail sections={toSections(counts)} activeView={activeId ?? ''} onViewChange={() => onOpenChange(false)} expanded
          renderLink={({ href, children, ...rest }) => <Link href={href} {...rest}>{children}</Link>}
          footer={<RailFooter user={user} expanded />} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run the rail test and the moved sign-out test** → PASS. Revert check for the sign-out move: reintroduce `window.location.href = '/auth/login'` before the `{ error }` check → "does NOT navigate when supabase returns an error" goes red; the success case stays green. Restore.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): AdminRail (hover/pin on NavRail), AdminDrawer, RailFooter with the pinned sign-out semantics"`

### Task 9: `AdminTopBar`, `NotificationTray`, `CriticalBanner`, `OfflineBanner`

**Files:**
- Create: `apps/admin/src/components/shell/{AdminTopBar,NotificationTray,CriticalBanner,OfflineBanner}.tsx`, `apps/admin/src/components/shell/signal-icons.ts`
- Test: `apps/admin/__tests__/shell/top-bar.test.tsx`, `apps/admin/__tests__/shell/critical-banner.test.tsx`

**Interfaces:**
- `AdminTopBar` props: `{ mobile: boolean; title: string; showBack: boolean; onBack: () => void; onOpenDrawer: () => void; onOpenSearch: () => void; signals: ShellSignals; readAt: string | null; onMarkAllRead: () => void }`.
- `NotificationTray` props: `{ items: ShellSignalItem[]; unread: number; open: boolean; onOpenChange; onMarkAllRead }` — trigger `aria-expanded`, panel `role="region" aria-label="Notifications"`, `Escape` closes, `Mark all read` button.
- `CriticalBanner` props: `{ critical: ShellCritical | null; mobile: boolean }` — dismissed fingerprints in `sessionStorage['ppro-admin-critical-dismissed']` (JSON array); `View` links to `critical.href`.
- `OfflineBanner` props: `{ cachedAt?: string | null }` — renders only when `navigator.onLine === false` (listens to `online`/`offline`). Wave 4 supplies `cachedAt`.
- `signal-icons.ts`: `SIGNAL_ICONS: Record<SignalIcon, LucideIcon>`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/admin/__tests__/shell/critical-banner.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CriticalBanner } from '@/components/shell/CriticalBanner';

const critical = { fingerprint: 'stripe-webhook:2026-09-08T06', text: 'Stripe webhook handler failing since 06:40 — 14 errors/hr, 3 invoices unsynced.', shortText: 'Stripe webhook failing · 14 errors/hr', href: '/health' };

describe('CriticalBanner', () => {
  beforeEach(() => sessionStorage.clear());
  it('renders the alert with a View link and dismisses per fingerprint', () => {
    const { rerender } = render(<CriticalBanner critical={critical} mobile={false} />);
    expect(screen.getByRole('alert').textContent).toContain('14 errors/hr');
    expect(screen.getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/health');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<CriticalBanner critical={{ ...critical, fingerprint: 'other' }} mobile={false} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('uses the short text on mobile', () => {
    render(<CriticalBanner critical={critical} mobile />);
    expect(screen.getByRole('alert').textContent).toContain('Stripe webhook failing');
  });
});
```

```tsx
// apps/admin/__tests__/shell/top-bar.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
import { AdminTopBar } from '@/components/shell/AdminTopBar';

const signals = { counts: { inbox: 1, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 }, items: [
  { id: 'a', tone: 'info' as const, icon: 'inbox' as const, title: 'New reply from Denise', meta: 'support@', href: '/inbox/1', occurredAt: '2026-09-08T09:14:00Z' },
], critical: null, generatedAt: 'x', failed: [] };

describe('AdminTopBar', () => {
  it('opens the tray with an accessible count and marks all read', () => {
    const onMarkAllRead = vi.fn();
    render(<AdminTopBar mobile={false} title="Inbox" showBack={false} onBack={() => {}} onOpenDrawer={() => {}} onOpenSearch={() => {}} signals={signals} readAt={null} onMarkAllRead={onMarkAllRead} />);
    const bell = screen.getByRole('button', { name: /notifications, 1 unread/i });
    expect(bell.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(bell);
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /new reply from denise/i }).getAttribute('href')).toBe('/inbox/1');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(onMarkAllRead).toHaveBeenCalled();
  });
  it('shows the menu and back buttons on mobile', () => {
    const onBack = vi.fn();
    render(<AdminTopBar mobile title="Thread" showBack onBack={onBack} onOpenDrawer={() => {}} onOpenSearch={() => {}} signals={signals} readAt="2026-09-09T00:00:00Z" onMarkAllRead={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /notifications, 0 unread/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement**

Unread rule (single function, exported from `NotificationTray.tsx` for the test and for Wave 4's push dedupe): `export function countUnread(items, readAt) { return readAt ? items.filter((i) => i.occurredAt > readAt).length : items.length; }`.

`AdminTopBar.tsx` layout, matching the design's header: `<header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-edge bg-surface-card px-4 md:px-8">`; mobile: `Open menu` button (`Menu` icon, `size-11`), optional `Back` button (`ArrowLeft`), the title `<span className="truncate font-semibold">`; desktop: the search trigger `<button onClick={onOpenSearch} className="flex h-[38px] w-[min(420px,100%)] items-center gap-2 rounded-sm border border-edge bg-surface-page px-3 text-sm text-content-tertiary hover:border-edge-strong">` with `<Search size={16}/>`, the placeholder text `Search clients, threads, tickets, users…` and `<kbd className="rounded border border-edge bg-surface-card px-1.5 font-mono text-xs">⌘K</kbd>`; mobile: an icon-only `Search` button; then `<NotificationTray …/>`.

`NotificationTray.tsx`: trigger `<button aria-label={`Notifications, ${unread} unread`} aria-expanded={open} aria-controls="admin-notification-tray">` with `Bell` and, when `unread > 0`, `<span aria-hidden className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-status-danger px-1 text-xs font-bold text-content-inverse">{unread}</span>`. Panel `<div id="admin-notification-tray" role="region" aria-label="Notifications" className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-md border border-edge bg-surface-card shadow-e3">` with header row (`Notifications` + `Mark all read` button), list of `<Link>` rows (`SIGNAL_ICONS[item.icon]` in a `size-8 rounded-sm bg-status-{tone}-subtle text-status-{tone}` — write the tone→class map as a literal `Record<SignalTone, string>` so Tailwind sees every class; never template strings), `EmptyState` when empty. `useEffect` for `Escape` and outside-click.

`CriticalBanner.tsx`: `role="alert"`, `bg-status-danger text-content-inverse`, `AlertTriangle` icon, text (`mobile ? shortText : text`), `View` `<Link>` styled `border border-white/50 bg-white/20`, `Dismiss` icon button (`X`). Dismissed set read once on mount (`useState(() => …)`), written on dismiss.

`OfflineBanner.tsx`: `useSyncExternalStore` over `online`/`offline` events; when offline render `<div role="status" className="flex items-center gap-2 bg-surface-inverse-subtle px-4 py-2 text-sm text-content-inverse md:px-8"><CloudOff size={16}/> You’re offline{cachedAt ? ` — showing data cached ${formatDistanceToNow(new Date(cachedAt))} ago` : ''}. Actions are unavailable until you reconnect.</div>`.

- [ ] **Step 4: Run tests** → PASS. Revert check: remove the `sessionStorage` write in `CriticalBanner` → the dismiss-per-fingerprint test still passes on the first assertion but the rerender assertion holds; instead remove the fingerprint comparison (`dismissed.includes(critical.fingerprint)` → `dismissed.length > 0`) → the rerender assertion goes red ("Unable to find role alert"). Restore.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): top bar, notification tray, critical and offline banners"`

### Task 10: `AdminCommandPalette` and `GET /api/admin/search`

**Files:**
- Create: `apps/admin/src/components/shell/AdminCommandPalette.tsx`, `apps/admin/src/lib/utils/search-shortcut.ts`, `apps/admin/src/lib/server/search.ts`, `apps/admin/src/lib/server/search/{communities,threads,users}.ts`, `apps/admin/src/app/api/admin/search/route.ts`
- Test: `apps/admin/__tests__/shell/search.test.ts`, `apps/admin/__tests__/shell/search-route.test.ts`, `apps/admin/__tests__/shell/command-palette.test.tsx`

**Interfaces:**
```ts
// lib/server/search.ts
export interface SearchHit { id: string; label: string; meta: string; href: string; icon: SignalIcon }
export interface SearchGroup { key: 'pages' | 'clients' | 'threads' | 'tickets' | 'people'; label: string; hits: SearchHit[] }
export interface Searcher { key: SearchGroup['key']; label: string; search(q: string, limit: number): Promise<SearchHit[]> }
export const SEARCHERS: Searcher[];   // pages (static, from NAV_PAGES), communities, threads, users. Wave 3 appends tickets.
export async function searchAdmin(q: string, searchers?: Searcher[]): Promise<SearchGroup[]>;  // q trimmed, min 2 chars else []
// route: GET /api/admin/search?q= → { data: SearchGroup[] } ; 400 on q > 80 chars
```
- `search-shortcut.ts`: copy of web's `isSearchShortcut` (5 lines; ponytail rung 6 — copying beats a package export).
- Palette props: `{ open: boolean; onOpenChange: (v: boolean) => void }`; uses `CommandDialog`; static pages appear immediately; server groups load after 150 ms debounce via `fetch('/api/admin/search?q=')`; `router.push(hit.href)` on select.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/shell/search.test.ts
import { describe, expect, it } from 'vitest';
import { searchAdmin, type Searcher } from '@/lib/server/search';

const stub = (key: Searcher['key'], hits: string[]): Searcher => ({
  key, label: key,
  search: async (q) => hits.filter((h) => h.toLowerCase().includes(q.toLowerCase())).map((h) => ({ id: h, label: h, meta: '', href: `/${key}/${h}`, icon: 'building' as const })),
});

describe('searchAdmin', () => {
  it('returns nothing below two characters', async () => {
    expect(await searchAdmin('s', [stub('clients', ['Sunset'])])).toEqual([]);
  });
  it('groups hits and omits empty groups', async () => {
    const groups = await searchAdmin('sun', [stub('clients', ['Sunset Condos']), stub('people', ['Nobody'])]);
    expect(groups.map((g) => g.key)).toEqual(['clients']);
    expect(groups[0]!.hits[0]!.href).toBe('/clients/Sunset Condos');
  });
  it('a failing searcher drops its group only', async () => {
    const boom: Searcher = { key: 'threads', label: 'Threads', search: async () => { throw new Error('x'); } };
    const groups = await searchAdmin('sun', [boom, stub('clients', ['Sunset'])]);
    expect(groups.map((g) => g.key)).toEqual(['clients']);
  });
});
```

```ts
// apps/admin/__tests__/shell/search-route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: async () => ({ id: 'u', email: 'e', role: 'super_admin' }) }));
const searchAdmin = vi.fn(async () => []);
vi.mock('@/lib/server/search', () => ({ searchAdmin: (q: string) => searchAdmin(q) }));
import { GET } from '@/app/api/admin/search/route';

describe('GET /api/admin/search', () => {
  it('400s an over-long query without searching', async () => {
    const res = await GET(new NextRequest('http://a/api/admin/search?q=' + 'x'.repeat(81)));
    expect(res.status).toBe(400);
    expect(searchAdmin).not.toHaveBeenCalled();
  });
  it('trims and forwards the query', async () => {
    const res = await GET(new NextRequest('http://a/api/admin/search?q=%20sunset%20'));
    expect(res.status).toBe(200);
    expect(searchAdmin).toHaveBeenCalledWith('sunset');
  });
});
```

```tsx
// apps/admin/__tests__/shell/command-palette.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { AdminCommandPalette } from '@/components/shell/AdminCommandPalette';

describe('AdminCommandPalette', () => {
  it('lists pages immediately and merges server hits after typing', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ key: 'clients', label: 'Clients', hits: [{ id: '1', label: 'Sunset Condos', meta: 'Condo §718', href: '/clients/1', icon: 'building' }] }] }))) as any;
    render(<AdminCommandPalette open onOpenChange={() => {}} />);
    expect(screen.getByRole('option', { name: /deletion requests/i })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sun' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /sunset condos/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /sunset condos/i }));
    expect(push).toHaveBeenCalledWith('/clients/1');
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement**

```ts
// apps/admin/src/lib/server/search/communities.ts
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { Searcher } from '../search';
import { COMMUNITY_TYPE_LABELS } from '@/lib/constants/community-labels';

export const communitySearcher: Searcher = {
  key: 'clients', label: 'Clients',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // PostgREST `or` filter; `%` is the LIKE wildcard, the term is escaped of `,` and `%` below.
    const term = q.replace(/[%,()]/g, ' ').trim();
    const { data, error } = await db.from('communities')
      .select('id, name, slug, community_type')
      .is('deleted_at', null)
      .or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
      .limit(limit);
    if (error) throw new Error(`community search: ${error.message}`);
    return (data ?? []).map((c) => ({ id: `community-${c.id}`, label: c.name, meta: COMMUNITY_TYPE_LABELS[c.community_type]?.label ?? c.community_type, href: `/clients/${c.id}`, icon: 'building' as const }));
  },
};
```

`threads.ts` mirrors it over `support_inbox_threads` (`subject.ilike`, `participant_email.ilike`, `participant_name.ilike`; meta `${status} · ${SUPPORT_MAILBOX_LABELS[mailbox]}`; href `/inbox/${id}`; icon `inbox`). `users.ts` over `users` (`full_name.ilike`, `email.ilike`; meta = email; href `/clients?q=${encodeURIComponent(email)}`; icon `user`) — the `users` table is not tenant-scoped and is readable by service role; it exposes only name and email to a platform admin who can already see both.

```ts
// apps/admin/src/lib/server/search.ts
import { NAV_PAGES } from '@/components/shell/nav-config';
import type { SignalIcon } from './signals/types';
import { communitySearcher } from './search/communities';
import { threadSearcher } from './search/threads';
import { userSearcher } from './search/users';

export interface SearchHit { id: string; label: string; meta: string; href: string; icon: SignalIcon }
export interface SearchGroup { key: 'pages' | 'clients' | 'threads' | 'tickets' | 'people'; label: string; hits: SearchHit[] }
export interface Searcher { key: SearchGroup['key']; label: string; search(q: string, limit: number): Promise<SearchHit[]> }

const pageSearcher: Searcher = {
  key: 'pages', label: 'Pages',
  async search(q, limit) {
    return NAV_PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).slice(0, limit)
      .map((p) => ({ id: `page-${p.id}`, label: p.label, meta: 'Page', href: p.href, icon: 'activity' as const }));
  },
};

/** Wave 3 (tickets) appends `ticketSearcher` here — one import + one array entry. */
export const SEARCHERS: Searcher[] = [pageSearcher, communitySearcher, threadSearcher, userSearcher];
const PER_GROUP = 5;
export const MAX_QUERY_LENGTH = 80;

export async function searchAdmin(raw: string, searchers: Searcher[] = SEARCHERS): Promise<SearchGroup[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const settled = await Promise.allSettled(searchers.map((s) => s.search(q, PER_GROUP)));
  return searchers.flatMap((s, i) => {
    const r = settled[i]!;
    if (r.status === 'rejected' || r.value.length === 0) return [];
    return [{ key: s.key, label: s.label, hits: r.value }];
  });
}
```

Route: `parseAdminQuery(url.searchParams.get('q') ?? '', z.string().max(MAX_QUERY_LENGTH), 'q')`, then `NextResponse.json({ data: await searchAdmin(q) }, { headers: { 'Cache-Control': 'private, no-store' } })`.

Palette: `CommandDialog` (lifted) with `<CommandInput placeholder="Search clients, threads, tickets, users…" value={q} onValueChange={setQ} />`, a `CommandGroup heading="Pages"` from `NAV_PAGES` filtered client-side, then one `CommandGroup` per fetched group; `useEffect` debounce 150 ms with an `AbortController`; `onSelect={() => { onOpenChange(false); router.push(hit.href); }}`. Set `shouldFilter={false}` on `Command` so server groups are not re-filtered by cmdk. Empty: `<CommandEmpty>No results for “{q}”.</CommandEmpty>`.

- [ ] **Step 4: Run all three tests** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): ⌘K command palette over pages, clients, threads and people"`

### Task 11: `AdminShell`, the `(console)` layout, page moves, deletion of the old shell

**Files:**
- Create: `apps/admin/src/components/shell/AdminShell.tsx`, `apps/admin/src/app/(console)/layout.tsx`
- Move (`git mv`): `apps/admin/src/app/{dashboard,clients,communities,inbox,leads,deletion-requests,demo,site-templates,settings}` → `apps/admin/src/app/(console)/…`
- Modify: every moved `page.tsx` and `loading.tsx` (remove `AdminLayout` wrapper and `coolingCount` plumbing; replace the old `<div className="p-6">` + `<h1>` with `<PageBody>` + `<AdminPageHeader>`), `apps/admin/src/components/loading/AdminPageLoading.tsx`, `apps/admin/src/app/page.tsx` (root redirect unchanged — verify it points at `/dashboard`), `apps/admin/__tests__/clients/client-workspace-page.test.ts` (drop the `AdminLayout` mock)
- Delete: `apps/admin/src/components/AdminLayout.tsx`, `apps/admin/src/components/Sidebar.tsx`, `apps/admin/__tests__/components/sidebar-signout.test.tsx` (moved in Task 8)
- Test: `apps/admin/__tests__/shell/admin-shell.test.tsx`, `apps/admin/__tests__/shell/no-admin-layout.test.ts`

**Interfaces:**
- `AdminShell` props: `{ user: { email: string; initial: string }; initialSignals: ShellSignals; children }`. Owns: `pinned` (from `readPinned()` after mount), `drawerOpen`, `searchOpen`, `mobile` (`matchMedia('(max-width: 899px)')`), `signals` (polls `/api/admin/shell/signals` every 60 s while `document.visibilityState === 'visible'`), `readAt` (Wave 4 replaces the local state with the preferences API), `isSearchShortcut` keydown → open palette, `Escape` closes drawer/tray/palette.
- Renders: `[AdminRail | nothing on mobile] + column( AdminTopBar, OfflineBanner, CriticalBanner, <main id="main-content" className="flex-1 overflow-y-auto"> <div className="mx-auto max-w-7xl px-4 py-6 md:px-8"> children )` + `AdminDrawer` + `AdminCommandPalette`.
- `showBack` = mobile and pathname matches `/clients/\d+`, `/inbox/\d+`, `/tickets/\d+`; `onBack` = `router.back()`.
- Layout:
```tsx
// apps/admin/src/app/(console)/layout.tsx
import { AdminShell } from '@/components/shell/AdminShell';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getShellSignals } from '@/lib/server/shell-signals';
export const dynamic = 'force-dynamic';
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPageSession();
  const initialSignals = await getShellSignals();
  const initial = (session.email[0] ?? 'A').toUpperCase();
  return <AdminShell user={{ email: session.email, initial }} initialSignals={initialSignals}>{children}</AdminShell>;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/shell/no-admin-layout.test.ts
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
describe('old shell is gone', () => {
  it('nothing imports AdminLayout or Sidebar any more', () => {
    const out = execSync("grep -rlE \"components/(AdminLayout|Sidebar)'\" src __tests__ || true", { cwd: process.cwd(), encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });
  it('every authenticated page lives under app/(console)', () => {
    const out = execSync("ls src/app", { encoding: 'utf8' });
    for (const dir of ['dashboard', 'clients', 'inbox', 'leads', 'deletion-requests', 'demo', 'site-templates', 'settings', 'communities']) {
      expect(out, `${dir} must be inside (console)`).not.toMatch(new RegExp(`^${dir}$`, 'm'));
    }
  });
});
```

```tsx
// apps/admin/__tests__/shell/admin-shell.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
import { AdminShell } from '@/components/shell/AdminShell';

const signals = { counts: { inbox: 0, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 }, items: [], critical: null, generatedAt: 'x', failed: [] };

describe('AdminShell', () => {
  it('renders the rail, the single main landmark, and opens the palette on ⌘K', () => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as any;
    render(<AdminShell user={{ email: 'ops@getpropertypro.com', initial: 'O' }} initialSignals={signals}><p>content</p></AdminShell>);
    expect(document.querySelectorAll('main#main-content')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: 'k', metaKey: true }); });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement the shell, the layout, then move pages**

`AdminShell.tsx` per the interface; the poller:

```ts
useEffect(() => {
  const tick = async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await fetch('/api/admin/shell/signals', { cache: 'no-store' });
      if (res.ok) setSignals((await res.json()).data as ShellSignals);
    } catch { /* offline — keep the last good signals */ }
  };
  const id = window.setInterval(tick, 60_000);
  return () => window.clearInterval(id);
}, []);
```

Page moves:

```bash
mkdir -p 'apps/admin/src/app/(console)'
for d in dashboard clients communities inbox leads deletion-requests demo site-templates settings; do git mv "apps/admin/src/app/$d" "apps/admin/src/app/(console)/$d"; done
grep -rln "AdminLayout" apps/admin/src   # every hit is a page/loading file to edit
```

In each page: delete the `AdminLayout` import and wrapper; delete `getCoolingDeletionRequestCount` calls whose only consumer was the sidebar (dashboard keeps `stats.lifecycle.pendingDeletions` for its own card); wrap content in `<PageBody>` (from `@propertypro/ui`) with `<AdminPageHeader title=… description=… />` replacing the old `<h1>`/`<p>` pair. Do **not** restyle page bodies here — Wave 2 owns that. `AdminPageLoading` returns only the `<section aria-busy>` skeleton. `client-workspace-page.test.ts`: remove the `AdminLayout` mock block.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/shell && pnpm test apps/admin && pnpm --filter @propertypro/admin typecheck && pnpm --filter @propertypro/admin build && node scripts/verify-admin-semantic-css.cjs && pnpm guard:design-tokens`
Expected: all PASS; `guard:design-tokens` reports the baseline **shrinking** by `apps/admin/src/components/Sidebar.tsx` (15 raw-palette) — remove that entry from `scripts/design-token-baseline.json` in this commit.

Then start the dev server (`preview_start` name `admin`, or `pnpm --filter @propertypro/admin dev`), log in via `/dev/agent-login?as=platform_admin`, and screenshot `/dashboard` at desktop and at 390 px: rail collapsed → hover expands; drawer opens from the menu button; ⌘K opens the palette.

- [ ] **Step 5: Commit** — `git commit -m "feat(admin): (console) route-group layout renders AdminShell; delete AdminLayout/Sidebar"`

### Task 12: E2E `admin-shell.spec.ts` in the CI allowlist

**Files:**
- Create: `apps/web/e2e/admin-shell.spec.ts`
- Modify: `apps/web/e2e/ci-safe-specs.json` (add the spec, `expectedTestCount` 29 → 32)

- [ ] **Step 1: Write the spec**

```ts
// apps/web/e2e/admin-shell.spec.ts
import { expect, test } from '@playwright/test';
import { loginAsPlatformAdmin } from './helpers/dev-login';
import { clickWhenHydrated } from './helpers/hydration';

const ADMIN = 'http://localhost:3001';

test.describe('admin shell', () => {
  test.beforeEach(async ({ page }) => { await loginAsPlatformAdmin(page); });

  test('rail navigates between sections and marks the current one', async ({ page }) => {
    await page.goto(`${ADMIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await clickWhenHydrated(nav.getByRole('link', { name: 'Inbox' }));
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(nav.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
  });

  test('⌘K finds a seeded community', async ({ page }) => {
    await page.goto(`${ADMIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').fill('Sunset Condos');
    await clickWhenHydrated(dialog.getByRole('option', { name: /Sunset Condos/ }));
    await expect(page).toHaveURL(/\/clients\/\d+$/);
  });

  test('notification tray opens with a labelled region', async ({ page }) => {
    await page.goto(`${ADMIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    await clickWhenHydrated(page.getByRole('button', { name: /^Notifications, \d+ unread$/ }));
    await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it locally** against the full stack (`scripts/with-env-local-demo-db.sh`, web on :3000 + admin on :3001 per `.github/workflows/e2e.yml`): `pnpm --filter @propertypro/web exec playwright test e2e/admin-shell.spec.ts` → 3 passed. Confirm `support-access.spec.ts` still passes in the same run.
- [ ] **Step 3: Add to `ci-safe-specs.json`** (`"admin-shell.spec.ts"` in `specs`, `expectedTestCount: 32`) and note it in the `$comment`.
- [ ] **Step 4: Commit** — `git commit -m "test(e2e): admin-shell spec joins the CI allowlist"`

### Task 13: Wave 1 gate and PR

- [ ] `pnpm lint && pnpm typecheck && pnpm test apps/admin && pnpm test packages/ui && pnpm --filter @propertypro/admin build && node scripts/verify-admin-semantic-css.cjs`
- [ ] Security review + code review; fix real defects.
- [ ] PR "W1 shell: (console) layout, hover rail, ⌘K, tray, signals". Merge before Wave 2.

---

## Wave 2 — Restyle the existing screens (four parallel slices, disjoint files)

Each slice is its own worktree branch cut from the Wave 1 merge. All four use the same vocabulary: `PageBody` as the content root, `AdminPageHeader` for the title, `Card`/`CardHeader`/`CardContent` for panels, `KpiCard`, `QuickFilterTabs`, `Badge` (status) from `@propertypro/ui`, `AlertBanner`, `EmptyState`, `Skeleton`. Row lists follow the design's list-card pattern: `<div className="overflow-hidden rounded-md border border-edge bg-surface-card">` with rows `flex items-center gap-3 border-b border-edge-subtle px-4 py-3 min-h-14 hover:bg-surface-hover`.

### Task 14 (slice 2a): Dashboard — KPI grid with detail modal, Needs-attention queue, Revenue and Subscriptions cards

**Files:**
- Modify: `apps/admin/src/lib/server/dashboard.ts`, `apps/admin/src/app/(console)/dashboard/page.tsx`, `apps/admin/src/components/dashboard/PlatformDashboard.tsx`
- Create: `apps/admin/src/components/dashboard/{KpiGrid,KpiDetailDialog,AttentionQueue,RevenueCard,SubscriptionsCard,MiniBars}.tsx`, `apps/admin/src/lib/server/dashboard-series.ts`
- Test: `apps/admin/__tests__/dashboard/dashboard-series.test.ts`, `apps/admin/__tests__/dashboard/kpi-grid.test.tsx` (+ keep `platform-dashboard.test.ts` green)

**Interfaces:**
```ts
// lib/server/dashboard-series.ts
export interface MonthPoint { month: string /* 'YYYY-MM' */; value: number }
export interface DashboardSeries { mrr: MonthPoint[]; pastDue: MonthPoint[]; communities: MonthPoint[]; members: MonthPoint[] }
export function bucketByMonth(rows: { at: string; value: number }[], months = 12, now?: Date): MonthPoint[]; // last N calendar months, last value per month (snapshots) — exported for tests
export function cumulativeByMonth(createdAts: string[], months = 12, now?: Date): MonthPoint[];             // running count (communities/members)
export async function getDashboardSeries(): Promise<DashboardSeries>;  // revenue_snapshots (mrr_cents/100, past_due_subscriptions), communities.created_at, user_roles.created_at
// dashboard.ts additions
export interface PlatformDashboardStats { …existing…; deltas: { communities30d: number; members30d: number } }
```
- `KpiGrid` props `{ stats: PlatformDashboardStats; series: DashboardSeries; signals: ShellSignals }` — cards (spec D25): Communities (delta from `deltas.communities30d`, series `communities`), Members (delta, series), MRR (delta from latest snapshot `mrr_delta_pct`, series `mrr`), Avg compliance (value only), Active trials (value only), Past due (count from `billing.past_due`, series `pastDue`, `invertTrend`), Open threads (`signals.counts.inbox`, value only), Failed jobs (`signals.counts.health`, value only). Each card is `KpiCard` with `onClick` opening `KpiDetailDialog`.
- `KpiDetailDialog` (lifted `Dialog`): title, value, delta, description, `MiniBars` over the series when present, breakdown rows (`billing` counts by status for MRR/past due; compliance distribution buckets ≥90/80–89/70–79/<70 — needs `compliance.distribution` added to `buildComplianceSummary`), CTA `<Link>` to the section.
- `AttentionQueue` renders `signals.items` grouped by `NavSignalKey` with the count per key from `signals.counts` and the design's row layout (icon, count, label, meta, badge, chevron).
- `RevenueCard`: latest snapshot MRR, `mrr_delta_pct`, `MiniBars` (12 months), ARR = MRR×12, net new 30d = MRR − MRR 30 days ago. `SubscriptionsCard`: stacked bar from `billing` counts, rows link to `/billing?status=`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/dashboard/dashboard-series.test.ts
import { describe, expect, it } from 'vitest';
import { bucketByMonth, cumulativeByMonth } from '@/lib/server/dashboard-series';

const now = new Date('2026-09-08T12:00:00Z');
describe('dashboard series', () => {
  it('bucketByMonth keeps the last value per month and fills 12 months', () => {
    const pts = bucketByMonth([{ at: '2026-08-01T02:00:00Z', value: 17200 }, { at: '2026-08-30T02:00:00Z', value: 17600 }, { at: '2026-09-07T02:00:00Z', value: 18640 }], 12, now);
    expect(pts).toHaveLength(12);
    expect(pts.at(-1)).toEqual({ month: '2026-09', value: 18640 });
    expect(pts.at(-2)).toEqual({ month: '2026-08', value: 17600 });
    expect(pts[0]!.month).toBe('2025-10');
    expect(pts[0]!.value).toBe(0);
  });
  it('cumulativeByMonth is a running count', () => {
    const pts = cumulativeByMonth(['2026-07-15T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-20T00:00:00Z'], 3, now);
    expect(pts.map((p) => p.value)).toEqual([1, 3, 3]);
  });
});
```

```tsx
// apps/admin/__tests__/dashboard/kpi-grid.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { platformDashboardTestUtils } from '@/lib/server/dashboard';

const stats = {
  overview: { communities: 46, demos: 7, members: 3912, documents: 900 },
  billing: platformDashboardTestUtils.buildBillingSummary([{ subscription_status: 'active' }, { subscription_status: 'past_due' }]),
  compliance: { averageScore: 84, atRiskCount: 5, totalTracked: 41, distribution: { top: 14, high: 12, mid: 10, low: 5 } },
  lifecycle: { activeFreeAccess: 0, pendingDeletions: 2 },
  deltas: { communities30d: 3, members30d: 8 },
};
const series = { mrr: [{ month: '2026-09', value: 18640 }], pastDue: [], communities: [], members: [] };
const signals = { counts: { inbox: 7, tickets: 0, health: 4, onboarding: 0, billing: 1, leads: 0, deletion: 2 }, items: [], critical: null, generatedAt: 'x', failed: [] };

describe('KpiGrid', () => {
  it('renders eight cards and opens the detail dialog with a CTA', () => {
    render(<KpiGrid stats={stats as any} series={series} signals={signals} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: /open threads/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('7');
    expect(screen.getByRole('link', { name: /open inbox/i }).getAttribute('href')).toBe('/inbox');
  });
  it('shows no delta where there is no history', () => {
    render(<KpiGrid stats={stats as any} series={series} signals={signals} />);
    expect(screen.getByRole('button', { name: /avg\. compliance/i }).textContent).not.toMatch(/vs\./);
  });
});
```

- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement** `dashboard-series.ts` (pure functions above + one Supabase read each for `revenue_snapshots` ordered by `computed_at` over the last 13 months, `communities.created_at` (non-demo, not deleted), `user_roles.created_at`), extend `dashboard.ts` with `deltas` (count of rows with `created_at >= now-30d`) and `compliance.distribution`, build the components, and rewrite `PlatformDashboard` to: `<AdminPageHeader title="Overview" description={`${greeting}, ${firstName} · ${today} · ${stats.overview.communities} communities`} actions={<><Button asChild variant="outline" size="sm"><Link href="/demo/new">New demo</Link></Button><Button asChild size="sm"><Link href="/tickets/new">New ticket</Link></Button></>} />` then `<KpiGrid/>`, then the two-column grid (`AttentionQueue` | `RevenueCard` + `SubscriptionsCard`). The page passes `signals` from `getShellSignals()` (a second call is fine; it is per-request cached by nothing today — wrap `getShellSignals` in React `cache()` in `shell-signals.ts` so layout and page share one load).
- [ ] **Step 4: Run** `pnpm test apps/admin/__tests__/dashboard` and the existing `platform-dashboard.test.ts` → PASS. Screenshot `/dashboard` at desktop and 390 px.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): dashboard overview — KPI grid with detail dialogs, attention queue, revenue and subscriptions cards"`

### Task 15 (slice 2a): Clients grid with quick filters and the dispute banner; Rootless becomes a redirect

**Files:**
- Modify: `apps/admin/src/app/(console)/clients/page.tsx`, `apps/admin/src/components/clients/ClientPortfolio.tsx`, `apps/admin/src/app/(console)/communities/rootless/page.tsx`
- Create: `apps/admin/src/components/clients/{ClientCard,DisputeBanner}.tsx`, `apps/admin/src/lib/server/clients.ts`
- Test: `apps/admin/__tests__/clients/portfolio.test.ts` (extend), `apps/admin/__tests__/clients/client-filters.test.ts`

**Interfaces:**
```ts
// lib/server/clients.ts
export interface ClientRow { id; name; slug; community_type; city; state; subscription_status; subscription_plan; created_at; complianceScore: number | null; memberCount: number; rootless: boolean; disputeOpen: boolean }
export interface OpenDispute { id; communityId; communityName; claimedUserId; disputedByUserId; createdAt }
export async function getClientsData(): Promise<{ clients: ClientRow[]; disputes: OpenDispute[]; counts: { all; pastDue; atRisk; trialing; rootless } }>
// components/clients/ClientPortfolio.tsx
export type ClientFilter = 'all' | 'past_due' | 'at_risk' | 'trialing' | 'rootless';
export function applyClientFilter(rows: ClientRow[], filter: ClientFilter, search: string, type: string): ClientRow[]  // pure, exported for tests
```
- `getClientsData` merges today's `clients/page.tsx` query, the compliance score map, `user_roles` counts per community (one grouped query via `select('community_id', { count: 'exact' })` per id is N+1 — instead select `community_id` for all non-demo ids and count in memory, capped by `COMMUNITY_LIST_LIMIT`), `findRootlessCommunities()` ids, and `root_claim_disputes` status `open` (moved verbatim from the rootless page's `fetchOpenDisputes`).
- The page reads `?filter=` and `?q=` (both optional) so the dashboard queue and search deep-link into a filtered grid. `ClientPortfolio` keeps `useState` search/type/sort but adds `QuickFilterTabs` with the five design tabs and counts; stale-demo props and UI are **removed** (moved to Demos in Task 20).
- `DisputeBanner` renders one `AlertBanner status="warning" variant="subtle"` per open dispute with the existing `ReassignRootControl` as `action`; shown when filter is `all` or `rootless`.
- Rootless page becomes:
```tsx
import { redirect } from 'next/navigation';
/** Folded into Clients (spec D9): the rootless filter and the dispute banner live there now. */
export default function RootlessRedirect() { redirect('/clients?filter=rootless'); }
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/clients/client-filters.test.ts
import { describe, expect, it } from 'vitest';
import { applyClientFilter } from '@/components/clients/ClientPortfolio';

const row = (over: Partial<any>) => ({ id: 1, name: 'A', slug: 'a', community_type: 'condo_718', city: null, state: null, subscription_status: 'active', subscription_plan: 'professional', created_at: '2026-01-01', complianceScore: 90, memberCount: 3, rootless: false, disputeOpen: false, ...over });

describe('applyClientFilter', () => {
  const rows = [row({ id: 1, name: 'Bayview', subscription_status: 'past_due' }), row({ id: 2, name: 'Marina', complianceScore: 55 }), row({ id: 3, name: 'Pelican', subscription_status: 'trialing', rootless: true }), row({ id: 4, name: 'Sunset Ridge', community_type: 'apartment', complianceScore: null })];
  it('past_due / at_risk / trialing / rootless select the right rows', () => {
    expect(applyClientFilter(rows, 'past_due', '', 'all').map((r) => r.id)).toEqual([1]);
    expect(applyClientFilter(rows, 'at_risk', '', 'all').map((r) => r.id)).toEqual([2]);
    expect(applyClientFilter(rows, 'trialing', '', 'all').map((r) => r.id)).toEqual([3]);
    expect(applyClientFilter(rows, 'rootless', '', 'all').map((r) => r.id)).toEqual([3]);
  });
  it('a null compliance score is never "at risk"', () => {
    expect(applyClientFilter(rows, 'at_risk', '', 'all').some((r) => r.id === 4)).toBe(false);
  });
  it('search and type compose with the filter', () => {
    expect(applyClientFilter(rows, 'all', 'sun', 'apartment').map((r) => r.id)).toEqual([4]);
  });
});
```

- [ ] **Step 2: Run to confirm failure.** — `pnpm test apps/admin/__tests__/clients/client-filters.test.ts`
- [ ] **Step 3: Implement** per the interfaces; `ClientCard` = the design's card (name, location · type, status `Badge`, compliance bar `h-1.5 rounded-full bg-surface-muted` with fill `bg-status-success`/`bg-status-danger` + the percentage text, footer `plan · members`, warning line for rootless/dispute with `AlertTriangle` + text). Grid `grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]` — that arbitrary value is a layout template, not a colour/spacing literal, so `guard:design-tokens` allows it; confirm with `pnpm guard:design-tokens` before committing.
- [ ] **Step 4: Run** `pnpm test apps/admin/__tests__/clients && pnpm guard:design-tokens`; verify `/communities/rootless` redirects and `/clients?filter=rootless` shows the banner in the browser.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): clients grid with quick filters and the root-claim dispute banner; rootless folds into clients"`

### Task 16 (slice 2b): Inbox — mailbox cards, status tabs, split layout, context strip, canned replies

**Files:**
- Modify: `apps/admin/src/app/(console)/inbox/page.tsx`, `apps/admin/src/app/(console)/inbox/[threadId]/page.tsx`, `apps/admin/src/components/inbox/{InboxDashboard,ThreadView,ReplyComposer}.tsx`, `apps/admin/src/lib/server/inbox.ts`, `packages/shared/src/support-inbox.ts`, `apps/admin/src/app/api/admin/leads/route.ts`
- Create: `apps/admin/src/components/inbox/{MailboxSwitcher,ThreadList,ThreadContextStrip,CannedReplies,InboxSplit}.tsx`
- Test: `apps/admin/__tests__/inbox/context-strip.test.tsx`, `apps/admin/__tests__/inbox/leads-create-route.test.ts`, `packages/shared/src/__tests__/support-inbox-canned.test.ts`

**Interfaces:**
- `packages/shared`: `export const SUPPORT_MAILBOX_CANNED_REPLIES: Record<SupportMailbox, readonly string[]>` (support: `Thanks — looking into it`, `Can you share a screenshot?`, `Fixed, please retry`; privacy: `Confirm identity request`, `Cooling-off period explained`, `Deletion completed`; contact: `Book a demo`, `Pricing overview`, `Refer to §718 guide`) and `SUPPORT_MAILBOX_CONTEXT: Record<SupportMailbox, { title: string; text: string; action: string }>` (the design's three context strips, verbatim).
- `lib/server/inbox.ts`: add `getInboxOverview(): Promise<{ threads: InboxThread[]; stats: InboxStats; byMailbox: Record<SupportMailbox, InboxStats>; truncated }>` (one query, counts folded in memory).
- `InboxSplit` props `{ list: ReactNode; detail: ReactNode | null; mobile: boolean }` → desktop `grid gap-4 md:[grid-template-columns:minmax(300px,380px)_minmax(0,1fr)]`; mobile shows `detail ?? list`.
- `ThreadContextStrip` props `{ mailbox: SupportMailbox; threadId: number; participantEmail: string }` → `href`: support `/tickets/new?thread=${threadId}`; privacy `/deletion-requests?q=${encodeURIComponent(participantEmail)}`; contact `POST /api/admin/leads` then `router.push('/leads')`.
- `POST /api/admin/leads` body `{ threadId: number }` → creates a `marketing_leads` row from the thread (`email = participant_email`, `contact_name = participant_name`, `source = 'inbox_contact'`, `status = 'new'`, `notes = 'Converted from support thread #<id>: <subject>'`); 409 `LEAD_EXISTS` when `email_normalized` already exists (the unique index from `0055`); audit `lead_created_from_thread` with `resourceType: 'marketing_lead'`, `metadata: { threadId }`.
- `ReplyComposer`: gains `cannedReplies: readonly string[]` (chips insert text at the caret) and a `Add as internal note` checkbox that posts to the existing notes route instead of the reply route; `Send & log` label for privacy.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/__tests__/support-inbox-canned.test.ts
import { describe, expect, it } from 'vitest';
import { SUPPORT_MAILBOXES, SUPPORT_MAILBOX_CANNED_REPLIES, SUPPORT_MAILBOX_CONTEXT } from '../support-inbox';
describe('mailbox canned replies and context', () => {
  it('every mailbox has three canned replies and a context strip', () => {
    for (const mb of SUPPORT_MAILBOXES) {
      expect(SUPPORT_MAILBOX_CANNED_REPLIES[mb]).toHaveLength(3);
      expect(SUPPORT_MAILBOX_CONTEXT[mb].action.length).toBeGreaterThan(0);
    }
  });
});
```

```tsx
// apps/admin/__tests__/inbox/context-strip.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { ThreadContextStrip } from '@/components/inbox/ThreadContextStrip';
describe('ThreadContextStrip', () => {
  it('support links to a prefilled new ticket', () => {
    render(<ThreadContextStrip mailbox="support" threadId={12} participantEmail="a@b.c" />);
    expect(screen.getByRole('link', { name: 'Create ticket' }).getAttribute('href')).toBe('/tickets/new?thread=12');
  });
  it('privacy links to the deletion queue filtered by the sender', () => {
    render(<ThreadContextStrip mailbox="privacy" threadId={12} participantEmail="k@gmail.com" />);
    expect(screen.getByRole('link', { name: 'Open deletion request' }).getAttribute('href')).toBe('/deletion-requests?q=k%40gmail.com');
  });
  it('contact offers a convert-to-lead button', () => {
    render(<ThreadContextStrip mailbox="contact" threadId={12} participantEmail="m@x.com" />);
    expect(screen.getByRole('button', { name: 'Convert to lead' })).toBeTruthy();
  });
});
```

```ts
// apps/admin/__tests__/inbox/leads-create-route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const admin = { id: 'u1', email: 'ops@getpropertypro.com', role: 'super_admin' };
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: async () => admin }));
const logAdminAction = vi.fn(async () => {});
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: (p: unknown) => logAdminAction(p) }));
const insert = vi.fn();
const thread = { id: 12, subject: 'Pricing', participant_email: 'M@X.com', participant_name: 'Marcus', mailbox: 'contact' };
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => table === 'support_inbox_threads'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: thread, error: null }) }) }) }
      : { insert: (row: unknown) => ({ select: () => ({ single: async () => insert(row) }) }) },
  }),
}));
import { POST } from '@/app/api/admin/leads/route';
const req = (body: unknown) => new NextRequest('http://a/api/admin/leads', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('POST /api/admin/leads', () => {
  it('creates a lead from the thread and audits it', async () => {
    insert.mockResolvedValueOnce({ data: { id: 99 }, error: null });
    const res = await POST(req({ threadId: 12 }));
    expect(res.status).toBe(201);
    expect(insert.mock.calls[0]![0]).toMatchObject({ email: 'M@X.com', email_normalized: 'm@x.com', contact_name: 'Marcus', source: 'inbox_contact', status: 'new' });
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'lead_created_from_thread', resourceId: 99 }));
  });
  it('409s a duplicate email', async () => {
    insert.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } });
    const res = await POST(req({ threadId: 12 }));
    expect(res.status).toBe(409);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });
  it('400s a bad body', async () => {
    expect((await POST(req({ threadId: 'x' }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement.** The route's duplicate branch: `if (error?.code === '23505') throw new ConflictError('A lead with this email already exists')` — `ConflictError` from `@propertypro/shared/http` (verify at dispatch; if absent use `new AppError('…', 409, 'LEAD_EXISTS')`). Add `'lead_created_from_thread'` to `AdminAuditAction`. `/inbox` page: `AdminPageHeader title="Inbox" description="Three shared mailboxes, one queue. Each mailbox has its own next step."`, `MailboxSwitcher` (four cards: All + three, `aria-pressed`, open count pill), `QuickFilterTabs` Open/Pending/Closed/All with counts, `InboxSplit` with `ThreadList` on the left and, on desktop, the first visible thread's detail rendered by **linking** to it (desktop `/inbox` shows the list and an `EmptyState` "Select a thread" on the right; `/inbox/[threadId]` renders `InboxSplit` with the list and the server-sanitized `ThreadView` — spec D14). The `[threadId]` page therefore loads `getInboxOverview()` too and highlights the current thread (`bg-surface-muted`). Mailbox and status selection persist in the URL (`?mailbox=&status=`) so the split view keeps them.
- [ ] **Step 4: Run** `pnpm test apps/admin/__tests__/inbox packages/shared` → PASS, existing inbox tests included. Browser check: `/inbox`, select a thread, mobile shows thread-only with Back.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): inbox mailbox switcher, split thread view, context strip, canned replies; convert contact threads to leads"`

### Task 17 (slice 2c): Client workspace — header, tabs, Overview, Members, Compliance, Website (+DNS), Support, Settings, Access

**Files:**
- Modify: `apps/admin/src/app/(console)/clients/[id]/page.tsx`, `apps/admin/src/components/clients/{ClientWorkspace,CommunityMembers,CommunityCompliance,WebsiteTabPanel,CommunityWebsiteEditor,SupportAccessTab,CommunitySettingsEditor,CommunityAccess}.tsx`
- Create: `apps/admin/src/components/clients/{WorkspaceHeader,OverviewTab,WebsiteDomainCard,SnapshotsCard}.tsx`, `apps/admin/src/lib/clients/dns.ts`, `apps/admin/src/app/api/admin/communities/[id]/website/dns/route.ts`
- Test: `apps/admin/__tests__/clients/dns.test.ts`, `apps/admin/__tests__/clients/workspace-tabs.test.tsx` (+ existing `client-workspace.test.tsx`, `client-workspace-page.test.ts`, `community-members.test.ts` stay green)

**Interfaces:**
```ts
// lib/clients/dns.ts
export interface DomainCheck { label: string; value: string; status: 'ok' | 'warn' | 'fail' }
export interface DnsResolvers { resolve4(h: string): Promise<string[]>; resolveCname(h: string): Promise<string[]>; probe(url: string): Promise<{ status: number; location: string | null; tls: boolean }> }
export const EXPECTED_APEX_A = ['76.76.21.21'];              // Vercel apex — verify at dispatch against apps/web's custom-domain docs
export const EXPECTED_CNAME = 'cname.getpropertypro.com';   // verify at dispatch
export async function checkCustomDomain(domain: string, r: DnsResolvers): Promise<DomainCheck[]>  // Apex A, www CNAME, TLS, www→apex redirect
export const nodeResolvers: DnsResolvers;                     // node:dns/promises + fetch(HEAD, redirect: 'manual')
// route: GET /api/admin/communities/[id]/website/dns → { data: DomainCheck[] } (404 when no custom_domain)
```
- `ClientWorkspace` tabs become `['overview','billing','members','compliance','access','website','support','settings']` (Compliance hidden for apartments); the `billing` tab renders `<BillingTab communityId={…} />` imported from `./BillingTab` — **this slice creates `BillingTab.tsx` as a `Card` with an `EmptyState title="Billing arrives in Wave 3"`**; Wave 3c replaces the file's body. Tab strip is the design's underline style (`border-b-2 border-interactive text-content-brand` active), still driven by `useRovingTabs`.
- `WorkspaceHeader`: `AdminPageHeader` with `backHref="/clients" backLabel="Clients"`, `eyebrow` = status `Badge` (`SUBSCRIPTION_STATUS_LABELS`) + `Site live` outlined `Badge` + type · city · `<code>slug</code>`, actions `Open site ↗` (outline, `href` from `getWebsiteDomainInfo`) + `Start support session` (navigates to the Support tab and opens the dialog — `?tab=support&start=1`).
- `OverviewTab`: `AlertBanner` when `subscription_status === 'past_due'` (title `Subscription is past due`, description with `subscription_current_period_end_at`), four `KpiCard`s (Members, Documents, Compliance, Open tickets — the last reads `?` until Wave 3a; render `—`), Details `<dl>`, Recent activity from `platform_admin_audit_log` where `community_id = id` (last 8, via a new `getCommunityActivity(id)` in `lib/server/clients.ts` — **owned by 2a**; to keep the slices disjoint, put it in a new file `lib/server/community-activity.ts` owned here).
- Members: keep data flow; add search input, `QuickFilterTabs` (All / Managers & board / Owners / Tenants, computed client-side from `role`, `designation`, `is_unit_owner`), the design's row layout, `AlertBanner status="info"` "Root manager is protected" when a `root_manager` exists.
- Compliance: summary chips (`Score`, `Met`, `Overdue`, `Pending`, `N/A`) as filter buttons with `aria-pressed`, the row layout with statute in `font-mono`, Nudge/Export buttons **omitted** (no backing; ponytail rung 1 — note it in the commit).
- Website: `WebsiteDomainCard` (domain, fallback, `Live` badge, `DomainCheck` rows fetched from the new route with `Skeleton`/error states, the past-due warning box, `Re-check DNS` button, `Change domain` opens the existing editor section) + the existing branding editor restyled + `SnapshotsCard` listing `site_publish_snapshots` for the community (server-loaded in the page; `Restore` posts to the existing `restore-from-snapshot` route with an `AlertDialog` confirm).
- Support: restyle only; **keep** heading text `Support Access`, `role="tab"` name `Support`, `Start Session` button/dialog labels.
- Settings: restyle the existing editor into the design's two columns (Community fields + Who can write | Legal gates + Danger zone). Danger zone shows the community's open deletion request (if any, from `account_deletion_requests` where `community_id = id and status = 'cooling'`) with a link to `/deletion-requests`; no request button (spec §1 non-goal).
- Access: restyle only.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/clients/dns.test.ts
import { describe, expect, it } from 'vitest';
import { checkCustomDomain, type DnsResolvers } from '@/lib/clients/dns';

const r = (over: Partial<DnsResolvers> = {}): DnsResolvers => ({
  resolve4: async () => ['76.76.21.21'],
  resolveCname: async () => ['cname.getpropertypro.com'],
  probe: async (url) => url.startsWith('https://www.') ? { status: 301, location: 'https://bayviewtowers.org/', tls: true } : { status: 200, location: null, tls: true },
  ...over,
});

describe('checkCustomDomain', () => {
  it('reports all-ok for a correctly configured domain', async () => {
    const checks = await checkCustomDomain('bayviewtowers.org', r());
    expect(checks.map((c) => c.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });
  it('flags a wrong apex record and a missing redirect', async () => {
    const checks = await checkCustomDomain('x.org', r({ resolve4: async () => ['1.2.3.4'], probe: async () => ({ status: 200, location: null, tls: true }) }));
    expect(checks[0]).toMatchObject({ label: 'Apex A record', status: 'fail', value: '1.2.3.4' });
    expect(checks[3]).toMatchObject({ label: 'Redirect www → apex', status: 'warn' });
  });
  it('a resolver error becomes a fail row, not a throw', async () => {
    const checks = await checkCustomDomain('x.org', r({ resolveCname: async () => { throw new Error('ENOTFOUND'); } }));
    expect(checks[1]).toMatchObject({ label: 'www CNAME', status: 'fail', value: 'ENOTFOUND' });
  });
});
```

```tsx
// apps/admin/__tests__/clients/workspace-tabs.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
import { ClientWorkspace } from '@/components/clients/ClientWorkspace';
const community = { id: 1, name: 'Bayview Towers', slug: 'bayview-towers', community_type: 'condo_718', city: 'St. Petersburg', state: 'FL', zip_code: null, address_line1: null, subscription_status: 'past_due', subscription_plan: 'professional', custom_domain: 'bayviewtowers.org', site_published_at: '2026-03-14T00:00:00Z', timezone: 'America/New_York', transparency_enabled: true, community_settings: {}, created_at: '2026-02-17T00:00:00Z', memberCount: 141, documentCount: 38, complianceScore: 61, subscription_current_period_end_at: null, openDeletionRequest: null, activity: [], snapshots: [] } as any;

describe('ClientWorkspace tabs', () => {
  it('renders the eight tabs in the design order for a condo, keeping the pinned Support tab', () => {
    render(<ClientWorkspace community={community} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'Billing', 'Members', 'Compliance', 'Access', 'Website', 'Support', 'Settings']);
    expect(screen.getByRole('tab', { name: 'Support' })).toBeTruthy();
  });
  it('hides Compliance for apartments', () => {
    render(<ClientWorkspace community={{ ...community, community_type: 'apartment' }} />);
    expect(screen.queryByRole('tab', { name: 'Compliance' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement** per the interfaces. `dns.ts`:

```ts
export async function checkCustomDomain(domain: string, r: DnsResolvers): Promise<DomainCheck[]> {
  const apex = domain.replace(/^www\./, '');
  const safe = async <T,>(fn: () => Promise<T>): Promise<T | Error> => { try { return await fn(); } catch (e) { return e instanceof Error ? e : new Error(String(e)); } };
  const a = await safe(() => r.resolve4(apex));
  const cname = await safe(() => r.resolveCname(`www.${apex}`));
  const apexProbe = await safe(() => r.probe(`https://${apex}/`));
  const wwwProbe = await safe(() => r.probe(`https://www.${apex}/`));
  const row = (label: string, ok: boolean, value: string, warn = false): DomainCheck => ({ label, value, status: ok ? 'ok' : warn ? 'warn' : 'fail' });
  return [
    a instanceof Error ? row('Apex A record', false, a.message) : row('Apex A record', a.some((ip) => EXPECTED_APEX_A.includes(ip)), a.join(', ')),
    cname instanceof Error ? row('www CNAME', false, cname.message) : row('www CNAME', cname.includes(EXPECTED_CNAME), cname.join(', ') || 'none'),
    apexProbe instanceof Error ? row('TLS certificate', false, apexProbe.message) : row('TLS certificate', apexProbe.tls, apexProbe.tls ? 'valid' : 'handshake failed'),
    wwwProbe instanceof Error ? row('Redirect www → apex', false, wwwProbe.message, true)
      : row('Redirect www → apex', wwwProbe.status >= 300 && wwwProbe.status < 400 && (wwwProbe.location ?? '').includes(apex), `${wwwProbe.status}${wwwProbe.location ? ` → ${wwwProbe.location}` : ''}`, true),
  ];
}
```
`nodeResolvers.probe` uses `fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) })`; `tls` is `true` when the fetch resolves at all over https (a TLS failure rejects with `ERR_TLS_CERT_ALTNAME_INVALID` etc.). The route validates `id`, loads `custom_domain`, 404s when null, returns `checkCustomDomain(domain, nodeResolvers)`.

- [ ] **Step 4: Run** `pnpm test apps/admin/__tests__/clients` (all files) → PASS; then the e2e `support-access.spec.ts` locally → PASS. Browser: every tab at desktop and 390 px.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): client workspace redesign — header, 8 tabs, overview, DNS checks, snapshots; Support selectors preserved"`

### Task 18 (slice 2d): Leads, Demos, Deletion requests, Site templates hub, Settings

**Files:**
- Modify: `apps/admin/src/app/(console)/{leads,demo,deletion-requests,site-templates,settings}/page.tsx`, `apps/admin/src/components/leads/LeadsDashboard.tsx`, `apps/admin/src/components/demo/DemoListClient.tsx`, `apps/admin/src/components/deletion-requests/DeletionRequestsDashboard.tsx`, `apps/admin/src/components/site-templates/LayoutsTable.tsx`, `apps/admin/src/components/settings/PlatformSettings.tsx`
- Create: `apps/admin/src/components/demo/StaleDemosBanner.tsx` (moved logic from `ClientPortfolio`)
- Test: existing `leads`, `demo`, `deletion-requests`, `site-templates` tests stay green; add `apps/admin/__tests__/demo/stale-demos-banner.test.tsx`

- Leads: `AdminPageHeader title="Leads" description="Inbound from the §718 compliance checker and the portfolio inquiry form."`; three `KpiCard`s from `LeadStats` (Untouched = `new`, In ICP = `inIcp`, Last 7 days — add `last7d` to `LeadStats` in `lib/server/leads.ts`, **owned by 2d for this field only**); `QuickFilterTabs` All/New/Contacted/Qualified with counts; the design's row (association + ICP `Badge variant="brand"`, contact · email link, units · source · obligation · received); status `<select>` (existing PATCH) and `Create demo` → `Link` to `/demo/new?lead=${id}` (the wizard reads `?lead=` in a later program; for now it prefills nothing — say so in a `// ponytail:` comment).
- Demos: header `Demos` with `${rows.length} demo instances · ${stale} stale`; `StaleDemosBanner` = the confirm-delete flow removed from `ClientPortfolio` in Task 15 (moved verbatim); rows with `staleBadge` age, `Converted`/`Demo` outlined `Badge`, ghost `Preview`/`Copy link`, outline `Convert` (opens the existing `ConvertDemoDialog`).
- Deletion requests: `AlertBanner status="warning" variant="subtle"` summarising cooling requests (`title: "${n} requests are in the cooling-off period"`, description listing target + cooling end), rows per the design (type icon, target, requester · requested, date label/value, status `Badge`, `Intervene`/`Recover` outline button using the existing routes). Read `?q=` from the URL to prefilter by requester email (used by the inbox privacy strip).
- Site templates hub: header with the three sub-page outline buttons; layouts as cards (`LayoutsTable` gains a `variant="cards"` prop; the table stays for the editing view) with tier `Badge` (`essentials→info`, `professional→owner`, `pm→warning`), tagline italic, `slug · v{version}` mono, `{uses} communities` (add a `uses` count to the hub page query: `communities` grouped by `site_layout_slug` — verify the column name at dispatch; if absent, omit the count).
- Settings: header `Settings` / `Platform administrators, alerts and integrations.`; the admins section as the design's list rows (`You` info badge, `Remove` ghost with the existing confirm). Alerts, Install app and Integrations sections are **added by Wave 4** into this same file — leave a `{/* Wave 4: AlertPrefsSection, InstallAppSection, IntegrationsSection */}` comment marking the insertion point.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/__tests__/demo/stale-demos-banner.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaleDemosBanner } from '@/components/demo/StaleDemosBanner';
describe('StaleDemosBanner', () => {
  it('lists stale demos and asks for confirmation before deleting', () => {
    global.fetch = vi.fn() as any;
    render(<StaleDemosBanner staleDemos={[{ id: 5, prospect_name: 'Gulfstream Gardens', template_type: 'condo', created_at: '2026-07-01T00:00:00Z' }]} />);
    expect(screen.getByRole('alert').textContent).toContain('Gulfstream Gardens');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure.** **Step 3: Implement.** **Step 4: Run** `pnpm test apps/admin/__tests__/{leads,demo,deletion-requests,site-templates,settings}` → PASS; browser check of the five pages.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): restyle leads, demos (with stale banner), deletion requests, site templates hub and settings"`

### Task 19: Wave 2 integration and PR

- [ ] Merge the four slice branches onto the wave branch in order 2a, 2b, 2c, 2d. A conflict means the ownership map is wrong — stop and report.
- [ ] `pnpm lint && pnpm typecheck && pnpm test apps/admin && pnpm --filter @propertypro/admin build && node scripts/verify-admin-semantic-css.cjs && pnpm guard:design-tokens` (baseline must not grow; the `ClientPortfolio.tsx` and `CommunitySettingsEditor.tsx` `bare-focus-ring` ceilings should **shrink** — ratchet them down in `scripts/design-token-baseline.json`).
- [ ] E2E locally: `admin-shell.spec.ts` + `support-access.spec.ts` green.
- [ ] Security review + code review; PR "W2: restyle the existing console screens". Merge before Wave 3.

---

## Wave 3 — New subsystems (four parallel slices)

Prerequisites before dispatch: `SENTRY_API_TOKEN` and `CRON_SECRET` exist on the admin Vercel project (spec §9); migration `0072` is applied to prod **before** slice 3a's PR merges (expand-before-code). Each slice replaces the body of its `lib/server/signals/<key>.ts` provider (created in Task 7) and, for 3a, appends `ticketSearcher` to `SEARCHERS`.

### Task 20 (slice 3a): Migration `0072_support_tickets`, schema, RLS config, typed rows, RLS integration test

**Files:**
- Create: `packages/db/migrations/0072_support_tickets.sql` (via `pnpm db:migration:new support_tickets`), `packages/db/src/schema/support-tickets.ts`, `packages/db/src/schema/support-ticket-events.ts`, `apps/web/__tests__/integration/support-tickets-rls.integration.test.ts`
- Modify: `packages/db/src/schema/index.ts` (exports after the inbox block), `packages/db/src/schema/rls-config.ts` (two `RLS_GLOBAL_TABLE_EXCLUSIONS` entries), `packages/db/src/supabase/admin-types.ts` (`SupportTicketRow`, `SupportTicketEventRow`, two `AdminTable` entries)

**Interfaces:**
```ts
export const SUPPORT_TICKET_PRIORITIES = ['low', 'medium', 'high'] as const;
export const SUPPORT_TICKET_CATEGORIES = ['billing', 'compliance', 'site', 'access', 'other'] as const;
export const SUPPORT_TICKET_STATUSES = ['open', 'waiting', 'resolved'] as const;
export const SUPPORT_TICKET_EVENT_KINDS = ['created', 'note', 'status_changed', 'priority_changed', 'assigned', 'linked'] as const;
// (declare these in packages/shared/src/support-tickets.ts and export from the shared index — the CHECKs below mirror them, as 0068 did for the inbox)
export type SupportTicketRow = { id: number; title: string; description: string | null; priority: SupportTicketPriority; category: SupportTicketCategory; status: SupportTicketStatus; community_id: number | null; thread_id: number | null; external_ref: string | null; assignee_user_id: string | null; created_by: string; resolved_at: string | null; created_at: string; updated_at: string };
export type SupportTicketEventRow = { id: number; ticket_id: number; kind: SupportTicketEventKind; body: string | null; actor_user_id: string; created_at: string };
```

- [ ] **Step 1: Re-verify the number, then scaffold**

```bash
ls packages/db/migrations | grep -E '^00(7[1-9])_'          # expect only 0071
git fetch -q origin && for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do git ls-tree -r --name-only "$b" -- packages/db/migrations | grep -E '/0072_' && echo "CLAIMED on $b"; done
# Supabase MCP list_migrations on vbqobyagjzvlfpfozvmx: newest must still be cron_runs_first_observed_at (0070) / platform_admin_demo_identity_guard (0071)
pnpm db:migration:new support_tickets
```

- [ ] **Step 2: Write the integration test first** (runs only with `DATABASE_URL`, i.e. `pnpm test:integration:local apps/web/__tests__/integration/support-tickets-rls.integration.test.ts`)

```ts
// apps/web/__tests__/integration/support-tickets-rls.integration.test.ts
/**
 * 0072 — support_tickets / support_ticket_events are platform-scoped and locked
 * to service_role on the 0068 posture. Pinned: anon and authenticated get
 * permission denied on SELECT and INSERT; service_role can CRUD; CHECKs reject
 * an unknown priority/status; deleting a ticket cascades its events.
 */
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('support_tickets lockdown (0072)', () => {
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  afterAll(() => db.end());

  it('anon and authenticated are denied', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        await expect(tx`select id from support_tickets limit 1`).rejects.toMatchObject({ code: '42501' });
        await expect(tx`insert into support_tickets (title, priority, category, status, created_by) values ('x','low','other','open', gen_random_uuid())`).rejects.toMatchObject({ code: '42501' });
      });
    }
  });
  it('service_role can create, and the CHECKs and cascade hold', async () => {
    await db.begin(async (tx) => {
      await tx.unsafe('set local role service_role');
      const [t] = await tx`insert into support_tickets (title, priority, category, status, created_by) values ('PDF uploads fail','high','site','open', gen_random_uuid()) returning id`;
      await tx`insert into support_ticket_events (ticket_id, kind, body, actor_user_id) values (${t!.id}, 'created', null, gen_random_uuid())`;
      await expect(tx`insert into support_tickets (title, priority, category, status, created_by) values ('x','urgent','site','open', gen_random_uuid())`).rejects.toMatchObject({ code: '23514' });
      await tx`delete from support_tickets where id = ${t!.id}`;
      const [{ n }] = await tx`select count(*)::int as n from support_ticket_events where ticket_id = ${t!.id}`;
      expect(n).toBe(0);
      await tx`rollback`;
    }).catch(() => {});
  });
});
```

- [ ] **Step 3: Write the migration** (statement-breakpoints as in `0068`):

```sql
CREATE TABLE "support_tickets" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "priority" text NOT NULL DEFAULT 'medium',
  "category" text NOT NULL DEFAULT 'other',
  "status" text NOT NULL DEFAULT 'open',
  "community_id" bigint REFERENCES "communities"("id") ON DELETE SET NULL,
  "thread_id" bigint REFERENCES "support_inbox_threads"("id") ON DELETE SET NULL,
  "external_ref" text,
  "assignee_user_id" uuid,
  "created_by" uuid NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "support_tickets_priority_check" CHECK ("priority" IN ('low','medium','high')),
  CONSTRAINT "support_tickets_category_check" CHECK ("category" IN ('billing','compliance','site','access','other')),
  CONSTRAINT "support_tickets_status_check" CHECK ("status" IN ('open','waiting','resolved')),
  CONSTRAINT "support_tickets_title_check" CHECK (char_length("title") BETWEEN 1 AND 200)
);--> statement-breakpoint
CREATE TABLE "support_ticket_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "ticket_id" bigint NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "body" text,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "support_ticket_events_kind_check" CHECK ("kind" IN ('created','note','status_changed','priority_changed','assigned','linked'))
);--> statement-breakpoint
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets" ("status","priority","updated_at" DESC);--> statement-breakpoint
CREATE INDEX "support_tickets_thread_idx" ON "support_tickets" ("thread_id") WHERE "thread_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_tickets_community_idx" ON "support_tickets" ("community_id") WHERE "community_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_ticket_events_ticket_idx" ON "support_ticket_events" ("ticket_id","id");--> statement-breakpoint
-- 0068 posture: RLS on + forced, zero policies, grants only to service_role.
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_tickets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE support_tickets FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_tickets_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_tickets TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE support_tickets_id_seq TO service_role;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_ticket_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE support_ticket_events FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_ticket_events_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_ticket_events TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE support_ticket_events_id_seq TO service_role;
```

Drizzle schema files mirror the SQL (`pgTable` with `bigserial`, `text`, `bigint … references(() => communities.id, { onDelete: 'set null' })`, `uuid`, `timestamp(withTimezone)`), export from `schema/index.ts` under a `// Platform support tickets — spec D13` comment, and add the two `RLS_GLOBAL_TABLE_EXCLUSIONS` entries with reasons in the style of the inbox entries (platform-scoped, correspondent usually not a member, service_role only, admin reads behind `requirePlatformAdmin`). Bump `RLS_EXPECTED_TENANT_TABLE_COUNT` only if the guard demands it (these are exclusions, so it should not).

- [ ] **Step 4: Run** `pnpm db:test-local:reset && pnpm test:integration:local apps/web/__tests__/integration/support-tickets-rls.integration.test.ts && pnpm --filter @propertypro/db typecheck && pnpm --filter @propertypro/db test && pnpm guard:db-access && MIGRATION_BASELINE_REQUIRED=1 pnpm exec tsx scripts/verify-migration-ordering.ts` → PASS. Revert check: comment out the `FORCE ROW LEVEL SECURITY` + `REVOKE` lines, reset, rerun → the anon test goes red with rows returned; controls (CHECK, cascade) stay green. Restore.
- [ ] **Step 5: Commit** — `git commit -m "feat(db): 0072 support_tickets + support_ticket_events, platform-scoped and service_role-only"`

### Task 21 (slice 3a): Tickets server module and routes

**Files:**
- Create: `apps/admin/src/lib/server/tickets.ts`, `apps/admin/src/app/api/admin/tickets/route.ts`, `apps/admin/src/app/api/admin/tickets/[id]/route.ts`, `apps/admin/src/app/api/admin/tickets/[id]/events/route.ts`, `apps/admin/src/lib/server/search/tickets.ts`
- Modify: `apps/admin/src/lib/audit/log-admin-action.ts` (`ticket_created`, `ticket_updated`), `apps/admin/src/lib/server/search.ts` (append `ticketSearcher`), `apps/admin/src/lib/server/signals/tickets.ts` (fill)
- Test: `apps/admin/__tests__/tickets/tickets-service.test.ts`, `apps/admin/__tests__/tickets/tickets-routes.test.ts`

**Interfaces:**
```ts
// lib/server/tickets.ts
export interface AdminTicket { id: number; key: string /* T-118 */; title; description; priority; category; status; communityId; communityName: string | null; threadId; threadSubject: string | null; externalRef; assigneeUserId; assigneeEmail: string | null; createdBy; resolvedAt; createdAt; updatedAt; ageLabel: string }
export interface TicketFilters { status?: SupportTicketStatus | 'all'; priority?: SupportTicketPriority; communityId?: number }
export interface TicketCounts { open: number; waiting: number; resolved: number }
export async function listTickets(filters?: TicketFilters): Promise<{ tickets: AdminTicket[]; counts: TicketCounts; truncated: boolean }>
export async function getTicket(id: number): Promise<{ ticket: AdminTicket; events: TicketEvent[] } | null>
export async function createTicket(input: CreateTicketInput, actor: { id: string; email: string }): Promise<AdminTicket>   // inserts ticket + 'created' event (+ 'linked' when threadId/externalRef)
export async function updateTicket(id: number, patch: UpdateTicketInput, actor): Promise<{ before: SupportTicketRow; after: SupportTicketRow }>  // writes one event per changed field; sets resolved_at when status→resolved
export async function addTicketNote(id: number, body: string, actor): Promise<TicketEvent>
export const ticketKey = (id: number) => `T-${id}`;
export function diffTicketEvents(before: SupportTicketRow, after: SupportTicketRow): Array<{ kind: SupportTicketEventKind; body: string }>  // pure, tested
```
- Zod (in the route files): `createTicketSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional(), priority: z.enum(SUPPORT_TICKET_PRIORITIES).default('medium'), category: z.enum(SUPPORT_TICKET_CATEGORIES).default('other'), communityId: z.number().int().positive().nullable().optional(), threadId: z.number().int().positive().nullable().optional(), externalRef: z.string().max(200).nullable().optional(), assignToMe: z.boolean().optional() })`; `updateTicketSchema = createTicketSchema.partial().extend({ status: z.enum(SUPPORT_TICKET_STATUSES).optional(), assigneeUserId: z.string().uuid().nullable().optional() }).strict()`; `noteSchema = z.object({ body: z.string().trim().min(1).max(5000) })`.
- Routes: `GET /api/admin/tickets?status=&priority=&communityId=` → `{ data: { tickets, counts, truncated } }`; `POST` → 201 `{ data: ticket }` + audit `ticket_created`; `GET /[id]` → 404 when missing; `PATCH /[id]` → `{ data: ticket }` + audit `ticket_updated` with `oldValues`/`newValues` = the changed fields only; `POST /[id]/events` → 201 note.
- Signals: `count` = open tickets; items = high-priority open tickets (tone `danger`, icon `ticket`, href `/tickets/${id}`).
- Searcher: `title.ilike` over `support_tickets`, meta `${key} · ${priority}`, href `/tickets/${id}`, icon `ticket`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/tickets/tickets-service.test.ts
import { describe, expect, it } from 'vitest';
import { diffTicketEvents, ticketKey } from '@/lib/server/tickets';
const base = { id: 118, title: 't', description: null, priority: 'medium', category: 'site', status: 'open', community_id: null, thread_id: null, external_ref: null, assignee_user_id: null, created_by: 'u', resolved_at: null, created_at: 'a', updated_at: 'a' } as const;
describe('tickets', () => {
  it('formats the display key', () => { expect(ticketKey(118)).toBe('T-118'); });
  it('emits one event per changed field', () => {
    const events = diffTicketEvents(base, { ...base, priority: 'high', status: 'waiting', assignee_user_id: 'u2' });
    expect(events.map((e) => e.kind).sort()).toEqual(['assigned', 'priority_changed', 'status_changed']);
    expect(events.find((e) => e.kind === 'priority_changed')!.body).toBe('Priority medium → high');
  });
  it('emits nothing when nothing changed', () => { expect(diffTicketEvents(base, { ...base })).toEqual([]); });
});
```

```ts
// apps/admin/__tests__/tickets/tickets-routes.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const admin = { id: 'u1', email: 'ops@getpropertypro.com', role: 'super_admin' };
const requirePlatformAdmin = vi.fn(async () => admin);
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: () => requirePlatformAdmin() }));
const logAdminAction = vi.fn(async () => {});
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: (p: unknown) => logAdminAction(p) }));
const createTicket = vi.fn(async () => ({ id: 118, key: 'T-118', title: 'PDF uploads fail' }));
const updateTicket = vi.fn(async () => ({ before: { status: 'open', priority: 'medium' }, after: { status: 'resolved', priority: 'medium' } }));
const getTicket = vi.fn(async () => ({ ticket: { id: 118, key: 'T-118' }, events: [] }));
vi.mock('@/lib/server/tickets', () => ({ createTicket: (...a: unknown[]) => createTicket(...a), updateTicket: (...a: unknown[]) => updateTicket(...a), getTicket: (...a: unknown[]) => getTicket(...a), listTickets: async () => ({ tickets: [], counts: { open: 0, waiting: 0, resolved: 0 }, truncated: false }) }));
import { POST } from '@/app/api/admin/tickets/route';
import { PATCH } from '@/app/api/admin/tickets/[id]/route';
const json = (url: string, method: string, body: unknown) => new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('tickets routes', () => {
  it('POST creates and audits', async () => {
    const res = await POST(json('http://a/api/admin/tickets', 'POST', { title: 'PDF uploads fail', priority: 'high', category: 'site', threadId: 1, assignToMe: true }));
    expect(res.status).toBe(201);
    expect(createTicket).toHaveBeenCalledWith(expect.objectContaining({ title: 'PDF uploads fail', assignToMe: true }), admin);
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'ticket_created', resourceType: 'support_ticket', resourceId: 118 }));
  });
  it('POST 400s an unknown priority', async () => {
    expect((await POST(json('http://a/api/admin/tickets', 'POST', { title: 'x', priority: 'urgent' }))).status).toBe(400);
    expect(createTicket).toHaveBeenCalledTimes(1);
  });
  it('PATCH audits only the changed fields', async () => {
    const res = await PATCH(json('http://a/api/admin/tickets/118', 'PATCH', { status: 'resolved' }), { params: Promise.resolve({ id: '118' }) });
    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'ticket_updated', oldValues: { status: 'open' }, newValues: { status: 'resolved' } }));
  });
  it('PATCH rejects unknown keys (.strict)', async () => {
    expect((await PATCH(json('http://a/api/admin/tickets/118', 'PATCH', { hacker: true }), { params: Promise.resolve({ id: '118' }) })).status).toBe(400);
  });
  it('401s before any service call', async () => {
    requirePlatformAdmin.mockRejectedValueOnce(Object.assign(new Error('no'), { statusCode: 401, toJSON: () => ({ error: { code: 'UNAUTHORIZED' } }) }));
    // use the real UnauthorizedError from @propertypro/shared/http in the implementation of this test
  });
});
```

- [ ] **Step 2: Run to confirm failure.** **Step 3: Implement** per the interfaces (use `createAdminTypedClient()`; joins for community name and thread subject via two `in()` lookups, assignee email via `buildAuthUserMap` only on the detail page — the list shows the initial from a small cache of platform admins loaded with `platform_admin_users` + `buildAuthUserMap`). `ageLabel` via `formatDistanceToNowStrict`.
- [ ] **Step 4: Run** `pnpm test apps/admin/__tests__/tickets apps/admin/__tests__/shell` → PASS (the shell tests still pass with the filled provider mocked away).
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): tickets service, routes, signals and search"`

### Task 22 (slice 3a): Tickets pages

**Files:**
- Create: `apps/admin/src/app/(console)/tickets/page.tsx`, `apps/admin/src/app/(console)/tickets/[id]/page.tsx`, `apps/admin/src/app/(console)/tickets/new/page.tsx`, `apps/admin/src/app/(console)/tickets/loading.tsx`, `apps/admin/src/components/tickets/{TicketList,TicketRow,TicketDetail,TicketForm,TicketSplit}.tsx`
- Test: `apps/admin/__tests__/tickets/ticket-form.test.tsx`

- `/tickets`: `AdminPageHeader title="Tickets" description="Work items you own. Threads stay in Inbox; tickets track the fix." actions={<Button asChild size="sm"><Link href="/tickets/new">New ticket</Link></Button>}`; `QuickFilterTabs` Open/Waiting/Resolved from `counts`; `TicketSplit` (same layout rule as the inbox: list + selected detail on desktop, list or detail on mobile). Row = `PriorityBadge` (from `@propertypro/ui`), mono key, title, category outlined `Badge` (billing→warning, compliance→info, site→brand, access→owner, other→neutral), community with `Building2`, age, status `Badge` (open→info, waiting→warning, resolved→success), assignee initial circle. `EmptyState` per the design copy (`Resolved tickets are kept for 12 months and searchable from ⌘K.` — keep the copy but no retention job exists; `// ponytail:` note).
- `/tickets/[id]`: `TicketDetail` — header chips, title, meta line, description, two link cards (Linked thread → `/inbox/${threadId}`, Community → `/clients/${communityId}`), Activity list from events, note `Textarea` + `Add note` (POST events), footer selects for priority/status (PATCH, optimistic, revert on error with `AlertBanner`), `Resolve ticket` primary (PATCH status resolved, `AlertDialog` confirm).
- `/tickets/new`: `TicketForm` reads `?thread=` (prefills title from the thread subject via `getThreadDetail`), `?community=`, `?ref=` (Sentry issue id) and `?title=`; fields title, description, priority, category, community (`<select>` of non-demo communities), `Assign to me` checkbox; POST then `router.push('/tickets/${id}')`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/__tests__/tickets/ticket-form.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { TicketForm } from '@/components/tickets/TicketForm';
describe('TicketForm', () => {
  it('posts the prefilled thread link and navigates to the new ticket', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { id: 118 } }), { status: 201 })) as any;
    render(<TicketForm communities={[{ id: 1, name: 'Sunset Condos' }]} initial={{ title: 'Cannot upload 2025 budget PDF', threadId: 12 }} />);
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/tickets/118'));
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toMatchObject({ title: 'Cannot upload 2025 budget PDF', threadId: 12 });
  });
  it('shows the server validation message inline', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Title is required' } }), { status: 400 })) as any;
    render(<TicketForm communities={[]} initial={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Title is required'));
  });
});
```

- [ ] **Step 2–4:** run red → implement → `pnpm test apps/admin/__tests__/tickets` green → browser check `/tickets`, `/tickets/new?thread=<id>` from a thread's context strip, `/tickets/<id>` at 390 px.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): tickets list/detail/new pages"`

### Task 23 (slice 3b): Health — Sentry client, probes, failed jobs, retry, page, critical banner

**Files:**
- Create: `apps/admin/src/lib/server/sentry.ts`, `apps/admin/src/lib/server/health.ts`, `apps/admin/src/app/api/admin/health/route.ts`, `apps/admin/src/app/api/admin/health/jobs/[slug]/retry/route.ts`, `apps/admin/src/app/(console)/health/page.tsx`, `apps/admin/src/app/(console)/health/loading.tsx`, `apps/admin/src/components/health/{ServicesStrip,ErrorsList,FailedJobsList}.tsx`
- Modify: `apps/admin/src/lib/server/signals/health.ts` (fill), `apps/admin/src/lib/audit/log-admin-action.ts` (`cron_job_retried`), `.env.example` (`SENTRY_API_TOKEN`, `CRON_SECRET` note for admin, `WEB_APP_ORIGIN`)
- Test: `apps/admin/__tests__/health/sentry-client.test.ts`, `apps/admin/__tests__/health/health-derivations.test.ts`, `apps/admin/__tests__/health/retry-route.test.ts`

**Interfaces:**
```ts
// lib/server/sentry.ts
export interface SentryIssue { id: string; shortId: string; title: string; culprit: string; count: number; lastSeen: string; permalink: string; hourly: number[] /* last 24 buckets */ }
export interface SentryClient { listIssues(project: string, opts?: { statsPeriod?: '24h'; limit?: number }): Promise<SentryIssue[]> }
export function createSentryClient(fetchImpl?: typeof fetch): SentryClient | null   // null when SENTRY_API_TOKEN or SENTRY_ORG is unset
export function parseIssue(raw: unknown): SentryIssue                                // pure, tested against a captured API sample
// lib/server/health.ts
export type ServiceState = 'ok' | 'degraded' | 'down' | 'unknown';
export interface ServiceStatus { name: 'API' | 'Web app' | 'Admin' | 'Supabase' | 'Stripe webhooks' | 'Resend'; state: ServiceState; short: string; meta: string }
export interface FailedJob { source: 'Cron' | 'Stripe'; name: string; error: string; when: string; attempts: string; retryable: boolean; slug?: string }
export interface HealthReport { services: ServiceStatus[]; errors: SentryIssue[] | null /* null = Sentry not configured or failed */; jobs: FailedJob[]; errorsLastHour: number; checkedAt: string }
export function deriveCritical(report: HealthReport, thresholds: { errorsPerHour: number }): ShellCritical | null   // spec D20, pure
export function summariseCronRun(row: CronRunRow, now: Date): FailedJob | null   // pure: failed when last_status='failed' or consecutive_failures>0
export async function getHealthReport(deps?: Partial<HealthDeps>): Promise<HealthReport>
export async function listKnownJobSlugs(): Promise<string[]>   // distinct job_slug from cron_runs — the retry route accepts nothing else
```
- Probes (each with `AbortSignal.timeout(4000)`, measured with `performance.now()`): `${WEB_APP_ORIGIN}/api/health` (name `Web app`), `${ADMIN_ORIGIN}/api/health` (`Admin`, origin from the request host — pass in), Supabase `db.from('communities').select('id', { head: true, count: 'exact' }).limit(1)` (`Supabase`, meta `${ms} ms`), Stripe `stripe.balance.retrieve()` latency + unprocessed webhook rows 24h (`Stripe webhooks`: `degraded` when ≥1 unprocessed in the last hour, `down` when the API call fails), Resend `GET https://api.resend.com/domains` with `RESEND_API_KEY`. `API` = the web probe's JSON `status === 'ok'`.
- Failed jobs: `cron_runs` rows via `createAdminClient()` (`select job_slug, last_status, last_error, last_started_at, consecutive_failures`) → `summariseCronRun`; `stripe_webhook_events` where `processed_at is null and received_at > now()-24h` → `{ source: 'Stripe', name: event_id, error: 'not processed', retryable: false }`.
- Retry route: `POST /api/admin/health/jobs/[slug]/retry` — slug must match `/^[a-z0-9-]+$/` and be one of the slugs seen in `cron_runs`; calls `fetch(`${WEB_APP_ORIGIN}/api/v1/internal/${slug}`, { method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })` (verify the header shape against `requireCronSecret` in apps/web at dispatch); returns `{ data: { status, ok } }`; audit `cron_job_retried` with `resourceType: 'cron_job'`, `resourceId: slug`, `metadata: { status }`.
- Signals: `count` = failed jobs; items = one per degraded/down service + top 3 Sentry issues; `critical` from `deriveCritical` with threshold 10 (Wave 4 reads the admin's preference).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/health/health-derivations.test.ts
import { describe, expect, it } from 'vitest';
import { deriveCritical, summariseCronRun } from '@/lib/server/health';
const report = (over: Partial<any>) => ({ services: [], errors: [], jobs: [], errorsLastHour: 0, checkedAt: 'x', ...over });
describe('health derivations', () => {
  it('fires the banner on an error spike with a stable fingerprint', () => {
    const c = deriveCritical(report({ errorsLastHour: 14, errors: [{ id: '1', shortId: 'PP-1', title: 'StripeSignatureVerificationError', culprit: 'api/webhooks/stripe', count: 14, lastSeen: '2026-09-08T06:40:00Z', permalink: 'p', hourly: [] }] }), { errorsPerHour: 10 });
    expect(c?.fingerprint).toBe('errors:PP-1');
    expect(c?.href).toBe('/health');
  });
  it('fires on a stripe webhook backlog and on repeated cron failures', () => {
    expect(deriveCritical(report({ services: [{ name: 'Stripe webhooks', state: 'degraded', short: '3/hr', meta: '' }] }), { errorsPerHour: 10 })?.fingerprint).toMatch(/^stripe-webhooks:/);
    expect(deriveCritical(report({ jobs: [{ source: 'Cron', name: 'expire-demos', error: 'timeout', when: 'x', attempts: '2 attempts', retryable: true, slug: 'expire-demos', consecutiveFailures: 2 }] }), { errorsPerHour: 10 })?.fingerprint).toBe('cron:expire-demos');
  });
  it('stays quiet below thresholds', () => { expect(deriveCritical(report({ errorsLastHour: 9 }), { errorsPerHour: 10 })).toBeNull(); });
  it('summariseCronRun ignores healthy jobs', () => {
    expect(summariseCronRun({ job_slug: 'x', last_status: 'ok', last_error: null, last_started_at: '2026-09-08T00:00:00Z', consecutive_failures: 0 } as any, new Date())).toBeNull();
    expect(summariseCronRun({ job_slug: 'x', last_status: 'failed', last_error: 'timeout after 30 s', last_started_at: '2026-09-06T00:00:00Z', consecutive_failures: 2 } as any, new Date('2026-09-08T00:00:00Z'))).toMatchObject({ source: 'Cron', name: 'x', error: 'timeout after 30 s', attempts: '2 attempts', retryable: true });
  });
});
```

```ts
// apps/admin/__tests__/health/sentry-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSentryClient, parseIssue } from '@/lib/server/sentry';
const sample = { id: '42', shortId: 'PROPERTY-PRO-7', title: 'TypeError: x', culprit: 'lib/compliance/score.ts', count: '6', lastSeen: '2026-09-08T09:00:00Z', permalink: 'https://propertypro.sentry.io/issues/42/', stats: { '24h': [[1, 0], [2, 3]] } };
describe('sentry client', () => {
  it('parses a raw issue', () => { expect(parseIssue(sample)).toMatchObject({ shortId: 'PROPERTY-PRO-7', count: 6, hourly: [0, 3] }); });
  it('returns null without a token', () => { delete process.env.SENTRY_API_TOKEN; expect(createSentryClient()).toBeNull(); });
  it('calls the regional issues endpoint with the bearer token', async () => {
    process.env.SENTRY_API_TOKEN = 't'; process.env.SENTRY_ORG = 'propertypro';
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([sample]))) as any;
    const issues = await createSentryClient(fetchImpl)!.listIssues('property-pro');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://us.sentry.io/api/0/projects/propertypro/property-pro/issues/?query=is%3Aunresolved&statsPeriod=24h&sort=freq&limit=10');
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer t');
    expect(issues[0]!.count).toBe(6);
  });
});
```

```ts
// apps/admin/__tests__/health/retry-route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: async () => ({ id: 'u', email: 'e', role: 'super_admin' }) }));
const logAdminAction = vi.fn(async () => {});
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: (p: unknown) => logAdminAction(p) }));
vi.mock('@/lib/server/health', () => ({ listKnownJobSlugs: async () => ['expire-demos'] }));
import { POST } from '@/app/api/admin/health/jobs/[slug]/retry/route';
describe('POST /api/admin/health/jobs/[slug]/retry', () => {
  it('calls the web cron with the secret and audits', async () => {
    process.env.CRON_SECRET = 's'; process.env.WEB_APP_ORIGIN = 'https://www.getpropertypro.com';
    global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as any;
    const res = await POST(new NextRequest('http://a/x', { method: 'POST' }), { params: Promise.resolve({ slug: 'expire-demos' }) });
    expect(res.status).toBe(200);
    expect((global.fetch as any).mock.calls[0][0]).toBe('https://www.getpropertypro.com/api/v1/internal/expire-demos');
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'cron_job_retried', resourceId: 'expire-demos' }));
  });
  it('404s an unknown slug without calling anything', async () => {
    global.fetch = vi.fn() as any;
    expect((await POST(new NextRequest('http://a/x', { method: 'POST' }), { params: Promise.resolve({ slug: '../etc' }) })).status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2–3:** red → implement. Page: `ServicesStrip` (pill per service: dot `bg-status-success|warning|danger|neutral` **and** the state word for screen readers, name, short), `ErrorsList` (Sentry rows with `Bug` icon tinted by count, mono title, culprit, count + `MiniBars` hourly, `Create ticket` → `/tickets/new?ref=${id}&title=${encodeURIComponent(title)}`, `Open in Sentry ↗` link; when `errors === null` an `AlertBanner status="info"` "Sentry is not configured — set SENTRY_API_TOKEN" or the error state), `FailedJobsList` (source `Badge`, name, mono error, when · attempts, `Retry` for retryable rows with a spinner and result toast; `Retry all (n)` in the section header). Header description `Production errors, failed jobs and service status.`; `Checked {n}s ago` from `checkedAt`; the page revalidates on focus via `router.refresh()` every 60 s.
- [ ] **Step 4:** `pnpm test apps/admin/__tests__/health` → PASS. Browser: `/health` with and without `SENTRY_API_TOKEN` set; the critical banner appears when `errorsLastHour ≥ 10` (simulate by setting the threshold to 0 in a local env override and restore).
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): health — service probes, Sentry issues, failed jobs with cron retry, critical banner signal"`

### Task 24 (slice 3c): Billing — Stripe reads and the five safe actions

**Files:**
- Create: `apps/admin/src/lib/server/billing.ts`, `apps/admin/src/lib/server/billing-cache.ts`, `apps/admin/src/app/api/admin/billing/subscriptions/route.ts`, `apps/admin/src/app/api/admin/communities/[id]/billing/route.ts`, `apps/admin/src/app/api/admin/communities/[id]/billing/{change-plan,extend-trial,apply-coupon,pause,cancel}/route.ts`, `apps/admin/src/lib/server/billing-actions.ts`
- Modify: `apps/admin/src/lib/audit/log-admin-action.ts` (five `subscription_*` actions), `apps/admin/src/lib/server/signals/billing.ts` (fill)
- Test: `apps/admin/__tests__/billing/billing-mapping.test.ts`, `apps/admin/__tests__/billing/billing-actions.test.ts`, `apps/admin/__tests__/billing/billing-routes.test.ts`

**Interfaces:**
```ts
// lib/server/billing.ts
export interface BillingRow { communityId: number | null; communityName: string; plan: string; status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'other'; mrrCents: number; interval: 'month' | 'year' | null; renewsAt: string | null; trialEndsAt: string | null; pastDueSince: string | null; hasCoupon: boolean; stripeSubscriptionId: string; stripeCustomerId: string }
export function mapSubscription(sub: Stripe.Subscription, community: { id: number; name: string; subscription_plan: string | null } | undefined): BillingRow   // pure: mrr = unit_amount × quantity (÷12 for year)
export interface BillingOverview { rows: BillingRow[]; kpis: { mrrCents: number; mrrDeltaPct: number | null; pastDueCents: number; trialsEnding14d: number; couponsActive: number }; series: MonthPoint[]; syncedAt: string; truncated: boolean }
export async function getBillingOverview(): Promise<BillingOverview>   // stripe.subscriptions.list({ status: 'all', limit: 100 }) paged to 500, joined to communities by stripe_subscription_id; cached 5 min (billing-cache.ts: in-process Map with expiry, exported `invalidateBillingCache()`)
export interface CommunityBilling { row: BillingRow | null; invoices: { id: string; number: string | null; date: string; amountCents: number; status: string; hostedUrl: string | null }[]; timeline: { text: string; when: string; tone: SignalTone }[]; stripeDashboardUrl: string; livemode: boolean }
export async function getCommunityBilling(communityId: number): Promise<CommunityBilling>
// lib/server/billing-actions.ts — each: loads the community, asserts stripe_subscription_id, asserts mode (stripeKeyLivemode(STRIPE_SECRET_KEY) === (process.env.STRIPE_EXPECTED_LIVEMODE !== 'false')), calls Stripe with an idempotencyKey, invalidates the cache, returns { before, after } summaries for the audit row
export async function changePlan(communityId, input: { planId: string }, actor): Promise<ActionResult>          // price from stripe_prices by (plan_id, community_type, current interval); stripe.subscriptions.update(items:[{id, price}], proration_behavior:'always_invoice'), idempotencyKey `admin:change-plan:${subId}:${priceId}`
export async function extendTrial(communityId, input: { days: 7 | 14 | 30 }, actor)                              // trial_end = max(now, current trial_end) + days, proration_behavior:'none', idempotencyKey `admin:extend-trial:${subId}:${trialEnd}`
export async function applyCoupon(communityId, input: { coupon: string }, actor)                               // stripe.coupons.retrieve first (404 → ValidationError), then subscriptions.update({ discounts: [{ coupon }] })
export async function pauseSubscription(communityId, input: { resume: boolean }, actor)                         // pause_collection: resume ? '' : { behavior: 'mark_uncollectible' }
export async function cancelSubscription(communityId, input: { atPeriodEnd: boolean }, actor)                   // atPeriodEnd ? update({ cancel_at_period_end: true }) : subscriptions.cancel(id)
```
- Routes: `GET /api/admin/billing/subscriptions?status=` → `{ data: BillingOverview }` (status filter applied server-side); `GET /api/admin/communities/[id]/billing` → `{ data: CommunityBilling }`; the five `POST`s take `{ confirm: true, …input }` (`confirm` literal `true` required — the UI's `AlertDialog` sets it; a missing `confirm` 400s), 200 `{ data: { after } }`, audit `subscription_plan_changed` / `subscription_trial_extended` / `subscription_coupon_applied` / `subscription_paused` / `subscription_canceled` with `communityId`, `oldValues`, `newValues`. Admin never writes `communities.subscription_*` (spec D17).
- Signals: `count` = past-due rows; items = each past-due row (tone `warning`, icon `creditCard`, `"${name} is ${n} days past due"`, href `/clients/${id}?tab=billing`); `critical` null (health owns the banner).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/billing/billing-mapping.test.ts
import { describe, expect, it } from 'vitest';
import { mapSubscription } from '@/lib/server/billing';
const sub = (over: any = {}) => ({ id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: 1760659200, trial_end: null, discounts: [], items: { data: [{ price: { unit_amount: 24000, recurring: { interval: 'month' } }, quantity: 1 }] }, ...over });
describe('mapSubscription', () => {
  it('monthly MRR is the unit amount', () => { expect(mapSubscription(sub() as any, { id: 1, name: 'Bayview', subscription_plan: 'professional' }).mrrCents).toBe(24000); });
  it('annual MRR is the unit amount over 12', () => { expect(mapSubscription(sub({ items: { data: [{ price: { unit_amount: 240000, recurring: { interval: 'year' } }, quantity: 1 }] } }) as any, undefined).mrrCents).toBe(20000); });
  it('an orphan subscription keeps a name and null community', () => {
    const row = mapSubscription(sub() as any, undefined);
    expect(row.communityId).toBeNull(); expect(row.communityName).toBe('Unlinked · cus_1');
  });
  it('maps past_due with the period end as pastDueSince and flags coupons', () => {
    const row = mapSubscription(sub({ status: 'past_due', discounts: [{ id: 'di_1' }] }) as any, undefined);
    expect(row.status).toBe('past_due'); expect(row.pastDueSince).toBe('2025-10-17T00:00:00.000Z'); expect(row.hasCoupon).toBe(true);
  });
});
```

```ts
// apps/admin/__tests__/billing/billing-actions.test.ts
import { describe, expect, it, vi } from 'vitest';
const update = vi.fn(async () => ({ id: 'sub_1', status: 'active', items: { data: [] } }));
vi.mock('@/lib/stripe', () => ({ getStripeClient: () => ({ subscriptions: { retrieve: async () => ({ id: 'sub_1', trial_end: 1760000000, items: { data: [{ id: 'si_1', price: { recurring: { interval: 'month' } } }] } }), update }, coupons: { retrieve: async (c: string) => { if (c !== 'SUMMER') throw Object.assign(new Error('no'), { statusCode: 404 }); return { id: c }; } } }) }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => ({ select: () => ({ eq: () => ({ is: () => ({ single: async () => ({ data: { id: 1, name: 'Bayview', community_type: 'condo_718', stripe_subscription_id: 'sub_1', subscription_plan: 'essentials' }, error: null }) }), single: async () => ({ data: { id: 1, name: 'Bayview', community_type: 'condo_718', stripe_subscription_id: 'sub_1', subscription_plan: 'essentials' }, error: null }), eq: () => ({ eq: () => ({ single: async () => ({ data: { stripe_price_id: 'price_pro_m' }, error: null }) }) }) }) }) }) }) }));
import { applyCoupon, changePlan, extendTrial } from '@/lib/server/billing-actions';
const actor = { id: 'u', email: 'e' };
describe('billing actions', () => {
  it('changePlan updates the item price with an idempotency key and always_invoice', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    await changePlan(1, { planId: 'professional' }, actor);
    expect(update).toHaveBeenCalledWith('sub_1', expect.objectContaining({ items: [{ id: 'si_1', price: 'price_pro_m' }], proration_behavior: 'always_invoice' }), { idempotencyKey: 'admin:change-plan:sub_1:price_pro_m' });
  });
  it('refuses to run against the wrong Stripe mode', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_x'; process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    await expect(changePlan(1, { planId: 'professional' }, actor)).rejects.toThrow(/mode/i);
  });
  it('extendTrial adds days to the later of now and the current trial end', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
    await extendTrial(1, { days: 14 }, actor);
    const arg = update.mock.calls.at(-1)![1] as any;
    expect(arg.trial_end).toBe(Math.floor(Date.parse('2026-09-22T00:00:00Z') / 1000));
    vi.useRealTimers();
  });
  it('applyCoupon validates the coupon before touching the subscription', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    await expect(applyCoupon(1, { coupon: 'NOPE' }, actor)).rejects.toThrow(/coupon/i);
  });
});
```

```ts
// apps/admin/__tests__/billing/billing-routes.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: async () => ({ id: 'u', email: 'e', role: 'super_admin' }) }));
const logAdminAction = vi.fn(async () => {});
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: (p: unknown) => logAdminAction(p) }));
const cancelSubscription = vi.fn(async () => ({ before: { status: 'active' }, after: { status: 'active', cancelAtPeriodEnd: true } }));
vi.mock('@/lib/server/billing-actions', () => ({ cancelSubscription: (...a: unknown[]) => cancelSubscription(...a) }));
import { POST } from '@/app/api/admin/communities/[id]/billing/cancel/route';
const req = (body: unknown) => new NextRequest('http://a/x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
describe('POST …/billing/cancel', () => {
  it('requires confirm: true', async () => {
    expect((await POST(req({ atPeriodEnd: true }), { params: Promise.resolve({ id: '1' }) })).status).toBe(400);
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
  it('cancels and audits with community_id', async () => {
    const res = await POST(req({ confirm: true, atPeriodEnd: true }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'subscription_canceled', communityId: 1, newValues: expect.objectContaining({ cancelAtPeriodEnd: true }) }));
  });
});
```

- [ ] **Step 2–3:** red → implement. The mode guard: `const expected = process.env.STRIPE_EXPECTED_LIVEMODE !== 'false'; const actual = stripeKeyLivemode(process.env.STRIPE_SECRET_KEY); if (actual !== expected) throw new AppError('Stripe key mode does not match STRIPE_EXPECTED_LIVEMODE — refusing to change a subscription', 500, 'STRIPE_MODE_MISMATCH')` (verify the web app's equivalent env name at dispatch — `getExpectedLivemode` in `apps/web/src/lib/services/stripe-service.ts` — and reuse its variable name).
- [ ] **Step 4:** `pnpm test apps/admin/__tests__/billing` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): billing overview from Stripe, per-community billing, five audited subscription actions"`

### Task 25 (slice 3c): Billing pages — `/billing` and the workspace Billing tab

**Files:**
- Create: `apps/admin/src/app/(console)/billing/page.tsx`, `apps/admin/src/app/(console)/billing/loading.tsx`, `apps/admin/src/components/billing/{BillingList,BillingKpis}.tsx`, `apps/admin/src/components/clients/{BillingActionDialog,InvoicesCard,SubscriptionTimeline}.tsx`
- Modify: `apps/admin/src/components/clients/BillingTab.tsx` (replace the Wave 2 placeholder body)
- Test: `apps/admin/__tests__/billing/billing-action-dialog.test.tsx`

- `/billing`: header `Billing` / `Subscriptions across all communities. Synced from Stripe ${distance} ago.`; four `KpiCard`s (MRR with `mrrDeltaPct`, Past due `invertTrend`, Trials ending (14d), Coupons active); `QuickFilterTabs` All/Past due/Trialing/Canceled with counts; rows → `/clients/${communityId}?tab=billing` (orphans link to the Stripe dashboard); `EmptyState` copy from the design.
- `BillingTab`: current plan card (plan, `$X / month · renews … · card ••••` — card last4 from `getCommunityBilling` via the default payment method, omitted when absent), status `Badge`, the six action tiles (`Change plan`, `Extend trial`, `Apply coupon`, `Pause / cancel`, `Open in Stripe ↗`, and **`Issue refund ↗`** as a deep link to the Stripe customer page — spec D17), `InvoicesCard`, `SubscriptionTimeline`. `BillingActionDialog` = `AlertDialog` with the action's fields (plan `<select>` from `stripe_prices` plan ids; days radio 7/14/30; coupon input; pause/resume + cancel-at-period-end/now radios), a one-line consequence sentence, `Confirm` posts `{ confirm: true, … }`, `AlertBanner status="danger"` on failure, `router.refresh()` on success. Wire `?tab=billing` deep links in `ClientWorkspace` (read `useSearchParams().get('tab')` as the initial tab).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/__tests__/billing/billing-action-dialog.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { BillingActionDialog } from '@/components/clients/BillingActionDialog';
describe('BillingActionDialog', () => {
  it('posts confirm: true only after the operator confirms', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: {} }))) as any;
    render(<BillingActionDialog communityId={1} action="extend-trial" open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByLabelText('14 days'));
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as any).mock.calls[0][1].body)).toEqual({ confirm: true, days: 14 });
    expect((global.fetch as any).mock.calls[0][0]).toBe('/api/admin/communities/1/billing/extend-trial');
  });
});
```

- [ ] **Step 2–4:** red → implement → `pnpm test apps/admin/__tests__/billing apps/admin/__tests__/clients` green → browser check against Stripe **test mode** only (`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_EXPECTED_LIVEMODE=false`): extend a seeded trial by 7 days and see the audit row in `platform_admin_audit_log`.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): billing page and workspace billing tab with confirmed actions"`

### Task 26 (slice 3d): Onboarding pipeline

**Files:**
- Create: `apps/admin/src/lib/server/onboarding.ts`, `apps/admin/src/app/api/admin/onboarding/route.ts`, `apps/admin/src/app/(console)/onboarding/page.tsx`, `apps/admin/src/app/(console)/onboarding/loading.tsx`, `apps/admin/src/components/onboarding/{PipelineBoard,StageColumn,PipelineCard,TrialChecklist}.tsx`
- Modify: `apps/admin/src/lib/server/signals/onboarding.ts` (fill)
- Test: `apps/admin/__tests__/onboarding/onboarding-derivation.test.ts`

**Interfaces:**
```ts
export type Stage = 'lead' | 'demo' | 'trial' | 'active';
export interface PipelineCard { id: string; stage: Stage; name: string; meta: string; pct: number; steps: string; blocker: string | null; next: string; href: string; occurredAt: string }
export interface Pipeline { stages: Record<Stage, PipelineCard[]>; checklist: { communityId: number; name: string; trialEndsAt: string | null; items: { key: string; label: string; done: boolean; meta: string }[] } | null }
export function deriveStages(input: DeriveInput, now: Date): Record<Stage, PipelineCard[]>   // pure, tested
export function humanizeItemKey(key: string): string    // 'owner_roster_imported' → 'Owner roster imported'
export async function getPipeline(focusCommunityId?: number): Promise<Pipeline>
```
- Sources (spec D21): `marketing_leads` status in (`new`,`contacted`,`qualified`) → lead cards (`meta: "${units} units · ${source}"`, `next`: new→`Reply & offer a demo`, contacted→`Follow up`, qualified→`Create demo`, href `/leads?status=…`); `demo_instances` not converted and not deleted → demo cards (`meta: "Demo day ${age}"`, blocker `Demo stale in ${30-age} days` when age ≥ 20 using the `stale-badge` thresholds, `next`: `Convert to trial or archive`, href `/demo`); communities with `subscription_status = 'trialing'` → trial cards (`pct` = completed/total from `onboarding_checklist_items` where `deleted_at is null`, `steps: "${done}/${total}"`, blockers: no `root_manager` in `user_roles` → `Root manager not claimed`; `subscription_current_period_end_at` within 7 days → `Trial ends in N days`; `next` = `humanizeItemKey(firstIncomplete)` or `Send payment link` when all done, href `/clients/${id}`); active within 30 days (`subscription_status = 'active'` and `created_at >= now-30d`) → `next: '30-day check-in call'`.
- The page focuses the checklist section on `?community=` or the trial ending soonest. Mobile shows a stage segmented control; desktop shows the four columns (`grid gap-4 lg:grid-cols-4 md:grid-cols-2`).
- Signals: `count` = cards with a blocker; items = those cards (tone `warning`, icon `building`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/__tests__/onboarding/onboarding-derivation.test.ts
import { describe, expect, it } from 'vitest';
import { deriveStages, humanizeItemKey } from '@/lib/server/onboarding';
const now = new Date('2026-09-08T00:00:00Z');
describe('onboarding derivation', () => {
  it('humanizes checklist keys', () => { expect(humanizeItemKey('owner_roster_imported')).toBe('Owner roster imported'); });
  it('places rows in stages with progress and blockers', () => {
    const stages = deriveStages({
      leads: [{ id: 1, association_name: 'Oceanview', unit_count: 86, source: 'compliance_checker', status: 'new', created_at: '2026-09-07T00:00:00Z' }],
      demos: [{ id: 2, prospect_name: 'Palmetto Ridge', created_at: '2026-08-15T00:00:00Z', is_converted: false }],
      trials: [{ id: 3, name: 'Pelican Bay', created_at: '2026-08-28T00:00:00Z', subscription_current_period_end_at: '2026-09-12T00:00:00Z', hasRoot: false, checklist: [{ item_key: 'root_claimed', completed_at: 'x' }, { item_key: 'owner_roster_imported', completed_at: null }] }],
      active: [{ id: 4, name: 'Harbor Lights', created_at: '2026-08-20T00:00:00Z' }],
    }, now);
    expect(stages.lead[0]).toMatchObject({ name: 'Oceanview', next: 'Reply & offer a demo' });
    expect(stages.demo[0]!.blocker).toMatch(/stale in 6 days/);
    expect(stages.trial[0]).toMatchObject({ pct: 50, steps: '1/2', next: 'Owner roster imported' });
    expect(stages.trial[0]!.blocker).toBe('Root manager not claimed');
    expect(stages.active[0]!.next).toBe('30-day check-in call');
  });
});
```

- [ ] **Step 2–4:** red → implement → `pnpm test apps/admin/__tests__/onboarding` green → browser check at desktop and 390 px.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): onboarding pipeline derived from leads, demos, trials and checklists"`

### Task 27: Wave 3 integration, prod migration, PR

- [ ] Apply `0072` to prod (Supabase MCP `apply_migration` on `vbqobyagjzvlfpfozvmx`, statement order), verify with `information_schema.tables` + `pg_policies` (zero policies, RLS forced), insert the ledger row (`hash` = `shasum -a 256 packages/db/migrations/0072_support_tickets.sql`, `created_at` = the journal `when`), run `scripts/with-env-local.sh pnpm db:ledger:verify`. Do this **before** the Wave 3 PR merges (expand-before-code).
- [ ] Merge 3a, 3b, 3c, 3d onto the wave branch; gate: `pnpm lint && pnpm typecheck && pnpm test apps/admin && pnpm test packages/shared && pnpm --filter @propertypro/admin build && node scripts/verify-admin-semantic-css.cjs && pnpm guard:design-tokens && pnpm test:integration:local apps/web/__tests__/integration/support-tickets-rls.integration.test.ts`.
- [ ] Security review (money-moving routes, the retry route's slug validation, Sentry token handling) + code review; PR "W3: tickets, health, billing, onboarding". Merge before Wave 4.

---

## Wave 4 — Preferences, PWA, web push (one slice; shares `public/sw.js` and `PlatformSettings.tsx`)

Prerequisites: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:ops@getpropertypro.com`), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `CRON_SECRET` on the admin Vercel project; migration `0073` applied to prod before the PR merges. Generate the keypair once with `pnpm exec web-push generate-vapid-keys` after Task 30 adds the dependency.

### Task 28: Migration `0073_platform_admin_preferences` + `platform_admin_push_subscriptions`, schema, typed rows, RLS test

**Files:**
- Create: `packages/db/migrations/0073_platform_admin_preferences.sql` (via `pnpm db:migration:new platform_admin_preferences`), `packages/db/src/schema/platform-admin-preferences.ts`, `packages/db/src/schema/platform-admin-push-subscriptions.ts`, `apps/web/__tests__/integration/platform-admin-preferences-rls.integration.test.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/schema/rls-config.ts` (two exclusions), `packages/db/src/supabase/admin-types.ts` (`PlatformAdminPreferencesRow`, `PlatformAdminPushSubscriptionRow` + `AdminTable` entries)

```sql
CREATE TABLE "platform_admin_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "notifications_read_at" timestamptz,
  "alert_prefs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "push_sent_fingerprints" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_admin_preferences_alert_prefs_object" CHECK (jsonb_typeof("alert_prefs") = 'object'),
  CONSTRAINT "platform_admin_preferences_fingerprints_array" CHECK (jsonb_typeof("push_sent_fingerprints") = 'array')
);--> statement-breakpoint
CREATE TABLE "platform_admin_push_subscriptions" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_success_at" timestamptz,
  "failure_count" integer NOT NULL DEFAULT 0,
  CONSTRAINT "platform_admin_push_subscriptions_endpoint_https" CHECK ("endpoint" LIKE 'https://%')
);--> statement-breakpoint
CREATE INDEX "platform_admin_push_subscriptions_user_idx" ON "platform_admin_push_subscriptions" ("user_id");--> statement-breakpoint
-- then the identical ENABLE/FORCE/REVOKE/GRANT block as 0072 for both tables and the sequence of the second
```

Integration test: same shape as Task 20's (anon/authenticated denied on both tables; service_role upsert of a preferences row; the `endpoint LIKE 'https://%'` CHECK rejects `http://`).

- [ ] Steps: re-verify the number (`0073` free: prod tip after Task 27 is `0072`) → scaffold → test red → migration + schema + config → `pnpm db:test-local:reset && pnpm test:integration:local apps/web/__tests__/integration/platform-admin-preferences-rls.integration.test.ts && pnpm --filter @propertypro/db typecheck && MIGRATION_BASELINE_REQUIRED=1 pnpm exec tsx scripts/verify-migration-ordering.ts` green → commit `feat(db): 0073 platform_admin_preferences + push subscriptions`.

### Task 29: Preferences service and routes; tray read watermark; Settings "Alerts & push notifications"

**Files:**
- Create: `apps/admin/src/lib/server/preferences.ts`, `apps/admin/src/app/api/admin/preferences/route.ts`, `apps/admin/src/app/api/admin/preferences/read-all/route.ts`, `apps/admin/src/components/settings/AlertPrefsSection.tsx`
- Modify: `apps/admin/src/components/shell/AdminShell.tsx` (readAt from the server; `onMarkAllRead` posts), `apps/admin/src/app/(console)/layout.tsx` (loads preferences), `apps/admin/src/components/settings/PlatformSettings.tsx` (insert the section), `apps/admin/src/app/(console)/settings/page.tsx` (passes prefs), `apps/admin/src/lib/server/signals/health.ts` (threshold from prefs — read via a parameter with default 10)
- Test: `apps/admin/__tests__/preferences/preferences.test.ts`, `apps/admin/__tests__/preferences/alert-prefs-section.test.tsx`

**Interfaces:**
```ts
export const ALERT_PREF_KEYS = ['errorSpikes', 'paymentFailures', 'newSupportThreads', 'deletionReminders', 'newLeadsDigest'] as const;
export type AlertPrefs = Record<typeof ALERT_PREF_KEYS[number], boolean> & { errorSpikeThreshold: number };
export const DEFAULT_ALERT_PREFS: AlertPrefs = { errorSpikes: true, paymentFailures: true, newSupportThreads: true, deletionReminders: true, newLeadsDigest: false, errorSpikeThreshold: 10 };
export interface AdminPreferences { notificationsReadAt: string | null; alertPrefs: AlertPrefs; pushSentFingerprints: string[] }
export function parseAlertPrefs(raw: unknown): AlertPrefs   // pure: unknown keys dropped, missing keys defaulted, threshold clamped to [1, 1000]
export async function getPreferences(userId: string): Promise<AdminPreferences>            // defaults when no row
export async function updateAlertPrefs(userId: string, patch: Partial<AlertPrefs>): Promise<AdminPreferences>  // upsert
export async function markAllRead(userId: string, at?: Date): Promise<AdminPreferences>
// routes: GET /api/admin/preferences → { data }, PUT /api/admin/preferences { alertPrefs: Partial } → { data }, POST /api/admin/preferences/read-all → { data }
```
- `AlertPrefsSection` props `{ initial: AlertPrefs }` — the five rows from the design with `Switch` (`aria-label` = the row label), threshold number input under "Production error spikes", each change `PUT`s immediately with an optimistic toggle and `AlertBanner` on failure. The design's `Push + banner when errors exceed 10/hr` meta strings are the row descriptions.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/preferences/preferences.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_PREFS, parseAlertPrefs } from '@/lib/server/preferences';
describe('parseAlertPrefs', () => {
  it('defaults everything for a null row', () => { expect(parseAlertPrefs(null)).toEqual(DEFAULT_ALERT_PREFS); });
  it('drops unknown keys and clamps the threshold', () => {
    expect(parseAlertPrefs({ errorSpikes: false, evil: true, errorSpikeThreshold: 0 })).toEqual({ ...DEFAULT_ALERT_PREFS, errorSpikes: false, errorSpikeThreshold: 1 });
    expect(parseAlertPrefs({ errorSpikeThreshold: 5000 }).errorSpikeThreshold).toBe(1000);
  });
});
```

```tsx
// apps/admin/__tests__/preferences/alert-prefs-section.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlertPrefsSection } from '@/components/settings/AlertPrefsSection';
import { DEFAULT_ALERT_PREFS } from '@/lib/server/preferences';
describe('AlertPrefsSection', () => {
  it('PUTs the toggled pref and keeps the switch labelled', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { alertPrefs: { ...DEFAULT_ALERT_PREFS, newLeadsDigest: true } } }))) as any;
    render(<AlertPrefsSection initial={DEFAULT_ALERT_PREFS} />);
    const sw = screen.getByRole('switch', { name: 'New leads' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as any).mock.calls[0][1].body)).toEqual({ alertPrefs: { newLeadsDigest: true } });
    expect((global.fetch as any).mock.calls[0][1].method).toBe('PUT');
  });
});
```

- [ ] **Step 2–4:** red → implement (`createAdminTypedClient().from('platform_admin_preferences').upsert(...)`; the read-all route stamps `new Date()`; `AdminShell` receives `readAt` from the layout and calls `POST /api/admin/preferences/read-all` on `Mark all read`, updating local state on 200) → `pnpm test apps/admin/__tests__/preferences apps/admin/__tests__/shell` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): per-admin preferences — read watermark and alert prefs"`

### Task 30: PWA — manifest, icons, service worker (read-only offline), install prompt, offline banner wiring

**Files:**
- Create: `apps/admin/src/app/manifest.ts`, `apps/admin/public/sw.js`, `apps/admin/public/icons/icon-192.png`, `apps/admin/public/icons/icon-512.png`, `apps/admin/public/icons/maskable-512.png`, `scripts/generate-admin-icons.mjs`, `apps/admin/src/components/shell/ServiceWorkerRegistration.tsx`, `apps/admin/src/components/settings/InstallAppSection.tsx`, `apps/admin/src/lib/pwa/{install-prompt,sw-cache-policy}.ts`
- Modify: `apps/admin/src/app/layout.tsx` (`<ServiceWorkerRegistration />`, `manifest` + `appleWebApp` metadata), `apps/admin/src/lib/middleware/security-headers.ts` (`manifest-src 'self'` — extend `buildCspHeader` in `packages/shared/src/http/security-headers.ts` with an optional `manifestSrc` if it has none; verify at dispatch), `apps/admin/src/components/shell/{AdminShell,OfflineBanner}.tsx` (cached-at from the SW), `apps/admin/src/components/settings/PlatformSettings.tsx` (insert `InstallAppSection`)
- Test: `apps/admin/__tests__/pwa/sw-cache-policy.test.ts`, `apps/admin/__tests__/pwa/install-prompt.test.ts`

**Interfaces:**
```ts
// lib/pwa/sw-cache-policy.ts — pure, imported by sw.js via a build-free copy: keep the function tiny and DUPLICATE it verbatim inside sw.js under a `// mirror of lib/pwa/sw-cache-policy.ts` comment (the SW cannot import TS; ponytail: 12 lines duplicated beats a bundler)
export type CachePolicy = 'static-cache-first' | 'navigation-network-first' | 'bypass';
export function classifyRequest(req: { method: string; url: string; mode: string }, origin: string): CachePolicy
//   non-GET → bypass; cross-origin → bypass; /api/ → bypass; /_next/static/ or /fonts/ or /icons/ → static-cache-first; mode 'navigate' → navigation-network-first; else bypass
// lib/pwa/install-prompt.ts
export function captureInstallPrompt(win: Window): { canInstall(): boolean; prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'>; isIos: boolean; isStandalone: boolean }
```
- `sw.js`: `CACHE = 'ppro-admin-v1'`; on `install` precache `/offline` (a static route added under `app/offline/page.tsx` outside the console group: "You're offline — open the console once you reconnect."), on `activate` delete other caches; `fetch` handler follows `classifyRequest`; navigation responses are cloned into the cache with a `Date` header preserved; on network failure serve the cached page or `/offline`; posts `{ type: 'served-from-cache', cachedAt }` to the client so `OfflineBanner` shows the age. Also contains the `push` and `notificationclick` handlers from Task 31 (same file).
- `ServiceWorkerRegistration`: `useEffect` registering `/sw.js` when `process.env.NODE_ENV === 'production'` and `'serviceWorker' in navigator`; listens for the `served-from-cache` message and stores `cachedAt` in a tiny context read by `OfflineBanner`.
- `manifest.ts`: `{ name: 'PropertyPro Ops', short_name: 'PP Ops', start_url: '/dashboard', display: 'standalone', background_color: '#FBF7F1', theme_color: '#CB6047', icons: [192, 512, maskable] }` — the two hex values are the `--sand-50` and `--coral-500` token values; add `// design-tokens:exempt — web manifest cannot read CSS variables` on each.
- `scripts/generate-admin-icons.mjs`: `sharp` (root devDependency) renders `apps/admin/src/app/icon.svg` at 192/512 and a padded maskable 512; run once, commit the PNGs, document the command in the file header.
- `InstallAppSection`: the design's card; button `Install app` calls `prompt()`; on iOS shows the Share → Add to Home Screen instruction; hidden when already standalone.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/pwa/sw-cache-policy.test.ts
import { describe, expect, it } from 'vitest';
import { classifyRequest } from '@/lib/pwa/sw-cache-policy';
const o = 'https://admin.getpropertypro.com';
describe('classifyRequest', () => {
  it('never touches mutations or APIs', () => {
    expect(classifyRequest({ method: 'POST', url: `${o}/api/admin/tickets`, mode: 'cors' }, o)).toBe('bypass');
    expect(classifyRequest({ method: 'GET', url: `${o}/api/admin/shell/signals`, mode: 'cors' }, o)).toBe('bypass');
  });
  it('caches static assets first and navigations network-first', () => {
    expect(classifyRequest({ method: 'GET', url: `${o}/_next/static/chunks/a.js`, mode: 'no-cors' }, o)).toBe('static-cache-first');
    expect(classifyRequest({ method: 'GET', url: `${o}/dashboard`, mode: 'navigate' }, o)).toBe('navigation-network-first');
  });
  it('bypasses other origins', () => { expect(classifyRequest({ method: 'GET', url: 'https://api.stripe.com/v1', mode: 'cors' }, o)).toBe('bypass'); });
  it('sw.js mirrors the policy verbatim', async () => {
    const { readFileSync } = await import('node:fs');
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    for (const needle of ["'/api/'", "'/_next/static/'", "mode === 'navigate'", "method !== 'GET'"]) expect(sw).toContain(needle);
  });
});
```

```ts
// apps/admin/__tests__/pwa/install-prompt.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '@/lib/pwa/install-prompt';
describe('captureInstallPrompt', () => {
  it('reports unavailable until the browser fires beforeinstallprompt, then prompts', async () => {
    const ip = captureInstallPrompt(window);
    expect(ip.canInstall()).toBe(false);
    expect(await ip.prompt()).toBe('unavailable');
    const ev = Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(ev);
    expect(ip.canInstall()).toBe(true);
    expect(await ip.prompt()).toBe('accepted');
  });
});
```

- [ ] **Step 2–4:** red → implement → `pnpm test apps/admin/__tests__/pwa` green → `pnpm --filter @propertypro/admin build && pnpm --filter @propertypro/admin start` then in the browser: Application → Manifest installable, SW registered, go offline → `/dashboard` reloads from cache with the banner and its age, a POST while offline shows the blocking message; `curl -I http://localhost:3001/manifest.webmanifest` has `manifest-src 'self'` in CSP.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): installable PWA with read-only offline shell"`

### Task 31: Web push — subscriptions, SW push handler, dispatch cron

**Files:**
- Create: `apps/admin/src/lib/server/push.ts`, `apps/admin/src/app/api/admin/push/subscriptions/route.ts`, `apps/admin/src/app/api/admin/internal/push-dispatch/route.ts`, `apps/admin/src/components/settings/PushToggle.tsx`, `apps/admin/src/lib/pwa/push-subscribe.ts`
- Modify: `apps/admin/package.json` (`web-push@^3.6.7`, `@types/web-push`), `apps/admin/public/sw.js` (push + notificationclick), `apps/admin/vercel.json` (`crons: [{ path: '/api/admin/internal/push-dispatch', schedule: '*/15 * * * *' }]`), `apps/admin/src/components/settings/AlertPrefsSection.tsx` (mount `PushToggle`), `apps/admin/src/middleware.ts` (allow `/api/admin/internal/*` through the admin-session check when it carries the cron bearer — mirror how web's middleware exempts `/api/v1/internal`), `.env.example` (VAPID vars), `apps/admin/src/lib/audit/log-admin-action.ts` (`push_subscription_added`, `push_subscription_removed`)
- Test: `apps/admin/__tests__/push/push-dispatch.test.ts`, `apps/admin/__tests__/push/push-routes.test.ts`

**Interfaces:**
```ts
// lib/server/push.ts
export interface PushCandidate { fingerprint: string; title: string; body: string; url: string; prefKey: keyof AlertPrefs }
export function candidatesFromSignals(signals: ShellSignals, prefs: AlertPrefs): PushCandidate[]   // pure: critical → errorSpikes; billing items → paymentFailures; inbox items → newSupportThreads; deletion items → deletionReminders; leads items → newLeadsDigest (only when the hour is 08 local — the design says daily digest at 8:00)
export function selectUnsent(candidates: PushCandidate[], sent: string[]): { send: PushCandidate[]; nextSent: string[] }   // pure: dedupe by fingerprint, keep the last 200 fingerprints
export async function dispatchPush(deps?: Partial<PushDeps>): Promise<{ admins: number; sent: number; failed: number; pruned: number }>
//   for each platform admin: prefs + subscriptions → candidates → selectUnsent → webpush.sendNotification per subscription (410/404 → delete the subscription, count pruned; other errors → failure_count+1) → persist nextSent in preferences
// routes: POST /api/admin/push/subscriptions { endpoint, keys: { p256dh, auth } } → 201 (upsert on endpoint) + audit; DELETE { endpoint } → 200 + audit
// POST /api/admin/internal/push-dispatch — `authorization: Bearer ${CRON_SECRET}` else 401; no session; returns the counts; never throws for a single subscription failure
```
- `push-subscribe.ts`: `subscribeToPush(reg: ServiceWorkerRegistration, vapidPublicKey: string)` → `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })` then `POST /api/admin/push/subscriptions`; `unsubscribeFromPush(reg)` → `sub.unsubscribe()` + `DELETE`.
- `PushToggle`: a `Switch` labelled `Push notifications on this device`; state from `reg.pushManager.getSubscription()`; asks `Notification.requestPermission()` on enable; explains when permission is denied.
- `sw.js` `push` handler: `event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }))`; `notificationclick`: focus an open client on `data.url` or `clients.openWindow(url)`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/admin/__tests__/push/push-dispatch.test.ts
import { describe, expect, it, vi } from 'vitest';
import { candidatesFromSignals, dispatchPush, selectUnsent } from '@/lib/server/push';
import { DEFAULT_ALERT_PREFS } from '@/lib/server/preferences';
const signals = { counts: { inbox: 1, tickets: 0, health: 0, onboarding: 0, billing: 1, leads: 0, deletion: 0 }, items: [
  { id: 'thread-1', tone: 'info' as const, icon: 'inbox' as const, title: 'New reply from Denise', meta: 'support@', href: '/inbox/1', occurredAt: '2026-09-08T09:14:00Z' },
  { id: 'billing-1', tone: 'warning' as const, icon: 'creditCard' as const, title: 'Bayview is 19 days past due', meta: '$240', href: '/clients/1?tab=billing', occurredAt: '2026-09-08T08:00:00Z' },
], critical: { fingerprint: 'errors:PP-1', text: 'Stripe webhook failing', shortText: 's', href: '/health' }, generatedAt: 'x', failed: [] };

describe('push', () => {
  it('maps signals to candidates gated by prefs', () => {
    const c = candidatesFromSignals(signals, DEFAULT_ALERT_PREFS);
    expect(c.map((x) => x.fingerprint)).toEqual(['errors:PP-1', 'thread-1', 'billing-1']);
    expect(candidatesFromSignals(signals, { ...DEFAULT_ALERT_PREFS, newSupportThreads: false }).some((x) => x.fingerprint === 'thread-1')).toBe(false);
  });
  it('never sends the same fingerprint twice and bounds the ledger', () => {
    const { send, nextSent } = selectUnsent([{ fingerprint: 'a', title: 't', body: 'b', url: '/', prefKey: 'errorSpikes' }], ['a', ...Array.from({ length: 250 }, (_, i) => `old-${i}`)]);
    expect(send).toEqual([]);
    expect(nextSent).toHaveLength(200);
  });
  it('prunes gone subscriptions and persists the sent ledger', async () => {
    const send = vi.fn(async (sub: { endpoint: string }) => { if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 }); });
    const deleted: string[] = []; const persisted: string[][] = [];
    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }],
      getPreferences: async () => ({ notificationsReadAt: null, alertPrefs: DEFAULT_ALERT_PREFS, pushSentFingerprints: [] }),
      getSignals: async () => signals,
      listSubscriptions: async () => [{ id: 1, endpoint: 'https://p/ok', p256dh: 'x', auth: 'y' }, { id: 2, endpoint: 'https://p/gone', p256dh: 'x', auth: 'y' }],
      sendNotification: send,
      deleteSubscription: async (id) => { deleted.push(String(id)); },
      recordFailure: async () => {},
      persistSent: async (_u, fps) => { persisted.push(fps); },
      now: () => new Date('2026-09-08T09:30:00Z'),
    });
    expect(result).toEqual({ admins: 1, sent: 3, failed: 3, pruned: 1 });
    expect(deleted).toEqual(['2']);
    expect(persisted[0]).toEqual(['errors:PP-1', 'thread-1', 'billing-1']);
  });
});
```

```ts
// apps/admin/__tests__/push/push-routes.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const dispatchPush = vi.fn(async () => ({ admins: 1, sent: 0, failed: 0, pruned: 0 }));
vi.mock('@/lib/server/push', () => ({ dispatchPush: () => dispatchPush() }));
import { POST } from '@/app/api/admin/internal/push-dispatch/route';
describe('POST /api/admin/internal/push-dispatch', () => {
  it('401s without the cron secret', async () => {
    process.env.CRON_SECRET = 's';
    expect((await POST(new NextRequest('http://a/x', { method: 'POST' }))).status).toBe(401);
    expect(dispatchPush).not.toHaveBeenCalled();
  });
  it('runs with the secret', async () => {
    process.env.CRON_SECRET = 's';
    const res = await POST(new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 'Bearer s' } }));
    expect(res.status).toBe(200);
    expect(dispatchPush).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2–4:** red → implement (`webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)` lazily in `push.ts`; the secret comparison uses `timingSafeEqual` over equal-length buffers) → `pnpm test apps/admin/__tests__/push` green → deploy to a preview, subscribe from Settings, trigger `curl -X POST -H "authorization: Bearer $CRON_SECRET" https://<preview>/api/admin/internal/push-dispatch` and receive a notification; confirm the Vercel cron is listed for the admin project (`vercel crons ls`).
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): web push — device subscriptions, SW handler, 15-minute dispatch cron"`

### Task 32: Settings "Integrations" section; Wave 4 gate, prod migration, PR

**Files:**
- Create: `apps/admin/src/components/settings/IntegrationsSection.tsx` (rows Stripe / Sentry / Resend / Supabase with a status `Badge` from `getHealthReport().services` plus `stripeKeyLivemode` for `Live mode` / `Test mode`), mounted in `PlatformSettings.tsx` after `InstallAppSection`.
- [ ] Apply `0073` to prod (same procedure as Task 27) before merge; `pnpm db:ledger:verify`.
- [ ] Gate: `pnpm lint && pnpm typecheck && pnpm test apps/admin && pnpm --filter @propertypro/admin build && node scripts/verify-admin-semantic-css.cjs && pnpm guard:design-tokens && pnpm test:integration:local apps/web/__tests__/integration/platform-admin-preferences-rls.integration.test.ts`.
- [ ] Security review (cron bearer comparison, push payload contents — never include email bodies or PII beyond a name, subscription endpoint handling) + code review; PR "W4: preferences, PWA, web push". Merge.

---

## Wave 5 — Close-out

### Task 33: Documentation and design-sync

- [ ] `CLAUDE.md`: in the admin paragraph, record the `(console)` layout, that `AdminLayout`/`Sidebar` are gone, the four new subsystems and their secrets, and that `verify-admin-semantic-css.cjs` now scans `packages/ui/src`. Add the two migrations to the migration-safety "current state" bullet (next free becomes `0074`).
- [ ] `DESIGN.md` §Design system: the lifted components now live in `packages/ui/src/components/{ui,shared}`; the deprecated `Button`/`Card` note is deleted; admin paints titles (`AdminPageHeader`) while web's `PageHeader` stays sr-only.
- [ ] `.claude/rules/design.md`: update the "Design system components" and "admin is NO LONGER frozen" notes; the `Sidebar.tsx` dark-internals paragraph is obsolete (the rail is on the light `nav-*` tokens now).
- [ ] `docs/runbooks/cron-alerting.md`: add the admin push-dispatch cron (18th job) and the Health page's `Retry`.
- [ ] Design project `github.md` (claude.ai/design `ed8d770b…`): update the screen map rows to the `(console)` paths and add rows for Tickets, Health, Billing, Onboarding, Settings sections. This is a DesignSync `finalize_plan` + `write_files` of one markdown file — get the user's go-ahead in chat before writing to the design project.
- [ ] Memory: one `project` note that the admin redesign shipped (waves, PR numbers, secrets provisioned, the `0072`/`0073` ledger state), and update `migration_0025_next_free_0026.md` to next-free `0074`.

### Task 34: Final verification gate

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @propertypro/admin build && pnpm --filter @propertypro/web build && node scripts/verify-admin-semantic-css.cjs && pnpm guard:class-resolution && pnpm guard:design-tokens && pnpm guard:token-coverage && pnpm perf:check`
- [ ] Full E2E locally: `pnpm test:e2e` (default suite) — `admin-shell` and `support-access` green; compare canary timings (`activation-smoke` ~0.7–4 s, `marketing-smoke` ~3 s).
- [ ] Post-merge production check: `/dashboard`, `/inbox`, `/tickets`, `/health`, `/billing`, `/onboarding` load for a real platform admin; `platform_admin_audit_log` receives a `ticket_created` row from a smoke ticket (then resolve it); the push cron appears in the admin project's Vercel crons; Sentry shows no new admin issues for 24 h.

---

## Self-review against the spec

- **Coverage:** D1 (T11), D2 (T11), D3–D5 (T1–T3), D6 (T4), D7 (T6), D8 (T8), D9 (T6, T15), D10 (T17), D11 (T7 + fills in T21/T23/T24/T26), D12 (T28–T29), D13 (T20–T22), D14–D15 (T16), D16–D17 (T24–T25), D18–D20 (T23), D21 (T26), D22 (T10 + T21 searcher), D23 (T31), D24 (T30), D25 (T14), D26 (T17), D27 (T17), D28 (T15, T18), D29 (T4, T11, T19), D30 (every UI task). Spec §7 states: `Skeleton`/`EmptyState`/`AlertBanner` are required in every list task. Spec §8 tests: unit (all tasks), integration RLS (T20, T28), e2e (T12), build-time guards (T5, T13, T19, T27, T32, T34), review gate (each wave's last task).
- **Placeholders:** the Wave 3 signal providers and the Wave 2 `BillingTab` are explicit seams with named fills, not TODOs. Five "verify at dispatch" notes remain by design (`EXPECTED_APEX_A`/`EXPECTED_CNAME` values, `ConflictError` availability, the cron bearer header shape, `getExpectedLivemode`'s env name, the layout-slug column) — the pre-dispatch verification step resolves them.
- **Type consistency:** `ShellSignals`/`ShellSignalItem`/`SignalProvider` (T7) are consumed unchanged by T9, T14, T21, T23, T24, T26, T29, T31; `NavSignalKey` (T6) keys `counts`; `AlertPrefs` (T29) feeds T23's threshold and T31's gating; `KpiCard` `onClick`/`deltaLabel` (T3) are what T14 uses; `SupportTicket*` constants (T20) are shared by T21–T22 and T16's link.
