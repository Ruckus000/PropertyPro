/**
 * E-sign service — Template CRUD.
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import { createScopedClient, esignTemplates, logAuditEvent } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { type EsignTemplateStatus, type EsignTemplateType } from '@propertypro/shared';
import { NotFoundError } from '@/lib/api/errors';
import { type CreateTemplateInput, type EsignTemplateRecord, type UpdateTemplateInput } from './types';
import { generateExternalId, validateFieldsSchema } from './helpers';

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function createTemplate(
  communityId: number,
  userId: string,
  input: CreateTemplateInput,
  requestId?: string | null,
): Promise<EsignTemplateRecord> {
  validateFieldsSchema(input.fieldsSchema);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(esignTemplates, {
    communityId,
    externalId: generateExternalId(),
    name: input.name,
    description: input.description ?? null,
    sourceDocumentPath: input.sourceDocumentPath,
    templateType: input.templateType,
    fieldsSchema: input.fieldsSchema,
    status: 'active',
    createdBy: userId,
  });

  const record = rows[0] as EsignTemplateRecord;

  await logAuditEvent({
    userId,
    action: 'esign_template_created',
    resourceType: 'esign_template',
    resourceId: String(record.id),
    communityId,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  return record;
}

export async function listTemplates(
  communityId: number,
  filters?: { status?: EsignTemplateStatus; type?: EsignTemplateType },
): Promise<EsignTemplateRecord[]> {
  const scoped = createScopedClient(communityId);
  const conditions = [];

  if (filters?.status) {
    conditions.push(eq(esignTemplates.status, filters.status));
  }
  if (filters?.type) {
    conditions.push(eq(esignTemplates.templateType, filters.type));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await scoped.selectFrom(esignTemplates, {}, whereClause);
  return rows as EsignTemplateRecord[];
}

export async function getTemplate(
  communityId: number,
  templateId: number,
): Promise<EsignTemplateRecord> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(
    esignTemplates,
    {},
    eq(esignTemplates.id, templateId),
  );

  if (rows.length === 0) {
    throw new NotFoundError('Template not found');
  }

  return rows[0] as EsignTemplateRecord;
}

export async function updateTemplate(
  communityId: number,
  userId: string,
  templateId: number,
  input: UpdateTemplateInput,
  requestId?: string | null,
): Promise<EsignTemplateRecord> {
  const existing = await getTemplate(communityId, templateId);

  if (input.fieldsSchema) {
    validateFieldsSchema(input.fieldsSchema);
  }

  const scoped = createScopedClient(communityId);
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.fieldsSchema !== undefined) updateData.fieldsSchema = input.fieldsSchema;

  const rows = await scoped.update(
    esignTemplates,
    updateData,
    eq(esignTemplates.id, templateId),
  );

  const record = rows[0] as EsignTemplateRecord;

  await logAuditEvent({
    userId,
    action: 'esign_template_updated',
    resourceType: 'esign_template',
    resourceId: String(record.id),
    communityId,
    oldValues: existing,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  return record;
}

export async function archiveTemplate(
  communityId: number,
  userId: string,
  templateId: number,
  requestId?: string | null,
): Promise<void> {
  const existing = await getTemplate(communityId, templateId);

  const scoped = createScopedClient(communityId);
  await scoped.update(
    esignTemplates,
    { status: 'archived', updatedAt: new Date() },
    eq(esignTemplates.id, templateId),
  );

  await logAuditEvent({
    userId,
    action: 'esign_template_archived',
    resourceType: 'esign_template',
    resourceId: String(templateId),
    communityId,
    oldValues: existing,
    metadata: { requestId: requestId ?? null },
  });
}

export async function cloneTemplate(
  communityId: number,
  userId: string,
  templateId: number,
  newName: string,
  requestId?: string | null,
): Promise<EsignTemplateRecord> {
  const source = await getTemplate(communityId, templateId);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(esignTemplates, {
    communityId,
    externalId: generateExternalId(),
    name: newName,
    description: source.description,
    sourceDocumentPath: source.sourceDocumentPath,
    templateType: source.templateType,
    fieldsSchema: source.fieldsSchema,
    status: 'active',
    createdBy: userId,
  });

  const record = rows[0] as EsignTemplateRecord;

  await logAuditEvent({
    userId,
    action: 'esign_template_cloned',
    resourceType: 'esign_template',
    resourceId: String(record.id),
    communityId,
    newValues: record,
    metadata: { sourceTemplateId: templateId, requestId: requestId ?? null },
  });

  return record;
}
