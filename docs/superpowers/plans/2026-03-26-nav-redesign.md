# Authenticated Shell Navigation Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the authenticated app shell sidebar, top bar, and mobile drawer following the approved spec at `docs/specs/authenticated-shell-navigation-redesign-spec.md`.

**Architecture:** Evolve the existing `NavRail` (shared primitive) + `AppSidebar` (app wrapper) split. Add section-based nav model with nested children, migrate NavRail to use existing nav semantic tokens, simplify the top bar to search-dominant layout, and update the global surface-page token.

**Tech Stack:** React 19, Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Vitest + Testing Library, Lucide React icons

---

## File Map

### Created
| File | Responsibility |
|---|---|
| `apps/web/src/components/layout/profile-menu.tsx` | Avatar-triggered dropdown replacing `UserMenu` |

### Modified
| File | Responsibility |
|---|---|
| `packages/ui/src/components/NavRail.tsx` | Add section model, children support, disclosure semantics, nav token migration |
| `packages/ui/__tests__/components/NavRail.test.tsx` | Tests for sections, children, disclosure, link/button semantics |
| `packages/ui/__tests__/tokens/tokens.test.ts` | Add `--surface-page-warm` primitive assertion |
| `packages/ui/src/styles/tokens.css` | Add `--surface-page-warm`, update `--surface-page`, update nav tokens |
| `apps/web/src/components/layout/nav-config.ts` | Migrate to section-based model with `NavSection`, add optional `children` |
| `apps/web/src/components/layout/app-sidebar.tsx` | Add `collapsible` and `onNavigate` props, consume new section-based NavRail API |
| `apps/web/src/components/layout/app-shell.tsx` | Pass `collapsible={false}` and `onNavigate` to mobile drawer, bump close button to 44px |
| `apps/web/src/components/layout/app-top-bar.tsx` | Single-row search-dominant layout, profile menu, responsive touch targets |
| `apps/web/src/components/layout/sidebar-context.tsx` | No API changes — behavior unchanged |
| `apps/web/__tests__/layout/nav-config.test.ts` | Update for section-based model |
| `docs/design-system/tokens/primitives.css` | Add `--surface-page-warm` |
| `docs/design-system/tokens/semantic.css` | Update `--surface-page` |
| `DESIGN.md` | Update surface-page documentation |

### Deleted
| File | Reason |
|---|---|
| `apps/web/src/components/layout/user-menu.tsx` | Replaced by `profile-menu.tsx` |

---

## Task 1: Surface Token — Add `--surface-page-warm` Primitive

**Files:**
- Modify: `packages/ui/src/styles/tokens.css`
- Modify: `packages/ui/__tests__/tokens/tokens.test.ts`
- Modify: `docs/design-system/tokens/primitives.css`
- Modify: `docs/design-system/tokens/semantic.css`
- Modify: `DESIGN.md`

This task is standalone with zero component dependencies. Ship it first so all subsequent work renders on the correct surface.

- [ ] **Step 1: Write failing token test**

In `packages/ui/__tests__/tokens/tokens.test.ts`, add a test that asserts `--surface-page-warm` exists in the CSS and that `--surface-page` references it:

```typescript
describe('Surface page warm token', () => {
  it('defines --surface-page-warm primitive', () => {
    expect(cssContent).toContain('--surface-page-warm: #F5F5F4');
  });

  it('--surface-page references --surface-page-warm', () => {
    expect(cssContent).toContain('--surface-page: var(--surface-page-warm)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/ui test -- --run tokens`
Expected: FAIL — `--surface-page-warm` not found

- [ ] **Step 3: Add primitive and update semantic token in runtime CSS**

In `packages/ui/src/styles/tokens.css`, add `--surface-page-warm` near the other neutral primitives, then update the semantic reference:

```css
/* In the primitives section, after the gray scale */
--surface-page-warm: #F5F5F4;

/* In the semantic section, update: */
--surface-page: var(--surface-page-warm);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/ui test -- --run tokens`
Expected: PASS

- [ ] **Step 5: Update docs primitives and semantics**

In `docs/design-system/tokens/primitives.css`, add:
```css
--surface-page-warm: #F5F5F4;
```

In `docs/design-system/tokens/semantic.css`, update:
```css
--surface-page: var(--surface-page-warm);
```

In `DESIGN.md`, find the `--surface-page` reference and update the documented value from `gray-50` to `--surface-page-warm (#F5F5F4)`. Add a note that this is a purpose-named warm neutral, not a new scale family.

