import { PriorityBadge } from '@propertypro/design-system';

/**
 * PriorityBadge — maps a work-order / maintenance priority onto the ui Badge
 * pill: high → danger, medium → warning, low → neutral. Its own axis is
 * `priority` (high | medium | low) plus `size`.
 */

export const Priorities = () => (
  <div className="flex flex-wrap items-center gap-2">
    <PriorityBadge priority="high" />
    <PriorityBadge priority="medium" />
    <PriorityBadge priority="low" />
  </div>
);

export const Sizes = () => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <PriorityBadge priority="high" size="sm" />
      <PriorityBadge priority="medium" size="sm" />
      <PriorityBadge priority="low" size="sm" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <PriorityBadge priority="high" size="md" />
      <PriorityBadge priority="medium" size="md" />
      <PriorityBadge priority="low" size="md" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <PriorityBadge priority="high" size="lg" />
      <PriorityBadge priority="medium" size="lg" />
      <PriorityBadge priority="low" size="lg" />
    </div>
  </div>
);

export const InWorkOrderQueue = () => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between border-b border-edge px-4 py-3">
      <span className="text-sm font-semibold text-content">Open work orders</span>
      <span className="text-xs text-content-tertiary">Sunset Ridge Apartments · 6 unassigned</span>
    </div>
    <div className="divide-y divide-edge">
      {[
        { id: 'WO-2214', title: 'Elevator 2 stopped between floors', unit: 'Tower A lobby', priority: 'high' as const, age: 'Reported 40 min ago' },
        { id: 'WO-2209', title: 'Pool pump losing pressure', unit: 'Amenity deck', priority: 'high' as const, age: 'Reported yesterday' },
        { id: 'WO-2198', title: 'Corridor light out on 6th floor', unit: 'Floor 6 · east', priority: 'medium' as const, age: 'Reported 3 days ago' },
        { id: 'WO-2181', title: 'Mailroom door closer adjustment', unit: 'Ground floor', priority: 'low' as const, age: 'Reported 9 days ago' },
      ].map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-content">{row.title}</div>
            <div className="text-xs text-content-tertiary">
              {row.id} · {row.unit} · {row.age}
            </div>
          </div>
          <PriorityBadge priority={row.priority} size="sm" />
        </div>
      ))}
    </div>
  </div>
);
