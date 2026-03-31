"use client";

import { useOv2BingoSession } from "../../../hooks/useOv2BingoSession";
import Ov2BingoCard from "./Ov2BingoCard";
import Ov2GameStatusStrip from "../shared/Ov2GameStatusStrip";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null }} props
 */
export default function Ov2BingoScreen({ contextInput = null }) {
  const session = useOv2BingoSession(contextInput ?? undefined);
  const { vm, callNextPreviewNumber, onCellClick } = session;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden px-0.5 sm:gap-1.5 sm:px-1">
      <Ov2GameStatusStrip title="Bingo · preview only" subtitle={vm.phaseLine} tone="amber" />
      <p className="shrink-0 text-[9px] leading-tight text-zinc-500 sm:text-[10px]">
        No OV2 bingo match session — seats and caller are not authoritative. “Call (preview)” advances a local shuffled deck
        only.
      </p>
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
        <div className="text-[10px] text-zinc-400">
          Last: <span className="font-mono text-zinc-200">{vm.lastCalled ?? "—"}</span>
          <span className="text-zinc-600"> · </span>
          Deck: {vm.deckRemaining}
        </div>
        <button
          type="button"
          onClick={() => callNextPreviewNumber()}
          disabled={vm.deckRemaining <= 0}
          className="rounded-md border border-amber-500/40 bg-amber-900/40 px-2 py-1 text-[10px] font-semibold text-amber-100 disabled:opacity-40"
        >
          Call (preview)
        </button>
      </div>
      {vm.lastCalled != null ? (
        <div className="flex shrink-0 justify-center">
          <div className="rounded-lg border-2 border-amber-400/50 bg-amber-900/90 px-4 py-1 text-center shadow-lg shadow-amber-950/40">
            <div className="text-2xl font-black text-white">{vm.lastCalled}</div>
            <div className="text-[9px] text-amber-100">Last (preview)</div>
          </div>
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1 overflow-hidden md:grid-cols-2">
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/25 p-1">
          <Ov2BingoCard
            title="Preview card"
            card={vm.card}
            marks={vm.marks}
            calledSet={vm.calledSet}
            onCellClick={onCellClick}
            lastNumber={vm.lastCalled}
          />
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/25 p-2">
          <div className="shrink-0 text-[10px] font-semibold text-zinc-400">Called (preview)</div>
          <div className="mt-1 flex min-h-0 flex-wrap content-start gap-1 overflow-hidden">
            {vm.called.length ? (
              vm.called
                .slice()
                .reverse()
                .map((n, idx) => (
                  <span
                    key={`${n}-${idx}`}
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                      idx === 0 ? "border-amber-400 bg-amber-700/80 text-white" : "border-white/10 bg-white/10"
                    }`}
                  >
                    {n}
                  </span>
                ))
            ) : (
              <span className="text-[10px] text-zinc-500">No numbers yet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
