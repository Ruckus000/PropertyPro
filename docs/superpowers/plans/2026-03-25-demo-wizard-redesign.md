# Demo Wizard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the demo creation wizard so template choices visually affect the demo, template selection shows real thumbnails, and adding templates is a predictable developer workflow.

**Architecture:** Configure → Preview → Adjust wizard. Template registry in `packages/shared/src/demo-templates/` with one file per template. Thumbnail rendering system for visual template cards. Content strategy registry for seed data emphasis. Compilation pipeline extracted from inline route handler. Single-page wizard with step state (not separate routes).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Vitest, sucrase, react-dom/server, isomorphic-dompurify

**Spec:** `docs/superpowers/specs/2026-03-25-demo-wizard-redesign.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `packages/shared/src/demo-templates/types.ts` | Types: `DemoTemplateDefinition`, `ThumbnailDescriptor`, `DemoTemplateRenderContext`, `DemoTemplateId` |
| `packages/shared/src/demo-templates/index.ts` | Barrel + registry helpers: `getDemoTemplates()`, `getDefaultTemplate()`, `getTemplateById()`, `isDemoTemplateId()` |
| `packages/shared/src/demo-templates/condo-public-civic-glass.ts` | Template definition |
| `packages/shared/src/demo-templates/condo-public-coastal-welcome.ts` | Template definition |
| `packages/shared/src/demo-templates/condo-mobile-resident-bulletin.ts` | Template definition |
| `packages/shared/src/demo-templates/condo-mobile-concierge-snapshot.ts` | Template definition |
| `packages/shared/src/demo-templates/hoa-public-neighborhood-hub.ts` | Template definition |
| `packages/shared/src/demo-templates/hoa-public-board-transparency.ts` | Template definition |
| `packages/shared/src/demo-templates/hoa-mobile-community-pulse.ts` | Template definition |
| `packages/shared/src/demo-templates/hoa-mobile-board-brief.ts` | Template definition |
| `packages/shared/src/demo-templates/apartment-public-resident-services.ts` | Template definition |
| `packages/shared/src/demo-templates/apartment-public-maintenance-first.ts` | Template definition |
| `packages/shared/src/demo-templates/apartment-mobile-tenant-essentials.ts` | Template definition |
| `packages/shared/src/demo-templates/apartment-mobile-service-snapshot.ts` | Template definition |
| `packages/shared/src/demo-content-strategies.ts` | Content strategy registry + helpers |
| `packages/shared/src/__tests__/demo-templates.test.ts` | Template registry unit tests |
| `packages/shared/src/__tests__/demo-content-strategies.test.ts` | Content strategy unit tests |
| `apps/admin/src/lib/site-template/compile-template.ts` | Extracted compilation pipeline: `compileJsxToHtml()`, `compileDemoTemplate()` |
| `apps/admin/__tests__/compile-template.test.ts` | Compilation pipeline tests |
| `apps/admin/src/components/demo/TemplateThumbnail.tsx` | Thumbnail wireframe renderer |
| `apps/admin/src/components/demo/TemplateCard.tsx` | Template selection card |
| `apps/admin/src/components/demo/BrandingFormFields.tsx` | Controlled branding form (no API calls) |
| `apps/admin/src/app/api/admin/demos/preview/route.ts` | Preview compilation endpoint |

### Modified Files
| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Add barrel exports for `demo-templates` and `demo-content-strategies` |
| `packages/db/src/seed/seed-community.ts` | Add optional `seedHints` to `SeedCommunityConfig` |
| `apps/admin/src/components/demo/BrandingEditSection.tsx` | Refactor to use `BrandingFormFields` internally |
| `apps/admin/src/app/api/admin/demos/route.ts` | Extend schema + handler for new fields |
| `apps/admin/src/app/api/admin/communities/[id]/site-template/publish/route.ts` | Refactor to use extracted `compileJsxToHtml()` |
| `apps/admin/src/app/demo/new/page.tsx` | Complete rewrite: Configure → Preview wizard |

---

## Task 1: Template Registry Types & Helpers

**Files:**
- Create: `packages/shared/src/demo-templates/types.ts`
- Create: `packages/shared/src/demo-templates/index.ts`
- Create: `packages/shared/src/__tests__/demo-templates.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing tests for template registry**

