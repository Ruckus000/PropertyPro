'use client';

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EditorTopBarProps {
  communityName: string;
  /** Rendered on the right, before the actions — the save status line (Phase 3). */
  status?: React.ReactNode;
  onPreview?: () => void;
  onPublish?: () => void;
  /**
   * Whether Publish opens the review sheet. Required and undefaulted on
   * purpose: this prop shipped optional with a `= 0` default (as `changeCount`)
   * and `EditorRoot` never passed it, so the button was disabled for every PM
   * in production while the shell's own tests — which pass it explicitly —
   * stayed green. A required prop makes forgetting it a compile error.
   *
   * True when there is something to publish, and also when the change model
   * failed to load: the sheet is the only surface that can explain that failure
   * and offer a retry, so a load error must not lock the PM out of it.
   */
  canOpenPublish: boolean;
}

/**
 * The editor's own top bar.
 *
 * This route has no app shell, so this bar carries the page identity the
 * breadcrumb trail would otherwise provide. It is the only `<h1>` on the route.
 *
 * Publish is disabled with an explanatory title rather than hidden when there
 * is nothing to publish — a button that vanishes is harder to find again than
 * one that explains itself.
 */
export function EditorTopBar({
  communityName,
  status,
  onPreview,
  onPublish,
  canOpenPublish,
}: EditorTopBarProps) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-edge bg-surface-card px-3.5">
      <span className="flex min-w-0 flex-col leading-tight">
        <h1 className="font-display text-[0.9375rem] font-semibold text-content">Website</h1>
        <span className="truncate text-xs text-content-secondary">{communityName}</span>
      </span>

      <div className="ml-auto flex min-w-0 items-center gap-2.5">
        {status}
        <Button variant="outline" size="sm" onClick={onPreview}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview
        </Button>
        <Button
          onClick={onPublish}
          disabled={!canOpenPublish}
          title={canOpenPublish ? undefined : 'Nothing to publish yet'}
        >
          Publish…
        </Button>
      </div>
    </div>
  );
}
