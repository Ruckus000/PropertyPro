# Website builder: live on day one, pick a look, done

**Date:** 2026-10-27 · **Status:** draft for approval · **Area:** the community website (website editor, public site, Documents, Settings, onboarding)

**Sources.**
- UX audit of the current editor: <https://claude.ai/artifact/UGS75vWYL6LN1LGsXMtzpd>.
- Mockups: <https://claude.ai/artifact/5oB8aurDS6gwRSSXX16bKu>, row "Combined" (boards C0–C4).

Rows A and B on that canvas are the two earlier options this design borrows from, kept for
reference only. Where a mockup and this document differ, this document wins.

## 1. Summary

Every new association gets a complete, accurate website the moment its community is created. It
is built from what sign-up collected and from the association's own meetings, news and documents,
with nothing to confirm. The one real choice is the look: four complete looks, previewed live
with the association's content. Switching is one click on Publish. Florida's records are handled
automatically: files owners can already see are linked to the website list, and the website home
lists only what is still missing. Changing anything later means clicking it and editing a short
panel.

## 2. Who it is for, and why this exists

**Primary user** (stated by the product owner): an association head or board member who isn't
very technical and wants a simple site that has what Florida requires. Property managers running
several associations are the secondary user; nothing here may get in their way.

**Why now.** The audit walked a brand-new 120-unit condo through today's editor and found:

| Finding today | Where it lives |
|---|---|
| "Templates" change only the primary colour; descriptions promise photos and pages that never appear; two pairs render identically | `apps/web/src/components/pm/site-editor-v3/design-templates.ts`, migration `0004` presets |
| No colour set's headline font renders (Fraunces, Newsreader, Cormorant Garamond and Bricolage are not in `ALLOWED_FONTS`) | `packages/theme/src/constants.ts`, `resolveFont` |
| New communities never get their colour set: `resolveTheme` ignores the preset slug | `packages/theme/src/resolve-theme.ts` |
| The day-one site is full of filler text and empty boxes ("No documents available.") | starter pack applied by `seedNewCommunitySite`; shared section renderers |
| "Required items: all set" with zero documents posted: the pill checks that sections exist, not that records are posted | `packages/shared/src/site-diff/required.ts` vs `apps/web/src/lib/site-editor/records-status.ts` |
| Four competing guides on first open (wizard banner, Guided/Free chooser, tour, Next steps) and a separate wizard whose Skip buttons do nothing | `site-editor-v3/guidance/*`, `lib/site-editor/next-steps.ts`, `/pm/onboarding/website` |
| Publish history and revert APIs exist with no screen | `api/v1/pm/site/publish/history`, `/revert` |

## 3. Decisions made by the product owner

These are settled. Build them as written.

1. **Never ask for or confirm information PropertyPro already has.** Sign-up collects the
   association name, street address, city, state, ZIP, county, unit count, association type, and
   the main contact's name and email (`apps/web/src/lib/auth/signup-schema.ts`). The site uses
   them directly. They stay editable afterwards in Settings, and the site follows the change.
2. **Choosing a look is the one real choice, and it must be very simple.**
3. **The welcome photo and welcome message are part of each look**, not a step. They fill in the
   property name automatically and can be changed later.
4. **Florida's records happen automatically.** There is no documents step. Once the site is set
   up, an alert tells them which records are missing.
5. **Publishing is one click.** No review screen. Emailing owners about the site is offered
   afterwards, never sent automatically.
6. **This combines the earlier designs A and B**: A's live, real-content look previews and
   click-on-the-page editing; B's automatic data, website home and records follow-up.
7. **The site is live from day one.** It goes live when the community is created, keeping the
   rule in `docs/superpowers/specs/2026-05-26-property-landing-page-design.md` §4.0 that a site
   is never gated behind a step someone may not finish. Picking a look changes a site that is
   already live.
8. **Two new automatic section types: Quick links and Board members.** Both fill themselves from
   data, so neither ever needs sample text. The mockups' other extras ("This month",
   "Good to know", a president's note, building facts) are not part of v1.

## 4. Goals, non-goals, anti-goals

**Goals**
- A new association has a live, complete, accurate site **without doing anything**. Making it
  theirs takes **one choice and one click**.
- Every look is a complete site that shows the association's own content before anyone chooses it.
- The live site never shows a fact that isn't true, or an empty box.
- Florida's website list counts **records**, not sections, and the follow-up is one clear alert.
- Changing something later never requires knowing what a "block", "section type" or "variant" is.