Create `packages/shared/src/__tests__/demo-templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getDemoTemplates,
  getDefaultTemplate,
  getTemplateById,
  isDemoTemplateId,
  DEMO_TEMPLATE_IDS,
} from '../demo-templates';

describe('demo-templates registry', () => {
  it('exports a non-empty DEMO_TEMPLATE_IDS array', () => {
    expect(DEMO_TEMPLATE_IDS.length).toBeGreaterThan(0);
  });

  it('isDemoTemplateId returns true for valid IDs', () => {
    expect(isDemoTemplateId('condo-public-civic-glass')).toBe(true);
  });

  it('isDemoTemplateId returns false for invalid IDs', () => {
    expect(isDemoTemplateId('nonexistent')).toBe(false);
  });

  describe('getDemoTemplates', () => {
    it('returns only templates matching communityType and variant', () => {
      const templates = getDemoTemplates('condo_718', 'public');
      expect(templates.length).toBeGreaterThan(0);
      templates.forEach((t) => {
        expect(t.communityType).toBe('condo_718');
        expect(t.variant).toBe('public');
      });
    });

    it('returns empty array for invalid communityType', () => {
      const templates = getDemoTemplates('invalid' as any, 'public');
      expect(templates).toEqual([]);
    });
  });

  describe('getDefaultTemplate', () => {
    it('returns first template for given type and variant', () => {
      const def = getDefaultTemplate('condo_718', 'public');
      expect(def).toBeDefined();
      expect(def.communityType).toBe('condo_718');
      expect(def.variant).toBe('public');
    });
  });

  describe('getTemplateById', () => {
    it('returns template for valid ID', () => {
      const t = getTemplateById('condo-public-civic-glass');
      expect(t).toBeDefined();
      expect(t!.id).toBe('condo-public-civic-glass');
    });

    it('returns undefined for invalid ID', () => {
      expect(getTemplateById('nope')).toBeUndefined();
    });
  });

  describe('every template', () => {
    it('has a build function that returns a non-empty string', () => {
      for (const id of DEMO_TEMPLATE_IDS) {
        const t = getTemplateById(id);
        expect(t, `Template ${id} not found`).toBeDefined();
        const source = t!.build({ communityName: 'Test Community' });
        expect(source.length, `Template ${id} build() returned empty`).toBeGreaterThan(0);
        expect(source).toContain('function App');
      }
    });

    it('has valid thumbnail descriptor', () => {
      for (const id of DEMO_TEMPLATE_IDS) {
        const t = getTemplateById(id)!;
        expect(t.thumbnail.gradient).toHaveLength(2);
        expect(typeof t.thumbnail.layout).toBe('string');
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run packages/shared/src/__tests__/demo-templates.test.ts`
Expected: FAIL — module `../demo-templates` not found

- [ ] **Step 3: Create types.ts**

Create `packages/shared/src/demo-templates/types.ts` with all types from the spec: `DEMO_TEMPLATE_IDS`, `DemoTemplateId`, `TemplateVariant`, `ThumbnailLayout`, `ThumbnailDescriptor`, `DemoTemplateRenderContext`, `DemoTemplateDefinition`. Import `CommunityType` from `..` (parent index).

- [ ] **Step 4: Create one template file as the pattern**

Create `packages/shared/src/demo-templates/condo-public-civic-glass.ts`:
- Import types from `./types`
- Export a `DemoTemplateDefinition` object with id, communityType, variant, name, tags, bestFor, thumbnail descriptor, and build function
- Build function takes `DemoTemplateRenderContext`, returns JSX source string for a formal board-forward public site template
- Reference the Codex branch's `demo-template-builders.ts` for the JSX content pattern (the `buildPublicTemplateSource()` content for civic-glass)

- [ ] **Step 5: Create index.ts barrel with registry helpers**

Create `packages/shared/src/demo-templates/index.ts`:
- Import and collect all template definitions into `ALL_TEMPLATES` array (start with just civic-glass)
- Export `DEMO_TEMPLATE_IDS` from types
- Export all types from types
- Implement `getDemoTemplates()`, `getDefaultTemplate()`, `getTemplateById()`, `isDemoTemplateId()`

