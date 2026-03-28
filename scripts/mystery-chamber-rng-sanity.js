/**
 * Local sanity check: chamber-1 safe index distribution matches uniform 1 in 4.
 * Run: node scripts/mystery-chamber-rng-sanity.js
 */
const { randomInt } = require("crypto");

const SIGIL_COUNT = 4;
const CHAMBER_COUNT = 4;
const N = 200_000;

function drawChamber1Safe() {
  return randomInt(0, SIGIL_COUNT);
}

function drawFullLayout() {
  const out = [];
  for (let i = 0; i < CHAMBER_COUNT; i += 1) {
    out.push(randomInt(0, SIGIL_COUNT));
  }
  return out;
}

const hist = [0, 0, 0, 0];
for (let i = 0; i < N; i += 1) {
  hist[drawChamber1Safe()] += 1;
}

console.log("Mystery Chamber RNG sanity (crypto.randomInt(0, 4) → values 0..3)");
console.log("Samples:", N);
console.log("Chamber-1 safe index histogram [0,1,2,3]:", hist.join(", "));
console.log("Expected per bucket ~", Math.round(N / SIGIL_COUNT));

const M = 50_000;
let allSame = 0;
for (let i = 0; i < M; i += 1) {
  const layout = drawFullLayout();
  if (layout.every(v => v === layout[0])) allSame += 1;
}
console.log(
  `Full ${CHAMBER_COUNT}-chamber layouts with all identical safe indices (in ${M} runs):`,
  allSame,
  "(~781 expected if independent uniform)",
);
