/**
 * OV2 Bingo — session adapter placeholder.
 * Entire Bingo OV2 surface is **preview-only** until server-owned deck/caller/claims exist.
 * Wire RPC + realtime here later; keep `ov2BingoEngine.js` + card UI unchanged.
 */

export const OV2_BINGO_SESSION_KIND = Object.freeze({
  PREVIEW_ONLY: "preview_only",
});

/**
 * @returns {(typeof OV2_BINGO_SESSION_KIND)[keyof typeof OV2_BINGO_SESSION_KIND]}
 */
export function resolveOv2BingoSessionKind() {
  return OV2_BINGO_SESSION_KIND.PREVIEW_ONLY;
}
