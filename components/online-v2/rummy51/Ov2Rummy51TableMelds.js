"use client";

import { useMemo } from "react";
import { deserializeCard } from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";

/**
 * @typedef {import("../../../lib/online-v2/rummy51/ov2Rummy51Engine").Rummy51Card} Rummy51Card
 */

const SUIT_SYM = /** @type {const} */ ({ S: "♠", H: "♥", D: "♦", C: "♣" });
const RANK_CORNER = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** @param {Rummy51Card} card */
function cornerRank(card) {
  if (card.isJoker) return "J";
  return RANK_CORNER[card.rank] ?? "?";
}

/** @param {Rummy51Card} card */
function cornerSuit(card) {
  if (card.isJoker) return "★";
  return card.suit ? SUIT_SYM[card.suit] ?? "" : "";
}

/**
 * Single overlapping mini-card in a table meld (readable rank/suit, not a text pill).
 * @param {{ card: Rummy51Card, overlap: boolean, stackIndex: number }} props
 */
function TableMeldMiniCard({ card, overlap, stackIndex }) {
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div
      style={{ zIndex: stackIndex }}
      className={[
        "relative box-border h-[2.75rem] w-[1.9rem] shrink-0 rounded-md border-[1.5px] border-zinc-800 bg-[#faf7f0] shadow-[0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.92)] sm:h-[2.95rem] sm:w-[2.05rem]",
        overlap ? "-ml-[0.62rem] sm:-ml-[0.72rem]" : "",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none absolute left-0.5 top-0.5 flex flex-col leading-none whitespace-nowrap",
          card.isJoker ? "text-amber-900" : red ? "text-red-700" : "text-neutral-900",
        ].join(" ")}
      >
        <span className="text-[10px] font-extrabold tracking-tight sm:text-[11px]">{cornerRank(card)}</span>
        <span className="text-[12px] font-bold leading-none sm:text-[13px]">{cornerSuit(card)}</span>
      </span>
    </div>
  );
}

/**
 * @param {{
 *   tableMeldsRaw: unknown[],
 *   selectedTargetMeldId: string|null,
 * onSelectTargetMeld: (meldId: string|null) => void,
 * disabled?: boolean,
 * }} props
 */
export default function Ov2Rummy51TableMelds({
  tableMeldsRaw = [],
  selectedTargetMeldId,
  onSelectTargetMeld,
  disabled = false,
}) {
  const melds = useMemo(() => {
    if (!Array.isArray(tableMeldsRaw)) return [];
    return tableMeldsRaw.map((m, idx) => {
      if (!m || typeof m !== "object") return null;
      const o = /** @type {Record<string, unknown>} */ (m);
      const meldId = o.meldId != null ? String(o.meldId) : `meld-${idx}`;
      const kind = o.kind != null ? String(o.kind) : "";
      const cardsRaw = Array.isArray(o.cards) ? o.cards : [];
      const cards = [];
      for (const raw of cardsRaw) {
        try {
          cards.push(deserializeCard(raw));
        } catch {
          /* skip */
        }
      }
      return { meldId, kind, cards };
    }).filter(Boolean);
  }, [tableMeldsRaw]);

  if (!melds.length) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-start justify-center rounded-md border border-teal-500/15 bg-teal-950/10 px-1 py-2 pr-[4rem] pb-24 text-center text-[8px] leading-tight text-zinc-500 sm:pr-[4.25rem] sm:pb-28">
        No melds yet
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-teal-500/20 bg-teal-950/10">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 py-1 pr-[4rem] pb-24 [scrollbar-width:thin] sm:pr-[4.25rem] sm:pb-28">
        <div className="flex flex-wrap content-start items-end gap-x-2 gap-y-1.5">
        {melds.map(m => {
          if (!m) return null;
          const isRun = m.kind === "run";
          const isTarget = selectedTargetMeldId === m.meldId;
          return (
            <button
              key={m.meldId}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTargetMeld(isTarget ? null : m.meldId)}
              className={[
                "inline-flex max-w-full items-end gap-1 rounded-lg border px-1 py-0.5 text-left transition",
                isRun ? "border-sky-500/35 bg-sky-950/25" : "border-amber-500/35 bg-amber-950/20",
                isTarget ? "ring-2 ring-fuchsia-400/70 ring-offset-1 ring-offset-zinc-950" : "",
                disabled ? "opacity-[0.58]" : "hover:brightness-[1.06]",
              ].join(" ")}
            >
              <div className="flex min-w-0 flex-row flex-nowrap items-stretch pr-0.5">
                {m.cards.map((c, i) => (
                  <TableMeldMiniCard key={c.id} card={c} overlap={i > 0} stackIndex={i} />
                ))}
              </div>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
