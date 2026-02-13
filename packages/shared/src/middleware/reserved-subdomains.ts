export const RESERVED_SUBDOMAINS = [
  'admin',
  'api',
  'www',
  'mobile',
  'pm',
  'app',
  'dashboard',
  'login',
  'signup',
  'legal',
] as const;

const RESERVED_SUBDOMAIN_SET = new Set<string>(RESERVED_SUBDOMAINS);

export function isReservedSubdomain(value: string): boolean {
  return RESERVED_SUBDOMAIN_SET.has(value.toLowerCase());
}
