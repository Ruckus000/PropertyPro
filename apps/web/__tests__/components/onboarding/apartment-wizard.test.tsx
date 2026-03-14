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

vi.mock('lucide-react', () => ({
  Check: ({ className, strokeWidth }: { className?: string; strokeWidth?: number }) =>
    React.createElement('svg', {
      className,
      strokeWidth,
      'data-testid': 'check-icon',
    }),
}));

vi.mock('@/components/documents/document-upload-area', () => ({
  DocumentUploadArea: ({ onUploaded }: { onUploaded?: (document: Record<string, unknown>) => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onUploaded?.({ id: 77, filePath: 'documents/rules.pdf' }),
      },
      'Mock Upload',
    ),
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
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('fresh state renders step 0 profile', async () => {
    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Community Profile');

    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toBe('1');
  });

  it('resume from lastCompletedStep=2 lands on rules step', async () => {
    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            status: 'in_progress',
            lastCompletedStep: 2,
            nextStep: 3,
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
              units: [
                {
                  unitNumber: '101',
                  bedrooms: 2,
                },
              ],
            },
          }}
        />,
      );
      await flushEffects();
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Upload Rules Document');

    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toBe('4');
  });

  it('skip wizard sends canonical POST action=skip', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<ApartmentWizard communityId={42} />);
      await flushEffects();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const skipWizardButton = buttons.find((button) =>
      button.textContent?.includes('Skip entire setup and go to dashboard'),
    );

    await act(async () => {
      skipWizardButton?.click();
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
      action: 'skip',
    });
  });

  it('back navigation does not call API', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            status: 'in_progress',
            lastCompletedStep: 2,
            nextStep: 3,
            completedAt: null,
            stepData: {
              units: [{ unitNumber: '101' }],
            },
          }}
        />,
      );
      await flushEffects();
    });

    fetchMock.mockClear();

    const buttons = Array.from(container.querySelectorAll('button'));
    const backButton = buttons.find((button) => button.textContent === 'Back');

    await act(async () => {
      backButton?.click();
      await flushEffects();
    });

    expect(fetchMock).not.toHaveBeenCalled();

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Add Units');
  });

  it('invite step requires full fields before submit', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            status: 'in_progress',
            lastCompletedStep: 3,
            nextStep: 4,
            completedAt: null,
            stepData: {
              units: [{ unitNumber: '101' }],
              invite: {
                email: 'partial@example.com',
                fullName: '',
                unitNumber: '',
              },
            },
          }}
        />,
      );
      await flushEffects();
    });

    fetchMock.mockClear();

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Provide email, full name, and unit number');
  });

  it('invite skip persists null invite then completes', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <ApartmentWizard
          communityId={42}
          initialState={{
            status: 'in_progress',
            lastCompletedStep: 3,
            nextStep: 4,
            completedAt: null,
            stepData: {
              units: [{ unitNumber: '101' }],
            },
          }}
        />,
      );
      await flushEffects();
    });

    fetchMock.mockClear();

    const buttons = Array.from(container.querySelectorAll('button'));
    const skipInviteButton = buttons.find((button) => button.textContent === 'Skip Invite');

    await act(async () => {
      skipInviteButton?.click();
      await flushEffects();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCallBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(firstCallBody).toEqual({
      communityId: 42,
      step: 4,
      stepData: {
        invite: null,
      },
    });

    const secondCallBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(secondCallBody).toEqual({
      communityId: 42,
      action: 'complete',
    });
  });
});
