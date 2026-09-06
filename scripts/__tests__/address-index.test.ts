import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAddressLine1,
  buildCompactAddressRecord,
  buildRecordDedupeKey,
  buildShardPlan,
  mapCsvRow,
  normalizeCounty,
} from '../address-index/lib';

const fixturePath = path.resolve(
  process.cwd(),
  'scripts/__tests__/fixtures/nad-sample.csv',
);

const [headerLine, ...dataLines] = readFileSync(fixturePath, 'utf8').trim().split('\n');
// `String.split` always yields at least one element, so the header is present.
const columns = headerLine!.split(',').map((column) => column.replace(/^\ufeff/, '').trim());
const rows = dataLines.map((line) => mapCsvRow(columns, line));

describe('address index generator helpers', () => {
  it('builds street addresses from NAD rows', () => {
    expect(buildAddressLine1(rows[0]!)).toBe('1000 Sand Point Avenue');
    expect(buildAddressLine1(rows[1]!)).toBe('123 Main Street');
  });

  it('extracts county, city, state, and zip into compact records', () => {
    expect(buildCompactAddressRecord(rows[1]!)).toEqual({
      a: '123 Main Street',
      c: 'Boca Raton',
      s: 'FL',
      z: '33432',
      o: 'Palm Beach',
      n: '123 main street boca raton fl 33432 palm beach',
      h: '123',
    });
  });

  it('deduplicates records by structured address key', () => {
    const record = buildCompactAddressRecord(rows[1]!);
    const duplicate = buildCompactAddressRecord(rows[1]!);

    expect(record).not.toBeNull();
    expect(buildRecordDedupeKey(record!)).toBe(buildRecordDedupeKey(duplicate!));
  });

  it('splits oversized shards by first house-number digit', () => {
    const first = buildCompactAddressRecord(rows[1]!);
    const second = buildCompactAddressRecord(rows[2]!);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const shardPlan = buildShardPlan('main', [first!, second!], 1);

    expect(shardPlan.shardIds).toEqual(['shard-main-1']);
    expect(shardPlan.shardFiles['shard-main-1']).toHaveLength(2);
  });
});

describe('normalizeCounty', () => {
  it('removes "County" suffix and trims whitespace', () => {
    expect(normalizeCounty('Miami-Dade')).toBe('Miami-Dade');
    expect(normalizeCounty('Palm Beach County')).toBe('Palm Beach');
    expect(normalizeCounty('PALM BEACH COUNTY')).toBe('PALM BEACH');
    expect(normalizeCounty('  Broward  ')).toBe('Broward');
    expect(normalizeCounty('Orange County  ')).toBe('Orange');
    expect(normalizeCounty('County Line')).toBe('County Line');
    expect(normalizeCounty('County')).toBe('County');
  });

  it('handles multiple spaces before "County"', () => {
    expect(normalizeCounty('Miami  County')).toBe('Miami');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(normalizeCounty('')).toBe('');
    expect(normalizeCounty('   ')).toBe('');
    expect(normalizeCounty('\t\n')).toBe('');
  });
});
