import { eq, and, isNull, isNotNull } from '@propertypro/db/filters';
import {
  createScopedClient,
  moveChecklists,
  logAuditEvent,
  type MoveChecklistType,
  type ChecklistData,
  type ChecklistStepData,
  MOVE_IN_STEPS,
  MOVE_OUT_STEPS,
  STEP_LABELS,
  type MoveChecklist,
} from '@propertypro/db';

// ─── Types ───

export interface CreateMoveChecklistInput {
  communityId: number;
  leaseId: number;
  unitId: number;
  residentId: string;
  type: MoveChecklistType;
}

export interface UpdateStepInput {
  completed: boolean;
  notes?: string;
  linkedEntityType?: 'esign_submission' | 'maintenance_request' | 'invitation';
  linkedEntityId?: number;
}

// ─── Helpers ───

function initializeChecklistData(type: MoveChecklistType): ChecklistData {
  const steps = type === 'move_in' ? MOVE_IN_STEPS : MOVE_OUT_STEPS;
  const data: ChecklistData = {};
  for (const step of steps) {
    data[step] = { completed: false };
  }
  return data;
}

function getStepsForType(type: MoveChecklistType): readonly string[] {
  return type === 'move_in' ? MOVE_IN_STEPS : MOVE_OUT_STEPS;
}

// ─── CRUD ───

export async function createMoveChecklist(
  input: CreateMoveChecklistInput,
  userId: string,
): Promise<MoveChecklist> {
  const scoped = createScopedClient(input.communityId);
  const checklistData = initializeChecklistData(input.type);

  const rows = await scoped.insert(moveChecklists, {
    communityId: input.communityId,
    leaseId: input.leaseId,
    unitId: input.unitId,
    residentId: input.residentId,
    type: input.type,
    checklistData,
  });

  const row = rows[0];
  if (!row) throw new Error('Failed to create move checklist');

  await logAuditEvent({
    action: 'create',
    resourceType: 'move_checklist',
    resourceId: String(row.id),
    communityId: input.communityId,
    userId,
    newValues: { type: input.type, leaseId: input.leaseId },
  });

  return row as unknown as MoveChecklist;
}

export async function getMoveChecklist(
  communityId: number,
  checklistId: number,
): Promise<MoveChecklist | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<MoveChecklist>(
    moveChecklists,
    {},
    and(
      eq(moveChecklists.id, checklistId),
      isNull(moveChecklists.deletedAt),
    ),
  );

  return rows[0] ?? null;
}

export async function listMoveChecklists(
  communityId: number,
  filters: { leaseId?: number; unitId?: number; type?: MoveChecklistType; completed?: boolean } = {},
): Promise<MoveChecklist[]> {
  const scoped = createScopedClient(communityId);
  const conditions = [isNull(moveChecklists.deletedAt)];

  if (filters.leaseId) conditions.push(eq(moveChecklists.leaseId, filters.leaseId));
  if (filters.unitId) conditions.push(eq(moveChecklists.unitId, filters.unitId));
  if (filters.type) conditions.push(eq(moveChecklists.type, filters.type));
  if (filters.completed === false) {
    conditions.push(isNull(moveChecklists.completedAt));
  } else if (filters.completed === true) {
    conditions.push(isNotNull(moveChecklists.completedAt));
  }

  const rows = await scoped.selectFrom<MoveChecklist>(
    moveChecklists,
    {},
    and(...conditions),
  );

  return rows;
}

export async function updateChecklistStep(
  communityId: number,
  checklistId: number,
  stepKey: string,
  input: UpdateStepInput,
  userId: string,
): Promise<MoveChecklist> {
  const checklist = await getMoveChecklist(communityId, checklistId);
  if (!checklist) {
    throw new Error(`Checklist ${checklistId} not found`);
  }

  const validSteps = getStepsForType(checklist.type);
  if (!validSteps.includes(stepKey)) {
    throw new Error(`Invalid step key "${stepKey}" for ${checklist.type} checklist`);
  }

  const currentData = (checklist.checklistData ?? {}) as ChecklistData;
  const oldStep = currentData[stepKey] ?? { completed: false };
  const newStep: ChecklistStepData = {
    completed: input.completed,
    completedAt: input.completed ? new Date().toISOString() : undefined,
    completedBy: input.completed ? userId : undefined,
    notes: input.notes ?? oldStep.notes,
    linkedEntityType: input.linkedEntityType ?? oldStep.linkedEntityType,
    linkedEntityId: input.linkedEntityId ?? oldStep.linkedEntityId,
  };

  const updatedData: ChecklistData = {
    ...currentData,
    [stepKey]: newStep,
  };

  const scoped = createScopedClient(communityId);
  const updatedRows = await scoped.update(
    moveChecklists,
    { checklistData: updatedData },
    eq(moveChecklists.id, checklistId),
  );

  if (!updatedRows[0]) throw new Error('Checklist not found during update');

  await logAuditEvent({
    action: 'update',
    resourceType: 'move_checklist_step',
    resourceId: `${checklistId}/${stepKey}`,
    communityId,
    userId,
    oldValues: { step: stepKey, ...oldStep },
    newValues: { step: stepKey, ...newStep },
  });

  return updatedRows[0] as unknown as MoveChecklist;
}

export async function completeChecklist(
  communityId: number,
  checklistId: number,
  userId: string,
): Promise<MoveChecklist> {
  const checklist = await getMoveChecklist(communityId, checklistId);
  if (!checklist) {
    throw new Error(`Checklist ${checklistId} not found`);
  }

  const validSteps = getStepsForType(checklist.type);
  const currentData = (checklist.checklistData ?? {}) as ChecklistData;
  const incompleteSteps = validSteps.filter(
    (step) => !currentData[step]?.completed,
  );

  if (incompleteSteps.length > 0) {
    const labels = incompleteSteps.map((s) => STEP_LABELS[s] ?? s).join(', ');
    throw new Error(`Cannot complete checklist. Incomplete steps: ${labels}`);
  }

  const scoped = createScopedClient(communityId);
  const updatedRows = await scoped.update(
    moveChecklists,
    { completedAt: new Date(), completedBy: userId },
    eq(moveChecklists.id, checklistId),
  );

  if (!updatedRows[0]) throw new Error('Checklist not found during update');

  await logAuditEvent({
    action: 'update',
    resourceType: 'move_checklist',
    resourceId: String(checklistId),
    communityId,
    userId,
    newValues: { completedAt: new Date().toISOString() },
  });

  return updatedRows[0] as unknown as MoveChecklist;
}
