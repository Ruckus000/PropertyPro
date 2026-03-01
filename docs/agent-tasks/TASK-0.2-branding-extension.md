# Task 0.2 — Extend and Lock `communities.branding` Shape

> **Context files to read first:** `SHARED-CONTEXT.md`, then read these files completely:
> - `packages/shared/src/branding.ts`
> - `apps/web/src/lib/api/branding.ts`
> - `apps/web/src/components/pm/BrandingForm.tsx`
> - `apps/web/src/components/pm/BrandingPreview.tsx`
> - `apps/web/src/app/api/v1/pm/branding/route.ts`
> **Branch:** `feat/branding-extension`
> **Migration number:** 0031 (pre-assigned; 0029 and 0030 used by Wave 1 tasks)
> **Estimated time:** 3-4 hours
> **Wave 2** — requires Wave 1 merged (specifically 0.4 for `ALLOWED_FONTS`).

## Objective

Extend the `CommunityBranding` interface with `accentColor`, `fontHeading`, and `fontBody`. Update every file that reads/writes/validates this shape.

## Deliverables

### 1. Migration

**Create:** `packages/db/migrations/0031_extend_branding_shape.sql`

```sql
-- Backfill existing branding rows with new fields using platform defaults
UPDATE communities
SET branding = branding
  || jsonb_build_object(
    'accentColor', '#DBEAFE',
    'fontHeading', 'Inter',
    'fontBody', 'Inter'
  )
WHERE branding IS NOT NULL
  AND branding != 'null'::jsonb;

COMMENT ON COLUMN communities.branding IS 'White-label branding. Shape: {primaryColor?, secondaryColor?, accentColor?, fontHeading?, fontBody?, logoPath?}';
```

### 2. Update `packages/shared/src/branding.ts`

```typescript
export interface CommunityBranding {
  /** Hex color string, e.g. "#2563EB". Applied as --theme-primary CSS custom property. */
  primaryColor?: string;
  /** Hex color string, e.g. "#6B7280". Applied as --theme-secondary CSS custom property. */
  secondaryColor?: string;
  /** Hex color string, e.g. "#DBEAFE". Applied as --theme-accent CSS custom property. */
  accentColor?: string;
  /** Google Fonts family name. Must be in ALLOWED_FONTS list. Default: "Inter". */
  fontHeading?: string;
  /** Google Fonts family name. Must be in ALLOWED_FONTS list. Default: "Inter". */
  fontBody?: string;
  /** Supabase Storage path to the processed 400×400 WebP logo. */
  logoPath?: string;
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
```

### 3. Update `apps/web/src/lib/api/branding.ts`

Extend `BrandingPatch`:
```typescript
export interface BrandingPatch {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
  logoPath?: string;
}
```

Update `updateBrandingForCommunity()`:
- Add hex validation for `accentColor` (same pattern as primary/secondary)
- Add font validation: import `ALLOWED_FONTS` from `@propertypro/theme`, check `fontHeading` and `fontBody` are in the list. If not, throw `ValidationError`.

### 4. Update `apps/web/src/components/pm/BrandingForm.tsx`

Add after the secondary color section:

**Accent color:** Same pattern as primary/secondary — `<input type="color">` + hex text input. State: `const [accentColor, setAccentColor] = useState(initialBranding.accentColor ?? '#DBEAFE');`

**Font heading:** Dropdown (`<select>`) populated from `ALLOWED_FONTS`. State: `const [fontHeading, setFontHeading] = useState(initialBranding.fontHeading ?? 'Inter');`

**Font body:** Same dropdown pattern. State: `const [fontBody, setFontBody] = useState(initialBranding.fontBody ?? 'Inter');`

**Wire into submit:** Add `accentColor`, `fontHeading`, `fontBody` to the PATCH request body.

**Update preview branding object:**
```typescript
const previewBranding: CommunityBranding = {
  primaryColor,
  secondaryColor,
  accentColor,
  fontHeading,
  fontBody,
  logoPath: initialBranding.logoPath,
};
```

Import `ALLOWED_FONTS` from `@propertypro/theme`.

### 5. Update `apps/web/src/components/pm/BrandingPreview.tsx`

Read this file first to understand the current preview layout, then add:
- Accent color swatch (small colored box with hex label)
- Heading font name display (text: "Heading: {fontHeading}")
- Body font name display (text: "Body: {fontBody}")

### 6. Update PM branding API route

**Read and modify:** `apps/web/src/app/api/v1/pm/branding/route.ts`

In the PATCH handler, accept `accentColor`, `fontHeading`, `fontBody` from the request body. Pass through to `updateBrandingForCommunity()`. The validation happens in the service function, not the route.

## Do NOT

- Do not modify `packages/db/src/schema/communities.ts` — the `branding` column is already `jsonb`, no schema change needed
- Do not wire theme injection into layouts — that's Phase 2
- Do not modify `mobile.css` — that was done in Task 0.5

## Acceptance Criteria

- [ ] Migration backfills existing rows with defaults
- [ ] `CommunityBranding` interface has all 6 fields (all optional)
- [ ] `BrandingPatch` accepts 6 fields
- [ ] Invalid hex for `accentColor` → 400 error
- [ ] Invalid font name → 400 error (e.g., "Comic Sans" not in ALLOWED_FONTS)
- [ ] Valid font name from list → persists correctly
- [ ] `BrandingForm` shows accent color picker + 2 font dropdowns
- [ ] Existing branding tests still pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
