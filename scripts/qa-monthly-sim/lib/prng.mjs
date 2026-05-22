/** Mulberry32 seeded PRNG — reproducible per persona seed + day offset. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededForPersona(persona, simDay = 1) {
  const base = (persona.seed ?? 1) + simDay * 9973;
  return mulberry32(base);
}

export function pickInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pickOne(rng, arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}

export function chance(rng, p) {
  return rng() < p;
}
