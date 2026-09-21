"use client";

import { useEffect } from "react";

/**
 * Next.js Turbopack + React 19 can call performance.measure with a negative
 * duration when a route aborts (redirect/notFound). Swallow only that case.
 */
export function PerformanceMeasureGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const perf = window.performance;
    if (!perf || typeof perf.measure !== "function") return;

    const original = perf.measure.bind(perf);
    const marker = original as typeof original & { __patched?: boolean };
    if (marker.__patched) return;

    const patched = ((...args: Parameters<typeof performance.measure>) => {
      try {
        return original(...args);
      } catch (error) {
        if (
          error instanceof Error &&
          /negative time stamp/i.test(error.message)
        ) {
          return undefined as unknown as PerformanceMeasure;
        }
        throw error;
      }
    }) as typeof performance.measure & { __patched?: boolean };

    patched.__patched = true;
    perf.measure = patched;

    return () => {
      perf.measure = original;
    };
  }, []);

  return null;
}
