import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApartmentWizard } from '../../../src/components/onboarding/apartment-wizard';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Check: ({ className, strokeWidth }: { className?: string; strokeWidth?: number }) =>
      React.createElement('svg', {
        className,
        strokeWidth,
        'data-testid': 'check-icon',
      }),
  };
});

vi.mock('@propertypro/shared', () => ({
  getComplianceTemplate: () => [
    { templateKey: 'apt_rules', title: 'Community Rules', category: 'Rules', statuteReference: null },
  ],
}));

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [] }),
  });
}

describe('apartment wizard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockPush.mockClear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('fresh state renders step 0 profile form', async () => {
    await act(async () => {
      root.render(<ApartmentWizard communityId={42} communityType="apartment" />);
      await flushEffects();
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Community Profile');

    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toBe('1');
  });

  it('resume from nextStep=1 lands on compliance preview', async () => {
    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          communityType="apartment"
          initialState={{
            status: 'in_progress',
            lastCompletedStep: 0,
            nextStep: 1,
            completedAt: null,
            stepData: {
              profile: {
                name: 'Test Community',
                addressLine1: '123 Test St',
                city: 'Miami',
                state: 'FL',
                zipCode: '33101',
                timezone: 'America/New_York',
              },
            },
          }}
        />,
      );
      await flushEffects();
    });

    const headings = Array.from(container.querySelectorAll('h1'));
    const complianceHeading = headings.find(h => h.textContent?.includes("Here's what Florida requires"));
    expect(complianceHeading).toBeDefined();

    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toBe('2');
  });

  it('clamps malformed persisted nextStep to the last valid step (compliance preview)', async () => {
    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          communityType="apartment"
          initialState={{
            status: 'in_progress',
            lastCompletedStep: 0,
            nextStep: 99,
            completedAt: null,
            stepData: {},
          }}
        />,
      );
      await flushEffects();
    });

    const headings = Array.from(container.querySelectorAll('h1'));
    const complianceHeading = headings.find(h => h.textContent?.includes("Here's what Florida requires"));
    expect(complianceHeading).toBeDefined();

    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toBe('2');
  });

  it('completing wizard sends canonical POST action=complete', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          communityType="apartment"
          initialState={{
            status: 'in_progress',
            lastCompletedStep: 0,
            nextStep: 1,
            completedAt: null,
            stepData: {},
          }}
        />,
      );
      await flushEffects();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const continueButton = buttons.find((button) =>
      button.textContent?.includes('Go to your dashboard'),
    );

    await act(async () => {
      continueButton?.click();
      await flushEffects();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/onboarding/apartment?communityId=42',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const postBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(postBody).toEqual({
      communityId: 42,
      action: 'complete',
    });
  });

  it('advancing from profile step calls PATCH then renders compliance preview', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<ApartmentWizard communityId={42} communityType="apartment" />);
      await flushEffects();
    });

    // Fill required fields using native input value setter (React's onChange watches nativeInputValueSetter)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    const nameInput = container.querySelector<HTMLInputElement>('#name');
    const addressInput = container.querySelector<HTMLInputElement>('#addressLine1');
    const cityInput = container.querySelector<HTMLInputElement>('#city');
    const zipInput = container.querySelector<HTMLInputElement>('#zipCode');

    await act(async () => {
      if (nameInput && nativeInputValueSetter) {
        nativeInputValueSetter.call(nameInput, 'Test Apartments');
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (addressInput && nativeInputValueSetter) {
        nativeInputValueSetter.call(addressInput, '123 Test St');
        addressInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (cityInput && nativeInputValueSetter) {
        nativeInputValueSetter.call(cityInput, 'Miami');
        cityInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (zipInput && nativeInputValueSetter) {
        nativeInputValueSetter.call(zipInput, '33101');
        zipInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    const patchCall = fetchMock.mock.calls.find(c => {
      const options = c[1] as RequestInit;
      return options?.method === 'PATCH';
    });

    expect(patchCall).toBeDefined();
    if (patchCall) {
      expect(patchCall[0]).toContain('/api/v1/onboarding/apartment');
      const patchBody = JSON.parse(String(patchCall[1]?.body)) as Record<string, unknown>;
      expect(patchBody).toMatchObject({ communityId: 42, step: 0 });
    }

    // Should now show compliance preview (step 1)
    const headings = Array.from(container.querySelectorAll('h1'));
    const complianceHeading = headings.find(h => h.textContent?.includes("Here's what Florida requires"));
    expect(complianceHeading).toBeDefined();
  });

  it('only 2 steps are shown in the progress indicator', async () => {
    await act(async () => {
      root.render(<ApartmentWizard communityId={42} communityType="apartment" />);
      await flushEffects();
    });

    // ProgressIndicator renders step circles; there should be exactly 2
    const stepCircles = container.querySelectorAll('[aria-current="step"], [aria-current]');
    // Only one circle has aria-current="step" at a time, but we can count list items
    const progressNav = container.querySelector('nav[aria-label="Progress"]');
    const stepItems = progressNav?.querySelectorAll('li');
    expect(stepItems?.length).toBe(2);
  });
});
