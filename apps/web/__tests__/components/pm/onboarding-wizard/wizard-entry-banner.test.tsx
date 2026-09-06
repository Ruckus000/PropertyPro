// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WizardEntryBanner } from '@/components/pm/onboarding-wizard/WizardEntryBanner';

// React ships no type for this flag; the rest of apps/web/__tests__ reaches it
// through the same narrow shape (see components/onboarding/condo-wizard.test.tsx).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderBanner(communityId: number): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<WizardEntryBanner communityId={communityId} />);
  });
  return container;
}

describe('<WizardEntryBanner>', () => {
  it('renders with role="status" and the customize copy', async () => {
    const c = await renderBanner(42);
    const banner = c.querySelector('[data-testid="wizard-entry-banner"]') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toMatch(/default settings/i);
    expect(banner.textContent).toMatch(/5-step onboarding/i);
  });

  it('links the Customize CTA to /pm/onboarding/website?communityId=X', async () => {
    const c = await renderBanner(123);
    const cta = c.querySelector('[data-testid="wizard-entry-banner-cta"]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('href')).toBe('/pm/onboarding/website?communityId=123');
    expect(cta.textContent).toMatch(/customize/i);
  });
});
