// ============================================================================
// pages/mleo-crash.js
// MLEO Crash — full single-file Next.js page
// - 30s betting phase
// - Live multiplier chart (SVG)
// - Cash Out before crash to win bet * multiplier
// - Provably-fair demo: serverSeedHash shown before round; serverSeed revealed after
// Design: TailwindCSS (assumed present), no external libs
// Hooks-safe (no conditional hooks), mobile-friendly
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

// ------------------------------- Config -------------------------------------
const ROUND = {
  bettingSeconds: 30,           // time for all players to bet
  intermissionMs: 4000,         // pause after round ends before next betting opens
  fps: 60,                      // animation FPS
  decimals: 2,                  // display precision
  minCrash: 1.1,                // min crash multiplier inclusive
  maxCrash: 10.0,               // max crash multiplier inclusive
  // growth: multiplier function as a function of elapsed ms since takeoff
  growth: (elapsedMs) => {
    // Smooth exponential-ish growth starting at 1.00
    const t = elapsedMs / 1000;             // seconds
    const rate = 0.85;                       // tune feel
    const m = Math.exp(rate * t * 0.6);      // ~1.00 -> 2x in ~1.2-1.5s (tunable)
    return Math.max(1, m);
  },
};

// ---------------------------- Helpers (provably fair) ------------------------
async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Map 256-bit hash to [0,1) float */
function hashToUnitFloat(hex) {
  // take first 13 hex chars (~52 bits) to stay within JS number precision
  const slice = hex.slice(0, 13);
  const int = parseInt(slice, 16);
  const max = Math.pow(16, slice.length);
  return int / max; // in [0,1)
}

/** Map hash to crash point in [minCrash, maxCrash] with slight skew toward early busts */
function hashToCrash(hex, minCrash, maxCrash) {
  const u = hashToUnitFloat(hex);
  // Skew: y = u^k (k>1 favors earlier crashes). Tune k=1.45
  const k = 1.45;
  const skew = Math.pow(u, k);
  const v = minCrash + (maxCrash - minCrash) * skew;
  // clamp & 2 decimals
  return Math.max(minCrash, Math.min(maxCrash, Math.round(v * 100) / 100));
}

// ------------------------------ UI Atoms ------------------------------------
function StatBox({ label, value, sub }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-zinc-800/70 px-4 py-3 shadow">
      <div className="text-zinc-400 text-xs uppercase tracking-wider">{label}</div>
      <div className="text-white text-xl font-semibold mt-1">{value}</div>
      {sub ? <div className="text-zinc-500 text-xs mt-0.5">{sub}</div> : null}
    </div>
  );
}

