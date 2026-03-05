# Task 3.4 — Site Builder UI

> **Context files to read first:** `SHARED-CONTEXT.md`, then read:
> - `packages/shared/src/site-blocks.ts` (block types and validation from 3.1)
> - `packages/db/src/schema/site-blocks.ts` (schema from 3.1)
> - `apps/admin/src/middleware.ts` (admin auth pattern)
> - `apps/web/src/components/public-site/blocks/` (renderer components from 3.3)
> - `apps/admin/src/app/api/admin/upload/route.ts` (image upload from 3.2 or 2.3)
> **Branch:** `feat/site-builder`
> **Estimated time:** 5-7 hours
> **Wave 5** — depends on 3.1-3.2 being merged. Can run parallel with 3.3.

## Objective

Build the drag-and-drop site builder in the admin app. Admins edit blocks, see a live iframe preview, and publish.

## Dependencies to install

```bash
cd apps/admin && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Deliverables

### 1. Block CRUD API routes

All routes protected by `requirePlatformAdmin(request)` as first line.

**Create:** `apps/admin/src/app/api/admin/site-blocks/route.ts`

```typescript
// GET /api/admin/site-blocks?communityId=X
// Returns all blocks (draft AND published) for a community, ordered by block_order
// Response: { data: SiteBlock[] }

// POST /api/admin/site-blocks
// Body: { communityId, blockType, content, blockOrder }
// Creates a new DRAFT block
// Validate content with validateBlockContent()
// Response: { data: SiteBlock }
```

**Create:** `apps/admin/src/app/api/admin/site-blocks/[id]/route.ts`

```typescript
// PUT /api/admin/site-blocks/[id]
// Body: { content?, blockOrder? }
// Updates a block's content or order
// Validate content with validateBlockContent() if content is provided
// Response: { data: SiteBlock }

// DELETE /api/admin/site-blocks/[id]
// Deletes a block
// Response: { success: true }
```

**Create:** `apps/admin/src/app/api/admin/site-blocks/publish/route.ts`

```typescript
// POST /api/admin/site-blocks/publish?communityId=X
// For each draft block: set is_draft = false, stamp published_at = now()
// Update communities.site_published_at = now()
// Response: { success: true, publishedCount: number }
```

**Create:** `apps/admin/src/app/api/admin/site-blocks/discard/route.ts`

```typescript
// POST /api/admin/site-blocks/discard?communityId=X
// Delete all draft blocks for the community
// Response: { success: true }
```

All queries use `createAdminClient()` (Drizzle admin client).

### 2. Site builder page

**Create:** `apps/admin/src/app/clients/[id]/site-builder/page.tsx`

Or integrate as a tab within the client workspace — follow whatever pattern Phase 1 established for client detail pages. Read `apps/admin/src/app/clients/[id]/` to understand the layout.

**Layout:** Two columns via CSS Grid:
```tsx
<div className="grid h-[calc(100vh-64px)]" style={{ gridTemplateColumns: '60% 40%' }}>
  <BlockEditor communityId={communityId} />
  <PreviewPanel slug={community.slug} />
</div>
```

### 3. Block editor component

**Create:** `apps/admin/src/components/site-builder/BlockEditor.tsx`

Client component (`'use client'`).

**State management:**
```typescript
const [blocks, setBlocks] = useState<SiteBlock[]>([]);
const [isSaving, setIsSaving] = useState(false);

// Fetch blocks on mount
useEffect(() => {
  fetch(`/api/admin/site-blocks?communityId=${communityId}`)
    .then(r => r.json())
    .then(data => setBlocks(data.data));
}, [communityId]);
```

**Block list:**
- Vertical sortable list using `@dnd-kit/sortable`
- Each block card shows:
  - Drag handle (left)
  - Block type icon + label (e.g., "Hero", "Text", "Image")
  - Expand/collapse toggle
  - Delete button (right, red icon)
- When expanded, shows inline editing fields specific to block type

**Drag and drop:**
```typescript
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableBlock({ block, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners}>⠿</div>
      <BlockCard block={block} onUpdate={onUpdate} onDelete={onDelete} />
    </div>
  );
}
```

On drag end: reorder blocks, send `PUT` for each changed block with new `blockOrder`.

**"Add Block" button:**
- Dropdown at bottom showing all 7 block types
- On select: `POST /api/admin/site-blocks` with default content for that type, `blockOrder` = current max + 1

**Auto-save:**
- Debounce content edits by 500ms
- On debounce fire: `PUT /api/admin/site-blocks/[id]` with updated content
- Show save indicator (small spinner or "Saved" text)

### 4. Block-type-specific editors

**Create:** `apps/admin/src/components/site-builder/editors/` (one file per block type)

Each editor receives `{ content, onChange }` props and renders form fields:

**`HeroEditor.tsx`:**
- Headline (text input, max 120)
- Subheadline (textarea, max 300)
- CTA Label (text input, max 40)
- CTA Link (text input for URL)
- Background image (upload button using `/api/admin/upload`)

**`AnnouncementsEditor.tsx`:**
- Title (text input, default "Announcements")
- Limit (number input, 1-10)

**`DocumentsEditor.tsx`:**
- Title (text input, default "Documents")
- Category filter (multi-select or checkboxes, fetched from community's document categories)

**`MeetingsEditor.tsx`:**
- Title (text input, default "Upcoming Meetings")

**`ContactEditor.tsx`:**
- Board email (email input, required)
- Management company (text input)
- Phone (tel input)
- Address (textarea)

**`TextEditor.tsx`:**
- Body (textarea, max 5000 chars, with character count)

**`ImageEditor.tsx`:**
- Image upload (using `/api/admin/upload`)
- Alt text (text input, max 200, required)
- Caption (text input, max 300, optional)
- Preview of uploaded image

### 5. Preview panel

**Create:** `apps/admin/src/components/site-builder/PreviewPanel.tsx`

```tsx
'use client';
import { useRef, useCallback } from 'react';

