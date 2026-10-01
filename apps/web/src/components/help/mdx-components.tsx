/**
 * MDX components for help articles. Renders in two pipelines — the full-page
 * route (compileMDX) and the modal (renderToStaticMarkup → sanitizeHelpHtml) —
 * so nothing here may use hooks, handlers or inline styles (see media-frame.tsx).
 *
 * Article-aware pieces (step screenshots, `<OnlyFor>`, `help:` links) need to
 * know which article and reader they render for: build the map with
 * `createHelpMdxComponents(context)`. The context-free `helpMdxComponents`
 * renders them inertly (no shots, every OnlyFor shown, help: links as text).
 */
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Children, cloneElement, isValidElement } from 'react';
import { Info, Lightbulb, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { cn } from '@/lib/utils';
import { slugifyHeading } from '@/lib/help/anchors';
import { resolveHelpShot } from '@/lib/help/media-index';
import { MediaFrame } from '@/components/help/media-frame';

export interface HelpRenderContext {
  /** `<section>/<category>/<slug>` of the article being rendered. */
  articleBase: string;
  /** Community type being read; decides `<OnlyFor>`. */
  communityType: CommunityType;
  /**
   * Resolve a `help:<slug>` link within the reader's section. Returns null
   * when the reader cannot see that article (it then renders as plain text).
   */
  resolveLink: (slug: string) => { href: string; category: string; slug: string } | null;
}

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: ReactNode }>;
    return extractText(element.props.children);
  }
  return '';
}

function headingId(children: ReactNode): string | undefined {
  const text = extractText(children);
  if (!text) return undefined;
  const slug = slugifyHeading(text);
  return slug || undefined;
}

const LINK_CLASSES = 'font-medium text-content-link underline underline-offset-2';
const SHOT_CLASSES = 'block h-auto max-w-full rounded-md border border-edge bg-surface-card';

function StatuteGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex h-[1.125rem] w-[1.125rem] items-center justify-center text-[0.9375rem] font-bold', className)}
    >
      §
    </span>
  );
}

const CALLOUT_STYLES: Record<
  string,
  { container: string; fg: string; Icon: LucideIcon | null; label: string }
> = {
  info: {
    container: 'border-status-info-border bg-status-info-bg',
    fg: 'text-status-info',
    Icon: Info,
    label: 'Note',
  },
  warning: {
    container: 'border-status-warning-border bg-status-warning-bg',
    fg: 'text-status-warning',
    Icon: TriangleAlert,
    label: 'Warning',
  },
  tip: {
    container: 'border-edge bg-surface-subtle',
    fg: 'text-content',
    Icon: Lightbulb,
    label: 'Tip',
  },
  'florida-statute': {
    container: 'border-edge bg-interactive-subtle',
    fg: 'text-content-brand',
    Icon: null,
    label: 'Florida statute',
  },
};

type CalloutType = keyof typeof CALLOUT_STYLES;

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const style = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.info!;
  const { Icon } = style;

  return (
    <div
      className={cn('flex items-start gap-3 rounded-md border px-4 py-[0.875rem]', style.container)}
      role="note"
    >
      <span className={cn('mt-[0.125rem] flex shrink-0', style.fg)}>
        {Icon ? <Icon size={18} aria-hidden="true" /> : <StatuteGlyph />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn('m-0 text-sm font-semibold', style.fg)}>{title ?? style.label}</p>
        <div className="text-sm leading-[1.55] text-content [&_p]:text-sm [&_p]:leading-[1.55] [&_p]:text-content">
          {children}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  title: string;
  /** Captured shot name (see lib/help/media-index.ts). Needs a render context. */
  shot?: string;
  /** Direct asset path, for media that is not a captured shot. */
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  children?: ReactNode;
  /** Injected by <StepByStep/> — do not set in MDX. */
  index?: number;
  /** Injected by <StepByStep/> — do not set in MDX. */
  isLast?: boolean;
  /** Injected by createHelpMdxComponents — do not set in MDX. */
  articleBase?: string;
}

