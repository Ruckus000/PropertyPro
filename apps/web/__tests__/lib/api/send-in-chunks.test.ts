/**
 * "Select all" can exceed the bulk endpoints' 100-recipient cap; the client
 * must split, keep results of chunks already sent, and never drift from the
 * server's cap.
 */
import { describe, expect, it, vi } from 'vitest';
import { RECIPIENTS_PER_REQUEST, sendInChunks } from '../../../src/lib/api/send-in-chunks';
import { BATCH_INVITE_MAX } from '../../../src/app/api/v1/invitations/batch/contract';
import { SEND_DOCUMENTS_MAX_RECIPIENTS } from '../../../src/app/api/v1/documents/send/contract';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);

describe('sendInChunks', () => {
  it('matches both endpoints’ caps', () => {
    expect(RECIPIENTS_PER_REQUEST).toBe(BATCH_INVITE_MAX);
    expect(RECIPIENTS_PER_REQUEST).toBe(SEND_DOCUMENTS_MAX_RECIPIENTS);
  });

  it('splits 250 recipients into 100 + 100 + 50 and returns every result in order', async () => {
    const send = vi.fn(async (chunk: string[]) => chunk.map((userId) => ({ userId, status: 'sent' })));
    const results = await sendInChunks(ids(250), send, (userId) => ({ userId, status: 'failed' }));
    expect(send.mock.calls.map(([c]) => c.length)).toEqual([100, 100, 50]);
    expect(results.map((r) => r.userId)).toEqual(ids(250));
  });

  it('a failed chunk marks only its own recipients failed and keeps going', async () => {
    const send = vi.fn(async (chunk: string[]) => {
      if (chunk[0] === 'u100') throw new Error('rate limited');
      return chunk.map((userId) => ({ userId, status: 'sent' }));
    });
    const results = await sendInChunks(ids(250), send, (userId, error) => ({
      userId,
      status: 'failed',
      error: (error as Error).message,
    }));
    expect(send).toHaveBeenCalledTimes(3);
    expect(results.filter((r) => r.status === 'sent')).toHaveLength(150);
    expect(results.filter((r) => r.status === 'failed').map((r) => r.userId)).toEqual(ids(200).slice(100));
    expect(results.find((r) => r.userId === 'u150')).toMatchObject({ error: 'rate limited' });
  });
});
