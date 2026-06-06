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
 *
 * Two deliberate limitations of this generic approach (acceptable — the harness
 * asserts a request is *rejected*, not which field caused it):
 *   1. The probe sets one field to `bad` and omits the rest; if a *sibling*
 *      required field is missing, `rejects(schema, obj)` may be true for that
 *      reason rather than the target field's own constraint. The (a) test still
 *      gets a real 400; it just doesn't attribute the failure to one field.
 *   2. A `z.object(...).refine(...)` is a `ZodEffects`, not a `ZodObject`, so it
 *      classifies as permissive here. No current query/params contract is a
 *      refined object (refines live on bodies — covered by the whole-schema
 *      JSON-candidate loop in `synthesizeRejected` — or on individual fields).
 *      If a refined query/params contract is ever added it will show up as an
 *      extra `input-permissive` in the coverage report; unwrap ZodEffects here
 *      at that point.
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
  if (rejects(schema, {})) return { ok: true, value: {} }; // a required field is missing
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
    // Reached only for non-object body schemas that accept all of
    // JSON_CANDIDATES (e.g. `z.unknown()`/`z.any()` bodies → classified
    // permissive; or a hypothetical z.union/z.intersection). `null`
    // (JSON_CANDIDATES[0]) already rejects every z.object body above, so the
    // common path never reaches here.
    return objectFieldLevel(schema, JSON_CANDIDATES);
  }
  // query / params: the schema always receives an object of strings. Only
  // string-valued / missing fields are reachable. params behaves identically to
  // query at the runner level (both deliver strings), so they share this path.
  return objectFieldLevel(schema, STRING_CANDIDATES);
}
