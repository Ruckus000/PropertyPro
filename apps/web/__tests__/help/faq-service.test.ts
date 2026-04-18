import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, faqsTableMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  faqsTableMock: Symbol('faqs'),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  faqs: faqsTableMock,
}));

import {
  buildDefaultFaqRows,
  ensureFaqsExist,
  filterFaqsForRole,
  isFaqVisibleToRole,
} from '../../src/lib/services/faq-service';

describe('faq service helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a non-empty ordered default FAQ seed set', () => {
    const rows = buildDefaultFaqRows();

    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows[0]?.sortOrder).toBe(0);
    expect(rows.at(-1)?.sortOrder).toBe(rows.length - 1);
  });

  it('filters role-restricted FAQs correctly', () => {
    expect(isFaqVisibleToRole({ roleVisibility: null }, 'tenant')).toBe(true);
    expect(isFaqVisibleToRole({ roleVisibility: ['manager'] }, 'tenant')).toBe(false);
    expect(isFaqVisibleToRole({ roleVisibility: ['manager'] }, 'manager')).toBe(true);

    const visible = filterFaqsForRole(
      [
        {
          id: 1,
          question: 'Visible',
          answer: 'All',
          sortOrder: 1,
          category: null,
          roleVisibility: null,
        },
        {
          id: 2,
          question: 'Admin only',
          answer: 'Restricted',
          sortOrder: 0,
          category: null,
          roleVisibility: ['manager'],
        },
      ] as never,
      'tenant',
    );

    expect(visible.map((faq) => faq.id)).toEqual([1]);
  });

  it('seeds defaults when a community has no FAQs yet', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const insert = vi.fn().mockResolvedValue([]);
    createScopedClientMock.mockReturnValue({ query, insert });

    await ensureFaqsExist(42);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(query).toHaveBeenCalledWith(faqsTableMock);
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0]?.[1]).toEqual(buildDefaultFaqRows());
  });

  it('does not reseed when FAQs already exist', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1 }]);
    const insert = vi.fn();
    createScopedClientMock.mockReturnValue({ query, insert });

    await ensureFaqsExist(42);

    expect(insert).not.toHaveBeenCalled();
  });
});