- [ ] **Step 6: Visual spot-check**

Run: `pnpm dev`
Check in browser: dashboard, login page, marketing landing page, and a public subdomain page. Confirm the background shifted from cool gray to warm stone. Cards should pop slightly more against the warmer surface.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/styles/tokens.css packages/ui/__tests__/tokens/tokens.test.ts docs/design-system/tokens/primitives.css docs/design-system/tokens/semantic.css DESIGN.md
git commit -m "feat(tokens): add --surface-page-warm and update --surface-page

Introduces a purpose-named warm neutral primitive (#F5F5F4) for the
page surface. Keeps --gray-* as the sole neutral scale family.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §9"
```

---

## Task 2: NavRail — Section Model and Nav Token Migration

**Files:**
- Modify: `packages/ui/src/components/NavRail.tsx`
- Modify: `packages/ui/__tests__/components/NavRail.test.tsx`
- Modify: `packages/ui/src/styles/tokens.css` (nav token updates)

This is the largest task. It adds the section data model to the shared primitive and migrates hardcoded inline values to the existing nav semantic tokens.

- [ ] **Step 1: Write failing test for section-based rendering**

In `packages/ui/__tests__/components/NavRail.test.tsx`, add a new describe block. The existing tests use a flat `items` prop — new tests use `sections`:

```typescript
const SECTION_DATA: NavRailSection[] = [
  {
    label: null,
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: TestIcon, href: '/dashboard' },
    ],
  },
  {
    label: 'Community',
    items: [
      { id: 'announcements', label: 'Announcements', icon: TestIcon, href: '/announcements', badge: 2 },
      { id: 'meetings', label: 'Meetings', icon: TestIcon, href: '/meetings' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'governance', label: 'Governance', icon: TestIcon, href: '/governance' },
    ],
  },
];

