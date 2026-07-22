'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'propertypro.large-text';

export function useLargeText() {
  const [largeText, setLargeTextState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      setLargeTextState(true);
      document.documentElement.classList.add('large-text');
    }
  }, []);

  const setLargeText = useCallback((enabled: boolean) => {
    setLargeTextState(enabled);
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (enabled) {
      document.documentElement.classList.add('large-text');
    } else {
      document.documentElement.classList.remove('large-text');
    }
  }, []);

  const toggleLargeText = useCallback(() => {
    setLargeText(!largeText);
  }, [largeText, setLargeText]);

  return { largeText, setLargeText, toggleLargeText };
}
