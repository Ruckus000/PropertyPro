# Custom CSS Overrides (Pro+)

A token-allowlist styling layer that lets Professional-tier communities override
their selected theme preset's colors and body font on the public site. **There
is no raw-CSS, selector, or class-name surface** — only the four validated token
fields below. Gated to the `hasSiteCustomCss` plan feature.

## Fields

`CommunityBranding.customCssOverrides` (jsonb, in `communities.branding`):

| Field            | Type     | Validation                          | Overrides CSS variable           |
|------------------|----------|-------------------------------------|----------------------------------|
| `primaryColor`   | `string` | 6-digit hex (`/^#[0-9a-fA-F]{6}$/`) | `--theme-primary` (+ `--theme-primary-hover`) |
| `secondaryColor` | `string` | 6-digit hex                         | `--theme-secondary`              |
| `accentColor`    | `string` | 6-digit hex                         | `--theme-accent`                 |
| `bodyFont`       | `string` | one of `ALLOWED_FONTS`              | `--theme-font-body`              |

All fields are optional. `customCssOverrides: null` (or missing) means "no
overrides" — the resolved theme applies unchanged.

Type: [`packages/shared/src/branding.ts`](../../packages/shared/src/branding.ts) (`CustomCssOverrides`).

## Render cascade

The public-site page composes CSS variables as:

```
cssVars = { ...toCssVars(resolveTheme(branding)), ...customCssOverridesToCssVars(branding.customCssOverrides) }
```

so the Pro overrides win over the resolved theme (which already accounts for
branding colors + the preset). The helper
[`customCssOverridesToCssVars`](../../packages/theme/src/custom-overrides.ts)
is **defensive** — it re-validates every field (hex regex, font allowlist) and
emits only valid token variables, so a malformed jsonb row can never inject
arbitrary CSS at render. Injection point:
[`apps/web/src/app/public-site/page.tsx`](../../apps/web/src/app/public-site/page.tsx).

## Write path & gating

`PATCH /api/v1/pm/branding` accepts an optional `customCssOverrides` object.

- **Sanitization boundary:** the sub-schema is Zod `.strict()` — any unknown key
  (a raw-CSS string, a selector, a class name) is rejected with `400`. Colors
  must be 6-digit hex; `bodyFont` must be on the allowlist.
- **Plan gate:** when the payload touches `customCssOverrides`, the handler calls
  `requirePlanFeature(communityId, 'hasSiteCustomCss')` → `403
  PLAN_UPGRADE_REQUIRED` for lower tiers. The rest of the branding PATCH
  (colors/fonts/logo) stays available to every tier.
- `null` clears the overrides.

## Editor UI

[`apps/web/src/components/pm/site-editor/CustomStylingForm.tsx`](../../apps/web/src/components/pm/site-editor/CustomStylingForm.tsx),
rendered as the "Custom Styling" section of `/pm/settings/website`.

- Per-field override toggle → color picker (+ hex input) or body-font dropdown.
- Saves only the enabled fields via `useSaveCustomCss` (a focused PATCH that
  never clobbers the other branding fields); all-off saves `null`.
- When `hasSiteCustomCss` is false the section renders **visible-but-locked**
  with an upgrade prompt (spec §4.3), and the write route enforces the same gate.

## Tier

| Tier         | Available |
|--------------|-----------|
| Essentials   | ✗ (upsell — requires `hasSiteCustomCss`) |
| Professional | ✓         |
| PM/Enterprise| ✓         |
