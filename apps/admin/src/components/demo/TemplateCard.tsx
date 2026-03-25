'use client';

import type { DemoTemplateDefinition } from '@propertypro/shared';
import { cn } from '@/lib/utils';
import { TemplateThumbnail } from './TemplateThumbnail';
import { Check } from 'lucide-react';

interface TemplateCardProps {
  template: DemoTemplateDefinition;
  selected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left border rounded-[10px] overflow-hidden cursor-pointer transition-colors',
        selected
          ? 'border-2 border-[var(--interactive-primary)] bg-[var(--interactive-subtle)]'
          : 'border-[var(--border-default)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]',
      )}
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
          {template.tags.join(' · ')}
        </p>
      </div>
    </button>
  );
}
