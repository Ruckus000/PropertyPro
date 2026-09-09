import { describe, expect, it } from 'vitest';
import { searchAdmin, type Searcher } from '@/lib/server/search';

const stub = (key: Searcher['key'], hits: string[]): Searcher => ({
  key, label: key,
  search: async (q) => hits.filter((h) => h.toLowerCase().includes(q.toLowerCase())).map((h) => ({ id: h, label: h, meta: '', href: `/${key}/${h}`, icon: 'building' as const })),
});

describe('searchAdmin', () => {
  it('returns nothing below two characters', async () => {
    expect(await searchAdmin('s', [stub('clients', ['Sunset'])])).toEqual([]);
  });
  it('groups hits and omits empty groups', async () => {
    const groups = await searchAdmin('sun', [stub('clients', ['Sunset Condos']), stub('people', ['Nobody'])]);
    expect(groups.map((g) => g.key)).toEqual(['clients']);
    expect(groups[0]!.hits[0]!.href).toBe('/clients/Sunset Condos');
  });
  it('a failing searcher drops its group only', async () => {
    const boom: Searcher = { key: 'threads', label: 'Threads', search: async () => { throw new Error('x'); } };
    const groups = await searchAdmin('sun', [boom, stub('clients', ['Sunset'])]);
    expect(groups.map((g) => g.key)).toEqual(['clients']);
  });
});
