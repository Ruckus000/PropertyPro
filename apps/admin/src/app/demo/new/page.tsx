'use client';

/**
 * Demo Generator Wizard — Configure → Preview two-step wizard.
 *
 * Task 10: Configure screen.
 * Task 11: Preview screen with compiled template iframes and generate flow.
 */
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  getDemoTemplates,
  getDefaultTemplate,
  getContentStrategies,
  getDefaultStrategy,
  getTemplateById,
  getStrategyById,
  type CommunityType,
} from '@propertypro/shared';
import { PhoneFrame } from '@propertypro/ui';
import { AdminLayout } from '@/components/AdminLayout';
import { TemplateCard } from '@/components/demo/TemplateCard';
import { BrandingFormFields } from '@/components/demo/BrandingFormFields';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 'configure' | 'preview' | 'creating' | 'done';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitialConfig(communityType: CommunityType = 'condo_718') {
  return {
    prospectName: '',
    communityType,
    publicTemplateId: getDefaultTemplate(communityType, 'public')?.id ?? '',
    mobileTemplateId: getDefaultTemplate(communityType, 'mobile')?.id ?? '',
    contentStrategy: getDefaultStrategy(communityType).id,
    branding: {
      primaryColor: '#2563EB',
      secondaryColor: '#1E40AF',
      accentColor: '#DBEAFE',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      logoPath: '',
    },
    crmUrl: '',
    notes: '',
  };
}

const COMMUNITY_TYPE_LABELS: Record<CommunityType, string> = {
  condo_718: 'Condo (§718)',
  hoa_720: 'HOA (§720)',
  apartment: 'Apartment',
};

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'configure', label: 'Configure' },
  { id: 'preview', label: 'Preview' },
];