describe('Section-based rendering', () => {
  it('renders section labels as uppercase text', () => {
    render(
      <NavRail sections={SECTION_DATA} activeView="dashboard" onViewChange={vi.fn()} expanded={true} />
    );
    expect(screen.getByText('Community')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
  });

  it('does not render label for null-label sections', () => {
    render(
      <NavRail sections={SECTION_DATA} activeView="dashboard" onViewChange={vi.fn()} expanded={true} />
    );
    // Dashboard section has no label — only 'Community' and 'Admin' should appear as section headers
    const labels = document.querySelectorAll('[data-testid="section-label"]');
    expect(labels).toHaveLength(2);
  });

  it('renders dividers between sections', () => {
    render(
      <NavRail sections={SECTION_DATA} activeView="dashboard" onViewChange={vi.fn()} expanded={true} />
    );
    const dividers = document.querySelectorAll('[data-testid="section-divider"]');
    // Dividers appear before sections 2 and 3 (not before the first section)
    expect(dividers).toHaveLength(2);
  });

  it('hides section labels when collapsed', () => {
    render(
      <NavRail sections={SECTION_DATA} activeView="dashboard" onViewChange={vi.fn()} expanded={false} collapsed={true} />
    );
    expect(screen.queryByText('Community')).toBeFalsy();
    expect(screen.queryByText('Admin')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/ui test -- --run NavRail`
Expected: FAIL — `sections` prop doesn't exist yet

- [ ] **Step 3: Add section types and update NavRailProps**

In `NavRail.tsx`, add types and update props. Keep backward compat by supporting both `items` (deprecated) and `sections`:

```typescript
export type NavRailSection = {
  /** Section header label. null = no header (e.g., Dashboard). */
  label: string | null;
  items: NavRailItem[];
};

export interface NavRailProps {
  /** @deprecated Use sections instead */
  items?: NavRailItem[];
  /** Section-based nav structure. Takes precedence over items. */
  sections?: NavRailSection[];
  activeView: string;
  onViewChange: (viewId: string) => void;
  expanded: boolean;
  onToggle?: () => void;
  renderLink?: (props: {
    href: string;
    className: string;
    children: React.ReactNode;
    'aria-label': string;
    'aria-current'?: 'page';
    onClick?: () => void;
  }) => React.ReactElement;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  /** @deprecated Use sections model instead */
  groupSeparator?: React.ReactNode;
  /** @deprecated Use sections model instead */
  groupSeparatorAfterIndex?: number;
}
```

- [ ] **Step 4: Implement section rendering in NavRail**

Inside the `NavRail` component, normalize both APIs into sections:

```typescript
// Normalize: if sections provided, use them. Otherwise wrap items in a single section.
const resolvedSections: NavRailSection[] = sections
  ? sections
  : items
    ? [{ label: null, items }]
    : [];

// Flatten for keyboard navigation
const allItems = resolvedSections.flatMap((s) => s.items);
```

Replace the current single `items.map()` loop with a sections loop that renders dividers and labels:

```typescript
{resolvedSections.map((section, sectionIndex) => (
  <div key={section.label ?? `section-${sectionIndex}`}>
    {sectionIndex > 0 && (
      <div
        data-testid="section-divider"
        className={cn(
          "border-b border-white/10 dark:border-gray-800",
          expanded ? "mx-2.5 my-1.5" : "mx-1 my-1.5"
        )}
      />
    )}
    {section.label && expanded && (
      <p
        data-testid="section-label"
        className="text-[11px] font-medium tracking-wider uppercase px-2.5 pt-3 pb-1"
        style={{ color: 'var(--nav-text-muted)' }}
      >
        {section.label}
      </p>
    )}
    {section.items.map((navItem) => {
      // ... existing item rendering logic, unchanged
    })}
  </div>
))}
```

- [ ] **Step 5: Migrate NavRail inline colors to nav semantic tokens**

Update `packages/ui/src/styles/tokens.css` nav section if any values need adjustment, then replace hardcoded values in NavRail.tsx:

| Before (inline) | After (token) |
|---|---|
| `bg-white/[0.15]` | `bg-[var(--nav-bg-active)]` |
| `hover:bg-white/[0.07]` | `hover:bg-[var(--nav-bg-hover)]` |
| `text-white/85` | `text-[var(--nav-text-inactive)]` |
| `text-white` (active) | `text-[var(--nav-text-active)]` |
| `color: rgba(255, 255, 255, 0.85)` (inline) | `color: var(--nav-text-inactive)` |
| `text-white/60` (toggle) | `text-[var(--nav-text-muted)]` |

Keep `--interactive-primary`, `--status-danger`, `--surface-inverse` as-is — those are global semantic tokens, not nav-specific.

- [ ] **Step 6: Run tests to verify sections work**

Run: `pnpm --filter @propertypro/ui test -- --run NavRail`
Expected: All existing tests PASS (backward compat via `items`), new section tests PASS

- [ ] **Step 7: Update existing tests to remove deprecated groupSeparator assertions if any**

Review existing tests. The current tests don't test `groupSeparator` directly, so this may be a no-op. Verify and move on.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/NavRail.tsx packages/ui/__tests__/components/NavRail.test.tsx packages/ui/src/styles/tokens.css
git commit -m "feat(NavRail): add section-based nav model and migrate to nav semantic tokens

Introduces NavRailSection type with labeled dividers. Backward-compatible
with flat items prop. Migrates inline color values to existing nav
semantic tokens in tokens.css.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §6"
```

---

## Task 3: NavRail — Children Support and Disclosure Semantics

**Files:**
- Modify: `packages/ui/src/components/NavRail.tsx`
- Modify: `packages/ui/__tests__/components/NavRail.test.tsx`

Adds `NavRailSubItem`, expandable children, and correct link-vs-button semantics for disclosure parents.

- [ ] **Step 1: Write failing tests for children**

```typescript
const ITEMS_WITH_CHILDREN: NavRailSection[] = [
  {
    label: null,
    items: [
      {
        id: 'announcements',
        label: 'Announcements',
        icon: TestIcon,
        href: '/announcements',
        badge: 2,
        children: [
          { id: 'announcements-all', label: 'All announcements', href: '/announcements' },
          { id: 'announcements-drafts', label: 'Drafts', href: '/announcements/drafts', badge: 1 },
        ],
      },
      { id: 'meetings', label: 'Meetings', icon: TestIcon, href: '/meetings' },
    ],
  },
];

describe('Children and disclosure', () => {
  it('renders a chevron button for items with children', () => {
    render(
      <NavRail sections={ITEMS_WITH_CHILDREN} activeView="meetings" onViewChange={vi.fn()} expanded={true} />
    );
    const chevron = screen.getByLabelText('Expand Announcements');
    expect(chevron).toBeTruthy();
    expect(chevron.tagName).toBe('BUTTON');
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands children when chevron is clicked', () => {
    render(
      <NavRail sections={ITEMS_WITH_CHILDREN} activeView="meetings" onViewChange={vi.fn()} expanded={true} />
    );
    const chevron = screen.getByLabelText('Expand Announcements');
    fireEvent.click(chevron);
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('All announcements')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
  });

  it('parent row is a link, not a button', () => {
    const onNavigate = vi.fn();
    render(
      <NavRail sections={ITEMS_WITH_CHILDREN} activeView="meetings" onViewChange={onNavigate} expanded={true} />
    );
    // The parent label "Announcements" should be rendered as a link
    const parentLink = screen.getByText('Announcements').closest('a');
    expect(parentLink).toBeTruthy();
    expect(parentLink?.getAttribute('href')).toBe('/announcements');
  });

  it('parent has lighter "contains-active" treatment when child is active', () => {
    render(
      <NavRail sections={ITEMS_WITH_CHILDREN} activeView="announcements-drafts" onViewChange={vi.fn()} expanded={true} />
    );
    // Parent should NOT have the full active background (bg-[var(--nav-bg-active)])
    const parentRow = screen.getByText('Announcements').closest('[data-testid="nav-item"]');
    expect(parentRow?.className).not.toContain('nav-bg-active');
    // But parent text should be brighter than fully inactive
  });

  it('auto-expands parent when active child is set', () => {
    render(
      <NavRail sections={ITEMS_WITH_CHILDREN} activeView="announcements-drafts" onViewChange={vi.fn()} expanded={true} />
    );
    // Drafts should be visible (parent auto-expanded)
    expect(screen.getByText('Drafts')).toBeTruthy();
    // Drafts should have aria-current="page"
    const draftsItem = screen.getByText('Drafts').closest('[aria-current]');
    expect(draftsItem?.getAttribute('aria-current')).toBe('page');
  });

  it('hides children when sidebar is collapsed', () => {
    render(
      <NavRail sections={ITEMS_WITH_CHILDREN} activeView="announcements-drafts" onViewChange={vi.fn()} expanded={false} />
    );
    expect(screen.queryByText('All announcements')).toBeFalsy();
    expect(screen.queryByText('Drafts')).toBeFalsy();
  });

  it('does not render chevron for items without children', () => {
    render(
      <NavRail sections={ITEMS_WITH_CHILDREN} activeView="meetings" onViewChange={vi.fn()} expanded={true} />
    );
    expect(screen.queryByLabelText('Expand Meetings')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @propertypro/ui test -- --run NavRail`
Expected: FAIL — `children` not supported, no chevron rendered

- [ ] **Step 3: Add NavRailSubItem type**

In `NavRail.tsx`, add the sub-item type (before `NavRailItem`):

```typescript
export type NavRailSubItem = {
  id: string;
  label: string;
  href: string;
  badge?: number | null;
  badgeVariant?: StatusVariant;
};
```

Add `children?: NavRailSubItem[]` to `NavRailItem`.

- [ ] **Step 4: Implement disclosure rendering**

For items with children, split the row into:
1. A link for the label/icon (navigates to `item.href`)
2. A separate chevron `<button>` with `aria-expanded` and `aria-label="Expand {label}"`

Track expanded state per item ID. Auto-expand any parent whose child matches `activeView` on mount AND on `activeView` changes (e.g., programmatic navigation):

```typescript
const [expandedItems, setExpandedItems] = React.useState<Record<string, boolean>>({});

// Sync: auto-expand parent when activeView changes to a child
React.useEffect(() => {
  for (const section of resolvedSections) {
    for (const item of section.items) {
      if (item.children?.some((child) => child.id === activeView)) {
        setExpandedItems((prev) => ({ ...prev, [item.id]: true }));
      }
    }
  }
}, [activeView, resolvedSections]);
```

Render children as indented sub-items when expanded and sidebar is in expanded mode:

```typescript
{hasChildren && expanded && expandedItems[navItem.id] && (
  <div className="pl-6 mt-0.5 flex flex-col gap-0.5">
    {navItem.children!.map((child) => {
      const childActive = child.id === activeView;
      // Render as link via renderLink or <a>
    })}
  </div>
)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @propertypro/ui test -- --run NavRail`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/NavRail.tsx packages/ui/__tests__/components/NavRail.test.tsx
git commit -m "feat(NavRail): add children support with link/button disclosure semantics

Parent rows are links; chevrons are separate disclosure buttons with
aria-expanded. Active children auto-expand parents. Children hidden
when sidebar is collapsed.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §6.3"
```

---

## Task 4: NavRail — Collapse Toggle Redesign

**Files:**
- Modify: `packages/ui/src/components/NavRail.tsx`
- Modify: `packages/ui/__tests__/components/NavRail.test.tsx`

Replace the chevron toggle at the bottom with PanelLeftClose/PanelLeft icons plus "Collapse" text.

- [ ] **Step 1: Write failing test for new toggle**

```typescript
describe('Collapse toggle redesign', () => {
  it('shows PanelLeftClose icon and "Collapse" text when expanded', () => {
    render(
      <NavRail sections={SECTION_DATA} activeView="dashboard" onViewChange={vi.fn()} expanded={true} onToggle={vi.fn()} />
    );
    expect(screen.getByLabelText('Collapse sidebar')).toBeTruthy();
    expect(screen.getByText('Collapse')).toBeTruthy();
  });

  it('shows PanelLeft icon without text when collapsed', () => {
    render(
      <NavRail sections={SECTION_DATA} activeView="dashboard" onViewChange={vi.fn()} expanded={false} onToggle={vi.fn()} />
    );
    expect(screen.getByLabelText('Expand sidebar')).toBeTruthy();
    expect(screen.queryByText('Collapse')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/ui test -- --run NavRail`
Expected: FAIL — current toggle renders a chevron, not PanelLeftClose

- [ ] **Step 3: Implement the new toggle**

Replace the `ChevronLeftIcon` toggle with Lucide `PanelLeftClose` / `PanelLeft` icons. Note: NavRail is in `packages/ui` which already depends on `lucide-react`. Import the icons:

```typescript
import { PanelLeftClose, PanelLeft } from 'lucide-react';
```

Replace the toggle rendering:

```typescript
{onToggle && (
  <div className="border-t border-white/10 dark:border-gray-800">
    <button
      type="button"
      onClick={onToggle}
      aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2.5 py-2",
        "transition-colors duration-100",
        "text-[var(--nav-text-muted)] hover:bg-[var(--nav-bg-hover)] hover:text-[var(--nav-text-active)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]",
        expanded ? "" : "justify-center"
      )}
    >
      {expanded ? (
        <>
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          <span className="text-[13px]">Collapse</span>
        </>
      ) : (
        <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  </div>
)}
```

Remove the old `ChevronLeftIcon` component if no longer used.

- [ ] **Step 4: Update existing toggle tests**

The existing test suite checks for "Collapse sidebar" and "Expand sidebar" labels — those should still pass. Verify and update any that check for chevron-specific class names (e.g., `rotate-180`).

- [ ] **Step 5: Run all NavRail tests**

Run: `pnpm --filter @propertypro/ui test -- --run NavRail`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/NavRail.tsx packages/ui/__tests__/components/NavRail.test.tsx
git commit -m "feat(NavRail): replace chevron toggle with PanelLeftClose/PanelLeft

Shows 'Collapse' text label when expanded, icon-only when collapsed.
Uses nav semantic tokens for hover/text colors.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §6.8"
```

---

## Task 5: Nav Config — Migrate to Section-Based Model

**Files:**
- Modify: `apps/web/src/components/layout/nav-config.ts`
- Modify: `apps/web/__tests__/layout/nav-config.test.ts`

Restructure the flat `NAV_ITEMS` array into `NAV_SECTIONS` using the new `NavRailSection` type.

- [ ] **Step 1: Write failing test for section-based config**

In `apps/web/__tests__/layout/nav-config.test.ts`, add:

```typescript
describe('NAV_SECTIONS', () => {
  it('has four sections: null (Dashboard), Community, Management, Admin', () => {
    expect(NAV_SECTIONS).toHaveLength(4);
    expect(NAV_SECTIONS[0].label).toBeNull();
    expect(NAV_SECTIONS[1].label).toBe('Community');
    expect(NAV_SECTIONS[2].label).toBe('Management');
    expect(NAV_SECTIONS[3].label).toBe('Admin');
  });

  it('Dashboard section has exactly one item', () => {
    expect(NAV_SECTIONS[0].items).toHaveLength(1);
    expect(NAV_SECTIONS[0].items[0].id).toBe('dashboard');
  });

  it('preserves all existing nav item IDs across sections', () => {
    const allIds = NAV_SECTIONS.flatMap(s => s.items.map(i => i.id));
    // All items from the old NAV_ITEMS should be present
    for (const item of NAV_ITEMS) {
      expect(allIds).toContain(item.id);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- --run nav-config`
Expected: FAIL — `NAV_SECTIONS` not exported

- [ ] **Step 3: Create NAV_SECTIONS export**

In `nav-config.ts`, add `NavSection` type (importing `NavRailSection` from `@propertypro/ui` or defining locally) and restructure:

```typescript
export interface NavSection {
  label: string | null;
  items: NavItemConfig[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: NAV_ITEMS.filter(i => i.id === 'dashboard'),
  },
  {
    label: 'Community',
    items: NAV_ITEMS.filter(i =>
      ['announcements', 'meetings', 'residents', 'visitors'].includes(i.id) ||
      (i.group === 'main' && ['maintenance', 'violations-report'].includes(i.id))
    ),
  },
  {
    label: 'Management',
    items: NAV_ITEMS.filter(i =>
      ['documents', 'leases', 'packages', 'payments', 'compliance',
       'contracts', 'esign', 'maintenance-inbox', 'violations-inbox',
       'move-in-out', 'assessments', 'finance'].includes(i.id)
    ),
  },
  {
    label: 'Admin',
    items: NAV_ITEMS.filter(i =>
      ['audit-trail', 'residents'].includes(i.id) && i.group === 'admin'
    ),
  },
];
```

Note: The exact grouping of items into sections should be finalized during implementation based on the current item list and any role/feature considerations. The key is that ALL existing items appear in exactly one section. Keep `NAV_ITEMS` as the source array; `NAV_SECTIONS` references it.

Update `getVisibleItemsWithPlanGate` to accept sections and return filtered sections (or add a `getVisibleSections` function).

- [ ] **Step 4: Update existing nav-config tests**

Existing tests for `getVisibleItems` and `getActiveItemId` should continue to pass since `NAV_ITEMS` is preserved. Add tests for the sections-aware filtering if a `getVisibleSections` function is created.

- [ ] **Step 5: Run all nav-config tests**

Run: `pnpm --filter web test -- --run nav-config`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/layout/nav-config.ts apps/web/__tests__/layout/nav-config.test.ts
git commit -m "feat(nav-config): add section-based NAV_SECTIONS model

Groups nav items into Dashboard, Community, Management, and Admin
sections. Preserves NAV_ITEMS as the source array for backward compat.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §6.5"
```

---

## Task 6: AppSidebar — Consume Sections, Add Mobile Props

**Files:**
- Modify: `apps/web/src/components/layout/app-sidebar.tsx`

Wire up the new sections-based NavRail API and add `collapsible` + `onNavigate` props per spec §8.2–8.3.

- [ ] **Step 1: Add new props to AppSidebar**

```typescript
interface AppSidebarProps {
  // ...existing props
  /** When false, sidebar is always expanded and collapse toggle is hidden. Used by mobile drawer. */
  collapsible?: boolean;
  /** Called after any nav link click. Mobile drawer passes closeMobileNav. */
  onNavigate?: () => void;
}
```

Default `collapsible` to `true`.

- [ ] **Step 2: Update NavRail consumption**

Replace:
- `items={navRailItems}` → `sections={navRailSections}` (built from `NAV_SECTIONS` + gating)
- `expanded={expanded}` → `expanded={collapsible === false ? true : expanded}`
- `onToggle={toggleExpanded}` → `onToggle={collapsible === false ? undefined : toggleExpanded}`
- Remove `groupSeparator` and `groupSeparatorAfterIndex` props

Thread `onNavigate` into both `onViewChange` and `renderLink`:

```typescript
onViewChange={(id) => {
  const clickedItem = orderedItems.find((i) => i.id === id);
  if (clickedItem?.planLocked && clickedItem.upgradePlanName) {
    setUpgradePrompt({ planName: clickedItem.upgradePlanName });
  }
  onNavigate?.();
}}

renderLink={({ href, className, children, onClick, ...props }) => (
  <Link key={href} href={href} className={className} {...props} onClick={() => {
    onClick?.();
    onNavigate?.();
  }}>
    {children}
  </Link>
)}
```

- [ ] **Step 3: Build sections from gated items**

Create a helper that transforms `NAV_SECTIONS` through `getVisibleItemsWithPlanGate` and maps to `NavRailSection[]`:

```typescript
function buildNavSections(
  sections: NavSection[],
  role: AnyCommunityRole | null,
  features: CommunityFeatures | null,
  communityType: CommunityType | null,
  planId: PlanId | null,
  communityId: number | null,
): NavRailSection[] {
  return sections
    .map((section) => ({
      label: section.label,
      items: getVisibleItemsWithPlanGate(section.items, role, features, communityType, planId)
        .map((item) => toNavRailItem(item, communityId)),
    }))
    .filter((section) => section.items.length > 0); // Hide empty sections
}
```

- [ ] **Step 4: Verify with dev server**

Run: `pnpm dev`
Navigate to the authenticated dashboard. Verify:
- Sections render with labels and dividers
- Active state highlights correctly
- Collapse toggle works
- Plan-locked items show upgrade prompt

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/app-sidebar.tsx
git commit -m "feat(AppSidebar): consume section-based NavRail, add mobile override props

Adds collapsible and onNavigate props for mobile drawer use.
Builds NavRailSections from NAV_SECTIONS with role/feature/plan gating.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §6, §8.2-8.3"
```

---

## Task 7: AppShell — Mobile Drawer Refinements

**Files:**
- Modify: `apps/web/src/components/layout/app-shell.tsx`

Wire the new `AppSidebar` props into the mobile drawer.

- [ ] **Step 1: Pass collapsible={false} and onNavigate to mobile drawer**

In the mobile drawer section of `app-shell.tsx`:

```typescript
<AppSidebar
  collapsible={false}
  onNavigate={closeMobileNav}
  communityId={community?.id ?? null}
  communityName={community?.name ?? null}
  communityType={community?.type ?? null}
  role={role}
  features={features}
  userName={user?.fullName ?? null}
  plan={community?.plan ?? null}
/>
```

- [ ] **Step 2: Bump close button to 44px**

Change the close button from `size-10` (40px) to `size-11` (44px):

```typescript
<button
  type="button"
  onClick={closeMobileNav}
  className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md text-white/60 transition-colors duration-quick hover:text-white"
  aria-label="Close navigation"
>
  <X size={18} />
</button>
```

- [ ] **Step 3: Verify mobile drawer**

Run: `pnpm dev`
Resize to mobile (<1024px). Verify:
- Hamburger opens drawer
- Drawer is always expanded (no collapse toggle)
- Clicking a nav item closes the drawer
- Close button, backdrop, Escape all dismiss
- Close button is 44px touch target

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/app-shell.tsx
git commit -m "fix(AppShell): force mobile drawer expanded, close on navigate, 44px close button

Mobile drawer passes collapsible={false} and onNavigate={closeMobileNav}
to AppSidebar. Bumps close button to 44px mobile touch target.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §8"
```

---

## Task 8: Profile Menu — Replace UserMenu

**Files:**
- Create: `apps/web/src/components/layout/profile-menu.tsx`
- Modify: `apps/web/src/components/layout/app-top-bar.tsx` (will be wired in Task 9)

- [ ] **Step 1: Create profile-menu.tsx**

Build the avatar-triggered dropdown using existing shadcn `DropdownMenu`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toInitials } from '@propertypro/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Settings, Download, ArrowLeftRight, LogOut } from 'lucide-react';

interface ProfileMenuProps {
  userName: string | null;
  communityId: number | null;
  communityCount?: number;
}

export function ProfileMenu({ userName, communityId, communityCount = 1 }: ProfileMenuProps) {
  const router = useRouter();
  const initials = userName ? toInitials(userName) : '?';
  const cidParam = communityId ? `?communityId=${communityId}` : '';

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--interactive-primary)]/10 text-xs font-semibold text-[var(--interactive-primary)] transition-colors hover:bg-[var(--interactive-primary)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 lg:size-9"
          aria-haspopup="menu"
          aria-label={userName ? `${userName} — Account menu` : 'Account menu'}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => router.push(`/settings${cidParam}`)}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        {communityCount > 1 && (
          <DropdownMenuItem onClick={() => router.push('/select-community')}>
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Switch Community
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => router.push(`/settings/export${cidParam}`)}>
          <Download className="mr-2 h-4 w-4" />
          Data Export
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify the component renders in isolation**

Temporarily import in a test page or use the dev server to mount it. Verify: avatar shows initials, dropdown opens with all 4 actions, Settings/Export include communityId, Switch Community only shows when count > 1.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/profile-menu.tsx
git commit -m "feat: add ProfileMenu dropdown component

Avatar-triggered DropdownMenu with Settings, Switch Community
(conditional), Data Export, and Log out. Preserves communityId
on navigation links.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §7.4"
```

---

## Task 9: Top Bar — Search-Dominant Single-Row Layout

**Files:**
- Modify: `apps/web/src/components/layout/app-top-bar.tsx`

- [ ] **Step 1: Rewrite AppTopBar**

Replace the current two-row mobile / utility-strip desktop layout with a single-row search-dominant bar. Import `ProfileMenu` instead of `UserMenu`. Add `communityCount` prop.

Key layout:
- Mobile: hamburger (44px) + search trigger (44px height) + bell (44px) + avatar (44px)
- Desktop: search trigger (40px, flex-1 max-w-560px) + bell (36px) + avatar (36px)
- `⌘K` badge: desktop-only (`hidden lg:inline-flex`)
- Bell: placeholder, inert, `aria-label="Notifications (coming soon)"`
- Remove page title/subtitle — no heading in the top bar
- Hamburger button lives in `AppTopBar` (moved from `app-shell.tsx`), calls `setMobileOpen(true)` from `useSidebar()` context. Only visible `<1024px` via `lg:hidden`.

```typescript
interface AppTopBarProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
  communityCount?: number;
  onSearchOpen?: () => void;
}
```

- [ ] **Step 2: Verify responsive behavior**

Run: `pnpm dev`
- Desktop: search bar is the focal point, bell + profile avatar right-aligned
- Mobile: single row with hamburger, search, bell, avatar — all 44px touch targets
- ⌘K badge hidden on mobile
- Bell does nothing on click
- Profile avatar opens dropdown with correct actions

- [ ] **Step 3: Delete user-menu.tsx**

Once `ProfileMenu` is wired in and working, delete the old `UserMenu` component. Verify no other imports reference it.

Run: `grep -r "user-menu" apps/web/src/ --include="*.ts" --include="*.tsx"`

If clean, delete the file.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/app-top-bar.tsx apps/web/src/components/layout/profile-menu.tsx
git rm apps/web/src/components/layout/user-menu.tsx
git commit -m "feat(TopBar): search-dominant single-row layout with ProfileMenu

Replaces two-row mobile layout and UserMenu with unified single-row
bar. Search is the focal point. Bell is an inert placeholder.
Mobile controls are 44px touch targets. ⌘K badge desktop-only.

Spec: docs/specs/authenticated-shell-navigation-redesign-spec.md §7"
```

---

## Task 10: Integration Verification and Docs

**Files:**
- Modify: `DESIGN.md` (if not already updated in Task 1)

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: ALL PASS. If any existing tests break from the NavRail API changes, fix them (likely tests that use the old `items` prop directly — they should still work via backward compat).

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors. The `sections` prop change is backward-compatible, but verify all consumers compile.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: PASS. The DB access guard (`pnpm guard:db-access`) should not be affected since no database code was touched.

- [ ] **Step 4: Visual regression walkthrough**

Run: `pnpm dev`

Check each page from the spec's verification checklist (§11):

**Sidebar:**
- [ ] Desktop expands/collapses with persisted state
- [ ] Mobile drawer always expanded
- [ ] Collapse toggle hidden in mobile drawer
- [ ] Leaf items are links
- [ ] Disclosure parents use separate chevron button
- [ ] Active child routes auto-expand parent
- [ ] Plan-locked items open upgrade prompt
- [ ] Section labels render in desktop and drawer

**Top Bar:**
- [ ] Search opens CommandPaletteV2
- [ ] ⌘K desktop-only
- [ ] Avatar menu: Settings, Data Export, Switch Community, Log out
- [ ] Settings/Export preserve communityId
- [ ] Mobile controls 44px

**Mobile Drawer:**
- [ ] Backdrop/Escape/close dismiss
- [ ] Drawer closes on navigate
- [ ] Main content inert while open

**Surface Token:**
- [ ] Dashboard, Documents, Compliance, Settings
- [ ] Auth pages (login, signup)
- [ ] Marketing landing, pricing
- [ ] Public subdomain pages

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from visual regression walkthrough"
```

- [ ] **Step 6: Final commit — update DESIGN.md if needed**

If `DESIGN.md` needs additional updates beyond the surface-page change (e.g., documenting the new section model, toggle change, or removed page titles), make those updates now.

```bash
git add DESIGN.md
git commit -m "docs: update DESIGN.md for nav redesign changes"
```
