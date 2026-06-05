import { z } from '@propertypro/api-contract';

export type InputLocation = 'params' | 'query' | 'body';

export type SynthResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'permissive' };

// query/params reach the schema as NON-EMPTY strings (empty strings are
// collapsed to undefined by the runner, so they're excluded). body is raw JSON.
const STRING_CANDIDATES: readonly unknown[] = [
  '∅invalid∅',
  'not-a-valid-value',
  '-1',
];
const JSON_CANDIDATES: readonly unknown[] = [null, 123, '∅invalid∅', [], true];

function rejects(schema: z.ZodTypeAny, value: unknown): boolean {
  return !schema.safeParse(value).success;
}

/**
 * Find a malformed object the WHOLE schema rejects, using only `candidates` as
 * field values (so the result is reachable through the runner for that
 * location). Falls back to `{}` (missing-required). Returns permissive if the
 * schema accepts every location-legal shape.
 */
function objectFieldLevel(
  schema: z.ZodTypeAny,
  candidates: readonly unknown[],
): SynthResult {
  if (!(schema instanceof z.ZodObject)) return { ok: false, reason: 'permissive' };
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  for (const name of Object.keys(shape)) {
    const field = shape[name]!;
    const bad = candidates.find((c) => rejects(field, c));
    if (bad === undefined) continue; // this field accepts all candidates
    const obj: Record<string, unknown> = { [name]: bad };
    if (rejects(schema, obj)) return { ok: true, value: obj };
  }
  // Only use {} (missing-required) as a fallback when no string-breakable field
  // was found AND every required field truly cannot be broken by any string
  // (including ''). A field that rejects '' is theoretically breakable but just
  // not reachable through STRING_CANDIDATES, so it is still considered
  // permissive-for-our-purposes.
  if (rejects(schema, {})) {
    // Check that at least one required field has NO string that breaks it
    // (including empty string). If a required field rejects '', then it is
    // breakable — just not via our candidate list — so we classify permissive.
    const hasStringBreakableRequired = Object.values(shape).some(
      (field) => rejects(field, ''),
    );
    if (!hasStringBreakableRequired) {
      return { ok: true, value: {} };
    }
  }
  return { ok: false, reason: 'permissive' };
}

export function synthesizeRejected(
  schema: z.ZodTypeAny,
  location: InputLocation,
): SynthResult {
  if (location === 'body') {
    // body raw can be ANY JSON value → whole-value candidates are reachable.
    for (const c of JSON_CANDIDATES) {
      if (rejects(schema, c)) return { ok: true, value: c };
    }
    // Rare: a body schema that accepts every scalar/array. Try field-level.
    return objectFieldLevel(schema, JSON_CANDIDATES);
  }
  // query / params: the schema always receives an object of strings. Only
  // string-valued / missing fields are reachable.
  return objectFieldLevel(schema, STRING_CANDIDATES);
}
