import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApartmentWizard } from '../../../src/components/onboarding/apartment-wizard';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: ({ className, strokeWidth }: { className?: string; strokeWidth?: number }) =>
    React.createElement('svg', {
      className,
      strokeWidth,
      'data-testid': 'check-icon',
    }),
}));

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders progress indicator with correct initial step', async () => {
    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    const progressNav = container.querySelector('nav[aria-label="Progress"]');
    expect(progressNav).not.toBeNull();

    // Check that step 1 is marked as current
    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep).not.toBeNull();
    expect(currentStep?.textContent).toBe('1');
  });

  it('shows profile step on step 1', async () => {
    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Community Profile');

    // Verify profile form fields are present
    const nameInput = container.querySelector('#name') as HTMLInputElement | null;
    const addressInput = container.querySelector('#address') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    expect(addressInput).not.toBeNull();
  });

  it('progresses from step 1 to step 2 after profile completion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    // Fill in profile form
    const nameInput = container.querySelector('#name') as HTMLInputElement | null;
    const addressInput = container.querySelector('#address') as HTMLInputElement | null;
    const cityInput = container.querySelector('#city') as HTMLInputElement | null;
    const stateInput = container.querySelector('#state') as HTMLInputElement | null;
    const zipInput = container.querySelector('#zipCode') as HTMLInputElement | null;

    await act(async () => {
      if (nameInput) {
        nameInput.value = 'Test Community';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (addressInput) {
        addressInput.value = '123 Test St';
        addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (cityInput) {
        cityInput.value = 'Miami';
        cityInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (stateInput) {
        stateInput.value = 'FL';
        stateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (zipInput) {
        zipInput.value = '33101';
        zipInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Submit the form
    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    // Should now show Units step (step 2)
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Add Units');

    // Verify PATCH API was called to save progress
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/onboarding/apartment?communityId=42',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
  });

  it('shows units step on step 2 with back button', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 2,
            status: 'in_progress',
            stepData: {
              profile: {
                name: 'Test Community',
                addressLine1: '123 Test St',
                city: 'Miami',
                state: 'FL',
                zipCode: '33101',
              },
            },
          }}
        />,
      );
      await flushEffects();
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Add Units');

    // Verify back button exists
    const buttons = Array.from(container.querySelectorAll('button'));
    const backButton = buttons.find((btn) => btn.textContent === 'Back');
    expect(backButton).not.toBeNull();
  });

  it('navigates back from step 2 to step 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 2,
            status: 'in_progress',
            stepData: {},
          }}
        />,
      );
      await flushEffects();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const backButton = buttons.find((btn) => btn.textContent === 'Back');

    await act(async () => {
      backButton?.click();
      await flushEffects();
    });

    // Should show Profile step
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Community Profile');
  });

  it('shows invite step on step 3 with skip option', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 3,
            status: 'in_progress',
            stepData: {},
          }}
        />,
      );
      await flushEffects();
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Invite Your First Resident');

    // Verify skip button exists
    const buttons = Array.from(container.querySelectorAll('button'));
    const skipButton = buttons.find((btn) => btn.textContent === 'Skip for Now');
    expect(skipButton).not.toBeNull();
  });

  it('calls PATCH API on step change with correct payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Start at step 2 with initial profile data
    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 1,
            status: 'in_progress',
            stepData: {
              profile: {
                name: 'Test Community',
                addressLine1: '123 Test St',
                city: 'Miami',
                state: 'FL',
                zipCode: '33101',
              },
            },
          }}
        />,
      );
      await flushEffects();
    });

    // Submit the pre-filled profile form to trigger step change
    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    // Verify PATCH was called
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/onboarding/apartment?communityId=42',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const patchBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(patchBody).toEqual(
      expect.objectContaining({
        communityId: 42,
        currentStep: 2,
        stepData: expect.objectContaining({
          profile: expect.objectContaining({
            name: 'Test Community',
            addressLine1: '123 Test St',
            city: 'Miami',
            state: 'FL',
            zipCode: '33101',
          }),
        }),
      }),
    );
  });

  it('calls POST API on completion with skip flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 3,
            status: 'in_progress',
            stepData: {},
          }}
        />,
      );
      await flushEffects();
    });

    // Clear any PATCH calls from initial render
    fetchMock.mockClear();

    // Click the skip button on invite step
    const buttons = Array.from(container.querySelectorAll('button'));
    const skipButton = buttons.find((btn) => btn.textContent === 'Skip for Now');

    await act(async () => {
      skipButton?.click();
      await flushEffects();
    });

    // Verify POST was called with skip flag
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/onboarding/apartment?communityId=42',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const postBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(postBody).toEqual({
      communityId: 42,
      skip: true,
    });
  });

  it('redirects to dashboard on successful completion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 3,
            status: 'in_progress',
            stepData: {},
          }}
        />,
      );
      await flushEffects();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const skipButton = buttons.find((btn) => btn.textContent === 'Skip for Now');

    await act(async () => {
      skipButton?.click();
      await flushEffects();
    });

    // Verify router.push was called with dashboard URL
    expect(mockPush).toHaveBeenCalledWith('/dashboard/apartment?communityId=42');
  });

  it('displays error message when PATCH API fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to save progress' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    // Fill and submit profile form
    const nameInput = container.querySelector('#name') as HTMLInputElement | null;
    const addressInput = container.querySelector('#address') as HTMLInputElement | null;
    const cityInput = container.querySelector('#city') as HTMLInputElement | null;
    const stateInput = container.querySelector('#state') as HTMLInputElement | null;
    const zipInput = container.querySelector('#zipCode') as HTMLInputElement | null;

    await act(async () => {
      if (nameInput) {
        nameInput.value = 'Test Community';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (addressInput) {
        addressInput.value = '123 Test St';
        addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (cityInput) {
        cityInput.value = 'Miami';
        cityInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (stateInput) {
        stateInput.value = 'FL';
        stateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (zipInput) {
        zipInput.value = '33101';
        zipInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    // Verify error message is displayed
    const errorDiv = container.querySelector('.bg-red-50');
    expect(errorDiv).not.toBeNull();
    expect(errorDiv?.textContent).toContain('Failed to save progress');
  });

  it('displays error message when POST API fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to complete onboarding' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 3,
            status: 'in_progress',
            stepData: {},
          }}
        />,
      );
      await flushEffects();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const skipButton = buttons.find((btn) => btn.textContent === 'Skip for Now');

    await act(async () => {
      skipButton?.click();
      await flushEffects();
    });

    // Verify error message is displayed
    const errorDiv = container.querySelector('.bg-red-50');
    expect(errorDiv).not.toBeNull();
    expect(errorDiv?.textContent).toContain('Failed to complete onboarding');
  });

  it('displays saving indicator during API call', async () => {
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    // Fill and submit form
    const nameInput = container.querySelector('#name') as HTMLInputElement | null;
    const addressInput = container.querySelector('#address') as HTMLInputElement | null;
    const cityInput = container.querySelector('#city') as HTMLInputElement | null;
    const stateInput = container.querySelector('#state') as HTMLInputElement | null;
    const zipInput = container.querySelector('#zipCode') as HTMLInputElement | null;

    await act(async () => {
      if (nameInput) {
        nameInput.value = 'Test';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (addressInput) {
        addressInput.value = 'Test';
        addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (cityInput) {
        cityInput.value = 'Test';
        cityInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (stateInput) {
        stateInput.value = 'FL';
        stateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (zipInput) {
        zipInput.value = '33101';
        zipInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    // Check for saving indicator
    const savingDiv = container.querySelector('.bg-blue-50');
    expect(savingDiv).not.toBeNull();
    expect(savingDiv?.textContent).toContain('Saving progress...');

    // Resolve the fetch to clean up
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ data: {} }),
      });
      await flushEffects();
    });
  });

  it('skip setup button redirects to dashboard', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    // Find the "Skip setup and go to dashboard" button
    const buttons = Array.from(container.querySelectorAll('button'));
    const skipSetupButton = buttons.find((btn) =>
      btn.textContent?.includes('Skip setup and go to dashboard'),
    );

    await act(async () => {
      skipSetupButton?.click();
      await flushEffects();
    });

    // Verify POST was called with skip flag
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/onboarding/apartment?communityId=42',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const postBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(postBody.skip).toBe(true);
  });

  it('completes wizard with full data on final step', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 3,
            status: 'in_progress',
            stepData: {
              profile: {
                name: 'Test Community',
                addressLine1: '123 Test St',
                city: 'Miami',
                state: 'FL',
                zipCode: '33101',
              },
              unitsTable: [
                {
                  unitNumber: '101',
                  bedrooms: 2,
                  bathrooms: 2,
                  sqft: 1200,
                  rentAmount: 2000,
                },
              ],
            },
          }}
        />,
      );
      await flushEffects();
    });

    // Clear any PATCH calls from initial render
    fetchMock.mockClear();

    // Submit invite step without entering email (finish without invite)
    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    // Verify POST was called
    const postCalls = fetchMock.mock.calls.filter(
      (call) => call[1]?.method === 'POST',
    );
    expect(postCalls.length).toBeGreaterThan(0);

    const postBody = JSON.parse(String(postCalls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(postBody).toEqual({
      communityId: 42,
      skip: false,
    });

    // Verify redirect
    expect(mockPush).toHaveBeenCalledWith('/dashboard/apartment?communityId=42');
  });

  it('preserves initial state when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            currentStep: 2,
            status: 'in_progress',
            stepData: {
              profile: {
                name: 'Preserved Community',
                addressLine1: '456 Oak Ave',
                city: 'Orlando',
                state: 'FL',
                zipCode: '32801',
              },
              unitsTable: [
                {
                  unitNumber: '201',
                  bedrooms: 1,
                  bathrooms: 1,
                  sqft: 800,
                  rentAmount: 1500,
                },
              ],
            },
          }}
        />,
      );
      await flushEffects();
    });

    // Should be on step 2
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Add Units');

    // Step indicator should show step 2 as current
    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toBe('2');
  });
});
