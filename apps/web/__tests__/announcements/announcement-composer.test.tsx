import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnouncementComposer } from '../../src/components/announcements/announcement-composer';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('AnnouncementComposer', () => {
  it('submits trimmed values from the shared form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    // The body field is now a TipTap editor loaded via next/dynamic, which
    // doesn't render synchronously in the unit test environment. Seed the
    // body via initialValues and verify the form's trim + submit contract.
    // End-to-end editor interaction is exercised via preview-tools.
    render(
      <AnnouncementComposer
        onSubmit={onSubmit}
        initialValues={{
          title: '',
          body: '  Pool deck repairs start Monday.  ',
          audience: 'all',
          isPinned: false,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: '  Spring social update  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Spring social update',
        body: 'Pool deck repairs start Monday.',
        audience: 'all',
        isPinned: false,
      });
    });
  });

  it('shows a validation message when required fields are blank', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AnnouncementComposer onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
