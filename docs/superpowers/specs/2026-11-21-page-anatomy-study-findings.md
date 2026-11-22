# Round 1 findings (six readers), consolidated

Text under study: docs/superpowers/specs/2026-11-21-page-anatomy-design.md in
/Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/component-design-modernization-2999df
Paths below are relative to that repo unless absolute. "§" = section of the design doc.

## A. The text against itself
A1. Scope/non-goals/guard/rollout still describe a 96-route `(authenticated)` project; §5.16–5.21 add shell, overlays, help center, onboarding, 32 outside routes incl. /mobile. §2 non-goals exclude /mobile and "replacing guided blueprint"; §7 guard scans only `app/(authenticated)`; §8 has no phase for any of it.
A2. Template count: §2 goal and §5.8 say four; §5.15/§7 say six; §5.9 still lists 12 "bespoke, keep own layout"; §8 phase 3 ends at "named exemptions" while §9 says none.
A3. Display face "exactly three places, nowhere else" (§6.2) vs community name in sidebar, help wordmark/home, brand bar, auth title, phone title. Title size `text-xl` (§5.2, §5.5) vs 30px (§6.5).
A4. Selected page tab: accent underline (§5.10) vs ink (§6.5, §6.8). Coral "means one thing: the action" (§0) vs "and on links" (§6.5).
A5. "Four fixed slots, may not add/rename" (§5.3, closed union in §5.5) vs Details/Related (§5.8), preview (§5.8), field palette (§5.11), "On this page" (§5.19), facts (§5.18). "At a glance required on list pages" vs 7 of 27 lists have none.
A6. "Tile": §5.5 RecordRow "status icon tile", §6.7 "24 in tiles" vs §6.2 "bare glyph, no tile", §6.7 "nothing else gets a tile"; editor's selected section uses the place mark.
A7. Primary action placement: §5.11 steps "header carries only Cancel; Back/Next in footer" vs §5.18 "step's primary lives in the page header"; §5.8 form "footer action bar".
A8. §5.3 "per-page article lookup does not exist on the server" vs §5.20 help dialog "opens on the article for the current page". §5.16 "this settles the laptop-width risk" vs §8/§12 "cannot be settled by a mockup".
A9. Small drifts: "three signatures" (§6.1) vs four; "Ten overlays drawn" but nine listed; card-section loses border (§6.4) vs "same toolbar and footer" (§5.12); "no arbitrary px" (§3) vs 420/680/920px columns and 40px fields; "Clear filters" (§5.7) vs "Clear search" (§5.17); breadcrumb "leaf rule" in §8 though §5.2 leaves the trail alone.

## B. The design against the code
B1. Mockup drawn at fixed 10–14px text and a 16px root. Real app: only `xs` and `sm` exist below body; large-text mode is ON by default (xs→14px, sm→16px: packages/ui/src/styles/tokens.css:428-434); root is fluid (~17.2px at 1280, 18px at 1440: apps/web/src/app/globals.css:14). So the 17.5rem panel is ~315px, the sidebar 16.25rem (NavRail.tsx:438), and "every table fits at 1280 and 1440" (§5.16) and the 960/1000/1300 thresholds are unverified at real sizes. 42px figure and 30px title are off the type scale.
B2. Colours with no token while §2 says no new colours: `#D8CBB8` (firmer + double rule), `#C98A1B` ("aware" pips), ink `#1B1A18` vs `--text-primary #111827`, an rgba scrim. `packages/ui/src/tokens/compliance.ts:13` maps `aware` to `brand` (coral), colliding with "coral = action only". guard:design-tokens / guard:class-resolution will fail or builders will substitute.
B3. Sidebar: expanded/collapsed is user-controlled and persisted in localStorage (sidebar-context.tsx:12,28-43); rail is 4.5rem not 56px; cq thresholds are px while sidebar is rem. A second desktop shell exists behind `NEXT_PUBLIC_TOP_NAV_ENABLED` (top-nav-*.tsx) that the doc ignores. #1458 (2026-11-11) decided phones navigate with the tab row and #1460 that portfolio pages have no rail; §5.16 specifies a phone drawer and a rail without acknowledging either.
B4. "Next deadline" in the top bar and the "As of" stamp have no data path: app-shell and app-top-bar are client components; the server layout does not re-run on client navigation; no channel passes a page's read time to the shell.
B5. `PageHeader`'s `description` prop is deprecated and unrendered (page-header.tsx:29-35); painting app-wide in phase 1 paints unreviewed stale copy on 93 call sites; tests pin `sr-only` (page-header.test.tsx:27,32).
B6. Kit/primitive changes reach admin (a non-goal): admin imports EmptyState 17–19 files, Badge 16–19, Button 22–28, AlertBanner 12–18, Card 7, QuickFilterTabs 6, KpiCard 4, Dialog; shared status config. `guard:admin-semantic-css` needs a build and is not in `pnpm lint`.
B7. Fraunces is ALREADY loaded and preloaded in web (apps/web/src/app/layout.tsx:53-58) and a global `h1` rule already applies it (globals.css:32-34). The vendored file has only `opsz` and `wght` axes, so "SOFT 0 / WONK 0" is a no-op. Geist Mono is `preload:false` but the design puts mono in first-paint chrome. So §6.7's "must be added… small font-loading cost" is false, and painting h1s makes every title serif immediately.
B8. Icons today are sized mostly by className (`h-4 w-4`), passed as component references (`icon: LucideIcon`, nav-config.ts:60; 239 such uses); 232 web files + 8 packages/ui + 74 admin import lucide. The guard as specified (ban `size`/`strokeWidth` props) misses className sizing and says nothing about packages/ui or admin.
B9. Perf: hard route budget 1160 KiB; settings last at 1128.6; shell ~1017; aggregate 1435 vs 1403.4 (scripts/perf-check.ts:37-60). ~31 KiB headroom, and the shell is on every route. Icon registry, deadline chip, help dialog in the shell can fail required `perf-check` for every PR.
B10. Tests: 53 unit files and 41 e2e lines query headings; 9–18 files reference help-widget or its flag; e2e (floor 69) is not a required check, so breakage can merge.

