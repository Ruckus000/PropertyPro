// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusGlyph } from '../status-glyph';

describe('StatusGlyph', () => {
  it('always renders its word', () => {
    render(<StatusGlyph kind="overdue" label="Overdue" />);
    expect(screen.getByText('Overdue')).toBeVisible();
  });
  it('keeps the word for assistive tech when hidden', () => {
    render(<StatusGlyph kind="done" label="Posted" hideLabel />);
    expect(screen.getByText('Posted')).toHaveClass('sr-only');
  });
  it('hides the drawing from assistive tech', () => {
    const { container } = render(<StatusGlyph kind="in-progress" label="In progress" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
  it('requires a label', () => {
    // @ts-expect-error label is required: status is never a glyph alone
    render(<StatusGlyph kind="done" />);
  });
});
