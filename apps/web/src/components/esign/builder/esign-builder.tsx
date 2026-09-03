'use client';

/**
 * The e-sign builder — one stepped flow for every way a signature request or a
 * template comes into being (design prototype `pp-esign-editor.js`):
 *
 *   Document → Recipients   → Place fields → Review & send    (send)
 *   Document → Signer roles → Place fields → Save template    (template)
 *
 * Four entry points, one component:
 *
 *   /esign/submissions/new                    send, from scratch
 *   /esign/submissions/new?templateId=…       send, seeded from a template
 *   /esign/templates/new                      template, from scratch
 *   /esign/templates/[id]/edit                template, seeded, starting on
 *                                             the fields step
 *
 * The gating lives in `lib/esign/builder-state.ts` so both modes provably
 * share one rule set and it can be tested without a DOM. This component owns
 * the parts that need a browser: the pending upload, the seeding queries, and
 * the commit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, Save, Send } from 'lucide-react';
import type { EsignFieldDefinition, EsignFieldsSchema } from '@propertypro/shared';
import { PageHeader } from '@/components/shared/page-header';
import { PageBody } from '@/components/shared/page-body';
import { TemplateFieldEditor } from '@/components/esign/template-field-editor';
import { ESIGN_FIELD_COLORS } from '@/components/esign/esign-field-colors';
import {
  useCreateEsignTemplate,
  useEsignTemplate,
  usePresignEsignTemplateUpload,
  useUpdateEsignTemplate,
} from '@/hooks/use-esign-templates';
import { useEsignTemplatePdfUrl } from '@/hooks/use-esign-template-pdf';
import { useCreateEsignSubmission } from '@/hooks/use-esign-submissions';
import {
  addField,
  addRecipient,
  canReachStep,
  createBuilderState,
  fromEditorFields,
  gateReason,
  removeRecipient,
  toEditorFields,
  toExpiresAt,
  toFieldsSchema,
  toSigners,
  updateRecipient,
  type BuilderDocument,
  type BuilderMode,
  type BuilderRecipient,
  type BuilderState,
  type BuilderStep,
} from '@/lib/esign/builder-state';
import { BuilderStepper } from './builder-stepper';
import { StepDocument } from './step-document';
import { StepRecipients } from './step-recipients';
import { StepReview } from './step-review';

export interface EsignBuilderProps {
  communityId: number;
  mode: BuilderMode;
  /**
   * Send mode: start from this template's document and layout. Template mode:
   * the template being edited, which starts on the fields step.
   */
  templateId?: number;
  /** Template mode only — an edit rather than a create. */
  isEdit?: boolean;
}

const SEND_LABELS: [string, string, string, string] = [
  'Document',
  'Recipients',
  'Place fields',
  'Review',
];
const TEMPLATE_LABELS: [string, string, string, string] = [
  'Document',
  'Signer roles',
  'Place fields',
  'Review',
];

function buildUploadUrl(uploadUrl: string, token?: string): string {
  if (!token || uploadUrl.includes('token=')) return uploadUrl;
  return `${uploadUrl}${uploadUrl.includes('?') ? '&' : '?'}token=${token}`;
}

