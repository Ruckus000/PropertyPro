/**
 * What the Add panel offers, and what each new section starts with.
 *
 * ## Why the seeds are here and not "empty"
 *
 * `PATCH /api/v1/pm/site/blocks` validates content against the block's Zod
 * schema and **400s** on a miss, so "insert a blank block and let the PM fill it
 * in" is not an available design — several schemas have required fields
 * (`text.body` is `min(1)`, `amenities.items` is `min(1)`). Every seed below is
 * therefore schema-valid on arrival.
 *
 * That also disposes of the publish-gate hazard: `siteIssues` validates every
 * row in the draft snapshot and `publishBlocked` freezes publishing for the
 * whole community if any row carries an `error`. Because the route refuses
 * invalid content outright, adding a section can never put a site into that
 * state.
 *
 * The seeds are chosen to clear the *advisory* checks too, not just the schema:
 * `text.body` is over the 20-character short-body warning, and no `faq` answer
 * is blank. The one warning that does fire is a one-image `gallery`, which is
 * unavoidable (a gallery must be created with at least one image) and is a
 * warning, never a block.
 *
 * ## Rules for this file
 *
 * Pure data, no React and **no `@propertypro/shared` schema imports** — the
 * catalog is static in the Add panel's chunk, and importing the schema registry
 * to derive seeds would drag zod along with it for no benefit. The seeds are
 * literals that must match those schemas; `add-catalog.test.ts` parses each one
 * against the real registry so they cannot drift.
 */
import {
  CalendarDays,
  CircleDollarSign,
  FileText,
  Images,
  Image as ImageIcon,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircleQuestion,
  Type,
  type LucideIcon,
} from 'lucide-react';

/**
 * Block types the Add panel can create.
 *
 * `hero` is absent because it is not creatable: it is pinned to slot 1, is
 * written through its own endpoint, and is excluded from the upsert contract's
 * enum. `tombstone` is absent because it is a sentinel, never a PM's choice.
 */
export type AddableBlockType =
  | 'text'
  | 'image'
  | 'announcements'
  | 'documents'
  | 'meetings'
  | 'contact'
  | 'faq'
  | 'gallery'
  | 'amenities'
  | 'payments';

export interface AddCatalogEntry {
  blockType: AddableBlockType;
  /** Matches `sectionLabel()` so the panel and the section list agree. */
  label: string;
  /** One line, present tense, describing what visitors will see. */
  description: string;
  icon: LucideIcon;
  /**
   * Pro+ "polish block", gated server-side on `hasSitePolishBlocks`. Rendered
   * disabled-but-visible for Essentials rather than hidden, per spec §3.4.
   */
  isPolish: boolean;
  /**
   * Whether creating this type needs an image upload first. Both types whose
   * schema requires a real storage path (`image.imagePath`,
   * `gallery.images[].imagePath`) do — there is no valid content to seed
   * without one, which is why they route through `AddImageFlow` instead of
   * writing `seed` directly.
   */
  needsImage: boolean;
  /**
   * Content posted on create. `null` for the image-first types, whose content
   * cannot exist before an upload.
   *
   * `{}` is correct wherever every field is optional or defaulted — the route
   * stores `parse.data`, so zod materialises the defaults server-side.
   */
  seed: Record<string, unknown> | null;
}