export function Step({
  title,
  shot,
  image,
  imageAlt,
  imageWidth = 1440,
  imageHeight = 900,
  children,
  index,
  isLast = false,
  articleBase,
}: StepProps) {
  const captured = shot && articleBase ? resolveHelpShot(articleBase, shot) : null;
  const alt = imageAlt ?? `Step ${index}: ${title}`;
  return (
    <li className="relative pb-6 pl-10">
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-[0.375rem] left-[0.8125rem] top-8 w-px',
          isLast ? 'bg-transparent' : 'bg-edge',
        )}
      />
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full bg-interactive text-xs font-semibold text-content-inverse"
      >
        {index}
      </span>
      <div className="flex flex-col gap-1 pt-[0.125rem]">
        <h3 className="m-0 text-base font-semibold leading-[1.4] text-content">
          <span className="sr-only">Step {index}: </span>
          {title}
        </h3>
        {children ? (
          <div className="text-base leading-[1.55] text-content-secondary [&_p]:leading-[1.55]">
            {children}
          </div>
        ) : null}
        {captured ? (
          <img
            src={captured.src}
            srcSet={`${captured.src} 1x, ${captured.src2x} 2x`}
            alt={alt}
            width={captured.width}
            height={captured.height}
            loading="lazy"
            decoding="async"
            data-zoomable
            data-media-kind="image"
            className={cn('mt-2', SHOT_CLASSES)}
          />
        ) : image ? (
          <MediaFrame src={image} alt={alt} width={imageWidth} height={imageHeight} />
        ) : null}
      </div>
    </li>
  );
}

interface StepByStepProps {
  children: ReactNode;
  /** First step number, when a list continues an earlier one. */
  start?: number;
  /** Injected by createHelpMdxComponents — do not set in MDX. */
  articleBase?: string;
}

export function StepByStep({ children, start = 1, articleBase }: StepByStepProps) {
  // MDX may interleave whitespace text nodes between <Step> elements —
  // filter to elements before computing indices.
  const steps = Children.toArray(children).filter(isValidElement);
  return (
    <ol role="list" className="m-0 flex list-none flex-col p-0">
      {steps.map((child, i) =>
        cloneElement(child as React.ReactElement<StepProps>, {
          index: start + i,
          isLast: i === steps.length - 1,
          articleBase,
        }),
      )}
    </ol>
  );
}

interface FigureProps {
  shot?: string;
  alt: string;
  /** Caption (markdown allowed). */
  children?: ReactNode;
  /** Injected by createHelpMdxComponents — do not set in MDX. */
  articleBase?: string;
}

export function Figure({ shot, alt, children, articleBase }: FigureProps) {
  const captured = shot && articleBase ? resolveHelpShot(articleBase, shot) : null;
  if (!captured) return null;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <img
        src={captured.src}
        srcSet={`${captured.src} 1x, ${captured.src2x} 2x`}
        alt={alt}
        width={captured.width}
        height={captured.height}
        loading="lazy"
        decoding="async"
        data-zoomable
        data-media-kind="image"
        className={SHOT_CLASSES}
      />
      {children ? (
        <figcaption className="text-sm leading-[1.5] text-content-secondary [&_p]:m-0 [&_p]:text-sm [&_p]:leading-[1.5]">
          {children}
        </figcaption>
      ) : null}
    </figure>
  );
}

interface OnlyForProps {
  /** Space-separated community types, e.g. "condo_718 hoa_720". */
  types: string;
  children: ReactNode;
  /** Injected by createHelpMdxComponents — do not set in MDX. */
  communityType?: CommunityType;
}

export function OnlyFor({ types, children, communityType }: OnlyForProps) {
  if (communityType && !types.split(/\s+/).includes(communityType)) return null;
  return <>{children}</>;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  resident: 'Resident',
  board_member: 'Board member',
  board_president: 'Board president',
  manager: 'Property manager',
};

interface RoleBadgeProps {
  role: string;
  children?: ReactNode;
}

export function RoleBadge({ role, children }: RoleBadgeProps) {
  const label = ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
  return (
    <span
      className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium capitalize text-content-secondary"
      aria-label={`Role: ${label}`}
    >
      {children ?? label}
    </span>
  );
}

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
}

export function FeatureGate({ feature, children }: FeatureGateProps) {
  return (
    <div
      role="note"
      className="rounded-md border border-dashed border-edge-strong bg-surface-muted p-3 text-sm text-content-secondary"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
        Available on {feature}
      </p>
      <div>{children}</div>
    </div>
  );
}

interface StatuteRefProps {
  cite: string;
  title?: string;
  children?: ReactNode;
}

