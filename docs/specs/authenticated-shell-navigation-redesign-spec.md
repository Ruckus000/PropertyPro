# Authenticated Shell Navigation Redesign — Feature Specification

**Date:** March 26, 2026
**Status:** Approved — Ready for Implementation
**Scope:** Authenticated web app shell (`AppShell`, `AppSidebar`, `NavRail`, `AppTopBar`)
**Out of Scope:** Admin app navigation, `/mobile/*` route-group navigation, notification center implementation, bottom tab bar

---

## 1. Executive Summary

This specification redesigns the authenticated app shell around four coordinated changes:

1. **Sidebar navigation refresh** built on the existing `NavRail` + `AppSidebar` split rather than replacing it
2. **Top bar simplification** that makes search primary while preserving current account actions
3. **Mobile drawer refinement** that keeps the current drawer pattern but makes mobile behavior explicit and deterministic
4. **Global surface token update** from cool gray page backgrounds to a warmer stone-neutral page surface

The redesign is intentionally evolutionary. It preserves the current architectural boundaries, tenant-aware routing, command palette behavior, and PM/community context rules while modernizing the visual system and tightening accessibility and mobile behavior.

---

## 2. Goals

- Modernize the authenticated shell without collapsing shared UI primitives into app-specific components
- Preserve correct navigation semantics for links, disclosures, and upgrade-gated actions
- Make search the focal top-bar action without regressing settings, export, community switching, or sign-out
- Keep mobile navigation on the existing hamburger drawer pattern
- Improve shell cohesion by aligning navigation surfaces and page surfaces
- Express new visual decisions through semantic tokens where possible

## 3. Non-Goals

- No redesign of the separate admin app in `apps/admin`
- No changes to the `/mobile/*` route group's warm editorial navigation pattern
- No notification-center backend, panel, or unread-state implementation
- No bottom tab bar for the authenticated desktop/mobile shell
- No change to tenant resolution, role gating, or plan-gating business logic

---

## 4. Current Architecture (Verified)

The authenticated shell currently uses:

- `packages/ui/src/components/NavRail.tsx` as the shared collapsible nav primitive
- `apps/web/src/components/layout/app-sidebar.tsx` as the app-specific wrapper for nav config, role/feature gating, brand header, footer, and upgrade prompt behavior
- `apps/web/src/components/layout/sidebar-context.tsx` for persisted desktop expansion state plus ephemeral mobile drawer state
- `apps/web/src/components/layout/app-shell.tsx` for the desktop sidebar, mobile drawer, top bar, banners, and PM breadcrumb strip
- `apps/web/src/components/layout/app-top-bar.tsx` for the utility header
- `apps/web/src/components/layout/user-menu.tsx` for settings/export/switch-community/sign-out actions

This specification preserves that layering. Shared rendering behavior remains in `NavRail`; app-specific routing and gating remain in `AppSidebar`.

---

## 5. Design Decisions

### AD-1: Evolve the Existing Two-Layer Sidebar Architecture

Keep:

- `NavRail` as the shared sidebar primitive in `packages/ui`
- `AppSidebar` as the authenticated-app wrapper in `apps/web`

Do not replace the pair with a single app-only component.

### AD-2: Keep Native Navigation Semantics

- Leaf destinations remain links
- Disclosure toggles are separate buttons
- Upgrade-gated items remain buttons that open an upgrade prompt

### AD-3: Desktop Collapse State Is Persisted; Mobile Is Always Expanded

The persisted desktop collapse state in `SidebarProvider` remains valid, but the mobile drawer must always render in the expanded state and must not expose a collapse toggle.

### AD-4: Preserve Community-Aware Account Actions

The top bar must continue to surface:

- Settings
- Export Data
- Switch Community (conditional)
- Sign Out

Settings and export links must preserve `communityId` when present.

### AD-5: Surface Token Change Is Global

The `--surface-page` token change affects any authenticated, auth, marketing, and public views that consume the semantic page surface. It is not limited to the app shell.

---

## 6. Section 1 — Sidebar Navigation

### 6.1 Architecture

The sidebar redesign modifies both layers while preserving their boundary:

- **`NavRail`** owns rendering, keyboard behavior, collapse animation, section layout, nested disclosure behavior, and link/button semantics
- **`AppSidebar`** owns nav configuration, role/feature/plan gating, Next.js `Link` integration, branding header, user footer, and upgrade prompt behavior

### 6.2 `NavRail` API Changes

