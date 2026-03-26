'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  getContentStrategies,
  type CommunityType,
  type ContentStrategyId,
} from '@propertypro/shared';
import { BrandingFormFields, type BrandingValues } from './BrandingFormFields';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BasicsStepConfig {
  prospectName: string;
  communityType: CommunityType;
  publicTemplateId: string;
  mobileTemplateId: string;
  contentStrategy: ContentStrategyId;
  branding: BrandingValues;
  crmUrl: string;
  notes: string;
}

interface BasicsStepProps {
  config: BasicsStepConfig;
  onConfigChange: (updater: (prev: BasicsStepConfig) => BasicsStepConfig) => void;
  onCommunityTypeChange: (type: CommunityType) => void;
  triggerValidation?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMUNITY_TYPES: Array<{ type: CommunityType; label: string }> = [
  { type: 'condo_718', label: 'Condo' },
  { type: 'hoa_720', label: 'HOA' },
  { type: 'apartment', label: 'Apartment' },
];

// ---------------------------------------------------------------------------
// Animated collapsible
// ---------------------------------------------------------------------------

function AnimatedCollapsible({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        transitionDuration: 'var(--duration-standard, 250ms)',
      }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BasicsStep({
  config,
  onConfigChange,
  onCommunityTypeChange,
  triggerValidation = 0,
}: BasicsStepProps) {
  const [nameBlurred, setNameBlurred] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [forceValidation, setForceValidation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const nameError = (nameBlurred || forceValidation) && !config.prospectName.trim();
  const contentStrategies = getContentStrategies(config.communityType);

  // Focus input on mount for accessibility
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Force-show validation errors when triggerValidation increments
  useEffect(() => {
    if (triggerValidation && triggerValidation > 0) setForceValidation(true);
  }, [triggerValidation]);

  return (
    <div className="space-y-8">
      {/* Prospect section */}
      <section aria-labelledby="section-prospect">
        <h2
          id="section-prospect"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--interactive-primary)]"
        >
          Prospect
        </h2>

        {/* Community name input */}
        <div className="mb-4">
          <label
            htmlFor="prospect-name"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            Community Name{' '}
            <span className="text-[var(--status-danger)]" aria-hidden="true">*</span>
          </label>
          <input
            ref={inputRef}
            id="prospect-name"
            type="text"
            value={config.prospectName}
            onChange={(e) =>
              onConfigChange((prev) => ({ ...prev, prospectName: e.target.value }))
            }
            onBlur={() => setNameBlurred(true)}
            maxLength={100}
            placeholder="e.g., Bayview Towers"
            aria-invalid={nameError || undefined}
            aria-describedby={nameError ? 'prospect-name-error' : undefined}
            className={cn(
              'h-[40px] w-full rounded-[6px] border bg-[var(--surface-card)]',
              'px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:border-[var(--interactive-primary)]',
              nameError
                ? 'border-[var(--border-error,var(--status-danger))]'
                : 'border-[var(--border-default)]',
            )}
          />
          {nameError && (
            <p id="prospect-name-error" className="mt-1 text-xs text-[var(--status-danger)]">
              Community name is required.
            </p>
          )}
        </div>

        {/* Community type segmented control */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
            Community Type
          </p>
          <div className="flex border border-[var(--border-default)] rounded-[10px] overflow-hidden">
            {COMMUNITY_TYPES.map(({ type, label }, index) => (
              <button
                key={type}
                type="button"
                onClick={() => onCommunityTypeChange(type)}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium transition-colors text-center',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--interactive-primary)]',
                  config.communityType === type
                    ? 'bg-[var(--interactive-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]',
                  index > 0 && 'border-l border-[var(--border-default)]',
                )}
                aria-pressed={config.communityType === type}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Content focus */}
      <section aria-labelledby="section-content-focus">
        <h2
          id="section-content-focus"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--interactive-primary)]"
        >
          Content Focus
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {contentStrategies.map((s) => {
            const isSelected = s.id === config.contentStrategy;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  onConfigChange((prev) => ({ ...prev, contentStrategy: s.id }))
                }
                className={cn(
                  'rounded-[10px] p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)]',
                  isSelected
                    ? 'border-2 border-[var(--interactive-primary)] bg-[var(--interactive-subtle)]'
                    : 'border border-[var(--border-default)] bg-[var(--surface-card)]',
                )}
                aria-pressed={isSelected}
              >
                <div className={cn('text-sm font-semibold', isSelected ? 'text-[var(--interactive-primary)]' : 'text-[var(--text-primary)]')}>
                  {s.label}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">{s.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Branding — collapsible with summary row */}
      <section aria-labelledby="section-branding">
        <div className="border border-[var(--border-default)] rounded-[10px] overflow-hidden">
          <button
            type="button"
            onClick={() => setBrandingOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-inset"
            aria-expanded={brandingOpen}
            aria-controls="branding-content"
          >
            <div className="flex items-center gap-3">
              <h2
                id="section-branding"
                className="text-sm font-semibold text-[var(--text-primary)]"
              >
                Branding
              </h2>
              {/* Color swatches + font summary */}
              {!brandingOpen && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <div className="h-4 w-4 rounded-sm border border-[var(--border-default)]" style={{ backgroundColor: config.branding.primaryColor }} />
                    <div className="h-4 w-4 rounded-sm border border-[var(--border-default)]" style={{ backgroundColor: config.branding.secondaryColor }} />
                    <div className="h-4 w-4 rounded-sm border border-[var(--border-default)]" style={{ backgroundColor: config.branding.accentColor }} />
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {config.branding.fontHeading}
                    {config.branding.fontBody !== config.branding.fontHeading
                      ? ` / ${config.branding.fontBody}`
                      : ''}
                  </span>
                </div>
              )}
            </div>
            {brandingOpen ? (
              <ChevronUp size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
            ) : (
              <ChevronDown size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
            )}
          </button>
          <AnimatedCollapsible open={brandingOpen}>
            <div id="branding-content" className="border-t border-[var(--border-default)] px-4 py-4">
              <BrandingFormFields
                value={config.branding}
                onChange={(branding) =>
                  onConfigChange((prev) => ({ ...prev, branding }))
                }
              />
            </div>
          </AnimatedCollapsible>
        </div>
      </section>

      {/* Optional fields — collapsible */}
      <section aria-labelledby="section-optional">
        <div className="border border-[var(--border-default)] rounded-[10px] overflow-hidden">
          <button
            type="button"
            onClick={() => setOptionalOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-inset"
            aria-expanded={optionalOpen}
            aria-controls="optional-content"
          >
            <h2
              id="section-optional"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              Optional
            </h2>
            {optionalOpen ? (
              <ChevronUp size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
            ) : (
              <ChevronDown size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
            )}
          </button>
          <AnimatedCollapsible open={optionalOpen}>
            <div id="optional-content" className="border-t border-[var(--border-default)] px-4 py-4 space-y-4">
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
                    onConfigChange((prev) => ({ ...prev, crmUrl: e.target.value }))
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
                    onConfigChange((prev) => ({ ...prev, notes: e.target.value }))
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
          </AnimatedCollapsible>
        </div>
      </section>
    </div>
  );
}