**Non-goals (this project)**
- Free-form layout editing, drag-and-drop canvases, custom CSS or code.
- New statutory logic. Thresholds and checklist contents stay where they are
  (`required.ts`, `packages/shared/src/compliance/templates.ts`).
- A contact form (see §6, Privacy).
- Applying a look across a manager's whole portfolio. Existing portfolio templates
  (`site_portfolio_templates`) keep working as they do.
- Payments on the site (launch-gated off for legal reasons), AI-written copy, multiple languages.
- Officer titles other than President and Board member. They aren't recorded today.

**Anti-goals: it fails if any of these happen, even if everything "works"**
- A setup screen asks for something sign-up already collected.
- A wizard, tour or checklist stands between a new association and a live site.
- The live site shows sample text presented as fact (an invented phone number, office hours or
  history) or an empty box ("No documents available.").
- Any copy tells an association it is "compliant", gives legal advice, or quotes a fine amount.
  Copy says what the law lists for associations, never what this association owes; see the
  docblock in `required.ts`.
- Owners receive an email nobody clicked to send.
- Automatic linking changes who can see a document.
- A personal email address appears on the public site.

## 5. The experience

### Day one (no screen): the site is built and live

When a community is created, `seedNewCommunitySite` builds the **suggested look**:
- condo → Bayfront;
- HOA → Palm Grove;
- apartment → Plain & Simple.

The look is built from sign-up data plus the portal's meetings, announcements and documents, and
publishes it. That keeps today's behaviour of publishing at creation, including stamping
`communities.site_published_at` in `starter-pack-service.ts`, so urgent notices work from day
one. What changes is the content: the suggested look's full design and sections, following every
rule in §6, instead of today's starter pack and its filler.

### C0. One card on the dashboard

- The dashboard shows one card: **"Your website is live"**. It has a live thumbnail and three
  actions: **View site**; **Pick a different look**, which goes to C1; and **Open website
  home**, which goes to C2.
- It **replaces** the existing "Get your community live" panel
  (`apps/web/src/components/onboarding/founding-aha-panel.tsx`), so there is one go-live card,
  not two. That panel's switch for the public transparency page moves to the website home (C2);
  its settings and behaviour do not change.
- **Retire** from the website editor's first run: the banner to the separate wizard, the
  Guided/Free mode chooser, the four-step tour and the Next steps panel. **Retire** the
  `/pm/onboarding/website` wizard and redirect it to the Website page.
- The onboarding checklist's `customize_portal` item points to the Website page. It is complete
  once the person has visited C1 or published, since the site itself is already live.

### C1. Pick a look (the one choice, one click)

On the Website page (from C0 or C2):
- Heading: "Pick a look for {name}'s website", and one line saying the site is already live with
  the suggested look and anything can be changed later.
- **Filled in for you**: read-only chips. They cover:
  - name and address;
  - unit count and type;
  - number of upcoming meetings and news posts;
  - records found in Documents;
  - welcome photo and message.

  Plus a link to the Community profile. This informs; it never asks for confirmation.
- **Four look cards**, each a live thumbnail of the real site with the association's content. The
  live look is marked **Live now**.
- **A large live preview** of the selected look, scrollable, with a Computer/Phone switch.
- A sticky action bar: "Nothing changes until you click Publish", **Open full preview**, and the
  one primary button, **Publish this look**. The button is disabled while the live look is the
  one selected.

Rules:
- Selecting a look changes nothing public; the selection is kept as a draft, so leaving and coming
  back keeps it. **Publish this look** publishes immediately, with no review screen.
- Switching looks keeps everything the user changed. The new look's defaults fill only what they
  never touched.
- Publishing needs `property_manager` or `root_manager` in the community, as today
  (`ensurePmAccess` in `api/v1/pm/site/publish/route.ts`).

### C2. The website home (from day one)

- **After any Publish**, a success banner: "{name}'s website has been updated", with the address,
  **View site** and **Copy link**.
- **Let owners know.** When the community has owners with accounts, the home offers **Email
  owners**, which sends the existing "your website is live" email once, on that click only.
  - The offer stays until the email has been sent once or the person dismisses it.
  - It keeps today's gate (`announcements: write`).
  - The publish route's `notifyResidents` path is no longer used for this; the email is a
    separate action.
- **Missing-records alert** (amber). It shows only when the community is covered by Florida's
  website rule and something is missing.
  - It says how many records were linked automatically, then lists each missing one with
    **Upload**, plus **Doesn't apply** where an item is conditional.
  - It offers **Add several at once** (C3) and **Remind me next week**.
  - A count badge sits on the Website nav item. The same count feeds the existing daily digest
    (`compliance-alert-service.ts`); no new email is added.
