import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { RBAC_RESOURCES } from '@propertypro/shared';
import { useFilteredRegistry } from '../../src/lib/constants/feature-registry';

function buildAccess(overrides: Partial<Record<string, { read: boolean; write: boolean }>> = {}) {
  return Object.fromEntries(
    RBAC_RESOURCES.map((resource) => [
      resource,
      overrides[resource] ?? { read: true, write: true },
    ]),
  ) as never;
}

describe('useFilteredRegistry', () => {
  it('hides read-gated pages for managers without resource access', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'manager',
        {
          hasMeetings: true,
          hasMaintenanceRequests: true,
          hasViolations: true,
        } as never,
        42,
        buildAccess({
          announcements: { read: false, write: true },
          meetings: { read: false, write: true },
          maintenance: { read: false, write: true },
        }),
      ),
    );

    const ids = result.current.map((item) => item.id);
    expect(ids).not.toContain('page-announcements');
    expect(ids).not.toContain('page-meetings');
    expect(ids).not.toContain('page-maintenance');
  });

  it('hides write-gated quick actions when a manager cannot mutate that resource', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'manager',
        {
          hasMeetings: true,
        } as never,
        42,
        buildAccess({
          announcements: { read: true, write: false },
          meetings: { read: true, write: false },
          documents: { read: true, write: false },
        }),
      ),
    );

    const ids = result.current.map((item) => item.id);
    expect(ids).not.toContain('action-post-announcement');
    expect(ids).not.toContain('action-schedule-meeting');
    expect(ids).not.toContain('action-upload-document');
  });
});
