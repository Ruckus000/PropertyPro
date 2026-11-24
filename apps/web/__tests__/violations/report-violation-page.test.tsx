import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

const { createViolationMock, uploadMock, pushMock } = vi.hoisted(() => ({
  createViolationMock: vi.fn(),
  uploadMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('@/lib/api/violations', () => ({ createViolation: createViolationMock }));
vi.mock('@/lib/violations/evidence-upload', () => ({ uploadEvidencePhoto: uploadMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/components/violations/ViolationUnitPicker', () => ({
  useViolationUnitOptions: () => ({ units: [{ id: 7 }], loading: false, error: '' }),
  ViolationUnitPicker: (props: {
    id: string;
    label: string;
    value: number | '';
    onChange: (v: number | '') => void;
    error?: string;
  }) => (
    <div>
      <label htmlFor={props.id}>{props.label}</label>
      <select
        id={props.id}
        value={props.value === '' ? '' : String(props.value)}
        onChange={(e) => props.onChange(e.target.value === '' ? '' : Number(e.target.value))}
      >
        <option value="">Select a unit</option>
        <option value="7">Unit 7</option>
      </select>
      {props.error ? <p>{props.error}</p> : null}
    </div>
  ),
}));

import { ReportViolationPage } from '@/components/violations/report-violation-page';

function view(mode: 'resident' | 'resident_no_unit' | 'staff' = 'resident') {
  return render(<ReportViolationPage communityId={1} mode={mode} ownUnitIds={[7]} />);
}

function fillValid(description = 'Loud music after midnight') {
  fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'noise' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Major' }));
  fireEvent.change(screen.getByLabelText(/Description/), { target: { value: description } });
}

beforeEach(() => {
  vi.clearAllMocks();
  createViolationMock.mockResolvedValue({ data: { id: 42 } });
  uploadMock.mockResolvedValue(900);
});

describe('ReportViolationPage', () => {
  it('resident success: creates the report and goes to Mine', async () => {
    view();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(createViolationMock).toHaveBeenCalledWith({
      communityId: 1,
      unitId: 7,
      category: 'noise',
      severity: 'major',
      description: 'Loud music after midnight',
      evidenceDocumentIds: undefined,
    });
    expect(pushMock).toHaveBeenCalledWith('/violations?tab=mine&reported=42&communityId=1');
  });

  it('staff: files from the staff button and lands on the review list', async () => {
    view('staff');
    expect(screen.queryByRole('link', { name: 'See your reports' })).toBeNull();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'File report' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/violations?reported=42&communityId=1'));
  });

  it('residents get a See your reports link', () => {
    view();
    expect(screen.getByRole('link', { name: 'See your reports' })).toHaveAttribute(
      'href',
      '/violations?tab=mine&communityId=1',
    );
  });

  it('validation: an empty submit shows the three field errors and sends nothing', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(await screen.findByText('Please select the unit the report is about')).toBeVisible();
    expect(screen.getByText('Category is required')).toBeVisible();
    expect(screen.getByText('Description is required')).toBeVisible();
    expect(createViolationMock).not.toHaveBeenCalled();
  });

  it('links the description error to its textarea', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    const msg = await screen.findByText('Description is required');
    const area = screen.getByLabelText(/Description/);
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area.getAttribute('aria-describedby')).toBe(msg.id);
    expect(msg.id).not.toBe('');
  });

  it('upload failure: shows the error, keeps the form, does not navigate', async () => {
    uploadMock.mockResolvedValueOnce(900).mockRejectedValueOnce(new Error('Photo two failed'));
    view();
    fillValid('Keep this text');
    const input = screen.getByLabelText(/Photos/);
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ];
    fireEvent.change(input, { target: { files } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Photo two failed');
    expect(pushMock).not.toHaveBeenCalled();
    expect(createViolationMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Description/)).toHaveValue('Keep this text');
  });

  it('double submit: a second click while pending creates one violation', async () => {
    createViolationMock.mockReturnValue(new Promise(() => {}));
    view();
    fillValid();
    const button = screen.getByRole('button', { name: 'Submit report' });
    fireEvent.click(button);
    await waitFor(() => expect(createViolationMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Submitting…' }));
    expect(createViolationMock).toHaveBeenCalledTimes(1);
  });

  it('no unit: shows the first run and no form', () => {
    const { container } = view('resident_no_unit');
    expect(screen.getByRole('heading', { level: 2, name: "You're not linked to a unit yet" })).toBeVisible();
    expect(container.querySelector('form')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard?communityId=1',
    );
  });

  it('has no axe violations in resident mode', async () => {
    const { container } = view();
    expect(await axe(container)).toHaveNoViolations();
  });
});