// ------------------------------ Main Page -----------------------------------
export default function MLEOCrash() {
  // Game state
  const [phase, setPhase] = useState("betting"); // betting | running | crashed | revealing | intermission
  const [countdown, setCountdown] = useState(ROUND.bettingSeconds);
  const [betAmount, setBetAmount] = useState("");
  const [playerBet, setPlayerBet] = useState(null); // { amount:number, accepted:boolean }
  const [canCashOut, setCanCashOut] = useState(false);
  const [cashedOutAt, setCashedOutAt] = useState(null); // multiplier at cashout
  const [payout, setPayout] = useState(null);

  // Provably-fair data (client demo)
  const [serverSeed, setServerSeed] = useState("");        // revealed after round
  const [serverSeedHash, setServerSeedHash] = useState(""); // shown before round
  const [clientSeed, setClientSeed] = useState(() => Math.random().toString(36).slice(2));
  const [nonce, setNonce] = useState(0);
  const [crashPoint, setCrashPoint] = useState(null);

  // Live chart/multiplier
  const [multiplier, setMultiplier] = useState(1.0);
  const startTimeRef = useRef(0);
  const rafRef = useRef(0);
  const dataRef = useRef([]); // sampled points for chart

  // Demo user balance (local only; wire to wallet when needed)
  const [balance, setBalance] = useState(10_000); // pretend MLEO

  // ----------------------- Lifecycle: start betting window -------------------
  useEffect(() => {
    // Fresh seeds for the upcoming round
    // serverSeed kept secret until reveal; we show only its hash now.
    (async () => {
      const newServerSeed = crypto.getRandomValues(new Uint32Array(8)).join("-");
      const hash = await sha256Hex(newServerSeed);
      setServerSeed(newServerSeed);
      setServerSeedHash(hash);
      setCrashPoint(null);
      setCashedOutAt(null);
      setPayout(null);
      setPlayerBet(null);
      setCanCashOut(false);
      dataRef.current = [];
      setMultiplier(1.0);
      setNonce((n) => n + 1);
    })();

    // 30s countdown
    setPhase("betting");
    setCountdown(ROUND.bettingSeconds);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []); // run once on mount

  // When betting ends -> lock bets and takeoff
  useEffect(() => {
    if (phase !== "betting") return;
    if (countdown <= 0) {
      // Lock bet (accept if placed)
      if (playerBet && !playerBet.accepted) {
        setPlayerBet({ ...playerBet, accepted: true });
      }
      // Compute crash from provably-fair hash(serverSeed + clientSeed + nonce)
      (async () => {
        const h = await sha256Hex(`${serverSeed}|${clientSeed}|${nonce}`);
        const crash = hashToCrash(h, ROUND.minCrash, ROUND.maxCrash);
        setCrashPoint(crash);
        // Start live run
        setPhase("running");
        takeoff();
      })();
    }
  }, [countdown, phase, playerBet, serverSeed, clientSeed, nonce]);

  // ------------------------------- Engine -----------------------------------
  const takeoff = () => {
    startTimeRef.current = performance.now();
    setCanCashOut(true);
    cancelAnimationFrame(rafRef.current);

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startTimeRef.current;
      const m = ROUND.growth(elapsed);
      const mFixed = Math.max(1, Math.floor(m * Math.pow(10, ROUND.decimals)) / Math.pow(10, ROUND.decimals));
      setMultiplier(mFixed);

      // sample for chart (cap samples)
      dataRef.current.push({ t: elapsed, m: mFixed });
      if (dataRef.current.length > 800) dataRef.current.shift();

      // Crash?
      if (crashPoint && mFixed >= crashPoint) {
        setMultiplier(crashPoint);
        setPhase("crashed");
        setCanCashOut(false);
        cancelAnimationFrame(rafRef.current);
        // Resolve loss if not cashed out
        if (!cashedOutAt && playerBet?.accepted) {
          // no payout
          setPayout({ win: false, amount: 0, at: crashPoint });
        }
        // Reveal seeds a moment later
        setTimeout(() => setPhase("revealing"), 600);
        // After short intermission → next betting window
        setTimeout(() => startNextRound(), 600 + ROUND.intermissionMs);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const startNextRound = async () => {
    // Reveal already occurred; now reset to new betting window
    // New seeds:
    const newServerSeed = crypto.getRandomValues(new Uint32Array(8)).join("-");
    const hash = await sha256Hex(newServerSeed);
    setServerSeed(newServerSeed);
    setServerSeedHash(hash);
    setClientSeed(Math.random().toString(36).slice(2));
    setNonce((n) => n + 1);
    setCrashPoint(null);
    setMultiplier(1.0);
    dataRef.current = [];
    setCashedOutAt(null);
    setPayout(null);
    setPlayerBet(null);
    setCanCashOut(false);

    setPhase("betting");
    setCountdown(ROUND.bettingSeconds);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) clearInterval(id);
        return c - 1;
      });
    }, 1000);
  };

  // ------------------------------- Actions ----------------------------------
  const placeBet = () => {
    const amt = Number(betAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (phase !== "betting") return;
    if (amt > balance) return;

    // Deduct locally (stub; wire to on-chain later)
    setBalance((b) => b - amt);
    setPlayerBet({ amount: amt, accepted: false });

    // stub for on-chain hook:
    // await onPlaceBet(amt);
  };

  const cashOut = () => {
    if (!canCashOut || phase !== "running") return;
    if (!playerBet?.accepted) return; // only after takeoff
    setCanCashOut(false);
    setCashedOutAt(multiplier);
    cancelAnimationFrame(rafRef.current);

    const winAmount = Math.round(playerBet.amount * multiplier * 100) / 100;
    setPayout({ win: true, amount: winAmount, at: multiplier });

    // Credit locally (stub; wire to on-chain later)
    setBalance((b) => b + winAmount);

    // stub for on-chain hook:
    // await onPayout(winAmount);

    setPhase("revealing");
    setTimeout(() => startNextRound(), ROUND.intermissionMs);
  };

  // ------------------------------- Derived ----------------------------------
  const chartData = dataRef.current;
  const maxY = useMemo(() => {
    const current = Math.max(1, ...chartData.map((p) => p.m));
    const ceil = Math.ceil(Math.max(current, crashPoint || 1) * 1.1 * 10) / 10;
    return Math.min(ceil, ROUND.maxCrash);
  }, [chartData, crashPoint]);

  // Build SVG path
  const chart = useMemo(() => {
    const W = 600;
    const H = 260;
    if (!chartData.length) {
      return { W, H, d: "", xCrash: null, yCrash: null };
    }
    const tMax = chartData[chartData.length - 1].t || 1000;
    const padL = 36, padR = 12, padT = 16, padB = 28;
    const iw = W - padL - padR;
    const ih = H - padT - padB;

    const t0 = chartData[0].t;
    const tSpan = Math.max(1000, tMax - t0); // avoid div/0
    const mMin = 1;
    const mMax = maxY;

    const scaleX = (t) => padL + ((t - t0) / tSpan) * iw;
    const scaleY = (m) => padT + ih - ((m - mMin) / (mMax - mMin)) * ih;

    let d = "";
    chartData.forEach((p, i) => {
      const x = scaleX(p.t);
      const y = scaleY(p.m);
      d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });

    let xCrash = null, yCrash = null;
    if (crashPoint) {
      const lastX = scaleX(chartData[chartData.length - 1].t);
      xCrash = lastX;
      yCrash = scaleY(crashPoint);
    }

    return { W, H, d, xCrash, yCrash, padL, padR, padT, padB, scaleY, mMin, mMax };
  }, [chartData, crashPoint, maxY]);

  // ------------------------------- Render -----------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            MLEO <span className="text-emerald-400">Crash</span>
          </h1>
          <div className="flex gap-2">
            <StatBox label="Balance" value={`${balance.toLocaleString()} MLEO`} />
            <StatBox
              label="Phase"
              value={{
                betting: "Betting",
                running: "Running",
                crashed: "Crashed",
                revealing: "Revealing",
                intermission: "Intermission",
              }[phase]}
            />
          </div>
        </header>

        {/* Betting Panel */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-2xl bg-zinc-900/70 p-4 md:p-6 shadow-lg">
            {/* Top row: seeds + multiplier */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs text-zinc-400">
                <div>
                  <span className="text-zinc-500">serverSeedHash:</span>{" "}
                  <span className="font-mono">{serverSeedHash.slice(0, 16)}…</span>
                </div>
                {phase !== "betting" && (phase === "revealing" || phase === "crashed") ? (
                  <div className="mt-1">
                    <span className="text-zinc-500">serverSeed:</span>{" "}
                    <span className="font-mono break-all">{serverSeed}</span>
                  </div>
                ) : null}
                <div className="mt-1">
                  <span className="text-zinc-500">clientSeed:</span>{" "}
                  <span className="font-mono">{clientSeed}</span>
                  <span className="text-zinc-600"> &nbsp; nonce:</span>{" "}
                  <span className="font-mono">{nonce}</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-5xl md:text-6xl font-black">
                  <span className={phase === "running" ? "text-emerald-400" : "text-zinc-300"}>
                    {multiplier.toFixed(ROUND.decimals)}×
                  </span>
                </div>
                {crashPoint ? (
                  <div className="text-xs text-zinc-500">Crash at: {crashPoint.toFixed(2)}×</div>
                ) : null}
              </div>
            </div>

            {/* Chart */}
            <div className="mt-4">
              <div className="rounded-xl bg-zinc-950/70 p-2 md:p-3 ring-1 ring-zinc-800">
                <svg
                  viewBox={`0 0 ${chart.W} ${chart.H}`}
                  className="w-full h-64 md:h-72"
                  role="img"
                  aria-label="Crash multiplier chart"
                >
                  {/* axes */}
                  <line x1="36" y1="16" x2="36" y2={chart.H - 28} stroke="#3f3f46" strokeWidth="1" />
                  <line x1="36" y1={chart.H - 28} x2={chart.W - 12} y2={chart.H - 28} stroke="#3f3f46" strokeWidth="1" />

                  {/* y ticks */}
                  {Array.from({ length: 6 }).map((_, i) => {
                    const m = chart.mMin + ((chart.mMax - chart.mMin) * i) / 5;
                    const y = chart.scaleY(m);
                    return (
                      <g key={i}>
                        <line x1="32" y1={y} x2="36" y2={y} stroke="#52525b" />
                        <text x="30" y={y + 4} fontSize="10" textAnchor="end" fill="#a1a1aa">
                          {m.toFixed(1)}×
                        </text>
                      </g>
                    );
                  })}

                  {/* path */}
                  {chart.d ? (
                    <path d={chart.d} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                  ) : null}

                  {/* crash marker */}
                  {phase !== "betting" && crashPoint && chart.xCrash != null ? (
                    <g>
                      <circle cx={chart.xCrash} cy={chart.yCrash} r="5" fill="#ef4444" />
                      <text x={chart.xCrash + 6} y={chart.yCrash - 6} fontSize="11" fill="#ef4444">
                        {crashPoint.toFixed(2)}×
                      </text>
                    </g>
                  ) : null}
                </svg>
              </div>
            </div>

            {/* Run controls */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-zinc-400">
                {phase === "betting" ? (
                  <span>🔒 Bets lock in <span className="text-white font-semibold">{countdown}s</span></span>
                ) : phase === "running" ? (
                  <span>🚀 Round running… click <span className="text-white font-semibold">CASH OUT</span> before it crashes.</span>
                ) : phase === "crashed" ? (
                  <span className="text-red-400">💥 Crashed at {crashPoint?.toFixed(2)}×</span>
                ) : phase === "revealing" ? (
                  <span>🔎 Revealing seeds… Next round shortly.</span>
                ) : (
                  <span>⏳ Next round soon…</span>
                )}
              </div>

              <div>
                <button
                  onClick={cashOut}
                  disabled={!canCashOut || phase !== "running" || !playerBet?.accepted}
                  className={[
                    "rounded-xl px-5 py-3 text-sm font-semibold shadow transition",
                    canCashOut && phase === "running" && playerBet?.accepted
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                      : "bg-zinc-800 text-zinc-400 cursor-not-allowed",
                  ].join(" ")}
                >
                  CASH OUT
                </button>
              </div>
            </div>
          </div>

          {/* Bet sidebar */}
          <div className="rounded-2xl bg-zinc-900/70 p-4 md:p-5 shadow-lg">
            <h3 className="text-lg font-semibold">Place Your Bet</h3>
            <div className="mt-3">
              <label className="block text-sm text-zinc-400 mb-1">Amount (MLEO)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. 100"
                disabled={phase !== "betting"}
              />
              <div className="flex gap-2 mt-2">
                {[100, 250, 500, 1000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setBetAmount(String(v))}
                    disabled={phase !== "betting"}
                    className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={placeBet}
              disabled={phase !== "betting" || !betAmount || Number(betAmount) <= 0 || Number(betAmount) > balance}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-black shadow hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Round
            </button>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Your bet</span>
                <span className="font-medium">
                  {playerBet ? `${playerBet.amount} MLEO ${playerBet.accepted ? "(locked)" : "(pending)"}` : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Potential cashout</span>
                <span className="font-medium">
                  {playerBet?.accepted ? `${(playerBet.amount * multiplier).toFixed(2)} MLEO` : "-"}
                </span>
              </div>
              {payout ? (
                <div className={`mt-2 rounded-lg px-3 py-2 ${payout.win ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
                  {payout.win
                    ? `✅ Won ${payout.amount} MLEO at ${payout.at?.toFixed(2)}×`
                    : `❌ Lost — crashed at ${payout.at?.toFixed(2)}×`}
                </div>
              ) : null}
            </div>

            <div className="mt-5 border-t border-zinc-800/80 pt-3 text-xs text-zinc-500 leading-5">
              <p><span className="font-semibold text-zinc-300">Provably-Fair (demo):</span> crash is derived from <code>SHA256(serverSeed|clientSeed|nonce)</code>. You see the server hash before takeoff, and the server seed is revealed after.</p>
            </div>
          </div>
        </section>

        <footer className="mt-8 text-center text-xs text-zinc-500">
          Built for MLEO — demo mode (no on-chain calls). Wire <code>placeBet</code>/<code>cashOut</code> to your contracts when ready.
        </footer>
      </div>
    </div>
  );
}

// ---------------------- Notes for on-chain integration -----------------------
/*
1) Replace local balance and stubs:
   - On bet:
       await presaleOrGameContract.placeBet({ value: ..., args: ... })
       // Or approve & transferFrom for ERC20 wagering
   - On cash out:
       await gameContract.cashOut(roundId) -> returns payout
   Ensure the multiplier is computed *off-chain server-side* or on-chain VRF,
   and that the client displays the authoritative round state via websockets.

2) Multiplayer / authoritative source:
   - Move seed generation & round state to a server (Node/Socket.IO).
   - Broadcast: phase, countdown, serverSeedHash, multiplier(t), crashPoint.
   - On reveal: broadcast serverSeed and keep an archive for audits.

3) Security:
   - Never let client determine outcomes. This file is a demo; use it as UI.
   - For real money/tokens, rely on server or smart contract as source of truth.

4) Styling:
   - Tailwind assumed. If not, replace classes or add Tailwind to your project.
*/