- [ ] **Step 6: Add barrel export to packages/shared/src/index.ts**

Add `export * from './demo-templates';` to `packages/shared/src/index.ts` (after existing barrel exports at the bottom of the file).

- [ ] **Step 7: Run tests — should pass for the one template**

Run: `pnpm exec vitest run packages/shared/src/__tests__/demo-templates.test.ts`
Expected: Most tests PASS. The `getDemoTemplates('condo_718', 'public')` test passes with 1 result.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/demo-templates/ packages/shared/src/__tests__/demo-templates.test.ts packages/shared/src/index.ts
git commit -m "feat(demo): template registry types, helpers, and first template (civic-glass)"
```

---

## Task 2: Remaining 11 Template Definitions

**Files:**
- Create: 11 template files in `packages/shared/src/demo-templates/`
- Modify: `packages/shared/src/demo-templates/index.ts` (add imports)

- [ ] **Step 1: Create all condo templates**

Create remaining condo templates following the civic-glass pattern:
- `condo-public-coastal-welcome.ts` — warm, resident-friendly, hero-centered layout
- `condo-mobile-resident-bulletin.ts` — feed-list layout, announcement-first
- `condo-mobile-concierge-snapshot.ts` — card-grid layout, quick-access dashboard

Each file: import types, export `DemoTemplateDefinition` with appropriate id, tags, thumbnail, and build function. Build functions return JSX source with `function App()` that renders the template's unique layout. Use `ctx.communityName` and `ctx.branding?.primaryColor` etc in the output.

- [ ] **Step 2: Create all HOA templates**

- `hoa-public-neighborhood-hub.ts` — sidebar-content layout, community-centered
- `hoa-public-board-transparency.ts` — split-feature layout, document-forward
- `hoa-mobile-community-pulse.ts` — feed-list layout, event/announcement focused
- `hoa-mobile-board-brief.ts` — card-grid layout, board meeting summaries

- [ ] **Step 3: Create all apartment templates**

- `apartment-public-resident-services.ts` — hero-centered layout, service-first
- `apartment-public-maintenance-first.ts` — stats-hero layout, maintenance dashboard
- `apartment-mobile-tenant-essentials.ts` — feed-list layout, lease/maintenance focused
- `apartment-mobile-service-snapshot.ts` — card-grid layout, quick service requests

- [ ] **Step 4: Register all templates in index.ts**

Add imports for all 11 new templates to `packages/shared/src/demo-templates/index.ts` and add them to the `ALL_TEMPLATES` array.

- [ ] **Step 5: Run full test suite**

Run: `pnpm exec vitest run packages/shared/src/__tests__/demo-templates.test.ts`
Expected: ALL PASS — 12 templates, all with valid builds and thumbnails

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/demo-templates/
git commit -m "feat(demo): complete template registry — 12 templates across 3 community types"
```

---

## Task 3: Content Strategy Registry

