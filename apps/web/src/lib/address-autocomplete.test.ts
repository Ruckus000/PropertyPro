import { describe, expect, it } from 'vitest';
import {
  parseAddressAutocompleteQuery,
  resolveAddressAutocompleteShardIds,
  searchAddressAutocompleteRecords,
  type AddressAutocompleteManifest,
  type AddressAutocompleteRecord,
} from './address-autocomplete';

const manifest: AddressAutocompleteManifest = {
  version: 1,
  builtAt: '2026-04-21T00:00:00.000Z',
  dataset: {
    name: 'USDOT National Address Database',
    url: 'https://data.transportation.gov/download/fc2s-wawr/application/x-zip-compressed',
    sizeBytes: 8452531826,
  },
  shardPrefixLength: 3,
  minStreetTokenLength: 3,
  maxShardRecords: 5000,
  prefixes: {
    mai: ['shard-mai-1', 'shard-mai-x'],
  },
};

const records: AddressAutocompleteRecord[] = [
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
    a: '999 Main Street',
    c: 'Boca Raton',
    s: 'FL',
    z: '33432',
    o: 'Palm Beach',
    n: '999 main street boca raton fl 33432 palm beach',
    h: '999',
  },
];

describe('address autocomplete query helpers', () => {
  it('parses numeric and street queries', () => {
    expect(parseAddressAutocompleteQuery('123 main')).toEqual({
      normalizedQuery: '123 main',
      normalizedStreet: 'main',
      streetTokens: ['main'],
      addressNumber: '123',
      shardPrefix: 'mai',
    });
  });

  it('parses street-only queries', () => {
    expect(parseAddressAutocompleteQuery('main')).toEqual({
      normalizedQuery: 'main',
      normalizedStreet: 'main',
      streetTokens: ['main'],
      addressNumber: null,
      shardPrefix: 'mai',
    });
  });

  it('accepts three-letter street tokens like "oak"', () => {
    const parsed = parseAddressAutocompleteQuery('123 oak');
    expect(parsed).not.toBeNull();
    expect(parsed?.shardPrefix).toBe('oak');
  });

  it('narrows oversized shard fetches when a leading house-number digit is present', () => {
    const parsed = parseAddressAutocompleteQuery('123 main');
    expect(parsed).not.toBeNull();
    expect(resolveAddressAutocompleteShardIds(manifest, parsed!)).toEqual([
      'shard-mai-1',
      'shard-mai-x',
    ]);
  });

  it('returns no shard ids when the manifest has no matching prefix', () => {
    const parsed = parseAddressAutocompleteQuery('ocean');
    expect(parsed).not.toBeNull();
    expect(resolveAddressAutocompleteShardIds(manifest, parsed!)).toEqual([]);
  });

  it('prefers exact house-number matches when searching record sets', () => {
    const parsed = parseAddressAutocompleteQuery('123 main');
    expect(parsed).not.toBeNull();

    const suggestions = searchAddressAutocompleteRecords(records, parsed!, 2);
    expect(suggestions[0]?.addressLine1).toBe('123 Main Street');
  });
});
