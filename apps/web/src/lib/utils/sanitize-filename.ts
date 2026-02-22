/**
 * Sanitizes a raw filename for safe use in storage paths.
 * Strips path separators, replaces non-safe characters, enforces max length.
 */
export function sanitizeFilename(raw: string): string {
  // Remove path separators first (path traversal prevention)
  const stripped = raw.replace(/[/\\]/g, '');
  // Replace non-safe chars with underscore
  const safe = stripped.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Preserve extension, cap name at 80 chars + ext at 10 chars
  const dotIdx = safe.lastIndexOf('.');
  // dotIdx > 0 (not >= 0) intentionally skips leading-dot filenames (e.g. ".gitignore"),
  // treating them as extension-less names capped at 80 chars.
  if (dotIdx > 0) {
    return `${safe.slice(0, dotIdx).slice(0, 80)}${safe.slice(dotIdx).slice(0, 10)}`;
  }
  return safe.slice(0, 80);
}
