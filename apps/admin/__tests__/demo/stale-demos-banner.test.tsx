// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaleDemosBanner } from '@/components/demo/StaleDemosBanner';

describe('StaleDemosBanner', () => {
  it('lists stale demos and asks for confirmation before deleting', () => {
    global.fetch = vi.fn() as any;
    render(
      <StaleDemosBanner
        staleDemos={[
          { id: 5, prospect_name: 'Gulfstream Gardens', template_type: 'condo_718', created_at: '2026-07-01T00:00:00Z' },
        ]}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Gulfstream Gardens');

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders nothing when there are no stale demos', () => {
    const { container } = render(<StaleDemosBanner staleDemos={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('calls the delete endpoint and removes the row once confirmed', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
    const { container } = render(
      <StaleDemosBanner
        staleDemos={[
          { id: 5, prospect_name: 'Gulfstream Gardens', template_type: 'condo_718', created_at: '2026-07-01T00:00:00Z' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /delete demo for gulfstream gardens/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(global.fetch).toHaveBeenCalledWith('/api/admin/demos/5', { method: 'DELETE' });
    // The one stale demo is gone, so the banner unmounts itself.
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
