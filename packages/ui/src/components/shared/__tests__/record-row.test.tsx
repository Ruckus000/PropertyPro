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
  it('hides the lead from assistive tech because the meta line says the status', () => {
    render(<RecordList><RecordRow lead={<StatusGlyph kind="attention" label="Urgent" hideLabel />} title="T" statusWord="Urgent" /></RecordList>);
    const hidden = screen.getAllByText('Urgent').filter((el) => el.closest('[aria-hidden="true"]') !== null);
    const announced = screen.getAllByText('Urgent').filter((el) => el.closest('[aria-hidden="true"]') === null);
    expect(hidden).toHaveLength(1);
    expect(announced).toHaveLength(1);
  });
  it('drops empty meta entries so no stray separator appears', () => {
    render(<RecordList><RecordRow lead={null} title="T" statusWord="Info" meta={['', 'Nov 12', '']} /></RecordList>);
    expect(screen.getByText('Info · Nov 12')).toBeVisible();
  });
  it('is a cq container so the cq-sm variant resolves', () => {
    const { container } = render(<RecordList><RecordRow lead={null} title="T" statusWord="Info" /></RecordList>);
    expect(container.querySelector('li')).toHaveClass('cq');
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
