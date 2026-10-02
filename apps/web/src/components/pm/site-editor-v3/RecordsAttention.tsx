'use client';

/**
 * Reports the Documents tool's rail count (website builder v4, Phase 6).
 *
 * A component that renders nothing, so that `EditorRoot` can load it with
 * `dynamic()`: the checklist hook, `summarizeRecords` and the compliance date
 * helpers then stay out of the editor's first-load JavaScript, like every
 * panel's code. Measured on #1279: imported statically they added 7.2 KiB to
 * the web aggregate, leaving 0.4 KiB of its 1490 KiB budget.
 *
 * Same query key as the Documents panel and the Compliance page, so opening the
 * panel costs no second request.
 */

import { useEffect } from 'react';
import { useComplianceChecklist } from '@/hooks/use-compliance-checklist';
import { recordsNeedingAttention, summarizeRecords } from '@/lib/site-editor/records-status';

export interface RecordsAttentionProps {
  communityId: number;
  onCount: (count: number) => void;
}

export function RecordsAttention({ communityId, onCount }: RecordsAttentionProps) {
  const { data } = useComplianceChecklist(communityId);
  const count = data ? recordsNeedingAttention(summarizeRecords(data)) : 0;
  useEffect(() => onCount(count), [count, onCount]);
  return null;
}
