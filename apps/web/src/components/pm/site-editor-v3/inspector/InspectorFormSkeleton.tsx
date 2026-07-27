'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Height-reserving placeholder for a code-split inspector form.
 *
 * Every form in `form-registry` is `next/dynamic`, so there is a frame between
 * selecting a section and its fields arriving. Reserving roughly a form's worth
 * of height stops the panel collapsing and re-expanding under the pointer —
 * the same reasoning as the `loading` skeletons in the block view registry.
 */
export function InspectorFormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
