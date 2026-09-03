# Site Block Types

Documentation index for the block types that compose a community's public site. Each block type has:
- A Zod content schema at `packages/shared/src/site-blocks/<type>.ts`
- A React server component renderer at `apps/web/src/components/public-site/blocks/<Type>Block.tsx`
- A doc file in this directory (added alongside the renderer's PR)

## v1 block catalog

| Type            | Category    | Tier         | Renderer PR | Doc                                           |
|-----------------|-------------|--------------|-------------|------------------------------------------------|
| `hero`          | content     | Essentials   | #1b         | [hero.md](./hero.md) — *(added in PR #1b)*    |
| `text`          | content     | Essentials   | #2          | [text.md](./text.md) — *(added in PR #2)*     |
| `image`         | content     | Essentials   | #2          | [image.md](./image.md) — *(added in PR #2)*   |
| `documents`     | SoR         | Essentials   | #4          | [documents.md](./documents.md)                |
| `meetings`      | SoR         | Essentials   | #4          | [meetings.md](./meetings.md)                  |
| `announcements` | SoR         | Essentials   | #3          | [announcements.md](./announcements.md)        |
| `contact`       | SoR         | Essentials   | #4          | [contact.md](./contact.md)                    |

## v1.5 block catalog (Pro+)

| Type        | Category | Tier         | Renderer PR | Doc                                       |
|-------------|----------|--------------|-------------|--------------------------------------------|
| `faq`       | content  | Professional | #10         | [faq.md](./faq.md) — *(added in PR #10)*   |
| `gallery`   | content  | Professional | #10         | [gallery.md](./gallery.md)                 |
| `amenities` | content  | Professional | #10         | [amenities.md](./amenities.md)             |

## Categories

- **Content blocks** — PM-authored. The block content is stored in `site_blocks.content` jsonb and validated against its Zod content schema on read and write.
- **SoR blocks** — System-of-record. The block content carries only configuration (limits, time windows, filter flags). The renderer reads from existing tables (`documents`, `meetings`, `announcements`, `communities`, board members) at render time via `getPublicCommunityScopedReader`.

## Authoring a new block type

1. Add the Zod schema at `packages/shared/src/site-blocks/<type>.ts`.
2. Add the type to `BLOCK_TYPES` in `packages/shared/src/site-blocks/types.ts`.
3. Wire it into the registry at `packages/shared/src/site-blocks/index.ts`.
4. Extend the migration's `block_type` CHECK constraint.
5. Create the renderer at `apps/web/src/components/public-site/blocks/<Type>Block.tsx`.
6. Register the renderer at `apps/web/src/components/public-site/blocks/registry.ts`.
7. Add the PM editor form (under `apps/web/src/components/pm/site-editor/`).
8. Document this block at `docs/design-system/blocks/<type>.md`.

The `registry-completeness.test.ts` at `packages/shared/__tests__/site-blocks/` ensures step 3 is not skipped.

## Cross-cutting content fields

Two optional fields sit on block content schemas across types and are **not** listed in
the per-block field tables above, which document each type's own fields:

| Field     | On                                              | Shape                      | Meaning |
|-----------|-------------------------------------------------|----------------------------|---------|
| `variant` | text, image, faq, amenities, gallery, payments   | enum, optional             | Phase 9 layout variant. Omitted when `standard`, so two identical-looking sections do not differ by key. |
| `hidden`  | every type **except `hero`**                    | `z.literal(true)`, optional | Hidden from visitors, still shown and editable in the site editor. `true` or absent — never `false` — so absence is the only representation of visible. Filtered at the two public render paths by `apps/web/src/lib/site/visible-blocks.ts`; the editor API keeps returning hidden blocks. The hero is the welcome region and cannot be hidden. |

Both are **content**: they draft and publish like any other edit, and every schema is
`.strict()`, so a writer that rebuilds content from a partial view will drop them — see
`inspector/use-block-form.ts` (`PRESERVED_CONTENT_KEYS`) for why `hidden` is preserved
centrally across inspector saves. The admin block registry (`apps/admin/src/lib/site-templates/block-registry.ts`)
introspects the live schema and lists them.
