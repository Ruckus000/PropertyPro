'use client';

import type { ThumbnailDescriptor, ThumbnailLayout } from '@propertypro/shared';
import { cn } from '@/lib/utils';

interface TemplateThumbnailProps {
  descriptor: ThumbnailDescriptor;
  className?: string;
}

function WireframeLayout({ layout }: { layout: ThumbnailLayout }) {
  switch (layout) {
    case 'stats-hero':
      return (
        <div className="flex flex-col gap-1 p-1.5 w-full h-full">
          {/* Nav strip */}
          <div className="w-full h-1 bg-white/30 rounded-sm" />
          {/* Hero block */}
          <div className="w-3/5 h-4 bg-white/15 rounded-sm mx-auto mt-1" />
          {/* Stat boxes */}
          <div className="flex gap-1 mt-1 justify-center">
            <div className="w-1/4 h-3 bg-white/10 rounded-sm" />
            <div className="w-1/4 h-3 bg-white/10 rounded-sm" />
            <div className="w-1/4 h-3 bg-white/10 rounded-sm" />
          </div>
        </div>
      );

    case 'hero-centered':
      return (
        <div className="flex flex-col gap-1 p-1.5 w-full h-full">
          {/* Nav strip */}
          <div className="w-full h-1 bg-white/30 rounded-sm" />
          {/* Tall hero area */}
          <div className="w-4/5 h-6 bg-white/15 rounded-sm mx-auto mt-1" />
          {/* CTA rectangle */}
          <div className="w-1/3 h-2 bg-white/20 rounded-sm mx-auto mt-1" />
        </div>
      );

    case 'feed-list':
      return (
        <div className="flex flex-col gap-1 p-1.5 w-full h-full">
          {/* Header strip */}
          <div className="w-full h-1.5 bg-white/30 rounded-sm" />
          {/* Stacked rounded rects */}
          <div className="w-4/5 h-3 bg-white/10 rounded-sm mx-auto mt-1" />
          <div className="w-4/5 h-3 bg-white/10 rounded-sm mx-auto" />
          <div className="w-4/5 h-3 bg-white/10 rounded-sm mx-auto" />
        </div>
      );

    case 'card-grid':
      return (
        <div className="flex flex-col gap-1 p-1.5 w-full h-full">
          {/* Header strip */}
          <div className="w-full h-1.5 bg-white/30 rounded-sm" />
          {/* 2x2 grid */}
          <div className="grid grid-cols-2 gap-1 mt-1 flex-1">
            <div className="bg-white/10 rounded" />
            <div className="bg-white/10 rounded" />
            <div className="bg-white/10 rounded" />
            <div className="bg-white/10 rounded" />
          </div>
        </div>
      );

    case 'sidebar-content':
      return (
        <div className="flex w-full h-full">
          {/* Left narrow strip */}
          <div className="w-1/5 h-full bg-white/15" />
          {/* Right content area */}
          <div className="flex flex-col gap-1 p-1.5 flex-1">
            <div className="w-full h-1.5 bg-white/30 rounded-sm" />
            <div className="w-4/5 h-3 bg-white/10 rounded-sm mt-1" />
            <div className="w-3/5 h-3 bg-white/10 rounded-sm" />
          </div>
        </div>
      );

    case 'split-feature':
      return (
        <div className="flex flex-col gap-1 p-1.5 w-full h-full">
          {/* Row 1 */}
          <div className="flex gap-1 flex-1">
            <div className="flex-1 bg-white/20 rounded-sm" />
            <div className="flex-1 bg-white/10 rounded-sm" />
          </div>
          {/* Row 2 */}
          <div className="flex gap-1 flex-1">
            <div className="flex-1 bg-white/10 rounded-sm" />
            <div className="flex-1 bg-white/20 rounded-sm" />
          </div>
          {/* Row 3 */}
          <div className="flex gap-1 flex-1">
            <div className="flex-1 bg-white/20 rounded-sm" />
            <div className="flex-1 bg-white/10 rounded-sm" />
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function TemplateThumbnail({ descriptor, className }: TemplateThumbnailProps) {
  return (
    <div
      className={cn('w-full h-full', className)}
      style={{
        background: `linear-gradient(135deg, ${descriptor.gradient[0]}, ${descriptor.gradient[1]})`,
      }}
    >
      <WireframeLayout layout={descriptor.layout} />
    </div>
  );
}
