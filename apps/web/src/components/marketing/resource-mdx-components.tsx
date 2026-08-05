import React from 'react';
import { slugifyHeading } from '@/lib/help/anchors';

/**
 * MDX component map for public resource articles.
 *
 * Separate from the help map (`components/help/mdx-components.tsx`) on purpose:
 * that one styles with design-token Tailwind classes, which do not exist inside
 * `.marketing-theme`. Everything here composes `mk-*` classes instead.
 *
 * Server-safe — no `'use client'`, no hooks. `compileMDX` runs these during the
 * static render.
 */

/**
 * React children flattened to plain text, for heading ids.
 *
 * A heading is often `<h2>Posting <code>official records</code></h2>`, so the
 * children are an array of elements rather than a string.
 */
function childrenToText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return childrenToText(children.props.children);
  }
  return '';
}

function Heading({
  level,
  children,
}: {
  level: 2 | 3;
  children?: React.ReactNode;
}) {
  const Tag = level === 2 ? 'h2' : 'h3';
  // compileMDX runs with no rehype plugins, so headings carry no id of their
  // own — without this, in-page anchors and the theme's
  // `[id]{scroll-margin-top:80px}` rule are both inert.
  return <Tag id={slugifyHeading(childrenToText(children))}>{children}</Tag>;
}

/** Pull-quote for a statute reference. Factual citation only — never advice. */
export function StatuteCallout({
  cite,
  children,
}: {
  cite: string;
  children?: React.ReactNode;
}) {
  return (
    <aside className="mk-note">
      <strong>{cite}</strong>
      <div>{children}</div>
    </aside>
  );
}

/**
 * The article-level legal notice.
 *
 * Rendered by the article template rather than authored in MDX, so no article
 * can ship without it. `.claude/rules/florida-compliance.md`: PropertyPro does
 * not provide legal advice.
 */
export function ResourceDisclaimer({ reviewedAt }: { reviewedAt?: string }) {
  return (
    <aside className="mk-note mk-note-legal">
      General information about Florida Statutes Chapters 718 and 720
      {reviewedAt ? `, current as of ${reviewedAt}` : null}. PropertyPro is not a
      law firm and does not provide legal advice — confirm how any requirement
      applies to your association with its counsel.
    </aside>
  );
}

/** Tables can overflow a 46em prose column; give them their own scroll box. */
function Table({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mk-table-wrap">
      <table>{children}</table>
    </div>
  );
}

function Anchor({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const isExternal = Boolean(href && /^https?:\/\//i.test(href));
  return (
    <a
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

export const resourceMdxComponents = {
  h2: (props: { children?: React.ReactNode }) => <Heading level={2} {...props} />,
  h3: (props: { children?: React.ReactNode }) => <Heading level={3} {...props} />,
  table: Table,
  a: Anchor,
  StatuteCallout,
};
