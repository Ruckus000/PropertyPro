import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
// From the file, not `@/lib/utils` (which re-exports the `@propertypro/ui`
// barrel). This module is imported by the server page, and a server component
// importing the barrel puts every 'use client' module it re-exports (Dialog,
// Sheet, cmdk, …) into the route's client bundle: measured +40 KiB on
// /settings, over its hard perf budget. See components/ui/skeleton.tsx.
import { cn } from '@propertypro/ui/utils/cn';

/**
 * Building blocks for the Settings page, in the Geist settings pattern:
 *
 *   section heading + one-line description
 *   ┌───────────────────────────────────────────────┐
 *   │ Label                                 control │  ← SettingsRow
 *   │ Help text                                     │
 *   ├───────────────────────────────────────────────┤
 *   │ Next setting                          control │
 *   ├───────────────────────────────────────────────┤
 *   │ Footnote                         [Save button] │  ← SettingsCardFooter
 *   └───────────────────────────────────────────────┘
 *
 * The page keeps the app's own type and colour tokens; only the structure is
 * borrowed. Settings that save instantly (switches) get no footer; forms that
 * need an explicit save put the button in the footer, at the right.
 */

interface SettingsSectionProps {
  /** Anchor target for the section menu. */
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}

export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold text-content">
          {title}
        </h2>
        {description ? <p className="text-sm text-content-secondary">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SettingsCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'divide-y divide-edge overflow-hidden rounded-md border border-edge bg-surface-card',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** A card's own title strip, for a card that groups several rows under one name. */
export function SettingsCardHeader({
  title,
  description,
  titleAs: Title = 'h3',
  titleId,
  descriptionId,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  titleAs?: 'h3' | 'h4';
  /** For a wrapper that names itself by this title (`aria-labelledby`). */
  titleId?: string;
  /** For a wrapper that describes itself by this description (`aria-describedby`). */
  descriptionId?: string;
}) {
  return (
    <div className="space-y-1 px-5 py-4">
      <Title id={titleId} className="text-base font-semibold text-content">
        {title}
      </Title>
      {description ? (
        <p id={descriptionId} className="text-sm text-content-secondary">
          {description}
        </p>
      ) : null}
    </div>
  );
}

interface SettingsRowProps {
  /** Visible label. Pass a `<Label htmlFor>` when the control needs naming by it. */
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The control, rendered at the right on wide screens and below on phones. */
  control?: React.ReactNode;
  /** Extra content under the label/control line (a list, a nested input). */
  children?: React.ReactNode;
  /**
   * Keep the control on the same line even on phones. Right for a compact
   * control (a switch, a checkbox); wrong for a select or a button.
   */
  inlineControl?: boolean;
  className?: string;
}

export function SettingsRow({
  label,
  description,
  control,
  children,
  inlineControl = false,
  className,
}: SettingsRowProps) {
  return (
    <div className={cn('space-y-3 px-5 py-4', className)}>
      <div
        className={cn(
          'flex gap-3',
          inlineControl
            ? 'items-center justify-between gap-4'
            // Side by side only once the card is wide enough for a label AND
            // a 14rem control; below that the control sits under its label.
            : 'flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-6',
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-base font-medium text-content">{label}</div>
          {description ? <div className="text-sm text-content-secondary">{description}</div> : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** A row that navigates to another settings page. The whole row is the link. */
export function SettingsLinkRow({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-quick hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    >
      <span className="min-w-0 space-y-1">
        <span className="block text-base font-medium text-content">{title}</span>
        <span className="block text-sm text-content-secondary">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
    </Link>
  );
}

/** The shaded strip at the bottom of a card: a footnote at the left, the action at the right. */
export function SettingsCardFooter({
  note,
  children,
}: {
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 bg-surface-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm text-content-tertiary">{note}</div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
