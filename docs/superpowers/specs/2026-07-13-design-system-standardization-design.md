# Design System Standardization — Design

**Date:** 2026-07-13
**Status:** Approved (brainstorm + adversarial review complete)
**Scope:** `apps/web` desktop surfaces only

## Problem

The UI is not cohesive. An audit (2026-07-13) found the design system is well-documented but has four competing sources of truth and weak enforcement:

- **Token definitions in 4 places:** `packages/tokens` (typed TS + generator — the most rigorous layer, but its generated CSS is not loaded by any app), `packages/ui/src/styles/tokens.css` (387 hand-maintained lines — the file apps actually load via `apps/web/src/app/globals.css:1`), `docs/design-system/tokens/*.css` (reference copies), and raw hex in both Tailwind configs.
- **3 Button implementations** (shadcn CVA in `apps/web/src/components/ui/button.tsx` — 61 importing files; compound component in `packages/ui` — 20 importing files; docs copy). Incompatible variant vocabularies and different size scales.
- **6+ Badge implementations, 3 copies of `status.ts`**, plus a parallel `ESIGN_STATUS_CONFIG` (`apps/web/src/components/esign/esign-status-config.ts`).
- **5+ EmptyState variants**; docs patterns (SectionHeader, AlertBanner, EmptyState, …) hand-copied into `apps/web/src/components/shared/` with no import linkage — a manual-sync drift surface.
- **414 raw Tailwind palette classes** remain in web (excluding mobile); duplicated 8-color hex palettes copy-pasted between esign template files; 54 hand-rolled `animate-spin` spinners vs 42 Skeleton usages; 96 pages hand-roll `<h1>` instead of `PageHeader`; 29 files of ad-hoc `text-[NNpx]` sizes (concentrated in mobile).

## Research grounding (shadcn / Stripe / Atlassian)

- **shadcn** supplies the mechanics: one flat semantic CSS-variable layer with background/foreground pairing, CVA `variant`/`size` axes, own-your-code components, ~90% neutral palette with brand color only on primary actions and focus rings.
- **Stripe** supplies the visual policy: one accent used scarcely, "dense data, generous chrome," tabular figures on all numbers, borders before shadows, ink-not-black text, tinted subtle shadows. Their App Design System proves cohesion comes from closing escape hatches (no arbitrary colors/fonts/spacing).
- **Atlassian** supplies the operational playbook: intent-named semantic tokens, and the key lesson that **tokens without lint enforcement regress** — migrate via codemod/drain + a permanent lint rule that errors on raw values.

## Decisions (user-confirmed)

1. **Scope:** `apps/web` only. `apps/admin` and `/mobile` routes untouched; their violations are frozen in the guard baseline (cannot grow) but not migrated.
2. **Canonical component layer:** the shadcn/CVA layer in `apps/web/src/components/ui/`.
3. **Enforcement:** new CI guard + shrinking baseline allowlist (Atlassian model, PropertyPro `guard:*` culture).
4. **Visual goal:** consistency **plus** Stripe-style polish (not just unification, not a full redesign).
5. **Program shape:** consolidate in place (no fresh-kit rebuild), enforce early, ordered waves.

## Design

### 1. Token architecture — one definition, generated in place

`packages/tokens` becomes the only place tokens are defined.

