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
        sendEmail: true,
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
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to E-Sign
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-1">
        Send Document for Signing
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Select a template, add signers, and send.
      </p>

      <div className="space-y-6">
        {/* Step 1: Template */}
        <Card className="p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">
            1. Select Template
          </h2>
          <div className="relative">
            <div
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 flex items-center justify-between cursor-pointer hover:border-gray-400 transition-colors"
              onClick={() => setShowTemplateDropdown((p) => !p)}
            >
              <span
                className={
                  selectedTemplate
                    ? 'text-gray-900 text-sm'
                    : 'text-gray-400 text-sm'
                }
              >
                {selectedTemplate?.name ?? 'Choose a template...'}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </div>

            {showTemplateDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Search templates..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-48">
                  {templatesLoading && (
                    <div className="px-3 py-4 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                    </div>
                  )}
                  {!templatesLoading &&
                    filteredTemplates.length === 0 && (
                      <p className="px-3 py-4 text-sm text-gray-400 text-center">
                        No templates found.
                      </p>
                    )}
                  {filteredTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm transition-colors"
                    >
                      <span className="font-medium text-gray-900">
                        {t.name}
                      </span>
                      {t.description && (
                        <span className="block text-xs text-gray-400 mt-0.5 truncate">
                          {t.description}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Step 2: Signers */}
        {selectedTemplate && (
          <Card className="p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-3">
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
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      readOnly={signerRoles.includes(signer.role)}
                    />
                    <input
                      type="text"
                      value={signer.name}
                      onChange={(e) =>
                        updateSigner(idx, 'name', e.target.value)
                      }
                      placeholder="Full name"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="email"
                      value={signer.email}
                      onChange={(e) =>
                        updateSigner(idx, 'email', e.target.value)
                      }
                      placeholder="Email address"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {!signerRoles.includes(signer.role) && (
                    <button
                      type="button"
                      onClick={() => removeSigner(idx)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
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
            <h2 className="text-sm font-medium text-gray-900 mb-3">
              3. Options
            </h2>
            <div className="space-y-4">
              {/* Signing order toggle */}
              <div>
                <label className="text-sm text-gray-700 block mb-1.5">
                  Signing order
                </label>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                  <button
                    type="button"
                    onClick={() => setSigningOrder('parallel')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      signingOrder === 'parallel'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Parallel
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigningOrder('sequential')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      signingOrder === 'sequential'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Sequential
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {signingOrder === 'parallel'
                    ? 'All signers can sign at the same time.'
                    : 'Signers will be notified in order.'}
                </p>
              </div>

              {/* Expiration */}
              <div>
                <label
                  htmlFor="expiration"
                  className="text-sm text-gray-700 block mb-1.5"
                >
                  Expires after
                </label>
                <select
                  id="expiration"
                  value={expirationDays}
                  onChange={(e) =>
                    setExpirationDays(Number(e.target.value))
                  }
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder="Message to signers (optional)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <Card className="p-5 border-blue-200 bg-blue-50/50">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  Confirm & Send
                </h3>
                <p className="text-sm text-gray-600 mb-1">
                  Template:{' '}
                  <span className="font-medium">
                    {selectedTemplate.name}
                  </span>
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  Signers:{' '}
                  <span className="font-medium">{signers.length}</span> (
                  {signers.map((s) => s.name || s.email).join(', ')})
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  Order:{' '}
                  <span className="font-medium capitalize">
                    {signingOrder}
                  </span>
                </p>
                <p className="text-sm text-gray-600 mb-4">
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
                  <p className="mt-3 text-sm text-red-600">
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
