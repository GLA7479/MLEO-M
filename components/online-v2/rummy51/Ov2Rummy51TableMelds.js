"use client";

import { useMemo } from "react";
import { deserializeCard, getCardDisplayLabel } from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";

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
      <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-3 text-center text-[11px] text-zinc-500">
        No melds on table yet.
      </div>
    );
  }

  return (
    <div className="flex max-h-[min(28vh,220px)] min-h-0 flex-col gap-1.5 overflow-y-auto rounded-lg border border-teal-500/20 bg-teal-950/15 p-2 [scrollbar-width:thin]">
      <p className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-teal-200/85">Table melds</p>
      <div className="flex flex-col gap-2">
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
                "flex w-full flex-col gap-1 rounded-md border px-2 py-1.5 text-left transition",
                isRun ? "border-sky-500/35 bg-sky-950/25" : "border-amber-500/35 bg-amber-950/20",
                isTarget ? "ring-2 ring-fuchsia-400/70" : "",
                disabled ? "opacity-50" : "hover:brightness-110",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-bold uppercase text-zinc-400">{isRun ? "Run" : m.kind === "set" ? "Set" : "Meld"}</span>
                {isTarget ? <span className="text-[8px] font-bold text-fuchsia-200">add target</span> : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {m.cards.map(c => {
                  const red = c.suit === "H" || c.suit === "D";
                  return (
                    <span
                      key={c.id}
                      className={`rounded border border-white/15 bg-black/35 px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                        red && !c.isJoker ? "text-rose-200" : "text-zinc-100"
                      } ${c.isJoker ? "text-amber-200" : ""}`}
                    >
                      {getCardDisplayLabel(c)}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
