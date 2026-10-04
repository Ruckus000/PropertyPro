'use client';

/**
 * The first-run chooser (website builder v4, Phase 3): Guide me, or Let me
 * edit freely.
 *
 * Shown only for a site that has never been published, to a manager who has
 * not chosen yet (decided 2026-10-03): managers already running a live site
 * keep the editor they know. The design's eyebrow, "Setup saved as a draft",
 * is left out: nothing says the manager arrived here from the setup wizard.
 *
 * Closing it without choosing (Escape, or the close button) means Free edit
 * for now, with nothing saved, so it asks again next time.
 *
 * Code-split: most sessions never render it.
 */

import { ListTodo, SquareMousePointer, type LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EditorMode } from '../tools';

export interface ModeChooserProps {
  onChoose: (mode: EditorMode) => void;
  onDismiss: () => void;
}

const CHOICES: readonly {
  mode: EditorMode;
  title: string;
  body: string;
  icon: LucideIcon;
  recommended?: true;
}[] = [
  {
    mode: 'guided',
    title: 'Guide me',
    body: 'A short checklist shows what to do next, starting with what Florida law requires. Good for your first time.',
    icon: ListTodo,
    recommended: true,
  },
  {
    mode: 'free',
    title: 'Let me edit freely',
    body: "Every tool is one click away and there's no checklist. Good if you've built a website before.",
    icon: SquareMousePointer,
  },
];

export function ModeChooser({ onChoose, onDismiss }: ModeChooserProps) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onDismiss())}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>How would you like to work on your website?</DialogTitle>
          <DialogDescription>
            You can switch any time under Help.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map(({ mode, title, body, icon: Icon, recommended }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChoose(mode)}
              className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] border border-edge p-4 text-left hover:border-edge-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <Icon className="h-5 w-5 text-content-brand" aria-hidden="true" />
                {recommended ? (
                  <span className="rounded-full bg-interactive-subtle px-2 py-0.5 text-xs font-semibold text-content-brand">
                    Recommended
                  </span>
                ) : null}
              </span>
              <span className="text-base font-semibold text-content">{title}</span>
              <span className="text-sm text-content-secondary">{body}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
