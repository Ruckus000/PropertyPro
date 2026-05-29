/**
 * Read-only Block Registry view (spec §5.4). Renders one card per supported
 * block type: tier, summary, renderer path, documentation link, and the
 * top-level fields of its Zod content schema.
 */
import type { BlockRegistryEntry } from '@/lib/site-templates/block-registry';

interface Props {
  entries: BlockRegistryEntry[];
}

function tierClasses(tier: BlockRegistryEntry['tier']): string {
  return tier === 'professional'
    ? 'bg-violet-50 text-violet-700 ring-violet-600/20'
    : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
}

export function BlockRegistryView({ entries }: Props) {
  return (
    <div className="space-y-4" data-testid="block-registry">
      {entries.map((entry) => (
        <section
          key={entry.type}
          data-testid={`block-registry-${entry.type}`}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">{entry.label}</h2>
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                  {entry.type}
                </code>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tierClasses(entry.tier)}`}
                >
                  {entry.tier}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{entry.summary}</p>
            </div>
            <a
              href={`https://github.com/Ruckus000/PropertyPro/blob/main/${entry.docHref}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Docs →
            </a>
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Renderer</dt>
              <dd className="truncate font-mono text-gray-700" title={entry.rendererPath}>
                {entry.rendererPath}
              </dd>
            </div>
          </dl>

          <div className="mt-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Content schema
            </h3>
            {entry.fields.length === 0 ? (
              <p className="mt-1 text-xs text-gray-400">No fields.</p>
            ) : (
              <ul className="mt-1 divide-y divide-gray-100 rounded-md border border-gray-100">
                {entry.fields.map((field) => (
                  <li
                    key={field.name}
                    data-testid={`block-field-${entry.type}-${field.name}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm"
                  >
                    <span className="font-mono text-gray-900">{field.name}</span>
                    {!field.optional && (
                      <span className="text-xs font-semibold text-rose-600" aria-label="required">
                        *
                      </span>
                    )}
                    <span className="ml-auto font-mono text-xs text-gray-500">
                      {field.type}
                      {field.nullable ? ' | null' : ''}
                      {field.optional ? '?' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
