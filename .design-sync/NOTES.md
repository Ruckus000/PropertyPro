# design-sync notes — PropertyPro

Repo-specific gotchas for future syncs. Read this BEFORE re-running.
Run `./.design-sync/build.sh` (prepares all four converter inputs), then
`package-build.mjs`, then `package-validate.mjs` — **as separate commands,
checking each exit code**.

## Shape and scope

- **No Storybook anywhere** (no `.storybook/`, no `*.stories.*`) → `shape: package`.
- The design system is **three trees**, only one of which is built:
  `packages/ui` (real tsup `dist/`), `apps/web/src/components/ui` (shadcn, app
  source), `apps/web/src/components/shared` (domain patterns), plus
  `layout/page-container.tsx`. **147 components** total.
- The rest of `layout/` is deliberately excluded: `AppShell`, `AppSidebar`,
  `CommandPalette`, `ShellBreadcrumbs` need `next/navigation` + React Query.
- `Editor` is excluded — not in the `packages/ui` root barrel, and it drags in
  TipTap + 12 prosemirror packages for a card showing an empty text box.

## The five name collisions (and why the fix is where it is)

`Button`, `Card`, `Badge`, `Label`, `StatusBadge` exist in BOTH `packages/ui`
and `apps/web`. Winners follow `docs/design-system/README.md:14-15`:

| Bare name | Winner | Loser exported as |
|---|---|---|
| `Button`, `Card` | shadcn | **not exported** (`@deprecated` in packages/ui) |
| `Badge` | `packages/ui` (owns the CVA status-variant system) | `ShadcnBadge` |
| `Label` | shadcn (form label) | `UiLabel` (a typography primitive — different component entirely) |
| `StatusBadge` | `shared/status-badge.tsx` (19 importers vs 5) | `UiStatusBadge` |

> `StatusBadge` is the one arguable call: the docs table assigns the whole
> status family to `packages/ui`, but usage says otherwise. Flipping it is a
> two-line change in `.ds-sync/gen-barrel.mjs` + `disambiguate-dts.mjs`.

**Renaming the barrel export is NOT enough.** Prop extraction looks names up in
a flat `.d.ts` tree, so a duplicate silently resolves to the wrong layer:
`Button` shipped `variant="primary"|"danger"` (the deprecated packages/ui API)
instead of shadcn's `variant="default"|"destructive"|…`. Nothing warns.
`.ds-sync/disambiguate-dts.mjs` renames the LOSING declaration **and its
`*Props` interface** in the emitted tree. Both halves are required — shadcn's
`Card` has no Props interface of its own, so it would otherwise borrow
`packages/ui`'s `CardProps`. Verify with `.ds-sync/find-dup-decls.mjs` and
`.ds-sync/find-dup-types.mjs` (both must report 0 component-name dups;
ALL-CAPS `WIDTHS`/`RESERVE` are constants and are filtered by `isComponentName`).

## Four traps that cost real time

1. **`noEmit: true` is inherited** from the root tsconfig. `tsc` then exits **0
   having emitted nothing**. `entry/tsconfig.json` overrides it — don't remove.
2. **`cssEntry` must live INSIDE the package dir.** Pointing it at
   `../.cache/ds.css` printed `! cssEntry: … resolves outside the package —
   skipped` and shipped **all 147 components unstyled**. It is a warning, not an
   error. Same for `tsconfig`, which is resolved relative to `PKG_DIR`.
3. **`dist/node_modules` symlink → `apps/web/node_modules` is load-bearing.**
   Without it `class-variance-authority` doesn't resolve from the nested dist
   tree, `VariantProps<typeof buttonVariants>` collapses, and every CVA
   component silently loses `variant`/`size` — the props a design agent needs
   most. `build.sh` does not create it; it survives in gitignored `dist/`, so
   **recreate it after any `rm -rf dist` that bypasses build.sh.**
4. **A stray `/Users/jphilistin/node_modules`** (hundreds of packages) sits
   above the repo and pollutes node/TS resolution. It caused a duplicate
   `csstype` and a `React.CSSProperties` mismatch. `--noCheck` sidesteps it for
   declaration emit.

## Why the `process` shim exists

