'use client';

/**
 * Full-size zoom for help article media. A NESTED Radix Dialog: the parent
 * help modal must suppress its own outside-pointer/escape dismissal while
 * this is open (clicks on this overlay land outside the parent's content) —
 * see HelpDocsModal's onPointerDownOutside/onEscapeKeyDown guards.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export interface LightboxMedia {
  src: string;
  alt: string;
  kind: 'image' | 'clip';
}

interface HelpMediaLightboxProps {
  media: LightboxMedia | null;
  onClose: () => void;
}

export function HelpMediaLightbox({ media, onClose }: HelpMediaLightboxProps) {
  return (
    <Dialog open={media !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="w-[95vw] max-w-[1200px] p-2">
        <DialogTitle className="sr-only">{media?.alt ?? 'Media preview'}</DialogTitle>
        <DialogDescription className="sr-only">
          Enlarged view. Press Escape to close.
        </DialogDescription>
        {media?.kind === 'clip' ? (
          <video
            src={media.src}
            controls
            muted
            loop
            playsInline
            className="block h-auto max-h-[85vh] w-full rounded-[var(--radius-md)]"
            aria-label={media.alt}
          />
        ) : media ? (
          <img
            src={media.src}
            alt={media.alt}
            className="block h-auto max-h-[85vh] w-full rounded-[var(--radius-md)] object-contain"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
