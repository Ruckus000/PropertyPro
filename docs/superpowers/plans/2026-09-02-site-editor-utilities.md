# Site Editor Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a property manager duplicate a section, hide a section from visitors, reuse a photo already placed elsewhere on the site, and see storage usage against quota.

**Architecture:** `hidden` is an optional field on block **content**, so the draft/publish machinery is untouched — hiding drafts and publishes like any other edit. The public page and the PM preview filter hidden blocks through one shared helper; the editor API deliberately does not. Photo reuse is derived client-side from blocks React Query already holds, so there is no new endpoint. The storage meter adds two read-only fields to the existing settings GET.

**Tech Stack:** TypeScript, Zod (`.strict()` content schemas), Next.js 15 App Router, React 19, TanStack Query, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-02-site-editor-utilities-design.md`

---

> **Corrections applied during execution (2026-09-02).** This plan was executed via
> subagent-driven development and was wrong in the places below. The code and the PR body
> are authoritative; the task text under each heading is not.
> - **T3:** `useUpsertContentBlock` is NOT in `editor-context.tsx` — import it from
>   `@/hooks/use-content-blocks`. It takes `communityId` as its hook argument; the mutate
>   payload is `{ blockType, blockOrder, content }`.
> - **T4:** the "shift each later section down" model is wrong. Reorder is an ARRAY-MOVE
>   (`moveWithin`), `moveTo` early-returns on an unoccupied target, and upserting onto an
>   occupied order REPLACES. Append to `nextContentSlot`, then move by `(slot, blockType)`
>   once the refetch delivers the row. `toOrder` names the next OCCUPIED neighbour, never
>   `sourceOrder + 1` (slots are sparse; the server rejects an unoccupied target).
> - **T5:** `collectBlockAssetPaths` returns `{ field, value }[]`, not `{ path }`. Use the
>   WHOLE-SITE `useContentBlocks`, not the page-narrowed context `blocks`. The spec's Image
>   inspector entry point was NOT built — `ImageForm` has no upload to sit beside.
> - **T6:** there is no `SITE_ASSETS_QUOTA_BYTES`; the quota is per-community and NULLABLE
>   (`getSiteAssetsQuotaBytes`). GET and PATCH SHARE `siteSettingsResponse`, and the update
>   hook writes the PATCH response into the cache — `storage` must come from BOTH verbs.
> - **T7:** `assertPathsScopedToCommunity(communityId, paths)` — `communityId` FIRST. The
>   revert-check must go through the ROUTE; a direct-call unit test cannot redden when a
>   caller is removed.
> - Review found four bugs no task anticipated (hidden lost on edit; telemetry/render split
>   unpinned; duplicate re-entrancy; audit after a post-write read). See the PR body.

## Background the engineer needs

**The draft/tombstone model.** `site_blocks.deleted_at` is not a "deleted" flag in the usual sense — it is how publishing works. Publishing retires the previous published row through it, and tombstone drafts are soft-deleted so their slot ends empty. **Never add a new meaning to `deleted_at`.** This is why `hidden` lives in `content`.

**Content schemas are `.strict()`.** Every block content schema in `packages/shared/src/site-blocks/*.ts` rejects unknown keys. A field must be added to each schema explicitly or writes carrying it will 400.

**Three consumers of `listSiteBlocks`, two behaviours:**

| Call site | Hidden blocks |
|---|---|
| `apps/web/src/app/public-site/[[...slug]]/page.tsx:297` | filtered out |
| `apps/web/src/app/(authenticated)/pm/site-preview/page.tsx:105` | filtered out (it previews the public site) |
| `apps/web/src/app/api/v1/pm/site/blocks/route.ts:76-77` | **kept** — the PM must see and edit them |

**Test placement.** `apps/web` tests default to the **node** vitest project. A test that touches the DOM needs a top-of-file `// @vitest-environment jsdom` docblock or it fails with `document is not defined`. `packages/shared` runs plain `vitest run`.

**Running one test file:** `pnpm test <path>` — no `--`. `pnpm test -- <path>` silently runs the whole suite and exits 0.

---

## File Structure

**Create:**
- `apps/web/src/lib/site/visible-blocks.ts` — the one public-visibility filter, used by both public render paths.
- `apps/web/src/components/pm/site-editor-v3/panels/PhotoPicker.tsx` — "choose from your photos" list.
- `apps/web/src/lib/site-editor/placed-photos.ts` — derives placed photos from loaded blocks.

**Modify:**
- `packages/shared/src/site-blocks/types.ts` — add `hiddenSchema`.
- `packages/shared/src/site-blocks/{text,image,documents,meetings,announcements,contact,faq,gallery,amenities,payments}.ts` — accept `hidden`. **Not `hero.ts`** (the hero cannot be hidden).
- `apps/web/src/app/public-site/[[...slug]]/page.tsx:297` and `apps/web/src/app/(authenticated)/pm/site-preview/page.tsx:105` — apply the filter.
- `apps/web/src/components/pm/site-editor-v3/panels/SectionList.tsx` — duplicate + hide row actions.
- `apps/web/src/components/pm/site-editor-v3/panels/AddImageFlow.tsx` — picker entry point.
- `apps/web/src/app/api/v1/pm/site/settings/contract.ts` + its `route.ts` — read-only usage fields.
- `apps/web/src/components/pm/site-editor-v3/panels/SitePanel.tsx` — the meter.

---

### Task 1: `hidden` on block content schemas

**Files:**
- Modify: `packages/shared/src/site-blocks/types.ts`
- Modify: the ten non-hero schema files listed above
- Test: `packages/shared/__tests__/site-blocks/hidden-field.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Enumerate from the registry so a newly added block type cannot silently miss the field.

```ts
// packages/shared/__tests__/site-blocks/hidden-field.test.ts
import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES, blockSchemaRegistry } from '../../src/site-blocks/index';

/** Minimal valid content per type, so the only variable is `hidden`. */
const VALID: Record<string, unknown> = {
  hero: { headline: 'Sunset Condos' },
  text: { body: 'Board meeting Tuesday.' },
  image: { imagePath: '1/content/a-pool.jpg', altText: 'The community pool' },
  documents: {},
  meetings: {},
  announcements: {},
  contact: {},
  faq: { items: [{ question: 'When is trash day?', answer: 'Tuesday.' }] },
  gallery: { images: [{ imagePath: '1/content/a-pool.jpg', altText: 'Pool' }] },
  amenities: { items: [{ name: 'Pool' }] },
  payments: {},
};

