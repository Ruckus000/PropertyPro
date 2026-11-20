/**
 * The context column beside a setup or waiting state (spec §4.1 "Fill with
 * information, never with filler", §6.2 "one container level", §6.3).
 *
 * Headed sections and hairline rows only; never cards inside the card.
 * Help links point only at articles under apps/web/src/content/help/.
 */

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function ContextSection({ title, children }: { title: string; children: React.ReactNode }) {
  const titleId = React.useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h3 id={titleId} className="text-sm font-semibold text-content">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Label-and-detail rows, e.g. who sees what. */
export function ContextRows({ rows }: { rows: Array<{ label: string; detail: string }> }) {
  return (
    <ul className="divide-y divide-edge">
      {rows.map((row) => (
        <li key={row.label} className="flex min-h-14 flex-col justify-center gap-1 py-3">
          <span className="text-sm font-semibold text-content">{row.label}</span>
          <span className="text-xs text-content-secondary">{row.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** Help article links. */
export function ContextLinks({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <ul className="divide-y divide-edge">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="flex min-h-14 items-center gap-3 py-3 text-sm text-content hover:underline">
            {link.label}
            <ChevronRight aria-hidden="true" className="ml-auto size-4 text-content-secondary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
