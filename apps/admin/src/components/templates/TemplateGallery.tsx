import Link from 'next/link';
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';
import type { PublicSiteTemplateListItem } from '@/lib/templates/types';
import { TemplateLifecycleBadge } from './TemplateLifecycleBadge';

interface TemplateGalleryProps {
  templates: PublicSiteTemplateListItem[];
}

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleDateString();
}

export function TemplateGallery({ templates }: TemplateGalleryProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {templates.map((template) => (
        <Link
          key={template.id}
          href={`/templates/${template.id}`}
          className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
        >
          <div
            className="mb-4 h-28 rounded-2xl border border-gray-200"
            style={{
              background: `linear-gradient(135deg, ${template.thumbnailDescriptor.gradient[0]}, ${template.thumbnailDescriptor.gradient[1]})`,
            }}
          />

          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 transition group-hover:text-blue-700">
                {template.name}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {COMMUNITY_TYPE_DISPLAY_NAMES[template.communityType]}
              </p>
            </div>
            <TemplateLifecycleBadge state={template.lifecycleState} />
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-600">
            {template.summary || 'No summary yet.'}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>

          <dl className="mt-5 grid gap-3 text-sm text-gray-500 sm:grid-cols-3">
            <div>
              <dt className="font-medium text-gray-700">Version</dt>
              <dd className="mt-1">v{template.version}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-700">Used by</dt>
              <dd className="mt-1">{template.usageCount} demos</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-700">Updated</dt>
              <dd className="mt-1">{formatUpdatedAt(template.updatedAt)}</dd>
            </div>
          </dl>
        </Link>
      ))}
    </div>
  );
}
