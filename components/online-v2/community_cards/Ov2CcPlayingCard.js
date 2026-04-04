"use client";

import { useEffect, useState } from "react";

const SUIT_SYM = { c: "♣", d: "♦", h: "♥", s: "♠" };
const RED_SUITS = new Set(["h", "d"]);

/** Deck of Cards API static PNG names (same as C21 `PlayingCardOv2`). */
function toDeckApiImageCode(code) {
  const s = String(code || "").trim();
  if (s.length < 2) return null;
  let rank;
  let suitKey;
  if (s.length >= 3 && s.toLowerCase().startsWith("10")) {
    rank = "0";
    suitKey = s.slice(2);
  } else {
    rank = s.slice(0, 1).toUpperCase();
    suitKey = s.slice(1);
  }
  if (rank === "T") rank = "0";
  const sm = { h: "H", d: "D", c: "C", s: "S" };
  const sk = String(suitKey || "").toLowerCase();
  const suitChar = sk[0];
  if (!sm[suitChar]) return null;
  return `${rank}${sm[suitChar]}`;
}

function parseCard(code) {
  const s = String(code || "").trim();
  if (s.length < 2) return null;
  const rankRaw = s[0];
  const suitKey = s[1];
  const rank = rankRaw === "T" ? "10" : rankRaw;
  const suit = SUIT_SYM[suitKey] || suitKey;
  const red = RED_SUITS.has(suitKey);
  return { rank, suit, red };
}

const SIZE_WIDTH = {
  sm: "w-[2.125rem] min-w-[2.125rem] sm:w-9 sm:min-w-[2.25rem]",
  md: "w-10 min-w-[2.5rem] sm:w-11 sm:min-w-[2.75rem]",
  lg: "w-[2.7rem] min-w-[2.7rem] sm:w-[3.2rem] sm:min-w-[3.2rem] md:w-[3.35rem] md:min-w-[3.35rem]",
  /** Hero hand on felt — larger on small viewports */
  hero: "w-[3.65rem] min-w-[3.65rem] max-sm:w-[4.15rem] max-sm:min-w-[4.15rem] sm:w-[3.85rem] sm:min-w-[3.85rem] md:w-[4rem] md:min-w-[4rem]",
};

function CardFaceFallback({ rank, suit, red, base }) {
  const suitColor = red ? "text-[#c41e1e]" : "text-[#0f172a]";
  return (
    <div
      className={`${base} bg-[#fafaf8] [box-shadow:inset_0_0_0_1px_rgba(0,0,0,0.05),0_3px_12px_rgba(0,0,0,0.32)]`}
    >
      <div className="absolute left-[3px] top-[3px] flex flex-col items-center leading-none sm:left-1 sm:top-1">
        <span className={`text-[9px] font-extrabold tracking-tighter sm:text-[10px] ${suitColor}`}>{rank}</span>
        <span className={`-mt-px text-[10px] font-semibold leading-none sm:text-[11px] ${suitColor}`}>{suit}</span>
      </div>
      <div className="absolute bottom-[3px] right-[3px] flex rotate-180 flex-col items-center leading-none sm:bottom-1 sm:right-1">
        <span className={`text-[9px] font-extrabold tracking-tighter sm:text-[10px] ${suitColor}`}>{rank}</span>
        <span className={`-mt-px text-[10px] font-semibold leading-none sm:text-[11px] ${suitColor}`}>{suit}</span>
      </div>
    </div>
  );
}

/**
 * Poker-style playing card (5:7). Face uses Deck of Cards API images; back uses local asset; falls back to vector corners.
 * @param {{ code?: string, faceDown?: boolean, size?: "sm"|"md"|"lg"|"hero", className?: string }} props
 */
export default function Ov2CcPlayingCard({ code, faceDown = false, size = "md", className = "" }) {
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    setImgErr(false);
  }, [code, faceDown]);

  const aspect = "aspect-[5/7]";
  const base = [
    "relative",
    aspect,
    SIZE_WIDTH[size],
    "rounded-[4px] sm:rounded-[5px]",
    "border border-black/20",
    "shadow-[0_3px_10px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.35)]",
    "select-none",
    className,
  ].join(" ");

  if (faceDown) {
    return (
      <div className={`${base} overflow-hidden border-[#1e293b] bg-[#152238]`} aria-hidden>
        <img
          src="/card-backs/poker-back.jpg"
          alt=""
          className="h-full w-full object-cover opacity-[0.97]"
          draggable={false}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          aria-hidden
        />
      </div>
    );
  }

  const parsed = parseCard(code);
  if (!parsed) {
    return (
      <div
        className={`${base} bg-[#f4f4f2] shadow-inner [box-shadow:inset_0_0_0_1px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.25)]`}
      >
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold text-zinc-400">
          ?
        </span>
      </div>
    );
  }

  const api = toDeckApiImageCode(code);
  const url = api ? `https://deckofcardsapi.com/static/img/${api}.png` : null;
  const showImg = Boolean(url && !imgErr);
  const { rank, suit, red } = parsed;

  if (showImg) {
    return (
      <div
        className={`${base} overflow-hidden border-black/20 [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.06),0_3px_12px_rgba(0,0,0,0.4)]`}
      >
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setImgErr(true)}
        />
      </div>
    );
  }

  return <CardFaceFallback rank={rank} suit={suit} red={red} base={base} />;
}