- **Coming up**: upcoming meetings, and for each one whether its notice has been marked posted.
  That mark stays the manager's own attestation in Meetings (`meetings.notice_posted_at`), because
  a notice also has to go up on the property, which PropertyPro cannot see. Nothing here stamps it
  automatically; each row links to Meetings. Meeting documents stay owners-only.
- **Details on your site**: name, address, public phone, public email and office hours as they
  appear. Anything not added yet reads "Not added yet, so it's hidden on the site", with a link to
  the Community profile.
- **Your site**: thumbnail, look name, **Edit your site** (C4) and **Change look** (C1). It also
  shows when the site was last published and by whom, and **Restore an earlier version**: one-step
  revert on every plan, and the full history list on Professional only, as the
  `site_publish_snapshots` docblock already decides.
- **Transparency page** (optional): the existing switch, moved here from the dashboard panel.

### C3. Adding missing records later

A drawer opened from the alert:
- One drop zone takes several files at once. PropertyPro proposes which record each file is.
  Each proposal shows a **Matched** badge and a **Change** control, and **Post N records**
  confirms them all.
- Every file added here is saved in Documents under the right category, so there is one copy, and
  it goes through the same redaction attestation as any upload.
- **Doesn't apply** asks for a short reason, chosen from a list or typed, which is recorded.
- Remaining items show what usually decides whether they apply, without legal advice, for example
  "Usually applies to buildings three or more stories tall".

### C4. Changing things later

- The editor shows the site at real size. **Click any part** to select it, and a short panel on
  the right shows only that part's settings, in plain words.
- **Welcome**: photo (change it, or add your own), headline and message. Values that come from
  the account (name, city, unit count) appear as grey chips and stay linked, so renaming the
  association in Settings updates the site. **Use the look's wording** restores the default.
- **Sections fed by data** say where their content comes from and link there, for example
  "Updates by itself from Announcements" with **Write an announcement**. That covers news,
  meetings, documents, Quick links, Board members, and contact details from the Community
  profile.
- Parts can be hidden or added from a short visual list. Order changes with move up and down.
  There is no free-form layout.
- **What C4 replaces:** only how page sections are selected and edited (today's tool rail plus
  inspector forms). Everything else the editor does today stays and moves into one **Site
  settings** area, reachable from the editor and from the website home:
  - Pages: add, rename, delete, navigation
  - Design: colours and fonts, including custom colours on Professional
  - the urgent notice
  - custom domain (Professional)
  - search and sharing, the footer, logos and the site icon
  - Help

  No paid feature is removed.
- **Drafts:** page content and the look stay private until **Publish changes**. Site settings
  that save immediately today keep doing so, as Phase 5 of
  `docs/superpowers/plans/2026-09-29-site-builder-v4.md` decided (`site_pages` has no draft
  columns), and the screen says so next to them. The urgent notice keeps going live immediately,
  clearly labelled.

### Settings: a Community profile

Decision 1 says details stay editable afterwards, but `/settings` has nowhere to edit them today:
- renaming exists only in the onboarding wizard this design retires (`updateCommunityName`);
- the address can be changed only in the admin console;
- there is no office-hours field, and the only phone is the management contact's, which has an
  API but no screen.

This project adds a **Community profile** section to Settings:
- association name (the rename moves here);
- an optional short name for the website, which defaults to the full name;
- street address, city, state, ZIP and county;
- public phone, public email and office hours, all optional.

It needs:
- one audited route, following `.claude/rules/api-patterns.md`;
- a migration for the new optional fields;
- a change here updating the site, through the linked fields, without a publish.

Building facts such as year built or number of floors are not collected and are not part of v1.

### Two new section types

