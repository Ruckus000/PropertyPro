/**
 * Documentation hubs (spec §5.5) — links the three engineering/PM
 * documentation locations relevant to the site-templates system as cards.
 * Static reference content; no DB, no write actions.
 */

const GH_BASE = 'https://github.com/Ruckus000/PropertyPro/tree/main';

export interface DocHub {
  title: string;
  description: string;
  href: string;
  /** Short label for the path being linked, shown as a monospace hint. */
  pathLabel: string;
}

export const DOC_HUBS: DocHub[] = [
  {
    title: 'Design System',
    description:
      'Tokens, components, layout primitives, domain patterns, and the public-site block specs.',
    href: `${GH_BASE}/docs/design-system`,
    pathLabel: 'docs/design-system/',
  },
  {
    title: 'Layout Authoring (engineer README)',
    description:
      'How to add a new public-site layout component (Tidewater / Boulevard / Sable) and wire its metadata.',
    href: `${GH_BASE}/apps/web/src/components/public-site/layouts/README.md`,
    pathLabel: 'apps/web/src/components/public-site/layouts/README.md',
  },
  {
    title: 'PM Help Center',
    description:
      'PM-facing help articles (MDX). The source of truth for end-user guidance on customizing a community site.',
    href: `${GH_BASE}/apps/web/src/content/help/pm`,
    pathLabel: 'apps/web/src/content/help/pm/',
  },
];

export function DocumentationHubs({ hubs = DOC_HUBS }: { hubs?: DocHub[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="doc-hubs">
      {hubs.map((hub) => (
        <a
          key={hub.href}
          href={hub.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="doc-hub-card"
          className="group flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-coral-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          <h2 className="text-base font-semibold text-gray-900 group-hover:text-coral-700">
            {hub.title}
          </h2>
          <p className="mt-1 flex-1 text-sm text-gray-600">{hub.description}</p>
          <code className="mt-3 truncate text-xs text-gray-400" title={hub.pathLabel}>
            {hub.pathLabel}
          </code>
        </a>
      ))}
    </div>
  );
}
