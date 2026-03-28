'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { ResizableSplit } from '@/components/demo/ResizableSplit';
import { TEMPLATE_PUBLISH_HELPER_COPY } from '@/lib/templates/constants';
import type { PublicSiteTemplateDetail, TemplatePreviewDiagnostic } from '@/lib/templates/types';
import { TemplateDetailsForm } from './TemplateDetailsForm';
import { TemplateLifecycleBadge } from './TemplateLifecycleBadge';
import { TemplatePreviewPane, type ViewportPresetKey } from './TemplatePreviewPane';

interface TemplateEditorPageProps {
  initialTemplate: PublicSiteTemplateDetail;
  focusName?: boolean;
}

interface EditorFormState {
  name: string;
  summary: string;
  tagsInput: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  draftJsxSource: string;
  thumbnailLayout: string;
  gradientStart: string;
  gradientEnd: string;
}

function detailToForm(detail: PublicSiteTemplateDetail): EditorFormState {
  return {
    name: detail.name,
    summary: detail.summary,
    tagsInput: detail.tags.join(', '),
    communityType: detail.communityType,
    draftJsxSource: detail.draftJsxSource,
    thumbnailLayout: detail.thumbnailDescriptor.layout,
    gradientStart: detail.thumbnailDescriptor.gradient[0],
    gradientEnd: detail.thumbnailDescriptor.gradient[1],
  };
}

function formToRequestPayload(form: EditorFormState) {
  return {
    name: form.name,
    summary: form.summary,
    tags: form.tagsInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    communityType: form.communityType,
    draftJsxSource: form.draftJsxSource,
    thumbnailDescriptor: {
      layout: form.thumbnailLayout,
      gradient: [form.gradientStart, form.gradientEnd] as [string, string],
    },
  };
}

function serializeForm(form: EditorFormState) {
  return JSON.stringify(formToRequestPayload(form));
}

