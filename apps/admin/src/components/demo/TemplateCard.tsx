'use client';

import type { DemoTemplateDefinition } from '@propertypro/shared';
import { Card } from '@propertypro/ui';
import { TemplateThumbnail } from './TemplateThumbnail';
import { Check } from 'lucide-react';

interface TemplateCardProps {
  template: DemoTemplateDefinition;
  selected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  return (
    <Card
      size="sm"
      interactive
      selected={selected}
      noPadding
      onClick={onSelect}
      className="overflow-hidden"
    >
      {/* Thumbnail area */}
      <div className="h-[88px] relative overflow-hidden">
        <TemplateThumbnail descriptor={template.thumbnail} />
        {selected && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--interactive-primary)] flex items-center justify-center">
            <Check size={12} className="text-white" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="p-3">
        <p className="text-sm font-semibold">{template.name}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          {template.bestFor}
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          {template.tags.join(' · ')}
        </p>
      </div>
    </Card>
  );
}
