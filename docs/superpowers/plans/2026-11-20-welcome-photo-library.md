# Welcome Photo Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 13-photo shared stock library for the website looks' welcome section (hero), per-look default and suggested photos, a stock photo picker in the editor, and the look-switch rule "uploads stay, stock photos follow the look".

**Architecture:** The library is data in `packages/shared` (ids, names, alt text, retired flag, source) plus WebP files in `apps/web/public/site-looks/` built by a committed `sharp` script. Looks name their suggestions in `apps/web/src/lib/site-looks/looks.ts`, whose pure planner applies the switch rule. The editor gets a `StockPhotoPicker` dialog opened from `HeroPhotosField`.

**Tech Stack:** TypeScript, Zod, Next.js 15 / React 19, shadcn Dialog from `packages/ui`, Vitest (node + jsdom projects), `sharp` (root devDependency).

**Spec:** `docs/superpowers/specs/2026-11-20-welcome-photo-library-design.md` (approved 2026-11-20). Visual board: https://claude.ai/artifact/UPCYFRA414upBgNYHhgLgv

## Global Constraints

- Stored stock ids stay valid forever: `sunset` and `palms` remain in `STOCK_PHOTO_IDS`, marked retired, with their existing single files and alt text unchanged.
- Uploads (`{ path }`) and the legacy `heroImagePath` are never replaced or removed by a look switch or the picker unless the manager acts on that photo.
- Photos are served only from `apps/web/public/site-looks/`; nothing loads from Unsplash at runtime.
- `packages/shared` and `apps/web/src/lib/site-looks/looks.ts` import nothing that reaches the database (`looks.test.ts` walks the graph).
- Editor UI: packages/ui `Dialog`; controls 44px below `md` (`min-h-11 md:min-h-0` on raw buttons); visible focus; semantic token classes only (`guard:design-tokens`, `guard:class-resolution`).
- Plain & Simple has no default or suggestions, and a switch to it leaves the hero's photos as they are (user decision).
- Run single test files with `pnpm test <path>` (never `pnpm test -- <path>`); redirect output to a file before grepping it.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A hero already at `MAX_HERO_PHOTOS` (8): "Choose one of our photos" is not offered, while "Change photo" on a stock row still works. Test owned by Task 7.
2. A hero showing a retired photo (`sunset`): the picker lists no retired photo, marks nothing "In use", and choosing replaces the retired photo in place. Tests owned by Tasks 6 and 7.
3. An upload staged to replace a stock photo (`replaces`), then that stock photo is changed in the picker: the staged upload follows to the new stock id, as it did with the old swap. Test owned by Task 7.
4. A site on a legacy layout (Tidewater, Boulevard, Sable) or with design data still loading: `lookId` is `null`, the picker shows the whole library under "Our photos" and does not crash. Test owned by Task 6.
5. Adding a stock photo already in the list: a photo already in the hero is disabled when adding (no duplicate rows), as the old swap avoided duplicates. Test owned by Task 6.

---

### Task 1: The stock photo library in `packages/shared`

**Files:**
- Modify: `packages/shared/src/site-blocks/stock-photos.ts`
- Modify: `packages/shared/src/site-blocks/index.ts`, `packages/shared/src/index.ts` (exports)
- Test: `packages/shared/__tests__/site-blocks/stock-photos.test.ts`

**Interfaces:**
- Produces:
  - `STOCK_PHOTO_IDS` = `['pilings-dusk','gulf-sunset','shoreline','oak-avenue','lake-reflection','royal-palms','palm-walk','sea-oats','palm-sky','marsh-sunset','dune-sunset','mangrove-boardwalk','sailboats','sunset','palms'] as const`; `type StockPhotoId`.
  - `interface StockPhotoEntry { name: string; alt: string; retired: boolean; source: { page: string; imageId: string } | null }` (`source` null only for the two retired photos).
  - `STOCK_PHOTOS: Readonly<Record<StockPhotoId, StockPhotoEntry>>`.
  - `PICKABLE_STOCK_PHOTO_IDS: readonly StockPhotoId[]` — the 13 non-retired ids in the order above.
  - `type StockPhotoWidth = 480 | 1200 | 2400`; `stockPhotoSrc(id: StockPhotoId, width: StockPhotoWidth): string` → `/site-looks/<id>.<width>.webp`, and `/site-looks/<id>.webp` for a retired id at any width.
  - Kept for existing callers, now derived: `STOCK_PHOTO_ALT[id] = STOCK_PHOTOS[id].alt`; `STOCK_PHOTO_SRC[id] = stockPhotoSrc(id, 2400)`.
