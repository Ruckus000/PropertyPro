# Spec: P3-47 — White-Label Branding

> Build white-label branding settings for property management companies to customize their portal appearance.

## Phase
3

## Priority
P1

## Dependencies
- P3-45
- P0-05

## Functional Requirements
- PM settings page for: company logo upload (resized to 400x400 via sharp, WebP conversion), primary/secondary brand colors, custom email templates with company branding
- Logo used in: PM dashboard header, email templates, community portals (optional)
- Colors applied via CSS custom properties override
- Preview of branding changes before saving

## Acceptance Criteria
- [ ] Logo uploads and appears in PM dashboard
- [ ] Brand colors apply to portal
- [ ] Email templates include PM logo
- [ ] Branding preview works
- [ ] `pnpm test` passes

## Technical Notes
- Store logo in Supabase Storage with public access for performance
- Resize and convert to WebP using sharp to optimize file size and reduce bandwidth
- Use CSS custom properties (--primary-color, --secondary-color) for consistent theming
- Cache logo URLs appropriately

## Files Expected
- `apps/web/app/(pm)/settings/branding/page.tsx`
- `apps/web/components/pm/BrandingForm.tsx`
- `apps/web/components/pm/BrandingPreview.tsx`
- `apps/web/lib/api/branding.ts`
- `apps/web/lib/services/image-processor.ts`

## Attempts
0
