import { describe, expect, it, vi } from 'vitest';
import { applyDemoAnnouncementProvenancePolicy } from '../../src/lib/announcements/demo-announcement-provenance';

const { createScopedClientMock, demoSeedRegistryMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  demoSeedRegistryMock: Symbol('demo_seed_registry'),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  demoSeedRegistry: demoSeedRegistryMock,
}));

describe('applyDemoAnnouncementProvenancePolicy', () => {
  it('keeps announcements for non-demo-lineage communities', async () => {
    const rows = [{ id: 1, title: 'A' }] as never;
    const result = await applyDemoAnnouncementProvenancePolicy(
      { id: 10, isDemo: false, trialEndsAt: null, demoExpiresAt: null },
      rows,
    );
    expect(result).toEqual(rows);
    expect(createScopedClientMock).not.toHaveBeenCalled();
  });

  it('fails closed for demo-lineage communities when no registry data is available', async () => {
    createScopedClientMock.mockReturnValueOnce({
      selectFrom: vi.fn().mockResolvedValue([]),
    });
    const rows = [{ id: 1, title: 'A' }] as never;
    const result = await applyDemoAnnouncementProvenancePolicy(
      { id: 11, isDemo: true, trialEndsAt: null, demoExpiresAt: null },
      rows,
    );
    expect(result).toEqual([]);
  });

  it('filters seeded announcements when registry data exists', async () => {
    createScopedClientMock.mockReturnValueOnce({
      selectFrom: vi.fn().mockResolvedValue([{ entityId: '2' }]),
    });
    const rows = [{ id: 1, title: 'Live' }, { id: 2, title: 'Seeded' }] as never;
    const result = await applyDemoAnnouncementProvenancePolicy(
      { id: 12, isDemo: true, trialEndsAt: null, demoExpiresAt: null },
      rows,
    );
    expect(result.map((row) => row.id)).toEqual([1]);
  });
});