**Files:**
- Create: `packages/shared/src/demo-content-strategies.ts`
- Create: `packages/shared/src/__tests__/demo-content-strategies.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/__tests__/demo-content-strategies.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getContentStrategies,
  getDefaultStrategy,
  getStrategyById,
  CONTENT_STRATEGIES,
} from '../demo-content-strategies';

describe('demo-content-strategies', () => {
  it('has 4 strategies', () => {
    expect(CONTENT_STRATEGIES).toHaveLength(4);
  });

  it('getContentStrategies filters by community type', () => {
    const strategies = getContentStrategies('condo_718');
    expect(strategies.length).toBeGreaterThan(0);
    strategies.forEach((s) => {
      expect(s.appliesTo).toContain('condo_718');
    });
  });

  it('getDefaultStrategy returns correct default per type', () => {
    expect(getDefaultStrategy('condo_718').id).toBe('compliance-heavy');
    expect(getDefaultStrategy('apartment').id).toBe('maintenance-focused');
    expect(getDefaultStrategy('hoa_720').id).toBe('transparency-forward');
  });

  it('getStrategyById returns strategy for valid ID', () => {
    expect(getStrategyById('compliance-heavy')).toBeDefined();
  });

  it('getStrategyById returns undefined for invalid ID', () => {
    expect(getStrategyById('nope')).toBeUndefined();
  });

  it('every strategy has valid seedHints', () => {
    for (const s of CONTENT_STRATEGIES) {
      expect(s.seedHints.complianceScore).toBeGreaterThanOrEqual(0);
      expect(s.seedHints.complianceScore).toBeLessThanOrEqual(100);
      expect(['compliance', 'maintenance', 'financial', 'general']).toContain(s.seedHints.documentBias);
      expect(['low', 'medium', 'high']).toContain(s.seedHints.meetingDensity);
      expect(['formal', 'friendly', 'urgent']).toContain(s.seedHints.announcementTone);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run packages/shared/src/__tests__/demo-content-strategies.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement content strategy registry**

Create `packages/shared/src/demo-content-strategies.ts` with:
- Types: `ContentStrategyId`, `SeedHints`, `ContentStrategy`
- `CONTENT_STRATEGIES` array with 4 strategies per spec
- Helper functions: `getContentStrategies()`, `getDefaultStrategy()`, `getStrategyById()`

- [ ] **Step 4: Add barrel export**

Add `export * from './demo-content-strategies';` to `packages/shared/src/index.ts`.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run packages/shared/src/__tests__/demo-content-strategies.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/demo-content-strategies.ts packages/shared/src/__tests__/demo-content-strategies.test.ts packages/shared/src/index.ts
git commit -m "feat(demo): content strategy registry with 4 strategies and seed hints"
```

---

## Task 4: Extract Compilation Pipeline

**Files:**
- Create: `apps/admin/src/lib/site-template/compile-template.ts`
- Create: `apps/admin/__tests__/compile-template.test.ts`
- Modify: `apps/admin/src/app/api/admin/communities/[id]/site-template/publish/route.ts`

- [ ] **Step 1: Write failing tests for compilation**

Create `apps/admin/__tests__/compile-template.test.ts` (must be under `__tests__/` root to match vitest config `include: ['__tests__/**/*.test.ts']`):

```ts
import { describe, it, expect } from 'vitest';
import { compileJsxToHtml, compileDemoTemplate } from '../compile-template';

describe('compileJsxToHtml', () => {
  it('compiles simple JSX to HTML', async () => {
    const jsx = `function App() { return React.createElement('div', null, 'Hello'); }`;
    const html = await compileJsxToHtml(jsx);
    expect(html).toContain('Hello');
    expect(html).toContain('<div');
  });

  it('strips script tags from output', async () => {
    const jsx = `function App() { return React.createElement('div', {dangerouslySetInnerHTML: {__html: '<script>alert(1)</script>Hello'}}); }`;
    const html = await compileJsxToHtml(jsx);
    expect(html).not.toContain('<script');
    expect(html).toContain('Hello');
  });

  it('allows style tags', async () => {
    const jsx = `function App() { return React.createElement('div', {dangerouslySetInnerHTML: {__html: '<style>.foo{color:red}</style><p>styled</p>'}}); }`;
    const html = await compileJsxToHtml(jsx);
    expect(html).toContain('<style');
  });

  it('throws on invalid JSX', async () => {
    await expect(compileJsxToHtml('not valid {')).rejects.toThrow();
  });
});

describe('compileDemoTemplate', () => {
  it('compiles a registered template by ID', async () => {
    const html = await compileDemoTemplate({
      templateId: 'condo-public-civic-glass',
      communityName: 'Test Towers',
    });
    expect(html).toContain('Test Towers');
    expect(html.length).toBeGreaterThan(100);
  });

  it('throws for unknown template ID', async () => {
    await expect(
      compileDemoTemplate({ templateId: 'fake', communityName: 'X' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/admin && pnpm exec vitest run __tests__/compile-template.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement compile-template.ts**

Create `apps/admin/src/lib/site-template/compile-template.ts`:
- Extract the sucrase → Function → ReactDOMServer → isomorphic-dompurify pipeline from the publish route (lines ~78-133). The existing route uses `isomorphic-dompurify` (dynamically imported), NOT `sanitize-html`.
- Export `compileJsxToHtml(jsxSource: string): Promise<string>`
- Export `compileDemoTemplate(params: { templateId: string; communityName: string; branding?: DemoTemplateRenderContext['branding'] }): Promise<string>` — looks up template via `getTemplateById()`, calls `build()`, pipes through `compileJsxToHtml()`

- [ ] **Step 4: Run tests**

Run: `cd apps/admin && pnpm exec vitest run __tests__/compile-template.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Refactor publish route to use extracted function**