- The generator gains **non-color token categories** as plain static typed maps (motion durations/easings, elevation `--elevation-e0..e3`, focus-ring system, font families/sizes, radius scale, spacing scale, `--nav-*`, component dims like `--button-height`). Colors keep the existing `PrimitiveRef | ThemeRef` model. The gap is exactly **68 variables** across these categories (verified by var-name diff).
- **Generate-in-place:** the build writes its output to the existing `packages/ui/src/styles/tokens.css` path. No app import changes; the swap is a reviewable byte-diff; admin (which imports the same file) is untouched. The hand-maintained file ceases to be hand-maintained.
- **Consumption-coverage check:** a script collects every `var(--*)` referenced in `apps/web/src` + both Tailwind configs and asserts each exists in the generated file. Runs once before the swap, then joins CI. (The existing parity test checks the opposite direction — TS→CSS — and stays.)
- `docs/design-system/tokens/*.css` implementation copies are deleted; `.md` docs stay (admin's `block-registry.ts:107` and `DocumentationHubs.tsx:22` link them by path — verify no deleted file is a doc href target).
- `apps/web/tailwind.config.ts` ends up mapping only semantic CSS variables; the legacy `primary/secondary/accent` migration colors and duplicated raw `blue`/`gray` hex palettes are removed after Wave 4 drains their usages.
- New tokens follow the shadcn foreground-pairing convention (every surface token has an on-surface text token). Interaction states become tokens (`--interactive-primary-hover/-pressed`, `--status-*-subtle`) so components stop ad-hoc darkening.
- **Dark mode is explicitly out of scope.** No `.dark` token overrides exist anywhere today; dark styling is ad-hoc `dark:` utilities. The token layer must not pretend to theme.

### 2. Component consolidation — one canonical layer

`apps/web/src/components/ui/` (shadcn/CVA) is canonical.

| Today | End state |
|---|---|
| 3 Buttons | shadcn `button.tsx` only. **Pre-work:** adopt the denser shadcn size scale (sm 32 / default 36 / lg 40px) as the new spec — matches the Stripe-density direction — update DESIGN.md's dimension table, and add a `loading` prop (spinner + disabled) to the canonical button. Then migrate the 20 `@propertypro/ui` Button import sites with variant map `primary→default`, `danger→destructive`. 7 files use `loading` (verified); 0 files use the compound `Button.Icon/.Label` API (verified). |
| 2 Cards | shadcn `card.tsx` only. 11 files / 32 occurrences use compound `Card.Header/.Section/.Footer` (verified); migrate to `CardHeader/CardContent/CardFooter`. |
| 6+ Badges | `badge.tsx` + the existing `StatusBadge` **kept as-is API-wise** (29 files use it — no API churn). Consolidation is config-only. |
| 3 `status.ts` copies + `ESIGN_STATUS_CONFIG` | One canonical `apps/web/src/lib/constants/status.ts`; esign statuses fold in as domain mappings; `packages/ui` and docs copies deprecated/deleted. StatusBadge reads the canonical config. |
| 5+ EmptyStates | One `empty-state.tsx` in `components/shared/`, absorbing the chart and transparency variants via props; `empty-states.ts` constants canonical in `apps/web/src/lib/constants/`. |

- `packages/ui` keeps only what has no shadcn equivalent and is genuinely shared: NavRail, PhoneFrame, the TipTap editor, primitives (Stack/Box/Text). Its Button/Card/Badge get `@deprecated` JSDoc and lose all web imports (deletion deferred until admin migrates in a future program).
- `docs/design-system/patterns/` and `components/` stop holding parallel `.tsx`/`.css` implementations — each doc becomes documentation *about* the live component with a pointer to its real path.

### 3. Visual policy — the Stripe polish

Written into `DESIGN.md` as rules and applied via token values + the canonical components:

- **Neutral-first, one scarce accent:** ~90% of any screen is the neutral ramp; brand blue only on primary actions, focus rings, active nav.
- **One filled primary button per view region** — *PR review-checklist rule, not lint-enforceable.*
- **Ink, not black; tinted, not gray shadows:** text tokens tune toward deep slate ink; elevation ladder stays E0 border-only / E1 subtle tinted shadow / E2–E3 overlays only.
- **Dense data, generous chrome:** data tables get `tabular-nums` on numeric/currency/date columns, minimal row rules with clear header split; macro-spacing keeps the `space-y-6` rhythm.
- **Status never color alone** — structurally carried by StatusBadge + canonical status config.
- **Focus rings always visible,** accent-colored, token-driven.

### 4. Enforcement — `guard:design-tokens`

New guard script `scripts/verify-design-tokens.ts` (pattern: `guard:breadcrumbs`), wired into `pnpm lint` and CI:

- **Bans in `.tsx`/`.ts`/`.css` under `apps/*/src`:** raw hex colors; raw Tailwind palette color classes (`bg-blue-500`, `text-gray-600`, …); arbitrary color values (`bg-[#…]`); arbitrary font sizes (`text-[13px]`); arbitrary pixel spacing (`p-[13px]`).
- **Baseline allowlist:** checked-in JSON of current violations (file path + per-rule count). Guard fails if any file's count grows or an unlisted file gains violations. Shrink-only. Admin + mobile violations live in the baseline indefinitely.
- **Rename policy:** a renamed/moved file must either arrive clean or carry a same-PR baseline update; the guard prints an explicit diff of growth vs. baseline.
- **Exemption comment:** `// design-tokens:exempt — <reason>` for legitimate cases (email templates needing literal hex, chart/canvas internals).
- *Not guard-enforceable (manual drain / review checklist):* spinner→Skeleton (`animate-spin` is legitimate inside a loading Button), primary-button scarcity.

### 5. Migration waves (each an independent PR series)

1. **Wave 0 — Token truth:** non-color categories added to the generator; generate-in-place swap; consumption-coverage check; interaction-state tokens. *Zero visual change; byte-diff + coverage script prove it.*
2. **Wave 1 — Guard:** ship `guard:design-tokens` + baseline. Drift stops here.
3. **Wave 2 — Component collapse:** DESIGN.md size-table update + `loading` prop on the canonical button, then Button/Card migrations (20 + 11 files); status-config consolidation; EmptyState merge; docs de-duplication; `@deprecated` markers on packages/ui trio.
4. **Wave 3 — Polish:** token value tuning (ink text, tinted shadows, interaction states) + `tabular-nums` table treatment + focus/elevation refinements. *Visual-change wave: before/after screenshots per page group, user sign-off before merge.*
5. **Wave 4 — Drain (shrinking the baseline):** 414 web raw-palette leaks; duplicated esign hex palettes → tokens; spinners → Skeleton; **final, explicitly cuttable batch:** hand-rolled `<h1>` pages → PageHeader (96 pages, batched).

`DESIGN.md` and `.claude/rules/design.md` are updated as each wave lands so docs never describe a system that doesn't exist.

### 6. Verification

- **No-visual-change waves (0, 2):** token byte-diff review + consumption-coverage script; typecheck/build/unit suite; screenshot spot-checks of top ~10 pages and Button-heavy views (sizes change 40→36px on migrated buttons per the new scale — verify hotspots).
- **Visual-change wave (3):** explicit before/after screenshot review per page group before merge.
- **Guard:** unit-tested against fixture files (violations detected, baseline honored, exemptions respected).

### 7. Risks

| Risk | Mitigation |
|---|---|
| Generated CSS drops a var some page uses | Generate-in-place byte-diff + consumption-coverage script before swap |
| Button size change (40→36 default) looks wrong somewhere | New scale applied uniformly; screenshot spot-checks of hotspots; explicit DESIGN.md update so spec and code agree |
| Variant-mapping mistakes (`primary→default`, `danger→destructive`) | Mechanical mapping; grep-verified call-site inventory; screenshot spot checks |
| Baseline gamed by moving violations between files | Guard compares per-file counts and flags new files; rename policy requires clean arrival or same-PR baseline edit |
| Docs deletion breaks admin doc links | Only `.tsx`/`.css` implementations deleted; `.md` kept; href audit against `block-registry.ts` before deletion |
| Unit tests asserting class names break on component changes | Expected churn, scoped per wave; CI catches |

## Out of scope

- `apps/admin` migration (future program reusing this playbook; its violations are baseline-frozen).
- `/mobile` route migration (same).
- Dark-mode token theming (no `.dark` overrides exist today; ad-hoc `dark:` utilities remain).
- Any IA/flow/behavioral changes.
- E-voting, compliance-engine, or any non-UI logic.
