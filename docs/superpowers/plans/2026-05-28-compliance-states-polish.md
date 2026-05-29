# Compliance States & Polish Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the compliance-page redesign with the deferred state-handling and polish items: real loading skeletons, a recoverable error banner with Retry, readable activity-feed text, and a standardized upload-modal width.

**Architecture:** Small, surgical changes to four existing files. No new architecture. The command-center's `isLoading` branch renders a skeleton that mirrors the real layout; its `error` branch renders the shared `AlertBanner` with a Retry action wired to the query's `refetch`. The activity feed promotes entry body text from 11px to 13px. The upload modal width is set to the design-system `md` token (560px).

**Tech Stack:** React 19, TypeScript, Tailwind, `@/components/ui/skeleton` (`Skeleton`), `@/components/shared/alert-banner` (`AlertBanner`), `@propertypro/ui` (`Button`), Vitest + `@testing-library/react`.

**Phase context:** Phases 1 (card) and 2 (page assembly) are committed. This is the final phase. Spec: `docs/superpowers/specs/2026-05-28-compliance-page-guided-redesign-design.md` (items F-05, F-07, SF-5, PF-3). Do NOT re-architect anything from Phases 1–2.

**Commit hygiene note:** The only unrelated uncommitted file is `.claude/launch.json` — NEVER stage it. Each commit stages ONLY the files named in that task. Never `git add -A`/`.`.

---

## File Structure

| File | Action | Change |
|---|---|---|
| `apps/web/src/components/compliance/compliance-activity-feed.tsx` | Modify | Entry body `text-xs` → `text-sm` (timestamp stays `text-xs`). |
| `apps/web/src/components/compliance/upload-document-modal.tsx` | Modify | Modal width `max-w-lg` → `max-w-[560px]`. |
| `apps/web/src/components/compliance/compliance-command-center.tsx` | Modify | Loading → skeleton; error → `AlertBanner` + Retry wired to `refetch`. |
| `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx` | Modify | Update loading + error tests; add `refetch` to the mock. |

### Confirmed APIs (do not re-derive)
- `Skeleton` (`@/components/ui/skeleton`): `<Skeleton className="..." />` — a `div.animate-pulse.rounded-md.bg-surface-muted`.
- `AlertBanner` (`@/components/shared/alert-banner`): props `{ status: StatusVariant, title, description?, action?, variant? }`; renders `role="alert"` with icon + `title` `<p>` + `description` `<p>`. `status="danger"` available.
- `useComplianceChecklist(communityId)` returns the full TanStack `useQuery` result, so `refetch` is destructurable.
- `Button` from `@propertypro/ui`: `size="sm"`, `variant="secondary"`.

---

## Task 1: Activity feed — readable entry text (F-05)

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-activity-feed.tsx`

- [ ] **Step 1: Promote the entry body text size**

In `compliance-activity-feed.tsx`, find the activity entry paragraph (currently):

```tsx
                  <p className="text-xs text-content-secondary leading-relaxed">
```

Change `text-xs` to `text-sm`:

```tsx
                  <p className="text-sm text-content-secondary leading-relaxed">
```

Leave every other class and the timestamp `<span className="text-xs ...">` unchanged. (DESIGN.md: 11px/`xs` is metadata-only; activity entries are primary content and must be ≥13px.)

- [ ] **Step 2: Run the activity-feed suite**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-activity-feed.test.tsx`
Expected: PASS (7 tests; none assert font size, so they remain green).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/compliance/compliance-activity-feed.tsx
git commit -m "fix(compliance): activity feed entries use 13px body text (a11y)"
```

---

## Task 2: Upload modal — standard width (PF-3)

**Files:**
- Modify: `apps/web/src/components/compliance/upload-document-modal.tsx`

- [ ] **Step 1: Set the modal width to the design-system md token**

In `upload-document-modal.tsx`, find the modal container className (currently contains `w-full max-w-lg mx-4`):

```tsx
          w-full max-w-lg mx-4
```

Change `max-w-lg` to `max-w-[560px]`:

```tsx
          w-full max-w-[560px] mx-4
```

Leave the rest of the className untouched.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/compliance/upload-document-modal.tsx
git commit -m "style(compliance): standardize upload modal width to 560px (DS md)"
```

---

## Task 3: Command-center — skeleton loading + recoverable error (F-07, SF-5)

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx`
- Modify: `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx`

- [ ] **Step 1: Update the two failing-first tests (loading + error)**

In `compliance-command-center.test.tsx`:

(a) Add a module-level refetch mock near the top (after the `pushMock` declaration):

```tsx
const refetchMock = vi.fn();
```

(b) Add `refetch: refetchMock` to the default `mockChecklistReturn` shape. Change the `beforeEach` assignment to include it:

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  mockChecklistReturn = { data: structuredClone(FIXTURE), isLoading: false, error: null, refetch: refetchMock };
});
```

