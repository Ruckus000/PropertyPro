import { describe, expect, it } from 'vitest';
import { extractApiError } from '@/lib/http/extract-api-error';

describe('extractApiError', () => {
  it('returns the structured API error message when present', async () => {
    const response = new Response(
      JSON.stringify({ error: { message: 'Failed to archive community' } }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    );

    await expect(extractApiError(response)).resolves.toBe('Failed to archive community');
  });

  it('falls back to statusText when the body is not valid JSON', async () => {
    const response = new Response('not-json', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'content-type': 'text/plain' },
    });

    await expect(extractApiError(response)).resolves.toBe('Bad Gateway');
  });

  it('falls back to the HTTP status when the body is empty and statusText is missing', async () => {
    const response = new Response(null, { status: 503 });

    await expect(extractApiError(response)).resolves.toBe('HTTP 503');
  });
});