export function StatuteRef({ cite, title, children }: StatuteRefProps) {
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-md bg-status-brand-bg px-1.5 py-0.5 text-xs font-medium text-status-brand"
      title={title}
      aria-label={title ? `Florida statute ${cite}: ${title}` : `Florida statute ${cite}`}
    >
      <span aria-hidden="true">§</span>
      <span>{cite.replace(/^§\s*/, '')}</span>
      {children && <span className="text-status-brand">— {children}</span>}
    </span>
  );
}

interface TocItem {
  depth: 2 | 3;
  label: string;
  anchor: string;
}

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Article contents" className="rounded-md border border-edge bg-surface-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
        On this page
      </p>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.anchor} className={cn('leading-6', item.depth === 3 && 'pl-4 text-content-secondary')}>
            <a
              href={`#${item.anchor}`}
              className="text-content-secondary hover:text-content-link hover:underline"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type { TocItem };

function createAnchor(context: HelpRenderContext | null) {
  return function HelpAnchor({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
    if (typeof href === 'string' && href.startsWith('help:')) {
      const target = context?.resolveLink(href.slice('help:'.length));
      // The design renders a link to an article the reader cannot see (other
      // community type) as plain text rather than a dead end.
      if (!target) return <span>{children}</span>;
      return (
        <a
          href={target.href}
          data-help-article={`${target.category}/${target.slug}`}
          className={LINK_CLASSES}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} className={LINK_CLASSES} {...props}>
        {children}
      </a>
    );
  };
}

const baseComponents = {
  Callout,
  MediaFrame,
  RoleBadge,
  FeatureGate,
  StatuteRef,
  // Markdown ![alt](src) fallback: framed, lazy, zoomable — but no
  // width/height, so no aspect reservation. Authored media should use
  // <Figure>/<Step shot> (see content AUTHORING.md). span, not div: markdown
  // images render inside <p>.
  img: ({ src, alt }: ComponentPropsWithoutRef<'img'>) => (
    <span className="block overflow-hidden rounded-md border border-edge">
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        data-zoomable
        data-media-kind="image"
        className="block h-auto w-full"
      />
    </span>
  ),
  // Articles take their <h1> from frontmatter; a body h1 is demoted.
  h1: ({ children }: ComponentPropsWithoutRef<'h1'>) => (
    <h2 id={headingId(children)} className="m-0 mt-3 scroll-mt-24 text-lg font-semibold leading-[1.35] text-content">
      {children}
    </h2>
  ),
  h2: ({ children, id }: ComponentPropsWithoutRef<'h2'>) => (
    <h2 id={id ?? headingId(children)} className="m-0 mt-3 scroll-mt-24 text-lg font-semibold leading-[1.35] text-content">
      {children}
    </h2>
  ),
  h3: ({ children, id }: ComponentPropsWithoutRef<'h3'>) => (
    <h3 id={id ?? headingId(children)} className="m-0 mt-2 scroll-mt-24 text-base font-semibold leading-[1.4] text-content">
      {children}
    </h3>
  ),
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className="m-0 text-pretty text-base leading-[1.6] text-content-secondary" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-base leading-[1.55] text-content-secondary" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-base leading-[1.55] text-content-secondary" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => <li {...props} />,
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className="m-0 rounded-r-lg border-l-4 border-interactive bg-surface-muted px-4 py-3 text-content-secondary"
      {...props}
    />
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-content" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<'code'>) => (
    <code className="rounded bg-surface-muted px-1 py-0.5 text-sm text-content" {...props} />
  ),
  hr: () => <hr className="my-2 border-edge" />,
};

export function createHelpMdxComponents(context: HelpRenderContext) {
  const { articleBase, communityType } = context;
  return {
    ...baseComponents,
    a: createAnchor(context),
    StepByStep: (props: StepByStepProps) => <StepByStep {...props} articleBase={articleBase} />,
    Step,
    Figure: (props: FigureProps) => <Figure {...props} articleBase={articleBase} />,
    OnlyFor: (props: OnlyForProps) => <OnlyFor {...props} communityType={communityType} />,
  };
}

/** Context-free map: inert shots, every OnlyFor shown, help: links as text. */
export const helpMdxComponents = {
  ...baseComponents,
  a: createAnchor(null),
  StepByStep,
  Step,
  Figure,
  OnlyFor,
};

/** Wrapper class for an article body: the design's 1rem block rhythm. */
export const HELP_ARTICLE_BODY_CLASS = 'flex flex-col gap-4';
