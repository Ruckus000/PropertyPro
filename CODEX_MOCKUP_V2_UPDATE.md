# Codex Task: Align PropertyProRedesign.jsx to V2 Design System + Delete Deprecated File

## Overview

`PropertyProRedesign.jsx` is a ~3,100-line single-file React mockup/demo that contains its own copy of design tokens (lines 26–251) and embedded CSS (lines 344–597). These tokens are **stale V1 values** and must be updated to match the authoritative V2 design system at `docs/design-system/tokens/index.ts`.

Also delete the deprecated file `PropertyProElevated.jsx`.

---

## STEP 0: Delete Deprecated File

Delete `PropertyProElevated.jsx` from the project root. It is marked deprecated and should not be used.

---

## STEP 1: Update Primitive Token Values

All changes are in `PropertyProRedesign.jsx`. The V2 authoritative values come from `docs/design-system/tokens/index.ts`.

### 1.1 Typography — Update font size scale (line 49)

**Current (V1 — 15px base with 1.2 ratio):**
```javascript
size: { xs: "0.694rem", sm: "0.833rem", base: "1rem", lg: "1.2rem", xl: "1.44rem", "2xl": "1.728rem", "3xl": "2.074rem" },
```

**Replace with (V2 — 16px base):**
```javascript
size: { xs: "0.6875rem", sm: "0.8125rem", base: "1rem", lg: "1.125rem", xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem" },
```

### 1.2 Spacing — Add missing scale entries (lines 55–57)

**Current:**
```javascript
const primitiveSpace = {
  0: 0, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64
};
```

**Replace with (V2 — adds px, 0.5, 7, 9, 11, 14, 20):**
```javascript
const primitiveSpace = {
  0: 0, px: 1, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48, 14: 56, 16: 64, 20: 80
};
```

### 1.3 Radius — Update values (line 59)

**Current:**
```javascript
const primitiveRadius = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };
```

**Replace with (V2 — softer radii, adds 2xl):**
```javascript
const primitiveRadius = { none: 0, sm: 6, md: 10, lg: 16, xl: 20, "2xl": 24, full: 9999 };
```

### 1.4 Motion — Add missing values (lines 70–78)

**Current:**
```javascript
const primitiveMotion = {
  duration: { instant: 0, micro: 100, quick: 150, standard: 250, slow: 350 },
  easing: {
    linear: "linear",
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)"
  }
};
```

**Replace with (V2 — adds `expressive` duration and `bounce` easing):**
```javascript
const primitiveMotion = {
  duration: { instant: 0, micro: 100, quick: 150, standard: 250, slow: 350, expressive: 500 },
  easing: {
    linear: "linear",
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  }
};
```

---

## STEP 2: Update Semantic Token Additions

### 2.1 Semantic Colors — Add missing entries

The V2 system adds these tokens that are missing from the mockup's `semanticColors`:

**In `semanticColors.text`**, add after `linkHover`:
```javascript
placeholder: "var(--text-placeholder)",
```

**In `semanticColors.surface`**, add:
```javascript
sunken: "var(--surface-sunken)",
inverseSubtle: "var(--surface-inverse-subtle)",
```
Note: The mockup has `inverseOverlay`, `inverseOverlayHover`, `inverseBorder`, `inverseTextMuted`, `inverseTextSubtle` which are mockup-specific dark surface tokens. **Keep these** — they're used by the NavRail.

**In `semanticColors.border`**, add:
```javascript
muted: "var(--border-muted)",
error: "var(--border-error)",
```

**In `semanticColors.interactive`**, add:
```javascript
disabled: "var(--interactive-disabled)",
muted: "var(--interactive-muted)",
```

**In each `semanticColors.status.*` object**, add a `subtle` property:
```javascript
// For each status (success, brand, warning, danger, info, neutral):
subtle: "var(--status-{name}-subtle)",
```

### 2.2 Semantic Spacing — Add `page` macro tier

