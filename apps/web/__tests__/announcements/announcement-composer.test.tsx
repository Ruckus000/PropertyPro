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
        // Null, not absent: the composer always states its expiry decision, so
        // a save cannot leave the field ambiguous.
        expiresAt: null,
      });
    });
  });

  it('round-trips an expiry through the local-time input without shifting it', async () => {
    /*
     * The bug this pins is a whole timezone offset. A `datetime-local` input
     * is LOCAL time, so building its value by slicing `toISOString()` — the
     * obvious implementation — shifts every PM outside UTC, which is every
     * Florida association. A notice set to expire at 5pm would vanish at 1pm.
     *
     * Asserted as a round trip rather than against a hardcoded string, so the
     * case is meaningful in whatever zone it runs in (CI is UTC, a developer
     * is not).
     */
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);
    expiry.setSeconds(0, 0);

    render(
      <AnnouncementComposer
        onSubmit={onSubmit}
        initialValues={{
          title: 'Seasonal notice',
          body: 'Pool closes for the season.',
          audience: 'all',
          isPinned: false,
          expiresAt: expiry.toISOString(),
        }}
      />,
    );

    const input = screen.getByLabelText(/stop showing on/i) as HTMLInputElement;
    // The rendered value is the LOCAL wall-clock time, not the UTC one.
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(input.value).toBe(
      `${expiry.getFullYear()}-${pad(expiry.getMonth() + 1)}-${pad(expiry.getDate())}` +
        `T${pad(expiry.getHours())}:${pad(expiry.getMinutes())}`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: expiry.toISOString() }),
      );
    });
  });

  it('warns, without blocking, when the chosen expiry is already past', async () => {
    /*
     * A past expiry is a legitimate "take this down now" action, so it must
     * not be refused — but it is also what a mistyped year looks like, and
     * that would otherwise hide the announcement with no feedback at all.
     */
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <AnnouncementComposer
        onSubmit={onSubmit}
        initialValues={{
          title: 'Old notice',
          body: 'Body.',
          audience: 'all',
          isPinned: false,
          expiresAt: '2020-01-01T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText(/already passed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish announcement' })).toBeEnabled();
  });

  it('shows a validation message when required fields are blank', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AnnouncementComposer onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
