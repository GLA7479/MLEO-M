// ============================================================================
// MLEO Crash2 - Full-Screen Game Template with Live Chart
// Crash with live chart + new UI template
// ============================================================================

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

function useIOSViewportFix() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const setVH = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
    };
    const onOrient = () => requestAnimationFrame(() => setTimeout(setVH, 250));
    setVH();
    if (vv) {
      vv.addEventListener("resize", setVH);
      vv.addEventListener("scroll", setVH);
    }
    window.addEventListener("orientationchange", onOrient);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", setVH);
        vv.removeEventListener("scroll", setVH);
      }
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);
}

const LS_KEY = "mleo_crash2_v1";
const MIN_BET = 1000;
const ROUND = {
  bettingSeconds: 30,
  intermissionMs: 4000,
  fps: 60,
  decimals: 2,
  minCrash: 1.1,
  maxCrash: 10.0,
  growth: (elapsedMs) => {
    const t = elapsedMs / 1000;
    const rate = 0.85;
    const m = Math.exp(rate * t * 0.6);
    return Math.max(1, m);
  },
};
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 13;
const MINING_CLAIM_ABI = [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] }];
const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hashToUnitFloat(hex) {
  const slice = hex.slice(0, 13);
  const int = parseInt(slice, 16);
  const max = Math.pow(16, slice.length);
  return int / max;
}

function hashToCrash(hex, minCrash, maxCrash) {
  const u = hashToUnitFloat(hex);
  const k = 1.45;
  const skew = Math.pow(u, k);
  const v = minCrash + (maxCrash - minCrash) * skew;
  return Math.max(minCrash, Math.min(maxCrash, Math.round(v * 100) / 100));
}

function safeRead(key, fallback = {}) { if (typeof window === "undefined") return fallback; try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val) { if (typeof window === "undefined") return; try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function getVault() { const rushData = safeRead("mleo_rush_core_v4", {}); return rushData.vault || 0; }
function setVault(amount) { const rushData = safeRead("mleo_rush_core_v4", {}); rushData.vault = amount; safeWrite("mleo_rush_core_v4", rushData); }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return Math.floor(n).toString(); }
function shortAddr(addr) { if (!addr || addr.length < 10) return addr || ""; return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }

