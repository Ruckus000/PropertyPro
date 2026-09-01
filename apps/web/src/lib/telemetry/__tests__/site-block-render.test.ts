import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageMock,
}));

import {
  __resetDegradedReportThrottle,
  findDegradedBlocks,
  reportDegradedBlocks,
  type InspectableBlock,
} from '../site-block-render';

/**
 * The behaviour under test is "a section silently disappeared from a public
 * site and nothing noticed". These assertions are the only thing standing
 * between that and another multi-week blind spot, so they check the two
 * properties that actually matter: that a broken block IS reported, and that
 * a healthy or mid-edit site is NOT (because an alert that cries wolf gets
 * muted, which is the same outcome as no alert).
 */
const allRender = () => true;

const validText: InspectableBlock = {
  id: 1,
  blockType: 'text',
  content: { body: 'Hello' },
};
const validPayments: InspectableBlock = {
  id: 2,
  blockType: 'payments',
  content: { heading: 'Pay', ctaText: 'Go', ctaTarget: 'https://example.com/pay' },
};

beforeEach(() => {
  captureMessageMock.mockClear();
  __resetDegradedReportThrottle();
});

describe('findDegradedBlocks', () => {
  it('returns nothing when every block is valid and renderable', () => {
    expect(findDegradedBlocks([validText, validPayments], allRender)).toEqual([]);
  });

  it('flags content that fails its schema', () => {
    // documentsBlockSchema is .strict(); an unknown key fails it.
    const bad: InspectableBlock = {
      id: 7,
      blockType: 'documents',
      content: { limit: 5, notAField: true },
    };
    expect(findDegradedBlocks([bad], allRender)).toEqual([
      { blockId: 7, blockType: 'documents', reason: 'schema-invalid' },
    ]);
  });

  it('flags a block type with no schema at all', () => {
    const unknown: InspectableBlock = { id: 9, blockType: 'carousel', content: {} };
    expect(findDegradedBlocks([unknown], allRender)).toEqual([
      { blockId: 9, blockType: 'carousel', reason: 'missing-renderer' },
    ]);
  });

  it('flags a known type whose renderer is not registered', () => {
    // The `block-type-missing-renderer` case registry.ts claimed to report
    // and never did.
    const noRenderer = (blockType: string) => blockType !== 'payments';
    expect(findDegradedBlocks([validText, validPayments], noRenderer)).toEqual([
      { blockId: 2, blockType: 'payments', reason: 'missing-renderer' },
    ]);
  });

  it('ignores tombstones, which are staged deletions and never render', () => {
    // Without this, every site with a pending deletion would report on every
    // request — the fastest way to get the alert muted.
    const tombstone: InspectableBlock = { id: 5, blockType: 'tombstone', content: {} };
    expect(findDegradedBlocks([validText, tombstone], allRender)).toEqual([]);
  });

  it('reports every degraded block, not just the first', () => {
    const blocks: InspectableBlock[] = [
      { id: 1, blockType: 'text', content: { body: 'ok' } },
      { id: 2, blockType: 'text', content: {} },
      { id: 3, blockType: 'nope', content: {} },
    ];
    expect(findDegradedBlocks(blocks, allRender).map((d) => d.blockId)).toEqual([2, 3]);
  });
});

describe('reportDegradedBlocks', () => {
  const ctx = { communityId: 42, communitySlug: 'sunset-condos' };

  it('emits nothing when the page is healthy', () => {
    reportDegradedBlocks([validText, validPayments], allRender, ctx);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('emits exactly ONE event no matter how many blocks are broken', () => {
    // The whole reason this lives at page level rather than in eleven
    // renderers: a community with four bad sections must not emit four events
    // per visitor per request.
    const blocks: InspectableBlock[] = [
      { id: 1, blockType: 'text', content: {} },
      { id: 2, blockType: 'documents', content: { limit: 'lots' } },
      { id: 3, blockType: 'meetings', content: { limit: -1 } },
      { id: 4, blockType: 'carousel', content: {} },
    ];
    reportDegradedBlocks(blocks, allRender, ctx);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it('uses a fixed event name and puts everything variable in extra', () => {
    reportDegradedBlocks([{ id: 8, blockType: 'text', content: {} }], allRender, ctx);
    expect(captureMessageMock).toHaveBeenCalledWith('public_site_blocks_degraded', {
      level: 'warning',
      extra: expect.objectContaining({
        communityId: 42,
        communitySlug: 'sunset-condos',
        totalBlocks: 1,
        degradedCount: 1,
        schemaInvalidCount: 1,
        missingRendererCount: 0,
        degraded: [{ blockId: 8, blockType: 'text', reason: 'schema-invalid' }],
      }),
    });
  });

  it('separates schema failures from missing renderers in the counts', () => {
    const blocks: InspectableBlock[] = [
      { id: 1, blockType: 'text', content: {} },
      { id: 2, blockType: 'carousel', content: {} },
    ];
    reportDegradedBlocks(blocks, allRender, ctx);
    const extra = captureMessageMock.mock.calls[0]?.[1]?.extra;
    expect(extra).toMatchObject({ schemaInvalidCount: 1, missingRendererCount: 1 });
  });

  it('returns the degraded list so callers can assert on it', () => {
    const result = reportDegradedBlocks(
      [{ id: 3, blockType: 'text', content: {} }],
      allRender,
      ctx,
    );
    expect(result).toEqual([{ blockId: 3, blockType: 'text', reason: 'schema-invalid' }]);
  });
});

describe('throttling', () => {
  const ctx = { communityId: 42, communitySlug: 'sunset-condos' };
  const broken: InspectableBlock[] = [{ id: 1, blockType: 'text', content: {} }];

  it('reports the same degraded state only once per window', () => {
    // The public-site route calls await headers(), so it is fully dynamic:
    // one render per visitor, crawlers included. Without this, one broken
    // community emits an event per page view until someone mutes the alert —
    // which is the state this telemetry exists to escape.
    for (let i = 0; i < 50; i += 1) reportDegradedBlocks(broken, allRender, ctx);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it('reports again when the degraded set CHANGES', () => {
    reportDegradedBlocks(broken, allRender, ctx);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    // A site getting worse must not be suppressed by the earlier report.
    reportDegradedBlocks(
      [...broken, { id: 2, blockType: 'documents', content: { limit: 'lots' } }],
      allRender,
      ctx,
    );
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
  });

  it('throttles per community, not globally', () => {
    // A platform-wide schema regression must still identify every affected
    // community, not just whichever one rendered first.
    reportDegradedBlocks(broken, allRender, ctx);
    reportDegradedBlocks(broken, allRender, { communityId: 7, communitySlug: 'palm-shores' });
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
  });

  it('still returns the degraded list while throttled', () => {
    reportDegradedBlocks(broken, allRender, ctx);
    const second = reportDegradedBlocks(broken, allRender, ctx);
    expect(second).toEqual([{ blockId: 1, blockType: 'text', reason: 'schema-invalid' }]);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });
});
