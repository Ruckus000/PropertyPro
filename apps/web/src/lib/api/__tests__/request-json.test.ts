import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError, requestJson } from '../request-json';

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

describe('requestJson — the server\'s structured detail survives the throw', () => {
  /*
   * `AppError.toJSON` emits `{ error: { code, message, details } }`, and a
   * `ValidationError` puts its per-field reasons in `details.fields`. All of it
   * used to be discarded here: the throw carried `message` and nothing else.
   *
   * The concrete dead end that motivated this is the publish sheet. A publish
   * refused on page-set grounds threw
   * `ValidationError('This site cannot be published yet.', { fields })`, and
   * the receipt could only render that sentence next to "Try publishing
   * again" — advice for an action that will fail identically forever, while
   * the array naming the offending pages sat unread on the wire.
   *
   * Revert check (production line): the `fields` assignment in
   * `ApiRequestError`'s constructor (`this.fields = readFields(init.details)`).
   * Removing only that line turns the two `fields` cases here red and leaves
   * `code`/`details`/`status` green.
   */
  function failWith(body: unknown, status = 400) {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => body });
  }

  async function rejection(): Promise<ApiRequestError> {
    try {
      await requestJson('/api/test');
    } catch (error) {
      return error as ApiRequestError;
    }
    throw new Error('expected requestJson to reject');
  }

  it('carries code, status and the field reasons a ValidationError attached', async () => {
    failWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'This site cannot be published yet.',
        details: {
          fields: [
            { field: 'page:7.slug', message: 'Another page already uses "/contact".' },
            { field: 'pages.home', message: 'This site has no home page.' },
          ],
        },
      },
    });

    const error = await rejection();
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields).toEqual([
      { field: 'page:7.slug', message: 'Another page already uses "/contact".' },
      { field: 'pages.home', message: 'This site has no home page.' },
    ]);
  });

  it('is still an Error with the same message, so the ~50 existing callers are untouched', async () => {
    failWith({ error: { message: 'Only property managers can manage site pages' } });

    const error = await rejection();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Only property managers can manage site pages');
    expect(error.code).toBeUndefined();
    expect(error.fields).toBeUndefined();
  });

  it('refuses a malformed fields array rather than handing a UI half-typed entries', async () => {
    // A partly-typed array would render `undefined` to a PM mid-publish, which
    // is worse than the generic message it replaced.
    failWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Nope.',
        details: { fields: ['just a string', { field: 7 }, null] },
      },
    });

    const error = await rejection();
    expect(error.fields).toBeUndefined();
    // The raw payload is still reachable for anything that wants to inspect it.
    expect(error.details).toEqual({ fields: ['just a string', { field: 7 }, null] });
  });
});
