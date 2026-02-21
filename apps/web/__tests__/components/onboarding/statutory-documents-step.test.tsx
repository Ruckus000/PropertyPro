import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatutoryDocumentsStep } from '@/components/onboarding/steps/statutory-documents-step';

vi.mock('@/components/documents/document-uploader', () => {
    const R = require('react');
    return {
        DocumentUploader: ({ onUploaded }: { onUploaded?: (document: Record<string, unknown>) => void }) =>
            R.createElement(
                'button',
                {
                    type: 'button',
                    'data-testid': 'mock-upload',
                    onClick: () => onUploaded?.({ id: 123 }),
                },
                'Mock Upload',
            ),
    };
});

async function flushEffects(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('StatutoryDocumentsStep', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('renders required items and allows completion when all are uploaded', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === '/api/v1/compliance' && options?.method === 'POST') {
                return Promise.resolve({ ok: true });
            }
            if (url === '/api/v1/compliance?communityId=1') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        data: [
                            { id: 1, templateKey: '718_articles', title: 'Articles of Incorporation', category: 'Governing Documents', documentId: null },
                            { id: 2, templateKey: '718_bylaws', title: 'Bylaws', category: 'Governing Documents', documentId: null },
                        ],
                    }),
                });
            }
            if (url === '/api/v1/document-categories?communityId=1') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: [{ id: 11, name: 'Governing Documents', slug: 'governing-documents' }] }),
                });
            }

            return Promise.resolve({ ok: false });
        });

        vi.stubGlobal('fetch', fetchMock);

        const onNext = vi.fn();

        await act(async () => {
            root.render(
                <StatutoryDocumentsStep communityId={1} onNext={onNext} />
            );
            await flushEffects();
            // wait for use-compliance-items hook fetch
            await new Promise(resolve => setTimeout(resolve, 50));
            await flushEffects();
        });

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/compliance',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ communityId: 1 }),
            }),
        );

        expect(container.textContent).toContain('Articles of Incorporation');
        expect(container.textContent).toContain('Bylaws');

        const uploadButtons = Array.from(container.querySelectorAll('button[data-testid="mock-upload"]')) as HTMLButtonElement[];
        expect(uploadButtons).toHaveLength(2);

        const buttons = Array.from(container.querySelectorAll('button'));
        const continueBtn = buttons.find((button) => button.textContent?.includes('Skip remaining & Continue'));
        expect(continueBtn).toBeDefined();

        await act(async () => {
            if (uploadButtons[0]) { uploadButtons[0].click(); }
            await flushEffects();
            if (uploadButtons[1]) { uploadButtons[1].click(); }
            await flushEffects();
        });

        // Check if the skip text is removed
        const nextButtons = Array.from(container.querySelectorAll('button'));
        const fullContinueBtn = nextButtons.find((button) => button.textContent === 'Continue');
        expect(fullContinueBtn).toBeDefined();

        await act(async () => {
            fullContinueBtn?.click();
            await flushEffects();
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/document-categories?communityId=1');
        expect(onNext).toHaveBeenCalledWith({
            items: [
                { templateKey: '718_articles', documentId: 123, categoryId: 11 },
                { templateKey: '718_bylaws', documentId: 123, categoryId: 11 },
            ],
        });
    });

    it('allows proceeding with no required items', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === '/api/v1/compliance' && options?.method === 'POST') {
                return Promise.resolve({ ok: true });
            }
            if (url === '/api/v1/compliance?communityId=1' || url === '/api/v1/document-categories?communityId=1') {
                return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
            }

            return Promise.resolve({ ok: false });
        });
        vi.stubGlobal('fetch', fetchMock);

        const onNext = vi.fn();

        await act(async () => {
            root.render(
                <StatutoryDocumentsStep communityId={1} onNext={onNext} />
            );
            await flushEffects();
            await new Promise(resolve => setTimeout(resolve, 50));
            await flushEffects();
        });

        expect(container.textContent).toContain('No statutory documents are required');

        const buttons = Array.from(container.querySelectorAll('button'));
        const continueBtn = buttons.find((button) => button.textContent === 'Continue');

        await act(async () => {
            continueBtn?.click();
            await flushEffects();
        });

        expect(onNext).toHaveBeenCalledWith({ items: [] });
    });

    it('shows explicit 403 message when compliance initialization is forbidden', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === '/api/v1/compliance' && options?.method === 'POST') {
                return Promise.resolve({
                    ok: false,
                    status: 403,
                    json: async () => ({
                        error: { message: 'You are not a member of this community' },
                    }),
                });
            }

            return Promise.resolve({ ok: false, status: 500 });
        });
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(
                <StatutoryDocumentsStep communityId={1} onNext={vi.fn()} />
            );
            await flushEffects();
            await new Promise(resolve => setTimeout(resolve, 50));
            await flushEffects();
        });

        expect(container.textContent).toContain('You are not a member of this community');
    });

    it('falls back to default 403 message when compliance error response body is invalid', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === '/api/v1/compliance' && options?.method === 'POST') {
                return Promise.resolve({
                    ok: false,
                    status: 403,
                    json: async () => {
                        throw new Error('invalid json');
                    },
                });
            }

            return Promise.resolve({ ok: false, status: 500 });
        });
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(
                <StatutoryDocumentsStep communityId={1} onNext={vi.fn()} />
            );
            await flushEffects();
            await new Promise(resolve => setTimeout(resolve, 50));
            await flushEffects();
        });

        expect(container.textContent).toContain('Compliance checklist is only available for condo/HOA communities.');
    });

    it('blocks continue when uploaded documents cannot be mapped to category IDs', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === '/api/v1/compliance' && options?.method === 'POST') {
                return Promise.resolve({ ok: true });
            }
            if (url === '/api/v1/compliance?communityId=1') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        data: [
                            { id: 1, templateKey: '718_articles', title: 'Articles of Incorporation', category: 'Insurance Records', documentId: null },
                        ],
                    }),
                });
            }
            if (url === '/api/v1/document-categories?communityId=1') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: [{ id: 11, name: 'Governing Documents', slug: 'governing-documents' }] }),
                });
            }

            return Promise.resolve({ ok: false });
        });
        vi.stubGlobal('fetch', fetchMock);

        const onNext = vi.fn();

        await act(async () => {
            root.render(
                <StatutoryDocumentsStep communityId={1} onNext={onNext} />
            );
            await flushEffects();
            await new Promise(resolve => setTimeout(resolve, 50));
            await flushEffects();
        });

        const uploadButton = container.querySelector('button[data-testid="mock-upload"]') as HTMLButtonElement | null;
        const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Continue'),
        );

        await act(async () => {
            uploadButton?.click();
            await flushEffects();
            continueButton?.click();
            await flushEffects();
        });

        expect(onNext).not.toHaveBeenCalled();
        expect(container.textContent).toContain('Could not map one or more checklist categories');
    });
});
