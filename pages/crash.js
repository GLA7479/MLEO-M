// ============================================================================
// MLEO Crash — Multiplier Betting Game
// - 30s betting phase
// - Live multiplier chart (SVG)
// - Cash Out before crash to win bet * multiplier
// Cost: Variable (player choice)
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken as consumeFreePlayToken } from "../lib/free-play-system";

// ------------------------------- Config -------------------------------------
const LS_KEY = "mleo_crash_v1";
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
    const rate = 0.25;                       // tune feel (very slow for better gameplay)
    const m = Math.exp(rate * t * 0.5);      // very slow growth - plenty of time to cash out
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

/** Map hash to crash point in [minCrash, maxCrash] with strong skew toward early busts */
function hashToCrash(hex, minCrash, maxCrash) {
  const u = hashToUnitFloat(hex);
  // Strong exponential skew toward lower values
  // Using 1/u^k creates house edge - most crashes happen early
  const k = 3.5; // Higher k = more early crashes
  const skew = 1 - Math.pow(1 - u, k);
  
  // Map to range with bias toward low values
  let v = minCrash + (maxCrash - minCrash) * skew;
  
  // Additional clamping to favor very low crashes (house edge)
  if (u < 0.3) { // 30% chance of very early crash
    v = minCrash + (2 - minCrash) * (u / 0.3); // 1.1 to 2.0
  } else if (u < 0.6) { // 30% chance of early-mid crash
    v = 2 + 1.5 * ((u - 0.3) / 0.3); // 2.0 to 3.5
  } else if (u < 0.85) { // 25% chance of mid crash
    v = 3.5 + 2 * ((u - 0.6) / 0.25); // 3.5 to 5.5
  } else { // 15% chance of high crash
    v = 5.5 + (maxCrash - 5.5) * ((u - 0.85) / 0.15); // 5.5 to 10.0
  }
  
  // clamp & 2 decimals
  return Math.max(minCrash, Math.min(maxCrash, Math.round(v * 100) / 100));
}

// ============================================================================
// STORAGE
// ============================================================================
function safeRead(key, fallback = {}) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function getVault() {
  const rushData = safeRead("mleo_rush_core_v4", {});
  return rushData.vault || 0;
}

