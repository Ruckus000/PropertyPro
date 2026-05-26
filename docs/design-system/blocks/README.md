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
