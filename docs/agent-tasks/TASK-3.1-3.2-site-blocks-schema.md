# Task 3.1–3.2 — Site Blocks Schema + Image Upload

> **Context files to read first:** `SHARED-CONTEXT.md`, then read:
> - `packages/db/src/schema/communities.ts` (adding columns)
> - `apps/admin/src/app/api/admin/upload/route.ts` (if created in 2.3, reuse pattern)
> - `apps/web/src/components/pm/BrandingForm.tsx` (magic-byte validation reference)
> **Branch:** `feat/site-blocks`
> **Migration number:** 0033
> **Estimated time:** 1-2 hours
> **Wave 5** — can start after Phase 1 merges. Parallel with 2.7-2.11.

## Objective

Create the `site_blocks` table for public site block storage, add site-related columns to `communities`, define block content type schemas, and create the admin image upload endpoint.

## Deliverables

### 1. Migration

**Create:** `packages/db/migrations/0033_create_site_blocks.sql`

```sql
-- Site blocks for public site builder
CREATE TABLE site_blocks (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities ON DELETE CASCADE,
  block_order int NOT NULL,
  block_type text NOT NULL CHECK (block_type IN (
    'hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image'
  )),
  content jsonb NOT NULL DEFAULT '{}',
  is_draft boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, block_order, is_draft)
);

CREATE INDEX idx_site_blocks_community_order ON site_blocks(community_id, block_order);
CREATE INDEX idx_site_blocks_community_draft ON site_blocks(community_id, is_draft);

ALTER TABLE site_blocks ENABLE ROW LEVEL SECURITY;

-- service_role has full access
CREATE POLICY site_blocks_service_role ON site_blocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated users can read published blocks for their community
CREATE POLICY site_blocks_read_published ON site_blocks
  FOR SELECT TO authenticated
  USING (is_draft = false AND community_id = current_setting('app.community_id')::bigint);

-- anon can read published blocks (for public site rendering)
CREATE POLICY site_blocks_anon_read ON site_blocks
  FOR SELECT TO anon
  USING (is_draft = false);

-- Add site columns to communities
ALTER TABLE communities ADD COLUMN custom_domain text;
ALTER TABLE communities ADD COLUMN site_published_at timestamptz;

COMMENT ON TABLE site_blocks IS 'Blocks for community public site pages. Draft/published workflow.';
```

### 2. Drizzle schema

**Create:** `packages/db/src/schema/site-blocks.ts`

Define all columns matching the migration. Use `pgTable` with the correct column types:
- `id`: `bigserial('id').primaryKey()`
- `communityId`: `bigint('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' })`
- `blockOrder`: `integer('block_order').notNull()`
- `blockType`: `text('block_type').notNull()` (with check constraint comment)
- `content`: `jsonb('content').notNull().default('{}')`
- `isDraft`: `boolean('is_draft').notNull().default(true)`
- `publishedAt`: `timestamp('published_at', { withTimezone: true })`
- `createdAt`: `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
- `updatedAt`: `timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()`

Export from `packages/db/src/schema/index.ts`:
```typescript
export { siteBlocks } from './site-blocks';
```

### 3. Add columns to communities schema

**Modify:** `packages/db/src/schema/communities.ts`

Add two columns to the existing `communities` table definition:
```typescript
customDomain: text('custom_domain'),
sitePublishedAt: timestamp('site_published_at', { withTimezone: true }),
```

### 4. Block content type definitions

**Create:** `packages/shared/src/site-blocks.ts`

```typescript
/**
 * Block content type definitions for the public site builder.
 * Each block type has a specific content schema stored as JSONB.
 */

export const BLOCK_TYPES = [
  'hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export interface HeroBlockContent {
  headline: string;                    // max 120 chars
  subheadline: string;                 // max 300 chars
  ctaLabel: string;                    // max 40 chars
  ctaHref: string;
  backgroundImageUrl?: string;
}

export interface AnnouncementsBlockContent {
  title: string;                       // default "Announcements"
  limit: number;                       // 1-10, default 5
}

export interface DocumentsBlockContent {
  title: string;                       // default "Documents"
  categoryIds: number[];               // empty = all
}

export interface MeetingsBlockContent {
  title: string;                       // default "Upcoming Meetings"
}

export interface ContactBlockContent {
  boardEmail: string;
  managementCompany?: string;
  phone?: string;
  address?: string;
}

export interface TextBlockContent {
  body: string;                        // plain text or markdown, max 5000 chars
}

export interface ImageBlockContent {
  url: string;
  alt: string;                         // max 200 chars
  caption?: string;                    // max 300 chars
}

