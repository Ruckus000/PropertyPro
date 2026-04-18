/**
 * Custom MDX components for help articles.
 *
 * These are passed to next-mdx-remote's compileMDX as the components map.
 * All three are server-compatible (no 'use client' directive).
 */
import type { ReactNode } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Callout
// ---------------------------------------------------------------------------

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
          {title && (
            <p className={cn('mb-1 text-sm font-semibold', style.title)}>
              {title}
            </p>
          )}
          <div className={cn('text-sm leading-relaxed', style.body)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepByStep
// ---------------------------------------------------------------------------

interface StepProps {
  title: string;
  image?: string;
  imageAlt?: string;
  children: ReactNode;
}

export function Step({ title, image, imageAlt, children }: StepProps) {
  return (
    <div className="relative pb-8 pl-8 last:pb-0">
      {/* Vertical connector line */}
      <div
        className="absolute left-3 top-8 bottom-0 w-px bg-border-default last:hidden"
        aria-hidden="true"
      />
      {/* Step number circle */}
      <div
        className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-xs font-semibold text-white"
        aria-hidden="true"
      />
      <div>
        <h4 className="mb-1 text-sm font-semibold text-content">{title}</h4>
        <div className="text-sm leading-relaxed text-content-secondary">
          {children}
        </div>
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

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

interface ScreenshotProps {
  src: string;
  alt: string;
  caption?: string;
}

export function Screenshot({ src, alt, caption }: ScreenshotProps) {
  return (
    <figure className="my-6">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge">
        <Image
          src={src}
          alt={alt}
          width={960}
          height={540}
          className="w-full"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-content-tertiary">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Components map for next-mdx-remote
// ---------------------------------------------------------------------------

export const helpMdxComponents = {
  Callout,
  StepByStep,
  Step,
  Screenshot,
};
