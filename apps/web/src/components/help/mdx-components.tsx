import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

function linkClasses() {
  return 'font-medium text-[var(--interactive-primary)] underline underline-offset-2';
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
  children: ReactNode;
}

export function Step({ title, image, imageAlt, children }: StepProps) {
  return (
    <div className="relative pb-8 pl-8 last:pb-0">
      <div
        className="absolute bottom-0 left-3 top-8 w-px bg-border-default last:hidden"
        aria-hidden="true"
      />
      <div
        className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-xs font-semibold text-white"
        aria-hidden="true"
      />
      <div>
        <h4 className="mb-1 text-sm font-semibold text-content">{title}</h4>
        <div className="text-sm leading-relaxed text-content-secondary">{children}</div>
        {image && (
          <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-edge">
            <Image
              src={image}
              alt={imageAlt ?? title}
              width={800}
              height={450}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface StepByStepProps {
  children: ReactNode;
}

export function StepByStep({ children }: StepByStepProps) {
  return (
    <div className="my-6" role="list" aria-label="Step-by-step guide">
      {children}
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

export const helpMdxComponents = {
  Callout,
  StepByStep,
  Step,
  Screenshot,
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-3xl font-semibold tracking-tight text-content" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="mt-8 text-2xl font-semibold tracking-tight text-content" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="mt-6 text-xl font-semibold text-content" {...props} />
  ),
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
