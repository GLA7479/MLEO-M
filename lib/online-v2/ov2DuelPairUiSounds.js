/**
 * Micro UI tones for Color Clash + MeldMatch duel UIs only (Web Audio API, no mp3).
 * Short (~30–70ms), low gain. Call after user gesture so AudioContext can run.
 */

let _ctx = /** @type {AudioContext|null} */ (null);

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!_ctx) _ctx = new Ctor();
  return _ctx;
}

/** @param {{ freq: number, dur: number, type?: OscillatorType, peak?: number }} o */
function blip(o) {
  const c = audioContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const t0 = c.currentTime;
  const peak = o.peak ?? 0.052;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.015);
}

/** Card / hand tap — crisp, immediate */
export function playOv2DuelCardTap() {
  blip({ freq: 940, dur: 0.042, type: "triangle", peak: 0.045 });
}

/** Play succeeded */
export function playOv2DuelSuccess() {
  const c = audioContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const t0 = c.currentTime;
  const steps = [
    { f: 520, at: 0, dur: 0.038, peak: 0.042 },
    { f: 784, at: 0.028, dur: 0.042, peak: 0.048 },
  ];
  for (const s of steps) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    const t = t0 + s.at;
    osc.frequency.setValueAtTime(s.f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(s.peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + s.dur + 0.012);
  }
}

/** Blocked / invalid */
export function playOv2DuelInvalid() {
  blip({ freq: 200, dur: 0.062, type: "triangle", peak: 0.04 });
}

/** Delay before hand hit visual + tap sound (ms) */
export const OV2_DUEL_HAND_HIT_DELAY_MS = 45;

/** Clear hand hit class after animation (ms) */
export const OV2_DUEL_HAND_HIT_CLEAR_MS = 260;