`next` has **no `exports` map**, so `next/link` resolves to
`next/dist/client/link.js` → `add-base-path.js:13`, which reads
`process.env.__NEXT_ROUTER_BASEPATH` at **module top level**. esbuild
(`platform: browser`) does not shim `process`, so without
`entry/process-shim.ts` the IIFE throws `ReferenceError` at bundle-eval time and
**no export is assigned** — losing all 147 components, not the 2 that import
`next/link` (`ui/help-tooltip.tsx`, `shared/kpi-card.tsx`). It must stay the
**first** export in the barrel. Link itself is null-router tolerant and renders
a plain `<a href>`, which is correct for a static card.

## Known render warns (triaged — a warn NOT in this list is new)

- **`[FONT_MISSING] "JetBrains Mono"` — accepted, do not fix.** `--font-mono` is
  never defined in the app and the font is deliberately not vendored
  (`marketing-theme.css` documents this), so production falls back to system
  mono. Shipping it would make the `Code` primitive render BETTER than
  production, which is not fidelity. Inter + Fraunces ARE vendored and ship via
  `.design-sync/fonts.css` (`next/font/local` generates their `@font-face` at
  build time, so there is no rule in the repo for the converter to scrape).

## Classes that emit ZERO CSS in production (pre-existing — do not "fix" here)

`.ds-sync/check-css-coverage.mjs` reports ~96% coverage. The uncovered ones are
faithful to production, not pipeline gaps:

- `pp-button`, `pp-card`, `button-spinner`, `near-fullscreen`, `center-anchored`
  — **test-hook marker classes** with no CSS by design (asserted in
  `packages/ui/__tests__`).
- `bg-background`, `text-muted-foreground` — shadcn defaults this repo's Tailwind
  config never defines (it uses `surface-*` / `content-*`). **Real latent bugs**,
  same class as the slash-opacity trap in CLAUDE.md.
- `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-bottom-full` — need
  `tailwindcss-animate`, which is **not installed** (`plugins: []`). Radix
  enter/exit animations are inert in production.
- `duration-250` — not in the config's `--motion-duration-*` scale.

## Tailwind / CSS

- Only `packages/ui/src/styles/tokens.css` exists (253 custom properties, **zero
  utility classes**), so a compiled stylesheet is mandatory or everything renders
  unstyled. The 12 primitives + `PhoneFrame` are the exception — they use inline
  styles from the token objects and need only the custom properties. **That makes
  them the smoke test:** if they render and everything else is naked, the CSS
  build failed; if they are broken too, the bundle failed.
- Build from `apps/web/src/app/globals.css` — the app's real entry. It carries
  the tokens `@import`, the Tailwind directives, and `:root { font-size: 18px }`.
  A hand-authored entry drops the 18px root and renders every rem utility 12.5%
  small.
- `content` needs **`relative: true`** — v3 globs resolve against the CWD, so
  without it a repo-root run silently yields a near-empty sheet.
- Dark mode is out of scope: `darkMode: "class"` is set but `tokens.css` has no
  `.dark` block and nothing ever sets the class. Render light-mode only.

## Preview authoring — the race rule

Authored previews must only use classes already in the compiled sheet, because
subagents must NOT run shared builds (`package-build.mjs`,
`package-validate.mjs`, or the Tailwind build) — that would race every parallel
agent. Anything else goes in the **literal-string** `safelist` in
`.design-sync/tailwind.config.ts` (never patterns — they explode against
variants and under-cover silently), which is an orchestrator-only edit followed
by one CSS rebuild. Check with
`node .ds-sync/check-css-coverage.mjs --previews` (exits 1 on any uncovered
class).

## Re-sync risks

- **`dist/` is gitignored and fully generated.** A fresh clone must run
  `./.design-sync/build.sh` AND recreate the `dist/node_modules` symlink (trap 3)
  before the converter, or CVA props silently degrade.
- **`.ds-sync/` is staged from the skill and gitignored.** Re-copy it every sync;
  a stale copy runs an old converter. `gen-barrel.mjs`, `gen-config.mjs`,
  `disambiguate-dts.mjs`, `find-dup-*.mjs`, `check-css-coverage.mjs` are
  **repo-specific and live there**, so they are lost on a fresh clone — if this
  sync is repeated often, move them under `.design-sync/`.
- **The barrel and config are GENERATED** from `.design-sync/.app-exports.json`
  and `.ui-exports.json` (themselves generated by `.ds-sync/enum-exports.mjs` /
  `enum-ui.mjs`). Adding or removing a component in `apps/web/src/components/{ui,shared}`
  or `packages/ui` changes the count — re-run the enumerators, not hand edits.
