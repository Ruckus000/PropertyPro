/**
 * A sent document is linked to ITSELF (`/documents/<id>`), not to the library:
 * one document makes the action open it; several link each title to its own
 * document and leave the action on the library.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@react-email/components';
import { DocumentSharedEmail } from '../src/index';

const branding = { communityName: 'Sunset Condos' };
const LIBRARY = 'https://app.example.com/documents?communityId=1';
const doc = (id: number, title: string) => ({
  title,
  url: `https://app.example.com/documents/${id}?communityId=1`,
});

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
}

describe('DocumentSharedEmail links', () => {
  it('points the action at the one document sent', async () => {
    const html = await render(
      <DocumentSharedEmail
        branding={branding}
        recipientName="Marisol"
        senderName="Carmen"
        documents={[doc(12, 'Rules')]}
        portalUrl={LIBRARY}
      />,
    );

    expect(hrefs(html)).toContain('https://app.example.com/documents/12?communityId=1');
    expect(hrefs(html)).not.toContain(LIBRARY);
  });

  it('links each title to its own document and the action to the library', async () => {
    const html = await render(
      <DocumentSharedEmail
        branding={branding}
        recipientName="Marisol"
        senderName="Carmen"
        documents={[doc(12, 'Rules'), doc(13, 'Budget')]}
        portalUrl={LIBRARY}
      />,
    );

    const links = hrefs(html);
    expect(links).toContain('https://app.example.com/documents/12?communityId=1');
    expect(links).toContain('https://app.example.com/documents/13?communityId=1');
    expect(links).toContain(LIBRARY);
  });
});
