'use client';

/**
 * Demo Generator Wizard — Configure → Preview two-step wizard.
 *
 * Task 10: Configure screen only. Preview step placeholder to be replaced in Task 11.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  getDemoTemplates,
  getDefaultTemplate,
  getContentStrategies,
  getDefaultStrategy,
  type CommunityType,
} from '@propertypro/shared';
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

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'configure', label: 'Configure' },
  { id: 'preview', label: 'Preview' },
];

function ProgressBar({ currentStep }: { currentStep: WizardStep }) {
  const activeIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-0" aria-label="Wizard progress">
      {WIZARD_STEPS.map((s, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        const isLast = i === WIZARD_STEPS.length - 1;

        return (
          <div key={s.id} className="flex items-center">
            {/* Step dot + label */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors',
                  isActive || isDone
                    ? 'bg-[var(--interactive-primary)]'
                    : 'bg-[var(--border-default)]',
                )}
                aria-current={isActive ? 'step' : undefined}
              />
              <span
                className={cn(
                  'text-xs font-medium leading-none',
                  isActive
                    ? 'text-[var(--interactive-primary)]'
                    : 'text-[var(--text-secondary)]',
                )}
              >
                {s.label}
              </span>
            </div>

            {/* Connector line (not after last) */}
            {!isLast && (
              <div
                className={cn(
                  'mx-2 mb-3 h-px w-16 transition-colors',
                  isDone
                    ? 'bg-[var(--interactive-primary)]'
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
// Page
// ---------------------------------------------------------------------------

export default function DemoNewPage() {
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
          <ProgressBar currentStep={step} />
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

        {/* Preview step — placeholder, to be implemented in Task 11 */}
        {step !== 'configure' && (
          <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-10 text-center text-[var(--text-secondary)]">
            Preview step — coming in Task 11
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