export function EsignBuilder({
  communityId,
  mode,
  templateId,
  isEdit = false,
}: EsignBuilderProps) {
  const router = useRouter();

  const [state, setState] = useState<BuilderState>(() => createBuilderState(mode));
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  const presignUpload = usePresignEsignTemplateUpload();
  const createTemplate = useCreateEsignTemplate(communityId);
  const updateTemplate = useUpdateEsignTemplate(communityId);
  const createSubmission = useCreateEsignSubmission(communityId);

  const seedingFrom = templateId ?? null;
  const { data: seedTemplate } = useEsignTemplate(communityId, seedingFrom);
  const { data: seedPdf } = useEsignTemplatePdfUrl({
    communityId,
    templateId: seedingFrom ?? 0,
    enabled: Boolean(seedingFrom && seedTemplate?.sourceDocumentPath),
  });

  /**
   * Seed once, from the template's stored layout. Roles become recipients so
   * fields keep pointing at something the author can rename; in send mode the
   * names and emails are what is still missing, which is why the seeded flow
   * lands on step 2 rather than step 1.
   */
  useEffect(() => {
    if (seeded.current || !seedingFrom || !seedTemplate) return;

    const schema = seedTemplate.fieldsSchema as EsignFieldsSchema | null;
    if (!schema) return;

    seeded.current = true;

    setState((prev) => {
      const roles = schema.signerRoles.length > 0 ? schema.signerRoles : ['owner'];
      const recipients: BuilderRecipient[] = roles.map((role) => ({
        id: crypto.randomUUID(),
        name: '',
        email: '',
        role,
      }));
      const byRole = new Map(recipients.map((r) => [r.role, r.id]));

      return {
        ...prev,
        step: isEdit ? 3 : 2,
        recipients,
        fields: schema.fields.map((f) => ({
          id: f.id,
          recipientId: byRole.get(f.signerRole) ?? recipients[0]!.id,
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required,
          ...(f.label === undefined ? {} : { label: f.label }),
        })),
        templateName: seedTemplate.name,
        templateDescription: seedTemplate.description ?? '',
        document: {
          sourceDocumentPath: seedTemplate.sourceDocumentPath,
          name: seedTemplate.name,
          pdfData: null,
          pdfUrl: null,
        },
      };
    });
  }, [seedingFrom, seedTemplate, isEdit]);

  // The presigned URL arrives after the template does; fold it in when it lands.
  useEffect(() => {
    if (!seedPdf?.pdfUrl) return;
    setState((prev) =>
      prev.document ? { ...prev, document: { ...prev.document, pdfUrl: seedPdf.pdfUrl } } : prev,
    );
  }, [seedPdf?.pdfUrl]);

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  const reach = useCallback((step: BuilderStep) => canReachStep(state, step), [state]);
  const goTo = useCallback(
    (step: BuilderStep) => {
      if (canReachStep(state, step)) setState((prev) => ({ ...prev, step }));
    },
    [state],
  );

  const nextStep = (state.step + 1) as BuilderStep;
  const canGoNext = state.step < 4 && canReachStep(state, nextStep);
  const blocked = gateReason(state);

  // -------------------------------------------------------------------------
  // Step 3 plumbing
  //
  // The editor speaks `EsignFieldDefinition`, whose `signerRole` carries the
  // RECIPIENT id here — two recipients may share a role, and a role may be
  // renamed, so a field keyed on a role string would follow the wrong person.
  // -------------------------------------------------------------------------

  const recipientIds = useMemo(() => state.recipients.map((r) => r.id), [state.recipients]);
  const recipientLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of state.recipients) {
      map[r.id] = state.mode === 'template' ? r.role : r.name.trim() || r.role;
    }
    return map;
  }, [state.recipients, state.mode]);

  const editorFields = useMemo(() => toEditorFields(state), [state]);
  const handleEditorFields = useCallback((next: EsignFieldDefinition[]) => {
    setState((prev) => fromEditorFields(prev, next));
  }, []);
  const handlePlaceField = useCallback(
    (input: { recipientId: string; type: EsignFieldDefinition['type']; page: number; x: number; y: number }) => {
      setState((prev) => addField(prev, input));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Commit
  // -------------------------------------------------------------------------

  /** Uploads the held file if there is one, and returns the storage path. */
  const resolveSourcePath = useCallback(async (): Promise<string> => {
    const existing = state.document?.sourceDocumentPath;
    if (existing) return existing;

    if (!pendingFile) {
      throw new Error('No document to send.');
    }

    const presigned = await presignUpload.mutateAsync({
      communityId,
      fileName: pendingFile.name,
      fileSize: pendingFile.size,
      mimeType: pendingFile.type || 'application/pdf',
    });

    const res = await fetch(buildUploadUrl(presigned.uploadUrl, presigned.token), {
      method: 'PUT',
      headers: { 'content-type': pendingFile.type || 'application/pdf' },
      body: pendingFile,
    });
    if (!res.ok) {
      throw new Error('We could not upload the document. Please try again.');
    }
    return presigned.path;
  }, [state.document, pendingFile, presignUpload, communityId]);

  const handleCommit = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const fieldsSchema = toFieldsSchema(state);
      const sourceDocumentPath = await resolveSourcePath();

      if (state.mode === 'template') {
        if (isEdit && templateId) {
          await updateTemplate.mutateAsync({
            templateId,
            name: state.templateName.trim(),
            description: state.templateDescription.trim() || undefined,
            fieldsSchema,
          });
          router.push(`/esign/templates/${templateId}?communityId=${communityId}`);
          return;
        }

        const created = await createTemplate.mutateAsync({
          name: state.templateName.trim(),
          templateType: state.templateType,
          sourceDocumentPath,
          fieldsSchema,
          description: state.templateDescription.trim() || undefined,
        });
        router.push(`/esign/templates/${created.id}?communityId=${communityId}`);
        return;
      }

      // A send seeded from a template keeps its link only while the layout is
      // untouched. Once the author has changed it, the request carries its own
      // schema — which is what the template would no longer describe.
      const seededSchema = seedTemplate?.fieldsSchema as EsignFieldsSchema | undefined;
      const layoutUnchanged =
        Boolean(templateId) &&
        Boolean(seededSchema) &&
        JSON.stringify(seededSchema) === JSON.stringify(fieldsSchema);

      await createSubmission.mutateAsync({
        ...(layoutUnchanged && templateId
          ? { templateId }
          : {
              document: {
                name: state.document?.name ?? 'Document for signature',
                sourceDocumentPath,
                fieldsSchema,
              },
            }),
        signers: toSigners(state),
        signingOrder: state.signingOrder,
        sendEmail: state.sendEmail,
        ...(toExpiresAt(state) ? { expiresAt: toExpiresAt(state) as string } : {}),
        ...(state.messageSubject.trim() ? { messageSubject: state.messageSubject.trim() } : {}),
        ...(state.messageBody.trim() ? { messageBody: state.messageBody.trim() } : {}),
      });

      router.push(`/esign?communityId=${communityId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'We could not finish that. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [
    state,
    resolveSourcePath,
    isEdit,
    templateId,
    seedTemplate,
    updateTemplate,
    createTemplate,
    createSubmission,
    router,
    communityId,
  ]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isTemplate = state.mode === 'template';
  const commitLabel = isTemplate ? (isEdit ? 'Save changes' : 'Save template') : 'Send for signing';
  const CommitIcon = isTemplate ? Save : Send;

  const roleColors = useMemo(() => {
    const map: Record<string, string> = {};
    state.recipients.forEach((r, i) => {
      map[r.id] = ESIGN_FIELD_COLORS[i % ESIGN_FIELD_COLORS.length] as string;
    });
    return map;
  }, [state.recipients]);

  return (
    <PageBody>
      <PageHeader
        title={
          isTemplate ? (isEdit ? 'Edit template' : 'New template') : 'Send for signature'
        }
      />

      <BuilderStepper
        current={state.step}
        labels={isTemplate ? TEMPLATE_LABELS : SEND_LABELS}
        canReach={reach}
        onSelect={goTo}
      />

      {error && (
        <div
          role="alert"
          className="rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger"
        >
          {error}
        </div>
      )}

      {state.step === 1 && (
        <StepDocument
          communityId={communityId}
          document={state.document}
          onPick={(doc: BuilderDocument, file: File | null) => {
            setPendingFile(file);
            setState((prev) => ({ ...prev, document: doc }));
          }}
          onClear={() => {
            setPendingFile(null);
            setState((prev) => ({ ...prev, document: null }));
          }}
        />
      )}

      {state.step === 2 && (
        <StepRecipients
          state={state}
          onChange={setState}
          onAdd={() => setState((prev) => addRecipient(prev))}
          onRemove={(id) => setState((prev) => removeRecipient(prev, id))}
          onUpdate={(id, patch) => setState((prev) => updateRecipient(prev, id, patch))}
        />
      )}

      {state.step === 3 && (
        <TemplateFieldEditor
          templateName={isTemplate ? state.templateName : (state.document?.name ?? '')}
          pdfData={state.document?.pdfData ?? null}
          pdfUrl={state.document?.pdfUrl ?? null}
          signerRoles={recipientIds}
          roleLabels={recipientLabels}
          roleColors={roleColors}
          fields={editorFields}
          onFieldsChange={handleEditorFields}
          onFieldPlace={handlePlaceField}
        />
      )}

      {state.step === 4 && <StepReview state={state} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle pt-4">
        <button
          type="button"
          onClick={() => goTo(Math.max(1, state.step - 1) as BuilderStep)}
          disabled={state.step === 1}
          className="inline-flex items-center gap-2 rounded-md border border-edge px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {/* A disabled button that says nothing is how a stepped form strands people. */}
          {blocked && state.step < 4 && !canGoNext && (
            <span className="text-sm text-content-secondary">{blocked}</span>
          )}

          {state.step < 4 ? (
            <button
              type="button"
              onClick={() => goTo(nextStep)}
              disabled={!canGoNext}
              className="inline-flex items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={busy || Boolean(blocked)}
              className="inline-flex items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CommitIcon className="size-4" aria-hidden="true" />
              )}
              {busy ? 'Working…' : commitLabel}
            </button>
          )}
        </div>
      </div>
    </PageBody>
  );
}
