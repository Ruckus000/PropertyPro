import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '../../src/app/api/v1');

const MUST_GUARD_ROUTES = [
  'violations/route.ts',
  'violations/[id]/fine/route.ts',
  'violations/[id]/notice/route.ts',
  'violations/[id]/resolve/route.ts',
  'violations/[id]/dismiss/route.ts',
  'arc/route.ts',
  'arc/[id]/decide/route.ts',
  'arc/[id]/review/route.ts',
  'polls/route.ts',
  'elections/[id]/open/route.ts',
  'elections/[id]/close/route.ts',
  'elections/[id]/certify/route.ts',
  'transparency/settings/route.ts',
  'import-residents/route.ts',
] as const;

describe('must-guard mutation routes', () => {
  it.each(MUST_GUARD_ROUTES)(
    '%s invokes the subscription guard immediately after demo grace',
    (route) => {
      const source = fs.readFileSync(path.join(apiRoot, route), 'utf8');

      expect(source).toMatch(
        /import\s*{\s*requireActiveSubscriptionForMutation\s*}\s*from\s*['"]@\/lib\/middleware\/subscription-guard['"]/,
      );
      expect(source).toMatch(
        /await assertNotDemoGrace\(communityId\);\s*await requireActiveSubscriptionForMutation\(communityId\);/,
      );
    },
  );
});