function ProgressBar({
  currentStep,
  onStepClick,
}: {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}) {
  const activeIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-0" aria-label="Wizard progress">
      {WIZARD_STEPS.map((s, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        const isLast = i === WIZARD_STEPS.length - 1;
        const isClickable = isDone;

        return (
          <div key={s.id} className="flex items-center">
            {/* Step dot + label */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(s.id)}
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-1',
                  isActive
                    ? 'bg-[var(--interactive-primary)]'
                    : isDone
                      ? 'bg-[var(--status-success)] cursor-pointer'
                      : 'bg-[var(--border-default)] cursor-default',
                )}
                aria-current={isActive ? 'step' : undefined}
                aria-label={isDone ? `Go back to ${s.label}` : s.label}
              />
              <span
                className={cn(
                  'text-xs font-medium leading-none',
                  isActive
                    ? 'text-[var(--interactive-primary)]'
                    : 'text-[var(--text-secondary)]',
                )}
              >
                {isDone ? (
                  <span className="text-[var(--status-success)]">✓ {s.label}</span>
                ) : (
                  s.label
                )}
              </span>
            </div>

            {/* Connector line (not after last) */}
            {!isLast && (
              <div
                className={cn(
                  'mx-2 mb-3 h-px w-16 transition-colors',
                  isDone
                    ? 'bg-[var(--status-success)]'
                    : 'bg-[var(--border-default)]',
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Community type toggle
// ---------------------------------------------------------------------------

const COMMUNITY_TYPES: Array<{ type: CommunityType; label: string }> = [
  { type: 'condo_718', label: 'Condo' },
  { type: 'hoa_720', label: 'HOA' },
  { type: 'apartment', label: 'Apt' },
];

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--interactive-primary)]">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-[var(--border-default)] rounded-[10px] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-inset"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        {open ? (
          <ChevronUp size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
        ) : (
          <ChevronDown size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--border-default)] px-4 py-4">{children}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview step
// ---------------------------------------------------------------------------

function PreviewStep({
  config,
  onBack,
  onGenerated,
}: {
  config: ReturnType<typeof getInitialConfig>;
  onBack: () => void;
  onGenerated: (demoId: string) => void;
}) {
  const [previewHtml, setPreviewHtml] = useState<{
    publicHtml: string;
    mobileHtml: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  // Mobile blob URL kept in state so the PhoneFrame re-renders when it changes
  const [mobileBlobUrl, setMobileBlobUrl] = useState<string | null>(null);
  // Public blob URL only needed imperatively (opened in new tab), use a ref
  const publicBlobUrlRef = useRef<string | null>(null);

  function loadPreview() {
    setPreviewLoading(true);
    setPreviewError('');

    fetch('/api/admin/demos/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityType: config.communityType,
        publicTemplateId: config.publicTemplateId,
        mobileTemplateId: config.mobileTemplateId,
        prospectName: config.prospectName,
        branding: config.branding,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error.message ?? 'Preview failed');
        setPreviewHtml(data);
      })
      .catch((err: Error) => setPreviewError(err.message))
      .finally(() => setPreviewLoading(false));
  }

  // Trigger preview on mount
  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build blob URL for mobile iframe; revoke old one on change
  useEffect(() => {
    if (!previewHtml) return;

    const url = URL.createObjectURL(
      new Blob([previewHtml.mobileHtml], { type: 'text/html' }),
    );
    setMobileBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      setMobileBlobUrl(null);
    };
  }, [previewHtml]);

  // Revoke public blob URL on unmount
  useEffect(() => {
    return () => {
      if (publicBlobUrlRef.current) {
        URL.revokeObjectURL(publicBlobUrlRef.current);
        publicBlobUrlRef.current = null;
      }
    };
  }, []);

  function openPublicFullSize() {
    if (!previewHtml) return;
    // Revoke previous
    if (publicBlobUrlRef.current) {
      URL.revokeObjectURL(publicBlobUrlRef.current);
    }
    const url = URL.createObjectURL(
      new Blob([previewHtml.publicHtml], { type: 'text/html' }),
    );
    publicBlobUrlRef.current = url;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openMobileFullSize() {
    if (!mobileBlobUrl) return;
    window.open(mobileBlobUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch('/api/admin/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message ?? 'Generation failed');
      onGenerated(data.id ?? data.demoId);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Something went wrong');
      setGenerating(false);
    }
  }

  const publicTemplateName = getTemplateById(
    config.publicTemplateId as Parameters<typeof getTemplateById>[0],
  )?.name ?? config.publicTemplateId;
  const mobileTemplateName = getTemplateById(
    config.mobileTemplateId as Parameters<typeof getTemplateById>[0],
  )?.name ?? config.mobileTemplateId;
  const strategyLabel = getStrategyById(config.contentStrategy)?.label ?? config.contentStrategy;
  const communityTypeLabel = COMMUNITY_TYPE_LABELS[config.communityType] ?? config.communityType;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Here&apos;s what {config.prospectName} will see
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Review both views below. Go back to adjust anything before generating.
        </p>
      </div>

      {/* Summary card */}
      <div className="bg-[var(--surface-muted)] rounded-[10px] p-4 mb-5 space-y-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-[var(--text-secondary)]">Type</dt>
            <dd className="font-medium text-[var(--text-primary)]">{communityTypeLabel}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">Content Focus</dt>
            <dd className="font-medium text-[var(--text-primary)]">{strategyLabel}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">Public Template</dt>
            <dd className="font-medium text-[var(--text-primary)]">{publicTemplateName}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">Mobile Template</dt>
            <dd className="font-medium text-[var(--text-primary)]">{mobileTemplateName}</dd>
          </div>
        </dl>
      </div>

      {/* Error state (generate error shown here) */}
      {generateError && (
        <div
          role="alert"
          className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-[10px] p-4 text-sm text-[var(--text-primary)]"
        >
          {generateError}
        </div>
      )}

      {/* Loading state */}
      {previewLoading && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading preview">
          {/* Public website skeleton */}
          <div className="h-[400px] rounded-[10px] bg-[var(--surface-muted)] animate-pulse" />
          {/* Mobile skeleton */}
          <div className="h-[200px] rounded-[10px] bg-[var(--surface-muted)] animate-pulse" />
        </div>
      )}

      {/* Error state */}
      {!previewLoading && previewError && (
        <div
          role="alert"
          className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-[10px] p-4"
        >
          <p className="text-sm text-[var(--text-primary)] mb-3">{previewError}</p>
          <button
            type="button"
            onClick={loadPreview}
            className="text-sm font-medium text-[var(--interactive-primary)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] rounded"
          >
            Retry
          </button>
        </div>
      )}

      {/* Preview content */}
      {!previewLoading && !previewError && previewHtml && (
        <div className="space-y-8">
          {/* Public Website Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                Public Website
              </span>
              <button
                type="button"
                onClick={openPublicFullSize}
                className="text-xs text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] rounded"
              >
                Open full size
              </button>
            </div>

            {/* Browser chrome */}
            <div className="rounded-[10px] overflow-hidden border border-[var(--border-default)] shadow-sm">
              {/* Chrome top bar */}
              <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-1.5 border-b border-[var(--border-default)]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
              </div>
              <iframe
                srcDoc={previewHtml.publicHtml}
                sandbox="allow-scripts allow-same-origin"
                title="Public website preview"
                style={{ height: 400, width: '100%', border: 'none', display: 'block' }}
              />
            </div>
          </div>

          {/* Mobile Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                Mobile App
              </span>
              <button
                type="button"
                onClick={openMobileFullSize}
                className="text-xs text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] rounded"
              >
                Open full size
              </button>
            </div>

            {/* Phone frame — scaled down to fit the page column */}
            <div
              style={{
                width: Math.round(430 * 0.6),
                height: Math.round(932 * 0.6),
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  transformOrigin: 'top left',
                  transform: 'scale(0.6)',
                }}
              >
                {mobileBlobUrl && (
                  <PhoneFrame src={mobileBlobUrl} loading="eager" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={generating}
          className={cn(
            'border border-[var(--border-default)] rounded-[10px] bg-[var(--surface-card)]',
            'text-[var(--text-primary)] px-5 h-[40px] text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          ← Back to Edit
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || previewLoading || !!previewError}
          className={cn(
            'bg-[var(--status-success)] text-white rounded-[10px] px-5 h-[40px] text-sm font-semibold flex-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-success)] focus-visible:ring-offset-2',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-opacity hover:opacity-90',
          )}
        >
          {generating ? 'Generating…' : 'Generate Demo'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creating state
// ---------------------------------------------------------------------------

function CreatingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div
        className="h-10 w-10 rounded-full border-4 border-[var(--border-default)] border-t-[var(--interactive-primary)] animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm text-[var(--text-secondary)]">Generating demo…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DemoNewPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('configure');
  const [config, setConfig] = useState(getInitialConfig('condo_718'));

  function handleCommunityTypeChange(type: CommunityType) {
    setConfig((prev) => ({
      ...prev,
      communityType: type,
      publicTemplateId: getDefaultTemplate(type, 'public')?.id ?? '',
      mobileTemplateId: getDefaultTemplate(type, 'mobile')?.id ?? '',
      contentStrategy: getDefaultStrategy(type).id,
    }));
  }

  function handleGenerated(demoId: string) {
    setStep('creating');
    router.push(`/demo/${demoId}/preview`);
  }

  const publicTemplates = getDemoTemplates(config.communityType, 'public');
  const mobileTemplates = getDemoTemplates(config.communityType, 'mobile');
  const contentStrategies = getContentStrategies(config.communityType);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/demo"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] rounded"
          >
            ← Back to Demos
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">Create Demo</h1>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <ProgressBar
            currentStep={step}
            onStepClick={(s) => {
              if (s === 'configure') setStep('configure');
            }}
          />
        </div>

        {/* Configure step */}
        {step === 'configure' && (
          <div className="space-y-8">
            {/* Prospect section */}
            <section aria-labelledby="section-prospect">
              <SectionLabel>
                <span id="section-prospect">Prospect</span>
              </SectionLabel>

              {/* Community name input */}
              <div className="mb-4">
                <label
                  htmlFor="prospect-name"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
                >
                  Community Name <span className="text-[var(--status-error)]" aria-hidden="true">*</span>
                </label>
                <input
                  id="prospect-name"
                  type="text"
                  value={config.prospectName}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, prospectName: e.target.value }))
                  }
                  maxLength={100}
                  placeholder="e.g., Bayview Towers"
                  className={cn(
                    'h-[40px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)]',
                    'px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:border-[var(--interactive-primary)]',
                  )}
                />
              </div>

              {/* Community type toggle */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
                  Community Type
                </p>
                <div className="flex gap-2">
                  {COMMUNITY_TYPES.map(({ type, label }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleCommunityTypeChange(type)}
                      className={cn(
                        'h-[40px] min-w-[80px] rounded-[10px] px-4 text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)]',
                        config.communityType === type
                          ? 'border-2 border-[var(--interactive-primary)] bg-[var(--interactive-subtle)] text-[var(--interactive-primary)]'
                          : 'border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                      )}
                      aria-pressed={config.communityType === type}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Public site template */}
            <section aria-labelledby="section-public-template">
              <SectionLabel>
                <span id="section-public-template">Public Site Template</span>
              </SectionLabel>
              <div className="flex flex-wrap gap-3">
                {publicTemplates.map((t) => (
                  <div key={t.id} className="w-[180px]">
                    <TemplateCard
                      template={t}
                      selected={t.id === config.publicTemplateId}
                      onSelect={() =>
                        setConfig((prev) => ({ ...prev, publicTemplateId: t.id }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Mobile template */}
            <section aria-labelledby="section-mobile-template">
              <SectionLabel>
                <span id="section-mobile-template">Mobile Template</span>
              </SectionLabel>
              <div className="flex flex-wrap gap-3">
                {mobileTemplates.map((t) => (
                  <div key={t.id} className="w-[180px]">
                    <TemplateCard
                      template={t}
                      selected={t.id === config.mobileTemplateId}
                      onSelect={() =>
                        setConfig((prev) => ({ ...prev, mobileTemplateId: t.id }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Content focus */}
            <section aria-labelledby="section-content-focus">
              <SectionLabel>
                <span id="section-content-focus">Content Focus</span>
              </SectionLabel>
              <div className="flex flex-wrap gap-2">
                {contentStrategies.map((s) => {
                  const isSelected = s.id === config.contentStrategy;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({ ...prev, contentStrategy: s.id }))
                      }
                      title={s.description}
                      className={cn(
                        'rounded-full px-3 py-2 text-sm transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)]',
                        isSelected
                          ? 'border-2 border-[var(--interactive-primary)] bg-[var(--interactive-subtle)] text-[var(--interactive-primary)] font-medium'
                          : 'border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)]',
                      )}
                      aria-pressed={isSelected}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Branding — collapsible */}
            <CollapsibleSection label="Branding">
              <BrandingFormFields
                value={config.branding}
                onChange={(branding) => setConfig((prev) => ({ ...prev, branding }))}
              />
            </CollapsibleSection>

            {/* Optional fields — collapsible */}
            <CollapsibleSection label="Optional">
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="crm-url"
                    className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
                  >
                    CRM Link
                    <span className="ml-1 text-xs font-normal text-[var(--text-secondary)]">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="crm-url"
                    type="url"
                    value={config.crmUrl}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, crmUrl: e.target.value }))
                    }
                    placeholder="https://crm.example.com/deal/123"
                    className={cn(
                      'h-[40px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)]',
                      'px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:border-[var(--interactive-primary)]',
                    )}
                  />
                </div>
                <div>
                  <label
                    htmlFor="notes"
                    className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
                  >
                    Internal Notes
                    <span className="ml-1 text-xs font-normal text-[var(--text-secondary)]">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="notes"
                    value={config.notes}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    maxLength={2000}
                    rows={3}
                    placeholder="Internal notes about this prospect..."
                    className={cn(
                      'w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)]',
                      'px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:border-[var(--interactive-primary)]',
                      'resize-none',
                    )}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* CTA */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setStep('preview')}
                disabled={!config.prospectName.trim()}
                className={cn(
                  'h-[40px] w-full rounded-[10px] bg-[var(--interactive-primary)] text-sm font-semibold text-white',
                  'transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'hover:opacity-90',
                )}
              >
                Preview Demo →
              </button>
            </div>
          </div>
        )}

        {/* Preview step */}
        {step === 'preview' && (
          <PreviewStep
            config={config}
            onBack={() => setStep('configure')}
            onGenerated={handleGenerated}
          />
        )}

        {/* Creating step */}
        {step === 'creating' && <CreatingState />}
      </div>
    </AdminLayout>
  );
}