export function TemplateEditorPage({ initialTemplate, focusName = false }: TemplateEditorPageProps) {
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [form, setForm] = useState(() => detailToForm(initialTemplate));
  const [activePreset, setActivePreset] = useState<ViewportPresetKey>('desktop');
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(initialTemplate.publishedSnapshot?.compiledHtml ?? null);
  const [previewCompiledAt, setPreviewCompiledAt] = useState<string | null>(initialTemplate.publishedSnapshot?.compiledAt ?? null);
  const [previewErrors, setPreviewErrors] = useState<TemplatePreviewDiagnostic[]>([]);
  const [previewRefreshing, setPreviewRefreshing] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const previewRequestRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const dirty = serializeForm(detailToForm(template)) !== serializeForm(form);
  const nameError = form.name.trim().length >= 3 ? null : 'Template name must be at least 3 characters.';
  const valid = !nameError && form.draftJsxSource.trim().length > 0;
  const canSave = dirty && valid && !savingDraft && !publishing;
  const canPublish = !dirty && valid && previewErrors.length === 0 && !savingDraft && !publishing && !conflict;
  const communityTypeLocked = !template.canEditCommunityType;

  useEffect(() => {
    if (!focusName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [focusName]);

  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  async function runPreview() {
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewRefreshing(true);

    try {
      const response = await fetch('/api/admin/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsxSource: form.draftJsxSource,
          communityName: 'Community Name',
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      if (requestId !== previewRequestRef.current) return;

      if (!response.ok) {
        setPreviewErrors([
          {
            stage: 'compile',
            message: payload.error?.message ?? 'Preview compilation failed',
          },
        ]);
        setAnnouncement('Preview error');
        return;
      }

      const errors = (payload.errors ?? []) as TemplatePreviewDiagnostic[];
      setPreviewErrors(errors);
      setPreviewCompiledAt(payload.compiledAt ?? null);

      if (typeof payload.html === 'string') {
        setPreviewHtml(payload.html);
        setAnnouncement(errors.length > 0 ? 'Preview error' : 'Preview updated');
      } else if (errors.length > 0) {
        setAnnouncement('Preview error');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setPreviewErrors([
        {
          stage: 'runtime',
          message: error instanceof Error ? error.message : 'Preview request failed',
        },
      ]);
      setAnnouncement('Preview error');
    } finally {
      if (requestId === previewRequestRef.current) {
        setPreviewRefreshing(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runPreview();
    }, 500);

    return () => {
      window.clearTimeout(timer);
      previewAbortRef.current?.abort();
    };
  }, [form.draftJsxSource]);

  useEffect(() => {
    if (!moreMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreMenuOpen]);

  function applyTemplate(nextTemplate: PublicSiteTemplateDetail) {
    setTemplate(nextTemplate);
    setForm(detailToForm(nextTemplate));
    setConflict(false);
  }

  async function handleSaveDraft() {
    if (!canSave) return;

    setSavingDraft(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: template.updatedAt,
          ...formToRequestPayload(form),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setConflict(true);
        setErrorMessage(payload.error?.message ?? 'This template was updated elsewhere. Reload to continue.');
        window.setTimeout(() => errorRef.current?.focus(), 0);
        return;
      }

      if (!response.ok) {
        setErrorMessage(payload.error?.message ?? 'Failed to save draft');
        window.setTimeout(() => errorRef.current?.focus(), 0);
        return;
      }

      applyTemplate(payload.data as PublicSiteTemplateDetail);
      setSuccessMessage('Draft saved');
      setAnnouncement('Draft saved');
      void runPreview();
    } catch (err) {
      console.error('[templates] save draft failed', err);
      setErrorMessage('Failed to save draft');
      window.setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setSavingDraft(false);
    }
  }

  async function handlePublish() {
    if (!canPublish) return;

    setPublishing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/templates/${template.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: template.updatedAt,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setConflict(true);
        setErrorMessage(payload.error?.message ?? 'This template was updated elsewhere. Reload to continue.');
        window.setTimeout(() => errorRef.current?.focus(), 0);
        return;
      }

      if (!response.ok) {
        setErrorMessage(payload.error?.message ?? 'Failed to publish template');
        window.setTimeout(() => errorRef.current?.focus(), 0);
        return;
      }

      const nextTemplate = payload.data as PublicSiteTemplateDetail;
      applyTemplate(nextTemplate);
      setPreviewHtml(nextTemplate.publishedSnapshot?.compiledHtml ?? previewHtml);
      setPreviewCompiledAt(nextTemplate.publishedSnapshot?.compiledAt ?? previewCompiledAt);
      setSuccessMessage('Template published. Publishing makes this template available for future demos. Existing demos keep their current version until regenerated.');
      setAnnouncement('Template published');
    } catch (err) {
      console.error('[templates] publish failed', err);
      setErrorMessage('Failed to publish template');
      window.setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setPublishing(false);
    }
  }

  async function handleDuplicate() {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/templates/${template.id}/duplicate`, {
        method: 'POST',
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload.error?.message ?? 'Failed to duplicate template');
        window.setTimeout(() => errorRef.current?.focus(), 0);
        return;
      }

      router.push(`/templates/${payload.data.id}?focus=name`);
      router.refresh();
    } catch (err) {
      console.error('[templates] duplicate failed', err);
      setErrorMessage('Failed to duplicate template');
      window.setTimeout(() => errorRef.current?.focus(), 0);
    }
  }

  function renderCodeEditor() {
    return (
      <div className="flex h-full min-h-[28rem] flex-col rounded-2xl border border-gray-200 bg-gray-950 text-white">
        <div className="border-b border-gray-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Code editor</h3>
          <p className="mt-1 text-xs text-gray-400">
            Define `function App()` and reference `PP_TEMPLATE.communityName` where needed.
          </p>
        </div>
        <textarea
          value={form.draftJsxSource}
          onChange={(event) => {
            setForm((current) => ({
              ...current,
              draftJsxSource: event.target.value,
            }));
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          aria-label="Template JSX source"
          className="min-h-0 flex-1 resize-none bg-transparent px-4 py-4 font-mono text-sm leading-6 text-white outline-none"
          spellCheck={false}
        />
      </div>
    );
  }

  function renderPreviewPane() {
    return (
      <TemplatePreviewPane
        html={previewHtml}
        errors={previewErrors}
        isRefreshing={previewRefreshing}
        activePreset={activePreset}
        templateName={form.name || 'Untitled template'}
        compiledAt={previewCompiledAt}
        onPresetChange={setActivePreset}
      />
    );
  }

  return (
    <section className="space-y-6 p-6">
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Link href="/templates" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              ← Back to templates
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{form.name || 'Untitled template'}</h1>
                <p className="mt-1 text-sm text-gray-500">Stable slug: {template.slug}</p>
              </div>
              <TemplateLifecycleBadge state={template.lifecycleState} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePublish}
              disabled={!canPublish}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={!canSave}
              className="hidden rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
            >
              {savingDraft ? 'Saving…' : 'Save Draft'}
            </button>
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen((open) => !open)}
                aria-expanded={moreMenuOpen}
                aria-haspopup="true"
                className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <MoreHorizontal className="h-4 w-4" />
                More
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveDraft();
                      setMoreMenuOpen(false);
                    }}
                    disabled={!canSave}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 sm:hidden"
                  >
                    {savingDraft ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDuplicate();
                      setMoreMenuOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Duplicate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {TEMPLATE_PUBLISH_HELPER_COPY}
        </div>

        {dirty && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You have unsaved changes. Save draft before publishing.
          </div>
        )}

        {(errorMessage || successMessage || conflict) && (
          <div
            ref={errorRef}
            tabIndex={-1}
            className={[
              'rounded-2xl border px-4 py-3 text-sm outline-none',
              errorMessage || conflict
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700',
            ].join(' ')}
            role={errorMessage || conflict ? 'alert' : 'status'}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{errorMessage ?? successMessage}</span>
              {conflict && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Reload
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <TemplateDetailsForm
        name={form.name}
        summary={form.summary}
        tagsInput={form.tagsInput}
        communityType={form.communityType}
        thumbnailLayout={form.thumbnailLayout}
        gradientStart={form.gradientStart}
        gradientEnd={form.gradientEnd}
        nameError={nameError}
        communityTypeLocked={communityTypeLocked}
        usageCount={template.usageCount}
        updatedAt={template.updatedAt}
        nameInputRef={nameInputRef}
        onChange={(field, value) => {
          setForm((current) => ({
            ...current,
            [field]: value,
          }));
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Template workspace">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Template workspace</h2>
          <p className="mt-1 text-sm text-gray-500">
            Edit the JSX and review the live compiled preview. On narrow screens, the editor stacks above the preview.
          </p>
        </div>

        <div className="hidden h-[56rem] lg:block">
          <ResizableSplit
            leftLabel="Code editor"
            rightLabel="Preview"
            storageKey="templates-editor-split"
            left={renderCodeEditor()}
            right={renderPreviewPane()}
          />
        </div>

        <div className="space-y-4 lg:hidden">
          {renderCodeEditor()}
          {renderPreviewPane()}
        </div>
      </section>
    </section>
  );
}
