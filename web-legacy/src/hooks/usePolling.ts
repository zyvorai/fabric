// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useRef } from 'react';

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number = 10000,
  enabled: boolean = true
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchFn);
  const mountedRef = useRef(true);

  // Keep fetchFn ref current without triggering re-renders
  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  const doFetch = useCallback(async (showLoading: boolean = false) => {
    if (showLoading) setLoading(true);
    try {
      const result = await fetchRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch and polling interval
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setLoading(false);
      return;
    }

    doFetch(true);

    const id = setInterval(() => doFetch(false), intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [doFetch, intervalMs, enabled]);

  const refresh = useCallback(() => {
    doFetch(true);
  }, [doFetch]);

  return { data, loading, error, refresh };
}
