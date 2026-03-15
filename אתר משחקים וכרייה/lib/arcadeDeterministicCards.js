const SUITS = ["S", "H", "D", "C"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const SUIT_DISPLAY = {
  S: "♠️",
  H: "♥️",
  D: "♦️",
  C: "♣️",
};

function nextSeed(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function makeSeed(sessionId) {
  const hex = String(sessionId || "").replace(/-/g, "").slice(0, 8);
  const parsed = parseInt(hex || "1", 16) >>> 0;
  return parsed || 1;
}

function cardCodeToCard(code) {
  const suitCode = String(code || "").slice(-1);
  const value = String(code || "").slice(0, -1);
  const suit = SUIT_DISPLAY[suitCode] || "";
  return {
    value,
    suit,
    display: `${value}${suit}`,
  };
}

export function createDeterministicCardCodes(sessionId) {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push(`${value}${suit}`);
    }
  }

  let seed = makeSeed(sessionId);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    seed = nextSeed(seed);
    const j = seed % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export function createDeterministicCardDeck(sessionId) {
  return createDeterministicCardCodes(sessionId).map(cardCodeToCard);
}
