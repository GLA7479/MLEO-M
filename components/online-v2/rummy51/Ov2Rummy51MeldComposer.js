"use client";

import { useMemo } from "react";
import {
  classifyMeld,
  getCardDisplayLabel,
  isLegalInitialOpen,
  openingContainsRequiredRun,
  RUMMY51_OPEN_TARGET,
  scoreOpeningMelds,
} from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";

/**
 * @typedef {import("../../../lib/online-v2/rummy51/ov2Rummy51Engine").Rummy51Card} Rummy51Card
 */

/**
 * @param {{
 *   hasEverOpened: boolean,
 *   draftNewMelds: Rummy51Card[][],
 *   draftTableAdds: { meldId: string, cards: Rummy51Card[] }[],
 *   selectedIds: Set<string>,
 *   targetMeldId: string|null,
 *   onNewMeldFromSelection: () => void,
 *   onAddSelectionToTarget: () => void,
 *   onRemoveDraftMeld: (index: number) => void,
 *   onRemoveTableAdd: (index: number) => void,
 *   onClearDraft: () => void,
 *   disabled?: boolean,
 * }} props
 */
export default function Ov2Rummy51MeldComposer({
  hasEverOpened,
  draftNewMelds,
  draftTableAdds,
  selectedIds,
  targetMeldId,
  onNewMeldFromSelection,
  onAddSelectionToTarget,
  onRemoveDraftMeld,
  onRemoveTableAdd,
  onClearDraft,
  disabled = false,
}) {
  const openingPreview = useMemo(() => {
    if (hasEverOpened || !draftNewMelds.length) {
      return { label: "—", sub: "", ok: true, openingPts: 0, hasRun: false, legalOpen: true };
    }
    const kinds = draftNewMelds.map(m => classifyMeld(m));
    const anyInvalid = kinds.some(k => k === "invalid");
    const pts = anyInvalid ? 0 : scoreOpeningMelds(draftNewMelds);
    const hasRun = anyInvalid ? false : openingContainsRequiredRun(draftNewMelds);
    const legalOpen = anyInvalid ? false : isLegalInitialOpen(draftNewMelds);
    return {
      label: anyInvalid ? "Invalid meld in draft" : legalOpen ? "Valid opening" : "Opening not ready",
      sub: `${pts}/${RUMMY51_OPEN_TARGET} pts · run: ${hasRun ? "yes" : "no"}`,
      ok: !anyInvalid && legalOpen,
      openingPts: pts,
      hasRun,
      legalOpen,
    };
  }, [hasEverOpened, draftNewMelds]);

  const postOpenPreview = useMemo(() => {
    if (!hasEverOpened || !draftNewMelds.length) return null;
    const bad = draftNewMelds.filter(m => classifyMeld(m) === "invalid");
    return {
      ok: bad.length === 0,
      label: bad.length ? "Invalid new meld" : "New melds OK",
    };
  }, [hasEverOpened, draftNewMelds]);

  const selCount = selectedIds.size;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-950/15 p-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-200/90">Meld composer</p>

      {!hasEverOpened ? (
        <div
          className={`rounded border px-2 py-1.5 text-[10px] leading-snug ${
            openingPreview.ok ? "border-emerald-500/40 bg-emerald-950/25 text-emerald-100" : "border-amber-500/40 bg-amber-950/25 text-amber-100"
          }`}
        >
          <div className="font-semibold">{openingPreview.label}</div>
          <div className="mt-0.5 text-zinc-300">{openingPreview.sub}</div>
        </div>
      ) : postOpenPreview ? (
        <div
          className={`rounded border px-2 py-1.5 text-[10px] ${
            postOpenPreview.ok ? "border-emerald-500/35 text-emerald-100" : "border-red-500/35 text-red-200"
          }`}
        >
          {postOpenPreview.label}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={disabled || selCount < 3}
          onClick={() => onNewMeldFromSelection()}
          className="rounded border border-white/20 bg-white/10 px-2 py-1.5 text-[10px] font-semibold text-zinc-100 disabled:opacity-40"
        >
          New meld ({selCount} sel)
        </button>
        <button
          type="button"
          disabled={disabled || selCount < 1 || !targetMeldId}
          onClick={() => onAddSelectionToTarget()}
          className="rounded border border-fuchsia-500/40 bg-fuchsia-950/30 px-2 py-1.5 text-[10px] font-semibold text-fuchsia-100 disabled:opacity-40"
        >
          Add to table meld
        </button>
        <button
          type="button"
          disabled={disabled || (!draftNewMelds.length && !draftTableAdds.length)}
          onClick={() => onClearDraft()}
          className="rounded border border-red-500/30 bg-red-950/25 px-2 py-1.5 text-[10px] text-red-200 disabled:opacity-40"
        >
          Clear draft
        </button>
      </div>

      {draftNewMelds.length ? (
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase text-zinc-500">New melds (this turn)</p>
          {draftNewMelds.map((meld, i) => {
            const k = classifyMeld(meld);
            return (
              <div key={`dm-${i}`} className="flex items-start justify-between gap-1 rounded border border-white/10 bg-black/30 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] text-zinc-500">{k === "invalid" ? "invalid" : k}</span>
                  <div className="flex flex-wrap gap-0.5">
                    {meld.map(c => (
                      <span key={c.id} className="font-mono text-[10px] text-zinc-200">
                        {getCardDisplayLabel(c)}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveDraftMeld(i)}
                  className="shrink-0 text-[10px] text-red-300 disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {draftTableAdds.length ? (
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase text-zinc-500">Table additions</p>
          {draftTableAdds.map((row, i) => (
            <div key={`ta-${i}-${row.meldId}`} className="flex items-start justify-between gap-1 rounded border border-fuchsia-500/20 bg-black/30 px-2 py-1">
              <div className="min-w-0 text-[10px] text-fuchsia-100">
                → {String(row.meldId).slice(0, 8)}…
                <div className="flex flex-wrap gap-0.5 text-zinc-200">
                  {row.cards.map(c => (
                    <span key={c.id} className="font-mono">
                      {getCardDisplayLabel(c)}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveTableAdd(i)}
                className="text-[10px] text-red-300 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
