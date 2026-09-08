'use client';

import type { DemoTemplateDefinition } from '@propertypro/shared';
import { Card, useKeyboardClick } from '@propertypro/ui';
import { cn } from '@/lib/utils';
import { TemplateThumbnail } from './TemplateThumbnail';
import { Check } from 'lucide-react';

interface TemplateCardProps {
  template: DemoTemplateDefinition;
  selected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  // shadcn's Card has no `interactive`/`selected` prop — reproduced here via
  // className plus the same `useKeyboardClick` helper the deprecated Card used
  // internally, so Enter/Space still activate selection (`role="button"`,
  // `tabIndex=0`) the way the old compound component did.
  const keyboardClick = useKeyboardClick<HTMLDivElement>(onSelect);

  return (
    <Card
      {...keyboardClick}
      className={cn(
        'overflow-hidden cursor-pointer transition-shadow hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        selected && 'border-interactive bg-interactive-subtle'
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
          {template.bestFor}
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          {template.tags.join(' · ')}
        </p>
      </div>
    </Card>
  );
}
