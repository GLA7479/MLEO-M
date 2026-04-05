import { useCallback, useEffect, useRef } from "react";

/**
 * Coalesce rapid reload triggers (e.g. Supabase postgres_changes on ov2_rooms + ov2_room_members)
 * into one refresh after `delayMs` quiet period.
 *
 * @param {() => void | Promise<void>} fn
 * @param {number} [delayMs]
 */
export function useOv2DebouncedReload(fn, delayMs = 450) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const tRef = useRef(null);

  useEffect(
    () => () => {
      if (tRef.current != null) {
        clearTimeout(tRef.current);
        tRef.current = null;
      }
    },
    []
  );

  return useCallback(() => {
    if (typeof window === "undefined") return;
    if (tRef.current != null) clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => {
      tRef.current = null;
      void fnRef.current();
    }, delayMs);
  }, [delayMs]);
}
