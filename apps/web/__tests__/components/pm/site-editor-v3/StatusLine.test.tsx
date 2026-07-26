/**
 * The save-status line — what it says, and how it is announced.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusLine } from '@/components/pm/site-editor-v3/StatusLine';

// 3:42 PM UTC — injected, so the assertion does not depend on the clock or TZ.
const SAVED_AT = new Date('2026-06-15T15:42:00Z').getTime();

describe('StatusLine', () => {
  it('renders nothing when idle with no prior save', () => {
    const { container } = render(<StatusLine status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces progress politely while saving', () => {
    render(<StatusLine status="saving" />);
    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('Saving…');
    expect(line).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the injected save time once a write lands', () => {
    render(<StatusLine status="saved" lastSavedAt={SAVED_AT} timeZone="UTC" />);
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved · 3:42 PM');
  });

  it('still shows the last save when it returns to idle', () => {
    render(<StatusLine status="idle" lastSavedAt={SAVED_AT} timeZone="UTC" />);
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved · 3:42 PM');
  });

  it('announces a failure assertively and offers a retry', async () => {
    const onRetry = vi.fn();
    render(
      <StatusLine status="error" error={new Error('network down')} onRetry={onRetry} />,
    );

    // role="alert" (assertive): unsaved work should not wait for a typing pause.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('network down');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain-language message when the error has none', () => {
    render(<StatusLine status="error" error={new Error('')} />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't save your changes.");
  });

  it('omits the retry affordance when there is nothing to retry with', () => {
    render(<StatusLine status="error" error={new Error('network down')} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
