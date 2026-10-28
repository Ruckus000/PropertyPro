# Board Members Block

The people who hold board seats, by name and title. Added by the website builder's looks (D16), as a read release first: renderers in Phase 2A, writers in Phase 2B.

## Schema

Source: [`packages/shared/src/site-blocks/board.ts`](../../../packages/shared/src/site-blocks/board.ts).

```ts
{
  heading?: string; // 1–80 characters after trimming; default "Board of Directors"
  hidden?: true;
}
```

`strict()`, so no name, title or contact detail can be stored in the block and go stale.

## Data Source

`getContactInfo({ showBoard: true, showManagement: false })`'s board list, the same roster the Contact section shows:

- the community's `user_roles` rows whose `designation` is `board_president` or `board_member`, joined to `users.full_name`;
- titled by `display_title` when set, else "Board President" or "Board Member".

Designations are read for display only and must never feed a permission decision.

## Rendering Rules

- Name and title only: the shell passes on exactly those two fields, so no email, phone or link can appear.
- No one in a seat: the live site renders nothing (D14). The view keeps a placeholder, "No one holds a board seat yet.", for the editor canvas.

## Renderer

[`BoardBlock.tsx`](../../../apps/web/src/components/public-site/blocks/BoardBlock.tsx) (async shell) and [`BoardBlockView.tsx`](../../../apps/web/src/components/public-site/blocks/BoardBlockView.tsx) (pure view). The editor canvas reads the board from its contact superset (`selectBoard`).

## Tier

Every plan.

## Accessibility

A region named by its `<h2>`, one list item per seat holder, 16 px text.
