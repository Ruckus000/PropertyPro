# Task 2.3 — Demo Generator API + UI

> **Context files to read first:** `SHARED-CONTEXT.md`, then read:
> - `packages/db/src/schema/demo-instances.ts` (created in 2.1)
> - `packages/shared/src/auth/demo-token.ts` (created in 2.2)
> - `packages/db/src/seed/seed-community.ts` (created in 0.8)
> - `apps/admin/src/middleware.ts` (admin auth pattern from Phase 1)
> - `apps/web/src/components/pm/BrandingForm.tsx` (presigned upload pattern reference)
> **Branch:** `feat/demo-generator`
> **Estimated time:** 4-6 hours
> **Wave 4 (sequential)** — depends on 2.1, 2.2, and 0.8 being merged first.

## Objective

Create the API endpoint and UI wizard for generating branded demo instances from the admin app.

## Deliverables

### 1. Demo creation API

**Create:** `apps/admin/src/app/api/admin/demos/route.ts`

**`POST /api/admin/demos`** — protected by `requirePlatformAdmin(request)` as first line.

Request body:
```typescript
{
  templateType: 'condo_718' | 'hoa_720' | 'apartment';
  prospectName: string;       // max 100 chars
  branding: {
    primaryColor: string;     // hex #RRGGBB
    secondaryColor: string;
    accentColor: string;
    fontHeading: string;      // must be in ALLOWED_FONTS
    fontBody: string;
    logoPath?: string;        // Supabase Storage path if logo uploaded
  };
  externalCrmUrl?: string;
  prospectNotes?: string;
}
```

Implementation steps (in order):
1. Validate all fields. Reject if `prospectName` > 100 chars or fonts not in `ALLOWED_FONTS`.
2. Generate slug: `demo-${prospectName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)}-${randomId(6)}`
   - `randomId(6)` = `crypto.randomBytes(3).toString('hex')` (6 hex chars)
3. Create community via `createAdminClient()` (Drizzle, NOT Supabase client):
   - `name`: `prospectName`
   - `slug`: generated slug
   - `community_type`: `templateType`
   - `branding`: `{ primaryColor, secondaryColor, accentColor, fontHeading, fontBody, logoPath }` as JSONB
   - `is_demo`: `true`
   - `timezone`: `'America/New_York'`
   - `city`: `'Demo City'`
   - `state`: `'FL'`
   - `zip_code`: `'00000'`
4. Call `seedCommunity()` from `@propertypro/db/seed/seed-community`:
   ```typescript
   const seedResult = await seedCommunity(
     {
       name: prospectName,
       slug,
       communityType: templateType,
       branding: request.branding,
       isDemo: true,
     },
     [
       { email: `demo-resident@${slug}.propertyprofl.com`, fullName: 'Demo Resident', role: 'owner' },
       { email: `demo-board@${slug}.propertyprofl.com`, fullName: 'Demo Board Member', role: 'board_member' },
     ],
     { syncAuthUsers: true },
   );
   ```
5. Generate HMAC secret: `crypto.randomBytes(32).toString('hex')`
6. Insert `demo_instances` row with all fields:
   - `template_type`, `prospect_name`, `slug`, `theme` (branding JSONB)
   - `seeded_community_id` from seed result
   - `demo_resident_user_id`, `demo_board_user_id` from seed result users
   - `demo_resident_email`, `demo_board_email`
   - `auth_token_secret`
   - `external_crm_url`, `prospect_notes` (optional)
7. Generate preview tokens:
   ```typescript
   import { generateDemoToken } from '@propertypro/shared';

   const residentToken = generateDemoToken({
     demoId: demoInstance.id,
     userId: seedResult.users[0].userId,
     role: 'resident',
     secret: authTokenSecret,
     ttlSeconds: 3600,  // 1 hour
   });
   const boardToken = generateDemoToken({
     demoId: demoInstance.id,
     userId: seedResult.users[1].userId,
     role: 'board',
     secret: authTokenSecret,
     ttlSeconds: 3600,
   });
   ```
8. Return response:
   ```typescript
   return NextResponse.json({
     data: {
       demoId: demoInstance.id,
       slug,
       previewUrl: `/demo/${demoInstance.id}/preview`,
       mobilePreviewUrl: `/demo/${demoInstance.id}/mobile`,
       residentToken,
       boardToken,
     },
   });
   ```

