/**
 * STRICT SCOPE:
 * This file is allowed ONLY for:
 * - Color Clash
 * - MeldMatch
 *
 * Forbidden:
 * - Rummy 51
 * - Any other game
 *
 * Do not reuse or extend this file.
 * If another game needs styling — create a new isolated token file.
 */

/** Primary — table actions stay secondary to cards (softer, lighter weight) */
export const OV2_BTN_PRIMARY =
  "rounded-lg border border-emerald-500/16 bg-gradient-to-b from-emerald-950/55 to-emerald-950/92 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-100/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.22)] brightness-[0.94] transition-[transform,opacity,filter,box-shadow] duration-100 ease-out will-change-transform enabled:hover:-translate-y-px enabled:hover:brightness-[1.03] active:scale-[0.94] active:shadow-none active:brightness-[0.88] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none";

/** Secondary — zinc */
export const OV2_BTN_SECONDARY =
  "rounded-lg border border-zinc-600/18 bg-gradient-to-b from-zinc-800/42 to-zinc-950/90 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_2px_7px_rgba(0,0,0,0.2)] brightness-[0.94] transition-[transform,opacity,filter,box-shadow] duration-100 ease-out will-change-transform enabled:hover:-translate-y-px enabled:hover:brightness-[1.03] active:scale-[0.94] active:shadow-none active:brightness-[0.88] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none";

/** Accent — sky */
export const OV2_BTN_ACCENT =
  "rounded-lg border border-sky-500/16 bg-gradient-to-b from-sky-950/50 to-sky-950/88 px-2.5 py-1.5 text-[10px] font-semibold text-sky-100/62 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.22)] brightness-[0.94] transition-[transform,opacity,filter,box-shadow] duration-100 ease-out will-change-transform enabled:hover:-translate-y-px enabled:hover:brightness-[1.03] active:scale-[0.94] active:shadow-none active:brightness-[0.88] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none";

/** Danger — rose */
export const OV2_BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity,filter,box-shadow] duration-100 ease-out will-change-transform enabled:hover:-translate-y-px enabled:hover:brightness-110 active:scale-[0.94] active:shadow-none active:brightness-[0.88] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none";

/** Outer system bar wrapper */
export const OV2_DUEL_HUD_BAR =
  "rounded-lg border border-white/[0.06] bg-zinc-950/55 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_28px_rgba(0,0,0,0.35)] transition-[filter] duration-200 hover:brightness-[1.02]";

/** Timer chip — inactive */
export const OV2_DUEL_TIMER_IDLE =
  "flex items-center rounded-md border border-white/[0.12] bg-zinc-950/65 px-2 py-1 tabular-nums text-zinc-400 opacity-90 transition-opacity duration-200";

/** Timer chip — active turn (subtle scale pulse) */
export const OV2_DUEL_TIMER_ACTIVE =
  "flex origin-left items-center rounded-md border border-amber-500/40 bg-amber-950/25 px-2 py-1 tabular-nums text-amber-50/90 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.15)] ring-1 ring-amber-400/20 animate-ov2-duel-timer-pulse will-change-transform";

/** Metric / stock chip */
export const OV2_DUEL_CHIP_METRIC =
  "rounded border border-white/10 px-2 py-0.5 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[transform,opacity,filter] duration-200 hover:scale-[1.03] hover:brightness-105";

/** Settlement badge */
export const OV2_DUEL_SETTLEMENT_BADGE =
  "rounded-md border border-sky-500/18 bg-sky-950/35 px-2 py-0.5 text-[10px] text-sky-100/88 transition-[filter] duration-200 hover:brightness-110";

/** Top zone — one continuous felt; upper radial anchors the table center (no wrapper opacity — lead card stays crisp) */
export const OV2_DUEL_PANEL_TOP =
  "rounded-2xl border border-white/[0.04] bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.15),transparent_72%),linear-gradient(180deg,rgba(13,15,19,0.7)_0%,rgba(7,8,11,0.93)_100%)] shadow-[0_6px_48px_rgba(0,0,0,0.48),inset_0_0_72px_rgba(16,185,129,0.08)] transition-[filter] duration-200 hover:brightness-[1.02]";

