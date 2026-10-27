"use client";

import { useCallback, useEffect, useState } from "react";
import { LARGE_TEXT_CLASS, TEXT_SIZE_STORAGE_KEY, type TextSize } from "../tokens/text-size";

/**
 * Read and change this browser's text size. Large is the default; see
 * `tokens/text-size.ts` for how the default is rendered without a flash.
 */
export function useLargeText() {
  // Matches the server-rendered default, so a large-text viewer never sees the
  // switch flick from off to on after hydration.
  const [largeText, setLargeTextState] = useState(true);

  useEffect(() => {
    setLargeTextState(document.documentElement.classList.contains(LARGE_TEXT_CLASS));
  }, []);

  const setLargeText = useCallback((enabled: boolean) => {
    setLargeTextState(enabled);
    document.documentElement.classList.toggle(LARGE_TEXT_CLASS, enabled);
    try {
      const value: TextSize = enabled ? "large" : "standard";
      window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, value);
    } catch {
      // Storage blocked (private mode, policy). The choice still applies to
      // this page; it just will not be remembered.
    }
  }, []);

  const toggleLargeText = useCallback(() => {
    setLargeText(!document.documentElement.classList.contains(LARGE_TEXT_CLASS));
  }, [setLargeText]);

  return { largeText, setLargeText, toggleLargeText };
}
