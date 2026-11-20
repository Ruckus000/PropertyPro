# Welcome photo library and picker — design

Date: 2026-11-20 · Status: draft for approval · Visual board: https://claude.ai/artifact/UPCYFRA414upBgNYHhgLgv

## Why

Association websites look bland. The four looks (Bayfront, Heritage, Palm Grove, Plain & Simple)
ship with only two stock photos for the welcome section (the hero), Heritage reuses Bayfront's,
and both photos show condo towers, which the original looks decision (D3) said to avoid so an
association never mistakes a stock photo for its own building. A manager whose welcome has no
photo can only upload one; there is no way to choose from ours.

Already done on this branch (`6f86983ce`): switching to a different look gives a kept welcome with
no photo of its own the new look's photo. This design widens which photos count as "not the
manager's own" and adds the library and a picker.

## Goals

1. A shared library of 13 Florida scenery photos (approved on the board), any of which any look can use.
2. Each photo look names a default and two suggestions:
   - Bayfront: **Pilings at dusk** (default), Gulf sunset, Morning shoreline.
   - Heritage: **Live oak avenue** (default), Lake reflection, Royal palms.
   - Palm Grove: **Palm walk** (default), Sea oats, Palms against the sky.
   - Plain & Simple: no default and no suggestions. It ships without a photo, but draws one below
     the words whenever the welcome has one (`LookHero`'s `text` style; pinned in `looks.test.tsx`).
   - In the library only under "More photos": Marsh at sundown, Dune at sunset, Mangrove boardwalk, Sailboats at anchor.
3. A photo picker in the welcome section's Photos field, so a manager chooses between stock photos.
4. The look switch follows the user's rule: **a photo the manager uploaded always stays; a stock
   photo may be swapped for the new look's default.**

## Non-goals

- Photos in sections other than the welcome (text, image, gallery blocks keep upload-only).
- Searching Unsplash or any outside service from the app; the library is a fixed, curated set.
- Per-community or per-portfolio custom libraries.
- Changing the four looks' layouts, colours or fonts.

## Anti-goals (a failure even if it works)

- Any upload is ever replaced or removed by a look switch or the picker without the manager acting on that photo.
- A stock photo's alt text describes a different picture than the one shown.
- Photos loaded at runtime from Unsplash (hotlinking, third-party requests from association sites).
- A photo showing people, a recognisable building, cars or signs.
- A full-width hero that looks soft because the file is too small.

## Constraints

- `heroBlockSchema` is `.strict()` and stores a stock photo as `{ stock: <id>, alt }`; ids are the
  `STOCK_PHOTO_IDS` enum in `packages/shared/src/site-blocks/stock-photos.ts`. Stored ids must stay
  valid forever (rows are never rewritten by this change), so `sunset` and `palms` stay in the enum.
- Stock photos are served from `apps/web/public/site-looks/`, never copied to storage (paths must
  match `^\d+/(logo|hero|content)/`).
- `packages/shared` and `apps/web/src/lib/site-looks/looks.ts` stay free of database imports
  (looks.test.ts walks the import graph).
- Editor rules from `.claude/rules/design.md`: shadcn Dialog from `packages/ui`, 44px touch targets
  below `md`, visible focus, no raw colours (`guard:design-tokens`), classes must resolve
  (`guard:class-resolution`).
- Production today (measured 2026-11-20): exactly two heroes use stock photos, both demo
  communities (Sunset Condos `sunset`, Palm Shores HOA `palms`). The login page also shows
  `/site-looks/sunset.webp` directly.

## Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | **One shared library**; each look lists a default and two suggestions | Simple to grow; any look can use any photo; defaults stay per look | **Chosen by the user** |
| B | A separate set per look, picker shows only that look's | More curated, but duplicates photos and limits choice | Rejected |

For the two retired photos:

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| R1 | Point `sunset`/`palms` at new files | Stored alt text ("Sunset over the water, with palm trees…") would describe the wrong picture | **Rejected** (breaks an anti-goal; this reverses what was said in chat before checking) |
| R2 | Keep both files and ids; mark them retired: not offered in the picker, not a look default, still rendered where stored | Two extra files kept; old rows keep correct alt text; demo reseeds pick up new defaults | **Chosen** |
| R3 | Data repair rewriting the two rows | Prod repair for two demo rows the nightly reset rewrites anyway | Rejected |

## Design

### 1. The library (`packages/shared/src/site-blocks/stock-photos.ts`)

- `STOCK_PHOTO_IDS` grows to 15: the 13 new ids (`pilings-dusk`, `gulf-sunset`, `shoreline`,
  `oak-avenue`, `lake-reflection`, `royal-palms`, `palm-walk`, `sea-oats`, `palm-sky`,
  `marsh-sunset`, `dune-sunset`, `mangrove-boardwalk`, `sailboats`) plus retired `sunset`, `palms`.
- One record per photo replaces the three parallel maps: `name` (what the picker shows), `alt`
  (default description, as on the board), `retired: boolean`, and `source` (Unsplash photo URL and
  photographer, for the credits file and a test).
- `PICKABLE_STOCK_PHOTO_IDS`: the non-retired ids, in the board's library order.
- The approved sources (each checked 2026-11-20 as "Free Photo" under the Unsplash License, not
  Unsplash+; all at least 3,264px wide). The builder reads each photographer's name from its page
  for `CREDITS.md` and re-confirms the licence there:

  | id | Unsplash page | images.unsplash.com id |
  |---|---|---|
  | `pilings-dusk` | https://unsplash.com/photos/M5fmqx88VcY | `photo-1628651102070-2df2c7d93f51` |
  | `gulf-sunset` | https://unsplash.com/photos/sLUwiXCRHJU | `photo-1515169697243-2d43bcd586f6` |
  | `shoreline` | https://unsplash.com/photos/XPeTOMKP8TE | `photo-1608643886078-ccd9c7ebcca3` |
  | `oak-avenue` | https://unsplash.com/photos/gCz68Y5kEuM | `photo-1782011042799-8028dd02ef54` |
  | `lake-reflection` | https://unsplash.com/photos/mD_Q_sGubDU | `photo-1669858692515-1a52a9f365d1` |
  | `royal-palms` | https://unsplash.com/photos/naSE7F3bIvs | `photo-1760324457092-fde98cc87cda` |
  | `palm-walk` | https://unsplash.com/photos/FU7EJKjo2os | `photo-1625698939138-a064465b1931` |
  | `sea-oats` | https://unsplash.com/photos/g1-nbV4vVY0 | `photo-1775191232786-5886de72de70` |
  | `palm-sky` | https://unsplash.com/photos/HMgrM8ubOGY | `photo-1666310254863-d231c6ba5b4e` |
  | `marsh-sunset` | https://unsplash.com/photos/TyVPvSuzkfU | `photo-1662427580294-9c3a2b8725ec` |
  | `dune-sunset` | https://unsplash.com/photos/2xO9UwSWzHI | `photo-1759499368675-b9997dbaa558` |
  | `mangrove-boardwalk` | https://unsplash.com/photos/fSCfNl0cdw0 | `photo-1779721464169-f99845792b9b` |
  | `sailboats` | https://unsplash.com/photos/em6exGT4o50 | `photo-1777823832189-d450542369fb` |
- The `ponytail:` marker in this file and in `HeroPhotosField.tsx` ("two stock photos only") is
  removed: its trigger has fired.

### 2. Files (`apps/web/public/site-looks/`)

- Per new photo, three WebP sizes generated with `sharp`: `<id>.2400.webp` (hero, full width),
  `<id>.1200.webp` (hero on small screens, split/card heroes), `<id>.480.webp` (picker and inspector
  thumbnails). Landscape, cropped 3:2. Quality ~72. Expected total ~6 MB in git.
- `scripts/build-stock-photos.ts` (committed) downloads each source from `images.unsplash.com` by its
  recorded id at full size and writes the three files, so the set is reproducible. Run by hand, not
  in CI.
- `apps/web/public/site-looks/CREDITS.md`: photographer, Unsplash link, licence per photo.
- `sunset.webp` and `palms.webp` stay as they are (one size each).

### 3. Rendering (`hero-photo-img.ts`)

- A new-library stock photo gets `src` = 2400 file, `srcSet` = 1200w and 2400w, `sizes` per look
  (`100vw` for Bayfront's full-bleed hero, half width for Heritage's split), width/height = 2400×1600.
- Retired photos keep today's single-file attributes.
- `hero-photo-img.test.ts` keeps reading the real files' dimensions.

### 4. Look defaults (`apps/web/src/lib/site-looks/looks.ts`)

- Each look definition gains `suggestedPhotos: readonly StockPhotoId[]` (default first; empty for
  Plain & Simple). The hero section's `photos` default is `[{ stock: suggestedPhotos[0], alt }]`.
- New sites, look previews and the look switch all read the new defaults, so demo communities pick
  them up on their next reset.

### 5. Look switch rule (amends `6f86983ce`)

- **Forward switch:** a kept, parseable hero whose photos are **all stock photos (any id, retired
  included) or none** takes the incoming look's default photo, keeping its words. A hero with at
  least one upload, or the legacy single image, is left exactly as it is. A look with no photo
  (Plain & Simple) leaves the hero alone: **decided by the user, a stock photo keeps showing under
  Plain & Simple**, below the words, rather than being removed by the switch.
- **Several stock photos (my call):** a hero holding a strip of only stock photos is treated like
  one: it becomes the incoming look's single default. Stock photos are ours, not the manager's, so
  the strip is not theirs to keep across a look change; the way back restores the live strip.
- **"Untouched" ignores stock photos (my call):** when deciding whether a hero is an untouched
  default (`isUntouched`), its stock photos are left out of the comparison. So a manager who only
  picked a different stock photo, and a hero stored with a look's previous default photo (Bayfront's
  retired `sunset`), still count as untouched and take the incoming look's whole hero, words
  included. Only the words, the call to action and uploads make a hero "edited". Without this, the
  picker would quietly turn a hero into "edited", and the switch summary would tell the manager so.
