'use client';

import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import {
  useMoveChecklist,
  useUpdateChecklistStep,
  useTriggerStepAction,
} from '@/hooks/use-move-checklists';
import { ChecklistStepper } from '@/components/shared/checklist-stepper';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MOVE_IN_STEPS,
  MOVE_OUT_STEPS,
  STEP_LABELS,
  ACTIONABLE_STEPS,
} from '@propertypro/db';

interface Props {
  communityId: number;
  checklistId: number;
  onBack: () => void;
}

export function ChecklistDetailView({ communityId, checklistId, onBack }: Props) {
  const { data: checklist, isLoading } = useMoveChecklist(communityId, checklistId);
  const updateStep = useUpdateChecklistStep(communityId, checklistId);
  const triggerAction = useTriggerStepAction(communityId, checklistId);

  if (isLoading || !checklist) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const stepKeys = checklist.type === 'move_in' ? MOVE_IN_STEPS : MOVE_OUT_STEPS;
  const completedCount = stepKeys.filter((s) => checklist.checklistData[s]?.completed).length;

  const steps = stepKeys.map((key) => {
    const stepData = checklist.checklistData[key] ?? { completed: false };
    const actionConfig = ACTIONABLE_STEPS[key];

    return {
      key,
      label: STEP_LABELS[key] ?? key,
      completed: stepData.completed,
      completedAt: stepData.completedAt,
      completedBy: stepData.completedBy,
      notes: stepData.notes,
      linkedEntityType: stepData.linkedEntityType,
      linkedEntityId: stepData.linkedEntityId,
      autoCompleted: false,
      actionLabel: actionConfig?.label,
      onAction: actionConfig
        ? () => triggerAction.mutate({ stepKey: key, action: actionConfig.action })
        : undefined,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to checklists
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">
            {checklist.type === 'move_in' ? 'Move-In' : 'Move-Out'} Checklist
          </h2>
          <Badge variant={checklist.type === 'move_in' ? 'default' : 'secondary'}>
            {checklist.type === 'move_in' ? 'Move In' : 'Move Out'}
          </Badge>
          {checklist.completedAt && (
            <Badge variant="outline" className="text-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Complete
            </Badge>
          )}
        </div>

        <p className="mt-1 text-sm text-gray-500">
          Unit {checklist.unitId} — Lease #{checklist.leaseId} —{' '}
          {completedCount}/{stepKeys.length} steps complete
        </p>

        <div className="mt-3 h-2 w-full max-w-md rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all"
            style={{ width: `${Math.round((completedCount / stepKeys.length) * 100)}%` }}
          />
        </div>
      </div>

      <ChecklistStepper
        steps={steps}
        onStepToggle={(stepKey, completed) =>
          updateStep.mutate({ stepKey, completed })
        }
        onStepNotesChange={(stepKey, notes) =>
          updateStep.mutate({
            stepKey,
            completed: checklist.checklistData[stepKey]?.completed ?? false,
            notes,
          })
        }
        disabled={!!checklist.completedAt}
      />
    </div>
  );
}
