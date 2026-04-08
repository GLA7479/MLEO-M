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
        /** Color Clash + MeldMatch duel HUD — scoped polish */
        ov2DuelOppGlow: {
          "0%": {
            boxShadow:
              "inset 0 0 0 1px rgba(251,191,36,0.12), 0 0 6px rgba(251,191,36,0.06)",
          },
          "100%": {
            boxShadow:
              "inset 0 0 0 1px rgba(251,191,36,0.22), 0 0 14px rgba(251,191,36,0.2)",
          },
        },
        ov2DuelTimerPulse: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
        ov2DuelHandSnap: {
          "0%": { transform: "translateY(-2px)" },
          "100%": { transform: "translateY(0)" },
        },
        /** Duel pair — lead card: float + scale 1.35 + slow shadow “breath” */
        ov2DuelTopCardHero: {
          "0%, 100%": {
            transform: "translateY(0) scale(1.35)",
            boxShadow:
              "0 24px 64px rgba(0,0,0,0.72), 0 14px 44px rgba(16,185,129,0.32), inset 0 0 22px rgba(16,185,129,0.1)",
          },
          "50%": {
            transform: "translateY(-3px) scale(1.35)",
            boxShadow:
              "0 28px 72px rgba(0,0,0,0.76), 0 20px 56px rgba(16,185,129,0.45), inset 0 0 30px rgba(16,185,129,0.16)",
          },
        },
        /** Hand hit: sharp press 0.94, snap back — 240ms total */
        ov2DuelHandHit: {
          "0%, 14%": { transform: "scale(1)", filter: "brightness(1)" },
          "22%": {
            transform: "scale(0.94)",
            filter: "brightness(1.52) drop-shadow(0 0 14px rgba(255,255,255,0.38))",
          },
          "48%": { transform: "scale(1)", filter: "brightness(1)" },
          "100%": { transform: "scale(1)", filter: "brightness(1)" },
        },
        ov2DuelRevealFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        ov2DuelCardFlash: {
          "0%": { filter: "brightness(1)" },
          "55%": { filter: "brightness(1.55)" },
          "100%": { filter: "brightness(1)" },
        },
        ov2DuelCardSuccess: {
          "0%": { filter: "brightness(1)", boxShadow: "0 0 0 0 rgba(16,185,129,0)" },
          "50%": {
            filter: "brightness(1.32)",
            boxShadow: "0 0 22px rgba(16,185,129,0.72)",
          },
          "100%": { filter: "brightness(1)", boxShadow: "0 0 0 0 rgba(16,185,129,0)" },
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
        "ov2-duel-opp-glow": "ov2DuelOppGlow 1.2s ease-in-out infinite alternate",
        "ov2-duel-timer-pulse": "ov2DuelTimerPulse 1.2s ease-in-out infinite",
        "ov2-duel-hand-snap": "ov2DuelHandSnap 0.18s ease-out both",
        "ov2-duel-top-card-hero": "ov2DuelTopCardHero 2.8s ease-in-out infinite",
        "ov2-duel-hand-hit": "ov2DuelHandHit 0.24s cubic-bezier(0.2,0.85,0.28,1) both",
        "ov2-duel-reveal-fade": "ov2DuelRevealFade 0.12s ease-out both",
        "ov2-duel-card-flash": "ov2DuelCardFlash 0.07s linear both",
        "ov2-duel-card-success": "ov2DuelCardSuccess 0.075s linear both",
      },
    },
  },
  plugins: [],
};