#### `NavRailItem`

Extend the item model to support nested children:

```ts
export type NavRailSubItem = {
  id: string;
  label: string;
  href: string;
  badge?: number | null;
  badgeVariant?: StatusVariant;
};

export type NavRailItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  badge?: number | null;
  badgeVariant?: StatusVariant;
  href?: string;
  children?: NavRailSubItem[];
};
```

#### `NavRailSection`

Replace the single separator model with explicit sections:

```ts
export type NavRailSection = {
  label: string | null;
  items: NavRailItem[];
};
```

Update `NavRailProps` from `items` to `sections`.

### 6.3 Navigation Semantics

#### Leaf items

- Items with `href` and no children render as links
- When `renderLink` is supplied, `NavRail` uses it for framework-specific links
- This preserves open-in-new-tab behavior and screen-reader link semantics

#### Disclosure parents

- Parents with children render:
  - the row label/icon as a link to the parent route
  - a separate chevron `<button>` as the disclosure control
- The chevron button owns `aria-expanded`
- The chevron rotates 90 degrees when expanded
- In collapsed sidebar state, children are hidden and the chevron is not shown

#### Plan-locked items

- Plan-locked items render as `<button>` elements with no `href`
- They open the existing upgrade prompt rather than navigating
- They expose `aria-haspopup="dialog"`
- They append upgrade context in accessible naming, for example via `(Upgrade)` text and `aria-description`

### 6.4 Active-State Rules

- If `activeView` matches a parent item, the parent receives the full active treatment
- If `activeView` matches a child item:
  - the parent auto-expands
  - the child receives `aria-current="page"`
  - the parent receives a lighter "contains active" treatment, not the full active background

### 6.5 Sections

Replace the current `main` / `admin` separator behavior with section-based rendering.

Target section structure:

- `null` label for the top section when no header is desired
- `Community`
- `Management`
- `Admin`

Sections render with:

- divider line using the existing dark-surface border treatment
- uppercase micro-labels
- muted contrast appropriate for dark navigation surfaces

### 6.6 Visual Treatment

Use existing semantic tokens and established `NavRail` dark-surface patterns:

| Element | Treatment |
|---|---|
| Sidebar background | `--surface-inverse` |
| Divider | `border-white/10` |
| Active item background | `bg-white/[0.15]` |
| Active text | inverse text + semibold weight |
| Active indicator | 4px left bar using `--interactive-primary` |
| Active icon | lightened brand treatment on dark surface |
| Inactive icon | current muted inverse treatment |
| Hover | subtle white overlay |
| Default badge | inverse overlay pill |
| Danger badge | `--status-danger` treatment |
| Focus ring | existing inverse-surface focus pattern |

#### Nav semantic token consolidation

The runtime token sheet (`packages/ui/src/styles/tokens.css`, lines 301–306) already defines nav-specific semantic tokens (`--nav-bg-active`, `--nav-text-inactive`, `--nav-bg-hover`, etc.), but `NavRail.tsx` currently hardcodes equivalent raw values inline instead of consuming them. As part of this redesign, `NavRail` should migrate to use these existing nav semantic tokens. Any tokens that no longer match the redesigned treatments should be updated in `tokens.css` to reflect the new values, and any that become genuinely unused after the migration should be removed. The goal is zero orphaned nav tokens after implementation.

### 6.7 Compliance Badge Clarification

Compliance badge escalation follows the existing token model:

- `warning` remains amber for urgent-but-not-overdue states
- `danger` remains red for overdue states

The sidebar must not reinterpret `warning` as red.

### 6.8 Collapse Toggle

Replace the current chevron-left toggle with:

- `PanelLeftClose` + "Collapse" text in the expanded state
- `PanelLeft` icon-only in the collapsed state

Behavior remains bound to the same collapse toggle flow on desktop.

### 6.9 Accessibility Requirements

- Sidebar navigation container exposes an explicit navigation label
- Active destinations use `aria-current="page"`
- Disclosure controls use `aria-expanded`
- Decorative icons remain `aria-hidden="true"`
- Focus-visible rings remain visible on all interactive elements

---

## 7. Section 2 — Top Bar

### 7.1 Layout

Replace the current two-row mobile header and utility-strip desktop header with a unified single-row top bar:

- search trigger on the left
- notification bell on the right
- profile avatar menu on the far right
- mobile hamburger at the far left on small screens

The PM breadcrumb strip remains below the top bar and is unchanged.

