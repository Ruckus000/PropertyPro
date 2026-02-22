/**
 * Unit tests for ContractForm component (P3-52 Batch E audit fixup).
 *
 * Tests cover:
 * - documentId and complianceChecklistItemId fields render
 * - Create payload includes both IDs when filled
 * - Edit mode preserves and submits existing documentId and checklistItemId
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContractForm } from '../../src/components/contracts/ContractForm';

const fetchMock = vi.fn();
global.fetch = fetchMock;

function makeOkResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({ data: {} }),
  };
}

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Test Contract',
    vendorName: 'ACME Corp',
    description: null,
    contractValue: null,
    startDate: '2026-01-01',
    endDate: null,
    biddingClosesAt: null,
    conflictOfInterest: false,
    documentId: null,
    complianceChecklistItemId: null,
    ...overrides,
  };
}

describe('ContractForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Field rendering
  // -------------------------------------------------------------------------

  it('renders the Linked Document ID field', () => {
    render(
      <ContractForm
        communityId={42}
        contract={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Linked Document ID')).toBeDefined();
  });

  it('renders the Compliance Checklist Item ID field', () => {
    render(
      <ContractForm
        communityId={42}
        contract={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Compliance Checklist Item ID')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Create payload
  // -------------------------------------------------------------------------

  it('includes documentId and complianceChecklistItemId in create payload', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());
    const onSaved = vi.fn();

    render(
      <ContractForm
        communityId={42}
        contract={null}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'New Contract' } });
    fireEvent.change(screen.getByLabelText('Vendor Name *'), { target: { value: 'Vendor' } });
    fireEvent.change(screen.getByLabelText('Start Date *'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Linked Document ID'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Compliance Checklist Item ID'), {
      target: { value: '3' },
    });

    fireEvent.submit(screen.getByText('Create').closest('form')!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/v1/contracts');
      expect((options as { method: string }).method).toBe('POST');
      const body = JSON.parse((options as { body: string }).body) as Record<string, unknown>;
      expect(body['documentId']).toBe(7);
      expect(body['complianceChecklistItemId']).toBe(3);
    });
  });

  it('sends null documentId and complianceChecklistItemId when fields are empty', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    render(
      <ContractForm
        communityId={42}
        contract={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Contract X' } });
    fireEvent.change(screen.getByLabelText('Vendor Name *'), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText('Start Date *'), { target: { value: '2026-03-01' } });

    fireEvent.submit(screen.getByText('Create').closest('form')!);

    await waitFor(() => {
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse((options as { body: string }).body) as Record<string, unknown>;
      expect(body['documentId']).toBeNull();
      expect(body['complianceChecklistItemId']).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  it('pre-populates documentId and complianceChecklistItemId in edit mode', () => {
    render(
      <ContractForm
        communityId={42}
        contract={makeContract({ documentId: 5, complianceChecklistItemId: 9 })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const docInput = screen.getByLabelText('Linked Document ID') as HTMLInputElement;
    const checklistInput = screen.getByLabelText('Compliance Checklist Item ID') as HTMLInputElement;

    expect(docInput.value).toBe('5');
    expect(checklistInput.value).toBe('9');
  });

  it('preserves and submits documentId and complianceChecklistItemId in edit mode', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    render(
      <ContractForm
        communityId={42}
        contract={makeContract({ documentId: 5, complianceChecklistItemId: 9 })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.submit(screen.getByText('Update').closest('form')!);

    await waitFor(() => {
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((options as { method: string }).method).toBe('PATCH');
      const body = JSON.parse((options as { body: string }).body) as Record<string, unknown>;
      expect(body['documentId']).toBe(5);
      expect(body['complianceChecklistItemId']).toBe(9);
    });
  });

  it('allows clearing documentId and complianceChecklistItemId in edit mode', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    render(
      <ContractForm
        communityId={42}
        contract={makeContract({ documentId: 5, complianceChecklistItemId: 9 })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Linked Document ID'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Compliance Checklist Item ID'), {
      target: { value: '' },
    });
    fireEvent.submit(screen.getByText('Update').closest('form')!);

    await waitFor(() => {
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse((options as { body: string }).body) as Record<string, unknown>;
      expect(body['documentId']).toBeNull();
      expect(body['complianceChecklistItemId']).toBeNull();
    });
  });
});