Also update the `mockChecklistReturn` type annotation and the `useComplianceChecklist` mock object so `refetch` is part of the returned shape:

```tsx
let mockChecklistReturn: { data: unknown[] | undefined; isLoading: boolean; error: Error | null; refetch: () => void } = {
  data: [],
  isLoading: false,
  error: null,
  refetch: () => {},
};
```

(c) Replace the existing loading test body with a skeleton assertion:

```tsx
  it('renders a loading skeleton when data is loading', () => {
    mockChecklistReturn = { data: undefined, isLoading: true, error: null, refetch: refetchMock };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    expect(screen.getByTestId('compliance-loading')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });
```

(d) Replace the existing error test body with an AlertBanner + Retry assertion:

```tsx
  it('renders a recoverable error banner that calls refetch on Retry', () => {
    mockChecklistReturn = { data: undefined, isLoading: false, error: new Error('boom'), refetch: refetchMock };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load compliance records/i);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the command-center test to verify the two cases FAIL**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-command-center.test.tsx -t "loading skeleton|recoverable error"`
Expected: FAIL — `compliance-loading` testid not present yet; no Retry button yet.

- [ ] **Step 3: Implement skeleton + error banner in the component**

In `compliance-command-center.tsx`:

(a) Add imports (top of file, with the other imports):

```tsx
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
```

(b) Destructure `refetch` from the hook. Change:

```tsx
  const { data: items = [], isLoading, error } = useComplianceChecklist(communityId);
```

to:

```tsx
  const { data: items = [], isLoading, error, refetch } = useComplianceChecklist(communityId);
```

(c) Replace the error early-return block. Change:

```tsx
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-[var(--radius-md)] border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger"
      >
        We couldn&apos;t load compliance records. Please try again.
      </div>
    );
  }
```

to:

```tsx
  if (error) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load compliance records"
        description="Please try again."
        action={
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
```

(d) Replace the loading branch. Change:

```tsx
      {isLoading ? (
        <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-8 text-center text-content-secondary">
          Loading&hellip;
        </div>
      ) : (
```

to:

```tsx
      {isLoading ? (
        <ComplianceLoadingSkeleton />
      ) : (
```

(e) Add the skeleton component at the bottom of the file, next to `KpiCard` (before `export default`):

```tsx
function ComplianceLoadingSkeleton() {
  return (
    <div
      data-testid="compliance-loading"
      aria-busy="true"
      aria-label="Loading compliance records"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the command-center test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-command-center.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/compliance/compliance-command-center.tsx apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx
git commit -m "feat(compliance): skeleton loading state and recoverable error banner"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full compliance suite**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance`
Expected: PASS. 6 suites: `compliance-status-hero` (4), `compliance-requirement-card` (9), `compliance-command-center` (10), `compliance-item-actions` (3), `compliance-pill-mapping` (8), `compliance-activity-feed` (7). 41 tests.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Lint**

Run: `pnpm --filter @propertypro/web exec eslint src/components/compliance/compliance-command-center.tsx src/components/compliance/compliance-activity-feed.tsx src/components/compliance/upload-document-modal.tsx`
Expected: PASS. (If `eslint` isn't exposed via `exec`, run root `pnpm lint` and confirm it passes.)

- [ ] **Step 4: Manual preview (controller will perform)**

The controller verifies in the browser: loading skeleton appears on first load; forcing an error shows the AlertBanner with a working Retry; activity-feed text is readable; upload modal opens at 560px. SKIP this step as the implementer — report the automated results only.

No commit (verification only).

---

## Self-Review (completed by plan author)

**Spec coverage (Phase 3 portion):**
- F-05 activity text 13px: Task 1. ✓
- PF-3 modal width 560px: Task 2. ✓
- F-07 loading skeletons: Task 3 (`ComplianceLoadingSkeleton`, replaces "Loading…"). ✓
- SF-5 error AlertBanner + Retry wired to `refetch`: Task 3. ✓

**Placeholder scan:** None. Every step shows complete before/after code.

**Type consistency:** `AlertBanner` props (`status`, `title`, `description`, `action`) match its definition; `action` accepts a `<Button>` ReactNode. `useComplianceChecklist` returns a `useQuery` result, so `refetch` exists. The test mock is updated to include `refetch` so destructuring it in the component does not yield `undefined` under test (calling `refetch()` in the Retry handler resolves to `refetchMock`). `Skeleton` accepts `className`. `data-testid="compliance-loading"` matches the loading test selector.

**Sequencing:** Task 3 updates the tests first (Step 1) so they fail (Step 2) before the implementation (Step 3) makes them pass (Step 4) — proper TDD. Tasks 1 and 2 are non-TDD touch-ups whose existing suites must stay green (no behavioral assertions on text size or width exist).

**Scope:** Strictly the four deferred items. No card, hero, zone, or wiring changes.
