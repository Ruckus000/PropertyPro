import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** clsx + tailwind-merge — identical to apps/web/src/lib/utils.ts so lifted components behave the same. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