- **Collision policy is encoded in three places** (`gen-barrel.mjs`,
  `gen-config.mjs`, `disambiguate-dts.mjs`). A new collision must be added to all
  three, or extraction silently picks the wrong layer again.
- Component **groups** come from the pinned src path: `web` (107), `shared` (21),
  `primitives` (12), `general` (6), `layout` (1). Adequate but coarse; regrouping
  needs `docsMap` stubs with `category:` frontmatter.

## Ordering trap: set `cfg.overrides` BEFORE the full build

`preview-rebuild.mjs` refuses with `✗ [CONFIG_STALE] cfg.overrides/cfg.titleMap for a
target component changed since the stamped build` when a component's override slice
changed after `ds-bundle/.stories-map.json` was stamped. There is **no escape flag**.

Hit for real: the overlay `cardMode`/`viewport` overrides were added after the last
`package-build.mjs`, which blocked **75 of 147 components** (every Dialog /
AlertDialog / Sheet / Popover / Tooltip / DropdownMenu / Select / Command part)
across three parallel authoring batches at once.

**Rule:** decide `cfg.overrides` up front; after ANY override edit run
`package-build.mjs` once to re-stamp BEFORE dispatching preview work. And never run
`package-build.mjs` while authoring subagents are live — it rewrites the shared
bundle they are reading.

## Component findings worth keeping (from authoring)

- **`PopoverAnchor` silently anchors to (0,0)** when it is a sibling rendered
  *before* `PopoverTrigger` — measured `--radix-popper-anchor-width: 0px`, so the
  popover lands in the viewport corner with no error. Putting the trigger inside
  the anchor, or after it, both work. Tree order, not host-vs-component. This is a
  real-code footgun, not just a preview one: it fails as a silent layout bug.
- **`HelpTooltip` exposes no `open`/`defaultOpen`**, so its tooltip surface cannot
  be rendered in a static capture. Its cards show the trigger in real form context.

## The shipped CSS must cover the VOCABULARY, not just current usage

Tailwind JIT emits only classes it finds in the content scan. Scanning component
sources alone produces a sheet that styles today's components correctly but is
**wrong for the actual purpose**: the design agent writes NEW markup in this
design language, and any semantic class no existing component happens to use
would emit zero CSS and render silently unstyled — the same failure mode as the
slash-opacity trap in CLAUDE.md, but for the whole vocabulary.

`.ds-sync/gen-vocabulary.mjs` reads `apps/web/tailwind.config.ts` and enumerates
the full matrix (colour families x utility prefixes x state variants, plus the
radius / shadow / font-size / duration / spacing scales) into
`.design-sync/vocabulary.txt` (~1,400 tokens), which is a Tailwind content file.
Sheet went 101 KB -> 181 KB. `build.sh` regenerates it every run, so it tracks
config changes automatically.

**Verification gotcha:** do NOT check for variant classes with shell grep like
`grep "\.hover\:bg-x"`. In a regex `\:` means a literal `:`, but the CSS contains
a literal BACKSLASH (`.hover\:bg-x:hover`), so the match fails and a present
class reports as missing. `.ds-sync/check-css-coverage.mjs` escapes correctly
(JS string `'\\:'`); trust it over an ad-hoc grep.

## Radix composition contracts (learned while authoring; verified against dist)

- **`AlertDialogCancel` throws outside `AlertDialogContent`.** It calls
  `useAlertDialogContentContext`, and only `AlertDialogContent` mounts that
  provider — a hand-composed `<AlertDialogPortal><AlertDialogOverlay/><div…>`
  panel containing it blanks the cell. `AlertDialogAction`/`Title`/`Description`
  and `DialogClose`/`Title`/`Description` are safe outside content (Root scope
  only). Use `<Button variant="outline">` as the cancel affordance in hand-composed
  panels.
- **`DialogContent` renders its own `DialogPortal` + `DialogOverlay` internally.**
  Wrapping it in another `DialogPortal` doubles the scrim and is wrong.
- **`PopoverAnchor` silently anchors to (0,0)** when it is a sibling rendered
  *before* `PopoverTrigger` (`--radix-popper-anchor-width: 0px`, no error). Put the
  trigger inside the anchor, or after it. Tree order, not host-vs-component — a
  real-code footgun that presents as a layout bug.