**Current `semanticSpacing` (lines 219–224):**
```javascript
const semanticSpacing = {
  inline: { xs: primitiveSpace[1], sm: primitiveSpace[2], md: primitiveSpace[3], lg: primitiveSpace[4], xl: primitiveSpace[6] },
  stack: { xs: primitiveSpace[2], sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[6], xl: primitiveSpace[8] },
  section: { sm: primitiveSpace[6], md: primitiveSpace[8], lg: primitiveSpace[12], xl: primitiveSpace[16] },
  inset: { xs: primitiveSpace[2], sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[5], xl: primitiveSpace[6] }
};
```

**Replace with (V2 — adds `page` macro tier, adds micro/macro comments):**
```javascript
const semanticSpacing = {
  // ── Micro tokens (component internals) ──
  inline: { xs: primitiveSpace[1], sm: primitiveSpace[2], md: primitiveSpace[3], lg: primitiveSpace[4], xl: primitiveSpace[6] },
  stack: { xs: primitiveSpace[2], sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[6], xl: primitiveSpace[8] },
  inset: { xs: primitiveSpace[2], sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[5], xl: primitiveSpace[6] },
  // ── Macro tokens (section/page composition) ──
  section: { sm: primitiveSpace[6], md: primitiveSpace[8], lg: primitiveSpace[12], xl: primitiveSpace[16] },
  page: { sm: primitiveSpace[12], md: primitiveSpace[16], lg: primitiveSpace[20] }
};
```

### 2.3 Add Semantic Elevation System

Insert after `semanticSpacing` and before `componentTokens`:

```javascript
// ─── Elevation System ───
// E0=flat (default), E1=raised (hover/sticky), E2=overlay (menus/popovers), E3=modal
const semanticElevation = {
  e0: { shadow: primitiveShadow.none },
  e1: { shadow: primitiveShadow.sm },
  e2: { shadow: primitiveShadow.md },
  e3: { shadow: primitiveShadow.lg }
};
```

---

## STEP 3: Update Component Tokens

### 3.1 Button — Fix height, update radius (lines 228–234)

**Current:**
```javascript
button: {
  height: { sm: 32, md: 40, lg: 48 },
  ...
  radius: primitiveRadius.md
},
```

**Replace with:**
```javascript
button: {
  height: { sm: 36, md: 40, lg: 48 },
  padding: { sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[5] },
  iconSize: { sm: 14, md: 16, lg: 18 },
  gap: primitiveSpace[2],
  radius: primitiveRadius.md
},
```

### 3.2 Card — Update radius to md, add elevation contract (lines 242–246)

**Current:**
```javascript
card: {
  padding: { sm: primitiveSpace[4], md: primitiveSpace[5], lg: primitiveSpace[6] },
  radius: primitiveRadius.lg,
  gap: primitiveSpace[4]
},
```

**Replace with:**
```javascript
card: {
  padding: { sm: primitiveSpace[4], md: primitiveSpace[5], lg: primitiveSpace[6] },
  radius: primitiveRadius.md,
  gap: primitiveSpace[4],
  elevation: { rest: "e0", hover: "e1", interactive: "e1" }
},
```

### 3.3 Nav item — radius already uses primitiveRadius.md (line 249)

This is correct — `primitiveRadius.md` will now resolve to 10 instead of 8. No code change needed, just verify.

### 3.4 Add input, table, modal, tooltip component tokens

Insert these after the `nav` block inside `componentTokens`:

```javascript
input: {
  height: { sm: 36, md: 40, lg: 48 },
  padding: { sm: primitiveSpace[2], md: primitiveSpace[3], lg: primitiveSpace[4] },
  radius: primitiveRadius.sm,
  borderWidth: 1,
  focusBorderWidth: 2
},
table: {
  row: { height: 52, padding: primitiveSpace[4] },
  header: { height: 40, padding: primitiveSpace[4] },
  cell: { padding: primitiveSpace[3] }
},
modal: {
  width: { sm: 400, md: 560, lg: 720, xl: 960 },
  padding: primitiveSpace[6],
  radius: primitiveRadius.lg,
  elevation: "e3"
},
tooltip: {
  padding: `${primitiveSpace[2]}px ${primitiveSpace[3]}px`,
  radius: primitiveRadius.md,
  maxWidth: 280
}
```