export default function Crash2Page() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [phase, setPhase] = useState("betting");
  const [countdown, setCountdown] = useState(ROUND.bettingSeconds);
  const [playerBet, setPlayerBet] = useState(null);
  const [canCashOut, setCanCashOut] = useState(false);
  const [cashedOutAt, setCashedOutAt] = useState(null);
  const [payout, setPayout] = useState(null);
  const [serverSeed, setServerSeed] = useState("");
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [clientSeed, setClientSeed] = useState(() => Math.random().toString(36).slice(2));
  const [nonce, setNonce] = useState(0);
  const [crashPoint, setCrashPoint] = useState(null);
  const [multiplier, setMultiplier] = useState(1.0);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [collectAmount, setCollectAmount] = useState(1000);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const clickSound = useRef(null);
  const winSound = useRef(null);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalGames: 0, totalBet: 0, totalWon: 0, biggestWin: 0, wins: 0, lastBet: MIN_BET }));

  const startTimeRef = useRef(0);
  const rafRef = useRef(0);
  const dataRef = useRef([]);

  const playSfx = (sound) => { if (sfxMuted || !sound) return; try { sound.currentTime = 0; sound.play().catch(() => {}); } catch {} };

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) { setBetAmount(String(savedStats.lastBet)); }
    const interval = setInterval(() => { const status = getFreePlayStatus(); setFreePlayTokens(status.tokens); setVaultState(getVault()); }, 2000);
    if (typeof Audio !== "undefined") { try { clickSound.current = new Audio(S_CLICK); winSound.current = new Audio(S_WIN); } catch {} }
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { clearInterval(interval); document.removeEventListener("fullscreenchange", handleFullscreenChange); };
  }, [router.query]);

  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);
  useEffect(() => { if (payout) { setShowResultPopup(true); const timer = setTimeout(() => setShowResultPopup(false), 4000); return () => clearTimeout(timer); } }, [payout]);

  const openWalletModalUnified = () => isConnected ? openAccountModal?.() : openConnectModal?.();
  const hardDisconnect = () => { disconnect?.(); setMenuOpen(false); };

  const collectToWallet = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (chainId !== CLAIM_CHAIN_ID) { try { await switchChain?.({ chainId: CLAIM_CHAIN_ID }); } catch { alert("Switch to BSC Testnet"); return; } }
    if (!CLAIM_ADDRESS) { alert("Missing CLAIM address"); return; }
    if (collectAmount <= 0 || collectAmount > vault) { alert("Invalid amount!"); return; }
    setClaiming(true);
    try {
      const amountUnits = parseUnits(Number(collectAmount).toFixed(Math.min(2, MLEO_DECIMALS)), MLEO_DECIMALS);
      const hash = await writeContractAsync({ address: CLAIM_ADDRESS, abi: MINING_CLAIM_ABI, functionName: "claim", args: [BigInt(GAME_ID), amountUnits], chainId: CLAIM_CHAIN_ID, account: address });
      await publicClient.waitForTransactionReceipt({ hash });
      const newVault = Math.max(0, vault - collectAmount);
      setVault(newVault); setVaultState(newVault);
      alert(`✅ Sent ${fmt(collectAmount)} MLEO to wallet!`);
      setShowVaultModal(false);
    } catch (err) { console.error(err); alert("Claim failed or rejected"); } finally { setClaiming(false); }
  };

  const placeBet = () => {
    playSfx(clickSound.current);
    let amt = Number(betAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (phase !== "betting") return;
    
    const currentVault = getVault();
    if (amt > currentVault) { alert('Insufficient MLEO in vault'); return; }
    setVault(currentVault - amt); setVaultState(currentVault - amt);
    setPlayerBet({ amount: amt, accepted: false });
  };

  const cashOut = () => {
    if (!canCashOut || phase !== "running") return;
    if (!playerBet?.accepted) return;
    playSfx(winSound.current);
    setCanCashOut(false);
    setCashedOutAt(multiplier);
    cancelAnimationFrame(rafRef.current);

    const winAmount = Math.round(playerBet.amount * multiplier * 100) / 100;
    setPayout({ win: true, amount: winAmount, at: multiplier });

    const newVault = getVault() + winAmount;
    setVault(newVault); setVaultState(newVault);
    
    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      totalBet: stats.totalBet + playerBet.amount,
      wins: stats.wins + 1,
      totalWon: stats.totalWon + winAmount,
      biggestWin: Math.max(stats.biggestWin, winAmount),
      lastBet: playerBet.amount
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);

    setPhase("revealing");
    setTimeout(() => startNextRound(), ROUND.intermissionMs);
  };

  const startNextRound = async () => {
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

      dataRef.current.push({ t: elapsed, m: mFixed });
      if (dataRef.current.length > 800) dataRef.current.shift();

      if (crashPoint && mFixed >= crashPoint) {
        setMultiplier(crashPoint);
        setPhase("crashed");
        setCanCashOut(false);
        cancelAnimationFrame(rafRef.current);
        if (!cashedOutAt && playerBet?.accepted) {
          setPayout({ win: false, amount: 0, at: crashPoint });
          const newStats = {
            ...stats,
            totalGames: stats.totalGames + 1,
            totalBet: stats.totalBet + playerBet.amount,
            lastBet: playerBet.amount
          };
          setStats(newStats);
          safeWrite(LS_KEY, newStats);
        }
        setTimeout(() => setPhase("revealing"), 600);
        setTimeout(() => startNextRound(), 600 + ROUND.intermissionMs);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const resetGame = () => { setPayout(null); setShowResultPopup(false); setPhase("betting"); setCountdown(ROUND.bettingSeconds); setMultiplier(1.0); setCrashPoint(null); setPlayerBet(null); setCanCashOut(false); };
  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  // Lifecycle: start betting window
  useEffect(() => {
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

    setPhase("betting");
    setCountdown(ROUND.bettingSeconds);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) clearInterval(id);
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // When betting ends -> lock bets and takeoff
  useEffect(() => {
    if (phase !== "betting") return;
    if (countdown <= 0) {
      if (playerBet && !playerBet.accepted) {
        setPlayerBet({ ...playerBet, accepted: true });
      }
      (async () => {
        const h = await sha256Hex(`${serverSeed}|${clientSeed}|${nonce}`);
        const crash = hashToCrash(h, ROUND.minCrash, ROUND.maxCrash);
        setCrashPoint(crash);
        setPhase("running");
        takeoff();
      })();
    }
  }, [countdown, phase, playerBet, serverSeed, clientSeed, nonce]);

  const chartData = dataRef.current;
  const maxY = useMemo(() => {
    const current = Math.max(1, ...chartData.map((p) => p.m));
    const ceil = Math.ceil(Math.max(current, crashPoint || 1) * 1.1 * 10) / 10;
    return Math.min(ceil, ROUND.maxCrash);
  }, [chartData, crashPoint]);

  const chart = useMemo(() => {
    const W = 600;
    const H = 200;
    const mMin = 1;
    const mMax = maxY;
    const scaleY = (m) => H - 28 - ((m - mMin) / (mMax - mMin)) * (H - 44);
    const scaleX = (t) => 36 + (t / 10000) * (W - 48);
    
    let d = "";
    if (chartData.length > 1) {
      d = chartData.map((p, i) => {
        const x = scaleX(p.t);
        const y = scaleY(p.m);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ");
    }

    const xCrash = crashPoint ? scaleX((crashPoint - 1) / 0.6 * 1000) : null;
    const yCrash = crashPoint ? scaleY(crashPoint) : null;

    return { W, H, mMin, mMax, scaleY, scaleX, d, xCrash, yCrash };
  }, [chartData, maxY, crashPoint]);

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-orange-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-red-900 via-black to-orange-900" style={{ height: 'var(--app-100vh, 100vh)' }}>
        <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3">
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={backSafe} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              {freePlayTokens > 0 && (<button onClick={() => placeBet()} className="relative px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all" title={`${freePlayTokens} Free Play${freePlayTokens > 1 ? 's' : ''} Available`}><span className="text-base">🎁</span><span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{freePlayTokens}</span></button>)}
            </div>
            <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
              <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
            </div>
          </div>
        </div>

        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-16 pt-14 overflow-y-auto" style={{ minHeight: '100%' }}>
          <div className="text-center mb-3"><h1 className="text-3xl md:text-4xl font-extrabold text-white mb-1">📈 Crash2</h1><p className="text-white/70 text-sm">Watch it grow • Cash out before crash!</p></div>
          <div className="grid grid-cols-3 gap-2 mb-3 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Vault</div><div className="text-lg font-bold text-emerald-400">{fmt(vault)}</div></div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Bet</div><div className="text-lg font-bold text-amber-400">{fmt(Number(betAmount))}</div></div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Multiplier</div><div className="text-lg font-bold text-red-400">{multiplier.toFixed(ROUND.decimals)}×</div></div>
          </div>

          <div className="mb-3" style={{ minHeight: '140px' }}>
            <div className="bg-black/20 rounded-xl p-4 border border-white/10">
              <div className="text-center mb-2">
                <div className="text-4xl font-bold text-white">
                  <span className={phase === "running" ? "text-emerald-400" : "text-zinc-300"}>
                    {multiplier.toFixed(ROUND.decimals)}×
                  </span>
                </div>
                {crashPoint && (<div className="text-xs text-white/60">Crash at: {crashPoint.toFixed(2)}×</div>)}
              </div>
              <div className="rounded-xl bg-zinc-950/70 p-2 ring-1 ring-zinc-800">
                <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full h-32" role="img" aria-label="Crash multiplier chart">
                  <line x1="36" y1="16" x2="36" y2={chart.H - 28} stroke="#3f3f46" strokeWidth="1" />
                  <line x1="36" y1={chart.H - 28} x2={chart.W - 12} y2={chart.H - 28} stroke="#3f3f46" strokeWidth="1" />
                  {Array.from({ length: 6 }).map((_, i) => {
                    const m = chart.mMin + ((chart.mMax - chart.mMin) * i) / 5;
                    const y = chart.scaleY(m);
                    return (<g key={i}><line x1="32" y1={y} x2="36" y2={y} stroke="#52525b" /><text x="30" y={y + 4} fontSize="10" textAnchor="end" fill="#a1a1aa">{m.toFixed(1)}×</text></g>);
                  })}
                  {chart.d && (<path d={chart.d} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
                  {phase !== "betting" && crashPoint && chart.xCrash != null && (<g><circle cx={chart.xCrash} cy={chart.yCrash} r="5" fill="#ef4444" /><text x={chart.xCrash + 6} y={chart.yCrash - 6} fontSize="11" fill="#ef4444">{crashPoint.toFixed(2)}×</text></g>)}
                </svg>
              </div>
            </div>
          </div>

          <div className="mb-3" style={{ minHeight: '48px' }}>
            <div className="text-center text-sm text-white/70 mb-2">
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
            <button onClick={cashOut} disabled={!canCashOut || phase !== "running" || !playerBet?.accepted} className={`w-full py-3 rounded-lg font-bold text-base transition-all ${canCashOut && phase === "running" && playerBet?.accepted ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-zinc-800 text-zinc-400 cursor-not-allowed"}`}>CASH OUT</button>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.max(MIN_BET, current - 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={phase !== "betting"} className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50">−</button>
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} disabled={phase !== "betting"} className="w-32 h-12 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-sm" min={MIN_BET} />
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={phase !== "betting"} className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50">+</button>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button onClick={placeBet} disabled={phase !== "betting" || !betAmount || Number(betAmount) <= 0 || Number(betAmount) > vault} className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed">JOIN ROUND</button>
            <div className="flex gap-2">
              <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
              <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
              <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
            </div>
          </div>
        </div>

        {showResultPopup && payout && (<div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"><div className={`${payout.win ? 'bg-green-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}><div className="text-4xl mb-2">{payout.win ? '📈' : '💥'}</div><div className="text-2xl font-bold mb-1">{payout.win ? 'CASHED OUT!' : 'CRASHED!'}</div><div className="text-lg">{payout.win ? `+${fmt(payout.amount)} MLEO` : `Crashed at ${payout.at?.toFixed(2)}×`}</div></div></div>)}

        {menuOpen && (<div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}><div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div><div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div><div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div><div className="mt-4 text-xs opacity-70"><p>Crash2 v1.0</p></div></div></div>)}

        {showHowToPlay && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">📈 How to Play</h2><div className="space-y-3 text-sm"><p><strong>1. Place Bet:</strong> Choose your bet amount</p><p><strong>2. Watch Multiplier:</strong> It grows from 1.00×</p><p><strong>3. Cash Out:</strong> Click before it crashes!</p><p><strong>4. Win Big:</strong> Higher multiplier = bigger win!</p><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3"><p className="text-red-300 font-semibold">Strategy:</p><div className="text-xs text-white/80 mt-2 space-y-1"><p>• Cash out early for safe wins</p><p>• Wait longer for bigger rewards</p><p>• But don't wait too long!</p><p>• Crash can happen anytime</p></div></div></div><button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showStats && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Games</div><div className="text-xl font-bold">{stats.totalGames}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Bet</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalBet)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Wins</div><div className="text-lg font-bold text-green-400">{stats.wins}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Win Rate</div><div className="text-lg font-bold text-blue-400">{stats.totalGames > 0 ? `${((stats.wins / stats.totalGames) * 100).toFixed(1)}%` : "0%"}</div></div></div></div><button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showVaultModal && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2><div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center"><div className="text-sm text-white/60 mb-1">Current Balance</div><div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div></div><div className="space-y-4"><div><label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label><div className="flex gap-2 mb-2"><input type="number" value={collectAmount} onChange={(e) => setCollectAmount(Number(e.target.value))} className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white" min="1" max={vault} /><button onClick={() => setCollectAmount(vault)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">MAX</button></div><button onClick={collectToWallet} disabled={collectAmount <= 0 || collectAmount > vault || claiming} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">{claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}</button></div><div className="text-xs text-white/60"><p>• Your vault is shared across all MLEO games</p><p>• Collect earnings to your wallet anytime</p><p>• Network: BSC Testnet (TBNB)</p></div></div><button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}
      </div>
    </Layout>
  );
}