- **Quick links.** Fixed links to Meetings (showing the next meeting's date), News, Documents
  (owner sign in) and Contact. It has nothing to fill in and can only be shown or hidden. It is
  available on every plan.
- **Board members.** Names with "President" or "Board member", read from
  `user_roles.designation` (`board_president` / `board_member`). It shows names only, never
  contact details, is hidden while no one holds a seat, and can be hidden by the manager. Heritage
  includes it by default; other looks can add it. Using `designation` for display is a new reader
  of that column; it must never feed a permission decision.
- Each new type follows the existing section pattern:
  - a CHECK-constraint migration;
  - the contract enum;
  - a strict schema;
  - a renderer and an editor panel.

  Block schemas are `.strict()`, so ship it in two releases: renderers first, writers second.

## 6. Rules the whole system follows

**Content**
- **Hidden when missing.** Fields sign-up doesn't collect stay hidden on the live site until
  someone adds them. That covers phone, office hours, About text, building facts and photos of the
  building. No look ships sample facts. Inside the editor only, a hint says what is hidden and
  where to add it.
- **Data-driven first.** Meetings, announcements, board seats and records always come from the
  portal; the website never holds a second copy to keep in sync.
- **Empty sections never render as empty boxes.** A data section with nothing in it is left out
  of the live site, and its editor panel explains how to fill it.
- **The public Documents section** shows a summary of the owners-only records (groups and counts)
  and an **Owner sign in** button, never "No documents available." Public documents, where a
  community has chosen any, are still listed.
- **Which sites change on deploy.** The two rules above live in shared section renderers, so they
  reach **every** site when they ship: empty data sections disappear, and an empty Documents
  section becomes the owner summary.
  - This only removes empty boxes. No content is added and nothing is unpublished, so it needs a
    release note, not a publish.
  - Everything else in this design (looks, welcome copy, linked fields, the new sections) reaches
    an existing site only when it moves to a new look.

**Records ("automatic" means linking, never exposing)**
- Today a requirement counts as covered when its checklist item links to a document that is not a
  draft (`compliance_checklist_items.document_id`, `documents.posted_at`; see
  `apps/web/src/lib/documents/document-state.ts`).
- **Automatic = linking.** When a document owners can already see (`posted_at` set) clearly
  matches an unlinked checklist item, link it, at creation and whenever documents are added.
  Linking never changes visibility: never publish a draft, never flip `public_access`, never move
  a document between categories.
- Redaction stays where it is. The attestation enforced at upload for sensitive categories is
  still the gate (`apps/web/src/lib/documents/redaction-attestation.ts`, §718.111(12)(c)).
- Uncertain matches are proposed, never applied silently.
- Linking, unlinking and "doesn't apply" (with its reason) are written to `compliance_audit_log`.
- Thresholds come from `required.ts`: condos with 25+ units, HOAs with 100+ parcels, and an
  unknown count is treated as covered. Below the threshold there is no alert, only a gentle
  "recommended" note. Apartments get no records list.

**Privacy**
- **No contact form in v1.** A public form would be a new unauthenticated endpoint and an abuse
  target. Owners could also send official records requests through it, and those carry statutory
  response deadlines that a forwarded email could miss.
- The Contact section shows only the address plus the public phone, public email and office hours
  from the Community profile, each hidden until added. The main contact's personal sign-up email
  is never shown on the site.

**Looks**
- Four looks: **Bayfront** (photo-led), **Heritage** (formal), **Palm Grove** (warm) and
  **Plain & Simple** (no photos needed, bigger text). Each is a whole site: page set, section
  order, fonts, colours, default photos, and welcome copy with linked fields. The mockups show the
  intended feel; their copy and photography are not final.
- The four looks replace the six current templates in the picker. Existing sites keep their
  current look until someone picks a new one.
- Fonts come only from `ALLOWED_FONTS` (or the list is extended in the same change). Colour pairs
  meet WCAG AA, including headings on tinted backgrounds.
- **Every look works fully on every plan.** A look's default sections use only section types
  every plan has; FAQ, gallery and amenities are Professional-only today (`hasSitePolishBlocks`).
- **Default photos are scenery, not a specific building**, so a stock photo is never mistaken for
  the association's own property.

**Engineering**
- The editor route sits close to its hard first-load budget (`scripts/perf-check.ts`, group
  `site-editor`). Preview frames, the look picker and the records drawer must be loaded lazily.
- Every new or changed route follows `.claude/rules/api-patterns.md`: `runRoute` contracts,
  `requirePermission` (or the existing management-role check), audit logging, scoped DB access.
- Migrations follow `.claude/rules/migration-safety.md` and are applied to production by hand,
  expand before contract.
- Accessibility: WCAG 2.1 AA, visible focus, 44 px touch targets on phones, status always shown as
  icon plus text plus colour, and decorative previews kept out of the tab order.

## 7. How it maps onto today's code

| Piece | Today | Change |
|---|---|---|
| New community's site | `seedNewCommunitySite` publishes the starter pack and stamps `site_published_at` | Keep publishing at creation, but build the suggested look under the §6 rules. Demo communities use the same path and get the same result. |
| Templates | 6 colour-only templates (`design-templates.ts`), presets in `site_theme_presets`, layouts in `site_layout_metadata` | Replace with the 4 looks. Make sure the chosen look's full theme is what renders (fixes `resolveTheme` ignoring the slug). |
| Look picker and live previews | Text-only Design panel | New C1 screen on the Website page. |
| Publish | `POST /api/v1/pm/site/publish`, with optional `notifyResidents` | Publish without the email. Owner email becomes a separate action on C2. |
| History and restore | `site_publish_snapshots`, `/publish/history` and `/publish/revert` exist, unused | Shown in C2: one-step revert on every plan, full list on Professional. |
| Records | Manual linking; `records-status.ts` groups checklist verdicts | Automatic linking, the C2 alert and the C3 drawer. Same count in the existing daily digest. |
| Requirements pill | Checks that sections exist | Counts records (the same source as C2). |
| Public Documents section | Lists public documents, else "No documents available." | Owner-area summary plus sign in, on every site. |
| Empty data sections | Placeholder text in shared renderers | Left out of the live site, on every site. |
| Contact section | Management name, email, phone and board names; no screen sets them | Address plus Community profile phone, email and hours. No form. |
| Meeting notices | Manager attests "Post notice" (`notice_posted_at`) | Unchanged. C2 shows the status and links to Meetings. |
| Community details | Rename only in the retired wizard; address only in admin | New Community profile in Settings. |
| Section types | 11 types | Add Quick links and Board members (two-release rollout). |
| Dashboard go-live panel | `founding-aha-panel.tsx` ("Get your community live") | Replaced by the C0 card; the transparency switch moves to C2. |
| Onboarding | Wizard page, mode chooser, tour, Next steps | Retired; C0 and C2 replace them. |
| Editing | Tool rail plus inspector forms | Click-to-select with one short panel; reuse the existing section forms where they fit. |
| Pages, Design, notice, domain, SEO, footer, logos | Tool rail and Settings view | Kept, grouped into Site settings. Live-saving settings stay live. |

## 8. Calls made while designing (please check)

None of these were discussed explicitly. Each is the conservative choice.

1. Suggested look by type: condo → Bayfront, HOA → Palm Grove, apartment → Plain & Simple.
2. "Hidden when missing" everywhere, instead of sample text.
3. Automatic means linking only, as defined in §6.
4. "Doesn't apply" needs a reason, and the reason is audit-logged.
5. Snooze is 7 days, and the missing count also appears in the existing daily digest.
6. Existing sites keep their look until someone changes it. The only exception is that empty
   boxes disappear everywhere when the shared renderers ship.
7. No contact form in v1, and the main contact's personal email is never shown.
8. Meeting-notice status stays the manager's attestation; nothing stamps it automatically.
9. C4 changes only how sections are edited. Every other editor tool stays, grouped under Site
   settings, and live-saving settings stay live.
10. A Community profile in Settings, with an optional short name that defaults to the full name.
    No building facts in v1.
11. One go-live card on the dashboard: C0 replaces the "Get your community live" panel.
12. Every look works fully on every plan.
13. Board members shows names and the two recorded titles only, never contact details.
14. "Email owners" appears only once there are owners to email, and stays until it has been sent
    or dismissed.

## 9. Left to the builder

- How looks are stored and versioned: code-shipped layouts with presets, the admin catalog, or
  both.
- How linked fields (name, city, unit count) are stored inside section content, and how "the user
  changed this" is tracked so look switches don't overwrite edits.
- The matching method for automatic linking (category, title signals and dates) and its
  confidence threshold, as long as uncertain matches are proposed rather than applied.
- How live previews render cheaply within the budget: inline rendering, iframes or snapshots.
- Feature flag and rollout order. Suggested: new communities first, then the look picker for
  existing ones.
- Final copy for every screen, following the legal-copy rule above.

## 10. How we will know it worked

- Every new community has a live site with no empty sections and no invented facts at creation.
  Check this with a test over every look and an empty community.
- Median time from the first Website-page visit to a published look of their choosing: **under
  3 minutes**.
- Share of checklist items linked automatically at creation and during the first week.
- Share of new communities with zero missing records after 30 days. Today's rate is the baseline.
- Website-related support tickets trend down.

**Acceptance checks for the build**
- A brand-new community with no phone, no office hours and no documents is live at creation. Its
  site shows no empty box and no invented fact, and the alert lists its missing records.
- Picking a different look and clicking **Publish this look** changes the live site in one click,
  and keeps every edit the user had made.
- Renaming the association in the Community profile changes the welcome headline on the live
  site without anyone editing the website.
- A document in a draft state, or not visible to owners, is never linked automatically.
- Publishing never sends an email; **Email owners** sends exactly one.
- Restore returns the previous published version on every plan.
- Quick links shows the next meeting's date with no setup. Board members lists exactly the
  current seat holders and disappears when there are none.
