import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReauth } from '../use-reauth';

// Mock fetch — the hook POSTs { password } to /api/v1/reauth/verify
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useReauth', () => {
  it('starts with modal closed', () => {
    const { result } = renderHook(() => useReauth());
    expect(result.current.isOpen).toBe(false);
  });

  it('opens the modal when triggerReauth is called', async () => {
    const { result } = renderHook(() => useReauth());
    // Don't await — the promise resolves only when modal is completed
    act(() => { void result.current.triggerReauth(); });
    expect(result.current.isOpen).toBe(true);
  });

  it('resolves false on cancel', async () => {
    const { result } = renderHook(() => useReauth());
    let resolved: boolean | undefined;
    act(() => { void result.current.triggerReauth().then((v) => { resolved = v; }); });
    act(() => { result.current.onCancel(); });
    // Flush microtask queue so the Promise .then() callback runs before we assert
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });

  it('verify sends password in request body', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useReauth());
    act(() => { void result.current.triggerReauth(); });
    await act(async () => { await result.current.verify('correct-password'); });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/reauth/verify', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ password: 'correct-password' }),
    }));
  });

  it('verify throws on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Incorrect password' } }),
    });
    const { result } = renderHook(() => useReauth());
    act(() => { void result.current.triggerReauth(); });
    await expect(
      act(async () => { await result.current.verify('wrong'); })
    ).rejects.toThrow('Incorrect password');
  });

  it('verify success closes modal and resolves true', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useReauth());
    let resolved: boolean | undefined;
    act(() => { void result.current.triggerReauth().then((v) => { resolved = v; }); });
    await act(async () => { await result.current.verify('correct'); });
    await Promise.resolve(); // flush microtasks
    expect(result.current.isOpen).toBe(false);
    expect(resolved).toBe(true);
  });

  it('failed verify leaves modal open and promise pending', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Wrong password' } }),
    });
    const { result } = renderHook(() => useReauth());
    let resolved: boolean | undefined;
    act(() => { void result.current.triggerReauth().then((v) => { resolved = v; }); });
    await act(async () => {
      await result.current.verify('wrong').catch(() => {});
    });
    expect(result.current.isOpen).toBe(true);
    expect(resolved).toBeUndefined();
  });

  it('verify surfaces string-shaped middleware errors verbatim (not "Incorrect password")', async () => {
    // Middleware-level rejections (CSRF 403, missing-session 401) return
    // { error: "<string>" } rather than the structured AppError shape.
    // Previously the hook fell back to "Incorrect password" for these,
    // wrongly blaming the user's credentials for a server-side problem.
    fetchMock.mockResolvedValue({
      status: 403,
      ok: false,
      json: async () => ({ error: 'Forbidden: invalid origin' }),
    });
    const { result } = renderHook(() => useReauth());
    act(() => { void result.current.triggerReauth(); });
    await expect(
      act(async () => { await result.current.verify('correct'); })
    ).rejects.toThrow('Forbidden: invalid origin');
  });

  it('verify surfaces REAUTH_MISCONFIGURED message instead of "Incorrect password"', async () => {
    // 500 from the verify route when REAUTH_JWT_SECRET is missing in prod —
    // this is what was actually happening on getpropertypro.com and being
    // shown to users as "An unexpected error occurred", which the modal then
    // implied was a password problem. Confirm the real message is propagated.
    fetchMock.mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({
        error: {
          code: 'REAUTH_MISCONFIGURED',
          message: 'Re-authentication is misconfigured on the server. Please contact support.',
        },
      }),
    });
    const { result } = renderHook(() => useReauth());
    act(() => { void result.current.triggerReauth(); });
    await expect(
      act(async () => { await result.current.verify('correct'); })
    ).rejects.toThrow('Re-authentication is misconfigured on the server. Please contact support.');
  });

  it('verify falls back to status-coded message when body has no parseable error', async () => {
    fetchMock.mockResolvedValue({
      status: 502,
      ok: false,
      json: async () => ({}),
    });
    const { result } = renderHook(() => useReauth());
    act(() => { void result.current.triggerReauth(); });
    await expect(
      act(async () => { await result.current.verify('any'); })
    ).rejects.toThrow('Verification failed (502)');
  });

  it('verify still says "Incorrect password" only on a bare 401', async () => {
    fetchMock.mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({}),
    });
    const { result } = renderHook(() => useReauth());
    act(() => { void result.current.triggerReauth(); });
    await expect(
      act(async () => { await result.current.verify('wrong'); })
    ).rejects.toThrow('Incorrect password');
  });
});