function setVaultAmount(amount) {
  const rushData = safeRead("mleo_rush_core_v4", {});
  rushData.vault = amount;
  safeWrite("mleo_rush_core_v4", rushData);
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

// ------------------------------ Main Page -----------------------------------
export default function MLEOCrash() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isFreePlay, setIsFreePlay] = useState(false);
  
  // Game state
  const [phase, setPhase] = useState("betting"); // betting | running | crashed | revealing | intermission
  const [countdown, setCountdown] = useState(ROUND.bettingSeconds);
  const [betAmount, setBetAmount] = useState("1000");
  const [playerBet, setPlayerBet] = useState(null); // { amount:number, accepted:boolean }
  const [canCashOut, setCanCashOut] = useState(false);
  const [cashedOutAt, setCashedOutAt] = useState(null); // multiplier at cashout
  const [payout, setPayout] = useState(null);
  const [autoCashOut, setAutoCashOut] = useState(""); // auto cash out multiplier
  const [autoCashOutEnabled, setAutoCashOutEnabled] = useState(false);

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
  const crashPointRef = useRef(null); // ref for crash point to use in animation loop
  const autoCashOutRef = useRef({ enabled: false, target: 0, cashedOut: false }); // ref for auto cash out
  const playerBetRef = useRef(null); // ref for player bet
  const vaultRef = useRef(0); // ref for vault
  const statsRef = useRef(null); // ref for stats

  // Vault
  const [vault, setVault] = useState(0);
  
  // Stats
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalRounds: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, bestMultiplier: 0, history: [] })
  );

  // ----------------------- Mount -------------------
  useEffect(() => {
    setMounted(true);
    setVault(getVault());
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    // Refresh vault every 2 seconds
    const interval = setInterval(() => {
      setVault(getVault());
    }, 2000);
    
    return () => clearInterval(interval);
  }, [router.query]);

  function refreshVault() {
    setVault(getVault());
  }

  // ----------------------- Lifecycle: start betting window -------------------
  useEffect(() => {
    if (!mounted) return;
    
    // Fresh seeds for the upcoming round
    // serverSeed kept secret until reveal; we show only its hash now.
    (async () => {
      const newServerSeed = crypto.getRandomValues(new Uint32Array(8)).join("-");
      const hash = await sha256Hex(newServerSeed);
      setServerSeed(newServerSeed);
      setServerSeedHash(hash);
      setCrashPoint(null);
      crashPointRef.current = null;
      autoCashOutRef.current = { enabled: false, target: 0, cashedOut: false };
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
  }, [mounted]); // run once on mount

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
        crashPointRef.current = crash; // Store in ref for animation loop
        
        // Setup auto cash out
        autoCashOutRef.current = {
          enabled: autoCashOutEnabled && autoCashOut && Number(autoCashOut) > 0,
          target: Number(autoCashOut) || 0,
          cashedOut: false,
        };
        
        // Start live run
        setPhase("running");
        takeoff();
      })();
    }
  }, [countdown, phase, playerBet, serverSeed, clientSeed, nonce, autoCashOutEnabled, autoCashOut]);

  // ------------------------------- Engine -----------------------------------
  const takeoff = () => {
    startTimeRef.current = performance.now();
    setCanCashOut(true);
    cancelAnimationFrame(rafRef.current);
    
    // Update refs for use in animation loop
    playerBetRef.current = playerBet;
    vaultRef.current = vault;
    statsRef.current = stats;

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startTimeRef.current;
      const m = ROUND.growth(elapsed);
      const mFixed = Math.max(1, Math.floor(m * Math.pow(10, ROUND.decimals)) / Math.pow(10, ROUND.decimals));
      setMultiplier(mFixed);

      // sample for chart (cap samples)
      dataRef.current.push({ t: elapsed, m: mFixed });
      if (dataRef.current.length > 800) dataRef.current.shift();

      // Auto cash out check
      const autoConfig = autoCashOutRef.current;
      const currentPlayerBet = playerBetRef.current;
      const currentVault = vaultRef.current;
      const currentStats = statsRef.current;
      
      if (autoConfig.enabled && !autoConfig.cashedOut && currentPlayerBet?.accepted && mFixed >= autoConfig.target) {
        console.log('AUTO CASH OUT triggered at', mFixed, 'target was', autoConfig.target);
        autoConfig.cashedOut = true; // Mark as cashed out
        
        // Call cashOut directly inline
        setCanCashOut(false);
        setCashedOutAt(mFixed);
        
        const winAmount = Math.round(currentPlayerBet.amount * mFixed * 100) / 100;
        setPayout({ win: true, amount: winAmount, at: mFixed });

        // Credit to vault
        const newVault = currentVault + winAmount;
        setVault(newVault);
        setVaultAmount(newVault);
        vaultRef.current = newVault; // Update ref

        // Update stats
        const newStats = {
          ...currentStats,
          totalRounds: currentStats.totalRounds + 1,
          wins: currentStats.wins + 1,
          totalWon: currentStats.totalWon + winAmount,
          biggestWin: Math.max(currentStats.biggestWin, winAmount),
          bestMultiplier: Math.max(currentStats.bestMultiplier, mFixed),
        };
        setStats(newStats);
        safeWrite(LS_KEY, newStats);
        statsRef.current = newStats; // Update ref
      }

      // Crash?
      const currentCrashPoint = crashPointRef.current;
      if (currentCrashPoint && mFixed >= currentCrashPoint) {
        setMultiplier(currentCrashPoint);
        setPhase("crashed");
        setCanCashOut(false);
        cancelAnimationFrame(rafRef.current);
        
        // Update history with crash point
        const newHistory = [...(stats.history || []), { mult: currentCrashPoint, timestamp: Date.now() }];
        if (newHistory.length > 10) newHistory.shift(); // Keep only last 10
        
        // Resolve loss if not cashed out
        if (!cashedOutAt && playerBet?.accepted) {
          // no payout - loss (only if we haven't already won)
          if (!payout) {
            setPayout({ win: false, amount: 0, at: currentCrashPoint });
          }
          
          // Update stats
          const newStats = {
            ...stats,
            totalRounds: stats.totalRounds + 1,
            totalLost: stats.totalLost + playerBet.amount,
            history: newHistory,
          };
          setStats(newStats);
          safeWrite(LS_KEY, newStats);
        } else {
          // Just update history even if player cashed out
          const newStats = {
            ...stats,
            history: newHistory,
          };
          setStats(newStats);
          safeWrite(LS_KEY, newStats);
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
    crashPointRef.current = null;
    autoCashOutRef.current = { enabled: false, target: 0, cashedOut: false };
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
    let amt = Number(betAmount) || 1000;
    if (!Number.isFinite(amt) || amt < 1000) return;
    if (phase !== "betting") return;
    
    if (isFreePlay) {
      const result = consumeFreePlayToken();
      if (result.success) {
        amt = result.amount;
        setIsFreePlay(false);
        router.replace('/crash', undefined, { shallow: true });
        setPlayerBet({ amount: amt, accepted: false });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      if (amt > vault) return;

      // Deduct from vault
      const newVault = vault - amt;
      setVault(newVault);
      setVaultAmount(newVault);
      setPlayerBet({ amount: amt, accepted: false });
    }
  };

  const cashOut = () => {
    if (!canCashOut || phase !== "running") return;
    if (!playerBet?.accepted) return; // only after takeoff
    setCanCashOut(false);
    setCashedOutAt(multiplier);
    // DON'T cancel animation - game continues for other players!

    const winAmount = Math.round(playerBet.amount * multiplier * 100) / 100;
    setPayout({ win: true, amount: winAmount, at: multiplier });

    // Credit to vault
    const newVault = vault + winAmount;
    setVault(newVault);
    setVaultAmount(newVault);

    // Update stats
    const newStats = {
      ...stats,
      totalRounds: stats.totalRounds + 1,
      wins: stats.wins + 1,
      totalWon: stats.totalWon + winAmount,
      biggestWin: Math.max(stats.biggestWin, winAmount),
      bestMultiplier: Math.max(stats.bestMultiplier, multiplier),
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);

    // Game continues! Don't end the round
    // setPhase("revealing");
    // setTimeout(() => startNextRound(), ROUND.intermissionMs);
  };

  // ------------------------------- Derived ----------------------------------
  const chartData = dataRef.current;
  const maxY = useMemo(() => {
    if (!chartData || chartData.length === 0) return 3;
    const current = Math.max(1, ...chartData.map((p) => p.m));
    // Keep Y axis more stable - only grow when needed
    // This creates a "zoomed out" view that shows the curve better
    if (current <= 2) return 3;
    if (current <= 3) return 4;
    if (current <= 5) return 6;
    if (current <= 7) return 8;
    return Math.min(Math.ceil(current) + 2, ROUND.maxCrash);
  }, [multiplier, crashPoint]); // Use multiplier instead of chartData to trigger updates

  // Build SVG path
  const chart = useMemo(() => {
    const W = 600;
    const H = 260;
    const padL = 36, padR = 12, padT = 16, padB = 28;
    const iw = W - padL - padR;
    const ih = H - padT - padB;
    const mMin = 1;
    const mMax = maxY;

    // Default scaleY function (even when no data)
    const scaleY = (m) => padT + ih - ((m - mMin) / (mMax - mMin)) * ih;

    if (!chartData.length) {
      return { W, H, d: "", xCrash: null, yCrash: null, padL, padR, padT, padB, scaleY, mMin, mMax };
    }

    const tMax = chartData[chartData.length - 1].t || 1000;
    const t0 = chartData[0].t;
    const tSpan = Math.max(1000, tMax - t0); // avoid div/0

    const scaleX = (t) => padL + ((t - t0) / tSpan) * iw;

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
  }, [multiplier, crashPoint, maxY]); // Use multiplier to update chart every frame

  if (!mounted) {
    return (
      <Layout title="MLEO Crash">
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-950 via-zinc-900 to-black">
          <div className="text-white text-xl">Loading...</div>
        </div>
      </Layout>
    );
  }

  // ------------------------------- Render -----------------------------------
  return (
    <Layout title="MLEO Crash">
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>

            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🚀</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-yellow-300 bg-clip-text text-transparent">
                  {isFreePlay && <span className="text-amber-400">🎁 </span>}
                  MLEO Crash
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">
                {isFreePlay ? "Playing with a free token - good luck!" : "Multiplier Betting Game"}
              </div>
            </div>

            <div className="w-[100px]"></div>
          </header>

          {/* MAIN GAME BOARD */}
          <div className="rounded-3xl p-3 sm:p-6 bg-gradient-to-br from-red-900/30 via-orange-900/20 to-yellow-900/30 border-2 sm:border-4 border-red-600/50 shadow-2xl mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CHART SECTION */}
              <div className="md:col-span-2 rounded-2xl bg-zinc-900/70 p-4 md:p-6 shadow-lg">
                {/* Top row: seeds + multiplier */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div className="text-xs text-zinc-400">
                    <div>
                      <span className="text-zinc-500">Hash:</span>{" "}
                      <span className="font-mono">{serverSeedHash.slice(0, 16)}…</span>
                    </div>
                    {phase !== "betting" && (phase === "revealing" || phase === "crashed") ? (
                      <div className="mt-1">
                        <span className="text-zinc-500">Seed:</span>{" "}
                        <span className="font-mono break-all text-[10px]">{serverSeed.slice(0, 30)}…</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <div className="text-5xl md:text-6xl font-black">
                      <span className={phase === "running" ? "text-emerald-400" : phase === "crashed" ? "text-red-400" : "text-zinc-300"}>
                        {multiplier.toFixed(ROUND.decimals)}×
                      </span>
                    </div>
                    {crashPoint && phase === "crashed" ? (
                      <div className="text-xs text-zinc-500">Crash: {crashPoint.toFixed(2)}×</div>
                    ) : null}
                  </div>
                </div>

                {/* Chart */}
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
                      <path d={chart.d} fill="none" stroke={phase === "crashed" ? "#ef4444" : "#22c55e"} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                    ) : null}

                    {/* crash marker - removed to prevent spoilers */}
                  </svg>
                </div>

                {/* Run controls */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-zinc-400">
                    {phase === "betting" ? (
                      <span>🔒 Bets lock in <span className="text-white font-semibold">{countdown}s</span></span>
                    ) : phase === "running" ? (
                      <span>🚀 Running… click <span className="text-white font-semibold">CASH OUT</span> before crash!</span>
                    ) : phase === "crashed" ? (
                      <span className="text-red-400">💥 Crashed at {crashPoint?.toFixed(2)}×</span>
                    ) : phase === "revealing" ? (
                      <span>🔎 Revealing seeds… Next round soon.</span>
                    ) : (
                      <span>⏳ Next round soon…</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Auto Cash Out - Left side */}
                    <div className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        id="autoCashOut"
                        checked={autoCashOutEnabled}
                        onChange={(e) => setAutoCashOutEnabled(e.target.checked)}
                        className="rounded"
                        disabled={phase !== "betting"}
                      />
                      <label htmlFor="autoCashOut" className="text-zinc-400 whitespace-nowrap">Auto @</label>
                      <input
                        type="number"
                        min="1.1"
                        max="10"
                        step="0.1"
                        value={autoCashOut}
                        onChange={(e) => setAutoCashOut(e.target.value)}
                        className="w-16 rounded bg-zinc-950/70 border border-zinc-800 px-2 py-1 text-white text-xs"
                        placeholder="2.0"
                        disabled={phase !== "betting"}
                      />
                      <span className="text-zinc-500">×</span>
                    </div>
                    
                    {/* Cash Out Button - Right side */}
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
                      💰 CASH OUT
                    </button>
                  </div>
                </div>
              </div>

              {/* BET SIDEBAR */}
              <div className="rounded-2xl bg-zinc-900/70 p-4 md:p-5 shadow-lg">
                <h3 className="text-lg font-semibold mb-3">Place Your Bet</h3>
                
                <div className="mb-3">
                  <label className="block text-sm text-zinc-400 mb-1">Amount (MLEO)</label>
                  <input
                    type="number"
                    min="1000"
                    step="100"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="1000"
                    disabled={phase !== "betting"}
                  />
                  <div className="flex gap-2 mt-2 justify-center flex-wrap">
                    {[1000, 2500, 5000, 10000].map((v) => (
                      <button 
                        key={v} 
                        onClick={() => setBetAmount(String(v))} 
                        className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                        disabled={phase !== "betting"}
                      >
                        {v >= 1000 ? `${v/1000}K` : v}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={placeBet}
                  disabled={phase !== "betting" || !betAmount || Number(betAmount) <= 0 || Number(betAmount) > vault}
                  className="w-full rounded-xl bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 px-4 py-2.5 font-semibold text-white shadow hover:from-red-400 hover:via-orange-400 hover:to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🎯 Join Round
                </button>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Your bet</span>
                    <span className="font-medium">
                      {playerBet ? `${fmt(playerBet.amount)} ${playerBet.accepted ? "(🔒)" : "(⏳)"}` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Potential win</span>
                    <span className="font-medium text-emerald-400">
                      {playerBet?.accepted ? `${fmt(Math.round(playerBet.amount * multiplier))}` : "-"}
                    </span>
                  </div>
                  {payout ? (
                    <div className={`mt-2 rounded-lg px-3 py-2 ${payout.win ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}>
                      {payout.win
                        ? `✅ Won ${fmt(payout.amount)} at ${payout.at?.toFixed(2)}×`
                        : `❌ Lost — crashed at ${payout.at?.toFixed(2)}×`}
                    </div>
                  ) : null}
                </div>

                {/* RECENT HISTORY */}
                <div className="mt-5 border-t border-zinc-800/80 pt-3">
                  <div className="text-xs font-semibold text-zinc-300 mb-2">🎲 Last 10 Crashes</div>
                  {stats.history && stats.history.length > 0 ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {stats.history.slice().reverse().map((item, idx) => (
                        <div
                          key={idx}
                          className={`px-2 py-1 rounded text-xs font-bold border ${
                            item.mult >= 5 ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400" :
                            item.mult >= 3 ? "bg-green-500/20 border-green-500/50 text-green-400" :
                            item.mult >= 2 ? "bg-blue-500/20 border-blue-500/50 text-blue-400" :
                            item.mult >= 1.5 ? "bg-purple-500/20 border-purple-500/50 text-purple-400" :
                            "bg-red-500/20 border-red-500/50 text-red-400"
                          }`}
                        >
                          {item.mult.toFixed(2)}×
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">No crashes yet...</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* STATS - 4 Windows below game */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Rounds</div>
              <div className="text-lg font-bold">{stats.totalRounds}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Win Rate</div>
              <div className="text-lg font-bold text-green-400">
                {stats.totalRounds > 0 ? `${Math.round((stats.wins / stats.totalRounds) * 100)}%` : "0%"}
              </div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Best Multiplier</div>
              <div className="text-lg font-bold text-amber-400">×{stats.bestMultiplier.toFixed(2)}</div>
            </div>
          </div>


          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Betting Phase (30s):</strong> Place your bet before the round starts</li>
              <li>• <strong>Running Phase:</strong> Watch the multiplier grow from 1.00× upward</li>
              <li>• <strong>Cash Out:</strong> Click "CASH OUT" before it crashes to win bet × multiplier</li>
              <li>• <strong>Auto Cash Out:</strong> Enable auto-exit at a specific multiplier (e.g., 2.0×) - set during betting phase</li>
              <li>• <strong>Crash:</strong> If you don't cash out in time, you lose your bet</li>
              <li>• <strong>Multiplayer:</strong> Game continues for all players until crash - your cash out doesn't end the round!</li>
              <li>• <strong>Provably Fair:</strong> Each round's crash point is determined by a hash shown before takeoff</li>
            </ul>
          </div>

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-red-900/20 to-orange-900/20 border border-red-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-zinc-400">Total Rounds</div>
                <div className="text-xl font-bold">{stats.totalRounds}</div>
              </div>
              <div>
                <div className="text-zinc-400">Wins</div>
                <div className="text-xl font-bold text-green-400">{stats.wins}</div>
              </div>
              <div>
                <div className="text-zinc-400">Total Won</div>
                <div className="text-xl font-bold text-green-400">{fmt(stats.totalWon)}</div>
              </div>
              <div>
                <div className="text-zinc-400">Total Lost</div>
                <div className="text-xl font-bold text-red-400">{fmt(stats.totalLost)}</div>
              </div>
              <div>
                <div className="text-zinc-400">Biggest Win</div>
                <div className="text-xl font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
              </div>
              <div>
                <div className="text-zinc-400">Best Multiplier</div>
                <div className="text-xl font-bold text-purple-400">×{stats.bestMultiplier.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

