/**
 * axe audit of the setup guide (docs/design-system/patterns/empty-states.md §6.3).
 *
 * Each clean case first asserts what it audits rendered; each probe then breaks
 * one element of the component's own markup in that region (rail, context,
 * bar) and shows axe goes red there, so the clean pass is not vacuous.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { DocumentsScene } from '@propertypro/ui';
import {
  ContextLinks,
  ContextRows,
  ContextSection,
  ContinueSetupBar,
  SetupGuide,
  SetupSlot,
  SetupSlotList,
} from '@/components/shared/setup-guide';
import { Button } from '@/components/ui/button';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ruleIds = async (container: HTMLElement) => (await axe(container)).violations.map((v) => v.id);

function Guide({ helpLabel = 'Upload a document' }: { helpLabel?: string }) {
  return (
    <SetupGuide
      eyebrow="Owner portal records"
      title="Post the records owners can see"
      description="Add a file to any slot and it's filed and counted."
      progress={{ done: 0, total: 13, label: 'required posted' }}
      facts={[{ label: 'Owners open them in their portal' }]}
      illustration={<DocumentsScene size="hero" />}
      steps={[
        { id: 'folders', label: 'Folders set up', done: true, system: true, heading: 'Your folders are ready' },
        {
          id: 'governing',
          label: 'Governing',
          done: false,
          heading: 'Upload your governing documents',
          countLabel: '0 of 2 posted',
          action: <Button>Upload the Declaration</Button>,
          content: (
            <SetupSlotList label="Governing records">
              <SetupSlot title="Declaration & Amendments" tag="Required" next onAdd={() => {}} />
              <SetupSlot title="Bids received" tag="If it applies" onAdd={() => {}} onNotApplicable={() => {}} />
            </SetupSlotList>
          ),
        },
        {
          id: 'money',
          label: 'Money',
          done: false,
          heading: 'Post the money records',
          items: [{ label: 'Annual Budget' }, { label: 'Monthly statements', conditional: true }],
          countLabel: '0 of 1',
        },
        { id: 'residents', label: 'Residents', done: false, heading: 'Add residents', disabledReason: 'Residents unlock after units' },
      ]}
      context={
        <>
          <ContextSection title="Who sees what">
            <ContextRows rows={[{ label: 'Owners', detail: 'Every record you post' }]} />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[{ href: '/help/manager/documents/upload-document', label: helpLabel }]} />
          </ContextSection>
        </>
      }
    />
  );
}

describe('SetupGuide — axe', () => {
  it('the full guide (hero, rail, slots, later steps, context) has no violations', async () => {
    const { container } = render(<Guide />);
    expect(screen.getByRole('heading', { level: 2, name: 'Post the records owners can see' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Setup steps' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add file: Declaration & Amendments' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Other steps' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Help' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: rail — an invalid aria-disabled on the blocked step is caught', async () => {
    // (An unknown aria-current token is valid ARIA: it falls back to "true".)
    const { container } = render(<Guide />);
    within(screen.getByRole('navigation', { name: 'Setup steps' }))
      .getByRole('button', { name: /Residents unlock after units/ })
      .setAttribute('aria-disabled', 'maybe');
    expect(await ruleIds(container)).toContain('aria-valid-attr-value');
  });

  it('probe: context column — an unnamed help link is caught', async () => {
    const { container } = render(<Guide helpLabel="" />);
    expect(await ruleIds(container)).toContain('link-name');
  });
});

describe('ContinueSetupBar — axe', () => {
  const bar = <ContinueSetupBar done={5} total={13} countLabel="required posted" next="Annual Budget" onContinue={() => {}} onDismiss={() => {}} />;

  it('has no violations', async () => {
    const { container } = render(bar);
    expect(screen.getByRole('button', { name: 'Hide setup for now' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: the dismiss button without its name is caught', async () => {
    const { container } = render(bar);
    screen.getByRole('button', { name: 'Hide setup for now' }).removeAttribute('aria-label');
    expect(await ruleIds(container)).toContain('button-name');
  });
});
