/**
 * Website builder v4, Phase 3 — the four-step tour.
 *
 * Steps point at elements by `data-tour`; a step whose element is missing is
 * skipped. Escape, "Skip tour" and "Start editing" end it. Focus moves to the
 * card and returns afterwards.
 */
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const required = vi.hoisted(() => ({ level: 'required' as 'required' | 'none' }));
vi.mock('@/components/pm/site-editor-v3/required-sections-context', () => ({
  useRequiredSections: () => required,
}));

import { EditorTour } from '@/components/pm/site-editor-v3/guidance/EditorTour';

const onEnd = vi.fn();

function anchors(names: string[]) {
  for (const name of names) {
    const el = document.createElement('div');
    el.dataset.tour = name;
    el.dataset.testAnchor = 'true';
    document.body.appendChild(el);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  required.level = 'required';
});
afterEach(() => {
  document.querySelectorAll('[data-test-anchor]').forEach((el) => el.remove());
});

describe('EditorTour', () => {
  it('walks the four steps and ends on "Start editing"', async () => {
    const user = userEvent.setup();
    anchors(['steps', 'page', 'publish']);
    render(<EditorTour mode="guided" onEnd={onEnd} />);
    expect(screen.getByRole('dialog', { name: 'Follow your next steps' })).toHaveTextContent(
      'Quick tour · 1 of 4',
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Click a section to change it' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('4 of 4');
    await user.click(screen.getByRole('button', { name: 'Start editing' }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('points Free edit at the tools first', () => {
    anchors(['tools', 'page', 'publish']);
    render(<EditorTour mode="free" onEnd={onEnd} />);
    expect(screen.getByRole('dialog', { name: 'Your tools live here' })).toBeInTheDocument();
  });

  it('skips a step whose element is not on screen', () => {
    anchors(['page', 'publish']);
    render(<EditorTour mode="guided" onEnd={onEnd} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Quick tour · 2 of 4');
  });

  it('skips only the missing step under StrictMode, which runs effects twice', () => {
    anchors(['page', 'publish']);
    render(
      <StrictMode>
        <EditorTour mode="guided" onEnd={onEnd} />
      </StrictMode>,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Quick tour · 2 of 4');
  });

  it('ends on Escape and on Skip tour', async () => {
    const user = userEvent.setup();
    anchors(['steps', 'page', 'publish']);
    const { unmount } = render(<EditorTour mode="guided" onEnd={onEnd} />);
    await user.keyboard('{Escape}');
    expect(onEnd).toHaveBeenCalledTimes(1);
    unmount();
    render(<EditorTour mode="guided" onEnd={onEnd} />);
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it('moves focus to the card, and gives it back when the tour ends', () => {
    anchors(['steps', 'page', 'publish']);
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<EditorTour mode="guided" onEnd={onEnd} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('says nothing about Florida for an apartment community', async () => {
    const user = userEvent.setup();
    required.level = 'none';
    anchors(['steps', 'page', 'publish']);
    render(<EditorTour mode="guided" onEnd={onEnd} />);
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/Florida/);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/Florida/);
  });
});
