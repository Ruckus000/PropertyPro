/**
 * Route tests for the no-login snowbird digest unsubscribe.
 *  - POST is the RFC 8058 one-click target: `sendEmail` names this URL in
 *    List-Unsubscribe and sets List-Unsubscribe-Post, so mail clients POST here.
 *    A GET-only route answered that POST with 405 and the opt-out never landed.
 *  - GET backs the human-clicked link. It is READ-ONLY (mail scanners prefetch
 *    links) and renders a button that POSTs back here with `confirm=1`.
 *  - a missing/invalid token neither writes nor 200s, on either verb.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyMock, applyMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  applyMock: vi.fn(),
}));

vi.mock('../../src/lib/services/snowbird-digest-token', () => ({
  verifySnowbirdUnsubscribeToken: verifyMock,
}));
vi.mock('../../src/lib/services/snowbird-digest-unsubscribe-service', () => ({
  applySnowbirdUnsubscribe: applyMock,
}));

import * as route from '../../src/app/api/v1/snowbird-digest/unsubscribe/route';

type Handler = (req: NextRequest) => Promise<Response>;
const handlers = route as unknown as Record<string, Handler | undefined>;

const req = (method: 'GET' | 'POST', token?: string) =>
  new NextRequest(
    `http://localhost:3000/api/v1/snowbird-digest/unsubscribe${token ? `?token=${token}` : ''}`,
    { method },
  );

async function post(token?: string): Promise<Response> {
  const handler = handlers.POST;
  if (!handler) throw new Error('route exports no POST handler (RFC 8058 one-click target)');
  return handler(req('POST', token));
}

async function postConfirmForm(token: string): Promise<Response> {
  const handler = handlers.POST;
  if (!handler) throw new Error('route exports no POST handler');
  return handler(
    new NextRequest(`http://localhost:3000/api/v1/snowbird-digest/unsubscribe?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'confirm=1',
    }),
  );
}

describe('snowbird digest unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMock.mockResolvedValue(undefined);
  });

  it('POST unsubscribes on a valid token (one-click)', async () => {
    verifyMock.mockReturnValue({ communityId: 1, userId: 'u1' });
    const res = await post('good');
    expect(res.status).toBe(200);
    expect(verifyMock).toHaveBeenCalledWith('good');
    expect(applyMock).toHaveBeenCalledWith({ communityId: 1, userId: 'u1' });
  });

  it('POST is idempotent: a repeat one-click POST still answers 200', async () => {
    verifyMock.mockReturnValue({ communityId: 1, userId: 'u1' });
    expect((await post('good')).status).toBe(200);
    expect((await post('good')).status).toBe(200);
    expect(applyMock).toHaveBeenCalledTimes(2);
  });

  it('POST does not write on an invalid token', async () => {
    verifyMock.mockReturnValue(null);
    const res = await post('bad');
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('POST does not write when the token is missing', async () => {
    const res = await post();
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('GET does not unsubscribe', async () => {
    verifyMock.mockReturnValue({ communityId: 1, userId: 'u1' });
    const res = await route.GET(req('GET', 'good'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(applyMock).not.toHaveBeenCalled();
    const html = await res.text();
    expect(html).toContain(
      '<form method="post" action="/api/v1/snowbird-digest/unsubscribe?token=good">',
    );
    expect(html).toContain('<input type="hidden" name="confirm" value="1">');
  });

  it('GET escapes the token in the form action', async () => {
    verifyMock.mockReturnValue({ communityId: 1, userId: 'u1' });
    const res = await route.GET(
      new NextRequest(
        'http://localhost:3000/api/v1/snowbird-digest/unsubscribe?token=a%22%3E%3Cb',
        { method: 'GET' },
      ),
    );
    const html = await res.text();
    expect(html).not.toContain('token=a"');
    expect(html).toContain('token=a%22%3E%3Cb"');
  });

  it('POST from the confirm form unsubscribes', async () => {
    verifyMock.mockReturnValue({ communityId: 1, userId: 'u1' });
    const res = await postConfirmForm('good');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(applyMock).toHaveBeenCalledWith({ communityId: 1, userId: 'u1' });
    expect(await res.text()).toContain("You're unsubscribed");
  });

  it('GET does not write on an invalid token', async () => {
    verifyMock.mockReturnValue(null);
    const res = await route.GET(req('GET', 'bad'));
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });
});
