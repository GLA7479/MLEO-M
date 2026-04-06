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
        ov2DomSeatPulse: {
          "0%, 100%": { boxShadow: "0 0 0 3px rgba(251,191,36,0.35)" },
          "50%": { boxShadow: "0 0 0 5px rgba(251,191,36,0.55)" },
        },
        ov2DomShake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-4px)" },
          "40%": { transform: "translateX(4px)" },
          "60%": { transform: "translateX(-3px)" },
          "80%": { transform: "translateX(3px)" },
        },
        ov2DomPlace: {
          "0%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
        ov2DomModalIn: {
          "0%": { transform: "scale(0.94) translateY(8px)", opacity: "0" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
        ov2DomDoublePulse: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.015)" },
        },
        ov2DomEndpointGlow: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        ov2DomDrawFromStack: {
          "0%": { transform: "translate(40px, 20px) scale(0.85)", opacity: "0.4" },
          "100%": { transform: "translate(0, 0) scale(1)", opacity: "1" },
        },
        ov2DomDrawBounce: {
          "0%": { transform: "translateY(12px) scale(0.9)" },
          "55%": { transform: "translateY(-4px) scale(1.05)" },
          "100%": { transform: "translateY(0) scale(1)" },
        },
        ov2DomFloatUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateY(-28px)", opacity: "0" },
        },
        fadeOutToast: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "qf-coin-wobble": "qfCoinWobble 0.55s ease-in-out infinite",
        "dice-idle-float": "diceIdleFloat 3.2s ease-in-out infinite",
        "dice-idle-sheen": "diceIdleSheen 4s ease-in-out infinite",
        "dice-roll-tumble": "diceRollTumble 0.24s ease-in-out infinite",
        "dice-land-pop": "diceLandPop 0.55s cubic-bezier(0.34, 1.45, 0.64, 1) both",
        "ov2-dom-seat-pulse": "ov2DomSeatPulse 1.6s ease-in-out infinite",
        "ov2-dom-shake": "ov2DomShake 0.28s ease-in-out",
        "ov2-dom-place": "ov2DomPlace 0.16s cubic-bezier(0.34, 1.45, 0.64, 1)",
        "ov2-dom-modal-in": "ov2DomModalIn 0.22s cubic-bezier(0.34, 1.45, 0.64, 1) both",
        "ov2-dom-double-pulse": "ov2DomDoublePulse 1.2s ease-in-out infinite",
        "ov2-dom-endpoint-glow": "ov2DomEndpointGlow 1.4s ease-in-out infinite",
        "ov2-dom-draw-from-stack": "ov2DomDrawFromStack 0.45s ease-out both",
        "ov2-dom-draw-bounce": "ov2DomDrawBounce 0.5s cubic-bezier(0.34, 1.45, 0.64, 1) both",
        "ov2-dom-float-up": "ov2DomFloatUp 1.35s ease-out forwards",
        "fade-out": "fadeOutToast 1.15s ease-out 0.05s forwards",
      },
    },
  },
  plugins: [],
};
