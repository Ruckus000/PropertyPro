import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UnitSearchCombobox } from '../UnitSearchCombobox';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { searchUnitsMock } = vi.hoisted(() => ({
  searchUnitsMock: vi.fn(),
}));

vi.mock('@/hooks/use-unit-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-unit-search')>();
  return {
    ...actual,
    useUnitSearch: () => searchUnitsMock,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function getSearchInput() {
  return screen.getByPlaceholderText('Type unit label...');
}

function typeQuery(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function flushAndSettle() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('UnitSearchCombobox', () => {
  it('does not search for whitespace-only input', async () => {
    const onChange = vi.fn();
    render(<UnitSearchCombobox communityId={7} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), '   ');
    await flushAndSettle();

    expect(searchUnitsMock).not.toHaveBeenCalled();
  });

  it('debounces search and renders unit metadata', async () => {
    searchUnitsMock.mockResolvedValue([
      { id: 101, label: 'PH-A', building: 'Tower', floor: 12 },
    ]);
    const onChange = vi.fn();
    render(<UnitSearchCombobox communityId={7} value={null} onChange={onChange} />);

    const input = getSearchInput();
    typeQuery(input, 'P');
    typeQuery(input, 'PH');

    expect(searchUnitsMock).not.toHaveBeenCalled();
    await flushAndSettle();

    expect(searchUnitsMock).toHaveBeenCalledTimes(1);
    expect(searchUnitsMock).toHaveBeenCalledWith('PH', expect.any(AbortSignal));
    expect(screen.getByText('PH-A')).toBeTruthy();
    expect(screen.getByText('Tower · Floor 12')).toBeTruthy();
  });

  it('clears loading when a pending search is followed by a below-minimum query', async () => {
    searchUnitsMock.mockReturnValue(new Promise(() => undefined));
    const onChange = vi.fn();
    render(<UnitSearchCombobox communityId={7} value={null} onChange={onChange} />);

    const input = getSearchInput();
    typeQuery(input, 'PH');
    await flushAndSettle();

    expect(screen.getByText('Loading units...')).toBeTruthy();

    typeQuery(input, '   ');
    await flushAndSettle();

    expect(screen.queryByText('Loading units...')).toBeNull();
    expect(searchUnitsMock).toHaveBeenCalledTimes(1);
  });

  it('selects the unit label and closes through onChange', async () => {
    searchUnitsMock.mockResolvedValue([
      { id: 101, label: 'PH-A', building: null, floor: null },
    ]);
    const onChange = vi.fn();
    render(<UnitSearchCombobox communityId={7} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'PH');
    await flushAndSettle();
    fireEvent.click(screen.getByText('PH-A'));

    expect(onChange).toHaveBeenCalledWith('PH-A');
  });

  it('renders the empty state when search fails', async () => {
    searchUnitsMock.mockRejectedValue(new Error('network error'));
    const onChange = vi.fn();
    render(<UnitSearchCombobox communityId={7} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'zz');
    await flushAndSettle();

    expect(screen.getByText('No units found')).toBeTruthy();
  });
});
