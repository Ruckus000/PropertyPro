/**
 * Publish-time validation.
 *
 * Two principles, both learned from the roadmap's own review:
 *
 * 1. **Zod does the work.** Every rule a block schema already expresses is
 *    surfaced by parsing, not re-implemented. This module adds only what a
 *    single schema structurally cannot see — cross-section rules, and the
 *    blocking-vs-advisory distinction that `safeParse` has no concept of.
 *
 * 2. **The blocking set is small on purpose.** Only schema-invalid content, an
 *    unknown block type, and illegal or duplicated slots stop a publish.
 *    Everything else warns. A gate that blocks on taste is a gate PMs learn to
 *    route around, and every false block is a PM unable to ship a typo fix.
 */
import { BLOCK_TYPES, TOMBSTONE_BLOCK_TYPE, blockSchemaRegistry } from '../site-blocks/index';
import type { BlockType } from '../site-blocks/types';
import { zodIssuesToFields } from './canonical';
import type { Issue, SiteSnapshot } from './types';

const HERO_SLOT = 1;
const MAX_SLOT = 99;

/** Copy the onboarding wizard seeds; still present at publish time means untouched. */
const SEEDED_HERO_HEADLINES = new Set(['Welcome', 'Welcome to our community']);

/** Below this a text section is likely a placeholder rather than content. */
const SHORT_TEXT_BODY_CHARS = 20;

function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

/** True when a string clears zod's `.min(1)` but carries no actual content. */
function isBlank(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.trim().length === 0;
}

/**
 * Issues for one section's content.
 *
 * `prefix` scopes the reported `field` paths so a caller diffing a whole site
 * can point at the offending section rather than at a bare `body`.
 */
export function blockIssues(blockType: string, content: unknown, prefix = ''): Issue[] {
  if (blockType === TOMBSTONE_BLOCK_TYPE) return [];

  if (!isBlockType(blockType)) {
    // The renderer skips an unknown type silently, so the section would simply
    // vanish from the published page with no explanation.
    return [
      {
        field: prefix || 'blockType',
        message: `"${blockType}" is not a section type this site can show, so it would not appear once published.`,
        severity: 'error',
      },
    ];
  }

  const parsed = blockSchemaRegistry[blockType].safeParse(content);
  if (!parsed.success) {
    return zodIssuesToFields(parsed.error, prefix).map((f) => ({ ...f, severity: 'error' as const }));
  }

  return advisoryIssues(blockType, parsed.data, prefix);
}

/** Warnings only — things worth saying that must never block a publish. */
function advisoryIssues(blockType: BlockType, data: unknown, prefix: string): Issue[] {
  const issues: Issue[] = [];
  const at = (field: string) => (prefix ? `${prefix}.${field}` : field);
  const record = (data ?? {}) as Record<string, unknown>;

  // Whitespace-only strings clear `.min(1)` today. The real fix is
  // `.trim().min(1)` on the schemas, but that tightens the write contract and
  // would start rejecting content already in the database — so this phase
  // warns and a follow-up tightens.
  for (const [key, value] of Object.entries(record)) {
    if (isBlank(value)) {
      issues.push({
        field: at(key),
        message: 'This is only spaces, so it will look empty on the page.',
        severity: 'warning',
      });
    }
  }

  if (blockType === 'text') {
    const body = record['body'];
    if (typeof body === 'string' && body.trim().length > 0 && body.trim().length < SHORT_TEXT_BODY_CHARS) {
      issues.push({
        field: at('body'),
        message: 'This section is very short — visitors may not find it useful yet.',
        severity: 'warning',
      });
    }
  }

  if (blockType === 'gallery') {
    const images = record['images'];
    if (Array.isArray(images) && images.length === 1) {
      issues.push({
        field: at('images'),
        message: 'A gallery with one photo reads as a single image — consider the Image section instead.',
        severity: 'warning',
      });
    }
  }

  if (blockType === 'faq') {
    const items = record['items'];
    if (Array.isArray(items)) {
      items.forEach((item, i) => {
        const answer = (item as Record<string, unknown> | null)?.['answer'];
        if (isBlank(answer)) {
          issues.push({
            field: at(`items.${i}.answer`),
            message: 'This answer is blank, so the question will appear unanswered.',
            severity: 'warning',
          });
        }
      });
    }
  }

  return issues;
}

