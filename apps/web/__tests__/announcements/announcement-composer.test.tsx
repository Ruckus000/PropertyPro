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

    render(<AnnouncementComposer onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: '  Spring social update  ' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: '  Pool deck repairs start Monday.  ' },
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
