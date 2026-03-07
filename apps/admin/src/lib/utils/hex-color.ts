const SIX_DIGIT_HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function isSixDigitHexColor(value: string): boolean {
  return SIX_DIGIT_HEX_COLOR_RE.test(value);
}

export function hasInvalidHexColorValues(values: readonly string[]): boolean {
  return values.some((value) => !isSixDigitHexColor(value));
}