## C. Accessibility (ratios computed from the mockup's hex values)
C1. Control boundaries fail 1.4.11 (3:1): input/select/radio/outline-button borders `#E3D8C9` on card = 1.40:1; off toggle track 1.40:1, knob vs track 1.41:1; firmer rule 1.5–1.58:1; hairline 1.15–1.22:1.
C2. Type below the app's own floor (16px body; `xs` is "metadata-only"): deadline count 12px mono, "Next deadline" 12px, row meta/hints/About 13px, table headers 12px, stamps/nav counts/kbd/help meta 11px, chart labels 10px. Rule 1's main datum is caption-sized.
C3. Status is glyph-only and glyphs are aria-hidden (§6.2 "a row shows the bare glyph"); slots, checklists, timelines, toast carry no status word. At 12–14px the dashed ring reads as a faint solid ring; done and overdue are both solid discs differing by a ~6px mark and hue.
C4. Time-left chip: pips aria-hidden; "9d left" does not state its level; "9d" read as "nine d"; aware pip 2.09:1 vs unfilled; amber/orange/red pips 1.31–1.71:1 apart; unfilled pip 1.40:1 on card.
C5. Attention vs error vs callouts differ only by rule colour (the signature look hides the icon, contradicting §5.3 "warning style with icon"); danger vs warning rule 1.31:1 apart; teal vs amber callout 1.59:1; auth errors a left rule only.
C6. Phone tables: `display:block` on table/tr/td drops table semantics; labels via `::before{content:attr()}` unreliable; phone calendar events at `font-size:0` leave unnamed 11px marks.
C7. Side panel splits into two places when narrow (two slots above, two below): CSS reorder breaks reading/focus order; no landmark; heading levels unspecified (painted h1 → sections/slots must be h2).
C8. Icon rail hides labels with no tooltip/accessible name; costly for non-technical users.
C9. Small targets outside `.btn`: bare 16px close icon; 13px text links ~20px tall ("Doesn't apply", "Hide setup for now", "Mark all read"); the phone 44px rule covers only buttons.
C10. Overlay behaviour unspecified: focus trap/return, Escape, toast duration (auto-dismissing Undo breaks 2.2.1), role=status, skeleton aria-busy, unread via `title`, idle-timeout dialog undrawn.
C11. Tertiary text has no margin: `#78716C` on page 4.495:1; on muted 4.21:1; real gray-500 on muted 4.24:1; urgent amber on muted 4.40:1; real placeholder gray-400 2.52:1.

