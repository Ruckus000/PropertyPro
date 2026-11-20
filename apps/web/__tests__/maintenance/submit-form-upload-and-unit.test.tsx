/// <reference types="@testing-library/jest-dom" />
/**
 * PR-5 (resident-side review 2026-11-20):
 *  - The photo PUT to storage was fire-and-forget: a failed upload still sent
 *    the storagePath to create, and the request was filed against a missing
 *    object (or create 500'd with no explanation). The form must stop and say so.
 *  - The form opens on the resident's own unit (`defaultUnitLabel`) and sends
 *    `defaultUnitId` only while the unit field still holds that label.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMaintenanceRequestMock, requestPhotoUploadUrlMock } = vi.hoisted(() => ({
  createMaintenanceRequestMock: vi.fn(),
  requestPhotoUploadUrlMock: vi.fn(),
}));

vi.mock('@/lib/api/maintenance-requests', () => ({
  createMaintenanceRequest: createMaintenanceRequestMock,
  requestPhotoUploadUrl: requestPhotoUploadUrlMock,
}));

import { SubmitForm } from '@/components/maintenance/SubmitForm';

const fetchMock = vi.fn();

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Leaky pipe' } });
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'Drips all night' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
}

describe('<SubmitForm> photo upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    requestPhotoUploadUrlMock.mockResolvedValue({
      data: { uploadUrl: 'https://storage.example.com/upload', storagePath: 'maintenance/1/tmp/p.jpg' },
    });
    createMaintenanceRequestMock.mockResolvedValue({ data: { id: 5 } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function attachPhoto() {
    const file = new File(['x'], 'sink.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Photos (max 5)'), { target: { files: [file] } });
  }

  it('stops and names the photo when the storage PUT fails, without filing the request', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    render(<SubmitForm communityId={1} userId="u-1" />);
    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Apartment\/Unit Number/), { target: { value: '4B' } });
    attachPhoto();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't upload sink.jpg");
    expect(createMaintenanceRequestMock).not.toHaveBeenCalled();
  });

  it('gives the same message when the PUT never reaches storage (network error)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<SubmitForm communityId={1} userId="u-1" />);
    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Apartment\/Unit Number/), { target: { value: '4B' } });
    attachPhoto();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't upload sink.jpg");
    expect(createMaintenanceRequestMock).not.toHaveBeenCalled();
  });

  it('files the request with the storage path when the PUT succeeds', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    render(<SubmitForm communityId={1} userId="u-1" />);
    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Apartment\/Unit Number/), { target: { value: '4B' } });
    attachPhoto();
    submit();

    await waitFor(() => expect(createMaintenanceRequestMock).toHaveBeenCalledTimes(1));
    expect(createMaintenanceRequestMock.mock.calls[0]![0]).toMatchObject({
      storagePaths: ['maintenance/1/tmp/p.jpg'],
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('<SubmitForm> unit defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMaintenanceRequestMock.mockResolvedValue({ data: { id: 5 } });
  });

  it("opens on the resident's own unit label", () => {
    render(<SubmitForm communityId={1} userId="u-1" defaultUnitId={7} defaultUnitLabel="Unit 4B" />);
    expect(screen.getByLabelText(/^Apartment\/Unit Number/)).toHaveValue('Unit 4B');
  });

  it('sends the default unitId while the unit field still holds its label', async () => {
    render(<SubmitForm communityId={1} userId="u-1" defaultUnitId={7} defaultUnitLabel="Unit 4B" />);
    fillRequired();
    submit();

    await waitFor(() => expect(createMaintenanceRequestMock).toHaveBeenCalledTimes(1));
    expect(createMaintenanceRequestMock.mock.calls[0]![0]).toMatchObject({
      unitId: 7,
      unitLabel: 'Unit 4B',
    });
  });

  it('drops the unitId once the resident types a different place', async () => {
    render(<SubmitForm communityId={1} userId="u-1" defaultUnitId={7} defaultUnitLabel="Unit 4B" />);
    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Apartment\/Unit Number/), {
      target: { value: 'Pool deck' },
    });
    submit();

    await waitFor(() => expect(createMaintenanceRequestMock).toHaveBeenCalledTimes(1));
    const payload = createMaintenanceRequestMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['unitLabel']).toBe('Pool deck');
    expect(payload['unitId']).toBeUndefined();
  });

  it('starts empty and sends no unitId without defaults (staff)', async () => {
    render(<SubmitForm communityId={1} userId="u-1" />);
    expect(screen.getByLabelText(/^Apartment\/Unit Number/)).toHaveValue('');
    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Apartment\/Unit Number/), { target: { value: '4B' } });
    submit();

    await waitFor(() => expect(createMaintenanceRequestMock).toHaveBeenCalledTimes(1));
    expect((createMaintenanceRequestMock.mock.calls[0]![0] as Record<string, unknown>)['unitId']).toBeUndefined();
  });
});
