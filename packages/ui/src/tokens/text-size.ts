/**
 * Text size (large text) — the server-safe half.
 *
 * Large text is ON by default, in apps/web and apps/admin alike. These
 * constants live under `tokens` (no React, no "use client") because the root
 * layouts are Server Components: they render `LARGE_TEXT_CLASS` on `<html>`
 * and inline `LARGE_TEXT_INIT_SCRIPT`, and importing the package's main entry
 * there would also load Radix modules that call `createContext` at import time.
 * The client half is `useLargeText` in `hooks/use-large-text.ts`.
 *
 * How the default reaches the page without a flash:
 * 1. Each root layout server-renders `<html class="large-text">`, so the first
 *    paint is already large, even with JavaScript off.
 * 2. `LARGE_TEXT_INIT_SCRIPT` runs in `<head>` before the body paints and
 *    removes the class only when this browser saved "standard".
 * 3. `useLargeText` reads the class back as the source of truth and writes the
 *    viewer's choice.
 *
 * The storage key is NEW on purpose. The old key (`propertypro.large-text`)
 * held `'false'` for anyone who had ever switched large text off; the product
 * decision (2026-10-25) was to reset everyone to large once, so the old key is
 * ignored and deleted rather than migrated.
 */
export const LARGE_TEXT_CLASS = "large-text";
export const TEXT_SIZE_STORAGE_KEY = "propertypro.text-size";
export const LEGACY_LARGE_TEXT_STORAGE_KEY = "propertypro.large-text";

export type TextSize = "large" | "standard";

/**
 * Inline `<head>` script. Every storage access is inside the try: a browser
 * that blocks storage keeps the server-rendered default.
 */
export const LARGE_TEXT_INIT_SCRIPT =
  `try{var s=window.localStorage;s.removeItem('${LEGACY_LARGE_TEXT_STORAGE_KEY}');` +
  `if(s.getItem('${TEXT_SIZE_STORAGE_KEY}')==='standard')` +
  `document.documentElement.classList.remove('${LARGE_TEXT_CLASS}')}catch(e){}`;