/** Hand zone — lower radial ties vertically to top; darker base (no filter) so tiles stay vivid */
export const OV2_DUEL_PANEL_HAND =
  "rounded-2xl border border-white/[0.04] bg-[radial-gradient(circle_at_50%_80%,rgba(56,189,248,0.12),transparent_70%),linear-gradient(180deg,rgba(10,12,16,0.9)_0%,rgba(6,7,10,0.97)_100%)] shadow-[0_8px_44px_rgba(0,0,0,0.52),inset_0_0_64px_rgba(56,189,248,0.05)] transition-[filter,box-shadow] duration-300 hover:brightness-[1.01]";

/** Your turn — warmer inset wash toward center (no filter — keeps tiles vivid) */
export const OV2_DUEL_PANEL_HAND_ACTIVE =
  "shadow-[0_8px_44px_rgba(0,0,0,0.52),inset_0_0_64px_rgba(56,189,248,0.08),inset_0_-14px_56px_rgba(16,185,129,0.11)]";

/** Tight vertical group (top card panel + action strip) */
export const OV2_DUEL_ACTION_GROUP = "flex flex-col gap-1";

/** Actions sit FELT — visually subordinate to lead card */
export const OV2_DUEL_ACTION_STRIP =
  "rounded-2xl border border-white/[0.025] bg-[linear-gradient(180deg,rgba(16,185,129,0.05)_0%,rgba(9,11,14,0.12)_45%,transparent_100%)] px-2 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.3)] brightness-[0.96] backdrop-blur-[2px] transition-[filter] duration-200 hover:brightness-[0.99]";

/**
 * Generic duel panel alias — same as TOP (legacy imports).
 * @deprecated Prefer OV2_DUEL_PANEL_TOP or OV2_DUEL_PANEL_HAND.
 */
export const OV2_DUEL_PANEL = OV2_DUEL_PANEL_TOP;

/** Section label — quieter so the play surface (especially top card) reads as hero */
export const OV2_DUEL_PANEL_LABEL =
  "text-[10px] font-semibold uppercase tracking-wide text-zinc-600";

/** Inner display card (secondary readouts) */
export const OV2_DUEL_INNER_READOUT =
  "rounded-lg border border-emerald-500/18 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(16,185,129,0.08)] transition-[filter,box-shadow] duration-200 hover:brightness-[1.08]";

/** Halo under lead card — pool of light (breath rides on face shadow) */
export const OV2_DUEL_TOP_CARD_AURA =
  "relative z-0 before:pointer-events-none before:absolute before:-inset-[22px] before:-z-10 before:rounded-[1.45rem] before:bg-emerald-400/26 before:blur-3xl before:content-['']";

/** Lead card — dominant center object; hero motion + padded “tile” height */
export const OV2_DUEL_TOP_CARD_FACE =
  "relative z-[1] inline-flex min-h-[3.45rem] min-w-[5.85rem] items-center justify-center rounded-2xl border border-white/[0.11] bg-zinc-950/15 px-5 py-4 text-center font-mono text-sm font-semibold text-emerald-50 [text-shadow:0_1px_14px_rgba(0,0,0,0.9)] backdrop-blur-sm animate-ov2-duel-top-card-hero transition-[filter] duration-200 will-change-[transform,box-shadow] hover:brightness-[1.08] sm:min-h-[3.65rem] sm:min-w-[6.5rem] sm:py-[1.15rem] sm:text-base";

/** Violet callout (post-draw, layoff) */
export const OV2_CALLOUT_VIOLET =
  "rounded-lg border border-violet-400/22 bg-violet-950/18 shadow-[0_0_28px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.05)] transition-[filter] duration-200 hover:brightness-[1.05]";

export const OV2_OPP_PANEL_BASE =
  "rounded-lg border px-2 py-1.5 text-[10px] transition-[box-shadow,border-color,background-color,opacity,filter] duration-200 sm:text-[11px]";

/** Inactive opponent — low emphasis */
export const OV2_OPP_PANEL_IDLE =
  "border-white/[0.05] bg-zinc-950/55 text-zinc-300 opacity-[0.72] shadow-[0_0_20px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.03)]";