### 7.2 Search Trigger

- Uses the existing `onSearchOpen` callback to open `CommandPaletteV2`
- Remains a trigger, not an inline search field
- Uses `--surface-card` with `--border-default`
- Shows `⌘K` on desktop only
- Uses a 40px height on desktop and 44px on mobile
- Placeholder copy: `"Search documents, residents, meetings..."`

### 7.3 Notification Bell

- Placeholder only for this phase
- No unread dot
- No click handler yet
- Accessible label communicates that notifications are coming soon
- Uses 36px desktop / 44px mobile sizing

### 7.4 Profile Avatar Menu

Replace the current `UserMenu` with a cleaner avatar-triggered dropdown using the existing shadcn `DropdownMenu` primitives.

#### Trigger

- Circular avatar button
- Initials derived from `toInitials()`
- `aria-haspopup="menu"`
- 36px desktop / 44px mobile

#### Menu items

- **Settings** → `/settings?communityId=${communityId}` when `communityId` exists, otherwise `/settings`
- **Switch Community** → `/select-community` when the user belongs to multiple communities
- **Data Export** → `/settings/export?communityId=${communityId}` when `communityId` exists, otherwise `/settings/export`
- **Separator**
- **Log out** → reuse the current logout action

The multi-community condition should reuse the existing count-based behavior from the current `UserMenu`.

### 7.5 Hamburger

- Mobile only
- 44px touch target
- Opens the mobile drawer with `setMobileOpen(true)`

### 7.6 Preserved Behavior

- Existing `CommandPaletteV2` integration
- PM breadcrumb strip
- Subscription / free-access / demo banners below the header

### 7.7 Removed Behavior

- Page title and subtitle in the top bar
- The old `UserMenu` trigger chrome
- The two-row mobile top bar layout

---

## 8. Section 3 — Mobile Drawer

### 8.1 Keep the Existing Drawer Pattern

Preserve the current mobile shell pattern in `AppShell`:

- hamburger opens drawer
- fixed overlay with backdrop
- dismiss via backdrop, Escape, and close button
- dialog semantics remain in place
- main content remains inert while the drawer is open

No bottom tab bar is introduced.

### 8.2 Make Mobile Expansion Explicit

The mobile drawer must always render the sidebar in expanded mode and must never expose a collapse toggle.

Because `AppSidebar` currently derives `expanded` and `toggleExpanded` directly from `useSidebar()`, the implementation must add explicit mobile override support.

Recommended `AppSidebar` additions:

```ts
interface AppSidebarProps {
  // existing props...
  expandedOverride?: boolean;
  showCollapseToggle?: boolean;
  onNavigate?: () => void;
}
```

Behavior:

- `expandedOverride={true}` in the mobile drawer
- `showCollapseToggle={false}` in the mobile drawer
- desktop continues using the persisted `expanded` value from context

### 8.3 Close on Navigate

Navigating from the mobile drawer must close it immediately.

The mobile drawer should pass:

- `onNavigate={closeMobileNav}`

`AppSidebar` should forward this into:

- link clicks
- child-link clicks
- any non-navigation action that should dismiss the drawer after activation

### 8.4 Shared Visual/Nav Structure

The mobile drawer uses the same:

- dark inverse surface
- section structure
- role/feature/plan gating
- brand header
- user footer

as the desktop sidebar.

### 8.5 Accessibility and Interaction Notes

- Preserve `role="dialog"` and `aria-modal="true"`
- Preserve background inerting while open
- Keep Escape and backdrop dismissal
- Size the mobile close button to a 44px touch target

This redesign does **not** add a new focus-trap library or broader modal infrastructure. It preserves the current drawer model and tightens its behavior.

### 8.6 Explicitly Out of Scope

- `/mobile/*` route-group navigation
- bottom tab bar
- a new mobile-specific navigation information architecture

---

## 9. Section 4 — Surface Token Change

### 9.1 Proposal

Update:

- `--surface-page` from `var(--gray-50)` (`#F9FAFB`)
- to a new warm-neutral primitive at `#F5F5F4`

This is a global semantic token change for the web app token system.

#### Naming convention

The existing neutral scale uses `--gray-*` exclusively. This redesign introduces a single warm-neutral primitive as an intentional exception for the page surface. To avoid implying a full `--stone-*` family:

- Add the primitive as `--surface-page-warm: #F5F5F4` — a purpose-named primitive rather than a scale member
- Update `--surface-page` to reference `var(--surface-page-warm)`

