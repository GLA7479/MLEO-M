"use client";

import { createContext, useContext } from "react";

/** @type {import("react").Context<null | Record<string, unknown>>} */
const Ov2UiPreviewContext = createContext(null);

/**
 * When set, OV2 session hooks return the provided mock object instead of calling Supabase.
 * Used only by `/online-v2/game-ui-previews` (temporary UI review).
 * @param {{ children: import("react").ReactNode, mocks: Record<string, unknown> | null }} props
 */
export function Ov2UiPreviewProvider({ children, mocks }) {
  return <Ov2UiPreviewContext.Provider value={mocks}>{children}</Ov2UiPreviewContext.Provider>;
}

/**
 * @param {string} slot — e.g. "dominoes", "goalduel"
 * @returns {unknown | null}
 */
export function useOv2UiPreviewOptional(slot) {
  const m = useContext(Ov2UiPreviewContext);
  if (!m || typeof m !== "object" || !slot) return null;
  return /** @type {unknown} */ (m[slot] ?? null);
}
