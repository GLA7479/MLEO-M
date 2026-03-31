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
      <div className="shrink-0 border-b border-white/5 py-px text-center text-[8px] leading-none text-zinc-500">
        Table · no melds yet
      </div>
    );
  }

  return (
    <div className="flex min-h-0 max-h-[min(30vh,200px)] shrink-0 flex-col gap-1 overflow-y-auto rounded-md border border-teal-500/20 bg-teal-950/10 px-1 py-1 [scrollbar-width:thin] sm:max-h-[min(34vh,260px)]">
      <p className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-teal-200/75">Table</p>
      <div className="flex flex-col gap-1">
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
                "flex w-full flex-col gap-0.5 rounded border px-1 py-0.5 text-left transition",
                isRun ? "border-sky-500/35 bg-sky-950/25" : "border-amber-500/35 bg-amber-950/20",
                isTarget ? "ring-1 ring-fuchsia-400/80" : "",
                disabled ? "opacity-50" : "hover:brightness-110",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[7px] font-bold uppercase text-zinc-400">{isRun ? "Run" : m.kind === "set" ? "Set" : "Meld"}</span>
                {isTarget ? <span className="text-[7px] font-bold text-fuchsia-200">target</span> : null}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {m.cards.map(c => {
                  const red = c.suit === "H" || c.suit === "D";
                  return (
                    <span
                      key={c.id}
                      className={`rounded border border-white/15 bg-black/35 px-1 py-px font-mono text-[9px] font-semibold ${
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
