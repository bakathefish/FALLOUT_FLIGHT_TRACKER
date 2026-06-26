"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS } from "./config";
import type { StateResponse } from "./apiState";

// polls /api/state on the cadence from config. seeded with the server-rendered
// snapshot so the first paint is instant, then it refreshes in the background.
// pauses while the tab is hidden to stay polite to the upstream feed.

export interface FalloutState {
  data: StateResponse | null;
  error: string | null;
  /** epoch ms of the last successful update, or null. */
  lastUpdated: number | null;
  refetch: () => void;
}

export function useFalloutState(
  initial: StateResponse | null = null,
): FalloutState {
  const [data, setData] = useState<StateResponse | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(
    initial ? Date.now() : null,
  );
  const inFlight = useRef<AbortController | null>(null);

  const fetchState = useCallback(async () => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    try {
      const res = await fetch("/api/state", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`state request failed (${res.status})`);
      const json = (await res.json()) as StateResponse;
      setData(json);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("could not reach the live feed. retrying.");
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void fetchState();
      timer = setInterval(() => void fetchState(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      inFlight.current?.abort();
    };
  }, [fetchState]);

  return { data, error, lastUpdated, refetch: () => void fetchState() };
}
