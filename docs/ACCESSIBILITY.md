# Accessibility Audit — P4-63

**Date:** 2026-02-24
**Standard:** WCAG 2.1 AA
**Methodology:** Automated (axe-core via vitest-axe) + manual code review

## Audit Scope

Automated axe-core checks on all renderable UI surfaces:
- Auth forms: LoginForm, SignupForm, SetPasswordForm
- Maintenance submission form (SubmitForm)
- Marketing landing sections: Hero, Features, Pricing, ComplianceUrgency, Footer

## Pre-Existing Passing Areas

| Area | Evidence |
|------|----------|
| Document language | `<html lang="en">` in root layout |
| Focus management | `:focus-visible` ring tokens in `docs/design-system/tokens/focus.css` |
| Keyboard navigation | NavRail ArrowUp/Down, `useKeyboardClick` hook in `packages/ui` |
| Color independence | Status indicators always use icon + text (Design Laws) |
| Touch targets | 36-48px buttons, 44px nav items |
| Motion preferences | `prefers-reduced-motion` support in design tokens |
| Heading hierarchy | Polymorphic `Text`/`Heading` components with semantic level mapping |
| Form labels (set-password) | Proper `htmlFor`/`id` pairing, `autoComplete`, `role="alert"` |
| Form labels (maintenance) | Proper `htmlFor`/`id` pairing on all inputs |

## Issues Found and Remediated

### 1. Missing `role="alert"` on error messages
**Severity:** Moderate — screen readers won't announce dynamic errors
**Components fixed:**
- `login-form.tsx`: Error `<p>` now has `role="alert"`
- `signup-form.tsx`: Error div now has `role="alert"`, success div has `role="status"`
- `SubmitForm.tsx`: Field errors and server error now have `role="alert"`

### 2. Missing `autoComplete` attributes on auth inputs
**Severity:** Minor — password managers can't auto-fill reliably
**Components fixed:**
- `login-form.tsx`: `autoComplete="email"` and `autoComplete="current-password"`
- `signup-form.tsx`: `autoComplete="email"` and `autoComplete="new-password"`

### 3. Plan selection missing `aria-pressed` state
**Severity:** Moderate — screen readers can't convey selected plan
**Component fixed:**
- `signup-form.tsx`: Plan buttons now have `aria-pressed`, container has `role="group"` + `aria-label`

### 4. No skip navigation link
**Severity:** Moderate — keyboard users must tab through all nav to reach content
**Fix:**
- `layout.tsx`: Added skip-to-content link (`sr-only` + `focus:not-sr-only`) targeting `#main-content`
- Added `id="main-content"` to primary `<main>` elements in marketing, dashboard, mobile layout, and signup pages

### 5. File input missing label association
**Severity:** Serious — screen readers can't identify the file upload purpose
**Component fixed:**
- `SubmitForm.tsx`: Photo upload input now has `id="mr-photos"` linked to `<label htmlFor="mr-photos">`

## Automated Test Coverage

**File:** `apps/web/__tests__/accessibility/axe-audit.test.tsx`
**Tests:** 9 (all passing)
**Runner:** vitest + axe-core via vitest-axe

| Surface | Result |
|---------|--------|
| LoginForm | PASS |
| SetPasswordForm | PASS |
| SignupForm | PASS |
| SubmitForm | PASS |
| HeroSection | PASS |
| FeaturesSection | PASS |
| PricingSection | PASS |
| ComplianceUrgencySection | PASS |
| MarketingFooter | PASS |

## Accessibility Checklist for Future PRs

- [ ] All form inputs have associated `<label>` (wrapping or `htmlFor`/`id`)
- [ ] Error/success messages use `role="alert"` or `role="status"`
- [ ] Interactive non-button elements have `role="button"` and `tabIndex`
- [ ] New pages include `id="main-content"` on their primary `<main>`
- [ ] Toggle/selection controls use `aria-pressed` or `aria-selected`
- [ ] `autoComplete` attribute set on login/password/email inputs
- [ ] Color is never the sole indicator of state (pair with icon + text)
- [ ] Touch targets are at least 36px desktop / 44px mobile
