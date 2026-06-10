import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Children, cloneElement, isValidElement } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { slugifyHeading } from '@/lib/help/anchors';
import { MediaFrame } from '@/components/help/media-frame';

function linkClasses() {
  return 'font-medium text-[var(--interactive-primary)] underline underline-offset-2';
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

const CALLOUT_STYLES = {
  info: {
    border: 'border-blue-200',
    bg: 'bg-blue-50',
    icon: 'ℹ',
    title: 'text-blue-900',
    body: 'text-blue-800',
  },
  warning: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    icon: '⚠',
    title: 'text-amber-900',
    body: 'text-amber-800',
  },
  tip: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    icon: '💡',
    title: 'text-emerald-900',
    body: 'text-emerald-800',
  },
  'florida-statute': {
    border: 'border-purple-200',
    bg: 'bg-purple-50',
    icon: '§',
    title: 'text-purple-900',
    body: 'text-purple-800',
  },
} as const;

type CalloutType = keyof typeof CALLOUT_STYLES;

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const style = CALLOUT_STYLES[type];

  return (
    <div
      className={cn('my-6 rounded-[var(--radius-md)] border p-4', style.border, style.bg)}
      role="note"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
          {style.icon}
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className={cn('mb-1 text-sm font-semibold', style.title)}>{title}</p>}
          <div className={cn('text-sm leading-relaxed', style.body)}>{children}</div>
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  title: string;
  image?: string;
  imageAlt?: string;
  /** Step screenshot dimensions; default matches the 1440×900 capture viewport. */
  imageWidth?: number;
  imageHeight?: number;
  children: ReactNode;
  /** Injected by <StepByStep/> — do not set in MDX. */
  index?: number;
  /** Injected by <StepByStep/> — do not set in MDX. */
  isLast?: boolean;
}

export function Step({
  title,
  image,
  imageAlt,
  imageWidth = 1440,
  imageHeight = 900,
  children,
  index,
  isLast = false,
}: StepProps) {
  return (
    <div className="relative pb-8 pl-9 last:pb-0" role="listitem">
      {!isLast && (
        <div className="absolute bottom-0 left-3 top-8 w-px bg-edge" aria-hidden="true" />
      )}
      <div
        className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-xs font-semibold text-white"
        aria-hidden="true"
      >
        {index}
      </div>
      <div>
        <h4 className="mb-1 text-sm font-semibold text-content">{title}</h4>
        <div className="text-sm leading-relaxed text-content-secondary">{children}</div>
        {image && (
          <MediaFrame
            src={image}
            alt={imageAlt ?? title}
            width={imageWidth}
            height={imageHeight}
          />
        )}
      </div>
    </div>
  );
}

interface StepByStepProps {
  children: ReactNode;
}

export function StepByStep({ children }: StepByStepProps) {
  // MDX may interleave whitespace text nodes between <Step> elements —
  // filter to elements before computing indices.
  const steps = Children.toArray(children).filter(isValidElement);
  return (
    <div className="my-6" role="list" aria-label="Step-by-step guide">
      {steps.map((child, i) =>
        cloneElement(child as React.ReactElement<StepProps>, {
          index: i + 1,
          isLast: i === steps.length - 1,
        }),
      )}
    </div>
  );
}

interface ScreenshotProps {
  src: string;
  alt: string;
  caption?: string;
}

export function Screenshot({ src, alt, caption }: ScreenshotProps) {
  return (
    <figure className="my-6">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge">
        <Image src={src} alt={alt} width={960} height={540} className="w-full" />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-content-tertiary">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  resident: 'Resident',
  board_member: 'Board member',
  board_president: 'Board president',
  cam: 'CAM',
  site_manager: 'Site manager',
  property_manager_admin: 'Property manager',
  manager: 'Property manager',
  pm_admin: 'Property manager',
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
      className="my-4 rounded-[var(--radius-md)] border border-dashed border-edge-strong bg-surface-muted p-3 text-sm text-content-secondary"
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
      className="inline-flex items-baseline gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-900"
      title={title}
      aria-label={title ? `Florida statute ${cite}: ${title}` : `Florida statute ${cite}`}
    >
      <span aria-hidden="true">§</span>
      <span>{cite.replace(/^§\s*/, '')}</span>
      {children && <span className="text-purple-800">— {children}</span>}
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
    <nav
      aria-label="Article contents"
      className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-4"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
        On this page
      </p>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li
            key={item.anchor}
            className={cn(
              'leading-6',
              item.depth === 3 && 'pl-4 text-content-secondary',
            )}
          >
            <a
              href={`#${item.anchor}`}
              className="text-content-secondary hover:text-[var(--interactive-primary)] hover:underline"
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

export const helpMdxComponents = {
  Callout,
  StepByStep,
  Step,
  Screenshot,
  RoleBadge,
  FeatureGate,
  StatuteRef,
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-3xl font-semibold tracking-tight text-content" {...props} />
  ),
  h2: ({ children, id, ...props }: ComponentPropsWithoutRef<'h2'>) => {
    const anchor = id ?? headingId(children);
    return (
      <h2
        id={anchor}
        className="mt-8 scroll-mt-24 text-2xl font-semibold tracking-tight text-content"
        {...props}
      >
        {children}
      </h2>
    );
  },
  h3: ({ children, id, ...props }: ComponentPropsWithoutRef<'h3'>) => {
    const anchor = id ?? headingId(children);
    return (
      <h3
        id={anchor}
        className="mt-6 scroll-mt-24 text-xl font-semibold text-content"
        {...props}
      >
        {children}
      </h3>
    );
  },
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className="mt-4 leading-7 text-content-secondary" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-content-secondary" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 text-content-secondary" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => <li className="leading-7" {...props} />,
  a: (props: ComponentPropsWithoutRef<'a'>) => <a className={linkClasses()} {...props} />,
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className="mt-4 rounded-r-lg border-l-4 border-[var(--interactive-primary)]/40 bg-surface-muted px-4 py-3 text-content-secondary"
      {...props}
    />
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-content" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<'code'>) => (
    <code className="rounded bg-surface-muted px-1 py-0.5 text-sm text-content" {...props} />
  ),
  hr: () => <hr className="my-8 border-edge" />,
};
