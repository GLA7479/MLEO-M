// ============================================================================
// MLEO Crash — Multiplayer with Server Polling
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";

const LS_KEY = "mleo_crash_v1";
const POLL_INTERVAL = 200; // Poll every 200ms for smooth updates

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

// Generate unique user ID
function getUserId() {
  let userId = localStorage.getItem('crash_user_id');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem('crash_user_id', userId);
  }
  return userId;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CrashMultiplayer() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVault] = useState(0);
  
  // Server state (polled from API)
  const [serverState, setServerState] = useState({
    phase: 'betting',
    multiplier: 1.0,
    crashPoint: null,
    serverSeedHash: '',
    serverSeed: null,
    timeLeft: 30,
    history: [],
    totalBets: 0,
  });
  
  // Local player state
  const [betAmount, setBetAmount] = useState("");
  const [autoCashOut, setAutoCashOut] = useState("");
  const [autoCashOutEnabled, setAutoCashOutEnabled] = useState(false);
  const [playerBet, setPlayerBet] = useState(null);
  const [payout, setPayout] = useState(null);
  const [lastRoundId, setLastRoundId] = useState(null);
  
  // Chart data
  const dataRef = useRef([]);
  
  // Stats
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalRounds: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, bestMultiplier: 0, history: [] })
  );

  const userIdRef = useRef(null);

  // ============================================================================
  // MOUNT & POLLING
  // ============================================================================
  useEffect(() => {
    setMounted(true);
    setVault(getVault());
    userIdRef.current = getUserId();
    
    // Vault refresh
    const vaultInterval = setInterval(() => {
      setVault(getVault());
    }, 2000);
    
    // Poll server state
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/crash/state?userId=${userIdRef.current}`);
        const data = await res.json();
        
        setServerState(data);
        
        // Update chart data
        if (data.phase === 'running' && data.multiplier > 1) {
          const elapsed = Date.now(); // approximate time
          dataRef.current.push({ t: elapsed, m: data.multiplier });
          if (dataRef.current.length > 800) dataRef.current.shift();
        } else if (data.phase === 'betting') {
          dataRef.current = []; // Clear chart for new round
        }
        
        // Check if new round started
        if (data.roundId !== lastRoundId) {
          setLastRoundId(data.roundId);
          setPlayerBet(null);
          setPayout(null);
          dataRef.current = [];
        }
        
        // Update player bet from server
        if (data.player && data.player.bet) {
          setPlayerBet(data.player.bet);
          
          // Check if auto cashed out or crashed
          if (data.player.bet.cashedOutAt && !payout) {
            const winAmount = Math.round(data.player.bet.amount * data.player.bet.cashedOutAt * 100) / 100;
            setPayout({ win: true, amount: winAmount, at: data.player.bet.cashedOutAt });
            
            // Update vault
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
              bestMultiplier: Math.max(stats.bestMultiplier, data.player.bet.cashedOutAt),
            };
            setStats(newStats);
            safeWrite(LS_KEY, newStats);
          } else if (data.phase === 'crashed' && data.player.bet && !data.player.bet.cashedOutAt && !payout) {
            // Lost
            setPayout({ win: false, amount: 0, at: data.crashPoint });
            
            const newStats = {
              ...stats,
              totalRounds: stats.totalRounds + 1,
              totalLost: stats.totalLost + data.player.bet.amount,
            };
            setStats(newStats);
            safeWrite(LS_KEY, newStats);
          }
        }
        
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, POLL_INTERVAL);
    
    return () => {
      clearInterval(vaultInterval);
      clearInterval(pollInterval);
    };
  }, []);

  function refreshVault() {
    setVault(getVault());
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================
  const placeBet = async () => {
    const amt = Number(betAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (serverState.phase !== "betting") return;
    if (amt > vault) return;

    // Deduct from vault
    const newVault = vault - amt;
    setVault(newVault);
    setVaultAmount(newVault);

    try {
      const res = await fetch('/api/crash/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          amount: amt,
          autoCashOut: autoCashOutEnabled && autoCashOut ? Number(autoCashOut) : null,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setPlayerBet({ amount: amt, autoCashOut: autoCashOutEnabled && autoCashOut ? Number(autoCashOut) : null });
      } else {
        // Refund on error
        setVault(vault);
        setVaultAmount(vault);
        alert(data.error || 'Failed to place bet');
      }
    } catch (error) {
      console.error('Bet error:', error);
      // Refund on error
      setVault(vault);
      setVaultAmount(vault);
    }
  };

  const cashOut = async () => {
    if (serverState.phase !== 'running') return;
    if (!playerBet || playerBet.cashedOutAt) return;

    try {
      const res = await fetch('/api/crash/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
        }),
      });
      
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Failed to cash out');
      }
      // The polling will update the state
    } catch (error) {
      console.error('Cashout error:', error);
    }
  };

  // ============================================================================
  // CHART
  // ============================================================================
  const chartData = dataRef.current;
  const maxY = useMemo(() => {
    if (!chartData || chartData.length === 0) return 3;
    const current = serverState.multiplier;
    if (current <= 2) return 3;
    if (current <= 3) return 4;
    if (current <= 5) return 6;
    if (current <= 7) return 8;
    return Math.min(Math.ceil(current) + 2, 10);
  }, [serverState.multiplier]);

  const chart = useMemo(() => {
    const W = 600;
    const H = 260;
    const padL = 36, padR = 12, padT = 16, padB = 28;
    const iw = W - padL - padR;
    const ih = H - padT - padB;
    const mMin = 1;
    const mMax = maxY;

    const scaleY = (m) => padT + ih - ((m - mMin) / (mMax - mMin)) * ih;

    if (!chartData.length) {
      return { W, H, d: "", xCrash: null, yCrash: null, padL, padR, padT, padB, scaleY, mMin, mMax };
    }

    const t0 = chartData[0].t;
    const tMax = chartData[chartData.length - 1].t || t0 + 1000;
    const tSpan = Math.max(1000, tMax - t0);
    const scaleX = (t) => padL + ((t - t0) / tSpan) * iw;

    let d = "";
    chartData.forEach((p, i) => {
      const x = scaleX(p.t);
      const y = scaleY(p.m);
      d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });

    let xCrash = null, yCrash = null;
    if (serverState.crashPoint && chartData.length > 0) {
      const lastX = scaleX(chartData[chartData.length - 1].t);
      xCrash = lastX;
      yCrash = scaleY(serverState.crashPoint);
    }

    return { W, H, d, xCrash, yCrash, padL, padR, padT, padB, scaleY, mMin, mMax };
  }, [serverState.multiplier, serverState.crashPoint, maxY, chartData.length]);

  if (!mounted) {
    return (
      <Layout title="MLEO Crash">
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-950 via-zinc-900 to-black">
          <div className="text-white text-xl">Loading...</div>
        </div>
      </Layout>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <Layout title="MLEO Crash">
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {/* HEADER */}
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
                  MLEO Crash
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Multiplayer • Real-time</div>
            </div>

            <div className="w-[100px]"></div>
          </header>

          {/* MAIN GAME BOARD */}
          <div className="rounded-3xl p-3 sm:p-6 bg-gradient-to-br from-red-900/30 via-orange-900/20 to-yellow-900/30 border-2 sm:border-4 border-red-600/50 shadow-2xl mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CHART SECTION */}
              <div className="md:col-span-2 rounded-2xl bg-zinc-900/70 p-4 md:p-6 shadow-lg">
                {/* Top row: info + multiplier */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div className="text-xs text-zinc-400">
                    <div>
                      <span className="text-zinc-500">Hash:</span>{" "}
                      <span className="font-mono">{serverState.serverSeedHash?.slice(0, 16)}…</span>
                    </div>
                    {serverState.serverSeed && (
                      <div className="mt-1">
                        <span className="text-zinc-500">Seed:</span>{" "}
                        <span className="font-mono break-all text-[10px]">{serverState.serverSeed.slice(0, 30)}…</span>
                      </div>
                    )}
                    <div className="mt-1 text-cyan-400">
                      <span className="text-zinc-500">Players:</span> {serverState.totalBets}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-5xl md:text-6xl font-black">
                      <span className={
                        serverState.phase === "running" ? "text-emerald-400" : 
                        serverState.phase === "crashed" ? "text-red-400" : 
                        "text-zinc-300"
                      }>
                        {serverState.multiplier.toFixed(2)}×
                      </span>
                    </div>
                    {serverState.crashPoint && serverState.phase !== "betting" ? (
                      <div className="text-xs text-zinc-500">Crash: {serverState.crashPoint.toFixed(2)}×</div>
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
                      <path 
                        d={chart.d} 
                        fill="none" 
                        stroke={serverState.phase === "crashed" ? "#ef4444" : "#22c55e"} 
                        strokeWidth="3" 
                        strokeLinejoin="round" 
                        strokeLinecap="round" 
                      />
                    ) : null}

                    {/* crash marker */}
                    {serverState.phase !== "betting" && serverState.crashPoint && chart.xCrash != null ? (
                      <g>
                        <circle cx={chart.xCrash} cy={chart.yCrash} r="5" fill="#ef4444" />
                        <text x={chart.xCrash + 6} y={chart.yCrash - 6} fontSize="11" fill="#ef4444">
                          {serverState.crashPoint.toFixed(2)}×
                        </text>
                      </g>
                    ) : null}
                  </svg>
                </div>

                {/* Run controls */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-zinc-400">
                    {serverState.phase === "betting" ? (
                      <span>🔒 Bets lock in <span className="text-white font-semibold">{serverState.timeLeft}s</span></span>
                    ) : serverState.phase === "running" ? (
                      <span>🚀 Running… cash out before crash!</span>
                    ) : serverState.phase === "crashed" ? (
                      <span className="text-red-400">💥 Crashed at {serverState.crashPoint?.toFixed(2)}×</span>
                    ) : (
                      <span>⏳ Next round soon…</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Auto Cash Out */}
                    <div className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        id="autoCashOut"
                        checked={autoCashOutEnabled}
                        onChange={(e) => setAutoCashOutEnabled(e.target.checked)}
                        className="rounded"
                        disabled={serverState.phase !== "betting"}
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
                        disabled={serverState.phase !== "betting"}
                      />
                      <span className="text-zinc-500">×</span>
                    </div>
                    
                    {/* Cash Out Button */}
                    <button
                      onClick={cashOut}
                      disabled={serverState.phase !== "running" || !playerBet || playerBet.cashedOutAt}
                      className={[
                        "rounded-xl px-5 py-3 text-sm font-semibold shadow transition",
                        serverState.phase === "running" && playerBet && !playerBet.cashedOutAt
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
                    min="0"
                    step="100"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="e.g. 1000"
                    disabled={serverState.phase !== "betting"}
                  />
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[100, 500, 1000, 5000].map((v) => (
                      <button
                        key={v}
                        onClick={() => setBetAmount(String(v))}
                        disabled={serverState.phase !== "betting"}
                        className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={placeBet}
                  disabled={serverState.phase !== "betting" || !betAmount || Number(betAmount) <= 0 || Number(betAmount) > vault || playerBet}
                  className="w-full rounded-xl bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 px-4 py-2.5 font-semibold text-white shadow hover:from-red-400 hover:via-orange-400 hover:to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🎯 {playerBet ? 'Bet Placed' : 'Join Round'}
                </button>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Your bet</span>
                    <span className="font-medium">
                      {playerBet ? `${fmt(playerBet.amount)} ${playerBet.cashedOutAt ? '(✅)' : '(🔒)'}` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Potential win</span>
                    <span className="font-medium text-emerald-400">
                      {playerBet && !playerBet.cashedOutAt ? `${fmt(Math.round(playerBet.amount * serverState.multiplier))}` : "-"}
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
                  {serverState.history && serverState.history.length > 0 ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {serverState.history.slice().reverse().map((item, idx) => (
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
              <li>• <strong>Multiplayer:</strong> All players share the same round - it runs continuously!</li>
              <li>• <strong>Betting Phase (30s):</strong> Place your bet before the round starts</li>
              <li>• <strong>Running Phase:</strong> Watch the multiplier grow from 1.00× upward</li>
              <li>• <strong>Cash Out:</strong> Click "CASH OUT" or set auto cash out before it crashes</li>
              <li>• <strong>Auto Cash Out:</strong> Set a target multiplier (e.g., 2.0×) for automatic exit</li>
              <li>• <strong>Crash:</strong> The game crashes randomly - if you didn't cash out, you lose</li>
              <li>• <strong>Provably Fair:</strong> Crash point is determined by SHA256 hash shown before round</li>
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

