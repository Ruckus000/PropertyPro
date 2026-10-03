import { describe, expect, it } from 'vitest';

import {
  AUTH_SHAPE_PROBE_ROW_LIMIT,
  authShapeToStore,
} from '@/lib/services/support-inbox/auth-shape-probe';

/**
 * The probe writes a structural description of the provider's verdict fields
 * onto an otherwise-normal message row. These are the three properties that make
 * that acceptable on the ingest path, plus the privacy contract covered in
 * `normalize.test.ts`.
 */

const SHAPE = { spf: { status: { result: 'string' } }, dkim: 'absent' };

describe('authShapeToStore', () => {
  it('stores nothing when every verdict was readable', async () => {
    // The normalizer leaves `authShape` null in that case, so the probe lands
    // only on rows that still have something unexplained.
    await expect(authShapeToStore(null, async () => 0)).resolves.toBeNull();
  });

  it('does not even count when there is nothing to store', async () => {
    // A query per ingested message, to decide about a probe that cannot be
    // written, would be pure cost on the hot path.
    let counted = 0;
    await authShapeToStore(null, async () => {
      counted += 1;
      return 0;
    });

    expect(counted).toBe(0);
  });

  it('stores the shape while there is room under the cap', async () => {
    await expect(
      authShapeToStore(SHAPE, async () => AUTH_SHAPE_PROBE_ROW_LIMIT - 1),
    ).resolves.toEqual(SHAPE);
  });

  it('retires itself once the cap is reached', async () => {
    // A diagnostic left on the ingest path forever is one nobody remembers to
    // remove. Twenty rows of it have said everything the shape can say.
    await expect(authShapeToStore(SHAPE, async () => AUTH_SHAPE_PROBE_ROW_LIMIT)).resolves.toBeNull();
  });

  it('NEVER propagates an error out of the probe', async () => {
    // The property that matters most. This runs inside the ingest transaction:
    // a throw here rolls the message back, the route answers 429, and the
    // provider parks a real sender's mail for 24-72 hours. A missing diagnostic
    // costs nothing by comparison.
    await expect(
      authShapeToStore(SHAPE, async () => {
        throw new Error('relation does not exist');
      }),
    ).resolves.toBeNull();
  });
});
