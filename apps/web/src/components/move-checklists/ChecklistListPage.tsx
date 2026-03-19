'use client';

import { useState } from 'react';
import { useMoveChecklists, type MoveChecklistRow } from '@/hooks/use-move-checklists';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChecklistDetailView } from './ChecklistDetailView';
import { STEP_LABELS, MOVE_IN_STEPS, MOVE_OUT_STEPS } from '@propertypro/db';

interface Props {
  communityId: number;
}

function getProgress(checklist: MoveChecklistRow): { completed: number; total: number } {
  const steps = checklist.type === 'move_in' ? MOVE_IN_STEPS : MOVE_OUT_STEPS;
  const completed = steps.filter((s) => checklist.checklistData[s]?.completed).length;
  return { completed, total: steps.length };
}

function ChecklistCard({
  checklist,
  onClick,
}: {
  checklist: MoveChecklistRow;
  onClick: () => void;
}) {
  const { completed, total } = getProgress(checklist);
  const pct = Math.round((completed / total) * 100);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-e1 transition-shadow hover:shadow-e2"
    >
      <div className="flex items-center justify-between">
        <div>
          <Badge variant={checklist.type === 'move_in' ? 'default' : 'secondary'}>
            {checklist.type === 'move_in' ? 'Move In' : 'Move Out'}
          </Badge>
          {checklist.completedAt && (
            <Badge variant="outline" className="ml-2 text-green-600">
              Complete
            </Badge>
          )}
        </div>
        <span className="text-sm text-gray-500">
          {completed}/{total} steps
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-900">
        Unit {checklist.unitId} — Lease #{checklist.leaseId}
      </p>
      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Created {new Date(checklist.createdAt).toLocaleDateString()}
      </p>
    </button>
  );
}

export function ChecklistListPage({ communityId }: Props) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const typeFilter = filter === 'move_in' || filter === 'move_out' ? filter : undefined;
  const { data: checklists, isLoading } = useMoveChecklists(communityId, {
    type: typeFilter,
  });

  const tabs = [
    { label: 'All', value: 'all', count: checklists?.length },
    {
      label: 'Move In',
      value: 'move_in',
      count: checklists?.filter((c) => c.type === 'move_in').length,
    },
    {
      label: 'Move Out',
      value: 'move_out',
      count: checklists?.filter((c) => c.type === 'move_out').length,
    },
  ];

  if (selectedId) {
    return (
      <ChecklistDetailView
        communityId={communityId}
        checklistId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <QuickFilterTabs tabs={tabs} active={filter} onChange={setFilter} />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && checklists && checklists.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">
            No checklists found. Checklists are automatically created when leases are
            created or terminated.
          </p>
        </div>
      )}

      {!isLoading && checklists && checklists.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {checklists.map((checklist) => (
            <ChecklistCard
              key={checklist.id}
              checklist={checklist}
              onClick={() => setSelectedId(checklist.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
