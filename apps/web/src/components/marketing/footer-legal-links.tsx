'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { LegalDocKey, LegalDocs } from '@/lib/legal-types';

const DOC_TITLES: Record<LegalDocKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  accessibility: 'Accessibility',
};

const DOC_HREFS: Record<LegalDocKey, string> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
  accessibility: '/legal/accessibility',
};

export interface FooterLegalLinksProps {
  legalDocs?: LegalDocs;
}

export function FooterLegalLinks({ legalDocs }: FooterLegalLinksProps) {
  const [openDoc, setOpenDoc] = useState<LegalDocKey | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, doc: LegalDocKey) {
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
    <div ref={setContainer}>
      <a href={DOC_HREFS.terms} onClick={(e) => handleClick(e, 'terms')}>
        Terms of Service
      </a>
      <a href={DOC_HREFS.privacy} onClick={(e) => handleClick(e, 'privacy')}>
        Privacy Policy
      </a>
      <a href={DOC_HREFS.accessibility} onClick={(e) => handleClick(e, 'accessibility')}>
        Accessibility
      </a>

      <Dialog.Root open={openDoc !== null} onOpenChange={(open) => !open && setOpenDoc(null)}>
        <Dialog.Portal container={container ?? undefined}>
          <Dialog.Overlay className="mk-modal-overlay" />
          <Dialog.Content className="mk-modal-content">
            <div className="mk-modal-head">
              <Dialog.Title className="mk-modal-title">
                {openDoc ? DOC_TITLES[openDoc] : ''}
              </Dialog.Title>
              <Dialog.Close className="mk-modal-close" aria-label="Close">
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              {openDoc ? `${DOC_TITLES[openDoc]} — scroll to read the full document.` : ''}
            </Dialog.Description>
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
