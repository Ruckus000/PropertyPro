'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import { describeRequiredSectionHide } from '@/lib/site-editor/describe-section-state';
import { useSiteEditor } from './editor-context';
import { useRequiredSections } from './required-sections-context';
import { sectionLabel } from './section-label';

// Code-split and mounted only once opened — see the note in FloatControls.
const ConfirmDialog = dynamic(
  () => import('./ConfirmDialog').then((m) => m.ConfirmDialog),
  { loading: () => null },
);

export function isHiddenBlock(block: SiteBlockSummary): boolean {
  return (
    block.content !== null &&
    typeof block.content === 'object' &&
    (block.content as { hidden?: unknown }).hidden === true
  );
}

/**
 * Hide / Show for one section, shared by the canvas toolbar and the Sections
 * panel so the two cannot disagree about when to ask first.
 *
 * Hiding the site's last visible copy of a Florida-required section asks for
 * confirmation (v4 Phase 2); everything else toggles at once, as before.
 * Showing never asks. The returned `confirm` element must be rendered by the
 * caller — inside whatever wrapper stops its clicks bubbling to the canvas.
 *
 * `restoreFocusTo` is the button that opened it: the dialog is mounted on
 * demand, so Radix has no registered trigger to return focus to.
 */
export function useHideToggle(
  block: SiteBlockSummary,
  restoreFocusTo: React.RefObject<HTMLElement | null>,
) {
  const { toggleHidden } = useSiteEditor();
  const { hideNeedsConfirm, lawFor } = useRequiredSections();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isHidden = isHiddenBlock(block);
  const label = sectionLabel(block.blockType);

  const requestToggle = () => {
    if (!isHidden && hideNeedsConfirm(block.blockType)) {
      setConfirmOpen(true);
      return;
    }
    toggleHidden(block.id, !isHidden);
  };

  const confirm = confirmOpen ? (
    <ConfirmDialog
      open
      onOpenChange={setConfirmOpen}
      restoreFocusTo={restoreFocusTo}
      title={`Hide the ${label} section?`}
      description={`${lawFor(block.blockType)} ${describeRequiredSectionHide().text}`}
      confirmLabel="Hide anyway"
      cancelLabel="Keep it visible"
      destructive
      onConfirm={() => {
        setConfirmOpen(false);
        toggleHidden(block.id, true);
      }}
    />
  ) : null;

  return { isHidden, requestToggle, confirm };
}