## D. Roles, data and states nobody drew
D1. "Next deadline" on every screen links to Compliance, which is admin-only and feature-gated (nav-config.ts:232-238), false for apartments (community-features.ts:103), unreadable by tenants (rbac-matrix.ts:171), and below 25 units/100 parcels no clock runs (`postingClockApplies`, posting-deadline.ts). PM portfolio routes have no tenant in scope. No "none" state defined.
D2. Chip count wrong at boundaries: tiers jump "urgent 1–7" → "critical overdue" with no day 0; today's label uses Math.ceil (compliance-checklist-item.tsx:48-52) so 23h reads "1d", and 1h past reads "Due today" while the calculator already says overdue (compliance-calculator.ts:86). 48-hour board notice drawn as "2d". notice-window.ts already uses hours under two days.
D3. Deadlines that are not a countdown: posted-late stays overdue permanently (calculator 76-82); rolling-window overdue has no date (67-71); `not_applicable`; null deadline. Rule 1 forbids a bare date; the chip has no closed set of states.
D4. Plan-locked and lapsed pages (`locked-feature-screen.tsx`, `lapsed-feature-screen.tsx`) paint their own h1/illustration/"Upgrade now" and are not among the five states. On Palm Shores (Essentials, where most demo personas land) Payments, Violations, Board, Operations are locked.
D5. Permission denied is silent: 79 redirects to `/dashboard?reason=…` and no reader of `reason` was found (medium confidence on the absence).
D6. "Showing 4 of 22" and filter-chip counts cannot be computed: pagination returns `hasMore` only (packages/db/src/pagination.ts:236-257); walkPaginated caps at 2,000.
D7. Side-panel figures ignore role and legal switches: /emergency draws "By text 118" but SMS is gated (emergency/new/page.tsx:64); fines gated (violations/page.tsx:77); owners can open Emergency. §5.3 only says "no content → no panel".
D8. Banners stack above the shape (support, billing, free-access, demo-trial: app-shell.tsx:294-339; layout.tsx:69), then continue-setup, tabs, header; with the panel stacked above the list, records start below the fold.
D9. Read-only viewers (demo grace, lapsed PM: `assertNotDemoGrace` in 203 files) still get a coral primary.
D10. Timezone: community timezone is passed to Compliance but the chip's date, "Today" and "As of" have no rule; Florida spans two zones.
D11. Partial failure: §5.17 says the panel stays on error, but §5.3 feeds it from the same query as the list.
D12. Critical items in a calm page: "Needs attention" has only a warning rule; "Send alert" is the same coral as "Add package".

## E. Rollout
E1. No way for the owner to see the pilot before customers: apps/web/vercel.json `ignoreCommand` builds previews only on API/contract paths; local sandboxes are constrained; §8 paints titles app-wide in the same phase as the review. So "review live" = production after merge.
E2. Realistic size ~45–70 PRs, not "3+". §8 needs named workstreams.
E3. Phase 0 says "no page changes" yet includes §6 visual rules that change shared primitives (see B6).
E4. `components/layout` had 18 commits in 30 days, nav-config 9; 43 commits landed on main Nov 20–21; onboarding (#1470–#1488) merged yesterday and §5.18 reworks it.
E5. No screenshot/visual-regression tests exist (zero `toHaveScreenshot`); "page 60 of 96 matches the direction" is unprovable. Migrating tables must ratchet `responsive-geometry-baseline.json`; mobile holds 15 of 27 design-token-baseline entries.
E6. Copy carries legal and RBAC claims with no owner: ~55 descriptions, "About: who can do what", "can be undone", statute chips, a standing "Next deadline". `guard:page-state-copy` exists because such claims drifted twice.
E7. Recommended order from the rollout reader: fix the doc → additive kit/Icon/guards with CI-measured perf → pilot with titles painted only inside PageLayout + a preview path → shell after the phone-nav decision → dashboard, settings → lists/details/forms by nav group with onboarding folded per page → overlays/help dialog with admin checks → help center, auth, outside routes; mobile as its own programme; help articles last.

## F. The people who use it
F1. The standing "Next deadline: 3d overdue" follows an anxious volunteer onto Forum and Settings, including items they cannot clear alone; residents may get it too.
F2. First-run reassurance is buried: Compliance first run's description is "Your 30-day posting window has started"; "Nothing is late" was dropped; 11 equal Upload buttons and no header primary; on a phone "0 of 13" comes first.
F3. Shared routes have no resident design with data: §5.14 lists Payments, ARC, Visitors, Violations but not Documents, Meetings, Operations. Drawn Documents shows "Statutory record / State / Post by" and a statute chip; Meetings opens on "Next notice owed".
F4. "Report a leak" for a resident on a phone: drawer → "Operations" → five tabs → header button → sheet. On /mobile: Home → Maintenance → Submit Request → six fields, hand-typed unit, back goes Home.
F5. Rule 1's information ("9d left", statute chips, stamps) is set in the smallest type; pips need learning.
F6. Professional manager loses speed: stacked panel pushes the table down on every visit; tables over five columns silently drop one; toolbar has no slot for selection, bulk actions or export.
F7. Dashboard trades today's plain-language status sentence (`StatusHero`/`buildStatusSentence`, dashboard/page.tsx) for "86%"; setup rail undrawn; "Welcome, Ana" revives the greeting header the owner banned on mobile.
F8. "About" is the wrong name for who-can-do-what/how-you'll-hear; the registrar's voice contradicts design.md's encouraging-copy rule for empty states; "As of" invites "is this stale?".
F9. Some pages get a 280px column for one sentence (Forum: About only; Notifications: "2 unread" + one shortcut), against the doc's own anti-goal.
F10. Quiet auth undersells the product: the login photo was community identity.