export type BlockContent =
  | HeroBlockContent
  | AnnouncementsBlockContent
  | DocumentsBlockContent
  | MeetingsBlockContent
  | ContactBlockContent
  | TextBlockContent
  | ImageBlockContent;

/**
 * Maps block type to its content interface for type-safe usage.
 */
export interface BlockContentMap {
  hero: HeroBlockContent;
  announcements: AnnouncementsBlockContent;
  documents: DocumentsBlockContent;
  meetings: MeetingsBlockContent;
  contact: ContactBlockContent;
  text: TextBlockContent;
  image: ImageBlockContent;
}

/**
 * Validate block content against its type's constraints.
 * Returns an error message or null if valid.
 */
export function validateBlockContent(type: BlockType, content: unknown): string | null {
  if (!content || typeof content !== 'object') return 'Content must be an object';

  switch (type) {
    case 'hero': {
      const c = content as HeroBlockContent;
      if (!c.headline || c.headline.length > 120) return 'Headline required, max 120 chars';
      if (!c.subheadline || c.subheadline.length > 300) return 'Subheadline required, max 300 chars';
      if (!c.ctaLabel || c.ctaLabel.length > 40) return 'CTA label required, max 40 chars';
      if (!c.ctaHref) return 'CTA href required';
      return null;
    }
    case 'announcements': {
      const c = content as AnnouncementsBlockContent;
      if (typeof c.limit === 'number' && (c.limit < 1 || c.limit > 10)) return 'Limit must be 1-10';
      return null;
    }
    case 'documents':
      return null; // categoryIds validated separately
    case 'meetings':
      return null;
    case 'contact': {
      const c = content as ContactBlockContent;
      if (!c.boardEmail) return 'Board email required';
      return null;
    }
    case 'text': {
      const c = content as TextBlockContent;
      if (!c.body) return 'Body text required';
      if (c.body.length > 5000) return 'Body text max 5000 chars';
      return null;
    }
    case 'image': {
      const c = content as ImageBlockContent;
      if (!c.url) return 'Image URL required';
      if (!c.alt || c.alt.length > 200) return 'Alt text required, max 200 chars';
      if (c.caption && c.caption.length > 300) return 'Caption max 300 chars';
      return null;
    }
    default:
      return `Unknown block type: ${type}`;
  }
}
```

Export from `packages/shared/src/index.ts`:
```typescript
export type {
  BlockType, BlockContent, BlockContentMap,
  HeroBlockContent, AnnouncementsBlockContent, DocumentsBlockContent,
  MeetingsBlockContent, ContactBlockContent, TextBlockContent, ImageBlockContent,
} from './site-blocks';
export { BLOCK_TYPES, validateBlockContent } from './site-blocks';
```

### 5. Image upload endpoint

**Create or modify:** `apps/admin/src/app/api/admin/upload/route.ts`

If this was already created in Task 2.3 for logo uploads, extend it. If not, create it now.

**`POST /api/admin/upload`** — protected by `requirePlatformAdmin(request)`.

For site block images specifically:
- Max file size: 5 MB
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`
- Magic-byte validation (same pattern as `apps/web/src/components/pm/BrandingForm.tsx`)
- Storage path: `community-assets/{communityId}/site/{randomUUID}.{ext}`
- Return: `{ data: { url: publicUrl, path: storagePath } }`

### 6. Unit tests

**Create:** `packages/shared/__tests__/site-blocks.test.ts`

Test `validateBlockContent` for each block type:
1. Valid hero block → null
2. Hero with headline > 120 chars → error
3. Hero missing ctaHref → error
4. Valid contact block → null
5. Contact missing boardEmail → error
6. Text with body > 5000 chars → error
7. Image missing alt text → error
8. Announcements with limit=0 → error
9. Announcements with limit=5 → null
10. Unknown block type → error

## Do NOT

- Do not create the public site renderer — that's Task 3.3
- Do not create the site builder UI — that's Task 3.4
- Do not create block CRUD API routes — those are in Task 3.4
- Do not implement custom domain routing — `custom_domain` column exists for future use only

## Acceptance Criteria

- [ ] Migration creates `site_blocks` table with RLS policies
- [ ] Migration adds `custom_domain` and `site_published_at` to communities
- [ ] Drizzle schema matches migration
- [ ] Schema exported from index
- [ ] Block content types defined with TypeScript interfaces
- [ ] `validateBlockContent` covers all 7 block types
- [ ] Image upload endpoint works with magic-byte validation
- [ ] All unit tests pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
