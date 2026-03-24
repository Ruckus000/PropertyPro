'use client';

/**
 * NewSubmissionForm — Form for creating a new e-sign submission.
 *
 * Steps:
 * 1. Select template (searchable dropdown)
 * 2. Configure signers (per role from template)
 * 3. Set signing order, expiration, optional message
 * 4. Confirm and send
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card } from '@propertypro/ui';
import type { EsignFieldsSchema } from '@propertypro/shared';
import { useEsignTemplates } from '@/hooks/use-esign-templates';
import { useCreateEsignSubmission } from '@/hooks/use-esign-submissions';
import type { EsignTemplateRecord } from '@/lib/services/esign-service';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Search,
  Trash2,
  Send,
} from 'lucide-react';

interface NewSubmissionFormProps {
  communityId: number;
}

interface SignerInput {
  role: string;
  name: string;
  email: string;
}

function templateHasSourceDocument(template: Pick<EsignTemplateRecord, 'sourceDocumentPath'>): boolean {
  return (
    typeof template.sourceDocumentPath === 'string' &&
    template.sourceDocumentPath.trim().length > 0
  );
}

export function NewSubmissionForm({ communityId }: NewSubmissionFormProps) {
  const router = useRouter();

  // Template selection
  const {
    data: templates,
    isLoading: templatesLoading,
  } = useEsignTemplates(communityId, { status: 'active' });
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] =
    useState<EsignTemplateRecord | null>(null);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  // Signer config
  const [signers, setSigners] = useState<SignerInput[]>([]);

  // Options
  const [signingOrder, setSigningOrder] = useState<'parallel' | 'sequential'>(
    'parallel',
  );
  const [expirationDays, setExpirationDays] = useState(30);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');

  // Confirm
  const [showConfirm, setShowConfirm] = useState(false);

  const createMutation = useCreateEsignSubmission(communityId);

  // Derive signer roles from template
  const signerRoles = useMemo(() => {
    if (!selectedTemplate?.fieldsSchema) return [];
    const schema = selectedTemplate.fieldsSchema as EsignFieldsSchema;
    return schema.signerRoles ?? [];
  }, [selectedTemplate]);

  // Initialize signers when template selected
  const handleSelectTemplate = useCallback(
    (template: EsignTemplateRecord) => {
      if (!templateHasSourceDocument(template)) {
        return;
      }
      setSelectedTemplate(template);
      setShowTemplateDropdown(false);
      setTemplateSearch('');
      const schema = template.fieldsSchema as EsignFieldsSchema | null;
      const roles = schema?.signerRoles ?? [];
      setSigners(roles.map((role) => ({ role, name: '', email: '' })));
    },
    [],
  );

  // Filter templates by search
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!templateSearch.trim()) return templates;
    const q = templateSearch.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
    );
  }, [templates, templateSearch]);

  // Signer updates
  const updateSigner = useCallback(
    (index: number, field: keyof SignerInput, value: string) => {
      setSigners((prev) =>
        prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
      );
    },
    [],
  );

  const addSigner = useCallback(() => {
    setSigners((prev) => [...prev, { role: 'signer', name: '', email: '' }]);
  }, []);

  const removeSigner = useCallback((index: number) => {
    setSigners((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Validation
  const isValid = useMemo(() => {
    if (!selectedTemplate) return false;
    if (!templateHasSourceDocument(selectedTemplate)) return false;
    if (signers.length === 0) return false;
    return signers.every(
      (s) => s.name.trim() && s.email.trim() && s.email.includes('@'),
    );
  }, [selectedTemplate, signers]);

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!selectedTemplate || !isValid) return;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    try {
      await createMutation.mutateAsync({
        templateId: selectedTemplate.id,
        signers: signers.map((s, i) => ({
          email: s.email.trim(),
          name: s.name.trim(),
          role: s.role,
          sortOrder: i,
        })),
        signingOrder,
        sendEmail: false,
        expiresAt: expiresAt.toISOString(),
        messageSubject: messageSubject.trim() || undefined,
        messageBody: messageBody.trim() || undefined,
      });
      router.push(`/esign?communityId=${communityId}`);
    } catch {
      // Error handled by mutation state
    }
  }, [
    selectedTemplate,
    isValid,
    signers,
    signingOrder,
    expirationDays,
    messageSubject,
    messageBody,
    createMutation,
    communityId,
    router,
  ]);

  return (
    <div className="max-w-2xl">
      {/* Back link */}
      <Link
        href={`/esign?communityId=${communityId}`}
        className="inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content-secondary mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to E-Sign
      </Link>

      <h1 className="text-2xl font-semibold text-content mb-1">
        Send Document for Signing
      </h1>
      <p className="text-sm text-content-tertiary mb-6">
        Select a template, add signers, and send.
      </p>

      <div className="space-y-6">
        {/* Step 1: Template */}
        <Card className="p-5">
          <h2 className="text-sm font-medium text-content mb-3">
            1. Select Template
          </h2>
          <div className="relative">
            <div
              data-testid="esign-template-select-trigger"
              className="w-full border border-edge-strong rounded-md px-3 py-2.5 flex items-center justify-between cursor-pointer hover:border-edge-strong transition-colors duration-quick"
              onClick={() => setShowTemplateDropdown((p) => !p)}
            >
              <span
                className={
                  selectedTemplate
                    ? 'text-content text-sm'
                    : 'text-content-disabled text-sm'
                }
              >
                {selectedTemplate?.name ?? 'Choose a template...'}
              </span>
              <ChevronDown className="h-4 w-4 text-content-disabled" />
            </div>

            {showTemplateDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-surface-card border border-edge rounded-md shadow-lg max-h-64 overflow-hidden">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-disabled" />
                    <input
                      type="text"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Search templates..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-edge rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-48">
                  {templatesLoading && (
                    <div className="px-3 py-4 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-content-disabled" />
                    </div>
                  )}
                  {!templatesLoading &&
                    filteredTemplates.length === 0 && (
                      <p className="px-3 py-4 text-sm text-content-disabled text-center">
                        No templates found.
                      </p>
                    )}
                  {filteredTemplates.map((t) => (
                    (() => {
                      const isReady = templateHasSourceDocument(t);

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectTemplate(t)}
                          disabled={!isReady}
                          aria-disabled={!isReady}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors duration-quick ${
                            isReady
                              ? 'hover:bg-surface-hover'
                              : 'cursor-not-allowed opacity-60'
                          }`}
                        >
                          <span className="font-medium text-content">
                            {t.name}
                          </span>
                          {t.description && (
                            <span className="block text-xs text-content-disabled mt-0.5 truncate">
                              {t.description}
                            </span>
                          )}
                          {!isReady && (
                            <span className="block text-xs text-status-warning mt-1">
                              Source PDF required before sending.
                            </span>
                          )}
                        </button>
                      );
                    })()
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Step 2: Signers */}
        {selectedTemplate && (
          <Card className="p-5">
            <h2 className="text-sm font-medium text-content mb-3">
              2. Configure Signers
            </h2>
            <div className="space-y-3">
              {signers.map((signer, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={signer.role}
                      onChange={(e) =>
                        updateSigner(idx, 'role', e.target.value)
                      }
                      placeholder="Role"
                      className="border border-edge-strong rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                      readOnly={signerRoles.includes(signer.role)}
                    />
                    <input
                      type="text"
                      value={signer.name}
                      onChange={(e) =>
                        updateSigner(idx, 'name', e.target.value)
                      }
                      placeholder="Full name"
                      className="border border-edge-strong rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                    />
                    <input
                      type="email"
                      value={signer.email}
                      onChange={(e) =>
                        updateSigner(idx, 'email', e.target.value)
                      }
                      placeholder="Email address"
                      className="border border-edge-strong rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                    />
                  </div>
                  {!signerRoles.includes(signer.role) && (
                    <button
                      type="button"
                      onClick={() => removeSigner(idx)}
                      className="p-2 text-content-disabled hover:text-status-danger transition-colors duration-quick"
                      title="Remove signer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={addSigner}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add signer
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Options */}
        {selectedTemplate && (
          <Card className="p-5">
            <h2 className="text-sm font-medium text-content mb-3">
              3. Options
            </h2>
            <div className="space-y-4">
              {/* Signing order toggle */}
              <div>
                <label className="text-sm text-content-secondary block mb-1.5">
                  Signing order
                </label>
                <div className="flex gap-1 bg-surface-muted rounded-md p-1 w-fit">
                  <button
                    type="button"
                    onClick={() => setSigningOrder('parallel')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-quick ${
                      signingOrder === 'parallel'
                        ? 'bg-surface-card text-content shadow-e0'
                        : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    Parallel
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigningOrder('sequential')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-quick ${
                      signingOrder === 'sequential'
                        ? 'bg-surface-card text-content shadow-e0'
                        : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    Sequential
                  </button>
                </div>
                <p className="text-xs text-content-disabled mt-1">
                  {signingOrder === 'parallel'
                    ? 'All signers can sign at the same time.'
                    : 'Signing links unlock in order. Share them from the submission detail page.'}
                </p>
              </div>

              {/* Expiration */}
              <div>
                <label
                  htmlFor="expiration"
                  className="text-sm text-content-secondary block mb-1.5"
                >
                  Expires after
                </label>
                <select
                  id="expiration"
                  value={expirationDays}
                  onChange={(e) =>
                    setExpirationDays(Number(e.target.value))
                  }
                  className="border border-edge-strong rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>

              {/* Custom message (collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setMessageExpanded((p) => !p)}
                  className="flex items-center gap-1 text-sm text-content-secondary hover:text-content"
                >
                  <span>Custom message</span>
                  {messageExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {messageExpanded && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={messageSubject}
                      onChange={(e) => setMessageSubject(e.target.value)}
                      placeholder="Email subject (optional)"
                      className="w-full border border-edge-strong rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                    />
                    <textarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder="Message to signers (optional)"
                      className="w-full border border-edge-strong rounded-md px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-focus"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Submit */}
        {selectedTemplate && (
          <div>
            {!showConfirm ? (
              <Button
                className="w-full"
                disabled={!isValid}
                onClick={() => setShowConfirm(true)}
              >
                <Send className="h-4 w-4 mr-2" />
                Review & Send
              </Button>
            ) : (
              <Card className="p-5 border-status-info-border bg-interactive-subtle/50">
                <h3 className="text-sm font-medium text-content mb-2">
                  Confirm & Send
                </h3>
                <p className="text-sm text-content-secondary mb-1">
                  Template:{' '}
                  <span className="font-medium">
                    {selectedTemplate.name}
                  </span>
                </p>
                <p className="text-sm text-content-secondary mb-1">
                  Signers:{' '}
                  <span className="font-medium">{signers.length}</span> (
                  {signers.map((s) => s.name || s.email).join(', ')})
                </p>
                <p className="text-sm text-content-secondary mb-1">
                  Order:{' '}
                  <span className="font-medium capitalize">
                    {signingOrder}
                  </span>
                </p>
                <p className="text-sm text-content-secondary mb-4">
                  Expires in{' '}
                  <span className="font-medium">
                    {expirationDays} days
                  </span>
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowConfirm(false)}
                  >
                    Go back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send for Signing
                      </>
                    )}
                  </Button>
                </div>

                {createMutation.isError && (
                  <p className="mt-3 text-sm text-status-danger">
                    {(createMutation.error as Error).message ?? 'Failed to create submission.'}
                  </p>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NewSubmissionForm;
