import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CondoWizard } from '../../../src/components/onboarding/condo-wizard';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
        replace: vi.fn(),
        refresh: vi.fn(),
    }),
}));

vi.mock('lucide-react', () => ({
    Check: ({ className }: { className?: string }) =>
        React.createElement('svg', { className, 'data-testid': 'check-icon' }),
}));

async function flushEffects(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

async function waitForLoadingToFinish(container: HTMLElement) {
    let tries = 0;
    while (container.textContent?.includes('Loading compliance requirements') && tries < 20) {
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            await flushEffects();
        });
        tries++;
    }
}

function createFetchMock() {
    return vi.fn().mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/compliance') && url.includes('communityId=')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    data: [{ id: 1, templateKey: '718_articles', title: 'Articles of Incorporation', category: 'Governing Documents', documentId: null }]
                }),
            });
        }
        return Promise.resolve({
            ok: true,
            json: async () => ({ data: [] }),
        });
    });
}

describe('CondoWizard', () => {
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

    it('fresh state renders step 0 statutory documents', async () => {
        const fetchMock = createFetchMock();
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(<CondoWizard communityId={42} communityType="condo_718" />);
            await flushEffects();
        });

        await waitForLoadingToFinish(container);

        const heading = container.querySelector('h2');
        expect(heading?.textContent).toBe('Statutory Documents');

        const currentStep = container.querySelector('[aria-current="step"]');
        expect(currentStep?.textContent).toBe('1');
    });

    it('resume from lastCompletedStep=2 lands on units step', async () => {
        await act(async () => {
            root.render(
                <CondoWizard
                    communityId={42}
                    communityType="condo_718"
                    initialState={{
                        status: 'in_progress',
                        lastCompletedStep: 2,
                        nextStep: 3,
                        completedAt: null,
                        stepData: {
                            profile: {
                                name: 'Test Condo',
                                addressLine1: '123 Test St',
                                city: 'Miami',
                                state: 'FL',
                                zipCode: '33101',
                                timezone: 'America/New_York',
                            },
                            statutory: {
                                items: [],
                            },
                        },
                    }}
                />,
            );
            await flushEffects();
        });

        const heading = container.querySelector('h2');
        expect(heading?.textContent).toBe('Add Units');

        const currentStep = container.querySelector('[aria-current="step"]');
        expect(currentStep?.textContent).toBe('4'); // 0: statutory, 1: profile, 2: branding, 3: units. 3 is step '4'.
    });

    it('clamps malformed persisted nextStep to the last valid step', async () => {
        await act(async () => {
            root.render(
                <CondoWizard
                    communityId={42}
                    communityType="condo_718"
                    initialState={{
                        status: 'in_progress',
                        lastCompletedStep: 2,
                        nextStep: 99,
                        completedAt: null,
                        stepData: {
                            statutory: { items: [] },
                            profile: {
                                name: 'Clamped Condo',
                                addressLine1: '123 Test St',
                                city: 'Miami',
                                state: 'FL',
                                zipCode: '33101',
                                timezone: 'America/New_York',
                            },
                            units: [{ unitNumber: '101' }],
                        },
                    }}
                />,
            );
            await flushEffects();
        });

        const heading = container.querySelector('h2');
        expect(heading?.textContent).toBe('Add Units');

        const currentStep = container.querySelector('[aria-current="step"]');
        expect(currentStep?.textContent).toBe('4');
    });

    it('skip wizard sends canonical POST action=skip', async () => {
        const fetchMock = createFetchMock();
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(<CondoWizard communityId={42} communityType="condo_718" />);
            await flushEffects();
        });

        await waitForLoadingToFinish(container);

        const buttons = Array.from(container.querySelectorAll('button'));
        const skipWizardButton = buttons.find((button) =>
            button.textContent?.includes('Skip entire setup and go to dashboard'),
        );

        await act(async () => {
            skipWizardButton?.click();
            await flushEffects();
        });

        const skipCall = fetchMock.mock.calls.find(c => {
            const options = c[1] as RequestInit;
            if (options?.method === 'POST' && typeof options.body === 'string') {
                const body = JSON.parse(options.body);
                return body.action === 'skip';
            }
            return false;
        });

        expect(skipCall).toBeDefined();
        if (skipCall) {
            expect(skipCall[0]).toContain('/api/v1/onboarding/condo');
            const postBody = JSON.parse(String(skipCall[1]?.body)) as Record<string, unknown>;
            expect(postBody).toEqual({
                communityId: 42,
                action: 'skip',
            });
        }
    });

    it('back navigation on units step does not call API', async () => {
        const fetchMock = createFetchMock();
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(
                <CondoWizard
                    communityId={42}
                    communityType="condo_718"
                    initialState={{
                        status: 'in_progress',
                        lastCompletedStep: 2,
                        nextStep: 3,
                        completedAt: null,
                        stepData: {
                            statutory: { items: [] },
                            profile: {
                                name: 'Test',
                                addressLine1: '',
                                city: '',
                                state: 'FL',
                                zipCode: '',
                                timezone: '',
                            },
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
        expect(heading?.textContent).toBe('Choose Your Branding');
    });
});
