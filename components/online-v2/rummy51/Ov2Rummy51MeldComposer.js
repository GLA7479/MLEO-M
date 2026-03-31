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
 *   compact?: boolean,
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
  compact = false,
}) {
  const hasDraft = draftNewMelds.length > 0 || draftTableAdds.length > 0;

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

  const emptyCompact = compact && !hasDraft;

  if (emptyCompact) {
    return (
      <div className="shrink-0 border-t border-fuchsia-500/15 bg-fuchsia-950/10 px-1 py-0.5">
        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:thin]">
          <span className="shrink-0 text-[8px] font-semibold text-fuchsia-200/65">Tray</span>
          <button
            type="button"
            disabled={disabled || selCount < 3}
            onClick={() => onNewMeldFromSelection()}
            className="shrink-0 rounded border border-white/15 bg-white/5 px-1 py-px text-[8px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            +Meld({selCount})
          </button>
          <button
            type="button"
            disabled={disabled || selCount < 1 || !targetMeldId}
            onClick={() => onAddSelectionToTarget()}
            className="shrink-0 rounded border border-fuchsia-500/30 bg-fuchsia-950/20 px-1 py-px text-[8px] font-semibold text-fuchsia-100 disabled:opacity-40"
          >
            +Tbl
          </button>
          <button
            type="button"
            disabled={disabled || (!draftNewMelds.length && !draftTableAdds.length)}
            onClick={() => onClearDraft()}
            className="shrink-0 rounded border border-red-500/20 px-1 py-px text-[8px] text-red-300/90 disabled:opacity-40"
          >
            Clr
          </button>
          {!hasEverOpened ? (
            <span className="min-w-0 truncate text-[7px] text-zinc-500">
              · Open ≥{RUMMY51_OPEN_TARGET}+run · 3+ cards
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-fuchsia-500/20 bg-fuchsia-950/15 px-1.5 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-fuchsia-200/85">Meld tray</p>
        <div className="flex flex-wrap gap-0.5">
          <button
            type="button"
            disabled={disabled || selCount < 3}
            onClick={() => onNewMeldFromSelection()}
            className="rounded border border-white/20 bg-white/10 px-2 py-1 text-[9px] font-semibold text-zinc-100 disabled:opacity-40"
          >
            New meld ({selCount})
          </button>
          <button
            type="button"
            disabled={disabled || selCount < 1 || !targetMeldId}
            onClick={() => onAddSelectionToTarget()}
            className="rounded border border-fuchsia-500/40 bg-fuchsia-950/30 px-2 py-1 text-[9px] font-semibold text-fuchsia-100 disabled:opacity-40"
          >
            Add to table
          </button>
          <button
            type="button"
            disabled={disabled || (!draftNewMelds.length && !draftTableAdds.length)}
            onClick={() => onClearDraft()}
            className="rounded border border-red-500/30 bg-red-950/25 px-2 py-1 text-[9px] text-red-200 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      {!hasEverOpened ? (
        <div
          className={`rounded border px-1.5 py-1 text-[9px] leading-snug ${
            openingPreview.ok ? "border-emerald-500/35 bg-emerald-950/20 text-emerald-100" : "border-amber-500/35 bg-amber-950/20 text-amber-100"
          }`}
        >
          <div className="font-semibold">{openingPreview.label}</div>
          {openingPreview.sub ? <div className="mt-0.5 text-[8px] text-zinc-400">{openingPreview.sub}</div> : null}
        </div>
      ) : postOpenPreview ? (
        <div
          className={`rounded border px-1.5 py-1 text-[9px] ${
            postOpenPreview.ok ? "border-emerald-500/30 text-emerald-100" : "border-red-500/35 text-red-200"
          }`}
        >
          {postOpenPreview.label}
        </div>
      ) : null}

      {draftNewMelds.length ? (
        <div className="space-y-1">
          <p className="text-[8px] font-bold uppercase text-zinc-500">New melds</p>
          {draftNewMelds.map((meld, i) => {
            const k = classifyMeld(meld);
            return (
              <div key={`dm-${i}`} className="flex items-start justify-between gap-1 rounded border border-white/10 bg-black/30 px-1.5 py-1">
                <div className="min-w-0 flex-1">
                  <span className="text-[8px] text-zinc-500">{k === "invalid" ? "invalid" : k}</span>
                  <div className="flex flex-wrap gap-0.5">
                    {meld.map(c => (
                      <span key={c.id} className="font-mono text-[9px] text-zinc-200">
                        {getCardDisplayLabel(c)}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveDraftMeld(i)}
                  className="shrink-0 text-[9px] text-red-300 disabled:opacity-40"
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
          <p className="text-[8px] font-bold uppercase text-zinc-500">Table adds</p>
          {draftTableAdds.map((row, i) => (
            <div key={`ta-${i}-${row.meldId}`} className="flex items-start justify-between gap-1 rounded border border-fuchsia-500/20 bg-black/30 px-1.5 py-1">
              <div className="min-w-0 text-[9px] text-fuchsia-100">
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
                className="text-[9px] text-red-300 disabled:opacity-40"
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
