/**
 * Escapes characters in a string so it can be safely used in a PostgreSQL LIKE pattern.
 * PostgreSQL requires escaping literal %, _, and the escape character itself.
 */
export function escapeLikePattern(input: string): string {
  // We use backslash as the escape character.
  // The replace sequence needs to escape the backslash first, then % and _
  return input.replace(/[\\%_]/g, '\\$&');
}
