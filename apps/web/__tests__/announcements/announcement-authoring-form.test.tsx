/**
 * Unit tests for AnnouncementAuthoringForm (B5 ADR-003 drain).
 *
 * Post-drain: the network call lives in `useMutateAnnouncement`. These tests
 * mock that hook + `next/navigation` and mock `AnnouncementComposer` down to a
 * pair of buttons that invoke the real `onSubmit` / `onCancel` handlers, so we
 * assert exactly the component's create-vs-update branching, the success
 * id-missing literal, error propagation, the cancel/back path, and the
 * submitting/disabled state.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const refreshMock = vi.fn();
const mutateAsyncMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('@/hooks/use-mutate-announcement', () => ({
  useMutateAnnouncement: () => ({ mutateAsync: mutateAsyncMock }),
}));

interface ComposerProps {
  isSubmitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (data: {
    title: string;
    body: string;
    audience: 'all' | 'owners_only' | 'board_only' | 'tenants_only';
    isPinned: boolean;
  }) => Promise<void>;
}

const SUBMIT_VALUES = {
  title: 'Pool closed',
  body: '<p>Maintenance</p>',
  audience: 'all' as const,
  isPinned: false,
};

vi.mock('@/components/announcements/announcement-composer', async () => {
  const { createElement } = await import('react');
  return {
    AnnouncementComposer: (props: ComposerProps) =>
      createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'composer-submit',
            disabled: props.isSubmitting,
            onClick: () => {
              // Swallow the handler's rethrow exactly as the real composer's
              // form does (it surfaces it via form error state, not an uncaught
              // rejection). The component's throw behavior is unchanged.
              props.onSubmit(SUBMIT_VALUES).catch(() => {});
            },
          },
          props.submitLabel,
        ),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'composer-cancel',
            onClick: props.onCancel,
          },
          'Cancel',
        ),
      ),
  };
});

import { AnnouncementAuthoringForm } from '../../src/components/announcements/announcement-authoring-form';

describe('AnnouncementAuthoringForm', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    mutateAsyncMock.mockReset();
  });

  it('create: submits values, pushes to the new announcement, and refreshes', async () => {
    mutateAsyncMock.mockResolvedValue({ data: { id: 42 } });

    render(<AnnouncementAuthoringForm communityId={7} />);

    expect(screen.getByTestId('composer-submit').textContent).toBe('Publish announcement');
    screen.getByTestId('composer-submit').click();

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(mutateAsyncMock).toHaveBeenCalledWith({ communityId: 7, ...SUBMIT_VALUES });
    expect(pushMock).toHaveBeenCalledWith('/announcements/42?communityId=7');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('update: sends action/id and pushes to the existing announcement', async () => {
    mutateAsyncMock.mockResolvedValue({ data: { id: 5 } });

    render(
      <AnnouncementAuthoringForm
        communityId={7}
        announcement={{
          id: 5,
          title: 'Old',
          body: 'Old body',
          audience: 'all',
          isPinned: false,
        }}
      />,
    );

    expect(screen.getByTestId('composer-submit').textContent).toBe('Save announcement');
    screen.getByTestId('composer-submit').click();

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      communityId: 7,
      ...SUBMIT_VALUES,
      action: 'update',
      id: 5,
    });
    expect(pushMock).toHaveBeenCalledWith('/announcements/5?communityId=7');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when create succeeds but returns no id (id-missing literal path)', async () => {
    // Component throws 'Announcement saved, but we could not open it.' so the
    // observable effect is: mutation ran, no router push/refresh.
    mutateAsyncMock.mockResolvedValue({ data: {} });

    render(<AnnouncementAuthoringForm communityId={7} />);
    screen.getByTestId('composer-submit').click();

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('does not navigate when the mutation rejects', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('We could not create this announcement.'));

    render(<AnnouncementAuthoringForm communityId={7} />);
    screen.getByTestId('composer-submit').click();

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('cancel (create): pushes back to the announcements list', () => {
    render(<AnnouncementAuthoringForm communityId={7} />);
    screen.getByTestId('composer-cancel').click();
    expect(pushMock).toHaveBeenCalledWith('/announcements?communityId=7');
  });

  it('cancel (edit): pushes back to the existing announcement', () => {
    render(
      <AnnouncementAuthoringForm
        communityId={7}
        announcement={{
          id: 9,
          title: 'T',
          body: 'B',
          audience: 'all',
          isPinned: false,
        }}
      />,
    );
    screen.getByTestId('composer-cancel').click();
    expect(pushMock).toHaveBeenCalledWith('/announcements/9?communityId=7');
  });

  it('disables the submit button while submitting', async () => {
    let resolveMutation: (v: { data: { id: number } }) => void = () => {};
    mutateAsyncMock.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );

    render(<AnnouncementAuthoringForm communityId={7} />);
    const btn = screen.getByTestId('composer-submit') as HTMLButtonElement;
    btn.click();

    await waitFor(() => expect(btn.disabled).toBe(true));

    resolveMutation({ data: { id: 1 } });
    await waitFor(() => expect(btn.disabled).toBe(false));
  });
});
