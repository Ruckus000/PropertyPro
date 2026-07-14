/**
 * Block Registry reference data (spec §5.4).
 *
 * Read-only catalog surfaced at /admin/site-templates/block-registry: each
 * supported block type, the top-level fields of its Zod content schema, its
 * renderer file path, tier, and documentation link.
 *
 * The field list is introspected from the SINGLE SOURCE OF TRUTH
 * (`blockSchemaRegistry` in @propertypro/shared) so it never drifts from the
 * schemas the renderer + editor actually validate against. We read the public
 * `.shape` (stable across the `.strict().refine()` wrappers these schemas use
 * in Zod 4) and the field's `_zod.def.type` tag, with defensive fallbacks —
 * the companion unit test pins this against every real schema.
 */
import { BLOCK_TYPES, blockSchemaRegistry, type BlockType } from '@propertypro/shared';

export interface BlockField {
  name: string;
  /** Coarse type tag: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum' | … */
  type: string;
  optional: boolean;
  nullable: boolean;
}

export interface BlockRegistryEntry {
  type: BlockType;
  label: string;
  tier: 'essentials' | 'professional';
  rendererPath: string;
  docHref: string;
  summary: string;
  fields: BlockField[];
}

interface BlockMeta {
  label: string;
  tier: 'essentials' | 'professional';
  rendererPath: string;
  summary: string;
}

const RENDERER_DIR = 'apps/web/src/components/public-site/blocks';

const BLOCK_META: Record<BlockType, BlockMeta> = {
  hero: {
    label: 'Hero',
    tier: 'essentials',
    rendererPath: `${RENDERER_DIR}/HeroBlock.tsx`,
    summary: 'Welcome panel — headline, optional subtitle, CTA, and optional hero image.',
  },
  text: {
    label: 'Text',
    tier: 'essentials',
    rendererPath: `${RENDERER_DIR}/TextBlock.tsx`,
    summary: 'Plain-text section with an optional heading. No HTML or markdown.',
  },
  image: {
    label: 'Image',
    tier: 'essentials',
    rendererPath: `${RENDERER_DIR}/ImageBlock.tsx`,
    summary: 'Standalone image with alt text (or decorative) and optional caption.',
  },
  documents: {
    label: 'Documents',
    tier: 'essentials',
    rendererPath: `${RENDERER_DIR}/DocumentsBlock.tsx`,
    summary: 'System-of-record list of published documents (count / category filtered).',
  },
  meetings: {
    label: 'Meetings',
    tier: 'essentials',
    rendererPath: `${RENDERER_DIR}/MeetingsBlock.tsx`,
    summary: 'System-of-record list of upcoming/past meetings with notices.',
  },
  announcements: {
    label: 'Announcements',
    tier: 'essentials',
    rendererPath: `${RENDERER_DIR}/AnnouncementsBlock.tsx`,
    summary: 'System-of-record feed of published community announcements.',
  },
  contact: {
    label: 'Contact',
    tier: 'essentials',
    rendererPath: `${RENDERER_DIR}/ContactBlock.tsx`,
    summary: 'Management contact details (name, email, phone).',
  },
  faq: {
    label: 'FAQ',
    tier: 'professional',
    rendererPath: `${RENDERER_DIR}/FaqBlock.tsx`,
    summary: 'Pro+ polish block — a heading plus a list of question/answer pairs.',
  },
  gallery: {
    label: 'Gallery',
    tier: 'professional',
    rendererPath: `${RENDERER_DIR}/GalleryBlock.tsx`,
    summary: 'Pro+ polish block — a captioned image grid (alt text or decorative per image).',
  },
  amenities: {
    label: 'Amenities',
    tier: 'professional',
    rendererPath: `${RENDERER_DIR}/AmenitiesBlock.tsx`,
    summary: 'Pro+ polish block — a list of community amenities with optional descriptions.',
  },
};

const DOC_BASE = 'docs/design-system/blocks';

/**
 * Describe the top-level fields of a block content schema. Reads the public
 * ZodObject `.shape`, unwrapping optional/nullable/default wrappers to read
 * the underlying type tag.
 */
export function describeBlockFields(schema: unknown): BlockField[] {
  const shape = (schema as { shape?: Record<string, unknown> })?.shape;
  if (!shape || typeof shape !== 'object') return [];

  return Object.entries(shape).map(([name, rawField]) => {
    let field = rawField as { _zod?: { def?: { type?: string; innerType?: unknown } } };
    let optional = false;
    let nullable = false;

    // Unwrap optional / nullable / default chains to reach the base type.
    while (field?._zod?.def) {
      const t = field._zod.def.type;
      if (t === 'optional') {
        optional = true;
        field = field._zod.def.innerType as typeof field;
      } else if (t === 'nullable') {
        nullable = true;
        field = field._zod.def.innerType as typeof field;
      } else if (t === 'default') {
        field = field._zod.def.innerType as typeof field;
      } else {
        break;
      }
    }

    const type = field?._zod?.def?.type ?? 'unknown';
    return { name, type, optional, nullable };
  });
}

/** Build the full read-only block registry view. */
export function getBlockRegistry(): BlockRegistryEntry[] {
  return BLOCK_TYPES.map((type) => {
    const meta = BLOCK_META[type];
    return {
      type,
      label: meta.label,
      tier: meta.tier,
      rendererPath: meta.rendererPath,
      docHref: `${DOC_BASE}/${type}.md`,
      summary: meta.summary,
      fields: describeBlockFields(blockSchemaRegistry[type]),
    };
  });
}
