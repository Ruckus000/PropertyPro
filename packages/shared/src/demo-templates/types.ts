import type { CommunityType } from '..';

/**
 * All 12 canonical demo template IDs.
 * IDs follow the pattern: `{communityType}-{variant}-{name}`.
 */
export const DEMO_TEMPLATE_IDS = [
  'condo-public-civic-glass',
  'condo-public-coastal-welcome',
  'condo-mobile-resident-bulletin',
  'condo-mobile-concierge-snapshot',
  'hoa-public-neighborhood-hub',
  'hoa-public-board-transparency',
  'hoa-mobile-community-pulse',
  'hoa-mobile-board-brief',
  'apartment-public-resident-services',
  'apartment-public-maintenance-first',
  'apartment-mobile-tenant-essentials',
  'apartment-mobile-service-snapshot',
] as const;

/** A valid demo template identifier. */
export type DemoTemplateId = (typeof DEMO_TEMPLATE_IDS)[number];

/** Whether the template targets a public-facing site or a mobile view. */
export type TemplateVariant = 'public' | 'mobile';

/** Layout hints used to render the template thumbnail. */
export type ThumbnailLayout =
  | 'stats-hero'
  | 'hero-centered'
  | 'feed-list'
  | 'card-grid'
  | 'sidebar-content'
  | 'split-feature';

/** Describes the thumbnail that represents a template in the picker UI. */
export interface ThumbnailDescriptor {
  /** Two-stop gradient expressed as CSS color strings: [start, end]. */
  gradient: [string, string];
  /** Layout variant for rendering the thumbnail preview. */
  layout: ThumbnailLayout;
}

/** Runtime context passed to a template's `build()` function. */
export interface DemoTemplateRenderContext {
  /** Display name of the community. */
  communityName: string;
  /** Optional branding tokens. Falls back to template defaults when absent. */
  branding?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontHeading: string;
    fontBody: string;
  };
}

/** A fully-described demo template that can render a JSX source string. */
export interface DemoTemplateDefinition {
  /** Unique template identifier. */
  id: DemoTemplateId;
  /** The community type this template is designed for. */
  communityType: CommunityType;
  /** Whether this is a public-site or mobile template. */
  variant: TemplateVariant;
  /** Human-readable display name shown in the picker. */
  name: string;
  /** Short descriptor tags shown as chips in the picker (e.g. ['Formal', 'Board-forward']). */
  tags: string[];
  /** One-line description of ideal use case. */
  bestFor: string;
  /** Thumbnail descriptor for the picker card. */
  thumbnail: ThumbnailDescriptor;
  /**
   * Returns a self-contained JSX source string (using React.createElement calls)
   * that defines a top-level `function App()`.  The string is evaluated at
   * runtime inside a sandboxed iframe / preview renderer.
   */
  build(ctx: DemoTemplateRenderContext): string;
}
