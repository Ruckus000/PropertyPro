import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs so the test is deterministic and independent of cwd.
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));

import fs from 'node:fs';
import { getLegalDoc, getLegalDocs } from '@/lib/legal-content';

const readFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;

describe('legal-content', () => {
  beforeEach(() => {
    readFileSync.mockReset();
    readFileSync.mockImplementation((p: string) =>
      p.includes('terms') ? '# Terms\n\nT body' : '# Privacy\n\nP body',
    );
  });

  it('getLegalDoc renders the requested doc with the marketing variant (class-less)', () => {
    const html = getLegalDoc('terms');
    expect(html).toContain('<h1>Terms</h1>');
    expect(html).toContain('<p>T body</p>');
    expect(html).not.toContain('class=');
  });

  it('getLegalDocs returns both rendered docs', () => {
    const docs = getLegalDocs();
    expect(docs.terms).toContain('<h1>Terms</h1>');
    expect(docs.privacy).toContain('<h1>Privacy</h1>');
  });
});
