// @vitest-environment jsdom
/**
 * Each Subscriptions row links into `/billing`. The link may name a `?status=`
 * only when `/billing` has a tab for it — otherwise it promises a filter the
 * page will not apply (`active` and `none` have no tab there).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SubscriptionsCard } from '@/components/dashboard/SubscriptionsCard';

const BILLING = { active: 5, trialing: 2, past_due: 3, canceled: 1, none: 4 };

function hrefOf(label: RegExp) {
  return screen.getByRole('link', { name: label }).getAttribute('href');
}

describe('SubscriptionsCard', () => {
  it('links each status Billing can filter on to that filter', () => {
    render(<SubscriptionsCard billing={BILLING} />);

    expect(hrefOf(/Past due/)).toBe('/billing?status=past_due');
    expect(hrefOf(/Trialing/)).toBe('/billing?status=trialing');
    expect(hrefOf(/Canceled/)).toBe('/billing?status=canceled');
  });

  it('links a status Billing has no tab for to the unfiltered list', () => {
    render(<SubscriptionsCard billing={BILLING} />);

    expect(hrefOf(/^Active/)).toBe('/billing');
    expect(hrefOf(/No subscription/)).toBe('/billing');
  });
});
