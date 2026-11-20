/**
 * The password-reset Server Actions refuse under a support session.
 *
 * A Server Action POSTs to the PAGE path, so middleware's read-only
 * support-session block (gated on API paths) never sees it. The mobile Security
 * page calls `requestPasswordReset` from inside the authenticated app, where an
 * impersonating operator can reach it — so the refusal has to live in the
 * action itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_SESSION_ID_HEADER } from '@/lib/request/forwarded-headers';

const headersMock = vi.hoisted(() => vi.fn());
const requestCoreMock = vi.hoisted(() => vi.fn());
const updateCoreMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth/password-reset', () => ({
  requestPasswordReset: requestCoreMock,
  updatePassword: updateCoreMock,
}));

import { requestPasswordReset, updatePasswordAction } from '@/lib/auth/actions';

const SUPPORT_HEADERS = new Headers({
  [SUPPORT_SESSION_ID_HEADER]: '99',
  'x-support-community-id': '42',
  'x-community-id': '42',
});

describe('password-reset server actions under a support session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestCoreMock.mockResolvedValue({ success: true, message: 'sent' });
    updateCoreMock.mockResolvedValue({ success: true, message: 'updated' });
  });

  it('requestPasswordReset refuses and sends nothing', async () => {
    headersMock.mockResolvedValue(SUPPORT_HEADERS);

    await expect(requestPasswordReset('jane@example.com')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(requestCoreMock).not.toHaveBeenCalled();
  });

  it('updatePasswordAction refuses and changes nothing', async () => {
    headersMock.mockResolvedValue(SUPPORT_HEADERS);

    await expect(updatePasswordAction('Secure!123')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(updateCoreMock).not.toHaveBeenCalled();
  });

  it('both run normally outside a support session', async () => {
    headersMock.mockResolvedValue(new Headers({ 'x-community-id': '42' }));

    await expect(requestPasswordReset('jane@example.com')).resolves.toEqual({
      success: true,
      message: 'sent',
    });
    expect(requestCoreMock).toHaveBeenCalledWith('jane@example.com');

    await expect(updatePasswordAction('Secure!123')).resolves.toEqual({
      success: true,
      message: 'updated',
    });
    expect(updateCoreMock).toHaveBeenCalledWith('Secure!123');
  });
});
