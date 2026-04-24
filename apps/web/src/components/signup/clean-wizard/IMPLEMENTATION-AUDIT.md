# Clean SaaS wizard — implementation audit (post)

## Source traceability

- **Reference (read-only):** `apps/web/src/components/signup/clean-wizard/_reference/` — `df32307b-clean-wizard.js`, `a34fd003-shared-wizard.js`, `reference-root.css` (stray `</style>` removed; valid CSS only).
- **`cleanStyles` / `CLEAN_ACCENT`:** `clean-wizard-styles.ts` (transcribed; `next/font` vars prepended in `fontFamily` where the reference named Geist / JetBrains Mono).
- **Scoped tokens / `#f0eee9`:** `clean-wizard.css` (`.clean-signup-root`).
- **STEPS_4, COMMUNITY_TYPES, spacing `regular` + airy `24`:** `clean-wizard-config.ts` and `df32307b` (spacing map).

## Deviation (explicit)

- **Admin roles:** Mock `ROLES` (4) replaced with production **`SIGNUP_ADMIN_TYPES`** (5) and the same copy as `signup-form.tsx` card UI (`ADMIN_ROLE_COPY` in `clean-signup-wizard.tsx`).

## Integrations

| Item | Status |
|------|--------|
| `SignupAddressAutocomplete` | Community step; same clear-on-edit behavior as `signup-form` |
| Subdomain check | `useSubdomainAvailability` (shared with `SubdomainChecker`) + clean-styled row |
| Terms / Privacy | Radix `Dialog` (same copy pattern as `signup-form`) |
| `signupSchema` + POST `/api/v1/auth/signup` | Final submit; field errors → `fieldToStepIndex` |
| 429 | Message set on rate limit |
| Billing toggle | UI only (not in schema) |
| Apartment plans | `getSignupPlansForCommunityType('apartment')` in plan step |
| `verificationReturn` + confirm | Same flow as `signupForm` |
| `pm` signup route | Unchanged in `page.tsx` (Contact Sales) |

## CI

- `pnpm --filter @propertypro/web typecheck`
- `pnpm lint`

## A11y spot check (manual)

- Stepper: keyboard focus on primary actions; form submit on Enter; dialogs trap focus (Radix).
- Address listbox: behavior from `SignupAddressAutocomplete` (combobox, listbox).
