'use client';

/**
 * One move-in or move-out checklist on the page kit (`template="detail"`).
 * Shown by `ChecklistListPage` when the address carries `?checklist=<id>`.
 */
import type { ReactNode } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionError, SectionHeader } from '@propertypro/ui/components/shared/section';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import {
  useMoveChecklist,
  useUpdateChecklistStep,
  useTriggerStepAction,
} from '@/hooks/use-move-checklists';
import { ChecklistStepper } from '@/components/shared/checklist-stepper';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { STEP_LABELS, ACTIONABLE_STEPS, MOVE_IN_STEPS, MOVE_OUT_STEPS } from '@propertypro/db/constants';
import { checklistProgress, ProgressBar, progressText } from './checklist-progress';

interface Props {
  communityId: number;
  checklistId: number;
  onBack: () => void;
}

export function ChecklistDetailView({ communityId, checklistId, onBack }: Props) {
  const { data: checklist, isLoading, isError, refetch } = useMoveChecklist(communityId, checklistId);
  const updateStep = useUpdateChecklistStep(communityId, checklistId);
  const triggerAction = useTriggerStepAction(communityId, checklistId);

  const backButton = (
    <Button variant="outline" onClick={onBack}>
      Back to checklists
    </Button>
  );

  function frame(title: string, body: ReactNode) {
    return (
      <PageLayout
        template="detail"
        header={<PageHeader title={title} icon={<ClipboardCheck />} actions={backButton} />}
      >
        {body}
      </PageLayout>
    );
  }

  if (isError || (!isLoading && !checklist)) {
    return frame(
      'Checklist',
      <Section>
        <SectionError
          message="We couldn't load this checklist. Please try again."
          onRetry={() => void refetch()}
        />
      </Section>,
    );
  }

  if (!checklist) {
    return frame(
      'Checklist',
      <Section aria-busy="true">
        <SectionHeader title="Steps" />
        <div className="flex flex-col gap-4 px-4 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </Section>,
    );
  }

  const isMoveIn = checklist.type === 'move_in';
  const stepKeys = isMoveIn ? MOVE_IN_STEPS : MOVE_OUT_STEPS;
  const { completed, total, kind, word } = checklistProgress(checklist);
  const unit = checklist.unitLabel ?? `Unit #${checklist.unitId}`;

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
    <PageLayout
      template="detail"
      header={
        <PageHeader
          title={isMoveIn ? 'Move-in checklist' : 'Move-out checklist'}
          icon={<ClipboardCheck />}
          status={<StatusGlyph kind={kind} label={word} />}
          description={`${unit} — Lease #${checklist.leaseId}`}
          actions={backButton}
        />
      }
      panel={{
        template: 'detail',
        details: (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-content">{progressText(completed, total)}</p>
              <ProgressBar completed={completed} total={total} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-content-secondary">Type</dt>
              <dd className="text-content">{isMoveIn ? 'Move in' : 'Move out'}</dd>
              <dt className="text-content-secondary">Unit</dt>
              <dd className="text-content">{unit}</dd>
              <dt className="text-content-secondary">Lease</dt>
              <dd className="text-content">#{checklist.leaseId}</dd>
              <dt className="text-content-secondary">Created</dt>
              <dd className="text-content">{new Date(checklist.createdAt).toLocaleDateString()}</dd>
              {checklist.completedAt ? (
                <>
                  <dt className="text-content-secondary">Completed</dt>
                  <dd className="text-content">
                    {new Date(checklist.completedAt).toLocaleDateString()}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        ),
      }}
    >
      <Section>
        <SectionHeader title="Steps" description={progressText(completed, total)} />
        <div className="px-4 py-4">
          <ChecklistStepper
            steps={steps}
            onStepToggle={(stepKey, stepCompleted) =>
              updateStep.mutate({ stepKey, completed: stepCompleted })
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
      </Section>
    </PageLayout>
  );
}