**Error handling:** Wrap in try/catch. On failure, attempt cleanup: delete the community row (cascades to seeded data). Return `{ error: { message } }` with 500 status.

### 2. Upload endpoint for admin

**Create:** `apps/admin/src/app/api/admin/upload/route.ts`

This is needed for logo upload in the wizard. Same presigned-URL pattern as `apps/web/src/app/api/v1/upload/route.ts` but protected by `requirePlatformAdmin`.

Read the web upload route first to understand the pattern, then replicate it for the admin app with `requirePlatformAdmin` guard instead of session check.

### 3. Demo generator UI — Three-step wizard

**Create:** `apps/admin/src/app/demo/new/page.tsx`

Use a single page with state machine (not separate pages). State: `step: 1 | 2 | 3 | 'done'`.

**Step 1 — Template Selection:**
- Three clickable cards: Condo (718), HOA (720), Apartment
- Each card shows: icon/illustration, type name, brief description (e.g., "Florida §718 condominium association")
- Selected card gets visual highlight (border + background change using `--theme-primary` or blue-600)
- "Next" button, disabled until a template is selected

**Step 2 — Brand Configuration:**
- Prospect name (text input, required, max 100 chars)
- Logo upload (use same presigned upload pattern — `POST /api/admin/upload`)
- Primary color picker: `<input type="color">` + hex text `<input>` side by side
- Secondary color picker: same pattern
- Accent color picker: same pattern
- Heading font: `<select>` dropdown with all 25 `ALLOWED_FONTS`
- Body font: `<select>` dropdown with all 25 `ALLOWED_FONTS`
- **Live preview panel** (right side): A card-like preview that applies the selected theme in real-time:
  ```tsx
  const cssVars = toCssVars(resolveTheme({
    primaryColor, secondaryColor, accentColor, fontHeading, fontBody, logoPath
  }, prospectName, templateType));

  <div style={cssVars as React.CSSProperties}>
    <div style={{ backgroundColor: 'var(--theme-primary)', color: '#fff', padding: '1rem' }}>
      <h2 style={{ fontFamily: 'var(--theme-font-heading)' }}>{prospectName || 'Your Community'}</h2>
    </div>
    <div style={{ fontFamily: 'var(--theme-font-body)', padding: '1rem' }}>
      <p>Sample body text in the selected font...</p>
      <button style={{ backgroundColor: 'var(--theme-primary)', color: '#fff' }}>Sample Button</button>
    </div>
  </div>
  ```
- "Back" and "Next" buttons

**Step 3 — Confirm & Generate:**
- Summary of all selections (template, prospect name, colors, fonts)
- Optional fields: CRM URL (text input), Prospect Notes (textarea)
- "Generate Demo" button → calls `POST /api/admin/demos`
- Loading state: "Generating demo..." with spinner (this can take 5-10 seconds for seed)
- On success: transition to `step: 'done'`

**Done state:**
- Success card with:
  - "Demo created for {prospectName}"
  - Link to split-screen preview: `/demo/{demoId}/preview`
  - Link to mobile preview: `/demo/{demoId}/mobile`
  - "Create Another" button (resets wizard to step 1)

### 4. Navigation integration

Add "Create Demo" to the admin app's sidebar navigation (or wherever Phase 1 established the nav pattern). Link to `/demo/new`.

## Do NOT

- Do not create the demo-login auto-auth endpoint — that's in Task 2.4-2.6
- Do not create the preview pages — those are in Task 2.7-2.11
- Do not create the demo list page — that's in Task 2.7-2.11
- Do not modify `packages/theme` — import and use it
- Do not modify the seed script — import and call `seedCommunity()`

## Acceptance Criteria

- [ ] `POST /api/admin/demos` creates community + seeds data + returns tokens
- [ ] Upload endpoint works for logo files
- [ ] Wizard step 1 selects template type
- [ ] Wizard step 2 collects branding with live preview
- [ ] Wizard step 3 confirms and generates demo
- [ ] Success state shows working preview links
- [ ] Error handling cleans up on failure
- [ ] `requirePlatformAdmin` on all API routes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