- Names and alt text, verbatim from the spec/board: `pilings-dusk` "Pilings at dusk" / "Old dock pilings in the bay at sunset, sailboats on the horizon"; `gulf-sunset` "Gulf sunset" / "The sun setting over calm open water"; `shoreline` "Morning shoreline" / "Gentle waves on a beach under a pastel morning sky"; `oak-avenue` "Live oak avenue" / "A lane under live oaks hung with Spanish moss"; `lake-reflection` "Lake reflection" / "Trees and clouds reflected in a still lake"; `royal-palms` "Royal palms" / "Royal palm trees seen from below against a clear blue sky"; `palm-walk` "Palm walk" / "A grassy path between rows of palm trees"; `sea-oats` "Sea oats" / "Sea oats on a white sand dune under a blue sky"; `palm-sky` "Palms against the sky" / "A row of tall palm trees against a soft evening sky"; `marsh-sunset` "Marsh at sundown" / "The sun setting over a marsh, reflected in still water"; `dune-sunset` "Dune at sunset" / "Sea oats silhouetted against an orange sunset"; `mangrove-boardwalk` "Mangrove boardwalk" / "A wooden boardwalk beside a mangrove-lined river"; `sailboats` "Sailboats at anchor" / "Two sailboats at anchor on calm water near a wooded shore"; `sunset` "Sunset over the water" / existing alt; `palms` "Palm-lined street" / existing alt. Sources: the spec's table (`page` = Unsplash URL, `imageId` = the `photo-…` id).

- [ ] **Step 1: Rewrite the failing tests** in `stock-photos.test.ts`: replace "are exactly the sunset and the palm-lined street" and the `STOCK_PHOTO_SRC` equality with:
  - `expect([...STOCK_PHOTO_IDS]).toEqual([...13 new ids, 'sunset', 'palms'])`
  - `expect(PICKABLE_STOCK_PHOTO_IDS).toEqual(STOCK_PHOTO_IDS.filter((id) => !STOCK_PHOTOS[id].retired))` and `.toHaveLength(13)`; `STOCK_PHOTOS.sunset.retired === true`, `STOCK_PHOTOS.palms.retired === true`.
  - `stockPhotoSrc('palm-walk', 480) === '/site-looks/palm-walk.480.webp'`; `stockPhotoSrc('sunset', 1200) === '/site-looks/sunset.webp'`.
  - every pickable entry has a non-empty `name`, a `source.page` matching `^https://unsplash\.com/photos/[A-Za-z0-9_-]+$` and `source.imageId` matching `^photo-\d+-[0-9a-f]+$`; retired entries have `source: null`.
  - `STOCK_PHOTO_ALT.sunset` and `.palms` still equal "Sunset over the water, with palm trees in silhouette" and "A quiet street lined with tall palm trees" (stored rows depend on them).
  - names are unique. Keep the existing "never looks like a storage path", "description passes `heroPhotoSchema`" and re-export tests, iterating every id and every width.
- [ ] **Step 2: Run** `pnpm test packages/shared/__tests__/site-blocks/stock-photos.test.ts > /tmp/t1.log 2>&1; echo $?` — expect `1`, failures on the new ids.
- [ ] **Step 3: Implement** the Interfaces above in `stock-photos.ts`; update its file comment (13 photos plus two retired; why retired photos keep their files and alt). Delete the `ponytail: two stock photos only` marker. Export the new names from both index files.
- [ ] **Step 4: Run** the same command — expect `0`. Then `pnpm --filter @propertypro/shared build` (apps read its `dist/`).
- [ ] **Step 5: Commit** `feat(shared): thirteen-photo stock library with two retired photos`.

### Task 2: The photo files, build script and credits