/** Issues for the hero, including the "still the seeded placeholder" nudge. */
export function heroIssues(content: unknown, prefix = 'hero'): Issue[] {
  const issues = blockIssues('hero', content, prefix);
  if (issues.some((i) => i.severity === 'error')) return issues;

  const record = (content ?? {}) as Record<string, unknown>;
  const headline = record['headline'];
  if (typeof headline === 'string' && SEEDED_HERO_HEADLINES.has(headline.trim())) {
    issues.push({
      field: `${prefix}.headline`,
      message: 'The welcome headline is still the default — a community name reads better.',
      severity: 'warning',
    });
  }

  // An alt text equal to the filename tells a screen-reader user nothing.
  const alt = record['heroImageAlt'];
  const path = record['heroImagePath'];
  if (typeof alt === 'string' && typeof path === 'string') {
    const filename = path.split('/').pop() ?? '';
    if (filename.length > 0 && alt.trim() === filename) {
      issues.push({
        field: `${prefix}.heroImageAlt`,
        message: 'The image description is just the filename — describe what the photo shows.',
        severity: 'warning',
      });
    }
  }

  return issues;
}

/**
 * Whole-site issues: the cross-section rules no single block schema can see.
 *
 * The slot rules deliberately reuse the wording of
 * `starterPackBlocksSchema.superRefine` so the PM-facing and admin-facing
 * messages for the same broken shape cannot drift apart.
 */
export function siteIssues(next: SiteSnapshot): Issue[] {
  const issues: Issue[] = [];
  const tombstoned = new Set(next.tombstonedSlots ?? []);

  if (!next.hero) {
    // A warning, not an error: the public site renders an empty-state hero
    // fallback, so a heroless site is plain rather than broken. Blocking here
    // would refuse a publish for a state the renderer explicitly supports.
    issues.push({
      field: 'hero',
      message: 'This site has no welcome section, so visitors land on the first content section.',
      severity: 'warning',
    });
  } else {
    issues.push(...heroIssues(next.hero.content));
    if (next.hero.slot !== HERO_SLOT) {
      issues.push({
        field: 'hero.slot',
        message: 'The hero block must be at blockOrder 1',
        severity: 'error',
      });
    }
  }

  const seen = new Set<number>();
  next.sections.forEach((section, i) => {
    const field = `sections.${i}`;

    if (seen.has(section.slot)) {
      issues.push({
        field: `${field}.slot`,
        message: `Duplicate blockOrder ${section.slot}`,
        severity: 'error',
      });
    }
    seen.add(section.slot);

    if (section.slot === HERO_SLOT && section.blockType !== 'hero') {
      issues.push({
        field: `${field}.slot`,
        message: 'Non-hero blocks must be at blockOrder 2 or higher',
        severity: 'error',
      });
    }
    if (section.blockType === 'hero' && section.slot !== HERO_SLOT) {
      issues.push({
        field: `${field}.slot`,
        message: 'The hero block must be at blockOrder 1',
        severity: 'error',
      });
    }
    if (!Number.isInteger(section.slot) || section.slot < HERO_SLOT || section.slot > MAX_SLOT) {
      issues.push({
        field: `${field}.slot`,
        message: `blockOrder must be a whole number between 1 and ${MAX_SLOT}`,
        severity: 'error',
      });
    }

    // A slot staged for deletion is not going to be published, so validating
    // its content would block a publish on a section that is being removed.
    if (tombstoned.has(section.slot)) return;
    issues.push(...blockIssues(section.blockType, section.content, `${field}.content`));
  });

  return issues;
}

/** A publish is blocked only by an `error`. Warnings are surfaced, never gates. */
export function publishBlocked(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
