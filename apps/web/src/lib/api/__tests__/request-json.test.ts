import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestJson } from '../request-json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

describe('requestJson', () => {
  it('extracts .data from successful response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 1, name: 'test' } }),
    });
    const result = await requestJson<{ id: number; name: string }>('/api/test');
    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('throws server error message on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Not found' } }),
    });
    await expect(requestJson('/api/test')).rejects.toThrow('Not found');
  });

  it('throws generic message when server provides no message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: {} }),
    });
    await expect(requestJson('/api/test')).rejects.toThrow('Request failed');
  });

  it('throws when data is undefined in response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await expect(requestJson('/api/test')).rejects.toThrow('Missing response payload');
  });

  it('throws on non-JSON response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });
    await expect(requestJson('/api/test')).rejects.toThrow();
  });
});
