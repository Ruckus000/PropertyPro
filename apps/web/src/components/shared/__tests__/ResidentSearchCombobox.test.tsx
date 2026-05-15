import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ResidentSearchCombobox } from '../ResidentSearchCombobox';

// cmdk uses ResizeObserver which jsdom doesn't provide
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Radix Popover to always render content inline (no portal/animation/timer)
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { searchResidentsMock } = vi.hoisted(() => ({
  searchResidentsMock: vi.fn(),
}));

vi.mock('@/hooks/use-resident-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-resident-search')>();
  return {
    ...actual,
    useResidentSearch: () => searchResidentsMock,
  };
});

function makeResults(names: string[]) {
  return names.map((n, i) => ({
    id: `user-${i}`,
    title: n,
    subtitle: `unit-${i}@example.com`,
    unitNumber: `10${i}`,
  }));
}

beforeEach(() => {
  searchResidentsMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// The CommandInput renders with role="combobox" in cmdk; select by placeholder
function getSearchInput() {
  return screen.getByPlaceholderText('Type name or unit number...');
}

// Helper: change input value
function typeQuery(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

// Flush debounce timer + await async search to settle
async function flushAndSettle() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('ResidentSearchCombobox', () => {
  it('does not search for a 1-character alpha query', async () => {
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'a');
    await flushAndSettle();

    expect(searchResidentsMock).not.toHaveBeenCalled();
  });

  it('searches for a 2-character alpha query', async () => {
    searchResidentsMock.mockResolvedValue(makeResults(['Jane Smith']));
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'ja');
    await flushAndSettle();

    expect(searchResidentsMock).toHaveBeenCalledTimes(1);
    expect(searchResidentsMock).toHaveBeenCalledWith('ja', expect.any(AbortSignal));
    expect(screen.getByText('Jane Smith')).toBeTruthy();
  });

  it('searches for a 1-character numeric query', async () => {
    searchResidentsMock.mockResolvedValue([]);
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), '1');
    await flushAndSettle();

    expect(searchResidentsMock).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid keypresses to a single request', async () => {
    searchResidentsMock.mockResolvedValue(makeResults(['Jane Smith']));
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    const input = getSearchInput();
    // fire multiple changes in quick succession — debounce timer not yet flushed
    typeQuery(input, 'j');
    typeQuery(input, 'ja');
    typeQuery(input, 'jan');
    typeQuery(input, 'jane');
    typeQuery(input, 'jane s');

    expect(searchResidentsMock).not.toHaveBeenCalled();
    await flushAndSettle();

    expect(searchResidentsMock).toHaveBeenCalledTimes(1);
  });

  it('renders resident subtitles from hook results', async () => {
    searchResidentsMock.mockResolvedValue([
      { id: 'u1', title: 'Jane Smith', subtitle: 'Unit 101', unitNumber: '101' },
    ]);
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'ja');
    await flushAndSettle();

    expect(screen.getByText('Jane Smith')).toBeTruthy();
    expect(screen.getByText('Unit 101')).toBeTruthy();
  });

  it('renders empty state message when no results returned', async () => {
    searchResidentsMock.mockResolvedValue([]);
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'zz');
    await flushAndSettle();

    expect(screen.getByText('No residents found')).toBeTruthy();
  });

  it('clears loading when a pending search is followed by a below-minimum query', async () => {
    searchResidentsMock.mockReturnValue(new Promise(() => undefined));
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    const input = getSearchInput();
    typeQuery(input, 'ja');
    await flushAndSettle();

    expect(screen.getByText('Loading residents...')).toBeTruthy();

    typeQuery(input, 'a');
    await flushAndSettle();

    expect(screen.queryByText('Loading residents...')).toBeNull();
    expect(searchResidentsMock).toHaveBeenCalledTimes(1);
  });

  it('selects the resident id and title', async () => {
    searchResidentsMock.mockResolvedValue([
      { id: 'u1', title: 'Jane Smith', subtitle: 'Unit 101', unitNumber: '101' },
    ]);
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'ja');
    await flushAndSettle();
    fireEvent.click(screen.getByText('Jane Smith'));

    expect(onChange).toHaveBeenCalledWith('u1', 'Jane Smith');
  });

  it('renders empty state when search fails', async () => {
    searchResidentsMock.mockRejectedValue(new Error('network error'));
    const onChange = vi.fn();
    render(<ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />);

    typeQuery(getSearchInput(), 'zz');
    await flushAndSettle();

    expect(screen.getByText('No residents found')).toBeTruthy();
  });
});
