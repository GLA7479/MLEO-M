module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./game/**/*.{js,jsx}",
    "./games-online/**/*.{js,jsx}", // ensure Bingo files are scanned for Tailwind classes
    "./lib/**/*.{js,jsx}", // e.g. ov2BingoSeatColors — dynamic class strings must be discoverable
  ],
  theme: {
    extend: {
      keyframes: {
        qfCoinWobble: {
          "0%, 100%": { transform: "rotateY(0deg) scale(1)" },
          "25%": { transform: "rotateY(-10deg) scale(1.03)" },
          "75%": { transform: "rotateY(10deg) scale(1.03)" },
        },
        diceIdleFloat: {
          "0%, 100%": { transform: "translateY(0)", filter: "brightness(1)" },
          "50%": { transform: "translateY(-3px)", filter: "brightness(1.06)" },
        },
        diceIdleSheen: {
          "0%": { transform: "translateX(-120%) skewX(-12deg)", opacity: "0" },
          "20%": { opacity: "0.35" },
          "50%": { transform: "translateX(120%) skewX(-12deg)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        diceRollTumble: {
          "0%, 100%": { transform: "rotate(-3deg) scale(1)" },
          "33%": { transform: "rotate(5deg) scale(1.02)" },
          "66%": { transform: "rotate(-4deg) scale(0.99)" },
        },
        diceLandPop: {
          "0%": { transform: "scale(0.88)", opacity: "0.75" },
          "60%": { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "qf-coin-wobble": "qfCoinWobble 0.55s ease-in-out infinite",
        "dice-idle-float": "diceIdleFloat 3.2s ease-in-out infinite",
        "dice-idle-sheen": "diceIdleSheen 4s ease-in-out infinite",
        "dice-roll-tumble": "diceRollTumble 0.24s ease-in-out infinite",
        "dice-land-pop": "diceLandPop 0.55s cubic-bezier(0.34, 1.45, 0.64, 1) both",
      },
    },
  },
  plugins: [],
};