- **`HelpTooltip` exposes no `open`/`defaultOpen`**, so its tooltip surface cannot
  render in a static capture; its cards show the trigger in real form context.
- **cmdk:** `CommandInput`'s `value` drives the filter (1.1.1 syncs it into
  `store.search`), which is how filtered/empty states render with no interaction.
  `CommandSeparator` renders only while the search is empty unless `alwaysRender`.
  `CommandList` caps at `max-h-[300px]` — more than ~2 headed groups clips mid-row
  and reads as broken markup.
- Submenus need `align="start"` with a left-aligned trigger; at `align="end"` on a
  640px panel the sub-content lands ~888px into a 900px viewport and Radix flips it.

## Preflight quirk in the compiled sheet

`menu,ol,ul{list-style:none;margin:0;padding:0}` IS present, but the
`ol{list-style-type:decimal}` / `ul{list-style-type:disc}` rules are scoped to the
`[&_ol]:list-decimal` arbitrary variants (TipTap/authored HTML), not global — so a
`<ul>` in new markup needs an explicit `list-disc`.

## Verification trap seen again, independently

A subagent ran `node build.mjs | grep -c '^ok'`, got 0, and the capture step then
happily re-photographed **stale** JS from a previous run — 8 files had failed to
compile and the pipe swallowed the exit code. Same lesson as
`.claude/rules/verification.md`: redirect to a file, assert the exit code, THEN
grep. This bit a careful agent inside a task explicitly about verification.

## Two corrections to claims made during the run

1. **`package-build.mjs` does NOT delete `.design-sync/learnings/`.** A subagent
   observed the directory gone after a re-stamp and inferred the build removed it.
   It did not — the orchestrator deleted those files deliberately after folding
   them into this file (`[LEARNINGS_UNMERGED]` is an upload blocker, so folding
   and deleting is the required step). The build does not touch that directory.
2. **The CSS coverage guard was reading a stale stylesheet.** After `cssEntry`
   moved to `.design-sync/entry/generated.css`, `check-css-coverage.mjs` was still
   reading the old `.design-sync/.cache/ds.css` — 102 KB vs the real 207 KB. It
   therefore validated previews against a sheet the cards do not use. Because the
   stale sheet was the SMALLER one the guard was strictly conservative (nothing
   bad shipped), but it produced false "missing class" reports for anything added
   later. Fixed, and the stale file deleted so it cannot be picked up again.
   **Lesson: a guard that reads a path is only as good as that path — when an
   output location moves, grep for every consumer of the old one.**

## Real repo bug found while rendering previews (flagged separately)

Four components in `apps/web/src/components/ui/` use bare `focus:ring-*` where the
rest of the system uses `focus-visible:ring-*`: `dialog.tsx:275`
(`DialogPrimitive.Close`), `sheet.tsx` (`SheetPrimitive.Close`), `select.tsx`
(`SelectTrigger`), `badge.tsx`. `dialog.tsx:263` in the SAME file correctly uses
`focus-visible:`, as does `button.tsx:9`.

Effect: the ring paints on programmatic/mouse focus, not just keyboard. Surfaced
when a Dialog whose footer controls were all disabled autofocused its close button
and painted a coral ring in a mouse-driven open. Every other component's ring
stayed correctly hidden. Not fixed here (Parts 1-2 modify no repo source).

## Name-based extraction can borrow props ACROSS layers (second variant)

Already documented above: duplicate names resolve to the wrong layer. There is a
second, subtler variant the duplicate check cannot see — a `*Props` interface that
exists in exactly ONE place, but the WRONG one.

`packages/ui/src/components/Card.d.ts` declares NON-EXPORTED `CardHeaderProps` /
`CardFooterProps` for its compound `Card.Header` / `Card.Footer` slots. shadcn's
`CardHeader` / `CardFooter` have no Props interface at all (plain
`React.HTMLAttributes<HTMLDivElement>`), so extraction borrowed those by name and
shipped a phantom **`bordered?: boolean`** the component does not implement — a
design agent would pass it and get silence.

`.ds-sync/find-crosslayer-props.mjs` encodes the general rule: a `*Props`
interface declared in one layer whose base name is an exported component
resolving to the other layer. It is now part of `build.sh` alongside
`find-dup-decls.mjs`. Both fire on 0 today.

