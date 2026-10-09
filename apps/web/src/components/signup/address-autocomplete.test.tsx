import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SignupAddressAutocomplete } from './address-autocomplete';
import { resetAddressAutocompleteCaches } from '@/lib/address-autocomplete';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

const manifestResponse = {
  version: 1,
  builtAt: '2026-04-21T00:00:00.000Z',
  dataset: {
    name: 'USDOT National Address Database',
    url: 'https://data.transportation.gov/download/fc2s-wawr/application/x-zip-compressed',
    sizeBytes: 8452531826,
  },
  shardPrefixLength: 4,
  minStreetTokenLength: 4,
  maxShardRecords: 5000,
  prefixes: {
    main: ['shard-main-1'],
  },
};

const shardResponse = [
  {
    a: '123 Main Street',
    c: 'Boca Raton',
    s: 'FL',
    z: '33432',
    o: 'Palm Beach',
    n: '123 main street boca raton fl 33432 palm beach',
    h: '123',
  },
  {
    a: '124 Main Street',
    c: 'Boca Raton',
    s: 'FL',
    z: '33432',
    o: 'Palm Beach',
    n: '124 main street boca raton fl 33432 palm beach',
    h: '124',
  },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function setupFetchSuccess() {
  mockFetch.mockImplementation((input: string) => {
    if (input.endsWith('/manifest.json')) {
      return jsonResponse(manifestResponse);
    }

    if (input.endsWith('/shard-main-1.json')) {
      return jsonResponse(shardResponse);
    }

    return jsonResponse({}, 404);
  });
}

function Harness({ onEnterManually }: { onEnterManually?: () => void } = {}) {
  const [addressLine1, setAddressLine1] = React.useState('');
  const [city, setCity] = React.useState('');
  const [state, setState] = React.useState('');
  const [zipCode, setZipCode] = React.useState('');
  const [county, setCounty] = React.useState('');
  const [selectedSuggestionKey, setSelectedSuggestionKey] = React.useState<string | null>(null);

  return (
    <div>
      <SignupAddressAutocomplete
        inputId="signup-address-line-1"
        value={addressLine1}
        selectedSuggestionKey={selectedSuggestionKey}
        onValueChange={setAddressLine1}
        onSuggestionSelect={(suggestion) => {
          setAddressLine1(suggestion.addressLine1);
          setCity(suggestion.city);
          setState(suggestion.state);
          setZipCode(suggestion.zipCode);
          setCounty(suggestion.county);
        }}
        onSelectedSuggestionChange={setSelectedSuggestionKey}
        onEnterManually={onEnterManually}
      />
      <output data-testid="city">{city}</output>
      <output data-testid="state">{state}</output>
      <output data-testid="zip">{zipCode}</output>
      <output data-testid="county">{county}</output>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  resetAddressAutocompleteCaches();
  setupFetchSuccess();
});

afterEach(() => {
  vi.useRealTimers();
  resetAddressAutocompleteCaches();
});

async function flushAutocomplete() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(260);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SignupAddressAutocomplete', () => {
  it('debounces lookups and reuses cached shard fetches', async () => {
    render(<Harness />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '123 main' } });

    await flushAutocomplete();
    expect(screen.getByText(/123 Main Street/)).not.toBeNull();

    expect(mockFetch).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '123 main' } });

    await flushAutocomplete();
    expect(screen.getByText(/123 Main Street/)).not.toBeNull();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard selection and fills structured fields', async () => {
    render(<Harness />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '123 main' } });

    await flushAutocomplete();
    expect(screen.getByText(/123 Main Street/)).not.toBeNull();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect((input as HTMLInputElement).value).toBe('123 Main Street');
    expect(screen.getByTestId('city').textContent).toContain('Boca Raton');
    expect(screen.getByTestId('state').textContent).toContain('FL');
    expect(screen.getByTestId('zip').textContent).toContain('33432');
    expect(screen.getByTestId('county').textContent).toContain('Palm Beach');
  });

  it('keeps manual entry usable when fetches fail', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));
    render(<Harness />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '123 main' } });

    await flushAutocomplete();

    expect((input as HTMLInputElement).value).toBe('123 main');
    expect(screen.getByText(/Address suggestions are unavailable right now/)).not.toBeNull();
  });

  // The new signup refuses a typed address that was not picked from the list,
  // so "keep typing" sent founders straight into a validation error.
  it('offers manual entry, not "keep typing", when the caller handles it and nothing matches', async () => {
    const onEnterManually = vi.fn();
    render(<Harness onEnterManually={onEnterManually} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2400 ocean drive' } });
    await flushAutocomplete();

    expect(screen.getByText(/No address suggestions found/)).not.toBeNull();
    expect(screen.queryByText(/keep typing/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enter it manually' }));
    expect(onEnterManually).toHaveBeenCalledOnce();
    expect(screen.queryByText(/No address suggestions found/)).toBeNull();
  });

  it('offers manual entry when the index cannot be fetched, too', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));
    render(<Harness onEnterManually={vi.fn()} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '123 main' } });
    await flushAutocomplete();

    expect(screen.getByText(/Address suggestions are unavailable right now/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Enter it manually' })).not.toBeNull();
  });

  it('keeps "keep typing" for a caller that accepts a typed address', async () => {
    render(<Harness />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2400 ocean drive' } });
    await flushAutocomplete();

    expect(screen.getByText(/No address suggestions found\. You can keep typing manually\./)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Enter it manually' })).toBeNull();
  });
});
