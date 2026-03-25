import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RulesStep } from '../../../../src/components/onboarding/steps/rules-step';

vi.mock('@/components/documents/document-upload-area', () => ({
  DocumentUploadArea: ({ onUploaded }: { onUploaded?: (document: Record<string, unknown>) => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onUploaded?.({ document: { id: 55, filePath: 'documents/rules.pdf' }, warnings: [] }),
      },
      'Mock Upload',
    ),
}));

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('rules step', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('upload success persists documentId/path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 10, name: 'Lease Agreements' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onNext = vi.fn();

    await act(async () => {
      root.render(<RulesStep communityId={42} onNext={onNext} onBack={vi.fn()} />);
      await flushEffects();
    });

    const uploadButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Mock Upload',
    );

    await act(async () => {
      uploadButton?.click();
      await flushEffects();
    });

    const nextButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Next',
    );

    await act(async () => {
      nextButton?.click();
      await flushEffects();
    });

    expect(onNext).toHaveBeenCalledWith({
      documentId: 55,
      path: 'documents/rules.pdf',
    });
  });

  it('skip persists rules null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 10, name: 'Lease Agreements' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onNext = vi.fn();

    await act(async () => {
      root.render(<RulesStep communityId={42} onNext={onNext} onBack={vi.fn()} />);
      await flushEffects();
    });

    const skipButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Skip Step',
    );

    await act(async () => {
      skipButton?.click();
      await flushEffects();
    });

    expect(onNext).toHaveBeenCalledWith(null);
  });
});