**Do not use "does this prop appear in the component's own source?" as the test** —
that flags 41 components, almost all of them legitimately INHERITING Radix/cmdk
props (`Tabs.value`, `TooltipContent.align`) that are correct and wanted. The
cross-layer rule is the precise one.

## A second real repo bug found while rendering (flagged separately)

`apps/web/src/components/shared/status-badge.tsx:85,129` builds the dot colour at
runtime: `classes.text.replace("text-", "bg-")`. Tailwind's scanner never sees the
result, so `bg-status-*` is emitted only where another file writes it literally.
Six variants get in by luck; **`owner` and `board` do not** — verified
`bg-status-owner` appears 0 times in `apps/web/.next/static/css/*.css`. So
`<StatusDot variant="owner" />` renders an invisible dot in production. The
`@propertypro/ui` Badge is unaffected (it uses `bg-[var(--status-owner-bg)]`,
which is statically visible). Same failure class as the slash-opacity trap.

## A third real repo bug: Switch renders broken in production

`apps/web/src/components/ui/switch.tsx` uses `bg-background` (thumb) and
`data-[state=unchecked]:bg-input` (off track). **Neither `background` nor `input`
is defined in `apps/web/tailwind.config.ts`**, so both emit zero CSS — verified
0 occurrences of `.bg-input` / `.bg-background` across every file in
`apps/web/.next/static/css/`. The ON state renders as a solid coral capsule with
no visible knob; the OFF state is invisible. `bg-primary` resolves (a legacy
alias), which is why only half the control disappears.

`guard:design-tokens` cannot see this: the classes are not raw palette, not hex,
not slash-opacity — they are simply *undefined*, which Tailwind treats as "emit
nothing" rather than an error. Same family as the StatusDot and slash-opacity
traps: **a class that silently compiles to nothing.**

Its three preview cells are deliberately left `needs-work` rather than worked
around — the compositions are correct product UI, and re-running the loop for
`Switch` alone after the component is fixed should flip them to `good` with no
preview edit. Fixing app source was out of scope for this run.

**Standing recommendation:** a guard asserting that every class referenced in
`apps/*/src` actually emits CSS in the built stylesheet would have caught all
three of these bugs (Switch, StatusDot, and the `bg-background`/
`text-muted-foreground` strays). `scripts/verify-admin-semantic-css.cjs` already
does exactly this for the admin app — the web app has no equivalent.

## Component-authoring findings (folded from all eight batches)

**Charts (recharts) DO render statically.** A preview must import `BarChart`/`Bar`/
`XAxis` from `recharts` directly (a second ~960KB copy per preview). That is safe
because recharts' `findAllByType` matches children by **`displayName` string, not
reference**, so the bundle's `ChartTooltip`/`ChartLegend` are still recognised
across the copy. Requires `className="h-72 w-full"` on `ChartContainer` (it wraps
`ResponsiveContainer` in `aspect-video` and measures 0 otherwise) and
`isAnimationActive={false}` on every series. Tooltips render with zero interaction
via `defaultIndex` — recharts calls `displayDefaultTooltip()` in `componentDidMount`.

**TanStack table:** `getCanSort()` requires `!!column.accessorFn`, so a
`{id, header, cell}` ColumnDef makes `DataTableColumnHeader` silently render plain
text with no sort affordance. The rows-per-page `Select` only offers 10/20/50 — any
other `pageSize` leaves an empty trigger.

**`PhoneFrame` takes NO children** — its only content prop is `src`, and it renders
an `<iframe>` inside fixed 430x932 chrome. Pass a self-contained `data:text/html;…`
document. (The `.d.ts` does not make this obvious.)

**Text-family `size` is inert unless the resolved variant is `heading`** — it does
nothing on `Paragraph`/`Caption`/`Code`/`UiLabel`/`Text variant="body"`. `color`/
`background` fall through to raw CSS strings (the only route to a status tone).
`Box` has no `flex` prop and `Stack` has no `maxWidth`; unknown props land as
invalid DOM attributes and silently do nothing.

**Capture budget:** cells get ~852x652 (`fullPage:false` at 900x700, 24px padding).
At the **18px root**, NavRail rows are 49.5px, so a 12-item sidebar needs ~1000px —
and its list is `overflow-y-auto` with the scrollbar hidden, so it clips
**silently**: a capture can look plausible while whole sections are absent. Verify
tall components against `_screenshots/raw/*.png`, not the sheet (which scales ~0.74
and hides small clipping).

