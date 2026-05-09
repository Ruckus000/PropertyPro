import { eq, and, isNull, isNotNull } from '@propertypro/db/filters';
import {
  communities,
  createScopedClient,
  maintenanceRequests,
  moveChecklists,
  logAuditEvent,
  type MoveChecklistType,
  type ChecklistData,
  type ChecklistStepData,
  MOVE_IN_STEPS,
  MOVE_OUT_STEPS,
  STEP_LABELS,
  type MoveChecklist,
  users,
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

// ---------------------------------------------------------------------------
// Step-action helpers (used by /api/v1/move-checklists/[id]/steps/[stepKey]/action)
// ---------------------------------------------------------------------------

export interface ChecklistWelcomeEmailContext {
  resident: { email: string; fullName: string | null };
  community: { name: string };
}

/**
 * Load the resident + community fragments needed to render and send a
 * welcome email when the move-in checklist's `send_welcome` action fires.
 * Returns `null` if either row is missing (route treats that as silent
 * no-op rather than failing the action — the checklist step still
 * advances).
 *
 * AUTHZ: tenant-scoped — caller MUST verify community membership and
 * admin role BEFORE invoking. Both lookups go through `selectFrom` with
 * a primary-key `eq` filter (one row each).
 */
export async function getResidentAndCommunityForWelcomeEmail(
  communityId: number,
  residentId: string,
): Promise<ChecklistWelcomeEmailContext | null> {
  const scoped = createScopedClient(communityId);
  const [userRows, communityRows] = await Promise.all([
    scoped.selectFrom(
      users,
      { email: users.email, fullName: users.fullName },
      eq(users.id, residentId),
    ),
    scoped.selectFrom(
      communities,
      { name: communities.name },
      eq(communities.id, communityId),
    ),
  ]);
  const resident = userRows[0] as { email?: unknown; fullName?: unknown } | undefined;
  const community = communityRows[0] as { name?: unknown } | undefined;
  if (!resident || !community) return null;
  if (typeof resident.email !== 'string') return null;
  if (typeof community.name !== 'string') return null;
  return {
    resident: {
      email: resident.email,
      fullName: typeof resident.fullName === 'string' ? resident.fullName : null,
    },
    community: { name: community.name },
  };
}

export interface InspectionRequestForChecklist {
  unitId: number;
  submittedById: string;
  /** Either 'move_in' or 'move_out' — drives the title text. */
  type: 'move_in' | 'move_out';
}

/**
 * Insert a `maintenance_requests` row of category `inspection` linked to
 * the checklist's unit. Returns the newly-inserted row's id (caller uses
 * it to write `linkedEntityId` on the checklist step).
 */
export async function createInspectionRequestForChecklist(
  communityId: number,
  input: InspectionRequestForChecklist,
): Promise<{ id: number } | null> {
  const title = input.type === 'move_in' ? 'Move-In Inspection' : 'Move-Out Inspection';
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(maintenanceRequests, {
    communityId,
    unitId: input.unitId,
    submittedById: input.submittedById,
    title,
    description: `Scheduled ${title.toLowerCase()} for unit.`,
    category: 'inspection',
    priority: 'normal',
    status: 'open',
  });
  const row = rows[0] as { id?: unknown } | undefined;
  if (!row || typeof row.id !== 'number') return null;
  return { id: row.id };
}
