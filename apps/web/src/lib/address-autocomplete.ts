const ADDRESS_AUTOCOMPLETE_MANIFEST_PATH = '/address-autocomplete/v1/manifest.json';

export interface AddressAutocompleteRecord {
  a: string;
  c: string;
  s: string;
  z: string;
  o: string;
  n: string;
  h: string;
}

export interface AddressAutocompleteSuggestion {
  key: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
}

export interface AddressAutocompleteManifest {
  version: 1;
  builtAt: string;
  dataset: {
    name: string;
    url: string;
    sizeBytes: number | null;
  };
  shardPrefixLength: number;
  minStreetTokenLength: number;
  maxShardRecords: number;
  prefixes: Record<string, string[]>;
}

export interface ParsedAddressAutocompleteQuery {
  normalizedQuery: string;
  normalizedStreet: string;
  streetTokens: string[];
  addressNumber: string | null;
  shardPrefix: string;
}

let manifestPromise: Promise<AddressAutocompleteManifest | null> | null = null;
const shardCache = new Map<string, Promise<AddressAutocompleteRecord[] | null>>();

export function normalizeAddressAutocompleteText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAddressAutocompleteQuery(
  query: string,
  minStreetTokenLength = 3,
): ParsedAddressAutocompleteQuery | null {
  const normalizedQuery = normalizeAddressAutocompleteText(query);
  if (!normalizedQuery) {
    return null;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const firstToken = tokens[0] ?? null;
  const addressNumber = firstToken && /^\d+[a-z]?$/.test(firstToken) ? firstToken : null;
  const streetTokens = (addressNumber ? tokens.slice(1) : tokens).filter((token) => /[a-z]/.test(token));

  if (streetTokens.length === 0) {
    return null;
  }

  const firstStreetToken = streetTokens[0] ?? '';
  if (firstStreetToken.length < minStreetTokenLength) {
    return null;
  }

  return {
    normalizedQuery,
    normalizedStreet: streetTokens.join(' '),
    streetTokens,
    addressNumber,
    shardPrefix: firstStreetToken.slice(0, minStreetTokenLength),
  };
}

export function resolveAddressAutocompleteShardIds(
  manifest: AddressAutocompleteManifest,
  parsedQuery: ParsedAddressAutocompleteQuery,
): string[] {
  const shardIds = manifest.prefixes[parsedQuery.shardPrefix] ?? [];
  if (shardIds.length <= 1) {
    return shardIds;
  }

  const leadingDigit = parsedQuery.addressNumber?.[0] ?? '';
  if (!/^\d$/.test(leadingDigit)) {
    return shardIds;
  }

  const digitShard = `shard-${parsedQuery.shardPrefix}-${leadingDigit}`;
  const fallbackShard = `shard-${parsedQuery.shardPrefix}-x`;
  return shardIds.filter((shardId) => shardId === digitShard || shardId === fallbackShard);
}

function scoreAddressAutocompleteRecord(
  record: AddressAutocompleteRecord,
  parsedQuery: ParsedAddressAutocompleteQuery,
): number {
  let score = 0;
  const normalizedAddress = normalizeAddressAutocompleteText(record.a);

  if (parsedQuery.addressNumber) {
    if (record.h === parsedQuery.addressNumber) {
      score += 120;
    } else if (record.h.startsWith(parsedQuery.addressNumber)) {
      score += 80;
    } else {
      return Number.NEGATIVE_INFINITY;
    }
  }

  if (normalizedAddress.startsWith(parsedQuery.normalizedQuery)) {
    score += 70;
  } else if (record.n.startsWith(parsedQuery.normalizedQuery)) {
    score += 55;
  } else if (normalizedAddress.startsWith(parsedQuery.normalizedStreet)) {
    score += 45;
  }

  if (record.n.includes(parsedQuery.normalizedStreet)) {
    score += 20;
  }

  return score;
}

export function searchAddressAutocompleteRecords(
  records: AddressAutocompleteRecord[],
  parsedQuery: ParsedAddressAutocompleteQuery,
  limit = 8,
): AddressAutocompleteSuggestion[] {
  const matches = records
    .filter((record) => parsedQuery.streetTokens.every((token) => record.n.includes(token)))
    .map((record) => ({
      score: scoreAddressAutocompleteRecord(record, parsedQuery),
      record,
    }))
    .filter((match) => Number.isFinite(match.score))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.record.a.localeCompare(right.record.a);
    });

  const suggestions: AddressAutocompleteSuggestion[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const suggestion: AddressAutocompleteSuggestion = {
      key: `${match.record.a}|${match.record.c}|${match.record.s}|${match.record.z}|${match.record.o}`,
      addressLine1: match.record.a,
      city: match.record.c,
      state: match.record.s,
      zipCode: match.record.z,
      county: match.record.o,
    };

    if (seen.has(suggestion.key)) {
      continue;
    }

    suggestions.push(suggestion);
    seen.add(suggestion.key);

    if (suggestions.length >= limit) {
      break;
    }
  }

  return suggestions;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

export async function loadAddressAutocompleteManifest(): Promise<AddressAutocompleteManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetchJson<AddressAutocompleteManifest>(ADDRESS_AUTOCOMPLETE_MANIFEST_PATH);
  }
  return manifestPromise;
}

export async function loadAddressAutocompleteShard(
  shardId: string,
): Promise<AddressAutocompleteRecord[] | null> {
  const cached = shardCache.get(shardId);
  if (cached) {
    return cached;
  }

  const promise = fetchJson<AddressAutocompleteRecord[]>(
    `/address-autocomplete/v1/${shardId}.json`,
  );
  shardCache.set(shardId, promise);
  return promise;
}

export async function loadAddressAutocompleteSuggestions(
  query: string,
  limit = 8,
): Promise<AddressAutocompleteSuggestion[]> {
  const manifest = await loadAddressAutocompleteManifest();
  if (!manifest || Object.keys(manifest.prefixes ?? {}).length === 0) {
    return loadAddressAutocompleteNetworkFallback(query, limit);
  }

  const parsedQuery = parseAddressAutocompleteQuery(query, manifest.minStreetTokenLength);
  if (!parsedQuery) {
    return [];
  }

  const shardIds = resolveAddressAutocompleteShardIds(manifest, parsedQuery);
  if (shardIds.length === 0) {
    return [];
  }

  const shardResults = await Promise.all(shardIds.map((shardId) => loadAddressAutocompleteShard(shardId)));
  const records = shardResults.flatMap((shard) => shard ?? []);
  const localSuggestions = searchAddressAutocompleteRecords(records, parsedQuery, limit);
  if (localSuggestions.length > 0) {
    return localSuggestions;
  }

  return loadAddressAutocompleteNetworkFallback(query, limit);
}

async function loadAddressAutocompleteNetworkFallback(
  query: string,
  limit: number,
): Promise<AddressAutocompleteSuggestion[]> {
  const normalizedQuery = normalizeAddressAutocompleteText(query);
  if (normalizedQuery.length < 3) {
    return [];
  }

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`/api/v1/address/autocomplete?${params.toString()}`);
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { data?: AddressAutocompleteSuggestion[] };
  return payload.data ?? [];
}

export function resetAddressAutocompleteCaches(): void {
  manifestPromise = null;
  shardCache.clear();
}