---

## STEP 4: Update Embedded CSS (`injectedGlobalStyles`, lines 344–597)

### 4.1 Font size — Change from 93.75% to 100% (line 345)

**Current:**
```css
html { font-size: 93.75%; }
```

**Replace with:**
```css
html { font-size: 100%; }
```

### 4.2 CSS radius variables — Update values (lines 473–477)

**Current:**
```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;
```

**Replace with:**
```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
--radius-xl: 20px;
--radius-2xl: 24px;
--radius-full: 9999px;
```

### 4.3 CSS shadow variables — Add elevation mapping (lines 479–481)

**Current:**
```css
--shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03);
```

**Replace with:**
```css
/* Elevation tokens */
--elevation-e0: none;
--elevation-e1: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
--elevation-e2: 0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02);
--elevation-e3: 0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03);

/* Shadow aliases (backward compat) */
--shadow-sm: var(--elevation-e1);
--shadow-lg: var(--elevation-e3);
```

### 4.4 CSS semantic tokens — Add missing variables

Add these CSS variables to the `:root` block:

```css
/* Missing semantic tokens */
--text-placeholder: var(--gray-400);
--surface-sunken: var(--gray-50);
--surface-inverse-subtle: var(--gray-900);
--border-muted: var(--gray-50);
--border-error: var(--red-500);
--interactive-disabled: var(--gray-300);
--interactive-muted: var(--blue-100);

/* Status subtle variants */
--status-success-subtle: var(--green-100);
--status-brand-subtle: var(--blue-100);
--status-warning-subtle: var(--amber-100);
--status-danger-subtle: var(--red-100);
--status-info-subtle: var(--blue-100);
--status-neutral-subtle: var(--gray-50);

/* Responsive density */
--component-padding: var(--space-4);
--component-gap: var(--space-3);
--input-height: 48px;
--button-height: 48px;
```

### 4.5 Add desktop density media query

Add inside the `injectedGlobalStyles` template literal, after the existing media queries:

```css
@media (min-width: 768px) {
  :root {
    --component-padding: var(--space-3);
    --component-gap: var(--space-2);
    --input-height: 40px;
    --button-height: 40px;
  }
}
```

### 4.6 Card hover — Use elevation token (line 561–563)

**Current:**
```css
[data-pp-card][data-interactive="true"]:hover {
  box-shadow: var(--shadow-lg);
}
```

**Replace with:**
```css
[data-pp-card][data-interactive="true"]:hover {
  box-shadow: var(--elevation-e1);
}
```

### 4.7 DataRow touch padding — Use scale value (lines 592–594)

**Current:**
```css
[data-pp-datarow] {
  padding-top: 14px !important;
  padding-bottom: 14px !important;
}
```

**Replace with (16px is on the spacing scale):**
```css
[data-pp-datarow] {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
```

---

## STEP 5: Fix Hardcoded Bespoke Values in Components

### 5.1 NavRail badge font size (~line 1949)

Find `fontSize: "0.75rem"` in the NavRail badge rendering.

**Replace with:**
```javascript
fontSize: primitiveFonts.size.xs
```

### 5.2 NavRail badge padding (~line 1951)

Find `padding: "0 6px"` in the NavRail badge.

**Replace with:**
```javascript
padding: `0 ${primitiveSpace[2]}px`
```

### 5.3 NavRail badge borderRadius (~line 1952)

Find hardcoded `borderRadius: 10` in the NavRail badge.

**Replace with:**
```javascript
borderRadius: primitiveRadius.md
```

### 5.4 Search padding bespoke value (~line 2093)

Find `padding: \`1px ${semanticSpacing.inline.sm}px\`` in the search/TopBar area.

**Replace `1px` with `${primitiveSpace[1]}px`:**
```javascript
padding: `${primitiveSpace[1]}px ${semanticSpacing.inline.sm}px`
```

