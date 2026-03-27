'use client';

/**
 * Demo Generator Wizard — side-by-side configurator layout.
 *
 * Steps: Basics → Public Site → Review
 * Left panel: header + PillStepper + step content + WizardFooter
 * Right panel: live PreviewPanel with debounced fetch
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  getDefaultTemplate,
  getDefaultStrategy,
  type CommunityType,
  type DemoTemplateId,
} from '@propertypro/shared';
import { AdminLayout } from '@/components/AdminLayout';
import { PillStepper, type PillStep } from '@/components/demo/PillStepper';
import { ResizableSplit } from '@/components/demo/ResizableSplit';
import { PreviewPanel } from '@/components/demo/PreviewPanel';
import { PreviewModal } from '@/components/demo/PreviewModal';
import { ReviewStep } from '@/components/demo/ReviewStep';
import { WizardFooter } from '@/components/demo/WizardFooter';
import { BasicsStep } from '@/components/demo/BasicsStep';
import { PublicSiteStep } from '@/components/demo/PublicSiteStep';
import { getClientDemoLandingUrl } from '@/lib/demo-client-url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 'basics' | 'public-site' | 'review';

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

// ---------------------------------------------------------------------------
// Wizard step definitions
// ---------------------------------------------------------------------------

const WIZARD_STEPS: PillStep[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'public-site', label: 'Public Site' },
  { id: 'review', label: 'Review' },
];

const STEP_ORDER: WizardStep[] = ['basics', 'public-site', 'review'];

const NEXT_LABELS: Record<string, string> = {
  basics: 'Next: Choose Template',
  'public-site': 'Review & Create',
  preview: 'Create Demo',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DemoNewPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('basics');
  const [config, setConfig] = useState(getInitialConfig('condo_718'));
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [createdDemo, setCreatedDemo] = useState<{
    demoId: number;
    slug: string;
    clientUrl: string;
  } | null>(null);
  const [copyClientState, setCopyClientState] = useState<'idle' | 'copied' | 'error'>('idle');

  // Preview state
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [basicsTrigger, setBasicsTrigger] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);

  // ------ Preview fetching with debounce ------

  function fetchPreview() {
    if (!config.prospectName.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
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
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error.message ?? 'Preview failed');
        setPreviewHtml(data.publicHtml ?? null);
      })
      .catch((err: Error) => setPreviewError(err.message))
      .finally(() => setPreviewLoading(false));
  }

  // Debounce: 500ms after last config change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchPreview, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.prospectName, config.communityType, config.publicTemplateId, JSON.stringify(config.branding)]);

  // ------ Navigation ------

  // Navigate to next step, marking current as completed
  const goNext = useCallback(() => {
    if (step === 'basics' && !config.prospectName.trim()) {
      setBasicsTrigger(prev => prev + 1);
      return;
    }
    const currentIndex = STEP_ORDER.indexOf(step);
    const nextStep = STEP_ORDER[currentIndex + 1];
    if (currentIndex < STEP_ORDER.length - 1 && nextStep) {
      setCompletedSteps((prev) => new Set(prev).add(step));
      setStep(nextStep);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step, config.prospectName]);

  // Navigate to previous step
  const goBack = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(step);
    const prevStep = STEP_ORDER[currentIndex - 1];
    if (currentIndex > 0 && prevStep) {
      setStep(prevStep);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // Navigate to a specific completed step (stepper click)
  const goToStep = useCallback(
    (stepId: string) => {
      const targetIndex = STEP_ORDER.indexOf(stepId as WizardStep);
      const currentIndex = STEP_ORDER.indexOf(step);
      // Only allow backward navigation
      if (targetIndex < currentIndex) {
        setStep(stepId as WizardStep);
      }
    },
    [step],
  );

  // Handle community type change — resets templates + strategy + wizard progress
  function handleCommunityTypeChange(type: CommunityType) {
    setConfig((prev) => ({
      ...prev,
      communityType: type,
      publicTemplateId: getDefaultTemplate(type, 'public')?.id ?? '',
      mobileTemplateId: getDefaultTemplate(type, 'mobile')?.id ?? '',
      contentStrategy: getDefaultStrategy(type).id,
    }));
    // Reset wizard progress: clear completed steps for template/preview steps
    setCompletedSteps(new Set());
    setStep('basics');
  }

  async function handleGenerate() {
    if (createdDemo) return;
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch('/api/admin/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType: config.communityType,
          prospectName: config.prospectName,
          branding: config.branding,
          publicTemplateId: config.publicTemplateId,
          mobileTemplateId: config.mobileTemplateId,
          contentStrategy: config.contentStrategy,
          externalCrmUrl: config.crmUrl || undefined,
          prospectNotes: config.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `Request failed (${res.status})`);
      }
      const payload = json.data ?? json;
      const demoId = payload.demoId ?? payload.id;
      const slug = payload.slug as string | undefined;
      if (demoId == null || !slug) {
        throw new Error('Invalid demo response from server');
      }
      setCreatedDemo({
        demoId: Number(demoId),
        slug,
        clientUrl: getClientDemoLandingUrl(slug),
      });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setGenerating(false);
    }
  }

  async function copyClientLink() {
    if (!createdDemo) return;
    try {
      await navigator.clipboard.writeText(createdDemo.clientUrl);
      setCopyClientState('copied');
      setTimeout(() => setCopyClientState('idle'), 2000);
    } catch {
      setCopyClientState('error');
      setTimeout(() => setCopyClientState('idle'), 2000);
    }
  }

  // Validation gate for Next button
  const isNextDisabled =
    step === 'basics' && !config.prospectName.trim();

  const previewEmpty = !config.prospectName.trim();

  // Computed error steps for stepper
  const errorSteps = new Set<string>();
  if (completedSteps.has('basics') && !config.prospectName.trim()) {
    errorSteps.add('basics');
  }

  // Enter key handler — scoped to left panel, advance on single-line inputs only
  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      goNext();
    }
  }, [goNext]);

  // Warn before leaving if wizard has progress
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (config.prospectName.trim() || step !== 'basics') {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [config.prospectName, step]);

  return (
    <AdminLayout>
      <ResizableSplit
        storageKey="demo-wizard-split"
        className="h-[calc(100vh-64px)]"
        left={
          <div className="flex flex-col h-full" onKeyDown={handlePanelKeyDown}>
            {/* Header */}
            <div className="px-6 pt-6 pb-0">
              <Link
                href="/demo"
                className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] rounded"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to Demos
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">Create Demo</h1>
            </div>

            {/* PillStepper */}
            <div className="px-6 py-4">
              <PillStepper
                steps={WIZARD_STEPS}
                currentStep={step}
                completedSteps={completedSteps}
                errorSteps={errorSteps}
                onStepClick={goToStep}
              />
            </div>

            {/* Scrollable step content */}
            <div ref={contentRef} className="flex-1 overflow-y-auto px-6 pb-4">
              <div aria-live="polite" className="sr-only">
                {`Step ${STEP_ORDER.indexOf(step) + 1} of ${STEP_ORDER.length}: ${WIZARD_STEPS.find(s => s.id === step)?.label}`}
              </div>

              {generateError && step === 'review' && (
                <div role="alert" className="rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-4 mb-4 text-sm text-[var(--text-primary)]">
                  {generateError}
                </div>
              )}

              {generating && (
                <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-muted)] p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full border-2 border-[var(--border-default)] border-t-[var(--interactive-primary)] animate-spin" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Creating demo...</p>
                      <p className="text-xs text-[var(--text-secondary)]">Configuring community → Building templates → Finalizing</p>
                    </div>
                  </div>
                </div>
              )}

              <div key={step} className="step-animate">
                {step === 'basics' && (
                  <BasicsStep
                    config={config}
                    onConfigChange={(updater) => setConfig((prev) => updater(prev))}
                    onCommunityTypeChange={handleCommunityTypeChange}
                    triggerValidation={basicsTrigger}
                  />
                )}

                {step === 'public-site' && (
                  <PublicSiteStep
                    prospectName={config.prospectName}
                    communityType={config.communityType}
                    selectedTemplateId={config.publicTemplateId}
                    onSelect={(id: DemoTemplateId) =>
                      setConfig((prev) => ({ ...prev, publicTemplateId: id }))
                    }
                  />
                )}

                {step === 'review' && !createdDemo && (
                  <ReviewStep config={config} onEditStep={goToStep} />
                )}

              {step === 'review' && createdDemo && (
                <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-muted)] p-5 space-y-4">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Demo created</h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Send this link to your prospect. It stays valid until the demo expires; your edits in admin preview will show on this page after you publish templates.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Client onboarding link
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <input
                        readOnly
                        value={createdDemo.clientUrl}
                        className="flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => { void copyClientLink(); }}
                        className="rounded-md border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                      >
                        {copyClientState === 'copied'
                          ? 'Copied'
                          : copyClientState === 'error'
                            ? 'Copy failed'
                            : 'Copy'}
                      </button>
                      <a
                        href={createdDemo.clientUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-md bg-[var(--interactive-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                      >
                        Open link
                      </a>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* Sticky footer */}
            <WizardFooter
              onBack={goBack}
              onNext={
                createdDemo
                  ? () => router.push(`/demo/${createdDemo.demoId}/preview`)
                  : step === 'review'
                    ? handleGenerate
                    : goNext
              }
              nextLabel={
                createdDemo
                  ? 'Open admin preview'
                  : NEXT_LABELS[step] ?? 'Next'
              }
              nextDisabled={isNextDisabled}
              showBack={step !== 'basics' && !createdDemo}
              onCancel={() => router.push('/demo')}
              loading={step === 'review' && !createdDemo ? generating : false}
            />
          </div>
        }
        right={
          <PreviewPanel
            publicHtml={previewHtml}
            loading={previewLoading}
            error={previewError}
            onRetry={fetchPreview}
            onExpand={() => setModalOpen(true)}
            empty={previewEmpty}
            emptyMessage="Enter a community name to see a preview"
          />
        }
      />
      <PreviewModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        publicHtml={previewHtml}
      />
    </AdminLayout>
  );
}
