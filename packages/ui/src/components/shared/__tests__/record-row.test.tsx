// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecordList, RecordRow } from '../record-row';
import { StatusGlyph } from '../status-glyph';

describe('RecordRow', () => {
  it('puts the status word first in the meta line', () => {
    render(<RecordList><RecordRow lead={<StatusGlyph kind="attention" label="Urgent" hideLabel />} title="Water shut-off" statusWord="Urgent" meta={['Nov 12, 7:30 AM', 'Text + email']} /></RecordList>);
    expect(screen.getByText('Urgent · Nov 12, 7:30 AM · Text + email')).toBeVisible();
  });
  it('marks an outcome only when something went wrong', () => {
    const { rerender } = render(<RecordList><RecordRow lead={null} title="A" statusWord="Info" outcome="Delivered to all 48" /></RecordList>);
    expect(screen.getByText('Delivered to all 48')).not.toHaveClass('text-status-warning');
    rerender(<RecordList><RecordRow lead={null} title="A" statusWord="Info" outcome="5 not reached" outcomeTone="problem" /></RecordList>);
    expect(screen.getByText('5 not reached')).toHaveClass('text-status-warning');
  });
  it('truncates a long title instead of widening the row', () => {
    render(<RecordList><RecordRow lead={null} title={'x'.repeat(90)} statusWord="Info" /></RecordList>);
    expect(screen.getByText('x'.repeat(90))).toHaveClass('truncate');
  });
});
