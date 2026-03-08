/**
 * Resolves the `returnTo` query parameter to a safe internal path.
 *
 * Prevents open redirect attacks by requiring the value to start with `/`
 * but not `//` (which would be treated as a protocol-relative URL).
 * Defaults to `/dashboard` when tenant context is available, otherwise
 * `/select-community`.
 */
export function resolveReturnTo(
  value: string | string[] | undefined,
  hasTenantContext: boolean = false,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return hasTenantContext ? '/dashboard' : '/select-community';
}
