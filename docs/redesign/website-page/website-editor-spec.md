# PM "Website" Editor — Deep Technical Spec (redesign hand-off)

> **Purpose of this document.** This is a self-contained reference for redesigning the
> property-manager–facing **Website** editor page. It captures the page's purpose, exact
> structure and copy, every conditional state, the Pro-gating rules, the full data/API/DB
> wiring, and the design-system constraints a redesign must honor. Pair it with the
> companion mockup `website-editor-mockup.html` (a faithful static render of today's design).
>
> Captured from source on branch `claude/website-page-docs-mockup-f67ruf`. Copy strings,
> field constraints, route paths and file paths below were read directly from the code and
> are reproduced verbatim.

---

## 1. Overview

| | |
|---|---|
| **What** | The editor a property manager uses to build and publish their community's **public website** (the statutory site shown at `{slug}.getpropertypro.com`). |
| **Route** | `/pm/settings/website?communityId=<id>` |
| **Nav label** | "Website" (community sidebar → *Management* section; also a PM-portal top-level item). Both entries are feature-gated on `hasSiteEditor`. |
| **Page file** | `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx` |
| **Component** | Async **React Server Component** (`WebsiteSettingsPage`). Loads all data server-side, then renders client components for each interactive region. |
| **Auth** | Must be authenticated **and** hold a PM manager role (`pm_admin` or `cam`, i.e. `PM_MANAGER_ROLES`) with membership in the target community. |
| **Feature gate** | The nav entry + page require `hasSiteEditor`. Three further Pro gates (`hasSitePolishBlocks`, `hasSiteCustomCss`, `hasSiteCustomDomain`) unlock sub-features. |
| **Container** | `<div className="mx-auto max-w-5xl px-6 py-8">` — a centered, ≤`max-w-5xl` (64rem) column inside the standard authenticated app shell. |

### The editor → published-site relationship

This page **edits a draft** of a block-model website. Each edit (hero, content block,
reorder, delete) writes into a **draft layer**; the sticky **Publish** bar promotes the
whole draft to the live site atomically. The published result renders at the community's
public host via a separate public-site route (`apps/web/src/app/public-site/page.tsx`) — out
of scope for this redesign, but it is the *consumer* of everything edited here.

### Statutory context (why this feature exists)

Florida **§718.111(12)(g)** (condos, 25+ units) and **§720.303** (HOAs, 100+ parcels)
require associations to maintain a website that posts official records (budgets, minutes,
meeting notices, rules). The Documents / Meetings / Announcements content blocks configured
on this page are how a community satisfies that posting requirement. PropertyPro presents
factual data only and provides no legal/engineering/financial advice — keep any redesign
copy free of assessments of adequacy or compliance guarantees.

---

## 2. Page anatomy

Top-to-bottom render tree of `page.tsx` (each row is a distinct visual region):

```
┌─ (app shell: sidebar + top bar + breadcrumbs — owned by the shell, not this page) ─┐
│  <div class="mx-auto max-w-5xl px-6 py-8">                                          │
│                                                                                     │
│   1. <WizardEntryBanner>        ── conditional: site_onboarding_completed_at IS NULL │
│                                                                                     │
│   2. Page header                                                                    │
│        <h1>Website</h1> + status pill (Live / Not published yet)                    │
│        subtitle + [Re-run onboarding] [Preview Draft]                               │
│                                                                                     │
│   3. <section> "Welcome"        → <HeroBlockForm>                                    │
│                                                                                     │
│   4. <ContentSectionsList>      → 0..n block cards + "+ Add …" button row           │
│        (9 block types; FAQ / Gallery / Amenities are Pro-gated)                      │
│                                                                                     │
│   5. <section> "Custom Styling" → <CustomStylingForm>   (Pro-gated: hasSiteCustomCss)│
│                                                                                     │
│   6. <section> "Custom Domain"  → <CustomDomainCard>    (Pro-gated: hasSiteCustomDomain)│
│                                                                                     │
│   7. <PublishBar>               ── sticky bottom; pending badge + Discard + Publish  │
│  </div>                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Every card/section is `rounded-md border border-default bg-surface-card p-6 shadow-e0`
(except the content-block cards, which use `p-4`, and the sticky publish bar, `p-4 shadow-e1`).
Sections are separated by `mt-8`. The page renders **no breadcrumb of its own** — the app
shell derives the trail from the URL + the page `<h1>` (see §7).

### Invalid-community fallback

If `communityId` is missing or not a positive integer, the page renders **only** a centered
fallback (`<main className="mx-auto max-w-lg px-6 py-16 text-center">`), not the editor:

- `<h1>` **"Select a Community"**
- `<p>` "Choose a community from the Communities list to customize its public site."
- Primary button-link **"Go to Communities"** → `/pm/dashboard/communities`

(Auth failure → redirect `/auth/login`; non-PM role → redirect
`/pm/dashboard/communities?reason=invalid-selection`.)

---

## 3. Section-by-section reference

> All copy below is **verbatim** from source. `…` is a real ellipsis character used in the
> code; `...` (three dots) is likewise reproduced where the code uses it — the inconsistency
> is called out in §8.

### 3.1 WizardEntryBanner — `components/pm/onboarding-wizard/WizardEntryBanner.tsx`

Pure server component. Renders **only when** `communities.site_onboarding_completed_at IS NULL`
(prop `showWizardBanner`). Not dismissible (no client state).

- Container: `div[role="status"][data-testid="wizard-entry-banner"]`, classes
  `mb-6 flex items-start gap-3 rounded-md border border-accent/40 bg-accent/10 p-4`.
- Left: `Sparkles` icon (`h-5 w-5 text-accent`).
- Body:
  - `<p class="text-sm font-medium text-content">` **"Your site is using default settings."**
  - `<p class="mt-1 text-sm text-content-secondary">` **"Run the 5-step onboarding wizard to
    pick a layout, a color palette, and write your welcome message. You can come back anytime."**
- Right: primary link button (`bg-interactive text-content-inverse`) **"Customize →"**
  (`data-testid="wizard-entry-banner-cta"`) → `/pm/onboarding/website?communityId=<id>`.

> ⚠️ `border-accent/40` / `bg-accent/10` are slash-opacity on the `--brand-accent` semantic
> token, which has no alpha channel → these emit **no color** in the live build (see §8). The
> banner today shows a near-invisible tint; the mockup renders the *intended* coral tint.

### 3.2 Page header

- Row (`flex flex-wrap items-center gap-3`):
  - `<h1 class="text-2xl font-semibold text-content">` **"Website"** (renders in the Fraunces
    display serif via the global `h1` rule).
  - **Status pill** — driven by `hasPublishedContent` (does any non-draft block exist?):
    - **Live** — `bg-status-success-bg text-status-success`, `CheckCircle2` icon (`h-3.5 w-3.5`) + "Live".
    - **Not published yet** — `bg-status-warning-bg text-status-warning`, `Clock` icon + "Not published yet".
    - Pill classes: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium`.
- Subtitle `<p class="mt-1 text-sm text-content-secondary">`:
  > Customize the welcome panel that visitors see at `[your-community].getpropertypro.com`. Use **Publish Website** at the bottom to make your changes live.

  (`[your-community].getpropertypro.com` is an inline `<code class="rounded bg-surface-muted px-1 py-0.5 text-xs">`; "Publish Website" is a `<strong>`.)
- Header actions (`flex shrink-0 items-center gap-2`), both secondary/bordered link buttons
  (`rounded-md border border-default bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-hover`):
  - **"Re-run onboarding"** (`data-testid="run-wizard-link"`) → `/pm/onboarding/website?communityId=<id>`. Always shown.
  - **"Preview Draft"** (`data-testid="preview-draft-link"`, `target="_blank"`) → `buildCommunityUrl(slug, '/?preview=true')`. Only when community info resolved.

### 3.3 "Welcome" section → HeroBlockForm — `components/pm/site-editor/HeroBlockForm.tsx`

Client component. Card `<section aria-labelledby="welcome-tab">` with `<h2>` **"Welcome"**.
`<form class="space-y-4 max-w-2xl">`. Inputs are `rounded-sm border border-default px-3 py-2`
with `focus:ring-2 focus:ring-interactive`.

| Field | Control | Constraints | Copy |
|---|---|---|---|
| Headline | `input[type=text]` | required, `maxLength 120` | label "Headline" + red `*` |
| Subtitle | `textarea rows=3` | optional, `maxLength 280` | label "Subtitle" |
| CTA text | `input[type=text]` | optional, `maxLength 40` | label "CTA text" |
| CTA target | `input[type=text]` | optional, `maxLength 512`, `placeholder="/auth/login"` | label "CTA target" (CTA text + target laid out in a 2-col grid) |

- Server error (on failure): `div[role="alert"]` red box with the message.
- Submit: primary button **"Save"** → **"Saving…"** while pending. **Disabled** when
  `headline.trim()` is empty or pending.
- Success side-effect: toast **"Welcome section saved."**
- Not editable here: hero image (`heroImagePath`/`heroImageAlt` are preserved from `initial`
  but there is no image field — see §8).

### 3.4 ContentSectionsList — `components/pm/site-editor/ContentSectionsList.tsx`

Client component. `<section aria-labelledby="content-sections">` with `<h2>` **"Content Sections"**.

**Query states:**
- Loading → `<p>` "Loading content sections…"
- Error → red `div[role="alert"]` "Failed to load content sections: {message}" + **"Try again"** button (`refetch`).
- Empty (no content blocks) → `<p>` "No content sections yet — add a text or image block below."

**Each existing block** → card `rounded-md border border-default bg-surface-card p-4`:
- Header row: left `<span class="text-xs text-content-secondary">` **"#{blockOrder} — {blockType}"**;
  right cluster of three `h-9 w-9` icon buttons (bordered):
  - `ChevronUp` — aria "Move {blockType} section up" (disabled when first / reordering)
  - `ChevronDown` — aria "Move {blockType} section down" (disabled when last / reordering)
  - `Trash2` (`text-danger`) — aria "Remove {blockType} section" (disabled while deleting)
- Below it, the matching per-type sub-form (§3.4.1).

**Remove flow:** `window.confirm("Remove this {blockType} section? If it's on your live site,
it stays visible until you publish.")`. Success toast is either
**"Removal staged — publish to take the section off your live site."** (`staged: true`) or
**"Section removed."**. Error toast: **"We couldn't remove this section. Please try again."**

**Adding a block:** clicking an add button reveals a **dashed-border** card
(`border-2 border-dashed`) with a `text-xs` header **"New {type} section #{n}"** (e.g. "New
text section #3", "New FAQ section #4") and the empty sub-form; `onSaved` clears the adding state.
`nextBlockOrder` = max existing order + 1 (hero is order 1, so the first content block is order 2).

**Add-section button row** (`flex flex-wrap gap-2 pt-2`, bordered pill buttons
`rounded-md border border-default px-3 py-1.5 text-sm`), in this order:

| Button | Gated? |
|---|---|
| `+ Add text section` | no |
| `+ Add image section` | no |
| `+ Add announcements section` | no |
| `+ Add documents section` | no |
| `+ Add meetings section` | no |
| `+ Add contact section` | no |
| `+ Add FAQ section` | **Pro** (`hasSitePolishBlocks`) |
| `+ Add gallery section` | **Pro** |
| `+ Add amenities section` | **Pro** |

When Pro-locked: the button is `disabled` (`disabled:opacity-50 disabled:cursor-not-allowed`),
shows a gold **PRO** `PlanBadge` appended after the label, and a `title` tooltip
"Upgrade to Professional to add {FAQ|gallery|amenities} sections".

#### 3.4.1 Per-block sub-forms (all in `components/pm/site-editor/`)

All are client components, all call `useUpsertContentBlock`, all show a red `role="alert"`
server-error box and a primary submit **"Save"** → **"Saving…"** (except Contact — see note).

- **TextBlockForm** — `Heading` (`input`, optional, `maxLength 120`); `Body` (`textarea rows=6`,
  **required** `*`, `maxLength 2000`). Submit disabled unless body non-empty.
- **ImageBlockForm** — `Image` file input (`accept image/jpeg,png,webp`); on select, a
  `react-image-crop` cropper (16:9) appears with helper "Drag to crop. Recommended 16:9.";
  **"Decorative image (no alt text required)"** checkbox; `Alt text` (required unless
  decorative, `maxLength 200`); `Caption` (`maxLength 200`). Submit label cycles
  "Uploading…" / "Saving…" / "Save".
- **AnnouncementsBlockForm** — helper "Renders the latest published announcements on the
  public site." `Maximum items` (`number` 1–20, required `*`, default 5, helper "Between 1
  and 20."); `Time window (days)` (`number` 1–365, required `*`, default 30, helper "Only
  announcements published within this window appear.").
- **DocumentsBlockForm** — helper "Renders publicly accessible documents filtered by category."
  `Maximum items` (`number` 1–20, required `*`, default 5, helper "Between 1 and 20.");
  fieldset **"Include categories"** (helper "Only documents in the selected categories will
  be shown.") with a note box: *"Only documents marked **Public** on the Documents page will
  appear here — the category selection below narrows that list further. To make a document
  public, open it on the Documents page and toggle *Public*."* Checkboxes: **Budget, Minutes,
  Financial, Rules, Other**.
- **MeetingsBlockForm** — helper "Renders upcoming community meetings on the public site."
  `Maximum items` (`number` 1–20, default 10); `Time window (days)` (`number` 1–365, default
  30, helper "Only meetings starting within this many days from today will appear.").
- **ContactBlockForm** — helper "Renders public management contact fields and a board roster
  on the public site." Fieldset "Visible contact sections" with checkboxes **Management
  contact** (`showManagement`, default true) and **Board roster** (`showBoard`, default true).
  ⚠️ Submit label here is **"Saving..."** (three dots), unlike the ellipsis elsewhere (§8).
- **FaqBlockForm** *(Pro)* — `Heading` (optional, `maxLength 120`); a list of Q&A cards, each
  **Question {n}** (required `*`, `maxLength 200`) + **Answer {n}** (required `*`, `textarea
  rows=3`, `maxLength 2000`) + "Remove" link; **"+ Add question"** button. Starts with 1 item.
  Submit disabled unless every item has both fields filled.
- **AmenitiesBlockForm** *(Pro)* — `Heading` (optional); list of items, each **Amenity {n}
  name** (required `*`, `maxLength 80`) + **Amenity {n} description** (optional, `maxLength
  280`) + "Remove"; **"+ Add amenity"**. Submit disabled unless every item is named.
- **GalleryBlockForm** *(Pro)* — `Heading` (optional); list of image entries, each thumbnail +
  **"Decorative image (no alt text required)"** checkbox + **Image {n} alt text** (required `*`
  unless decorative, `maxLength 200`) + **Image {n} caption** (`maxLength 200`) + "Remove"; an
  **Add image** file input (disabled at cap) with counter **"{n}/24 images."** (`MAX_IMAGES = 24`).

### 3.5 "Custom Styling" section → CustomStylingForm — `components/pm/site-editor/CustomStylingForm.tsx`

Card `<section aria-labelledby="custom-styling-tab">`: `<h2>` **"Custom Styling"** + helper
`<p>` "Override your selected preset's colors and body font. These win over the theme on your
public site." `<form class="space-y-5">`.

**Pro gate (`hasSiteCustomCss`):** when off, an upsell box renders at top
(`rounded-md border border-default bg-surface-muted`): *"Custom styling is a **Professional**
feature. Upgrade to fine-tune your site's colors and body font beyond the selected preset."*
and **every** control (checkboxes, color pickers, hex inputs, font select, submit) is
`disabled`. The section stays **visible-but-locked** (never hidden).

**Fields** — three color rows then a font row:
- Rows: **"Override primary color"**, **"Override secondary color"**, **"Override accent
  color"** — each a checkbox that, when checked, reveals a `<input type="color">` (`h-9 w-16`)
  + a monospace hex `<input>` (`maxLength 7`, `pattern ^#[0-9a-fA-F]{6}$`, `w-28`). Defaults
  when toggled on: primary `#2563eb`, secondary `#6b7280`, accent `#dbeafe` (⚠️ tech-blue
  defaults, not the app's coral — see §8).
- Font row: checkbox **"Override body font"** → `<select>` from `ALLOWED_FONTS` (default "Inter").
- Feedback: red `role="alert"` on error; green box **"Custom styling saved."** on success.
- Submit: **"Save custom styling"** → **"Saving…"**.

### 3.6 "Custom Domain" section → CustomDomainCard — `components/pm/site-editor/CustomDomainCard.tsx`

A **5-state machine** driven by the live `DomainState`. Shared heading (all states): `<h2>`
**"Custom Domain"**, with a trailing gold **PRO** `PlanBadge` **only** when
`!hasSiteCustomDomain`.

| State | `data-testid` | Trigger | Renders |
|---|---|---|---|
| **Gated** | `custom-domain-upsell` | `!hasSiteCustomDomain` | upsell box ("Connecting a custom domain is a **Professional** feature. Upgrade to serve your community site from your own hostname."), a **disabled** `Custom domain` input (`placeholder="www.yourcommunity.com"`), disabled **"Add domain"** button. |
| **Empty** | `custom-domain-empty` | `domain === null` | `<p>` "Point your own hostname at this community's public site. You'll add a DNS record at your registrar, then we'll verify it."; `Custom domain` input + **"Add domain"** (→ "Adding…"); then `<DomainFinder>` (§3.6.1). |
| **Pending** | `custom-domain-pending` | `status === 'pending'` | amber **"Pending DNS"** pill (`Clock`) + `<code>` domain; if DNS records present, `<p>` "Add the following DNS record(s) at your registrar, then click Check status." + a **Type / Name / Value** table (monospace); else `<p>` "Add the DNS records at your registrar, then click Check status."; **"Check status"** + **"Remove"**. |
| **Active** | `custom-domain-active` | `status === 'active'` | green **"Live"** pill (`CheckCircle2`) + `<code>` domain; **"View site"** (`ExternalLink`, `https://{domain}`, new tab) + **"Remove"**. |
| **Error** | `custom-domain-error` | `status === 'error'` | `<code>` domain; danger alert (`AlertCircle`) with `reason ?? 'Something went wrong with this domain.'`; **"Check status"** + **"Remove"**. |

Buttons: **"Check status"** → "Checking…", **"Remove"** → "Removing…", **"Add domain"** →
"Adding…". Status pills: `rounded-full px-2.5 py-1 text-sm font-medium`, aware =
`bg-warning/10 text-warning-strong`, success = `bg-success/10 text-success-strong`.

#### 3.6.1 DomainFinder — `components/pm/site-editor/DomainFinder.tsx`

A collapsed disclosure shown only in the **empty** state (`data-testid="domain-finder"`):
- Toggle (`aria-expanded`, chevron) labeled **"Don't have a domain yet? Find one"**.
- Open: `Domain to check` input (`placeholder="yourcommunity.com"`) + **"Check availability"** (→ "Checking…").
- Results: error alert; **taken** → "`{name}` is already registered. Already own it? Enter it
  above to connect it."; **available** → "`{name}` looks available — from ~${price}/yr (final
  price set by the registrar)." + **"Buy at Namecheap"** / **"Buy at Porkbun"** external links
  + "After you buy it, come back and enter it above to connect it."

> The app **never registers or bills** for domains — DomainFinder only links out to registrars.

### 3.7 PublishBar — `components/pm/site-editor/PublishBar.tsx`

Sticky bottom bar: `div[role="region"][aria-label="Publish website"]`,
`sticky bottom-0 z-10 mt-6 rounded-md border border-default bg-surface-card p-4 shadow-e1`.

- **Left:** `<span class="text-sm font-medium">` **"Website"** + a **pending-changes badge**
  (`data-testid="pending-changes-badge"`), three mutually exclusive states:
  - `pendingCount > 0` → accent pill (`bg-accent/15 text-accent`): **"{n} draft section(s)"**.
  - else `hasPublished` → muted pill (`bg-surface-muted text-content-secondary`): **"All changes published"**.
  - else → warning pill (`bg-status-warning-bg text-status-warning`): **"Not published yet"**.

  `pendingCount` counts blocks where `isDraft` (includes tombstone/staged-deletion drafts).
- **Right:** inline `role="status"` outcome text (truncated `max-w-[40ch]`); **"Discard
  Drafts"** button (only when `pendingCount > 0`; → "Discarding…"); **"Publish Website"**
  primary (→ "Publishing…"). All disabled while loading/in-flight.
- **Discard confirm:** "Discard all pending drafts? Your live site is untouched; unpublished
  edits, reorders, and staged removals will be lost." Success toast: "Discarded {n} pending
  change(s)." / "Nothing to discard."

---

## 4. States & interactivity

- **Live-vs-draft is one signal, surfaced in three lockstep places:** the header pill (§3.2),
  the PublishBar badge (§3.7), and publish gating — all derived from whether blocks are
  `isDraft` / any block is non-draft. Keep these three consistent in any redesign.
- **No page-level dirty flag.** Each form (hero, each block, styling, domain) owns its own
  local React state and its own Save button with a transient `Saving…`/`Uploading…` label +
  `disabled` guard. There is no global "unsaved changes" tracker; "pending changes" is
  **server-derived** from draft rows and shown only in the PublishBar.
- **Draft layer + atomic publish.** Hero/block edits, reorders, and deletes all write to the
  draft layer immediately (deletes stage a *tombstone*). **Publish** promotes the entire draft
  atomically via `publishCommunitySite`, using an optimistic-concurrency token
  (`expectedPublishedAt`); a concurrent publish elsewhere yields a `409` surfaced as
  **"Conflict: {message}"**. **Discard Drafts** reverts the editor to the live state.
- **Publish outcome strings** (`classifyOutcome` in PublishBar):
  - not published → "No changes to publish."
  - promoted + retired → "Published — {n} section(s) live, {m} removed."
  - only retired → "Published — {n} section(s) removed."
  - only promoted → "Published — {n} section(s) live."
- **Custom-domain state machine:** gated → empty → pending → active, with error as a side
  state; transitions driven by `useSetDomain` / `useVerifyDomain` / `useRemoveDomain`.

---

## 5. Pro-gating

Three plan-tier flags, all rendered **visible-but-disabled** for upsell (never hidden), and
**re-enforced server-side** at the write routes (§6):

| Flag | Gates | Locked UI |
|---|---|---|
| `hasSitePolishBlocks` | The FAQ / Gallery / Amenities "+ Add" buttons in ContentSectionsList | button `disabled` + gold **PRO** `PlanBadge` + `title` tooltip |
| `hasSiteCustomCss` | The entire CustomStylingForm | upsell banner + all controls disabled |
| `hasSiteCustomDomain` | The entire CustomDomainCard | upsell banner, disabled input/button, **PRO** badge on the heading |

`PlanBadge` (`packages/ui/src/components/PlanBadge.tsx`), `variant="pro"` → a small gold
uppercase pill reading "PRO" (`aria-label="Pro plan feature"`).

**Plan mapping** (`packages/shared/src/features/plan-features.ts`): `essentials` has only
`hasSiteEditor`; `professional` and `operations_plus` add all three Pro flags. Effective
features = community-type flags **∩** plan flags (`get-features.ts` → `getEffectiveFeatures`),
resolved for the page by `getEffectiveFeaturesForPage`.

---

## 6. Data & API wiring

### 6.1 Server loaders (run in `page.tsx` before render)

| Symbol | File |
|---|---|
| `getPublicCommunityScopedReader(id).listSiteBlocks({ includeDrafts: true })` | `apps/web/src/lib/db/public-community-reader.ts` |
| `getCommunityPublicInfo`, `getSiteOnboardingCompletedAt`, `getBrandingForCommunity` | `apps/web/src/lib/api/branding.ts` |
| `getEffectiveFeaturesForPage`, `requirePlanFeature` | `apps/web/src/lib/middleware/plan-guard.ts` |
| `getDomain` | `apps/web/src/lib/services/custom-domain-service.ts` |
| `buildCommunityUrl` | `apps/web/src/lib/utils/community-url.ts` |
| `requirePageAuthenticatedUserId` / `requirePageCommunityMembership` / `hasRole`,`PM_MANAGER_ROLES` | `lib/request/page-auth-context.ts` / `lib/request/page-community-context.ts` / `lib/api/role-guard.ts` |

The page computes: `hasPublishedContent` (any non-draft block), the hero `initial`
(`heroBlockSchema.safeParse`), `customCssInitial`, `showWizardBanner`
(`onboardingCompletedAt === null`), and the three Pro flags.

### 6.2 React Query hooks → endpoints

| Hook(s) | File | Endpoint(s) |
|---|---|---|
| `useHeroBlock`, `useUpdateHeroBlock` | `hooks/use-hero-block.ts` | GET / PATCH `/api/v1/pm/site/hero` |
| `useContentBlocks`, `useSitePublishToken`, `useUpsertContentBlock`, `useDeleteContentBlock`, `useReorderBlocks`, `useDiscardDrafts` | `hooks/use-content-blocks.ts` | GET/PATCH/DELETE `/api/v1/pm/site/blocks`; POST `/api/v1/pm/site/blocks/reorder`; DELETE `/api/v1/pm/site/drafts` |
| `useSaveCustomCss` | `hooks/use-custom-css.ts` | PATCH `/api/v1/pm/branding` (`customCssOverrides` field only) |
| `useCustomDomain`, `useSetDomain`, `useVerifyDomain`, `useRemoveDomain`, `useCheckDomainAvailability` | `hooks/use-custom-domain.ts` | GET/POST/DELETE `/api/v1/pm/site/domain`; POST `/api/v1/pm/site/domain/verify`; GET `/api/v1/pm/site/domain/check` |
| `usePublishSite` (throws `PublishConflictError` on 409) | `hooks/use-publish-site.ts` | POST `/api/v1/pm/site/publish` |
| `useImageUpload` | `hooks/use-image-upload.ts` | POST `/api/v1/site/uploads/presign` → PUT (Supabase Storage) → POST `/api/v1/site/images/finalize` |

### 6.3 API route handlers

All under `apps/web/src/app/api/v1/`, each `runRoute(contract, handler)` + `withErrorHandler`
with a sibling `contract.ts`. Backing services: `lib/services/site-blocks-service.ts`
(`upsertPublishedBlock`, `upsertPublishedHero`, `publishCommunitySite`, `reorderSiteBlock`,
`removeSiteBlock`, `discardSiteDrafts`) and `lib/services/custom-domain-service.ts`.

| Route file | Methods + URL | Purpose |
|---|---|---|
| `pm/site/hero/route.ts` | GET/PATCH `/pm/site/hero` | read/write draft hero (block_order 1) |
| `pm/site/blocks/route.ts` | GET/PATCH/DELETE `/pm/site/blocks` | list merged blocks + publish token; upsert draft block; stage tombstone / drop draft |
| `pm/site/blocks/reorder/route.ts` | POST `/pm/site/blocks/reorder` | swap block_order up/down (draft) |
| `pm/site/publish/route.ts` | POST `/pm/site/publish` | atomic publish (optimistic concurrency, 409 on mismatch) |
| `pm/site/drafts/route.ts` | DELETE `/pm/site/drafts` | discard all drafts → `{discardedCount}` |
| `pm/site/domain/route.ts` | GET/POST/DELETE `/pm/site/domain` | read/attach/detach custom domain (Vercel) |
| `pm/site/domain/verify/route.ts` | POST `/pm/site/domain/verify` | re-check provider status → active |
| `pm/site/domain/check/route.ts` | GET `/pm/site/domain/check` | guided-purchase availability (read-only) |
| `pm/branding/route.ts` | GET/PATCH `/pm/branding` | branding read/update; PATCH gates `customCssOverrides` |
| `site/uploads/presign/route.ts` | POST `/site/uploads/presign` | presigned Storage PUT URL (bucket `community-site-assets`) |
| `site/images/finalize/route.ts` | POST `/site/images/finalize` | sharp crop + 1600w/800w WebP variants, quota, audit |

### 6.4 Content schemas — `packages/shared/src/site-blocks/`

All Zod `.strict()`; registry `blockSchemaRegistry` in `index.ts`; shared primitives +
`BLOCK_TYPES` + `TOMBSTONE_BLOCK_TYPE='tombstone'` in `types.ts`.

| File | Fields |
|---|---|
| `hero.ts` | `headline`(1–120), `subtitle?`(1–280), `ctaText?`(1–40), `ctaTarget?`, `heroImagePath?`, `heroImageAlt?` — ctaText⇔ctaTarget both/neither; alt required when image set |
| `text.ts` | `heading?`(1–120), `body`(1–2000) |
| `image.ts` | `imagePath`, `altText?`, `decorative?:true`, `caption?`(1–200) — alt required unless decorative |
| `announcements.ts` | `limit`(default 5), `timeWindowDays`(1–365, default 30) |
| `documents.ts` | `limit`(default 5), `includeCategories?: ('budget'|'minutes'|'financial'|'rules'|'other')[]` |
| `meetings.ts` | `limit`(default 10), `timeWindowDays`(1–365, default 30) |
| `contact.ts` | `showBoard`(default true), `showManagement`(default true) |
| `faq.ts` *(Pro)* | `heading?`(1–120), `items: {question(1–200),answer(1–2000)}[]` (1–30) |
| `amenities.ts` *(Pro)* | `heading?`(1–120), `items: {name(1–80),description?(1–280)}[]` (1–30) |
| `gallery.ts` *(Pro)* | `heading?`(1–120), `images: {imagePath,altText?,decorative?,caption?(1–200)}[]` (1–24) |

Branding types — `packages/shared/src/branding.ts`: `CommunityBranding`
(`primaryColor?/secondaryColor?/accentColor?/fontHeading?/fontBody?/logoPath?/siteLogoPath?/
layoutId?/themePresetSlug?/tagline?/customCssOverrides?/…`), `CustomCssOverrides`
(allowlist: `primaryColor?/secondaryColor?/accentColor?` 6-digit hex + `bodyFont?`),
`DEFAULT_PRIMARY_COLOR='#C2533A'`. `DomainState` / `DnsRecord` are declared in **two** places
(client `hooks/use-custom-domain.ts` + server `custom-domain-service.ts`):
`{ domain: string|null; status: 'pending'|'active'|'error'|null; verifiedAt: string|null; records: DnsRecord[]; reason: string|null }`.

### 6.5 Database — `packages/db/src/schema/`

- **`site_blocks`** (`site-blocks.ts`): `id`, `community_id` (FK → communities, cascade),
  `block_order` int, `block_type` text (CHECK enumerates the 10 types + `tombstone`),
  `content` jsonb, `is_draft` bool (default true), `published_at`, timestamps, `deleted_at`.
  Partial unique index `(community_id, block_order, is_draft) WHERE deleted_at IS NULL` — lets
  one draft + one published row coexist per slot.
- **Branding & domain live on the root `communities` table** (`communities.ts`): `branding`
  jsonb, `custom_domain` text, `custom_domain_status`, `custom_domain_verified_at`,
  `site_published_at`, `site_onboarding_completed_at`, `site_onboarding_progress` jsonb,
  `subscription_plan`, `community_type`. **No** separate `community_branding`/`custom_domains`
  table.

### 6.6 Write-route authorization / Pro-gate enforcement

Every mutation re-runs, independent of the page's own checks:
`requireAuthenticatedUserId()` → `resolveEffectiveCommunityId(req, communityId)` →
`requireCommunityMembership` → `requireRole(PM_MANAGER_ROLES)` →
`requirePlanFeature(<feature>)` (throws `AppError(403,'PLAN_UPGRADE_REQUIRED')`). hero/blocks/
reorder/publish/drafts gate `hasSiteEditor`; blocks PATCH additionally gates faq/gallery/
amenities on `hasSitePolishBlocks`; **DELETE is intentionally *not* polish-gated** (downgraded
plans can still remove Pro blocks); branding PATCH gates `customCssOverrides` on
`hasSiteCustomCss`; all domain routes gate `hasSiteCustomDomain` and call
`assertNotDemoGrace`. Errors flow through `withErrorHandler` into `{error:{code,message}}`.

---

## 7. Design constraints for the redesign

Enforced by CI guards and the design system — a redesign must stay inside these lines.

- **Semantic tokens only.** Colors, surfaces, borders, and radii come from CSS variables
  (`--text-primary`, `--surface-card`, `--border-default`, `--interactive-primary`, `--status-*`,
  `--radius-*`, `--space-*`). No raw hex, no raw Tailwind palette classes (`bg-blue-500`), no
  arbitrary values. `pnpm guard:design-tokens` enforces this (shrink-only baseline; new files
  must be clean). Full ramp of resolved values is in the companion mockup's `:root` block.
- **Root font-size is 18px** (`globals.css`) → `1rem = 18px`. Font-size tokens are rem-based
  and scale ×1.125 (base body ≈ 18px, `text-2xl` ≈ 27px). Spacing utilities are absolute px.
- **Fonts:** body/UI = **Inter**; the page `<h1>` uses **Fraunces** display serif via a global
  `h1 { font-family: var(--font-display) }` rule. Only the `<h1>` is serif.
- **No slash-opacity on the app's semantic tokens** (`bg-interactive/10`, `border-accent/40`,
  etc.) — those tokens are bare `var(--x)` with no alpha channel, so Tailwind emits no CSS and
  the color renders as nothing. Use a solid `-subtle`/`-bg`/`-hover`/`-border` token, or
  `white`/`black` alpha for genuine translucency. (This page already violates it — see §8.)
- **Breadcrumbs are owned by the app shell** (`components/layout/shell-breadcrumbs.tsx`),
  derived from the URL + the page `<h1>`. The page must render an `<h1>` (it does: "Website")
  and must **not** author its own breadcrumb/back-link.
- **One filled primary button per view region.** Today: the wizard-banner CTA, each form's
  Save, and the PublishBar's Publish are the primaries; header actions and domain "View site"
  are `outline`/secondary. Preserve this discipline per card/region.
- **Status = icon + text + color, never color alone** (the Live/Pending pills already follow
  this). Buttons: `h-9` (36px) default, `rounded-md` (10px). Cards: `rounded-md`, `1px
  border-default`, `p-6` (or `p-4` for block cards), `shadow-e0` at rest.
- **Accessibility:** never suppress `:focus-visible` (all controls show the coral focus ring);
  decorative icons `aria-hidden`; alerts `role="alert"`; respect `prefers-reduced-motion`;
  body text ≥ base (16px nominal / 18px actual).

---

## 8. Redesign notes / known rough edges

Candid list of things a redesign could clean up (none are blockers; all are real):

1. **Slash-opacity on `--brand-accent`.** The WizardEntryBanner (`bg-accent/10`,
   `border-accent/40`, `text-accent`) and the PublishBar draft badge (`bg-accent/15
   text-accent`) use slash-opacity on the `accent` semantic token, which has no alpha channel
   → the background/border **render as nothing** in the live build. The banner/badge currently
   show far weaker tint than intended. A redesign should use a solid coral `-subtle`/`-bg`
   token. *(The mockup renders the intended tint, not the broken live output, and annotates it.)*
2. **Tech-blue color-picker defaults.** CustomStylingForm's default override colors are
   `#2563eb` / `#6b7280` / `#dbeafe` (old tech-blue palette), inconsistent with the app's
   coral "Florida Modern" brand (`DEFAULT_PRIMARY_COLOR='#C2533A'`). These are `//
   design-tokens:exempt` product literals, but the defaults feel off-brand.
3. **Inconsistent "Saving" copy.** Most forms use the ellipsis character **"Saving…"**;
   ContactBlockForm uses three dots **"Saving..."**. Normalize.
4. **Hero image not editable here.** HeroBlockForm has no image field — it only *preserves*
   an existing `heroImagePath`/`heroImageAlt`. A hero image can't be set/changed from the
   editor (only via the onboarding wizard / other paths). Consider adding it.
5. **Section headings are inconsistent in origin.** "Welcome" and "Custom Styling" headings
   live in `page.tsx`; "Content Sections" and "Custom Domain" headings live inside their
   components. A redesign might unify heading ownership (e.g. a shared section shell).
6. **Block card header is developer-ish.** Each block card shows **"#{order} — {blockType}"**
   (raw type string, e.g. "documents") rather than a friendly label/icon. Good candidate for a
   titled, iconized section header with drag-reorder instead of up/down chevrons.
7. **Two `DomainState` definitions** (client hook + server service) can drift. Not user-facing,
   but worth consolidating into `packages/shared` during a refactor.
8. **Domain "records" always empty from the server seed** (`getDomain` returns `records: []`);
   DNS records populate only after a client `verify`. The pending-state table can therefore be
   empty on first load — the copy handles both, but the UX could pre-fetch records.

---

## 9. File map (what to replace)

**Page & regions**
- `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx` — the page (RSC)
- `apps/web/src/components/pm/onboarding-wizard/WizardEntryBanner.tsx`
- `apps/web/src/components/pm/site-editor/HeroBlockForm.tsx`
- `apps/web/src/components/pm/site-editor/ContentSectionsList.tsx`
- `apps/web/src/components/pm/site-editor/{Text,Image,Announcements,Documents,Meetings,Contact,Faq,Amenities,Gallery}BlockForm.tsx`
- `apps/web/src/components/pm/site-editor/CustomStylingForm.tsx`
- `apps/web/src/components/pm/site-editor/CustomDomainCard.tsx`, `DomainFinder.tsx`
- `apps/web/src/components/pm/site-editor/PublishBar.tsx`

**Hooks**
- `apps/web/src/hooks/{use-hero-block,use-content-blocks,use-custom-css,use-custom-domain,use-publish-site,use-image-upload}.ts`

**API routes**
- `apps/web/src/app/api/v1/pm/site/{hero,blocks,blocks/reorder,publish,drafts,domain,domain/verify,domain/check}/route.ts`
- `apps/web/src/app/api/v1/pm/branding/route.ts`
- `apps/web/src/app/api/v1/site/{uploads/presign,images/finalize}/route.ts`

**Services / loaders**
- `apps/web/src/lib/services/{site-blocks-service,custom-domain-service}.ts`
- `apps/web/src/lib/api/branding.ts`, `apps/web/src/lib/db/public-community-reader.ts`
- `apps/web/src/lib/middleware/plan-guard.ts`, `apps/web/src/lib/utils/community-url.ts`

**Schemas / types / DB / tokens**
- `packages/shared/src/site-blocks/*`, `packages/shared/src/branding.ts`, `packages/shared/src/features/*`
- `packages/db/src/schema/{site-blocks,communities}.ts`
- Design tokens: `packages/tokens/src/{primitives,semantic,static}.ts` → generated
  `packages/ui/src/styles/tokens.css`; app root/fonts: `apps/web/src/app/{layout,globals.css}`;
  Tailwind map: `apps/web/tailwind.config.ts`

**Companion**
- `docs/redesign/website-page/website-editor-mockup.html` — faithful static render of today's design.
