import { useCallback, useEffect, useState } from "react";

/**
 * useLocalStorage
 *
 * Reusable localStorage-backed state (SSR-safe).
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write failures (e.g. storage disabled)
    }
  }, [key, value]);

  const setStoredValue = useCallback(
    (next: T) => {
      setValue(next);
    },
    []
  );

  return [value, setStoredValue];
}