export function PreviewPanel({ slug }: { slug: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const refreshPreview = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage('reload', '*');
    } catch {
      // Cross-origin — reload via src reset
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    }
  }, []);

  return (
    <div className="flex flex-col border-l bg-gray-50">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium text-gray-600">Preview</span>
        <button
          onClick={refreshPreview}
          className="text-sm text-blue-600 hover:underline"
        >
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <iframe
          ref={iframeRef}
          src={`https://${slug}.propertyprofl.com`}
          className="h-full w-full origin-top-left rounded border shadow-sm"
          style={{ transform: 'scale(0.7)', width: '143%', height: '143%' }}
          title="Public site preview"
        />
      </div>
    </div>
  );
}
```

**Iframe reload on save:** After each successful block save/create/delete, call `refreshPreview()`. The public site page should include a listener:

```typescript
// In the public site layout or page:
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data === 'reload') window.location.reload();
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

**Note:** This postMessage listener should be added to the public site page (from Task 3.3). If 3.3 was already merged without it, add it now.

### 6. Publish/Discard controls

Add to the BlockEditor component:

```tsx
<div className="flex gap-2 border-t p-4">
  <button
    onClick={() => publish(communityId)}
    className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
  >
    Publish Changes
  </button>
  <button
    onClick={() => discard(communityId)}
    className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
  >
    Discard Drafts
  </button>
</div>
```

Publish calls `POST /api/admin/site-blocks/publish?communityId=X`, then refreshes preview.
Discard calls `POST /api/admin/site-blocks/discard?communityId=X`, then refetches blocks.

Both should show confirmation dialogs before executing.

### 7. Navigation

Add "Site Builder" link to the client detail page navigation/tabs. When on a client's page, there should be a way to access `/clients/[id]/site-builder`.

### 8. Tests

**Create:** `apps/admin/__tests__/site-builder/block-crud.test.ts`

Test the API routes:
1. `POST /api/admin/site-blocks` creates a draft block
2. `GET /api/admin/site-blocks?communityId=X` returns blocks ordered by block_order
3. `PUT /api/admin/site-blocks/[id]` updates content
4. `PUT /api/admin/site-blocks/[id]` with invalid content returns validation error
5. `DELETE /api/admin/site-blocks/[id]` removes block
6. Non-admin request → 403

**Create:** `apps/admin/__tests__/site-builder/publish-flow.test.ts`

Test publish lifecycle:
1. Create draft blocks → publish → blocks have is_draft=false and published_at set
2. Publish updates communities.site_published_at
3. Discard removes all draft blocks, leaves published untouched
4. Re-creating after publish creates new drafts

## Do NOT

- Do not modify block renderer components in `apps/web` — those are from Task 3.3
- Do not modify `packages/shared/src/site-blocks.ts` — the types are defined in Task 3.1
- Do not implement custom domain routing
- Do not implement undo/redo (future enhancement)
- Do not implement block templates/presets (future enhancement)

## Acceptance Criteria

- [ ] Block CRUD API routes work (create, read, update, delete)
- [ ] Content validated with `validateBlockContent()` on create/update
- [ ] All routes protected by `requirePlatformAdmin`
- [ ] Drag-and-drop reorders blocks via `@dnd-kit`
- [ ] Each block type has an inline editor with appropriate fields
- [ ] Auto-save debounced at 500ms
- [ ] Iframe preview refreshes after saves
- [ ] Preview scaled to 70%
- [ ] Publish sets `is_draft = false` and stamps `published_at`
- [ ] Discard removes draft blocks only
- [ ] Image upload works for hero backgrounds and image blocks
- [ ] Block CRUD tests pass
- [ ] Publish flow tests pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