**`position: fixed` is already contained** — `emit.mjs` puts `translateZ(0)` on
`.ds-cell`/`.ds-single`, so `BulkActionBar` pins to the story, not the viewport.
`lucide-react` imports work in previews (`story-imports.mjs` bundles them).
`cardMode: single` costs no exports — capture shoots every export via `?story=`.

**Token gap for charts:** `--status-success` and `--status-info` are
indistinguishable in a chart (green-700 vs teal-700). The token layer has no
categorical or sequential chart scale (see `token_layer_has_no_categorical_or_dark_scale`),
so series need coral/green/grey and escalating buckets need raw `--gold-500`/
`--orange-600`.

**Deliberately NOT changed:** `ChartLegend`, `ChartStyle` and `ChartTooltip` carry
no `cardMode: "column"` override. Their cards were authored at `max-w-xs` to suit
grid mode and read correctly; adding the override would re-key their grades for no
visual gain. Add it only alongside re-authoring them to `w-full`.

---

# Final state (2026-09-02)

**147 components · 357 cells graded good · 5 needs-work · validate exit 0 ·
render check 147/147 clean (0 bad, 0 thin, 0 variants-identical, 0 floor cards).**

The 5 outstanding cells are documented blocks, not sync defects:
- `Switch` (3) — the component renders broken in production (zero-CSS classes,
  above). The compositions are correct; re-run the loop for `Switch` alone after
  the component is fixed and they should flip to good with no preview edit.
- `PageHeaderHelpButton` (2) — returns null unless an unexported
  `HelpWidgetProvider` is present AND `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED==='true'`
  (defaults to false in `.env.example:272`). Forcing it on would showcase a
  feature that ships disabled. Cards show real placement with a caption naming
  the gate.

## Re-sync risks — what can silently go stale

1. **Everything under `.design-sync/entry/dist/` is generated AND gitignored**,
   including the load-bearing `node_modules` symlink. A fresh clone MUST run
   `./.design-sync/build.sh` before the converter. Skipping it degrades CVA props
   silently rather than failing.
2. **`.ds-sync/` is staged from the skill and gitignored, but the repo-specific
   scripts are COMMITTED at `.design-sync/scripts/`** (`gen-barrel`, `gen-config`,
   `gen-vocabulary`, `disambiguate-dts`, `find-dup-decls`, `find-dup-types`,
   `find-crosslayer-props`, `check-css-coverage`, `enum-exports`, `enum-ui`).
   `build.sh` copies them into `.ds-sync/` on every run, so a fresh clone works.
   **Edit the copies under `.design-sync/scripts/`** — anything edited directly in
   `.ds-sync/` is overwritten on the next build and lost on the next clone.
3. **The barrel and config are GENERATED** from `.app-exports.json` /
   `.ui-exports.json`. Adding or removing any component in
   `apps/web/src/components/{ui,shared}` or `packages/ui` silently changes the
   count. Re-run the enumerators; never hand-edit the barrel.
4. **Collision policy is encoded in THREE places** — `gen-barrel.mjs`,
   `gen-config.mjs`, `disambiguate-dts.mjs`. A newly-introduced duplicate name must
   be added to all three or extraction silently picks the wrong layer again. The
   two guards in `build.sh` are the safety net; do not remove them.
5. **`dtsPropsFor` entries drift from source.** `EmptyState` and `NavRail` are
   hand-written because extraction flattened a discriminated union / dropped local
   types. If those components' props change, the shipped contract will be a
   confident lie. Re-read both sources on any re-sync.
6. **The vocabulary is derived from `apps/web/tailwind.config.ts`.** A new colour
   family or scale there needs no action (`gen-vocabulary` re-reads it), but a
   RENAMED family silently drops the old classes from the sheet.
7. **Only measured on this machine, this once:** chromium 1208 via playwright
   1.58.2; a stray `/Users/jphilistin/node_modules` polluting resolution. Neither
   is reproducible elsewhere by construction.
8. **Not verified:** the uploaded project renders correctly in the real
   claude.ai/design pane — the upload never ran (no `/design-login`). Everything
   here is verified locally only.