- **Back to the live look:** a hero showing only stock photos gets the live row's photos back when
  the live row shows no upload. A hero edited to have no photo stays that way (a switch never takes
  a photo away). This replaces the "exactly a look's own set" test (`isLookPhotoSet`) with
  "only stock photos".
- Unchanged: picking the live look with nothing drafted, and re-picking the drafted look, change
  nothing. A manager with no photo uses the picker instead.

### 6. The picker (editor)

- **Entry points** in `HeroPhotosField`:
  - On a stock photo's row, "Change photo" (replaces today's "Use the … photo instead" toggle). It
    replaces that photo in place, with the chosen photo's default alt text.
  - "Choose one of our photos" next to the upload control, shown whenever the list has room
    (`MAX_HERO_PHOTOS`). It appends the chosen photo.
  - Upload, alt text, reorder, remove and "Replace with your own" stay as they are.
- **Dialog** (`StockPhotoPicker`, packages/ui Dialog, size lg): title "Choose a photo", subtitle
  "Your site uses <look>". Two groups: "Suggested for <look>" (the drafted-or-live look's three)
  and "More photos" (the rest of the pickable library). Under Plain & Simple there is no suggested
  group: the whole library shows under one "Our photos" heading. On a site still on a legacy layout
  (Tidewater, Boulevard, Sable) the picker behaves the same way, with no suggested group.
- Each choice is a toggle button (`aria-pressed`) with a 480 thumbnail and the photo's name; the
  photo in use is marked "In use". Footer: Cancel and one filled "Use this photo", disabled until a
  different photo is selected. Keyboard: Tab through choices, Space/Enter selects, Esc closes, focus
  returns to the opener.
- Thumbnails load lazily. 44px minimum targets below `md`.
- Retired photos never appear; a hero still showing one shows "Change photo" like any stock photo.

### 7. Copy

- LookChooser line: "Sections you've edited stay as they are, but our photos in your welcome
  change to the new look's. Photos you uploaded always stay."
- Help article `website-design.mdx`: same rule, plus a short "Choose one of our photos" step in the
  welcome section article.

## Testing

- Shared: every pickable id has a name, alt, source and three files; retired ids have one file;
  every look's suggestions are pickable and non-duplicated; Plain & Simple has none.
- Planner (`looks.test.ts`): the forward and back-to-live cases above, including a retired `sunset`
  hero switching to Palm Grove → Palm walk; mixed upload + stock stays; property test in
  `site-look-service.test.ts` stays green.
- Picker (jsdom): opens from both entry points, suggested group matches the look, selection,
  replace vs append, disabled "Use this photo", Esc and focus return, no retired photos listed.
- Rendering: srcset/sizes per look; retired photos unchanged.
- Axe on the dialog; `guard:design-tokens`, `guard:class-resolution`, perf budget (`pnpm perf:check`)
  since the editor bundle grows.
- Manual: the website editor in the agent sandbox at 1440 and 375, one photo per look.

## Left to the builder

- Exact WebP quality and crop focal points per photo (keep a calm lower third for Bayfront).
- Whether `StockPhotoPicker` lives under `site-editor-v3/inspector/forms/fields/` or `components/shared`.
- The `sizes` strings per hero style.
