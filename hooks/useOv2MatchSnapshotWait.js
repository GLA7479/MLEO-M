import { useEffect, useState } from "react";

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Bounded wait when room has an active session but playable snapshot is not ready yet.
 * @param {boolean} roomHasActiveSession
 * @param {boolean} hasSnapshot
 * @param {{ timeoutMs?: number }} [opts]
 */
export function useOv2MatchSnapshotWait(roomHasActiveSession, hasSnapshot, opts = {}) {
  const timeoutMs =
    opts.timeoutMs != null && Number.isFinite(Number(opts.timeoutMs)) ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const pending = Boolean(roomHasActiveSession && !hasSnapshot);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!pending) {
      setTimedOut(false);
      return undefined;
    }
    setTimedOut(false);
    const id = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(id);
  }, [pending, timeoutMs]);

  return {
    matchSnapshotLoading: pending && !timedOut,
    matchSnapshotTimedOut: pending && timedOut,
    matchSnapshotBlocked: pending,
  };
}
