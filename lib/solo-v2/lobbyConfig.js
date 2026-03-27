import { SOLO_V2_GAMES } from "./registry";

const LOBBY_CARD_META = {
  quick_flip: { emoji: "🪙", accent: "#f59e0b" },
  mystery_box: { emoji: "🎁", accent: "#f97316" },
  dice_pick: { emoji: "🎲", accent: "#14b8a6" },
  limit_run: { emoji: "📈", accent: "#6366f1" },
  number_hunt: { emoji: "🔢", accent: "#8b5cf6" },
  drop_run: { emoji: "🎯", accent: "#3b82f6" },
  speed_track: { emoji: "🏁", accent: "#10b981" },
  gold_rush_digger: { emoji: "⛏️", accent: "#f59e0b" },
  triple_dice: { emoji: "🎲", accent: "#ef4444" },
  challenge_21: { emoji: "🃏", accent: "#10b981" },
  high_low_cards: { emoji: "🂡", accent: "#22c55e" },
  mystery_chamber: { emoji: "🚪", accent: "#64748b" },
};

export const SOLO_V2_LOBBY_GAMES = SOLO_V2_GAMES.map((game) => ({
  ...game,
  emoji: LOBBY_CARD_META[game.key]?.emoji || "🎮",
  accent: LOBBY_CARD_META[game.key]?.accent || "#6366f1",
}));
