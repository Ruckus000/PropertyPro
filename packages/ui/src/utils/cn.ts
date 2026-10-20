import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * clsx + tailwind-merge — the only implementation. `apps/web/src/lib/utils.ts` and
 * `apps/admin/src/lib/utils/index.ts` re-export it, so app code and the lifted
 * components merge classes identically.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