### 5.5 Search settings padding (~line 2148)

Find `padding: "2px 6px"` in the search settings area.

**Replace with:**
```javascript
padding: `${primitiveSpace[1]}px ${primitiveSpace[2]}px`
```

### 5.6 Modal overlay background (~line 3082)

Find `background: "rgba(0,0,0,0.35)"`.

**Replace with:**
```javascript
background: "var(--surface-inverse-overlay, rgba(0,0,0,0.35))"
```

### 5.7 Card component — Update elevation references

In the Card component (around line 1179–1182), find any direct references to `primitiveShadow.sm` or `primitiveShadow.lg` for card shadows.

**Replace with semantic elevation:**
```javascript
// Instead of:
boxShadow: elevated ? primitiveShadow.lg : primitiveShadow.sm
// Use:
boxShadow: elevated ? semanticElevation.e1.shadow : semanticElevation.e0.shadow
```

For interactive card hover, use `semanticElevation.e1.shadow`.

---

## STEP 6: Add V2-Only Constructs to the Mockup

### 6.1 Add complianceEscalation object

Insert after the `componentTokens` block:

```javascript
// ─── Compliance Escalation Tiers ───
const complianceEscalation = {
  calm:     { variant: "neutral",  treatment: "subtle",     iconEmphasis: false },
  aware:    { variant: "brand",    treatment: "standard",   iconEmphasis: false },
  urgent:   { variant: "warning",  treatment: "prominent",  iconEmphasis: true },
  critical: { variant: "danger",   treatment: "persistent", iconEmphasis: true }
};
```

### 6.2 Add semanticMotion object

Insert after `complianceEscalation`:

```javascript
// ─── Semantic Motion ───
const semanticMotion = {
  feedback:    { duration: primitiveMotion.duration.quick,    easing: primitiveMotion.easing.standard },
  orientation: { duration: primitiveMotion.duration.standard, easing: primitiveMotion.easing.enter },
  attention:   { duration: primitiveMotion.duration.slow,     easing: primitiveMotion.easing.bounce },
  none:        { duration: primitiveMotion.duration.instant,  easing: primitiveMotion.easing.linear }
};
```

### 6.3 Add interactionSizing object

```javascript
// ─── Interaction Sizing ───
const interactionSizing = {
  touchTarget:   { minimum: 44, comfortable: 48 },
  pointerTarget: { minimum: 36, comfortable: 40 }
};
```

---

## STEP 7: Verification

After all changes, verify the mockup still renders correctly:

- [ ] The `primitiveFonts.size` values match `docs/design-system/tokens/index.ts` exactly
- [ ] `html { font-size: 100%; }` — not 93.75%
- [ ] `primitiveRadius` values: sm=6, md=10, lg=16, xl=20, 2xl=24, full=9999
- [ ] `componentTokens.button.height.sm` is 36 (not 32)
- [ ] `componentTokens.card.radius` is `primitiveRadius.md` (not `primitiveRadius.lg`)
- [ ] `componentTokens.card.elevation` object exists with rest/hover/interactive
- [ ] `semanticElevation` object exists with e0/e1/e2/e3
- [ ] `semanticSpacing` has `page` macro tier
- [ ] All CSS `--radius-*` variables match new values
- [ ] CSS has `--elevation-e0` through `--elevation-e3`
- [ ] No remaining `fontSize: "0.75rem"` hardcoded values
- [ ] No remaining `padding: "0 6px"` hardcoded values
- [ ] No remaining `borderRadius: 10` hardcoded values
- [ ] No remaining `padding: "2px 6px"` hardcoded values
- [ ] Card hover uses `semanticElevation.e1.shadow` (not `primitiveShadow.lg`)
- [ ] DataRow touch padding is 16px (not 14px)
- [ ] `complianceEscalation`, `semanticMotion`, `interactionSizing` objects all present
- [ ] `PropertyProElevated.jsx` has been deleted
- [ ] The file loads without runtime errors (no undefined references)
