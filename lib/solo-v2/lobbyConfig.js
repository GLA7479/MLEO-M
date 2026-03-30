import { SOLO_V2_GAMES } from "./registry";

const LOBBY_CARD_META = {
  quick_flip: { emoji: "🪙", accent: "#f59e0b" },
  odd_even: { emoji: "🔢", accent: "#38bdf8" },
  mystery_box: { emoji: "🎁", accent: "#f97316" },
  dice_pick: { emoji: "🎲", accent: "#14b8a6" },
  limit_run: { emoji: "📈", accent: "#6366f1" },
  number_hunt: { emoji: "🔢", accent: "#8b5cf6" },
  core_breaker: { emoji: "💎", accent: "#eab308" },
  flash_vein: { emoji: "⚡", accent: "#f59e0b" },
  drop_run: { emoji: "🎯", accent: "#3b82f6" },
  speed_track: { emoji: "🏁", accent: "#10b981" },
  gold_rush_digger: { emoji: "⛏️", accent: "#f59e0b" },
  treasure_doors: { emoji: "🗝️", accent: "#14b8a6" },
  vault_doors: { emoji: "🗄️", accent: "#d97706" },
  crystal_path: { emoji: "💎", accent: "#22d3ee" },
  triple_dice: { emoji: "🎲", accent: "#ef4444" },
  challenge_21: { emoji: "🃏", accent: "#10b981" },
  high_low_cards: { emoji: "🂡", accent: "#22c55e" },
  mystery_chamber: { emoji: "🚪", accent: "#64748b" },
  diamonds: { emoji: "💠", accent: "#22d3ee" },
  solo_ladder: { emoji: "🪜", accent: "#a855f7" },
  pulse_lock: { emoji: "⏱️", accent: "#ec4899" },
  echo_sequence: { emoji: "🧠", accent: "#22c55e" },
  safe_zone: { emoji: "🛟", accent: "#38bdf8" },
};

export const SOLO_V2_LOBBY_GAMES = SOLO_V2_GAMES.map((game) => ({
  ...game,
  emoji: LOBBY_CARD_META[game.key]?.emoji || "🎮",
  accent: LOBBY_CARD_META[game.key]?.accent || "#6366f1",
}));