**Files:**
- Create: `scripts/build-stock-photos.ts`, `scripts/__tests__/build-stock-photos.test.ts`
- Create: `apps/web/public/site-looks/<id>.{480,1200,2400}.webp` for the 13 pickable ids (39 files)
- Create: `apps/web/public/site-looks/CREDITS.md`
- Test: `apps/web/__tests__/components/public-site/blocks/hero-photo-img.test.ts` ("stock photo files" block)

**Interfaces:**
- Consumes: `STOCK_PHOTOS`, `PICKABLE_STOCK_PHOTO_IDS`, `stockPhotoSrc`, `StockPhotoWidth` (Task 1).
- Produces: `stockPhotoDownloadUrl(imageId: string): string` → `https://images.unsplash.com/<imageId>?w=4000&q=90&fm=jpg` (exported for the test); `async function buildStockPhotos(outDir: string, ids?: readonly StockPhotoId[]): Promise<void>`; a `main()` gated by `isMainModule(import.meta.url)` that writes to `apps/web/public/site-looks` and accepts optional ids as argv.

- [ ] **Step 1: Write the failing tests.**
  - `scripts/__tests__/build-stock-photos.test.ts`: `stockPhotoDownloadUrl('photo-1625698939138-a064465b1931')` equals the URL above. No network and no files written inside the repo (verification.md's tree-write rule).
  - In `hero-photo-img.test.ts`, replace the "stock photo files" `it.each` with two: for every pickable id and each width W, the file at `stockPhotoSrc(id, W)` exists and `webpSize` is `{ width: W, height: W * 2 / 3 }`; for `sunset` and `palms`, the existing single files keep their current sizes.
- [ ] **Step 2: Run** both files with `pnpm test <path>` — expect failures (module missing; files missing).
- [ ] **Step 3: Implement** `scripts/build-stock-photos.ts`: for each id, `fetch` the download URL, then with `sharp` crop to 3:2 using `position: 'attention'` (override per id in a small map only where the default cut loses the subject; keep Bayfront's three with a calm lower third), resize to 2400, 1200 and 480 wide, encode `webp({ quality: 72 })`. Refuse (exit 2) if a source is under 2400px wide. Then run it: `pnpm exec tsx scripts/build-stock-photos.ts`. Open each 1200 file and check the crop; adjust `position` and rerun for any that look wrong.
- [ ] **Step 4: Write `CREDITS.md`**: one row per photo with its name, photographer (read from its Unsplash page while there; also re-confirm the page says "Free to use under the Unsplash License"), and page URL. One line above the table naming the Unsplash License and noting no credit is required.
- [ ] **Step 5: Run** both tests — expect pass. `du -sh apps/web/public/site-looks` — expect under ~8 MB; note the figure in the commit.
- [ ] **Step 6: Commit** script, test, 39 files and CREDITS.md: `feat(web): stock photo files built from the Unsplash sources`.

### Task 3: Rendering stock photos at the right size

**Files:**
- Modify: `apps/web/src/components/public-site/blocks/hero-photo-img.ts`
- Test: `apps/web/__tests__/components/public-site/blocks/hero-photo-img.test.ts`

**Interfaces:**
- Consumes: `stockPhotoSrc`, `STOCK_PHOTOS` (Task 1).
- Produces: `STOCK_PHOTO_SIZE: Record<StockPhotoId, {width, height}>` — 2400×1600 for pickable ids, existing values for retired; `heroPhotoImgAttributes(photo)` unchanged signature.

- [ ] **Step 1: Failing test** replacing "serves a stock photo from the site, with its own size and no srcset": for `{ stock: 'palm-walk', alt: 'x' }` expect `{ src: '/site-looks/palm-walk.2400.webp', srcSet: '/site-looks/palm-walk.1200.webp 1200w, /site-looks/palm-walk.2400.webp 2400w', sizes: '100vw', alt: 'x', width: 2400, height: 1600 }`; for `{ stock: 'sunset', alt: 'y' }` expect today's shape (single src, no `srcSet`, `{1440,1080}`).
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/public-site/blocks/hero-photo-img.test.ts` — expect FAIL on the pickable case.
- [ ] **Step 3: Implement** in `heroPhotoImgAttributes`: a pickable stock photo returns the srcset above with `sizes: '100vw'` (the looks' `HeroImg` already overrides `sizes` per hero style when a srcset exists); a retired one returns as today. Update the file comment ("a stock photo is one file" is no longer true).
- [ ] **Step 4: Run** this file and `apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx`, `apps/web/__tests__/components/public-site/layouts/looks.test.tsx` — expect pass (fix only expectations that pinned the old single-file shape for the old ids).
- [ ] **Step 5: Commit** `feat(web): stock hero photos get a srcset`.

### Task 4: Each look's suggested photos

**Files:**
- Modify: `apps/web/src/lib/site-looks/looks.ts`
- Test: `apps/web/__tests__/lib/site-looks/looks.test.ts` ("the looks registry" block); expectation updates in `apps/web/__tests__/lib/services/new-community-site.test.ts`, `apps/web/__tests__/lib/services/site-look-service.test.ts`, `apps/web/__tests__/app/public-site/site-preview-page.test.tsx`, `apps/web/__tests__/lib/public-site/preview-overrides.test.ts`, `apps/web/__tests__/integration/new-community-look.integration.test.ts`, `apps/web/__tests__/integration/site-look-switch.integration.test.ts`, `packages/db/__tests__/reset-demo.integration.test.ts` (wherever they pin `sunset`/`palms` as a look default)

**Interfaces:**
- Consumes: `StockPhotoId`, `STOCK_PHOTO_ALT`, `PICKABLE_STOCK_PHOTO_IDS` (Task 1).
- Produces: `LookDefinition.suggestedPhotos: readonly StockPhotoId[]` — bayfront `['pilings-dusk','gulf-sunset','shoreline']`, heritage `['oak-avenue','lake-reflection','royal-palms']`, palm-grove `['palm-walk','sea-oats','palm-sky']`, plain-simple `[]`. Each photo look's hero `photos` is `[{ stock: suggestedPhotos[0], alt: STOCK_PHOTO_ALT[suggestedPhotos[0]] }]`.

- [ ] **Step 1: Failing tests** in the registry block: each look's `suggestedPhotos` equals the lists above; every suggested id is in `PICKABLE_STOCK_PHOTO_IDS`; no look suggests the same id twice; each photo look's hero `photos` is exactly its first suggestion with that photo's alt; plain-simple's hero has no `photos`.
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/lib/site-looks/looks.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `suggestedPhotos` and build the hero photo from it (replace the `SUNSET`/`PALMS` constants). Update the D3 comment: the defaults are now per look and none is shared.
- [ ] **Step 4: Run** the registry block, then every test file listed above (integration files with `pnpm test:integration:local <path>`). Update only expectations that pin the old default photo; any other failure stops the task.
- [ ] **Step 5: Commit** `feat(web): each photo look names its default and two suggested photos`.

### Task 5: The switch rule — uploads stay, stock photos follow the look

**Files:**
- Modify: `apps/web/src/lib/site-looks/looks.ts` (the "A kept hero's photo" section, `isUntouched`)
- Test: `apps/web/__tests__/lib/site-looks/looks.test.ts` (`describe("a kept hero's photo")`), `apps/web/__tests__/lib/services/site-look-service.test.ts` (property test must stay green)

**Interfaces:**
- Replaces `isLookPhotoSet`, `showsNoPhotoOfItsOwn`, `showsLookPhotos` (added in `6f86983ce`) with:
  - `onlyStockPhotos(content: unknown): boolean` — parseable, visible hero whose resolved photos are all stock (none counts).
  - `showsStockPhotos(content: unknown): boolean` — `onlyStockPhotos` and at least one photo.
- `withLookPhotos(section, photos)` fills when `onlyStockPhotos`; `withPhotosOf(section, row)` restores when `showsStockPhotos(section)` and `onlyStockPhotos(row)`.
- `isUntouched`: for a hero whose content is `onlyStockPhotos`, compare with `photos` removed on both sides (the defaults' heroes are stripped the same way in `defaultsByType`).

- [ ] **Step 1: Failing tests** (use the existing `heroAfter`, `roundTrip`, `livePage`, `EDITED_HERO`, `heroPhotosOf` helpers):
  - `'a hero showing a retired stock photo takes the incoming look's default'`: `heroAfter({...EDITED_HERO, photos:[{stock:'sunset', alt: STOCK_PHOTO_ALT.sunset}]}, palmGrove)?.content` equals `{...EDITED_HERO, photos: heroPhotosOf(palmGrove)}`.
  - `'a stock photo the manager picked is swapped for the incoming look's default'`: `sea-oats` on EDITED_HERO → heritage → heritage's photos.
  - `'a strip of only stock photos becomes the incoming look's single default'`: three stock photos → heritage → `heroPhotosOf(heritage)` (length 1).
  - Change the existing `"a hero showing the manager's own photo keeps it"`: keep the upload and legacy cases; replace the all-stock `mixed` case with an upload + stock strip, which stays exactly as it was.
  - `'switching to Plain & Simple keeps a stock photo'`: `{...EDITED_HERO, photos: heroPhotosOf(bayfront)}` → plainSimple → unchanged.
  - `'a hero that differs from its look's default only in its stock photo is untouched'`: Bayfront's sections with the hero's photos set to `[{stock:'sea-oats', ...}]` → heritage → `toEqual(asPlanned(heritage.sections))`. Same for photos `[{stock:'sunset', ...}]` (a hero stored with Bayfront's previous default).
  - `'returning to the live look restores a live strip of stock photos'`: live hero `{...EDITED_HERO, photos:[sea-oats, sailboats]}` → palmGrove → back: `back.sections` equals `rowsOf(live)`, nothing staged.
  - Keep `'a hero edited to show no photo stays that way on the way back'` and the round-trip cases green.
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/lib/site-looks/looks.test.ts` — expect the new cases red.
- [ ] **Step 3: Implement** the Interfaces above; rewrite the section comment to state the user's rule ("a photo the manager uploaded always stays; a stock photo may be swapped for the new look's default") and the strip and untouched calls from the spec.
- [ ] **Step 4: Run** `looks.test.ts`, `site-look-service.test.ts`, `site-preview-page.test.tsx`, `preview-overrides.test.ts` — expect pass.
- [ ] **Step 5: Revert-check.** Replace the `onlyStockPhotos` call in `withLookPhotos` with `false`; confirm the swap cases go red and the upload cases stay green; restore. Do the same for the stripping in `isUntouched`. Record both in the commit message.
- [ ] **Step 6: Commit** `feat(web): look switch swaps any stock photo, never an upload`.

### Task 6: The `StockPhotoPicker` dialog

**Files:**
- Create: `apps/web/src/lib/site-looks/chosen-look.ts`, `apps/web/src/hooks/use-chosen-look.ts`
- Create: `apps/web/src/components/pm/site-editor-v3/inspector/forms/fields/StockPhotoPicker.tsx`
- Modify: `apps/web/src/components/pm/site-editor-v3/panels/LookChooser.tsx` (use `chosenLookId`)
- Test: `apps/web/__tests__/lib/site-looks/chosen-look.test.ts`, `apps/web/__tests__/components/pm/site-editor-v3/StockPhotoPicker.test.tsx`

**Interfaces:**
- Consumes: `STOCK_PHOTOS`, `PICKABLE_STOCK_PHOTO_IDS`, `stockPhotoSrc` (Task 1); `getLook`, `LookId`, `lookIdForLayout` (looks.ts); `suggestedPhotos` (Task 4); `useSiteDesign` (`apps/web/src/hooks/use-site-design.ts`).
- Produces:
  - `chosenLookId(design: SiteDesignRecord): LookId | null` — the drafted layout's look when a different layout is drafted, else the live layout's look; null for a legacy layout. LookChooser's `chosen` uses it.
  - `useChosenLookId(communityId: number): LookId | null` — null while loading or on error.
  - `StockPhotoPicker(props: { open: boolean; onOpenChange: (open: boolean) => void; lookId: LookId | null; replacing: StockPhotoId | null; inUse: readonly StockPhotoId[]; onChoose: (id: StockPhotoId) => void })`.

- [ ] **Step 1: Failing tests.**
  - `chosen-look.test.ts`: live bayfront, no draft → `'bayfront'`; live bayfront, draft heritage → `'heritage'`; live tidewater, no draft → `null`; live tidewater, draft palm-grove → `'palm-grove'`.
  - `StockPhotoPicker.test.tsx` (jsdom, render open):
    - `lookId: 'bayfront'`: a group named "Suggested for Bayfront" holds exactly Pilings at dusk, Gulf sunset, Morning shoreline in that order; "More photos" holds the other 10; no button names "Sunset over the water" or "Palm-lined street".
    - Heading "Choose a photo"; text "Your site uses Bayfront".
    - `lookId: null` and `lookId: 'plain-simple'`: no "Suggested for" group; one "Our photos" group with all 13.
    - `replacing: 'gulf-sunset'`: that choice shows "In use" and `aria-pressed="true"`; "Use this photo" is disabled until another choice is clicked; clicking Sea oats then "Use this photo" calls `onChoose('sea-oats')` once and `onOpenChange(false)`.
    - `replacing: 'sunset'` (retired): no choice shows "In use"; "Use this photo" disabled until a choice is clicked.
    - `replacing: null, inUse: ['palm-walk']`: Palm walk's button is disabled (Review Focus 5).
    - Escape calls `onOpenChange(false)`; Cancel does too, with no `onChoose`.
    - Each choice's image uses `stockPhotoSrc(id, 480)`, `loading="lazy"`, `alt=""`; the button's accessible name is the photo's name.
    - axe: no violations (follow the `site-editor-axe.test.tsx` pattern).
- [ ] **Step 2: Run** both files with `pnpm test <path>` — expect FAIL (modules missing).
- [ ] **Step 3: Implement.** `StockPhotoPicker`: packages/ui `Dialog` (via `@/components/ui/dialog`), `DialogContent` at the lg width (720px), `DialogTitle` "Choose a photo", `DialogDescription` "Your site uses <look name>" (omit when `lookId` is null). Choices are `<button type="button" aria-pressed>` in a responsive grid (2 columns below `sm`, 3 from `sm`), each a 3:2 thumbnail and the photo's name, `min-h-11 md:min-h-0`, selected state `ring-2 ring-interactive`. Footer: Cancel (`outline`) and "Use this photo" (the one filled button). Selection state resets to `replacing` each time it opens.
- [ ] **Step 4: Run** both files and `apps/web/__tests__/components/pm/site-editor-v3/LookChooser.test.tsx` — expect pass.
- [ ] **Step 5: Commit** `feat(web): stock photo picker dialog`.

### Task 7: Wire the picker into the welcome section's Photos field

**Files:**
- Modify: `apps/web/src/components/pm/site-editor-v3/inspector/forms/fields/HeroPhotosField.tsx`, `apps/web/src/components/pm/site-editor-v3/inspector/forms/HeroForm.tsx`
- Test: `apps/web/__tests__/components/pm/site-editor-v3/HeroPhotosField.test.tsx`, `apps/web/__tests__/components/pm/site-editor-v3/inspector-forms.test.tsx`

**Interfaces:**
- Consumes: `StockPhotoPicker`, `useChosenLookId` (Task 6); `STOCK_PHOTOS`, `stockPhotoSrc` (Task 1).
- Produces: `HeroPhotosFieldProps.lookId?: LookId | null` (default `null`). `HeroForm` passes `useChosenLookId(communityId)`.

- [ ] **Step 1: Failing tests** in `HeroPhotosField.test.tsx` (replace the swap tests, which pin "Use the … photo instead"):
  - A stock row shows a "Change photo" button and no "Use the … photo instead" button; its thumbnail src is `stockPhotoSrc(id, 480)`.
  - "Change photo" on row 2 of `[upload, {stock:'pilings-dusk'}, upload]`, then choosing Sea oats → `onChange` called with row 2 = `{ stock: 'sea-oats', alt: STOCK_PHOTO_ALT['sea-oats'] }`, other rows identical, focus returns to row 2's "Change photo".
  - "Choose one of our photos" with 2 photos, choosing Marsh at sundown → appended as the 3rd photo with its alt.
  - With 8 photos, "Choose one of our photos" is absent; "Change photo" on a stock row still opens the picker (Review Focus 1).
  - With `[{stock:'sunset', alt}]`, "Change photo" then Palm walk replaces it (Review Focus 2).
  - A file staged with "Replace the … photo with your own" on a `pilings-dusk` row, then "Change photo" → Gulf sunset: when the upload lands it takes the `gulf-sunset` row's place (Review Focus 3; mirrors the existing swap-follow test).
  - The picker receives `inUse` = the stock ids currently in the list.
  - In `inspector-forms.test.tsx`, mock `@/hooks/use-chosen-look` (`useChosenLookId: () => 'bayfront'`) and assert the Hero form renders "Choose one of our photos".
- [ ] **Step 2: Run** both files — expect FAIL.
- [ ] **Step 3: Implement.** Replace `swapTarget`/`swapStock` and the swap button with "Change photo" (outline, sm) opening the picker with `replacing` = that row's stock id; on choose, replace that row and call `followStockPhoto(from, to)`; announce "Photo changed to <name>." in the field's live region. Add "Choose one of our photos" (outline, sm) beside the upload control, shown while `remaining > 0`; on choose, append and announce "Added <name>.". Thumbnails use `stockPhotoSrc(id, 480)`; names come from `STOCK_PHOTOS[id].name` (delete `STOCK_PHOTO_NAME`). Delete the `ponytail:` marker on the swap. Update the component's doc comment.
- [ ] **Step 4: Run** both files, then `pnpm test apps/web/__tests__/components/pm/site-editor-v3` (whole folder, output to a file) — expect pass.
- [ ] **Step 5: Commit** `feat(web): choose or change a welcome photo from our library`.

### Task 8: Copy, help and the full check

**Files:**
- Modify: `apps/web/src/components/pm/site-editor-v3/panels/LookChooser.tsx` (one line), `apps/web/src/content/help/manager/website/website-design.mdx`, the help article that documents welcome photos (find it with `grep -rl "Photos" apps/web/src/content/help/manager/website`)
- Test: `apps/web/__tests__/help/website-editor-articles.test.ts`, `apps/web/__tests__/components/pm/site-editor-v3/LookChooser.test.tsx`

- [ ] **Step 1: Update copy**, verbatim from the spec: LookChooser line "Sets how your whole site is laid out. Sections you've edited stay as they are, but our photos in your welcome change to the new look's. Photos you uploaded always stay." The design article's switch paragraph says the same in one sentence each for stock and uploaded photos, and that Plain & Simple keeps whatever photo the welcome has. Add a "Choose one of our photos" step (open the welcome section, Photos, "Choose one of our photos" or "Change photo", pick, "Use this photo") to the welcome photos article.
- [ ] **Step 2: Run** the two test files — expect pass.
- [ ] **Step 3: Full check.** Each command's exit code checked on its own (no pipes): `pnpm exec turbo run typecheck --filter=@propertypro/web`; `pnpm typecheck` (scripts project); `node scripts/run-lint-guards.mjs` (all 34 pass); `pnpm test apps/web/__tests__/lib/site-looks apps/web/__tests__/components/public-site apps/web/__tests__/components/pm/site-editor-v3 packages/shared/__tests__/site-blocks scripts/__tests__/build-stock-photos.test.ts`; `pnpm build` then `pnpm perf:check` (the editor route grows by the picker; record before/after KiB).
- [ ] **Step 4: Browser check** in the agent sandbox (`pnpm agent:live:web`, `/dev/agent-login?as=root_sunset`): open the website editor at 1440 and 375 wide, switch Bayfront → Heritage → Palm Grove and confirm each default photo, open the picker from both entry points, choose a photo, and confirm the public preview shows it sharp at 1440. Screenshot each look.
- [ ] **Step 5: Commit** `docs(web): welcome photo library copy and help`.

---

## Self-review notes

- Spec coverage: library (T1), files and credits (T2), rendering (T3), look defaults (T4), switch rule incl. strip, untouched and Plain & Simple (T5), picker incl. legacy layouts and "Our photos" (T6), entry points (T7), copy (T8), retired photos kept with alt (T1, T3, T5 tests).
- Not built by design: photos in other sections, outside search, custom libraries (spec non-goals).
