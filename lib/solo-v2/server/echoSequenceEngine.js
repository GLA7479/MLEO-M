import { randomInt } from "crypto";
import {
  ECHO_SEQUENCE_OPTION_COUNT,
  ECHO_SEQUENCE_SYMBOLS,
  ECHO_SEQUENCE_TOTAL_ROUNDS,
  multiplierAfterRound,
  payoutForMultiplier,
} from "../echoSequenceConfig";

function randomSymbol() {
  return ECHO_SEQUENCE_SYMBOLS[randomInt(0, ECHO_SEQUENCE_SYMBOLS.length)];
}

function randomSequence(length) {
  const out = [];
  for (let i = 0; i < length; i += 1) out.push(randomSymbol());
  return out;
}

function mutateSequence(base) {
  const next = [...base];
  const idx = randomInt(0, next.length);
  let tries = 0;
  while (tries < 8) {
    const cand = randomSymbol();
    if (cand !== next[idx]) {
      next[idx] = cand;
      break;
    }
    tries += 1;
  }
  return next;
}

function sequenceId(seq) {
  return Array.isArray(seq) ? seq.join("|") : "";
}

export function buildEchoRoundCatalog() {
  const rounds = [];
  const lengths = [3, 3, 4, 4, 5];
  for (let r = 0; r < ECHO_SEQUENCE_TOTAL_ROUNDS; r += 1) {
    const correct = randomSequence(lengths[r] || 5);
    const options = [{ key: "A", seq: correct }];
    while (options.length < ECHO_SEQUENCE_OPTION_COUNT) {
      const decoy = mutateSequence(correct);
      if (sequenceId(decoy) === sequenceId(correct)) continue;
      if (options.some(x => sequenceId(x.seq) === sequenceId(decoy))) continue;
      const key = String.fromCharCode(65 + options.length);
      options.push({ key, seq: decoy });
    }
    for (let i = options.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const t = options[i];
      options[i] = options[j];
      options[j] = t;
    }
    const correctKey = options.find(x => sequenceId(x.seq) === sequenceId(correct))?.key || "A";
    rounds.push({
      roundIndex: r,
      revealMs: r < 2 ? 2000 : r < 4 ? 1600 : 1300,
      correctSequence: correct,
      options,
      correctOptionKey: correctKey,
    });
  }
  return rounds;
}

export function buildEchoInitialActiveSummary() {
  const rounds = buildEchoRoundCatalog();
  return {
    phase: "echo_sequence_active",
    totalRounds: ECHO_SEQUENCE_TOTAL_ROUNDS,
    currentRoundIndex: 0,
    rounds,
    clearedRounds: [],
    lastProcessedChoiceEventId: 0,
    lastTurn: null,
  };
}

export function buildEchoPlayingNumbers(entryCost, currentRoundIndex, clearedRoundsLength) {
  const r = Math.max(0, Math.floor(Number(currentRoundIndex) || 0));
  const cleared = Math.max(0, Math.floor(Number(clearedRoundsLength) || 0));
  let currentMultiplier = 1;
  if (cleared > 0) {
    const m = multiplierAfterRound(cleared - 1);
    if (Number.isFinite(m)) currentMultiplier = m;
  }
  const nextMultiplier = r < ECHO_SEQUENCE_TOTAL_ROUNDS ? multiplierAfterRound(r) : currentMultiplier;
  return {
    currentMultiplier,
    nextMultiplier,
    currentPayout: payoutForMultiplier(entryCost, currentMultiplier),
    nextPayout: payoutForMultiplier(entryCost, nextMultiplier),
  };
}
