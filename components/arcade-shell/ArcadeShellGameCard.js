import { useState } from "react";
import Link from "next/link";
import ArcadeShellModal from "./ArcadeShellModal";

/** One grapheme for mobile tiles — avoids stacked multi-emoji (e.g. 🎰🎴) */
export function arcadeShellCompactCardEmoji(emoji) {
  if (emoji == null || typeof emoji !== "string") return "🎮";
  const t = emoji.trim();
  if (!t) return "🎮";
  try {
    const Seg = Intl.Segmenter;
    if (typeof Seg === "function") {
      for (const { segment } of new Seg("en", { granularity: "grapheme" }).segment(t)) {
        return segment;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return Array.from(t)[0] ?? "🎮";
}

const DEFAULT_SESSION_COST = "Varies by game";
const DEFAULT_HOW_TO_PLAY =
  "Tap PLAY to open the game, read the on-board rules, and start a Solo V2 session. Stakes and payouts are defined inside each game.";

const DEFAULT_REWARD_MODAL = "pays about ×1.92";

/** Session Cost modal: row1 label + row2 numbers (aligned with reward column). */
function parseModalSessionLines(sessionCostText) {
  const raw = String(sessionCostText ?? "").trim();
  if (!raw) return { line1: "Minimum", line2: "25 coins." };
  const parts = raw.split(/\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { line1: parts[0], line2: parts.slice(1).join(" ") };
  if (/^minimum\b/i.test(raw)) {
    const rest = raw.replace(/^minimum\s*/i, "").trim();
    return { line1: "Minimum", line2: rest || "25 coins." };
  }
  return { line1: "", line2: raw };
}

/** Top Reward modal: "pays about" and "×…" on separate rows (aligned with session column). */
function parseModalRewardLines(rewardText) {
  const raw = String(rewardText ?? "").trim();
  if (!raw) return { line1: "pays about", line2: "×1.92" };
  const m = raw.match(/^(pays about)\s*(×.+)$/i);
  if (m) return { line1: m[1], line2: m[2].trim() };
  return { line1: "", line2: raw };
}

/**
 * Presentation-only game tile (markup/classes aligned with `pages/arcade.js` GameCard).
 * Copy is supplied by the Solo V2 lobby mapper — no legacy arcade imports.
 */
export default function ArcadeShellGameCard({
  title,
  emoji,
  description,
  reward,
  href,
  color,
  comingSoon = false,
  compact = false,
  lobby = false,
  sessionCostText = DEFAULT_SESSION_COST,
  howToPlayText = DEFAULT_HOW_TO_PLAY,
}) {
  const [showInfo, setShowInfo] = useState(false);
  const sessionModal = parseModalSessionLines(sessionCostText);
  const rewardStr = typeof reward === "string" ? reward.trim() : "";
  const rewardModal = parseModalRewardLines(rewardStr || DEFAULT_REWARD_MODAL);

  return (
    <>
      <article
        className={`relative overflow-hidden rounded-lg border border-white/10 shadow-md backdrop-blur-md transition-all duration-300 ease-out ${
          comingSoon ? "opacity-60" : ""
        } ${
          lobby
            ? "flex h-full min-h-0 w-full min-w-0 flex-col rounded-xl p-3.5 shadow-lg hover:border-white/25 hover:shadow-xl"
            : compact
              ? "h-full min-h-0 p-0"
              : "flex flex-col p-5 shadow-lg hover:scale-[1.02] hover:border-white/25 hover:shadow-xl"
        }`}
        style={{
          background:
            "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)",
          ...(compact || lobby ? { minHeight: 0 } : { height: "200px" }),
        }}
      >
        <button
          onClick={() => setShowInfo(true)}
          type="button"
          className={`absolute z-10 flex items-center justify-center border border-white/15 bg-white/10 leading-none transition-all hover:bg-white/20 ${
            compact
              ? "right-1 top-1 h-10 min-h-[40px] w-10 min-w-[40px] rounded-full border-white/10 bg-white/5 text-sm hover:bg-white/12"
              : lobby
                ? "right-2 top-2 h-9 w-9 rounded-full text-base"
                : "right-2 top-2 h-7 w-7 rounded-full text-sm"
          }`}
          title="Info"
        >
          ℹ️
        </button>

        {lobby ? (
          <>
            <div className="pointer-events-none shrink-0 select-none pb-0.5 pt-0.5 text-center text-3xl leading-none lg:text-4xl">
              {emoji}
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center">
              {comingSoon ? (
                <h2 className="line-clamp-2 text-base font-extrabold leading-snug text-amber-300 lg:text-lg">
                  COMING SOON
                </h2>
              ) : (
                <h2 className="line-clamp-2 text-base font-extrabold leading-snug lg:text-lg">{title}</h2>
              )}
              {!comingSoon && reward ? (
                <p
                  className="mt-0 max-w-full truncate px-1 text-[11px] font-semibold leading-snug text-amber-200/95 lg:text-xs"
                  title={reward}
                >
                  {reward}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 pt-1">
              {comingSoon ? (
                <button
                  type="button"
                  disabled
                  className="block w-full cursor-not-allowed rounded-xl py-2.5 text-center text-sm font-extrabold leading-none text-white/50 opacity-50 shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                  }}
                >
                  PLAY
                </button>
              ) : (
                <Link
                  href={href}
                  className="block w-full rounded-xl py-2.5 text-center text-sm font-extrabold leading-none text-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:opacity-90 lg:py-3 lg:text-[15px]"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  }}
                >
                  PLAY
                </Link>
              )}
            </div>
          </>
        ) : compact ? (
          <>
            <div className="flex h-full min-h-0 flex-col px-1 pb-1 pl-1 pr-2.5 pt-1.5">
              <div className="mt-0.5 flex shrink-0 justify-center leading-none">
                <span
                  className="inline-block translate-y-0.5 select-none text-[2.35rem] leading-none sm:text-[2.5rem]"
                  aria-hidden
                >
                  {arcadeShellCompactCardEmoji(emoji)}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-0 px-0.5 text-center">
                {comingSoon ? (
                  <h2 className="line-clamp-2 text-[13px] font-extrabold leading-tight text-amber-300 sm:text-[14px]">
                    COMING SOON
                  </h2>
                ) : (
                  <h2 className="line-clamp-2 text-[13px] font-extrabold leading-tight sm:text-[14px]">{title}</h2>
                )}
                {reward ? (
                  <p
                    className="mt-0 max-w-full line-clamp-1 px-0.5 text-[9px] font-semibold leading-none text-amber-200/95"
                    title={reward}
                  >
                    {reward}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 pt-0.5">
                {comingSoon ? (
                  <button
                    type="button"
                    disabled
                    className="block w-full min-h-[33px] cursor-not-allowed rounded-md py-1.5 text-center text-[11px] font-bold leading-none text-white/50 opacity-50 shadow-inner"
                    style={{
                      background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                    }}
                  >
                    PLAY
                  </button>
                ) : (
                  <Link
                    href={href}
                    className="flex min-h-[33px] w-full items-center justify-center rounded-md py-1.5 text-center text-[11px] font-bold leading-none text-white shadow-sm active:opacity-90"
                    style={{
                      background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                    }}
                  >
                    PLAY
                  </Link>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="absolute left-0 right-0 text-center" style={{ top: "12px" }}>
              <div className="text-[2.4rem] leading-none">{emoji}</div>
            </div>
            <div
              className="absolute left-0 right-0 flex items-center justify-center px-3 text-center"
              style={{ top: "72px", height: "56px" }}
            >
              {comingSoon ? (
                <h2 className="line-clamp-2 text-[17px] font-extrabold leading-snug text-amber-300">
                  COMING SOON
                </h2>
              ) : (
                <h2 className="line-clamp-2 text-[17px] font-extrabold leading-snug">{title}</h2>
              )}
            </div>
            <div className="absolute bottom-[14px] left-4 right-4">
              {comingSoon ? (
                <button
                  disabled
                  className="block w-full cursor-not-allowed rounded-lg px-4 py-2.5 text-center text-sm font-bold text-white/50 opacity-50 shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                  }}
                >
                  PLAY
                </button>
              ) : (
                <Link
                  href={href}
                  className="block w-full rounded-lg px-4 py-2.5 text-center text-sm font-bold text-white shadow-md transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  }}
                >
                  PLAY
                </Link>
              )}
            </div>
          </>
        )}
      </article>

      {showInfo && (
        <ArcadeShellModal open={showInfo} onClose={() => setShowInfo(false)}>
          <div className="mb-4 text-center">
            <div className="mb-2 text-5xl leading-none">{emoji}</div>
            <h2 className="mb-2 text-3xl font-extrabold leading-tight">{title}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-bold">About This Game</h3>
              <p className="text-zinc-300">{description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                <div className="mb-1 text-sm opacity-70">Session Cost</div>
                <div className="space-y-0.5 text-xl font-bold leading-tight text-amber-400">
                  <div>{sessionModal.line1 || "\u00A0"}</div>
                  <div>{sessionModal.line2}</div>
                </div>
              </div>
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
                <div className="mb-1 text-sm opacity-70">Top Reward Tier</div>
                <div className="space-y-0.5 text-xl font-bold leading-tight text-green-400">
                  <div>{rewardModal.line1 || "\u00A0"}</div>
                  <div>{rewardModal.line2}</div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-bold">How to Play</h3>
              <p className="text-zinc-300">{howToPlayText}</p>
            </div>
          </div>
        </ArcadeShellModal>
      )}
    </>
  );
}
