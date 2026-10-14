/**
 * The violations / maintenance client helpers must surface the server's error
 * message. `withErrorHandler` sends `{ error: { message } }`; the private
 * `apiFetch` copies these modules used to carry read a top-level `message`,
 * fell back to `res.statusText` — `''` over HTTP/2 — and every caller renders
 * `{error && …}`, so a rejected submission showed nothing at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViolation, updateViolation } from '@/lib/api/violations';
import { addComment, createMaintenanceRequest } from '@/lib/api/maintenance-requests';
import { updateRequestStatus } from '@/lib/api/admin-maintenance';

function respond(status: number, body: unknown) {
  // statusText '' is what production serves over HTTP/2.
  const response = new Response(JSON.stringify(body), { status, statusText: '' });
  return vi.fn(async (_input: RequestInfo, _init?: RequestInit) => response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SERVER_ERROR = {
  error: { code: 'VALIDATION_ERROR', message: 'Unit 4B is not in this community' },
};

describe('client fetch helpers surface the server error message', () => {
  it.each([
    ['createViolation', () => createViolation({} as never)],
    ['updateViolation', () => updateViolation(1, {} as never)],
    ['createMaintenanceRequest', () => createMaintenanceRequest({} as never)],
    ['addComment', () => addComment({ communityId: 1, requestId: 1, text: 'x' })],
    ['updateRequestStatus', () => updateRequestStatus(1, 1, { status: 'open' })],
  ])('%s rejects with error.message', async (_name, call) => {
    vi.stubGlobal('fetch', respond(422, SERVER_ERROR));
    await expect(call()).rejects.toThrow('Unit 4B is not in this community');
  });

  it('keeps the { data } shape callers read on success, and sends JSON', async () => {
    const fetchMock = respond(200, { data: { id: 7 } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createViolation({} as never)).resolves.toMatchObject({ data: { id: 7 } });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});