/** Active turn — high emphasis + glow pulse */
export const OV2_OPP_PANEL_ACTIVE =
  "border-amber-400/35 bg-amber-950/28 text-amber-50/95 opacity-100 brightness-110 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.14)] animate-ov2-duel-opp-glow will-change-[box-shadow]";

export const OV2_REVEALED_HAND_PANEL =
  "animate-ov2-duel-reveal-fade rounded-lg border border-white/[0.06] bg-zinc-900/42 p-2 opacity-90 shadow-[0_0_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[filter] duration-200 hover:brightness-[1.02]";

export const OV2_DUEL_HAND_PILL_BASE =
  "min-w-[2.7rem] rounded-md border px-2 py-1.5 font-mono text-[11px] transition-[transform,opacity,box-shadow,border-color,filter] duration-200 ease-out will-change-transform sm:min-w-[3rem] sm:px-2.5 sm:py-2 sm:text-xs";

/** Enabled — lift; hover shifts gradient “glow” upward toward the lead card */
export const OV2_DUEL_HAND_PILL_ENABLED =
  "border-sky-400/45 bg-[linear-gradient(180deg,rgba(30,120,170,0.35)_0%,rgba(8,47,73,0.58)_42%,rgba(6,36,56,0.52)_100%)] bg-[length:100%_240%] bg-top text-sky-50 transition-[transform,opacity,box-shadow,border-color,filter,background-position] duration-200 ease-out enabled:hover:-translate-y-1 enabled:hover:bg-bottom enabled:hover:shadow-[0_-10px_26px_rgba(56,189,248,0.16),0_10px_26px_rgba(56,189,248,0.28)] enabled:hover:brightness-[1.12] enabled:hover:scale-[1.02] active:scale-[0.94] active:brightness-[0.9]";

export const OV2_DUEL_HAND_PILL_DISABLED =
  "pointer-events-none cursor-default border-white/[0.08] bg-zinc-950/50 text-zinc-500 opacity-40";

export const OV2_DUEL_HAND_PILL_HIGHLIGHT_SUCCESS =
  "scale-[1.08] border-emerald-400/65 bg-emerald-950/45 text-emerald-50 shadow-[0_4px_18px_rgba(16,185,129,0.45)] ring-2 ring-emerald-400/50 brightness-[1.14]";

export const OV2_DUEL_HAND_PILL_HIGHLIGHT_PENDING =
  "scale-[1.08] border-violet-400/72 bg-violet-950/48 text-violet-50 shadow-[0_4px_18px_rgba(167,139,250,0.4)] ring-2 ring-violet-400/48 brightness-[1.14]";

/** MeldMatch layoff meld slot buttons */
export const OV2_DUEL_LAYOFF_MELD_BTN_BASE =
  "rounded border px-2 py-1 font-mono text-[9px] transition-[border-color,background-color,box-shadow,filter,transform] duration-200 ease-out enabled:hover:brightness-105 active:scale-[0.98]";

export const OV2_DUEL_LAYOFF_MELD_IDLE =
  "border-white/[0.06] bg-zinc-900/55 opacity-[0.78] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

export const OV2_DUEL_LAYOFF_MELD_SELECTED =
  "scale-[1.04] border-violet-400/72 bg-violet-900/52 opacity-100 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.32),0_0_16px_rgba(167,139,250,0.32)] ring-2 ring-violet-400/55 brightness-[1.12]";

/** One-shot tap flash on hand card (Color Clash) */
export const OV2_DUEL_HAND_FLASH_TAP = "animate-ov2-duel-card-flash";

/** Success flash on hand card (Color Clash) */
export const OV2_DUEL_HAND_FLASH_SUCCESS = "animate-ov2-duel-card-success";

/** Layoff / discard snap (MeldMatch hand tile) */
export const OV2_DUEL_HAND_SNAP = "animate-ov2-duel-hand-snap";

/** Press + flash after intentional delay (see screens: 80ms then apply) */
export const OV2_DUEL_HAND_HIT = "animate-ov2-duel-hand-hit";
