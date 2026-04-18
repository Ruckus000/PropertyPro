import type { ComponentPropsWithoutRef } from 'react';

function linkClasses() {
  return 'font-medium text-[var(--interactive-primary)] underline underline-offset-2';
}

export const helpMdxComponents = {
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
