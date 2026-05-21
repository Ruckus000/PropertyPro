'use client';

/**
 * Widgets — client list presenter.
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * Owns the `useWidgets` data hook and renders loading / empty / error /
 * success states.
 */
import Link from 'next/link';
import { useWidgets } from '@/hooks/useWidgets';

export function WidgetsList({ communityId }: { communityId: number }) {
  const { widgets, isLoading, error } = useWidgets(communityId);

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading widgets…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-content-danger">
        {error}
      </p>
    );
  }

  if (widgets.length === 0) {
    return (
      <p className="text-sm text-content-secondary">
        No widgets yet. Replace this scaffold with your real list UI.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {widgets.map((widget) => (
        <li key={widget.id}>
          <Link
            href={`/widgets/${widget.id}`}
            className="block rounded-md border border-border-default p-3 hover:bg-surface-hover"
          >
            <span className="font-medium text-content">{widget.name}</span>
            {widget.description && (
              <span className="ml-2 text-sm text-content-secondary">{widget.description}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
