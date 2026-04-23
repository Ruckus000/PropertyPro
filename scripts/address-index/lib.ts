export interface NadRow {
  [column: string]: string | undefined;
}

export interface CompactAddressRecord {
  a: string;
  c: string;
  s: string;
  z: string;
  o: string;
  n: string;
  h: string;
}

export interface ShardPlan {
  shardIds: string[];
  shardFiles: Record<string, CompactAddressRecord[]>;
}

const DEFAULT_PREFIX_LENGTH = 3;
const DEFAULT_HOUSE_DIGIT_BUCKET = 'x';

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

export function mapCsvRow(columns: string[], line: string): NadRow {
  const values = parseCsvLine(line);
  const row: NadRow = {};

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (!column) {
      continue;
    }

    row[column.replace(/^\ufeff/, '')] = values[index]?.trim() ?? '';
  }

  return row;
}

export function normalizeCounty(county: string): string {
  return county.trim().replace(/\s+county$/i, '').trim();
}

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

function valueOrFallback(row: NadRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) {
      return value;
    }
  }
  return '';
}

export function buildAddressLine1(row: NadRow): string {
  const addNumber = valueOrFallback(row, 'AddNo_Full') || compactJoin([
    row.AddNum_Pre,
    row.Add_Number,
    row.AddNum_Suf,
  ]);
  const streetName = valueOrFallback(row, 'StNam_Full') || compactJoin([
    row.St_PreMod,
    row.St_PreDir,
    row.St_PreTyp,
    row.St_PreSep,
    row.St_Name,
    row.St_PosTyp,
    row.St_PosDir,
    row.St_PosMod,
  ]);

  return compactJoin([addNumber, streetName]);
}

export function buildCompactAddressRecord(row: NadRow): CompactAddressRecord | null {
  const addressLine1 = buildAddressLine1(row);
  const city = valueOrFallback(row, 'Post_City', 'Post_Comm', 'Inc_Muni');
  const state = valueOrFallback(row, 'State').toUpperCase();
  const zipCode = valueOrFallback(row, 'Zip_Code', 'ZipCode');
  const county = normalizeCounty(valueOrFallback(row, 'County'));

  if (!addressLine1 || !city || !state || !zipCode || !county) {
    return null;
  }

  const houseNumber = valueOrFallback(row, 'AddNo_Full', 'Add_Number').toLowerCase();
  const normalizedSearch = normalizeSearchText([
    addressLine1,
    city,
    state,
    zipCode,
    county,
  ].join(' '));

  return {
    a: addressLine1,
    c: city,
    s: state,
    z: zipCode,
    o: county,
    n: normalizedSearch,
    h: houseNumber,
  };
}

export function buildRecordDedupeKey(record: CompactAddressRecord): string {
  return `${record.a}|${record.c}|${record.s}|${record.z}|${record.o}`;
}

export function getAddressShardPrefix(
  addressLine1: string,
  prefixLength = DEFAULT_PREFIX_LENGTH,
): string | null {
  const normalized = normalizeSearchText(addressLine1);
  if (!normalized) {
    return null;
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const firstStreetToken = tokens.find((token) => /[a-z]/.test(token) && !/^\d+[a-z]?$/.test(token)) ?? '';

  if (firstStreetToken.length < prefixLength) {
    return null;
  }

  return firstStreetToken.slice(0, prefixLength);
}

export function getHouseDigitBucket(record: CompactAddressRecord): string {
  const leadingDigit = record.h[0] ?? '';
  return /^\d$/.test(leadingDigit) ? leadingDigit : DEFAULT_HOUSE_DIGIT_BUCKET;
}

export function buildShardPlan(
  prefix: string,
  records: CompactAddressRecord[],
  maxShardRecords: number,
): ShardPlan {
  if (records.length <= maxShardRecords) {
    const shardId = `shard-${prefix}`;
    return {
      shardIds: [shardId],
      shardFiles: { [shardId]: records },
    };
  }

  const buckets = new Map<string, CompactAddressRecord[]>();
  for (const record of records) {
    const bucket = getHouseDigitBucket(record);
    const bucketRecords = buckets.get(bucket) ?? [];
    bucketRecords.push(record);
    buckets.set(bucket, bucketRecords);
  }

  const shardIds = [...buckets.keys()]
    .sort()
    .map((bucket) => `shard-${prefix}-${bucket}`);

  return {
    shardIds,
    shardFiles: Object.fromEntries(
      [...buckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([bucket, bucketRecords]) => [`shard-${prefix}-${bucket}`, bucketRecords]),
    ),
  };
}