This keeps the gray scale as the project's sole neutral family while making the warm page surface explicit and self-documenting. If future work requires additional warm neutrals, that would be the time to introduce a full `--stone-*` scale.

### 9.2 Required Token Updates

| File | Change |
|---|---|
| `packages/ui/src/styles/tokens.css` | Add `--surface-page-warm: #F5F5F4` to runtime primitives |
| `packages/ui/src/styles/tokens.css` | Update runtime `--surface-page` to `var(--surface-page-warm)` |
| `docs/design-system/tokens/primitives.css` | Add `--surface-page-warm: #F5F5F4` to documented primitives |
| `docs/design-system/tokens/semantic.css` | Update documented `--surface-page` to `var(--surface-page-warm)` |
| `DESIGN.md` | Update `--surface-page` documentation |

### 9.3 Border Decision

Keep:

- `--border-default: var(--gray-200)`

Do **not** migrate border tokens to a stone scale in this change set.

Rationale:

- the visual temperature mismatch is minor
- the lower-risk change is to warm the page surface only
- a border-token migration would have a much larger blast radius

### 9.4 Expected Visual Effects

- White cards and inputs gain slightly more separation from the page background
- Auth pages shift from a cool gray page surface to a warm stone-neutral page surface
- Marketing and public components that use `--surface-page` also shift
- Table headers, muted panels, and page-surface fills that rely on `bg-surface-page` also shift

### 9.5 Not Affected

- `/mobile/*` routes, which already override their own semantic tokens in `apps/web/src/styles/mobile.css`
- the admin app, which does not consume this token system in its own globals

### 9.6 Out of Scope

This token section does **not** define:

- top bar background or border treatment
- additional border-token migration
- mobile token changes

Top bar surface treatment remains part of Section 2.

---

## 10. Affected Files

### Runtime UI

- `packages/ui/src/components/NavRail.tsx`
- `packages/ui/__tests__/components/NavRail.test.tsx`
- `apps/web/src/components/layout/app-sidebar.tsx`
- `apps/web/src/components/layout/nav-config.ts`
- `apps/web/src/components/layout/app-top-bar.tsx`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/components/layout/user-menu.tsx` or its replacement
- `apps/web/src/components/ui/dropdown-menu.tsx` (reuse, not redesign)

### Tokens and Design Docs

- `packages/ui/src/styles/tokens.css`
- `packages/ui/__tests__/tokens/tokens.test.ts`
- `docs/design-system/tokens/primitives.css`
- `docs/design-system/tokens/semantic.css`
- `DESIGN.md`

---

## 11. Verification Checklist

### Sidebar

- [ ] Desktop sidebar expands and collapses with persisted state
- [ ] Mobile drawer always renders expanded
- [ ] Collapse toggle is hidden in mobile drawer
- [ ] Leaf items remain links
- [ ] Disclosure parents use a separate chevron button
- [ ] Active child routes auto-expand their parent
- [ ] Plan-locked items open the upgrade prompt and do not navigate
- [ ] Section labels render correctly in desktop and drawer contexts

### Top Bar

- [ ] Search trigger opens `CommandPaletteV2`
- [ ] Desktop search shows `⌘K`; mobile does not
- [ ] Avatar menu preserves Settings / Export / Switch Community / Sign Out actions
- [ ] Settings and Export preserve `communityId` where applicable
- [ ] Mobile controls meet 44px minimum touch targets

### Mobile Drawer

- [ ] Backdrop, Escape, and close button dismiss the drawer
- [ ] Drawer closes after navigation
- [ ] Main content remains inert while drawer is open
- [ ] PM breadcrumb and banners remain unaffected

### Surface Token

- [ ] Dashboard, Documents, Compliance, and Settings pages visually regress cleanly
- [ ] Auth pages visually regress cleanly
- [ ] Marketing landing and pricing sections visually regress cleanly
- [ ] Public subdomain pages and public footer visually regress cleanly
- [ ] Export page and payment flows visually regress cleanly
- [ ] `/mobile/*` remains unchanged

---

## 12. Implementation Notes

- Preserve existing role, feature, and plan-gating behavior in `AppSidebar`
- Preserve existing upgrade prompt behavior and positioning, adjusting only where new layout mechanics require it
- Prefer focused component and token changes over broad cleanup
- Keep accessibility semantics explicit rather than inferred from styling
- Treat this specification as the source of truth for the authenticated shell redesign; older one-off plan notes should not override it
