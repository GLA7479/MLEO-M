"use client";

import { OV2_BINGO_PLAY_MODE } from "../../../lib/online-v2/bingo/ov2BingoSessionAdapter";
import { useOv2BingoSession } from "../../../hooks/useOv2BingoSession";
import Ov2BingoCard from "./Ov2BingoCard";
import Ov2GameStatusStrip from "../shared/Ov2GameStatusStrip";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null }} props
 */
export default function Ov2BingoScreen({ contextInput = null }) {
  const session = useOv2BingoSession(contextInput ?? undefined);
  const { vm, callNextPreviewNumber, resetPreviewRound, onCellClick } = session;

  const isRoomShell = vm.playMode === OV2_BINGO_PLAY_MODE.ROOM_CONTEXT_NO_MATCH_YET;
  const stripTitle = isRoomShell ? "Bingo · room (preview demo)" : "Bingo · local preview";

  const cardFooter =
    "Marks are preview UI only — not sent to a server. Future OV2 Bingo will validate claims authoritatively.";

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden px-0.5 sm:gap-1 sm:px-1">
      <Ov2GameStatusStrip title={stripTitle} subtitle={vm.phaseLine} tone="amber" />

      {isRoomShell ? (
        <div
          className="shrink-0 rounded-md border border-amber-500/35 bg-amber-950/25 px-2 py-0.5 text-center text-[9px] font-semibold text-amber-100/95 sm:text-[10px]"
          role="status"
        >
          Room context only — no live caller, deck sync, or claim payouts yet. Below is the same local preview as the
          standalone route.
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 rounded-lg border border-white/10 bg-black/30 px-1.5 py-0.5 sm:px-2 sm:py-1">
        <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 text-[10px] text-zinc-400">
          <span>
            Last: <span className="font-mono font-semibold text-zinc-100">{vm.lastCalled ?? "—"}</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span>
            Deck: <span className="text-zinc-200">{vm.deckRemaining}</span> / {vm.deckTotal}
          </span>
          {vm.previewLine.isFull ? (
            <span className="text-emerald-400/90">· Preview: full card</span>
          ) : vm.previewLine.hasAnyRow ? (
            <span className="text-emerald-400/90">· Preview: row</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => resetPreviewRound()}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white sm:py-1"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => callNextPreviewNumber()}
            disabled={vm.deckRemaining <= 0}
            className="rounded-md border border-amber-500/40 bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-100 disabled:opacity-40 sm:py-1"
          >
            Call next
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0.5 overflow-hidden md:grid-cols-5 md:gap-1">
        <div className="flex min-h-0 items-stretch justify-center overflow-hidden rounded-lg border border-white/10 bg-black/25 p-0.5 md:col-span-3 md:p-1">
          <Ov2BingoCard
            title="Preview card (deterministic)"
            card={vm.card}
            marks={vm.marks}
            calledSet={vm.calledSet}
            onCellClick={onCellClick}
            lastNumber={vm.lastCalled}
            footerHint={cardFooter}
          />
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/25 px-1.5 py-1 md:col-span-2 md:px-2">
          <div className="shrink-0 text-[10px] font-semibold text-zinc-400">Called (preview, newest first)</div>
          <div className="mt-1 flex min-h-0 flex-1 flex-nowrap gap-1 overflow-x-auto overflow-y-hidden pb-0.5 [scrollbar-width:thin]">
            {vm.called.length ? (
              vm.called
                .slice()
                .reverse()
                .map((n, idx) => (
                  <span
                    key={`${n}-${vm.called.length - idx}`}
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                      idx === 0 ? "border-amber-400 bg-amber-700/80 text-white" : "border-white/10 bg-white/10 text-zinc-200"
                    }`}
                  >
                    {n}
                  </span>
                ))
            ) : (
              <span className="text-[10px] text-zinc-500">Tap “Call next” to draw from the local deck.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
