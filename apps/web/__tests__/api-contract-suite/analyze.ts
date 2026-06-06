import { z, type AnyRouteContract } from '@propertypro/api-contract';
import { synthesizeRejected, type InputLocation } from './malformed-input';
import { checkRbac, type RbacCheckResult } from './rbac-check';

export interface AnalyzedContract {
  label: string;
  contract: AnyRouteContract;
  input:
    | { kind: 'covered'; location: InputLocation; bad: unknown }
    | { kind: 'input-permissive' }
    | { kind: 'no-input' };
  rbac: RbacCheckResult;
  unknownResponse: boolean;
}

/** Locations the runner actually validates, in parse order. body skipped for GET. */
function validatedLocations(contract: AnyRouteContract): InputLocation[] {
  const r = contract.request as Record<string, unknown>;
  const locs: InputLocation[] = [];
  if (r['params']) locs.push('params');
  if (r['query']) locs.push('query');
  if (r['body'] && contract.method !== 'GET') locs.push('body');
  return locs;
}

function isPermissiveResponse(schema: { safeParse: unknown }): boolean {
  return schema instanceof z.ZodUnknown || schema instanceof z.ZodAny;
}

export function analyzeContract(
  contract: AnyRouteContract,
  exportName: string,
): AnalyzedContract {
  const label = `${contract.method} ${contract.path} (${exportName})`;
  const locations = validatedLocations(contract);

  let input: AnalyzedContract['input'] = { kind: 'no-input' };
  if (locations.length > 0) {
    input = { kind: 'input-permissive' };
    for (const location of locations) {
      const schema = (contract.request as Record<string, z.ZodTypeAny>)[location]!;
      const synth = synthesizeRejected(schema, location);
      if (synth.ok) {
        input = { kind: 'covered', location, bad: synth.value };
        break;
      }
    }
  }

  return {
    label,
    contract,
    input,
    rbac: checkRbac(contract),
    unknownResponse: isPermissiveResponse(contract.response),
  };
}
