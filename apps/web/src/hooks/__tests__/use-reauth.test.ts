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
});
