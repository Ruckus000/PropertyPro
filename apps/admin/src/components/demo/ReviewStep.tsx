'use client';

import { useRef, useEffect } from 'react';
import {
  getTemplateById,
  getStrategyById,
  type CommunityType,
} from '@propertypro/shared';
import type { BrandingValues } from './BrandingFormFields';

const COMMUNITY_TYPE_LABELS: Record<CommunityType, string> = {
  condo_718: 'Condo (§718)',
  hoa_720: 'HOA (§720)',
  apartment: 'Apartment',
};

export interface ReviewStepConfig {
  prospectName: string;
  communityType: CommunityType;
  publicTemplateId: string;
  mobileTemplateId: string;
  contentStrategy: string;
  branding: BrandingValues;
}

export interface ReviewStepProps {
  config: ReviewStepConfig;
  onEditStep: (stepId: string) => void;
}

export function ReviewStep({ config, onEditStep }: ReviewStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const publicTemplate = getTemplateById(
    config.publicTemplateId as Parameters<typeof getTemplateById>[0],
  );
  const strategy = getStrategyById(config.contentStrategy);

  return (
    <div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        Here&apos;s what {config.prospectName} will see
      </h2>
      <p className="text-sm text-[var(--text-secondary)]">
        Review everything below. Go back to adjust anything before generating.
      </p>

      {/* Summary card */}
      <div className="bg-[var(--surface-muted)] rounded-[12px] p-4 mt-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Community */}
          <div>
            <div className="text-[10px] text-[var(--text-tertiary,var(--text-secondary))]">
              Community
            </div>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {config.prospectName}
            </div>
          </div>

          {/* Type */}
          <div>
            <div className="text-[10px] text-[var(--text-tertiary,var(--text-secondary))]">
              Type
            </div>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {COMMUNITY_TYPE_LABELS[config.communityType]}
            </div>
          </div>

          {/* Content Focus */}
          <div>
            <div className="text-[10px] text-[var(--text-tertiary,var(--text-secondary))]">
              Content Focus
            </div>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {strategy?.label ?? config.contentStrategy}
            </div>
          </div>

          {/* Branding */}
          <div>
            <div className="text-[10px] text-[var(--text-tertiary,var(--text-secondary))]">
              Branding
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-[14px] w-[14px] rounded-sm border"
                style={{ backgroundColor: config.branding.primaryColor }}
              />
              <span
                className="inline-block h-[14px] w-[14px] rounded-sm border"
                style={{ backgroundColor: config.branding.secondaryColor }}
              />
              <span
                className="inline-block h-[14px] w-[14px] rounded-sm border"
                style={{ backgroundColor: config.branding.accentColor }}
              />
              <span className="text-sm font-medium text-[var(--text-primary)] ml-1">
                {config.branding.fontHeading}
              </span>
            </div>
          </div>

          {/* Public Template */}
          <div>
            <div className="text-[10px] text-[var(--text-tertiary,var(--text-secondary))]">
              Public Template
            </div>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {publicTemplate?.name ?? config.publicTemplateId}
            </div>
          </div>
        </div>

        {/* Quick-edit chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onEditStep('basics')}
            className="text-[10px] text-[var(--text-secondary)] bg-[var(--surface-subtle,#f1f5f9)] px-2.5 py-1 rounded-[6px] cursor-pointer hover:bg-[var(--surface-muted)]"
          >
            Edit Basics
          </button>
          <button
            type="button"
            onClick={() => onEditStep('public-site')}
            className="text-[10px] text-[var(--text-secondary)] bg-[var(--surface-subtle,#f1f5f9)] px-2.5 py-1 rounded-[6px] cursor-pointer hover:bg-[var(--surface-muted)]"
          >
            Change Public Template
          </button>
        </div>
      </div>
    </div>
  );
}