export const ADD_CATALOG: readonly AddCatalogEntry[] = [
  {
    blockType: 'text',
    label: 'Text',
    description: 'A heading and a paragraph you write yourself.',
    icon: Type,
    isPolish: false,
    needsImage: false,
    // Over SHORT_TEXT_BODY_CHARS (20), so a brand-new section does not
    // immediately raise a "this looks unfinished" advisory. No `heading`:
    // it is `min(1)`, and a placeholder heading reads as leftover scaffolding
    // if the PM publishes before editing.
    seed: { body: 'Tell residents what they need to know about this part of the community.' },
  },
  {
    blockType: 'image',
    label: 'Image',
    description: 'A single photo with a caption.',
    icon: ImageIcon,
    isPolish: false,
    needsImage: true,
    seed: null,
  },
  {
    blockType: 'announcements',
    label: 'Announcements',
    description: 'Your latest announcements, updated automatically.',
    icon: Megaphone,
    isPolish: false,
    needsImage: false,
    seed: {},
  },
  {
    blockType: 'documents',
    label: 'Documents',
    description: 'Documents you have published, updated automatically.',
    icon: FileText,
    isPolish: false,
    needsImage: false,
    seed: {},
  },
  {
    blockType: 'meetings',
    label: 'Meetings',
    description: 'Upcoming meetings and their notices, updated automatically.',
    icon: CalendarDays,
    isPolish: false,
    needsImage: false,
    seed: {},
  },
  {
    blockType: 'contact',
    label: 'Contact',
    description: 'How to reach the board and management.',
    icon: Mail,
    isPolish: false,
    needsImage: false,
    // Explicit rather than `{}`, even though both fields default to true.
    // `ContactForm.toCanonical` always emits both keys; seeding `{}` would
    // leave the form's echo check comparing '{}' against the defaulted object
    // the refetch returns, and every toggle would trigger a spurious save.
    seed: { showBoard: true, showManagement: true },
  },
  {
    blockType: 'faq',
    label: 'FAQ',
    description: 'Questions and answers residents ask most often.',
    icon: MessageCircleQuestion,
    isPolish: true,
    needsImage: false,
    seed: {
      items: [
        {
          question: 'What do residents ask most often?',
          answer: 'Type the answer here. Residents see this text on your website.',
        },
      ],
    },
  },
  {
    blockType: 'gallery',
    label: 'Gallery',
    description: 'A grid of photos of the property.',
    icon: Images,
    isPolish: true,
    needsImage: true,
    seed: null,
  },
  {
    blockType: 'amenities',
    label: 'Amenities',
    description: 'The facilities your community offers.',
    icon: ListChecks,
    isPolish: true,
    needsImage: false,
    seed: { items: [{ name: 'Amenity name' }] },
  },
  {
    blockType: 'payments',
    label: 'Payments',
    description: 'A link to where residents pay their assessments.',
    icon: CircleDollarSign,
    isPolish: false,
    needsImage: false,
    seed: {},
  },
];

/**
 * The hero owns slot 1; content sections run 2..99 (the contract's bounds).
 *
 * These bounds are PER PAGE as of Phase 11c (migration 0048), which dropped
 * `site_blocks_community_order_draft_partial (community_id, block_order,
 * is_draft)`. Each page now gets its own 98 content positions, and two pages
 * holding slot 2 is an ordinary state rather than a constraint violation.
 *
 * This comment used to say the opposite, and said it as load-bearing rationale.
 * It is inverted rather than deleted so the next reader does not re-derive the
 * community-wide rule from the surrounding code and "fix" the allocator back.
 */
export const FIRST_CONTENT_SLOT = 2;
export const LAST_CONTENT_SLOT = 99;

/**
 * The slot a new section should take, or null when every slot on the PAGE it
 * was given is taken.
 *
 * **Must be given every block row of ONE page, tombstones included.**
 *
 * Two independent reasons, and confusing them is how this goes wrong:
 *
 *  1. *Tombstones.* A tombstone is a staged deletion that still occupies its
 *     slot; `upsertPublishedBlock` soft-deletes whatever draft sits at the
 *     target order, so writing over one silently cancels the removal and
 *     republishes a section the PM took off the site. That is why this takes raw
 *     `useContentBlocks` output and not `movableSections`, which filters
 *     tombstones out.
 *
 *  2. *One page* — and this reason is the INVERSE of what it was through 11b.
 *     Until migration 0048, `block_order` was unique community-wide
 *     (`site_blocks_community_order_draft_partial`), so narrowing to the
 *     selected page computed `max(this page) + 1`, very likely a slot another
 *     page already held, and the write failed the unique index. 0048 DROPPED
 *     that index; uniqueness is now `(community_id, page_id, block_order,
 *     is_draft)` and two pages may legally hold the same slot. Spanning every
 *     page is therefore wrong in the opposite direction — it skips past other
 *     pages' numbers and runs this page into the 99 ceiling long before it has
 *     used its own 98 positions. Callers narrow with `blocksForPage` first
 *     (`AddPanel`, and `duplicate` in `editor-context`). The function itself
 *     never changed; what changed is the list it is given.
 *
 *     Do NOT "fix" a cross-page slot collision by widening this input back to
 *     every page — post-0048 there is no such collision to fix.
 *     `add-catalog.test.ts` and `AddPanel.test.tsx` each pin the inversion with
 *     a named case.
 *
 * Appends at `max + 1` rather than filling the first gap: reorders re-stamp the
 * existing sparse slot sequence, so gaps persist indefinitely, and filling one
 * would drop the new section into the middle of the page with no explanation.
 * Gap-filling is the fallback only at the 99 ceiling, where the alternative is
 * refusing to add at all.
 */
export function nextContentSlot(blocks: readonly { blockOrder: number }[]): number | null {
  const occupied = new Set(blocks.map((b) => b.blockOrder));
  const highest = occupied.size === 0 ? 1 : Math.max(...occupied);
  const appended = highest + 1;
  if (appended <= LAST_CONTENT_SLOT) return Math.max(appended, FIRST_CONTENT_SLOT);

  for (let slot = FIRST_CONTENT_SLOT; slot <= LAST_CONTENT_SLOT; slot += 1) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}
