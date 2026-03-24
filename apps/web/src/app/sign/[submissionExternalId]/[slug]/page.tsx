'use client';

/**
 * Public signing page — no authentication required.
 *
 * Route: /sign/[submissionExternalId]/[slug]
 *
 * Displays the PDF with field overlays for the current signer and handles
 * signature capture, consent, and submission.
 */

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@propertypro/ui';
import {
  ESIGN_CONSENT_TEXT,
  type EsignFieldDefinition,
} from '@propertypro/shared';
import {
  useSigningContext,
  useSubmitSignature,
  useDeclineSigning,
} from '@/hooks/use-esign-signing';
import { PdfViewer } from '@/components/esign/pdf-viewer';
import { SignatureCapture } from '@/components/esign/signature-capture';
import {
  Lock,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldValue {
  fieldId: string;
  type: string;
  value: string;
  signedAt: string;
}

type CompletionState = 'idle' | 'completed' | 'processing' | 'processing_failed';

function isFieldCompleted(
  field: Pick<EsignFieldDefinition, 'type'>,
  value: FieldValue | undefined,
): boolean {
  if (!value) {
    return false;
  }

  if (field.type === 'checkbox') {
    return value.value === 'true';
  }

  return value.value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SigningPage() {
  const params = useParams<{
    submissionExternalId: string;
    slug: string;
  }>();

  const submissionExternalId = params.submissionExternalId;
  const slug = params.slug;

  const { data, isLoading, error } = useSigningContext(
    submissionExternalId,
    slug,
  );
  const submitMutation = useSubmitSignature(submissionExternalId, slug);
  const declineMutation = useDeclineSigning(submissionExternalId, slug);

  // Signed field values
  const [signedValues, setSignedValues] = useState<Record<string, FieldValue>>(
    {},
  );

  // Consent
  const [consentChecked, setConsentChecked] = useState(false);

  // Signature cache (reuse first drawn signature for subsequent same-type fields)
  const [cachedSignature, setCachedSignature] = useState<string | undefined>();
  const [cachedInitials, setCachedInitials] = useState<string | undefined>();

  // Signature capture modal
  const [captureField, setCaptureField] = useState<EsignFieldDefinition | null>(
    null,
  );

  // Message expansion
  const [messageExpanded, setMessageExpanded] = useState(false);

  // Decline flow
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Submission completion state
  const [completionState, setCompletionState] = useState<CompletionState>('idle');
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);

  // PDF page state
  const [currentPage, setCurrentPage] = useState(0);

  // ---- Derived data ----
  const fields = useMemo<EsignFieldDefinition[]>(() => {
    if (!data?.signer) return [];
    if (data.fields?.length) {
      return data.fields;
    }
    if (!data.template?.fieldsSchema?.fields) return [];
    return data.template.fieldsSchema.fields.filter(
      (f) => f.signerRole === data.signer.role,
    );
  }, [data]);

  const requiredFields = useMemo(
    () => fields.filter((f) => f.required),
    [fields],
  );

  const completedCount = useMemo(
    () => fields.filter((f) => isFieldCompleted(f, signedValues[f.id])).length,
    [fields, signedValues],
  );

  const allRequiredDone = useMemo(
    () => requiredFields.every((f) => isFieldCompleted(f, signedValues[f.id])),
    [requiredFields, signedValues],
  );

  const currentPageFields = useMemo(
    () => fields.filter((field) => field.page === currentPage),
    [currentPage, fields],
  );
  const submissionStatus = data?.submission.effectiveStatus ?? data?.submission.status;

  // ---- Handlers ----
  const handleFieldClick = useCallback(
    (field: EsignFieldDefinition) => {
      if (field.type === 'signature' || field.type === 'initials') {
        setCaptureField(field);
      } else if (field.type === 'date') {
        const dateStr = new Date().toISOString().split('T')[0] ?? '';
        const entry: FieldValue = {
          fieldId: field.id,
          type: field.type,
          value: dateStr,
          signedAt: new Date().toISOString(),
        };
        setSignedValues((prev) => ({ ...prev, [field.id]: entry }));
      } else if (field.type === 'checkbox') {
        setSignedValues((prev) => {
          const current = prev[field.id];
          const newValue = current?.value === 'true' ? 'false' : 'true';
          if (newValue === 'false') {
            const next = { ...prev };
            delete next[field.id];
            return next;
          }
          const entry: FieldValue = {
            fieldId: field.id,
            type: field.type,
            value: newValue,
            signedAt: new Date().toISOString(),
          };
          return { ...prev, [field.id]: entry };
        });
      }
      // text fields handled inline
    },
    [],
  );

  const handleSignatureCapture = useCallback(
    (dataUrl: string) => {
      if (!captureField) return;
      setSignedValues((prev) => ({
        ...prev,
        [captureField.id]: {
          fieldId: captureField.id,
          type: captureField.type,
          value: dataUrl,
          signedAt: new Date().toISOString(),
        },
      }));
      // Cache for reuse
      if (captureField.type === 'signature') {
        setCachedSignature(dataUrl);
      } else {
        setCachedInitials(dataUrl);
      }
      setCaptureField(null);
    },
    [captureField],
  );

  const handleTextFieldChange = useCallback(
    (field: EsignFieldDefinition, value: string) => {
      setSignedValues((prev) => ({
        ...prev,
        [field.id]: {
          fieldId: field.id,
          type: field.type,
          value,
          signedAt: new Date().toISOString(),
        },
      }));
    },
    [],
  );

  const handleFinish = useCallback(async () => {
    if (!allRequiredDone || !consentChecked || !data?.pdfUrl) return;
    try {
      const result = await submitMutation.mutateAsync({
        signedValues,
        consentGiven: true,
      });

      if (!result.success || result.submissionStatus === 'processing_failed') {
        setCompletionState('processing_failed');
        setCompletionMessage(
          result.message ??
            'Your signature was captured, but the signed document could not be finalized.',
        );
        return;
      }

      if (result.submissionStatus === 'processing') {
        setCompletionState('processing');
        setCompletionMessage(
          result.message ??
            'Your signature was captured and the document is still being finalized.',
        );
        return;
      }

      setCompletionState('completed');
      setCompletionMessage(null);
    } catch {
      // Error handled by mutation state
    }
  }, [allRequiredDone, consentChecked, data?.pdfUrl, signedValues, submitMutation]);

  const handleDecline = useCallback(async () => {
    try {
      await declineMutation.mutateAsync(declineReason || undefined);
    } catch {
      // Error handled by mutation state
    }
  }, [declineReason, declineMutation]);

  // ---- Render states ----

  if (isLoading) {
    return <SigningShell><LoadingSkeleton /></SigningShell>;
  }

  if (error) {
    const message =
      (error as Error).message ?? 'This signing link is invalid or has expired.';
    return (
      <SigningShell>
        <StateCard
          icon={<AlertTriangle className="h-12 w-12 text-status-warning" />}
          title="Unable to load signing request"
          description={message}
        />
      </SigningShell>
    );
  }

  if (!data) {
    return (
      <SigningShell>
        <StateCard
          icon={<AlertTriangle className="h-12 w-12 text-status-warning" />}
          title="Signing request not found"
          description="This link may be invalid or expired."
        />
      </SigningShell>
    );
  }

  if (completionState === 'processing_failed') {
    return (
      <SigningShell>
        <StateCard
          icon={<AlertTriangle className="h-12 w-12 text-status-danger" />}
          title="Signature captured, processing failed"
          description={
            completionMessage ??
            'Your signature was recorded, but the signed document could not be finalized.'
          }
        />
      </SigningShell>
    );
  }

  if (completionState === 'processing') {
    return (
      <SigningShell>
        <StateCard
          icon={<Clock className="h-12 w-12 text-interactive" />}
          title="Signature captured"
          description={
            completionMessage ??
            'Your signature was recorded and the signed document is still being finalized.'
          }
        />
      </SigningShell>
    );
  }

  // Already completed
  if (data.signer.status === 'completed' || completionState === 'completed') {
    return (
      <SigningShell>
        <StateCard
          icon={<CheckCircle2 className="h-12 w-12 text-status-success" />}
          title="Signing complete"
          description="You have already signed this document. You can close this page."
        />
      </SigningShell>
    );
  }

  // Declined
  if (data.signer.status === 'declined' || declineMutation.isSuccess) {
    return (
      <SigningShell>
        <StateCard
          icon={<XCircle className="h-12 w-12 text-status-danger" />}
          title="Signing declined"
          description="You have declined to sign this document."
        />
      </SigningShell>
    );
  }

  // Cancelled
  if (submissionStatus === 'cancelled') {
    return (
      <SigningShell>
        <StateCard
          icon={<XCircle className="h-12 w-12 text-content-disabled" />}
          title="Request cancelled"
          description="This signing request has been cancelled by the sender."
        />
      </SigningShell>
    );
  }

  // Expired
  if (submissionStatus === 'expired') {
    return (
      <SigningShell>
        <StateCard
          icon={<Clock className="h-12 w-12 text-status-warning" />}
          title="Request expired"
          description="This signing request has expired. Please contact the sender for a new link."
        />
      </SigningShell>
    );
  }

  // Waiting for another signer (sequential)
  if (data.isWaiting) {
    return (
      <SigningShell>
        <StateCard
          icon={<Clock className="h-12 w-12 text-interactive" />}
          title="Waiting for another signer"
          description={`Waiting for ${data.waitingFor ?? 'the previous signer'} to sign first.`}
        />
      </SigningShell>
    );
  }

  if (!data.pdfUrl) {
    return (
      <SigningShell>
        <StateCard
          icon={<AlertTriangle className="h-12 w-12 text-status-warning" />}
          title="Document unavailable"
          description="This signing request cannot be completed because the source PDF is unavailable. Please contact the sender."
        />
      </SigningShell>
    );
  }

  // ---- Active signing ----
  return (
    <SigningShell>
      {/* Header */}
      <div className="border-b bg-surface-card sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-status-success">
            <Lock className="h-4 w-4" />
            <span className="font-medium">Secured</span>
          </div>
          <span className="text-xs text-content-secondary truncate max-w-[200px]">
            {data.template.name}
          </span>
        </div>
      </div>

      {/* Identity bar */}
      <div className="bg-interactive-subtle border-b border-edge-subtle">
        <div className="max-w-4xl mx-auto px-4 py-2 text-sm text-interactive">
          Signing as:{' '}
          <span className="font-medium">{data.signer.name ?? 'Signer'}</span>
          {' \u00B7 '}
          <span>{data.signer.email}</span>
        </div>
      </div>

      {/* Sender message */}
      {data.submission.messageBody && (
        <div className="max-w-4xl mx-auto px-4 mt-4">
          <button
            type="button"
            onClick={() => setMessageExpanded((p) => !p)}
            className="flex items-center gap-1 text-sm text-content-secondary hover:text-content"
          >
            <span className="font-medium">Message from sender</span>
            {messageExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {messageExpanded && (
            <div className="mt-2 p-3 bg-surface-hover rounded-md text-sm text-content-secondary whitespace-pre-wrap">
              {data.submission.messageBody}
            </div>
          )}
        </div>
      )}

      {/* PDF + Fields */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-surface-card border rounded-md shadow-sm overflow-hidden p-4">
          <PdfViewer
            pdfUrl={data.pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onDocumentLoad={({ totalPages }) => {
              setCurrentPage((page) => Math.min(page, Math.max(totalPages - 1, 0)));
            }}
            scale={1}
          >
            <div className="absolute inset-0">
              {currentPageFields.map((field) => {
                const value = signedValues[field.id];
                const isFilled = isFieldCompleted(field, value);
                const sharedStyle = {
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                };

                if (field.type === 'text') {
                  return (
                    <div
                      key={field.id}
                      className={`absolute border-2 rounded transition-colors ${
                        isFilled
                          ? 'border-status-success bg-status-success-bg/80'
                          : 'border-interactive bg-interactive-subtle/60'
                      }`}
                      style={sharedStyle}
                      title={field.label ?? field.type}
                    >
                      <input
                        type="text"
                        value={value?.value ?? ''}
                        onChange={(e) => handleTextFieldChange(field, e.target.value)}
                        className="w-full h-full bg-transparent text-xs px-1 outline-none"
                        placeholder={field.label ?? 'Enter text'}
                      />
                    </div>
                  );
                }

                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => handleFieldClick(field)}
                    className={`absolute border-2 rounded transition-colors cursor-pointer ${
                      isFilled
                        ? 'border-status-success bg-status-success-bg/80'
                        : 'border-interactive bg-interactive-subtle/60 hover:bg-interactive-subtle/80'
                    }`}
                    style={sharedStyle}
                    title={field.label ?? field.type}
                  >
                    {isFilled && (field.type === 'signature' || field.type === 'initials') && (
                      <img
                        src={value?.value ?? ''}
                        alt={field.type}
                        className="w-full h-full object-contain p-0.5"
                      />
                    )}
                    {isFilled && field.type === 'date' && (
                      <span className="text-xs text-content-secondary">{value?.value ?? ''}</span>
                    )}
                    {isFilled && field.type === 'checkbox' && (
                      <span className="text-status-success text-lg">
                        {value?.value === 'true' ? '\u2713' : ''}
                      </span>
                    )}
                    {!isFilled && (
                      <span className="text-xs text-interactive font-medium">
                        {field.label ?? field.type}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </PdfViewer>
        </div>
      </div>

      {/* Progress bar */}
      <div className="sticky bottom-[72px] z-20 bg-surface-card/95 backdrop-blur border-t">
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between text-sm text-content-secondary mb-1">
            <span>
              {completedCount} of {fields.length} fields completed
            </span>
            <span>{Math.round((completedCount / Math.max(fields.length, 1)) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-interactive rounded-full transition-all duration-300"
              style={{
                width: `${(completedCount / Math.max(fields.length, 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom bar: consent + actions */}
      <div className="sticky bottom-0 z-20 bg-surface-card border-t shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 space-y-3">
          {/* Consent */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-edge-strong text-interactive focus:ring-interactive"
            />
            <span className="text-xs text-content-secondary leading-relaxed">
              {ESIGN_CONSENT_TEXT}
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3">
            {!showDecline ? (
              <>
                <Button
                  variant="ghost"
                  className="text-status-danger hover:text-status-danger hover:bg-status-danger-bg"
                  onClick={() => setShowDecline(true)}
                >
                  Decline
                </Button>
                <Button
                  className="flex-1"
                  disabled={
                    !allRequiredDone ||
                    !consentChecked ||
                    submitMutation.isPending
                  }
                  onClick={handleFinish}
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Finish'
                  )}
                </Button>
              </>
            ) : (
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-content">
                  Are you sure you want to decline?
                </p>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full border border-edge-strong rounded-md px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-interactive"
                />
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowDecline(false)}
                  >
                    Go back
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={handleDecline}
                    disabled={declineMutation.isPending}
                  >
                    {declineMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Declining...
                      </>
                    ) : (
                      'Confirm Decline'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Error messages */}
          {submitMutation.isError && (
            <p className="text-sm text-status-danger">
              {(submitMutation.error as Error).message ?? 'Failed to submit signature.'}
            </p>
          )}
          {declineMutation.isError && (
            <p className="text-sm text-status-danger">
              {(declineMutation.error as Error).message ?? 'Failed to decline.'}
            </p>
          )}
        </div>
      </div>

      {/* Signature capture modal */}
      {captureField &&
        (captureField.type === 'signature' ||
          captureField.type === 'initials') && (
          <SignatureCapture
            mode={captureField.type}
            cachedValue={
              captureField.type === 'signature'
                ? cachedSignature
                : cachedInitials
            }
            onCapture={handleSignatureCapture}
            onCancel={() => setCaptureField(null)}
          />
        )}
    </SigningShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SigningShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-page flex flex-col">{children}</div>
  );
}

function StateCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-4">{icon}</div>
        <h1 className="text-xl font-semibold text-content mb-2">{title}</h1>
        <p className="text-sm text-content-secondary">{description}</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-12 bg-surface-muted animate-pulse" />
      <div className="h-8 bg-surface-muted animate-pulse" />
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <div className="bg-surface-muted rounded-md animate-pulse h-[600px]" />
      </div>
    </div>
  );
}
