"use client";

import { useEffect, useState } from "react";

/**
 * Holds a value back until typing stops, so a search box doesn't fire a
 * request per keystroke against the admin list endpoints.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
