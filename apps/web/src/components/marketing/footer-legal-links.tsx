'use client';

import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

type DocKey = 'terms' | 'privacy';

const DOC_TITLES: Record<DocKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const DOC_HREFS: Record<DocKey, string> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
};

export interface FooterLegalLinksProps {
  legalDocs?: { terms: string; privacy: string };
}

export function FooterLegalLinks({ legalDocs }: FooterLegalLinksProps) {
  const [openDoc, setOpenDoc] = useState<DocKey | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, doc: DocKey) {
    // No content available (e.g. no-JS fallback / no props) → allow navigation.
    if (!legalDocs) return;
    // Honor modified clicks (open in new tab/window) and non-primary buttons.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    setOpenDoc(doc);
  }

  const bodyHtml = openDoc && legalDocs ? legalDocs[openDoc] : '';

  return (
    <div ref={containerRef}>
      <a href={DOC_HREFS.terms} onClick={(e) => handleClick(e, 'terms')}>
        Terms of Service
      </a>
      <a href={DOC_HREFS.privacy} onClick={(e) => handleClick(e, 'privacy')}>
        Privacy Policy
      </a>

      <Dialog.Root open={openDoc !== null} onOpenChange={(open) => !open && setOpenDoc(null)}>
        <Dialog.Portal container={containerRef.current ?? undefined}>
          <Dialog.Overlay className="mk-modal-overlay" />
          <Dialog.Content className="mk-modal-content" aria-describedby={undefined}>
            <div className="mk-modal-head">
              <Dialog.Title className="mk-modal-title">
                {openDoc ? DOC_TITLES[openDoc] : ''}
              </Dialog.Title>
              <Dialog.Close className="mk-modal-close" aria-label="Close">
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div
              className="mk-modal-body mk-prose"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
