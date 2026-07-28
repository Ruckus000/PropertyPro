# Website tab refinement note

Status: draft refinement for the standalone proposal demo
Scope: authenticated Website tab only; landing-page notes remain preserved separately

## Decision

Refine the Website tab into a compact, tabbed workbench. Keep the community navigation stable, keep the public-site preview visible beside the active editor on desktop, and show only one editing panel at a time. The section index exposes the full task model without forcing the user to scroll through unrelated settings.

## Changes in the mockup

- Replaced the vertically stacked editor cards with four focused sections: Welcome, Content, Appearance, and Domain.
- Added a compact section index with status/context labels and a step indicator.
- Kept the preview persistent on desktop and ordered the editor before the preview on narrow screens.
- Preserved draft language, the fixed publish bar, and the explicit full-preview escape hatch.
- Added keyboard arrow navigation between sections and accessible tab/tabpanel semantics.

## Evidence and checks

- Existing repository evidence and requirements continue to target `/pm/settings/website?communityId=X`.
- Desktop and 390px mobile browser checks completed against the standalone mockup.
- Tab clicks and arrow-key navigation were verified; console errors: 0.
- No application source files were changed in this refinement.

## Open implementation question

When this proposal moves into product implementation, confirm whether the existing Website route should preserve the current URL while the workbench state is local, or encode the active section in the URL for deep linking.
