/**
 * Putting a document on the public site asks for the redaction attestation for
 * EVERY category, as `enforcePublishRedactionAttestation` does on the server.
 * Taking one off asks nothing: it reduces disclosure.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PublishDocumentDialog } from '@/components/documents/publish-document-dialog';

function renderDialog(overrides: Partial<Parameters<typeof PublishDocumentDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  render(
    <PublishDocumentDialog
      open
      publishing
      documentTitle="Declaration of Condominium"
      // A governing-document category, which an upload does not ask about.
      categoryName="Declaration"
      requirementTitle={null}
      isPending={false}
      errorMessage={null}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm };
}

describe('PublishDocumentDialog', () => {
  it('asks for the attestation even in a category an upload does not ask about', () => {
    const { onConfirm } = renderDialog();

    const confirm = screen.getByRole('button', { name: 'Put on public site' });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('asks nothing to take a document off the public site', () => {
    const { onConfirm } = renderDialog({ publishing: false });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from public site' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
