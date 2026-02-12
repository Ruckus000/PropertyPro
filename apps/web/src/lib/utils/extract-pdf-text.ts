/**
 * PDF text extraction utility.
 *
 * Primary path uses a lightweight fallback parser and only attempts pdf-parse
 * as a secondary option when needed.
 *
 * Notes:
 * - This runs outside of HTTP handlers to avoid blocking responses.
 * - Keep memory usage in mind: callers should avoid holding very large files
 *   in memory on the critical path. Offload to background work.
 */

/** Try runtime-resolved import of pdf-parse when available. */
async function tryPdfParse(buffer: Uint8Array): Promise<string | null> {
  try {
    const moduleName = "pdf-parse";
    const mod = await import(/* webpackIgnore: true */ moduleName);
    const parser = (mod as { default?: unknown }).default;
    if (typeof parser !== "function") return null;

    const result = await (parser as (b: Uint8Array) => Promise<{ text?: unknown }>)(buffer);
    if (result && typeof result.text === "string") {
      return result.text;
    }
    return "";
  } catch {
    return null;
  }
}

function looksLikePdf(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 5 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d // -
  );
}

/**
 * Minimal fallback parser to extract visible text from a simple PDF.
 *
 * This is NOT a full PDF parser. It scans for strings inside parentheses
 * that are used by Tj/TJ operators and concatenates them. Suitable for unit
 * tests with simple fixtures and as a graceful fallback.
 */
function fallbackParse(buffer: Uint8Array): string {
  // Convert to latin-1 string to preserve byte values without UTF-8 decoding errors
  let text = "";
  try {
    const content = Array.from(buffer)
      .map((b) => String.fromCharCode(b))
      .join("");

    // Match (text)Tj or [(t1)(t2)...]TJ patterns
    const singleTj = /\((?:\\\)|\\\\|[^)])*\)\s*Tj/g; // ( ... ) Tj
    const arrayTj = /\[(?:\s*\((?:\\\)|\\\\|[^)])*\)\s*\d*\s*)+\]\s*TJ/g; // [ (..).. ] TJ

    const parts: string[] = [];

    const extractParenthetical = (segment: string) => {
      const inner = segment.match(/\((?:\\\)|\\\\|[^)])*\)/g) ?? [];
      for (const group of inner) {
        // Strip parentheses and unescape \\ and \)
        const raw = group.slice(1, -1).replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
        parts.push(raw);
      }
    };

    const singles = content.match(singleTj) ?? [];
    for (const s of singles) extractParenthetical(s);

    const arrays = content.match(arrayTj) ?? [];
    for (const a of arrays) extractParenthetical(a);

    text = parts.join(" ").trim();
  } catch {
    // noop - return empty string on failure
  }
  return text;
}

export async function extractPdfText(input: ArrayBuffer | Buffer | Uint8Array): Promise<string> {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);

  // Fast path first for simple PDFs used in tests and common uploads.
  const fallback = fallbackParse(buffer);
  if (fallback.length > 0) return fallback;

  // Avoid costly parser attempts on non-PDF inputs.
  if (!looksLikePdf(buffer)) return "";

  // Secondary path: use pdf-parse when present.
  const parsed = await tryPdfParse(buffer);
  if (parsed != null) return parsed.trim();

  return "";
}
