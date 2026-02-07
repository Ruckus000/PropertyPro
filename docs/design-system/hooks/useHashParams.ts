import { useCallback, useEffect, useState } from "react";

export type HashParams = Record<string, string>;
export type HashParamValue = string | null | undefined;
export type HashParamsUpdate = Record<string, HashParamValue>;

function readHashParams(): HashParams {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return Object.fromEntries(new URLSearchParams(hash));
}

/**
 * useHashParams
 *
 * SSR-safe hook for reading/writing URL hash parameters:
 * - `params` updates on `hashchange` (supports back/forward)
 * - `setParam` updates one key
 * - `setParamsMultiple` updates multiple keys at once
 *
 * Example:
 * `#view=compliance&tab=by_category&expanded=financial,meetings`
 */
export function useHashParams() {
  const [params, setParams] = useState<HashParams>(() => readHashParams());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setParams(readHashParams());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const setParam = useCallback((key: string, value: HashParamValue) => {
    if (typeof window === "undefined") return;
    const current = new URLSearchParams(window.location.hash.slice(1));
    if (value === undefined || value === null) current.delete(key);
    else current.set(key, value);
    window.location.hash = current.toString();
  }, []);

  const setParamsMultiple = useCallback((obj: HashParamsUpdate) => {
    if (typeof window === "undefined") return;
    const current = new URLSearchParams(window.location.hash.slice(1));
    Object.entries(obj).forEach(([k, v]) => {
      if (v === undefined || v === null) current.delete(k);
      else current.set(k, v);
    });
    window.location.hash = current.toString();
  }, []);

  return { params, setParam, setParamsMultiple };
}

