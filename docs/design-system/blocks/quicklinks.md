# Quick Links Block

Shortcuts to the other sections on the same page. Added by the website builder's looks (D16), as a read release first: renderers in Phase 2A, writers in Phase 2B.

## Schema

Source: [`packages/shared/src/site-blocks/quicklinks.ts`](../../../packages/shared/src/site-blocks/quicklinks.ts).

```ts
{
  hidden?: true;
}
```

`strict()`. Which links appear, and where each points, is decided when the page renders, so there is nothing else to store: a stored link list would be a second place for a target to go stale.

## Links

In this order:

| Link | Target | Shown when |
|---|---|---|
| Meetings, with "Next: Tue, Nov 17" | `#meetings` | the page's Meetings section has an upcoming meeting in its own window |
| News | `#announcements` | the page's Announcements section has an announcement in its own window |
| Owner documents | `/auth/login` | always |
| Contact | `#contact` | the page's Contact section has something to show for its own board and management switches (`contactHasContent`) |

"The page's section" is the first section of that type on the page: the one carrying the anchor. A section whose content fails its schema renders nothing, so it counts as absent. The section still renders when Owner documents is the only link.

## Renderer

[`QuickLinksBlock.tsx`](../../../apps/web/src/components/public-site/blocks/QuickLinksBlock.tsx) (async shell) and [`QuickLinksBlockView.tsx`](../../../apps/web/src/components/public-site/blocks/QuickLinksBlockView.tsx) (pure view).

- The layouts pass every block `pageSections` (the page's sections, in order) and the first section of each data type an `anchorId` equal to its type ([`page-sections.ts`](../../../apps/web/src/components/public-site/blocks/page-sections.ts)), so ids never repeat. The shell reads only the sections that are on the page.
- The next meeting's date is formatted in the community's time zone, as the Meetings section formats its dates.
- The editor canvas cannot see the rest of the page, so it previews each link the community's data supports, as beside sections with their default settings (`selectQuickLinks`). The canvas renders no anchors.

## Tier

Every plan.

## Accessibility

- A region named by a visually hidden `<h2>` "Quick links"; a row of shortcuts reads without a visible heading.
- Each link is at least 44 px tall and shows a focus ring. Icons are `aria-hidden`.
