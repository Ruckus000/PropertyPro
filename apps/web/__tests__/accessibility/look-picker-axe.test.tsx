/**
 * Accessibility audit — the look picker (website builder, Phase 4).
 *
 * Its own file because the picker needs `next/navigation` and `sonner` mocked,
 * and `vi.mock` is file-scoped: adding them to `axe-audit.test.tsx` would apply
 * them to every suite there.
 *
 * Each case first asserts that the picker's own content rendered (the visible
 * heading, the four look buttons, the size switch, the publish bar), because an
 * axe run over a container that rendered nothing passes trivially.
 *
 * The audit does not descend into the preview iframes (`iframes: false`): they
 * are inert, hidden pictures of the public site, whose own markup is audited by
 * `public-site-axe.test.tsx`, and jsdom never loads their documents anyway.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import type { ReactNode } from 'react';
import type { SiteFacts } from '@/lib/services/website-home-service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { LookPicker } from '@/components/website-home/look-picker';

const FACTS: SiteFacts = {
  profile: {
    name: 'Sunset Condos',
    shortName: null,
    addressLine1: '100 Ocean Dr',
    addressLine2: null,
    city: 'Miami',
    state: 'FL',
    zipCode: '33139',
    unitCount: 40,
    officeHours: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  },
  communityType: 'condo_718',
  upcomingMeetingCount: 2,
  newsCount: 4,
  recordsPosted: 9,
  recordsTotal: 12,
  liveLookId: 'bayfront',
  draftLookId: 'heritage',
  pendingDraftCount: 2,
  siteUrl: 'https://sunset-condos.example.com/',
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { blocks: [], publishedBlocks: [], latestPublishedAt: null } }),
  })) as unknown as typeof fetch;
});

function renderPicker(facts: SiteFacts) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<LookPicker communityId={42} facts={facts} />, { wrapper });
}

/** The picker's own content, so the audit below cannot pass over an empty tree. */
async function expectPickerRendered() {
  expect(
    screen.getByRole('heading', { level: 2, name: "Pick a look for Sunset Condos's website" }),
  ).toBeInTheDocument();
  for (const name of [/^Bayfront\b/, /^Heritage\b/, /^Palm Grove\b/, /^Plain & Simple\b/]) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
  expect(screen.getByRole('group', { name: 'Preview size' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Keep this look' })).toBeInTheDocument();
  // Settled: the publish token has loaded, so the bar is in its usable state.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Publish this look' })).toBeEnabled());
}

describe('look picker — axe', () => {
  it('the axe run has no violations', async () => {
    const { container } = renderPicker(FACTS);
    await expectPickerRendered();

    const results = await axe(container, { iframes: false });

    expect(results).toHaveNoViolations();
  });

  it('has none at phone width with a site on an older look', async () => {
    const user = userEvent.setup();
    const { container } = renderPicker({ ...FACTS, liveLookId: null, draftLookId: null });
    expect(screen.getByText('Your site uses an older look')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Phone' }));
    expect(screen.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true');

    const results = await axe(container, { iframes: false });

    expect(results).toHaveNoViolations();
  });
});
