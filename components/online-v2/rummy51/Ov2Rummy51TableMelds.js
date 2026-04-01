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
function TableMeldMiniCard({ card, overlap, stackIndex, draft }) {
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div
      style={{ zIndex: stackIndex }}
      className={[
        "relative box-border h-[2.75rem] w-[1.9rem] shrink-0 rounded-md border-[1.5px] bg-[#faf7f0] shadow-[0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.92)] sm:h-[2.95rem] sm:w-[2.05rem]",
        draft ? "border-amber-500/55 ring-1 ring-amber-400/35" : "border-zinc-800",
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
 *   onSelectTargetMeld: (meldId: string|null) => void,
 *   disabled?: boolean,
 *   framed?: boolean,
 *   draftNewMelds?: Rummy51Card[][],
 *   draftTableAdds?: { meldId: string, cards: Rummy51Card[] }[],
 * }} props
 */
export default function Ov2Rummy51TableMelds({
  tableMeldsRaw = [],
  selectedTargetMeldId,
  onSelectTargetMeld,
  disabled = false,
  framed = true,
  draftNewMelds = [],
  draftTableAdds = [],
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

  const draftAddsByMeldId = useMemo(() => {
    /** @type {Map<string, Rummy51Card[]>} */
    const m = new Map();
    for (const row of draftTableAdds) {
      if (!row || typeof row.meldId !== "string") continue;
      const id = row.meldId;
      const chunk = Array.isArray(row.cards) ? row.cards : [];
      const prev = m.get(id) ?? [];
      m.set(id, [...prev, ...chunk]);
    }
    return m;
  }, [draftTableAdds]);

  const displayRows = useMemo(() => {
    /** @type {Array<{ type: 'server', meldId: string, kind: string, serverCards: Rummy51Card[], draftCards: Rummy51Card[] } | { type: 'draftNew', meldId: string, kind: string, cards: Rummy51Card[] }>} */
    const rows = [];
    for (const m of melds) {
      if (!m) continue;
      const draftCards = draftAddsByMeldId.get(m.meldId) ?? [];
      rows.push({
        type: "server",
        meldId: m.meldId,
        kind: m.kind,
        serverCards: m.cards,
        draftCards,
      });
    }
    const news = Array.isArray(draftNewMelds) ? draftNewMelds : [];
    news.forEach((cards, i) => {
      if (!Array.isArray(cards) || cards.length === 0) return;
      rows.push({
        type: "draftNew",
        meldId: `__draft_new_${i}`,
        kind: "draft",
        cards,
      });
    });
    return rows;
  }, [melds, draftAddsByMeldId, draftNewMelds]);

  const frame = framed ? "rounded-md border border-teal-500/15 bg-teal-950/10" : "";
  const frameMelds = framed ? "rounded-md border border-teal-500/20 bg-teal-950/10" : "";

  const hasAny = displayRows.length > 0;

  if (!hasAny) {
    return (
      <div
        className={`flex h-full min-h-0 w-full flex-1 items-center justify-center px-1 py-2 text-center text-[8px] leading-tight text-zinc-500 ${frame}`}
      >
        No melds yet
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${frameMelds}`}>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 py-1 [scrollbar-width:thin]">
        <div className="flex flex-wrap content-start items-end gap-x-2 gap-y-1.5">
          {displayRows.map(row => {
            if (row.type === "draftNew") {
              return (
                <div
                  key={row.meldId}
                  className="inline-flex max-w-full flex-col gap-0 rounded-lg border border-dashed border-emerald-400/45 bg-emerald-950/20 px-1 py-0.5"
                >
                  <span className="px-0.5 text-[6px] font-bold uppercase tracking-wide text-emerald-300/90 sm:text-[7px]">Draft</span>
                  <div className="flex min-w-0 flex-row flex-nowrap items-stretch pr-0.5">
                    {row.cards.map((c, i) => (
                      <TableMeldMiniCard key={c.id} card={c} overlap={i > 0} stackIndex={i} draft />
                    ))}
                  </div>
                </div>
              );
            }
            const isRun = row.kind === "run";
            const isTarget = selectedTargetMeldId === row.meldId;
            const hasDraftTail = row.draftCards.length > 0;
            const allCards = [...row.serverCards, ...row.draftCards];
            return (
              <button
                key={row.meldId}
                type="button"
                disabled={disabled}
                onClick={() => onSelectTargetMeld(isTarget ? null : row.meldId)}
                className={[
                  "inline-flex max-w-full items-end gap-1 rounded-lg border px-1 py-0.5 text-left transition",
                  isRun ? "border-sky-500/35 bg-sky-950/25" : "border-amber-500/35 bg-amber-950/20",
                  hasDraftTail && !isTarget ? "ring-1 ring-emerald-400/35" : "",
                  isTarget ? "ring-2 ring-fuchsia-400/70 ring-offset-1 ring-offset-zinc-950" : "",
                  disabled ? "opacity-[0.58]" : "hover:brightness-[1.06]",
                ].join(" ")}
              >
                <div className="flex min-w-0 flex-row flex-nowrap items-stretch pr-0.5">
                  {row.serverCards.map((c, i) => (
                    <TableMeldMiniCard key={c.id} card={c} overlap={i > 0} stackIndex={i} draft={false} />
                  ))}
                  {row.draftCards.map((c, i) => (
                    <TableMeldMiniCard
                      key={c.id}
                      card={c}
                      overlap={row.serverCards.length + i > 0}
                      stackIndex={row.serverCards.length + i}
                      draft
                    />
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
