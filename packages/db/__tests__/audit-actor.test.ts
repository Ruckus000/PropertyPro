/**
 * Support-session attribution on compliance_audit_log rows
 * (src/audit-actor.ts + src/utils/audit-logger.ts).
 *
 * Inside `runWithAuditActor({ support })`, every `logAuditEvent` row gets
 * `metadata.support = { sessionId, adminUserId }` MERGED into its metadata;
 * outside one, the row is byte-for-byte what it was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { valuesMock, insertMock } = vi.hoisted(() => {
  const valuesMock = vi.fn(async () => undefined);
  return { valuesMock, insertMock: vi.fn(() => ({ values: valuesMock })) };
});

vi.mock('../src/drizzle', () => ({ db: { insert: insertMock } }));

const { logAuditEvent } = await import('../src/utils/audit-logger');
const { runWithAuditActor, getAuditActor, stampAuditActorMetadata } = await import(
  '../src/audit-actor'
);

const SUPPORT = { support: { sessionId: 42, adminUserId: 'admin-uuid' } };

function insertedMetadata(): unknown {
  const calls = valuesMock.mock.calls as unknown as Array<[{ metadata: unknown }]>;
  return calls[0]![0].metadata;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logAuditEvent + audit actor', () => {
  it('merges metadata.support inside a support run, preserving existing keys', async () => {
    await runWithAuditActor(SUPPORT, () =>
      logAuditEvent({
        userId: 'target-user',
        action: 'document_accessed',
        resourceType: 'document',
        resourceId: '42',
        communityId: 8,
        metadata: { accessType: 'download', fileName: 'minutes.pdf' },
      }),
    );

    expect(insertedMetadata()).toEqual({
      accessType: 'download',
      fileName: 'minutes.pdf',
      support: { sessionId: 42, adminUserId: 'admin-uuid' },
    });
  });

  it('stamps a row that had NO metadata', async () => {
    await runWithAuditActor(SUPPORT, () =>
      logAuditEvent({
        userId: 'target-user',
        action: 'update',
        resourceType: 'x',
        resourceId: '1',
        communityId: 8,
      }),
    );
    expect(insertedMetadata()).toEqual({ support: { sessionId: 42, adminUserId: 'admin-uuid' } });
  });

  it('the actor wins over a caller-supplied `support` key', async () => {
    await runWithAuditActor(SUPPORT, () =>
      logAuditEvent({
        userId: 'target-user',
        action: 'update',
        resourceType: 'x',
        resourceId: '1',
        communityId: 8,
        metadata: { support: { sessionId: 1, adminUserId: 'someone-else' }, keep: true },
      }),
    );
    expect(insertedMetadata()).toEqual({
      support: { sessionId: 42, adminUserId: 'admin-uuid' },
      keep: true,
    });
  });

  it('outside any run the metadata is unchanged (object and null alike)', async () => {
    await logAuditEvent({
      userId: 'u',
      action: 'update',
      resourceType: 'x',
      resourceId: '1',
      communityId: 8,
      metadata: { a: 1 },
    });
    expect(insertedMetadata()).toEqual({ a: 1 });

    valuesMock.mockClear();
    await logAuditEvent({ userId: 'u', action: 'update', resourceType: 'x', resourceId: '1', communityId: 8 });
    expect(insertedMetadata()).toBeNull();
  });

  it('a null actor runs the callback with no store', () => {
    expect(runWithAuditActor(null, () => getAuditActor())).toBeUndefined();
    expect(runWithAuditActor({ support: null }, () => stampAuditActorMetadata({ a: 1 }))).toEqual({ a: 1 });
  });

  it('the store survives awaits (fire-and-forget audit writes inherit it)', async () => {
    const seen = await runWithAuditActor(SUPPORT, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return getAuditActor();
    });
    expect(seen).toEqual(SUPPORT);
    expect(getAuditActor()).toBeUndefined();
  });

  it('two module instances share ONE store (globalThis-registered)', async () => {
    vi.resetModules();
    const second = await import('../src/audit-actor');
    expect(second.runWithAuditActor).not.toBe(runWithAuditActor);
    expect(runWithAuditActor(SUPPORT, () => second.getAuditActor())).toEqual(SUPPORT);
  });
});
