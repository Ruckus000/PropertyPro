'use client';

import { useRef, useEffect } from 'react';
import { getDemoTemplates, type CommunityType, type DemoTemplateId } from '@propertypro/shared';
import { TemplateCard } from './TemplateCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMUNITY_TYPE_LABELS: Record<CommunityType, string> = {
  condo_718: 'Condo (§718)',
  hoa_720: 'HOA (§720)',
  apartment: 'Apartment',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PublicSiteStepProps {
  prospectName: string;
  communityType: CommunityType;
  selectedTemplateId: string;
  onSelect: (templateId: DemoTemplateId) => void;
}

export function PublicSiteStep({
  prospectName,
  communityType,
  selectedTemplateId,
  onSelect,
}: PublicSiteStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const templates = getDemoTemplates(communityType, 'public');

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-[var(--text-primary)] outline-none"
        >
          Public Site Template
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          For <strong>{prospectName}</strong> ({COMMUNITY_TYPE_LABELS[communityType]})
        </p>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            selected={t.id === selectedTemplateId}
            onSelect={() => onSelect(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
