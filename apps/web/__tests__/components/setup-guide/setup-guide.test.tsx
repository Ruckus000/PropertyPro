import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import {
  ContinueSetupBar,
  SetupGuide,
  SetupSlot,
  SetupSlotList,
  firstOpenStepId,
  useSetupDismissed,
  type SetupStep,
} from '@/components/shared/setup-guide';

const STEPS: SetupStep[] = [
  { id: 'folders', label: 'Folders set up', done: true, system: true, heading: 'Your folders are ready' },
  {
    id: 'governing',
    label: 'Governing',
    done: false,
    heading: 'Upload your governing documents',
    countLabel: '0 of 5 posted',
    content: <p>governing slots</p>,
  },
  {
    id: 'money',
    label: 'Money',
    done: false,
    heading: 'Post the money records',
    countLabel: '0 of 2 posted',
    items: [{ label: 'Annual Budget' }, { label: 'Monthly Income & Expense', conditional: true }],
    content: <p>money slots</p>,
  },
  {
    id: 'residents',
    label: 'Residents',
    done: false,
    heading: 'Add residents',
    disabledReason: 'Residents unlock after units',
  },
];

function renderGuide(steps = STEPS) {
  return render(
    <SetupGuide
      eyebrow="Owner portal records"
      title="Post the records owners can see"
      description="Florida asks condo associations with 25 or more units to post these."
      progress={{ done: 0, total: 13, label: 'required posted' }}
      facts={[{ label: 'Owners open them in their portal' }]}
      illustration={<svg aria-hidden="true" />}
      steps={steps}
    />,
  );
}

const rail = () => within(screen.getByRole('navigation', { name: 'Setup steps' }));

describe('firstOpenStepId', () => {
  it('skips system, done and blocked steps', () => {
    expect(firstOpenStepId(STEPS)).toBe('governing');
    expect(firstOpenStepId(STEPS.map((s) => (s.id === 'governing' ? { ...s, done: true } : s)))).toBe('money');
  });

  it('falls back to the first work step when everything is done or blocked', () => {
    expect(firstOpenStepId(STEPS.map((s) => ({ ...s, done: true })))).toBe('governing');
  });
});

describe('SetupGuide', () => {
  it('names the region by its h2 and shows applicable progress as text', () => {
    renderGuide();
    expect(screen.getByRole('region', { name: 'Post the records owners can see' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Post the records owners can see' })).toBeTruthy();
    expect(screen.getByText('0 of 13').closest('li')?.textContent).toContain('required posted');
  });

  it('opens the first actionable step: aria-current, h3, step counter skipping system steps', () => {
    renderGuide();
    const current = rail().getByRole('button', { current: 'step' });
    expect(current.textContent).toContain('Current step:');
    expect(current.textContent).toContain('Governing');
    expect(screen.getByRole('heading', { level: 3, name: 'Upload your governing documents' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 3 · 0 of 5 posted')).toBeTruthy();
    expect(rail().getByRole('button', { name: /Completed:\s*Folders set up/ })).toBeTruthy();
    expect(screen.getByText('governing slots')).toBeTruthy();
  });

  it('opens any step from the rail or its row', () => {
    renderGuide();
    fireEvent.click(rail().getByRole('button', { name: /Money/ }));
    expect(screen.getByRole('heading', { level: 3, name: 'Post the money records' })).toBeTruthy();
    expect(rail().getByRole('button', { current: 'step' }).textContent).toContain('Money');

    const others = within(screen.getByRole('list', { name: 'Other steps' }));
    fireEvent.click(others.getByRole('button', { name: /Governing/ }));
    expect(screen.getByRole('heading', { level: 3, name: 'Upload your governing documents' })).toBeTruthy();
  });

  it('marks conditional chips with a text label, not only a dashed border', () => {
    renderGuide();
    const moneyRow = within(screen.getByRole('list', { name: 'Other steps' })).getByRole('button', { name: /Money/ });
    expect(moneyRow.textContent).toMatch(/Annual Budget.*If it applies:.*Monthly Income & Expense/);
  });

  it('a blocked step stays focusable, says why, and does not open', () => {
    renderGuide();
    const blocked = rail().getByRole('button', { name: /Residents/ });
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    expect(blocked.textContent).toContain('Residents unlock after units');
    fireEvent.click(blocked);
    expect(screen.getByRole('heading', { level: 3, name: 'Upload your governing documents' })).toBeTruthy();
  });
});

describe('SetupSlot', () => {
  it('is a button named "Add file: <record>", described by its tag', () => {
    const onAdd = vi.fn();
    render(
      <SetupSlotList label="Governing records">
        <SetupSlot title="Declaration & Amendments" tag="Required" next onAdd={onAdd} />
      </SetupSlotList>,
    );
    const slot = screen.getByRole('button', { name: 'Add file: Declaration & Amendments' });
    expect(slot.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(slot.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Required · next up',
    );
    fireEvent.click(slot);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('a conditional record gets a second button, "Doesn\'t apply to us"', () => {
    const onNotApplicable = vi.fn();
    render(
      <SetupSlotList label="x">
        <SetupSlot title="Bids received" tag="If it applies" onAdd={vi.fn()} onNotApplicable={onNotApplicable} />
      </SetupSlotList>,
    );
    fireEvent.click(screen.getByRole('button', { name: "Doesn't apply to us: Bids received" }));
    expect(onNotApplicable).toHaveBeenCalledOnce();
  });

  it('a filled slot shows its file and offers no add or not-applicable action', () => {
    render(
      <SetupSlotList label="x">
        <SetupSlot title="Bylaws" filledWith="Bylaws, amended.pdf" onAdd={vi.fn()} onNotApplicable={vi.fn()} />
      </SetupSlotList>,
    );
    expect(screen.getByText('Bylaws, amended.pdf')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ContinueSetupBar', () => {
  it('is an h2-labelled region with an outline continue and a named dismiss', () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ContinueSetupBar done={5} total={13} countLabel="required posted" next="Annual Budget" onContinue={onContinue} onDismiss={onDismiss} />,
    );
    expect(screen.getByRole('region', { name: 'Continue setup' })).toBeTruthy();
    expect(screen.getByText(/required posted · Next: Annual Budget/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide setup for now' }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('useSetupDismissed', () => {
  beforeEach(() => localStorage.clear());

  it('reads, writes and clears a per-surface, per-community key', () => {
    const { result } = renderHook(() => useSetupDismissed('documents', 7));
    expect(result.current.dismissed).toBe(false);
    act(() => result.current.dismiss());
    expect(result.current.dismissed).toBe(true);
    expect(localStorage.getItem('propertypro:setup-dismissed:documents:7')).toBe('true');
    expect(renderHook(() => useSetupDismissed('documents', 8)).result.current.dismissed).toBe(false);
    act(() => result.current.restore());
    expect(localStorage.getItem('propertypro:setup-dismissed:documents:7')).toBeNull();
  });

  it('shows the bar and still dismisses for this view when storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useSetupDismissed('documents', 7));
    expect(result.current.dismissed).toBe(false);
    act(() => result.current.dismiss());
    expect(result.current.dismissed).toBe(true);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
