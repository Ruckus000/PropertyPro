/**
 * Escapes special characters in a string for safe use in SQL LIKE patterns.
 * Prevents `%`, `_`, and `\` from being interpreted as wildcards.
 * Used by resident search for unit number prefix matching.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