Modify `apps/admin/src/app/api/admin/communities/[id]/site-template/publish/route.ts`:
- Replace inline sucrase/React/DOMPurify logic (lines ~78-133) with `import { compileJsxToHtml } from '@/lib/site-template/compile-template'`
- Keep everything else (fetching draft, upserting published row) unchanged

- [ ] **Step 6: Run existing tests to verify no regression**

Run: `pnpm test`
Expected: No new failures

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/site-template/compile-template.ts apps/admin/__tests__/compile-template.test.ts apps/admin/src/app/api/admin/communities/*/site-template/publish/route.ts
git commit -m "refactor(demo): extract compilation pipeline into reusable compileJsxToHtml()"
```

---

## Task 5: BrandingFormFields Component

**Files:**
- Create: `apps/admin/src/components/demo/BrandingFormFields.tsx`
- Modify: `apps/admin/src/components/demo/BrandingEditSection.tsx`

- [ ] **Step 1: Create BrandingFormFields as a controlled component**

Create `apps/admin/src/components/demo/BrandingFormFields.tsx`:
- Props: `{ value: BrandingValues; onChange: (values: BrandingValues) => void }`
- `BrandingValues`: `{ primaryColor, secondaryColor, accentColor, fontHeading, fontBody, logoPath? }`
- Renders: color pickers (3), font selectors (2), logo upload, theme preset buttons
- Extract the form rendering logic from `BrandingEditSection` (lines ~100-260 approximately) — the color inputs, font selects, preset buttons, logo upload
- No API calls — purely controlled. Parent owns the state.
- Use existing `ALLOWED_FONTS`, `THEME_PRESETS`, color validation, magic-byte logo validation from the current `BrandingEditSection`

- [ ] **Step 2: Refactor BrandingEditSection to use BrandingFormFields**

Modify `apps/admin/src/components/demo/BrandingEditSection.tsx`:
- Keep its existing props interface (`demoId`, `communityId`, `onSaved`)
- Keep its fetch/save logic (load branding on mount, PATCH on save)
- Replace the inline form rendering with `<BrandingFormFields value={form} onChange={setForm} />`
- This should be a pure refactor — same visual output, same behavior

- [ ] **Step 3: Verify no regression**

Run: `pnpm build` (typecheck + build)
Expected: PASS — no type errors, existing demo edit drawer still works

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/demo/BrandingFormFields.tsx apps/admin/src/components/demo/BrandingEditSection.tsx
git commit -m "refactor(demo): extract BrandingFormFields controlled component from BrandingEditSection"
```

---

## Task 6: Thumbnail & Card Components

**Files:**
- Create: `apps/admin/src/components/demo/TemplateThumbnail.tsx`
- Create: `apps/admin/src/components/demo/TemplateCard.tsx`

- [ ] **Step 1: Create TemplateThumbnail component**

Create `apps/admin/src/components/demo/TemplateThumbnail.tsx`:
- Props: `{ descriptor: ThumbnailDescriptor; className?: string }`
- Import `ThumbnailDescriptor`, `ThumbnailLayout` from `@propertypro/shared`
- Render a div that fills its container (`w-full h-full`) with `background: linear-gradient(135deg, gradient[0], gradient[1])`
- Switch on `descriptor.layout` to render wireframe divs:
  - `stats-hero`: nav bar (thin top strip) + centered hero block + 3 small stat boxes
  - `hero-centered`: nav bar + tall hero + small CTA rectangle
  - `feed-list`: header strip + 3 stacked rounded rects
  - `card-grid`: header strip + 2x2 grid of small squares
  - `sidebar-content`: left narrow strip + right content area
  - `split-feature`: 3 alternating left/right rows
- All wireframe elements use `bg-white/10`, `bg-white/20`, `bg-white/30` for abstract shapes
- Use `rounded-sm` from design tokens on shapes

- [ ] **Step 2: Create TemplateCard component**

Create `apps/admin/src/components/demo/TemplateCard.tsx`:
- Props: `{ template: DemoTemplateDefinition; selected: boolean; onSelect: () => void }`
- Render as `<button>` (accessibility — focusable, keyboard activatable)
- Container: `border border-[var(--border-default)] rounded-[var(--radius-md)]` + when selected: `border-2 border-[var(--interactive-primary)] bg-[var(--interactive-subtle)]`
- Thumbnail area: 88px height, overflow hidden, contains `<TemplateThumbnail>`
- When selected: absolute-positioned checkmark badge (20px circle, primary bg, white check) top-right of thumbnail
- Info area: `p-3`, template name `text-sm font-semibold`, tags `text-xs text-[var(--text-secondary)]`
- Focus: inherits `:focus-visible` ring from design system

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: PASS — components type-check

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/demo/TemplateThumbnail.tsx apps/admin/src/components/demo/TemplateCard.tsx
git commit -m "feat(demo): TemplateThumbnail wireframe renderer and TemplateCard selection component"
```

---

## Task 7: Preview API Endpoint

**Files:**
- Create: `apps/admin/src/app/api/admin/demos/preview/route.ts`

- [ ] **Step 1: Create the preview endpoint**

Create `apps/admin/src/app/api/admin/demos/preview/route.ts`:
- Import `requirePlatformAdmin` from existing admin auth utilities
- Import `compileDemoTemplate` from `@/lib/site-template/compile-template`
- Import `isDemoTemplateId` from `@propertypro/shared`
- Zod schema per spec (communityType, publicTemplateId, mobileTemplateId, prospectName, branding optional)
- Validate template IDs with `isDemoTemplateId` refine
- Call `compileDemoTemplate()` twice (public + mobile)
- Return `{ publicHtml, mobileHtml }`
- Wrap in `withErrorHandler` per existing route pattern
- No DB writes

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/admin/demos/preview/route.ts
git commit -m "feat(demo): POST /api/admin/demos/preview — compile templates without DB writes"
```

---

## Task 8: Seed Hints Integration

**Files:**
- Modify: `packages/db/src/seed/seed-community.ts`

- [ ] **Step 1: Add optional seedHints to SeedCommunityConfig**

Modify `packages/db/src/seed/seed-community.ts`:
- Import `SeedHints` type from `@propertypro/shared`
- Add `seedHints?: SeedHints` to `SeedCommunityConfig` interface (after `isDemo?` field, around line 41)
- In the `seedCommunity()` function body, read `config.seedHints` where sample data is created
- Branch on `seedHints.documentBias` to weight document categories
- Branch on `seedHints.meetingDensity` to control meeting count
- Branch on `seedHints.announcementTone` to vary announcement copy
- Use `seedHints.complianceScore` to adjust document posting dates (closer to 30-day window = lower score)
- All branching is additive — when `seedHints` is undefined, existing behavior is unchanged

- [ ] **Step 2: Run existing seed tests**

Run: `pnpm test`
Expected: No regressions — existing callers don't pass seedHints

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/seed/seed-community.ts
git commit -m "feat(demo): add optional seedHints to SeedCommunityConfig for content strategy"
```

---

## Task 9: Extend Demo Creation API

**Files:**
- Modify: `apps/admin/src/app/api/admin/demos/route.ts`

- [ ] **Step 1: Extend the Zod schema**

Modify `apps/admin/src/app/api/admin/demos/route.ts`:
- Import `isDemoTemplateId`, `getStrategyById` from `@propertypro/shared`
- Import `compileDemoTemplate` from `@/lib/site-template/compile-template`
- Add to `createDemoSchema`: `publicTemplateId`, `mobileTemplateId`, `contentStrategy` — all with `.refine()` validation per spec
- In POST handler: validate template IDs match the selected community type
- Pass `seedHints` from `getStrategyById(body.contentStrategy).seedHints` to `seedCommunity()`
- After community is seeded, call `compileDemoTemplate()` for both public and mobile templates
- Write compiled HTML to `site_blocks` using the existing upsert pattern from the publish route: insert a row with `community_id`, `block_type: 'jsx_template'`, `template_variant: 'public'|'mobile'`, `is_draft: false`, and `content: { jsxSource, compiledHtml }`. Use `createScopedClient(communityId)` for the insert per tenant isolation rules. Reference the existing publish route's upsert at `apps/admin/src/app/api/admin/communities/[id]/site-template/publish/route.ts` lines ~135-178 for the exact column names and conflict handling.
- Store `contentStrategy` in the theme JSONB: `{ ...body.branding, contentStrategy: body.contentStrategy }`

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/admin/demos/route.ts
git commit -m "feat(demo): extend POST /api/admin/demos with template IDs and content strategy"
```

---

## Task 10: Wizard Page — Configure Screen

**Files:**
- Modify: `apps/admin/src/app/demo/new/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the wizard page**

Replace `apps/admin/src/app/demo/new/page.tsx` with the Configure → Preview single-page wizard:
- `'use client'` directive
- State: `step: 'configure' | 'preview' | 'creating' | 'done'`
- State: `config: { prospectName, communityType, publicTemplateId, mobileTemplateId, contentStrategy, branding, crmUrl, notes }`
- Initialize defaults: `getDefaultTemplate()` for templates, `getDefaultStrategy()` for strategy, `DEFAULT_BRANDING` for branding
- When `communityType` changes: reset templates to defaults for new type, reset strategy to default
- Configure screen sections (per spec Section 5):
  1. Progress bar (Configure active, Preview upcoming)
  2. Prospect: name input + type toggle buttons (text labels only — NO emoji icons per project design feedback: "No emojis, tacky")
  3. Public Site Template: grid of `<TemplateCard>` from `getDemoTemplates(type, 'public')`
  4. Mobile Template: grid of `<TemplateCard>` from `getDemoTemplates(type, 'mobile')`
  5. Content Focus: pill buttons from `getContentStrategies(type)`
  6. Branding: collapsible section with `<BrandingFormFields>`
  7. Optional: collapsible CRM link + notes
  8. CTA: "Preview Demo →" button → sets step to `'preview'`

- [ ] **Step 2: Verify build and visual check**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/demo/new/page.tsx
git commit -m "feat(demo): wizard configure screen with template cards, content strategy, branding"
```

---

## Task 11: Wizard Page — Preview Screen

**Files:**
- Modify: `apps/admin/src/app/demo/new/page.tsx` (add preview step)

- [ ] **Step 1: Add preview step rendering**

In the same page component, when `step === 'preview'`:
- On entry: call `POST /api/admin/demos/preview` with current config
- Show loading state: Skeleton placeholders for both preview areas
- Show error state: AlertBanner danger with retry
- On success, render:
  1. Progress bar (Configure done/clickable, Preview active)
  2. Header: "Here's what [name] will see"
  3. Summary card: type, public template name, mobile template name, content focus label
  4. Public Website Preview: iframe with `srcDoc={publicHtml}` (avoids blob URL complexity), `sandbox="allow-scripts allow-same-origin"`, browser-window chrome styling. "Open full size ↗" opens `URL.createObjectURL(new Blob([publicHtml], {type:'text/html'}))` in new tab.
  5. Mobile Preview: `<PhoneFrame>` accepts `src: string` (NOT `srcDoc`). Build a blob URL: `const mobileBlobUrl = URL.createObjectURL(new Blob([mobileHtml], { type: 'text/html' }))` and pass as `<PhoneFrame src={mobileBlobUrl} />`. Clean up blob URL on unmount via `URL.revokeObjectURL()`. "Open full size ↗" opens the same blob URL in a new tab.
  6. Actions: "← Back to Edit" (sets step to `'configure'`) + "Generate Demo" (green button)

- [ ] **Step 2: Add generate handler**

"Generate Demo" button calls `POST /api/admin/demos` with full config. Sets `step = 'creating'`, then on success `step = 'done'` and redirects to the demo preview page.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/demo/new/page.tsx
git commit -m "feat(demo): wizard preview screen with compiled template iframes and generate flow"
```

---

## Task 12: Integration Smoke Test & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS (fix any lint issues)

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(demo): lint fixes and cleanup for demo wizard redesign"
```
