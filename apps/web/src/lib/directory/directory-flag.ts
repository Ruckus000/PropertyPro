/**
 * Directory rollout flag (`directory_v2`, rollout plan phase 1) — deliberately
 * import-free so it can be unit-tested and imported from any server module.
 *
 * `DIRECTORY_V2_COMMUNITIES` is either `all` or a comma-separated list of
 * community ids (the pilot). Unset, empty or malformed means OFF: until the
 * Directory reaches parity the old Units and Residents pages stay the default,
 * and turning the flag off is the rollback.
 */
export function isDirectoryEnabledForCommunity(
  communityId: number,
  raw: string | undefined = process.env.DIRECTORY_V2_COMMUNITIES,
): boolean {
  const value = raw?.trim();
  if (!value) return false;
  if (value === 'all') return true;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .some((part) => Number(part) === communityId);
}
