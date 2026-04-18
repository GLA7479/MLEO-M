/** Visual shell tokens aligned with `pages/arcade.js` lobby (presentation only). */
export const ARCADE_SHELL_BG =
  "linear-gradient(135deg, #1a1a1a 0%, #3a2a0a 50%, #1a1a1a 100%)";

/** Mobile lobby: 4 tabs × up to 9 games (3×3) each */
export const ARCADE_SHELL_MOBILE_GAMES_PER_GROUP = 9;
export const ARCADE_SHELL_MOBILE_GROUPS = [
  { id: 0, label: "1", shortLabel: "1–9" },
  { id: 1, label: "2", shortLabel: "10–18" },
  { id: 2, label: "3", shortLabel: "19–27" },
  { id: 3, label: "4", shortLabel: "28+" },
];

/** Desktop lobby: 4 tabs × 8 games (4×2) per page */
export const ARCADE_SHELL_DESKTOP_GAMES_PER_GROUP = 8;

export const ARCADE_SHELL_SWIPE_THRESHOLD_PX = 40;
export const ARCADE_SHELL_SWIPE_INTENT_RATIO = 1.2;
