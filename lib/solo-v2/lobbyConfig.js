import { SOLO_V2_GAMES } from "./registry";

/** Solo V2 lobby / Info modal copy only — keys must match `SOLO_V2_GAMES[].key`. */
const SESSION_25 = "Minimum game: 25 coins.";

const LOBBY_CARD_META = {
  quick_flip: {
    emoji: "🪙",
    accent: "#f59e0b",
    aboutHint:
      "A one-shot coin pick: the result is sealed before you choose, so it is pure odds and timing.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×1.92 your stake.",
    howToPlayHint:
      "Pick heads or tails and confirm your stake on the board. Resolve when you are ready—if your side matches the sealed flip you win that payout; if not, the round stake is spent.",
  },
  odd_even: {
    emoji: "🔢",
    accent: "#38bdf8",
    aboutHint: "Call odd or even on a single sealed number—fast, binary, and easy to read.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×1.92 your stake.",
    howToPlayHint:
      "Choose Odd or Even, set at least the minimum stake, and run the roll. Match the parity to win; mismatch loses that try. Gift rounds use the same rules with the gift stake cap.",
  },
  mystery_box: {
    emoji: "🎁",
    accent: "#f97316",
    aboutHint: "Ten boxes sit on the table—only one outcome is yours, and prizes were fixed server-side.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×2.88 your stake.",
    howToPlayHint:
      "Read the face values on the boxes, tap the one you want, and commit. The server reveals what was inside; there is no second pick, so choose the risk level you like up front.",
  },
  dice_pick: {
    emoji: "🎲",
    accent: "#14b8a6",
    aboutHint: "You lock a safe band for one honest dice roll—hit inside the band to win.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×1.92 your stake.",
    howToPlayHint:
      "Pick the range that matches how tight you want to play, confirm stake, and roll once. If the total lands inside your band you win; outside loses. Narrower bands feel spicier than wide ones.",
  },
  limit_run: {
    emoji: "📈",
    accent: "#6366f1",
    aboutHint: "Limbo-style run: set a target under 1.00 and try to roll beneath it.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×100 your stake.",
    howToPlayHint:
      "Dial your multiplier line, start the round, and watch the rolled value. Anything strictly below your target wins at the listed odds; at or above the target busts. Higher lines mean braver tries.",
  },
  number_hunt: {
    emoji: "🔢",
    accent: "#8b5cf6",
    aboutHint: "Hunt a secret number from 1–20 using only three guesses and higher/lower hints.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×4.5 your stake.",
    howToPlayHint:
      "Type a guess, read whether the answer is higher or lower, then shrink the range. You only get three shots—plan the first guess to split the range instead of spamming edges.",
  },
  core_breaker: {
    emoji: "💎",
    accent: "#eab308",
    aboutHint: "Chip a glowing core lane by lane while dodging the hidden unstable strike.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×5 your stake.",
    howToPlayHint:
      "Each beat, tap left, center, or right. Safe lanes add progress; the wrong lane ends the run. Chain clean breaks to climb tiers, and bail mentally before you chase a streak too far.",
  },
  flash_vein: {
    emoji: "⚡",
    accent: "#f59e0b",
    aboutHint: "Memorize a lightning flash across three lanes, then stand on the safe lane.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×5 your stake.",
    howToPlayHint:
      "Watch the sequence, pick the lane you trust, and confirm. Survive successive beats—each round speeds up pressure, so focus beats guessing. Missing the pattern costs the stake.",
  },
  drop_run: {
    emoji: "🎯",
    accent: "#3b82f6",
    aboutHint: "Drop a ball through pegs and let gravity pick your payout slot.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×4.75 your stake.",
    howToPlayHint:
      "Choose entry if offered, release the drop, and follow the bounce. Where it lands locks the multiplier on your stake. Aim for the rails you like, but accept chaos once it falls.",
  },
  speed_track: {
    emoji: "🏁",
    accent: "#10b981",
    aboutHint: "Six-leg stunt race: you sketch a line each leg while the server seals blocked lanes.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×5.9 your stake.",
    howToPlayHint:
      "At each checkpoint, pick among the lanes still open before the timer bites. Blocked lanes are revealed after you commit—read the odds, avoid dead routes, and chain clean legs for a better finish.",
  },
  gold_rush_digger: {
    emoji: "⛏️",
    accent: "#f59e0b",
    aboutHint: "Dig a buried field where skulls were placed before you arrived—every safe tile adds value.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×10.86 your stake.",
    howToPlayHint:
      "Tap tiles one at a time, watch the odds shrink, and hit cashout when you are happy. Pushing deeper raises reward but raises bust chance—never dig blindly on low health.",
  },
  treasure_doors: {
    emoji: "🗝️",
    accent: "#14b8a6",
    aboutHint: "Five chambers, three doors each—only one door per room is safe.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×6.4 your stake.",
    howToPlayHint:
      "Study the room odds, pick a door, and move on if you survive. You can mentally plan exits, but each choice is final—if you want to bank style play, exit early after a few safe rooms instead of yoloing the finale.",
  },
  vault_doors: {
    emoji: "🗄️",
    accent: "#d97706",
    aboutHint: "A tighter vault climb: fewer doors, faster decisions, escalating multipliers.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×10.86 your stake.",
    howToPlayHint:
      "Open doors in order, read the on-screen ladder, and cash out between picks if the UI allows. One wrong door ends the attempt—treat early floors as warmups, late floors as all-in moments.",
  },
  crystal_path: {
    emoji: "💎",
    accent: "#22d3ee",
    aboutHint: "Cross a crystal bridge where every row hides a bad tile on one side.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×10.86 your stake.",
    howToPlayHint:
      "Pick left or right each row before you step. A wrong tile drops you immediately; a clean crossing pays at the exit. Size your risk—two wrong guesses end the fantasy.",
  },
  triple_dice: {
    emoji: "🎲",
    accent: "#ef4444",
    aboutHint: "Call LOW, MID, HIGH, or TRIPLE before three fair dice finish rolling.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×34.6 your stake.",
    howToPlayHint:
      "Choose the band that matches your risk taste, lock stake, and roll. Totals map into LOW/MID/HIGH; triples are their own jackpot lane. If the dice do not match your pick, the stake is gone.",
  },
  challenge_21: {
    emoji: "🃏",
    accent: "#10b981",
    aboutHint: "Sprint blackjack: you draw or hold against a sealed dealer hand.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×2.5 your stake.",
    howToPlayHint:
      "Start from your dealt cards, tap hit until you like your total, then stand. Compare against the dealer reveal—beat without busting to win, tie pushes depending on rules shown on the table.",
  },
  high_low_cards: {
    emoji: "🂡",
    accent: "#22c55e",
    aboutHint: "Chain higher/lower calls on a running deck—each correct step climbs the streak ladder.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×4.1 your stake.",
    howToPlayHint:
      "Look at the current card, guess HI or LO on the next sealed card, and lock it in. Duplicates or ties follow the on-card rules—when you are ahead, cash the streak instead of gambling it away.",
  },
  mystery_chamber: {
    emoji: "🚪",
    accent: "#64748b",
    aboutHint: "Four puzzle chambers with different safe counts, then a sharper finale.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×1.41 your stake.",
    howToPlayHint:
      "Read how many sigils are safe this round, tap a tile, and either advance or fail. Later chambers punish greedy picks—if you like the banked value, use any offered exit before the finale spike.",
  },
  diamonds: {
    emoji: "💠",
    accent: "#22d3ee",
    aboutHint: "Flip gems on a bomb field—every safe reveal sweetens the cashout offer.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×15 your stake.",
    howToPlayHint:
      "Pick a difficulty that sets bomb count, then reveal cells carefully. Bank often on big boards—chasing the last gem is how streaks die. One wrong flip ends the attempt instantly.",
  },
  solo_ladder: {
    emoji: "🪜",
    accent: "#a855f7",
    aboutHint: "Climb rungs where each step might hold—higher rungs mean fatter multipliers.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×46 your stake.",
    howToPlayHint:
      "Advance one level at a time or take the cashout button when it glows. Read the per-step odds—if a rung feels cursed, bank instead of spearing higher. Missing a step loses the attempt.",
  },
  pulse_lock: {
    emoji: "⏱️",
    accent: "#ec4899",
    aboutHint: "Ride a moving pulse and tap when the marker sits in the winning band.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×1.88 your stake.",
    howToPlayHint:
      "Watch the loop speed, anticipate the beat, and lock while the marker overlaps the safe window shown for that round. Early locks are safer; greedy timing misses wipe the try.",
  },
  echo_sequence: {
    emoji: "🧠",
    accent: "#22c55e",
    aboutHint: "Simon-style echo: the game flashes an order, you play it back perfectly.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×3.68 your stake.",
    howToPlayHint:
      "Memorize color and order, then tap the same sequence without peeking. One wrong slot ends the run; extend rounds only when you are sure—speed increases as you climb.",
  },
  safe_zone: {
    emoji: "🛟",
    accent: "#38bdf8",
    aboutHint: "Keep a drifting needle inside a shrinking safe band while value ticks up.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×2.85 your stake.",
    howToPlayHint:
      "Use the tap/hold cues to nudge the marker toward the center corridor. Watch heat build—if the band tightens, micro-correct instead of slamming inputs. Cash when nerves spike.",
  },
  surge_cashout: {
    emoji: "⚡",
    accent: "#f43f5e",
    aboutHint: "Ride a live multiplier up and bail before a hidden crash point snaps the run.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×12 your stake.",
    howToPlayHint:
      "Let the surge climb, press cashout when you like the number on screen, and lock profit. Hesitating for one more tick is how streaks die—decide your exit before emotions decide for you.",
  },
  rail_logic: {
    emoji: "🛤️",
    accent: "#0ea5e9",
    aboutHint: "Pure puzzle: rotate track tiles until a mine cart can reach the exit—no hidden traps.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×1.92 your stake.",
    howToPlayHint:
      "Click tiles to cycle rail shapes, preview paths mentally, and submit when the route is continuous. If you truly solved it, you win—if not, keep rotating before you burn attempts.",
  },
  shadow_tell: {
    emoji: "🜁",
    accent: "#a78bfa",
    aboutHint: "Partial tells on a sealed stance—choose challenge, hedge, or split to react.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×2.08 your stake.",
    howToPlayHint:
      "Study the revealed hints, pick the stance you believe, and lock an action. Aggressive challenges pay more but hurt harder on a miss; hedges soften blows. Read the fine print on each button.",
  },
  core_balance: {
    emoji: "⚖️",
    accent: "#22d3ee",
    aboutHint: "Three drifting meters—heat, pressure, charge—must stay inside safe bands together.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×1.76 your stake.",
    howToPlayHint:
      "Each beat, use the cool, vent, or boost controls shown on each core. Plan ahead so one meter does not spike while you babysit another—letting any bar hit critical ends the session.",
  },
  relic_draft: {
    emoji: "📜",
    accent: "#d4a574",
    aboutHint: "Draft relic cards between bite-sized fights—stack buffs, then survive encounters.",
    sessionCostHint: SESSION_25,
    rewardHint: "pays about ×2.52 your stake.",
    howToPlayHint:
      "Pick relics that synergize with your playstyle, enter each encounter with the stats shown, and adapt if health dips. Do not hoard useless relics—trim picks that do not help the next fight.",
  },
};

const DEFAULT_REWARD_HINT = "pays about ×1.92 your stake.";
const DEFAULT_SESSION_COST = SESSION_25;
const DEFAULT_HOW_TO_PLAY = (g) => g.shortDescription;

export const SOLO_V2_LOBBY_GAMES = SOLO_V2_GAMES.map((game) => {
  const meta = LOBBY_CARD_META[game.key] || {};
  return {
    ...game,
    emoji: meta.emoji || "🎮",
    accent: meta.accent || "#6366f1",
    aboutHint: meta.aboutHint ?? game.shortDescription,
    rewardHint: meta.rewardHint ?? DEFAULT_REWARD_HINT,
    sessionCostHint: meta.sessionCostHint ?? DEFAULT_SESSION_COST,
    howToPlayHint: meta.howToPlayHint ?? DEFAULT_HOW_TO_PLAY(game),
  };
});
