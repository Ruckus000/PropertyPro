# Evidence brief — draft

Status: draft. This is a repository-based audit, not validated user research.

## Scope

The target is the authenticated Website tab at `/pm/settings/website?communityId=X`, reached from the community sidebar's Website item. It is the property-manager/public-site editor, not the public marketing landing page.

## Detected project context

- Project mode: proposal-demo, workflow phase strategy.
- Origin: existing repository / brownfield UI.
- Stack lane: Next.js App Router with React and TypeScript; Tailwind CSS plus shared semantic tokens and route-aware app shell.
- Accessibility target: WCAG 2.2 AA.
- Design system: warm Florida Modern surfaces, coral interactive primary, teal informational accents, Inter body typography, Fraunces display/page-title typography, 4px spacing rhythm, borders-first surfaces, 44px mobile targets, visible focus, and reduced-motion support.
- Phase profiles: `strategy → direction → handoff → implementation → verification → release`; audit work is limited to `strategy` and a reduced `release` profile. Exit codes are `0` approved, `1` blocked, `2` deterministic checks pass but explicit review is required, and `3` checker/configuration failure. The Next.js/Tailwind lane supports artifact audit, browser verification, and token guidance; auth, server actions, data stores, and project behavior remain project-owned test boundaries.

## Evidence available

1. `apps/web/src/components/layout/app-sidebar.tsx` switches from the community navigation (`NAV_ITEMS` / `NAV_SECTIONS`) to a separate PM navigation (`PM_NAV_ITEMS`) whenever `pathname.startsWith('/pm/')`.
2. `apps/web/src/components/layout/nav-config.ts` exposes a community Website item that routes to `/pm/settings/website?communityId=X`, while the PM nav also has a Website item under a different ID (`branding`). The route therefore changes both URL family and sidebar data source when the Website item is activated.
3. `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx` renders a long single-column editor: onboarding banner, title/status/actions, Welcome card, Content Sections list, Custom Styling card, Custom Domain card, and a sticky PublishBar.
4. `HeroBlockForm.tsx`, `ContentSectionsList.tsx`, `CustomStylingForm.tsx`, `CustomDomainCard.tsx`, and `PublishBar.tsx` show the current controls, states, save/publish actions, plan gates, and draft/published terminology.
5. `apps/web/src/app/(authenticated)/pm/site-preview/page.tsx` renders the same public-site layouts inside an authenticated preview route. `PublicSiteHeader.tsx` and the Tidewater/Sable/Boulevard layouts provide the preview surface and branding signals.
6. `DESIGN.md`, `.claude/rules/design.md`, and `packages/tokens` document the shared visual system: semantic colors, 4px spacing, 44px mobile touch targets, 2px focus rings, reduced motion, and one filled primary CTA per region.

## Current-state inventory

### Navigation

- Community navigation includes `Website` in the Management section.
- Clicking it navigates into `/pm/`, where `AppSidebar` intentionally swaps to a PM-specific list: Communities, Website, Templates, Reports.
- The PM navigation's Website entry uses the `branding` ID but maps to the same website settings destination. This creates a context switch plus duplicate concept labels.

### Editor composition

- The page is a stacked settings document with repeated bordered cards and no persistent live preview in the primary layout.
- Welcome edits, content-section edits, custom styling, and custom domain are vertically separated, so the operator must scroll between the thing being edited and the public-site result.
- A sticky publish bar provides a useful bottom action, but its relationship to section-level Save buttons and draft state is not explained in one visual hierarchy.

### Interaction and states

- Hero and custom styling have local Save actions; content blocks support reorder/remove/add; custom domain has gated, empty, pending, active, and error states; PublishBar handles draft counts, discard, publish, and conflict/error outcomes.
- The code evidence shows strong state coverage, but the page-level visual structure does not visibly group these states into an editing workflow.
- The preview is opened as a separate route/link, rather than being a stable companion to the editor.

## Audit findings — draft

| ID | Slop class | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| STR-01 | interaction / navigation | `/pm/settings/website` changes the entire sidebar data source because `AppSidebar` derives context from the URL prefix. This is likely the nav-change complaint. | `app-sidebar.tsx`, `nav-config.ts` | Keep the community workspace shell stable when Website is selected; represent Website as a selected community tool, with PM portfolio shortcuts as a secondary context rather than a replacement nav. |
| STR-02 | information architecture | Website is represented twice with different IDs (`website` and `branding`) and different navigation contexts. | `nav-config.ts` | Consolidate the concept around one Website destination and one active-state rule, or explicitly label the second entry as Portfolio Website Management. |
| STR-03 | composition | The editor is a long single-column stack of high-value settings with no persistent result preview. | `pm/settings/website/page.tsx` | Use an editor + preview workspace. Keep an accessible compact section index for jumping within the editor while leaving the global sidebar unchanged. |
| STR-04 | interaction | Local saves and global publish are both present, but the hierarchy between “save this section” and “make changes live” is easy to miss. | `HeroBlockForm.tsx`, `CustomStylingForm.tsx`, `PublishBar.tsx` | Make draft status a page-level state near the title, keep local Save inside each section, and make Publish the singular global primary action. |
| STR-05 | composition / density | Repeated full-width cards make Welcome, Content Sections, Styling, and Domain feel equivalent even though they have different frequency and risk. | `pm/settings/website/page.tsx`, site-editor components | Lead with a compact overview, then use a section list with progressive disclosure and a stable preview. Give destructive/advanced controls more separation. |
| STR-06 | design-system | The existing page already uses semantic tokens and canonical sizing, but the demo should make hierarchy more intentional without adding unrelated decorative treatment. | `DESIGN.md`, `.claude/rules/design.md`, page/component classes | Use semantic surfaces, warm neutral page canvas, borders-first cards, measured radius, and a coral primary only for publish/primary next action. |
| STR-07 | accessibility / verification | The repository has strong component-level focus/ARIA patterns, but the target flow needs browser evidence for nav stability, section jump behavior, preview readability, sticky publish bar, and mobile stacking. | `AppSidebar`, site editor components | Add browser checks for 375×812, 768×1024, 1024×768, 1440×1000; keyboard through sidebar/editor/publish; and reduced-motion behavior. |

## Evidence gaps and risks

- No screenshot or recording was supplied; the exact visual state and viewport are unknown.
- It is not yet confirmed whether the user wants the editor page, the public-site preview, or both in one workspace. This audit assumes the Website tab/editor is the primary target and uses the preview as its companion.
- No analytics, user research, or operator interviews were supplied.
- It is unknown whether portfolio users need a cross-community Website management view in the same navigation context.
- The mockup must not imply that example community data, plan entitlements, or preview content is real beyond the repository's existing concepts.

## Required checks before implementation

- Machine: rerun project detection; validate DesignOps manifest and requirements; run the scoped slop scan; run `pnpm guard:design-tokens`, `pnpm lint`, and relevant typecheck/tests for any application change.
- Browser: verify Website click does not replace the community nav model; verify section index keyboard behavior, draft status, preview, publish/discard, focus, responsive stacking, and reduced motion.
- Human review: confirm the desired nav model, decide whether preview is persistent or split-view, validate copy/plan states, and approve the editing workflow before production implementation.

## Next artifact

Create a standalone HTML mockup of the Website editor as a stable community workspace with a compact editor index, visible draft/publish state, and persistent public-site preview.
