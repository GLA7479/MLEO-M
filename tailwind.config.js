module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./game/**/*.{js,jsx}",
    "./games-online/**/*.{js,jsx}", // ensure Bingo files are scanned for Tailwind classes
  ],
  theme: {
    extend: {
      keyframes: {
        qfCoinWobble: {
          "0%, 100%": { transform: "rotateY(0deg) scale(1)" },
          "25%": { transform: "rotateY(-10deg) scale(1.03)" },
          "75%": { transform: "rotateY(10deg) scale(1.03)" },
        },
      },
      animation: {
        "qf-coin-wobble": "qfCoinWobble 0.55s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