const HIDEABLE = BLOCK_TYPES.filter((t) => t !== 'hero');

describe('hidden field', () => {
  it('every hideable block type accepts hidden: true', () => {
    for (const blockType of HIDEABLE) {
      const result = blockSchemaRegistry[blockType].safeParse({
        ...(VALID[blockType] as object),
        hidden: true,
      });
      expect(result.success, `${blockType} rejected hidden: true`).toBe(true);
    }
  });

  it('every hideable block type still accepts content without hidden', () => {
    for (const blockType of HIDEABLE) {
      const result = blockSchemaRegistry[blockType].safeParse(VALID[blockType]);
      expect(result.success, `${blockType} rejected content without hidden`).toBe(true);
    }
  });

  it('hero rejects hidden — the welcome region cannot be hidden', () => {
    const result = blockSchemaRegistry.hero.safeParse({ ...(VALID.hero as object), hidden: true });
    expect(result.success).toBe(false);
  });

  it('hidden: false is rejected — absence means visible', () => {
    const result = blockSchemaRegistry.text.safeParse({ body: 'x', hidden: false });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @propertypro/shared test __tests__/site-blocks/hidden-field.test.ts`
Expected: FAIL — `text rejected hidden: true` (the `.strict()` schemas reject the unknown key).

- [ ] **Step 3: Add the shared fragment**

In `packages/shared/src/site-blocks/types.ts`, beside `blockVariantSchema`:

```ts
/**
 * Hidden from visitors while kept in the editor — for seasonal sections a PM
 * wants back later.
 *
 * `z.literal(true)` not `z.boolean()`: absence is the only way to say "visible",
 * so there is exactly one representation of each state and no `hidden: false`
 * rows to reason about. Same shape as `imageBlockSchema.decorative`.
 *
 * NOT on `heroBlockSchema` — the hero is the welcome region, and a site whose
 * first screen is missing reads as broken rather than as edited.
 *
 * This is CONTENT, so it drafts and publishes like any other edit; the
 * draft/tombstone machinery is untouched. Public visibility is applied by
 * `visibleBlocks()` in apps/web/src/lib/site/visible-blocks.ts.
 */
export const hiddenSchema = z.literal(true);
```

- [ ] **Step 4: Add the field to the ten hideable schemas**

In each of `text.ts`, `image.ts`, `documents.ts`, `meetings.ts`, `announcements.ts`, `contact.ts`, `faq.ts`, `gallery.ts`, `amenities.ts`, `payments.ts`: import `hiddenSchema` from `./types` and add this line inside the `z.object({ … })`, before `.strict()`:

```ts
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
```

Example — `text.ts` after the edit:

```ts
import { z } from 'zod';
import { blockVariantSchema, hiddenSchema } from './types';

export const textBlockSchema = z
  .object({
    body: z.string().min(1).max(5000),
    variant: blockVariantSchema.optional(),
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
  })
  .strict();
```

`image.ts` and `gallery.ts` carry a `.refine()` after `.strict()` — add the field inside the object, leaving the refine untouched.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @propertypro/shared test __tests__/site-blocks/hidden-field.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the whole shared suite for regressions**

Run: `pnpm --filter @propertypro/shared test`
Expected: PASS. The existing per-type tests assert rejection of unknown keys; none of them use `hidden`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/site-blocks packages/shared/__tests__/site-blocks/hidden-field.test.ts
git commit -m "feat(site-blocks): accept a hidden flag on block content

Optional z.literal(true) on the ten hideable content schemas, so absence is the
only representation of visible. Not on hero — the welcome region cannot be
hidden. Enumerated from blockSchemaRegistry so a new block type cannot silently
miss the field."
```

---

### Task 2: Filter hidden blocks from public output

**Files:**
- Create: `apps/web/src/lib/site/visible-blocks.ts`
- Test: `apps/web/__tests__/site/visible-blocks.test.ts` (create)
- Modify: `apps/web/src/app/public-site/[[...slug]]/page.tsx:297`
- Modify: `apps/web/src/app/(authenticated)/pm/site-preview/page.tsx:105`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/site/visible-blocks.test.ts
import { describe, it, expect } from 'vitest';
import { visibleBlocks } from '@/lib/site/visible-blocks';

const block = (id: number, content: unknown) => ({
  id,
  blockType: 'text',
  blockOrder: id,
  content,
});

describe('visibleBlocks', () => {
  it('drops blocks whose content marks them hidden', () => {
    const out = visibleBlocks([block(1, { body: 'a' }), block(2, { body: 'b', hidden: true })]);
    expect(out.map((b) => b.id)).toEqual([1]);
  });

  it('keeps blocks with no hidden key', () => {
    const out = visibleBlocks([block(1, { body: 'a' })]);
    expect(out).toHaveLength(1);
  });

  it('keeps a block whose content is not an object', () => {
    // Malformed content is the per-block renderer's problem — it degrades to
    // null with a Sentry report. Swallowing it here would hide that signal.
    const out = visibleBlocks([block(1, null), block(2, 'nonsense')]);
    expect(out).toHaveLength(2);
  });

  it('does not treat a falsy hidden value as hidden', () => {
    const out = visibleBlocks([block(1, { body: 'a', hidden: false })]);
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/web/__tests__/site/visible-blocks.test.ts`
Expected: FAIL — cannot resolve `@/lib/site/visible-blocks`.

- [ ] **Step 3: Write the filter**

```ts
// apps/web/src/lib/site/visible-blocks.ts
/**
 * Drops sections a PM has hidden from visitors.
 *
 * Applied at the two PUBLIC render paths — the public site and the PM preview
 * of it — and deliberately NOT in `listSiteBlocks`, because the editor API
 * (api/v1/pm/site/blocks) shares that reader and must keep returning hidden
 * sections so the PM can see and unhide them.
 *
 * Malformed content passes through untouched: each block renderer already
 * degrades a failed safeParse to null with a Sentry report, and quietly
 * dropping it here would remove that signal.
 */
export function visibleBlocks<T extends { content: unknown }>(blocks: readonly T[]): T[] {
  return blocks.filter(
    (b) => !(typeof b.content === 'object' && b.content !== null && (b.content as { hidden?: unknown }).hidden === true),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test apps/web/__tests__/site/visible-blocks.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Apply at the public page**

In `apps/web/src/app/public-site/[[...slug]]/page.tsx`, add the import at the top with the other `@/lib` imports:

```ts
import { visibleBlocks } from '@/lib/site/visible-blocks';
```

Then change line 297's assignment to wrap the read:

```ts
    const blocks = visibleBlocks(
      await reader.listSiteBlocks({
        includeDrafts: isPreview,
        ...(pageId === null ? {} : { pageId }),
      }),
    );
```

- [ ] **Step 6: Apply at the PM preview**

Same import in `apps/web/src/app/(authenticated)/pm/site-preview/page.tsx`, and wrap the `listSiteBlocks` call at line 105 in `visibleBlocks(...)` the same way. A preview that showed hidden sections would misrepresent what visitors see.

- [ ] **Step 7: Verify the editor API was NOT changed**

Run: `grep -n "visibleBlocks" apps/web/src/app/api/v1/pm/site/blocks/route.ts`
Expected: no output. The editor must keep returning hidden sections.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/site/visible-blocks.ts apps/web/__tests__/site/visible-blocks.test.ts "apps/web/src/app/public-site/[[...slug]]/page.tsx" "apps/web/src/app/(authenticated)/pm/site-preview/page.tsx"
git commit -m "feat(public-site): omit hidden sections from public output

One filter applied at the two public render paths, not in listSiteBlocks — the
editor API shares that reader and must keep returning hidden sections so the PM
can unhide them. Malformed content passes through so the per-block renderer's
Sentry signal survives."
```

---

### Task 3: Hide toggle in the section list

**Files:**
- Modify: `apps/web/src/components/pm/site-editor-v3/panels/SectionList.tsx`
- Test: `apps/web/__tests__/pm/site-editor-v3/section-list-hide.test.tsx` (create)

`SectionList` takes only `className` and `onAddSection` as props — it reads everything else from `useSiteEditor()` (`movableSections`, `isSelected`, `select`, `canMove`, `move`, `moveTo`, `isMoving`). So the two new actions belong in that context beside `move`/`moveTo`, not as new props, and the test mocks the hook.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// apps/web/__tests__/pm/site-editor-v3/section-list-hide.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionList } from '@/components/pm/site-editor-v3/panels/SectionList';

const toggleHidden = vi.fn();
const duplicate = vi.fn();

const sections = [
  { id: 1, blockType: 'text', blockOrder: 0, content: { body: 'Welcome' } },
  { id: 2, blockType: 'text', blockOrder: 1, content: { body: 'Rules', hidden: true } },
];

vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => ({
    movableSections: sections,
    isSelected: () => false,
    select: vi.fn(),
    canMove: () => true,
    move: vi.fn(),
    moveTo: vi.fn(),
    isMoving: false,
    toggleHidden,
    duplicate,
  }),
}));

describe('SectionList hide affordance', () => {
  beforeEach(() => {
    toggleHidden.mockClear();
    duplicate.mockClear();
  });

  it('labels a hidden section as hidden', () => {
    render(<SectionList />);
    expect(screen.getByText(/^hidden$/i)).toBeInTheDocument();
  });

  it('calls toggleHidden with the block id and the next state', async () => {
    render(<SectionList />);
    await userEvent.click(screen.getByRole('button', { name: /^hide .* section$/i }));
    expect(toggleHidden).toHaveBeenCalledWith(1, true);
  });

  it('offers to show a section that is already hidden', async () => {
    render(<SectionList />);
    await userEvent.click(screen.getByRole('button', { name: /^show .* section$/i }));
    expect(toggleHidden).toHaveBeenCalledWith(2, false);
  });

  it('calls duplicate with the block id', async () => {
    render(<SectionList />);
    const [first] = screen.getAllByRole('button', { name: /^duplicate .* section$/i });
    await userEvent.click(first);
    expect(duplicate).toHaveBeenCalledWith(1);
  });
});
```

Note the context addresses sections by **`blockId`**, matching `move(blockId, direction)` and `moveTo(blockId, toOrder)`. Do not introduce a second addressing scheme.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/section-list-hide.test.tsx`
Expected: FAIL — no button matches `/hide .* section/i`.

- [ ] **Step 3: Add `toggleHidden` and `duplicate` to the editor context**

In `apps/web/src/components/pm/site-editor-v3/editor-context.tsx`, add to the context type beside `moveTo`:

```ts
  /** Show or hide a section from visitors. Second arg is the NEXT state. */
  toggleHidden: (blockId: number, hidden: boolean) => void;
  /** Copy a section into the slot below it. */
  duplicate: (blockId: number) => void;
```

Implement them in the provider using the block upsert mutation already available there (the same one the inspector forms write through — find it with `grep -n "useUpsertContentBlock" apps/web/src/components/pm/site-editor-v3/editor-context.tsx`):

```ts
  const toggleHidden = useCallback(
    (blockId: number, hidden: boolean) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block || block.blockType === 'hero') return;
      const { hidden: _drop, ...rest } = (block.content ?? {}) as Record<string, unknown>;
      upsertBlock.mutate({
        communityId,
        blockType: block.blockType,
        blockOrder: block.blockOrder,
        content: hidden ? { ...rest, hidden: true } : rest,
      });
    },
    [blocks, communityId, upsertBlock],
  );
```

`hidden: false` is not a valid value — unhiding removes the key.

- [ ] **Step 4: Add the controls to `SectionList`**

Destructure the two new members from `useSiteEditor()` at line 79, then add to the existing button cluster beside the move controls (import `Eye`, `EyeOff`, `Copy` from `lucide-react`):

```tsx
{section.blockType !== 'hero' && (
  <>
    <button
      type="button"
      onClick={() => toggleHidden(section.id, !isHidden)}
      aria-label={`${isHidden ? 'Show' : 'Hide'} ${label} section`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {isHidden ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
    </button>
    <button
      type="button"
      onClick={() => duplicate(section.id)}
      aria-label={`Duplicate ${label} section`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Copy className="h-4 w-4" aria-hidden="true" />
    </button>
  </>
)}
```

Derive `isHidden` where the row destructures its section:

```tsx
const isHidden =
  typeof section.content === 'object' &&
  section.content !== null &&
  (section.content as { hidden?: unknown }).hidden === true;
```

And render the badge beside the section label:

```tsx
{isHidden && (
  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-tertiary">Hidden</span>
)}
```

`focus-visible:` not `focus:` — #1004 standardised on this, and `verify-web-class-resolution.ts` fails on a colour class that does not resolve.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/section-list-hide.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run guards**

Run: `pnpm exec tsx scripts/verify-web-class-resolution.ts && pnpm guard:design-tokens`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/pm/site-editor-v3 apps/web/__tests__/pm/site-editor-v3/section-list-hide.test.tsx
git commit -m "feat(site-editor): hide a section from visitors

Eye toggle and Hidden badge in the section list. Writes hidden into block
content through the existing upsert, so it drafts and publishes like any other
edit. Unhiding removes the key rather than writing false. No affordance on the
hero."
```

---

### Task 4: Duplicate a section

**Files:**
- Modify: the panel wiring `SectionList` (same file as Task 3 Step 5)
- Test: `apps/web/__tests__/pm/site-editor-v3/duplicate-section.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Test the pure helper, not the React wiring — the ordering rule is the part worth pinning.

```ts
// apps/web/__tests__/pm/site-editor-v3/duplicate-section.test.ts
import { describe, it, expect } from 'vitest';
import { planDuplicate } from '@/lib/site-editor/plan-duplicate';

const blocks = [
  { id: 1, blockType: 'text', blockOrder: 0, content: { body: 'a' } },
  { id: 2, blockType: 'image', blockOrder: 1, content: { imagePath: '1/content/x.jpg', altText: 'X' } },
  { id: 3, blockType: 'text', blockOrder: 2, content: { body: 'c' } },
];

describe('planDuplicate', () => {
  it('places the copy directly below the source', () => {
    const plan = planDuplicate(blocks, 1);
    expect(plan?.insertAt).toBe(2);
  });

  it('copies blockType and content verbatim', () => {
    const plan = planDuplicate(blocks, 1);
    expect(plan?.blockType).toBe('image');
    expect(plan?.content).toEqual({ imagePath: '1/content/x.jpg', altText: 'X' });
  });

  it('shifts every later section down by one', () => {
    const plan = planDuplicate(blocks, 1);
    expect(plan?.shift).toEqual([{ from: 2, to: 3 }]);
  });

  it('needs no shift when duplicating the last section', () => {
    const plan = planDuplicate(blocks, 2);
    expect(plan?.shift).toEqual([]);
  });

  it('returns null for an order that does not exist', () => {
    expect(planDuplicate(blocks, 99)).toBeNull();
  });

  it('does not copy the hidden flag — a duplicate starts visible', () => {
    const withHidden = [{ id: 9, blockType: 'text', blockOrder: 0, content: { body: 'a', hidden: true } }];
    expect(planDuplicate(withHidden, 0)?.content).toEqual({ body: 'a' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/duplicate-section.test.ts`
Expected: FAIL — cannot resolve `@/lib/site-editor/plan-duplicate`.

- [ ] **Step 3: Write the helper**

```ts
// apps/web/src/lib/site-editor/plan-duplicate.ts
export interface DuplicatePlan {
  blockType: string;
  content: Record<string, unknown>;
  insertAt: number;
  /** Existing sections that must move down to free the slot, deepest first. */
  shift: { from: number; to: number }[];
}

/**
 * Works out where a copy goes and what has to move.
 *
 * The copy starts VISIBLE even when the source is hidden: duplicating is an
 * authoring action, and a copy that silently inherited hidden would look like
 * nothing happened.
 */
export function planDuplicate(
  blocks: readonly { blockType: string; blockOrder: number; content: unknown }[],
  sourceOrder: number,
): DuplicatePlan | null {
  const source = blocks.find((b) => b.blockOrder === sourceOrder);
  if (!source) return null;

  const { hidden: _drop, ...content } = (source.content ?? {}) as Record<string, unknown>;

  const shift = blocks
    .filter((b) => b.blockOrder > sourceOrder)
    .sort((a, b) => b.blockOrder - a.blockOrder)
    .map((b) => ({ from: b.blockOrder, to: b.blockOrder + 1 }));

  return { blockType: source.blockType, content, insertAt: sourceOrder + 1, shift };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/duplicate-section.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Implement `duplicate` in the editor context**

Beside `toggleHidden` from Task 3. Note it takes a **blockId** and resolves the order itself, matching the rest of the context API:

```ts
const duplicate = (blockId: number) => {
  const source = blocks.find((b) => b.id === blockId);
  if (!source) return;
  const plan = planDuplicate(blocks, source.blockOrder);
  if (!plan) return;
  // Deepest-first so no two sections transiently share a slot.
  // Deepest-first so no two sections transiently share a slot. `moveTo`
  // addresses by blockId, so resolve each order back to its block.
  for (const { from, to } of plan.shift) {
    const b = blocks.find((x) => x.blockOrder === from);
    if (b) moveTo(b.id, to);
  }
  upsertBlock.mutate({
    communityId,
    blockType: plan.blockType,
    blockOrder: plan.insertAt,
    content: plan.content,
  });
};
```

`moveTo` is the context's existing reorder call — the same one the drag handle uses.

- [ ] **Step 6: Assert the quota is untouched**

Add to the same test file — the spec calls for it, and it is the property that makes duplication safe:

```ts
it('carries the image path so a duplicate needs no upload', () => {
  const plan = planDuplicate(blocks, 1);
  // Same path, not a copied file — nothing is written to storage, so
  // assetsBytesUsed cannot move.
  expect((plan?.content as { imagePath: string }).imagePath).toBe('1/content/x.jpg');
});
```

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/duplicate-section.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Verify by hand in the editor**

Run the app, open a community's website editor, duplicate the middle of three sections. Expected: the copy appears directly below the source, the sections below shift down, and the copy is marked as a draft. Confirm the publish review sheet lists it as an added section.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/site-editor/plan-duplicate.ts apps/web/__tests__/pm/site-editor-v3/duplicate-section.test.ts apps/web/src/components/pm/site-editor-v3
git commit -m "feat(site-editor): duplicate a section

Composes the existing upsert and reorder mutations — no new endpoint. The copy
lands below the source as a draft, and starts visible even when the source is
hidden. Image sections copy the path reference, so no upload and no quota change."
```

---

### Task 5: Reuse a photo already placed on the site

**Files:**
- Create: `apps/web/src/lib/site-editor/placed-photos.ts`
- Create: `apps/web/src/components/pm/site-editor-v3/panels/PhotoPicker.tsx`
- Test: `apps/web/__tests__/pm/site-editor-v3/placed-photos.test.ts` (create)
- Modify: `apps/web/src/components/pm/site-editor-v3/panels/AddImageFlow.tsx`

`collectBlockAssetPaths(blockType, content)` in `apps/web/src/lib/site-assets/scoped-paths.ts` already extracts the asset paths a block references. Read it before writing the helper.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/pm/site-editor-v3/placed-photos.test.ts
import { describe, it, expect } from 'vitest';
import { placedPhotos } from '@/lib/site-editor/placed-photos';

const blocks = [
  { blockType: 'image', blockOrder: 0, content: { imagePath: '1/content/pool.jpg', altText: 'Pool' } },
  { blockType: 'gallery', blockOrder: 1, content: { images: [
    { imagePath: '1/content/pool.jpg', altText: 'Pool again' },
    { imagePath: '1/content/lobby.jpg', altText: 'Lobby' },
  ] } },
  { blockType: 'text', blockOrder: 2, content: { body: 'no photos here' } },
];

describe('placedPhotos', () => {
  it('returns each distinct path once', () => {
    expect(placedPhotos(blocks).map((p) => p.path).sort()).toEqual([
      '1/content/lobby.jpg',
      '1/content/pool.jpg',
    ]);
  });

  it('counts how many sections use a photo', () => {
    const pool = placedPhotos(blocks).find((p) => p.path === '1/content/pool.jpg');
    expect(pool?.useCount).toBe(2);
  });

  it('returns nothing when no block references a photo', () => {
    expect(placedPhotos([blocks[2]])).toEqual([]);
  });

  it('ignores malformed content rather than throwing', () => {
    expect(placedPhotos([{ blockType: 'image', blockOrder: 0, content: null }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/placed-photos.test.ts`
Expected: FAIL — cannot resolve `@/lib/site-editor/placed-photos`.

- [ ] **Step 3: Write the helper**

```ts
// apps/web/src/lib/site-editor/placed-photos.ts
import { collectBlockAssetPaths } from '@/lib/site-assets/scoped-paths';

export interface PlacedPhoto {
  path: string;
  /** How many sections currently reference it. */
  useCount: number;
}

/**
 * Every photo already placed somewhere on this community's site.
 *
 * Derived from blocks React Query already holds — `useContentBlocks` fetches
 * the whole community, and EditorRoot only narrows per page for the canvas.
 * So this needs no endpoint, no storage listing and no new tenancy surface:
 * these paths were validated by `assertPathsScopedToCommunity` when written.
 *
 * The trade is that a photo uploaded and then removed from every section is not
 * offered. That is the orphan case; see the spec.
 */
export function placedPhotos(
  blocks: readonly { blockType: string; content: unknown }[],
): PlacedPhoto[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    let paths: { path: string }[] = [];
    try {
      paths = collectBlockAssetPaths(block.blockType, block.content);
    } catch {
      continue; // malformed content is the renderer's problem, not the picker's
    }
    for (const { path } of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts.entries()].map(([path, useCount]) => ({ path, useCount }));
}
```

If `collectBlockAssetPaths` returns bare strings rather than `{ path }` objects, adjust the destructure to match — check its signature before writing.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/placed-photos.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Build the picker**

```tsx
// apps/web/src/components/pm/site-editor-v3/panels/PhotoPicker.tsx
'use client';

import Image from 'next/image';
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import type { PlacedPhoto } from '@/lib/site-editor/placed-photos';

export interface PhotoPickerProps {
  photos: readonly PlacedPhoto[];
  onSelect: (path: string) => void;
}

/**
 * Pick a photo already placed elsewhere on the site, instead of uploading it
 * again. Alt text is NOT carried over — it is contextual to each placement,
 * so the caller collects it for the new use.
 */
export function PhotoPicker({ photos, onSelect }: PhotoPickerProps) {
  if (photos.length === 0) {
    return (
      <p className="text-sm text-content-secondary">
        No photos on your site yet. Upload one and it will be available here.
      </p>
    );
  }

  return (
    <ul aria-label="Photos already on your site" className="grid grid-cols-3 gap-3">
      {photos.map((photo) => (
        <li key={photo.path}>
          <button
            type="button"
            onClick={() => onSelect(photo.path)}
            aria-label={`Use this photo — currently in ${photo.useCount} ${photo.useCount === 1 ? 'section' : 'sections'}`}
            className="group relative block w-full overflow-hidden rounded-md border border-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Image
              src={buildPublicAssetUrl(photo.path)}
              alt=""
              width={160}
              height={120}
              className="h-24 w-full object-cover"
            />
            <span className="block px-2 py-1 text-left text-xs text-content-tertiary">
              In {photo.useCount} {photo.useCount === 1 ? 'section' : 'sections'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`alt=""` on the thumbnail is deliberate — the button carries the accessible name, so a duplicate alt would be read twice.

- [ ] **Step 6: Wire it into `AddImageFlow`**

Add a mode toggle above the existing upload control — "Upload a photo" / "Choose from your photos" — rendering `<PhotoPicker>` in the second mode. On select, set `imagePath` to the chosen path and advance to the existing alt-text step, so alt is collected for this placement exactly as it is for an upload. Read `AddImageFlow.tsx`'s existing step flow first; alt text is collected **before** upload today, and the picker path must not break that ordering contract.

- [ ] **Step 7: Verify by hand**

Place a photo in an image section, then add a gallery section and choose the same photo from the picker. Expected: no second upload, the storage meter does not move, and the gallery asks for its own alt text.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/site-editor/placed-photos.ts apps/web/src/components/pm/site-editor-v3/panels/PhotoPicker.tsx apps/web/__tests__/pm/site-editor-v3/placed-photos.test.ts apps/web/src/components/pm/site-editor-v3/panels/AddImageFlow.tsx
git commit -m "feat(site-editor): reuse a photo already placed on the site

Candidates are derived from blocks React Query already holds, via the existing
collectBlockAssetPaths — no endpoint, no storage listing, no new tenancy
surface. Alt text stays per placement, since it is contextual to use."
```

---

### Task 6: Storage meter in the Site panel

**Files:**
- Modify: `apps/web/src/app/api/v1/pm/site/settings/contract.ts`
- Modify: `apps/web/src/app/api/v1/pm/site/settings/route.ts`
- Modify: `apps/web/src/components/pm/site-editor-v3/panels/SitePanel.tsx`
- Test: `apps/web/__tests__/pm/site-settings-storage.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/pm/site-settings-storage.test.ts
import { describe, it, expect } from 'vitest';
import { siteSettingsGetContract, siteSettingsPatchContract } from '@/app/api/v1/pm/site/settings/contract';

describe('site settings storage fields', () => {
  it('the GET response carries usage and the quota', () => {
    const parsed = siteSettingsGetContract.response.safeParse({
      settings: { seoTitle: null, seoDescription: null, favicon: null },
      footer: { associationName: null, note: null },
      storage: { assetsBytesUsed: 1024, quotaBytes: 524288000 },
    });
    expect(parsed.success).toBe(true);
  });

  it('the PATCH body still rejects assetsBytesUsed', () => {
    const parsed = siteSettingsPatchContract.request.body!.safeParse({
      communityId: 1,
      assetsBytesUsed: 0,
    });
    expect(parsed.success).toBe(false);
  });
});
```

The second case is the important one: it pins the mass-assignment guard that made this field unreachable in the first place.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/web/__tests__/pm/site-settings-storage.test.ts`
Expected: FAIL on the first case — `storage` is an unknown key in the response schema.

- [ ] **Step 3: Widen the GET response only**

In `contract.ts`, beside `siteSettingsSchema`:

```ts
/**
 * Read-only. Deliberately NOT reachable through the PATCH body — that object is
 * `.strict()` precisely to stop a caller reaching sibling branding keys such as
 * assetsBytesUsed. Reading the community's own usage is a different thing.
 */
const siteStorageSchema = z.object({
  assetsBytesUsed: z.number().int().nonnegative(),
  quotaBytes: z.number().int().positive(),
});
```

and add it to the response:

```ts
const siteSettingsResponse = z.object({
  settings: siteSettingsSchema,
  footer: siteFooterSchema,
  storage: siteStorageSchema,
});
```

Leave the PATCH body untouched.

- [ ] **Step 4: Populate it in the route**

In `route.ts`'s GET handler, import the existing helper and the quota constant from `@/lib/site-assets/quota`, then add to the returned object:

```ts
    storage: {
      assetsBytesUsed: await getCommunitySiteAssetsUsage(communityId),
      quotaBytes: SITE_ASSETS_QUOTA_BYTES,
    },
```

Check the exported constant's name in `quota.ts` and use it verbatim; do not hardcode the number.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test apps/web/__tests__/pm/site-settings-storage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Render the meter**

In `SitePanel.tsx`, below the existing site fields:

```tsx
<section aria-labelledby="storage-heading" className="flex flex-col gap-2">
  <h3 id="storage-heading" className="text-sm font-semibold text-content">Photo storage</h3>
  <div
    role="progressbar"
    aria-valuenow={Math.round((storage.assetsBytesUsed / storage.quotaBytes) * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label="Photo storage used"
    className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
  >
    <div
      className="h-full bg-interactive"
      style={{ width: `${Math.min(100, (storage.assetsBytesUsed / storage.quotaBytes) * 100)}%` }}
    />
  </div>
  <p className="text-xs text-content-tertiary">
    {formatBytes(storage.assetsBytesUsed)} of {formatBytes(storage.quotaBytes)} used
  </p>
</section>
```

Check for an existing byte formatter before writing one: `grep -rn "formatBytes\|prettyBytes" apps/web/src/lib`. Reuse it if present.

- [ ] **Step 7: Run the contract and guard checks**

Run: `pnpm guard:contracts && pnpm exec tsx scripts/verify-web-class-resolution.ts`
Expected: both exit 0. The settings route is already contracted, so widening its response must keep `guard:contracts` green.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/v1/pm/site/settings apps/web/src/components/pm/site-editor-v3/panels/SitePanel.tsx apps/web/__tests__/pm/site-settings-storage.test.ts
git commit -m "feat(site-editor): show photo storage against quota

Two read-only fields on the existing settings GET rather than a new route. The
PATCH body is untouched, so the mass-assignment guard that made assetsBytesUsed
unreachable still holds — pinned by a test."
```

---

### Task 7: Tenancy revert-check

**Files:**
- Test: `apps/web/__tests__/pm/site-editor-v3/photo-tenancy.test.ts` (create)

The picker hands back a path that becomes `imagePath` on a block. `imagePathSchema` validates **shape**, not tenancy — `^\d+/…` means any digits pass. #987 closed this for blocks after hero had already bound its segment. This task proves the guard still holds.

- [ ] **Step 1: Write the test**

```ts
// apps/web/__tests__/pm/site-editor-v3/photo-tenancy.test.ts
import { describe, it, expect } from 'vitest';
import { assertPathsScopedToCommunity, collectBlockAssetPaths } from '@/lib/site-assets/scoped-paths';

describe('image path tenancy', () => {
  it('accepts a path whose leading segment is this community', () => {
    const paths = collectBlockAssetPaths('image', { imagePath: '7/content/pool.jpg', altText: 'Pool' });
    expect(() => assertPathsScopedToCommunity(paths, 7)).not.toThrow();
  });

  it('rejects a path belonging to another community', () => {
    const paths = collectBlockAssetPaths('image', { imagePath: '8/content/pool.jpg', altText: 'Pool' });
    expect(() => assertPathsScopedToCommunity(paths, 7)).toThrow();
  });

  it('rejects a cross-tenant path inside a gallery', () => {
    const paths = collectBlockAssetPaths('gallery', {
      images: [
        { imagePath: '7/content/a.jpg', altText: 'A' },
        { imagePath: '8/content/b.jpg', altText: 'B' },
      ],
    });
    expect(() => assertPathsScopedToCommunity(paths, 7)).toThrow();
  });
});
```

Adjust the argument order to match `assertPathsScopedToCommunity`'s real signature — read it first.

- [ ] **Step 2: Run and verify it passes**

Run: `pnpm test apps/web/__tests__/pm/site-editor-v3/photo-tenancy.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Revert-check — prove the tests are not vacuous**

Comment out the `assertPathsScopedToCommunity` call on the block write path (find it with `grep -rn "assertPathsScopedToCommunity" apps/web/src/app/api/v1/pm/site/blocks/`). Re-run the suite.

Expected: the two rejection cases go red **with a tenancy assertion failure**, not "function not defined"; the accept case stays green. Record which line you removed and how many tests reddened, then restore it and confirm green again.

If nothing reddens, the guard is not on the path the picker writes through — that is a real finding. Stop and report it rather than proceeding.

- [ ] **Step 4: Commit**

```bash
git add apps/web/__tests__/pm/site-editor-v3/photo-tenancy.test.ts
git commit -m "test(site-editor): pin cross-tenant rejection for picked photos

imagePathSchema validates shape, not tenancy — any digits pass — so the picker
returning a path makes assertPathsScopedToCommunity load-bearing. Revert-checked
against the block write path."
```

---

### Task 8: Full verification and PR

- [ ] **Step 1: Run the affected suites**

```bash
pnpm --filter @propertypro/shared test
pnpm test apps/web/__tests__/site apps/web/__tests__/pm
```
Expected: all pass.

- [ ] **Step 2: Run lint and guards**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0 both. Do not pipe these — in zsh a pipe reports the last command's status, so use `${pipestatus[1]}` if you must.

- [ ] **Step 3: Verify hiding reads as a change in the publish review sheet**

Hide a section, then open the publish sheet without publishing. Expected: the section is listed as a pending change naming it — not absent, and not described only as a generic content edit. The spec flags this as a risk: a PM who cannot see that they are about to hide something cannot review it.

- [ ] **Step 4: Verify hidden sections never reach visitors**

Start the app, hide a section, publish, then load the public site as a logged-out visitor. Expected: the section is absent from the public page **and** from the PM preview, while remaining visible and editable in the editor.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feat/site-editor-utilities
gh pr create --base main --title "feat(site-editor): duplicate, hide, and photo reuse" --body "Implements docs/superpowers/specs/2026-09-02-site-editor-utilities-design.md — closes G-06 and G-10 from the Website Editor audit ledger."
```
