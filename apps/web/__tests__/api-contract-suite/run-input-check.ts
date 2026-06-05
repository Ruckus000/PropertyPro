import { NextRequest } from 'next/server';
import { runRoute, type AnyRouteContract } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import type { InputLocation } from './malformed-input';

export interface InputCheckResult {
  status: number;
  code: string | undefined;
  handlerCalled: boolean;
}

/** Replace `[param]` path segments with a placeholder so the URL is valid. */
function concretePath(path: string): string {
  return path.replace(/\[[^\]]+\]/g, '_');
}

export async function runInputCheck(
  contract: AnyRouteContract,
  location: InputLocation,
  bad: unknown,
): Promise<InputCheckResult> {
  let handlerCalled = false;
  const wrapped = withErrorHandler(
    runRoute(
      contract,
      async () => {
        handlerCalled = true;
        return undefined as never;
      },
      { resolveCommunityId: () => 1 },
    ),
  );

  const url = new URL(`http://localhost${concretePath(contract.path)}`);
  let req: NextRequest;
  let ctx: { params?: Promise<Record<string, string | string[]>> } | undefined;

  if (location === 'query') {
    for (const [k, v] of Object.entries(bad as Record<string, unknown>)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
    req = new NextRequest(url.toString(), { method: contract.method });
  } else if (location === 'body') {
    req = new NextRequest(url.toString(), {
      method: contract.method,
      body: JSON.stringify(bad),
      headers: { 'content-type': 'application/json' },
    });
  } else {
    req = new NextRequest(url.toString(), { method: contract.method });
    ctx = { params: Promise.resolve(bad as Record<string, string | string[]>) };
  }

  const res = await wrapped(req, ctx);
  let code: string | undefined;
  try {
    const json = (await res.json()) as { error?: { code?: string } };
    code = json.error?.code;
  } catch {
    code = undefined;
  }
  return { status: res.status, code, handlerCalled };
}
