// ============================================================================
// MLEO Bomb Squad - Full-Screen Game Template
// Defuse the bomb by cutting the right wires!
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { getFreePlayStatus } from "../lib/free-play-system";
import {
  finishArcadeSession,
  startFreeplayArcadeSession,
  startPaidArcadeSession,
} from "../lib/arcadeSessionClient";
import {
  debitSharedVault,
  initSharedVault,
  peekSharedVault,
  readSharedVault,
  subscribeSharedVault,
} from "../lib/sharedVault";

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

const LS_KEY = "mleo_bomb_v2";
const MIN_PLAY = 100;
const TOTAL_LEVELS = 5;
const WIRES = ['red', 'blue', 'green', 'yellow'];
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 3;
const MINING_CLAIM_ABI = [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] }];
const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";

function safeRead(key, fallback = {}) { if (typeof window === "undefined") return fallback; try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val) { if (typeof window === "undefined") return; try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return Math.floor(n).toString(); }
function formatPlayDisplay(n) { const num = Number(n) || 0; if (num >= 1e6) return (num / 1e6).toFixed(num % 1e6 === 0 ? 0 : 2) + "M"; if (num >= 1e3) return (num / 1e3).toFixed(num % 1e3 === 0 ? 0 : 2) + "K"; return num.toString(); }
function shortAddr(addr) { if (!addr || addr.length < 10) return addr || ""; return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }
function normalizeWholeAmount(value) {
  const num = Number(value);
  return Math.floor(Number.isFinite(num) ? num : 0);
}

export default function BombPage() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const metersRef = useRef(null);
  const betRef = useRef(null);
  const ctaRef = useRef(null);
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
  const [playAmount, setPlayAmount] = useState("100");
  const [isEditingPlay, setIsEditingPlay] = useState(false);
  const [level, setLevel] = useState(0);
  const [correctWire, setCorrectWire] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [collectAmount, setCollectAmount] = useState(100);
  const [sessionId, setSessionId] = useState(null);
  const [sessionError, setSessionError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [clickedWire, setClickedWire] = useState(null);
  const clickSound = useRef(null);
  const winSound = useRef(null);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0, perfectDefuses: 0, lastPlay: MIN_PLAY }));

  const playSfx = (sound) => { if (sfxMuted || !sound) return; try { sound.currentTime = 0; sound.play().catch(() => {}); } catch {} };

  useEffect(() => {
    let cancelled = false;
    setMounted(true);
    initSharedVault();
    readSharedVault()
      .then(snapshot => {
        if (!cancelled) setVaultState(snapshot.balance);
      })
      .catch(() => {
        if (!cancelled) setVaultState(peekSharedVault().balance);
      });

    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    const gameId = router.pathname.replace('/', '') || 'bomb';
    getFreePlayStatus().then(status => {
      if (!cancelled) setFreePlayTokens(status.tokens);
    }).catch(err => console.error('Failed to get free play status:', err));
    const savedStats = safeRead(LS_KEY, { lastPlay: MIN_PLAY });
    if (savedStats.lastPlay) setPlayAmount(String(savedStats.lastPlay));

    const unsubscribeVault = subscribeSharedVault(snapshot => {
      if (!cancelled) setVaultState(snapshot.balance);
    });

    const interval = setInterval(() => {
      getFreePlayStatus().then(status => {
        if (!cancelled) setFreePlayTokens(status.tokens);
      }).catch(err => console.error('Failed to get free play status:', err));
    }, 2000);

    if (typeof Audio !== "undefined") {
      try { clickSound.current = new Audio(S_CLICK); winSound.current = new Audio(S_WIN); } catch {}
    }
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      cancelled = true;
      unsubscribeVault();
      clearInterval(interval);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [router.query]);

  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);
  useEffect(() => { if (!wrapRef.current) return; const calc = () => { const rootH = window.visualViewport?.height ?? window.innerHeight; const safeBottom = Number(getComputedStyle(document.documentElement).getPropertyValue("--satb").replace("px", "")) || 0; const headH = headerRef.current?.offsetHeight || 0; document.documentElement.style.setProperty("--head-h", headH + "px"); const topPad = headH + 8; const used = headH + (metersRef.current?.offsetHeight || 0) + (betRef.current?.offsetHeight || 0) + (ctaRef.current?.offsetHeight || 0) + topPad + 48 + safeBottom + 24; const freeH = Math.max(200, rootH - used); document.documentElement.style.setProperty("--chart-h", freeH + "px"); }; calc(); window.addEventListener("resize", calc); window.visualViewport?.addEventListener("resize", calc); return () => { window.removeEventListener("resize", calc); window.visualViewport?.removeEventListener("resize", calc); }; }, [mounted]);
  useEffect(() => { if (gameResult) { setShowResultPopup(true); const timer = setTimeout(() => setShowResultPopup(false), 4000); return () => clearTimeout(timer); } }, [gameResult]);

  const openWalletModalUnified = () => isConnected ? openAccountModal?.() : openConnectModal?.();
  const hardDisconnect = () => { disconnect?.(); setMenuOpen(false); };

  const collectToWallet = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (chainId !== CLAIM_CHAIN_ID) { try { await switchChain?.({ chainId: CLAIM_CHAIN_ID }); } catch { alert("Switch to BSC Testnet"); return; } }
    if (!CLAIM_ADDRESS) { alert("Missing CLAIM address"); return; }
    const wholeAmount = normalizeWholeAmount(collectAmount);
    if (wholeAmount <= 0 || wholeAmount > vault) { alert("Invalid amount!"); return; }
    setClaiming(true);
    try {
      const amountUnits = parseUnits(String(wholeAmount), MLEO_DECIMALS);
      const hash = await writeContractAsync({ address: CLAIM_ADDRESS, abi: MINING_CLAIM_ABI, functionName: "claim", args: [BigInt(GAME_ID), amountUnits], chainId: CLAIM_CHAIN_ID, account: address });
      await publicClient.waitForTransactionReceipt({ hash });
      const debitResult = await debitSharedVault(wholeAmount, "bomb");
      setVaultState(debitResult.balance);
      alert(`✅ Sent ${fmt(wholeAmount)} MLEO to wallet!`);
      setShowVaultModal(false);
    } catch (err) { console.error(err); alert("Claim failed or rejected"); } finally { setClaiming(false); }
  };

  const startGame = async (isFreePlayParam = false) => {
    playSfx(clickSound.current);
    setSessionError("");
    let play = Number(playAmount) || MIN_PLAY;
    let nextSessionId = null;
    if (isFreePlay || isFreePlayParam) {
      const gameId = router.pathname.replace('/', '') || 'bomb';
      try {
        const result = await startFreeplayArcadeSession(gameId);
        if (result.success) { play = result.amount; nextSessionId = result.sessionId; setFreePlayTokens(result.remainingTokens); setIsFreePlay(false); router.replace('/bomb', undefined, { shallow: true }); }
        else { alert(result.message || 'No free play tokens available!'); setIsFreePlay(false); return; }
      } catch (error) {
        console.error('Free play error:', error);
        alert('Failed to use free play token. Please try again.');
        setIsFreePlay(false);
        return;
      }
    } else {
      if (play < MIN_PLAY) { alert(`Minimum play is ${MIN_PLAY} MLEO`); return; }
      const startResult = await startPaidArcadeSession("bomb", play);
      if (!startResult.success) { alert(startResult.message || 'Failed to start session'); return; }
      nextSessionId = startResult.sessionId;
      setVaultState(startResult.balanceAfter);
    }
    setPlayAmount(String(play));
    setSessionId(nextSessionId);
    setGameResult(null);
    setLevel(0);
    setCorrectWire(WIRES[Math.floor(Math.random() * WIRES.length)]);
    setGameActive(true);
  };

  const cutWire = (wire) => {
    if (!gameActive) return;
    playSfx(clickSound.current);
    setClickedWire(wire);
    setTimeout(() => {
      if (wire === correctWire) {
        const newLevel = level + 1;
        if (newLevel >= TOTAL_LEVELS) {
          endGame(true, newLevel);
        } else {
          setLevel(newLevel);
          setCorrectWire(WIRES[Math.floor(Math.random() * WIRES.length)]);
        }
      } else {
        endGame(false, level);
      }
      setClickedWire(null);
    }, 200);
  };

  const cashOut = () => {
    if (!gameActive || level === 0) return;
    playSfx(clickSound.current);
    endGame(true, level);
  };

  const endGame = async (win, finalLevel) => {
    if (!sessionId) return;
    const play = Number(playAmount);
    try {
      const finishResult = await finishArcadeSession(sessionId, { survived: win, finalLevel });
      const payload = finishResult?.serverPayload || {};
      const prize = Math.max(0, Number(finishResult?.approvedReward || 0));
      const resolvedWin = Boolean(payload.won);
      const multiplier = Number(payload.multiplier || 0);
      const resolvedLevel = Number(payload.finalLevel || finalLevel);

      if (Number.isFinite(finishResult?.balanceAfter)) {
        setVaultState(finishResult.balanceAfter);
      }
      if (resolvedWin && prize > 0) {
        playSfx(winSound.current);
      }

      const resultData = { win: resolvedWin, level: resolvedLevel, multiplier, prize, profit: resolvedWin ? prize - play : -play, perfect: Boolean(payload.perfect) };
      setGameResult(resultData);
      setGameActive(false);
      setSessionId(null);
      
      const newStats = { ...stats, totalGames: stats.totalGames + 1, wins: resolvedWin ? stats.wins + 1 : stats.wins, losses: resolvedWin ? stats.losses : stats.losses + 1, totalPlay: stats.totalPlay + play, totalWon: resolvedWin ? stats.totalWon + prize : stats.totalWon, biggestWin: Math.max(stats.biggestWin, resolvedWin ? prize : 0), perfectDefuses: Boolean(payload.perfect) ? stats.perfectDefuses + 1 : stats.perfectDefuses, lastPlay: play };
      setStats(newStats);
    } catch (error) {
      console.error("Finish session error:", error);
      setGameActive(false);
      setSessionId(null);
      setSessionError("Session failed to finish");
      alert("Failed to finish session. Please refresh vault and try again.");
    }
  };

  const resetGame = () => { setGameResult(null); setShowResultPopup(false); setLevel(0); setCorrectWire(null); setGameActive(false); setSessionId(null); };
  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-orange-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  const multipliers = [2.5, 3.9, 5.8, 9.2, 17];
  const currentMultiplier = gameActive && level > 0 ? multipliers[level - 1] : (level + 1 <= multipliers.length ? multipliers[level] : 1);
  const currentPrize = gameActive && level > 0 ? Math.floor(Number(playAmount) * multipliers[level - 1]) : 0;
  const potentialWin = Math.floor(Number(playAmount) * currentMultiplier);

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-red-900 via-black to-orange-900" style={{ height: '100svh' }}>
        <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
        <div ref={headerRef} className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={backSafe} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              {freePlayTokens > 0 && (<button onClick={() => startGame(true)} disabled={gameActive} className="relative px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all disabled:opacity-50" title={`${freePlayTokens} Free Play${freePlayTokens > 1 ? 's' : ''} Available`}><span className="text-base">🎁</span><span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{freePlayTokens}</span></button>)}
            </div>
            <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
              <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
            </div>
              </div>
            </div>

        <div className="relative h-full flex flex-col items-center justify-start px-4 pb-4" style={{ minHeight: "100%", paddingTop: "calc(var(--head-h, 56px) + 8px)" }}>
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">💣 Bomb Squad</h1>
            <p className="text-white/70 text-xs">Defuse the bomb • Cut the right wire!</p>
          </div>
          <div ref={metersRef} className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Vault</div>
              <div className="text-sm font-bold text-emerald-400">{fmt(vault)}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Play</div>
              <div className="text-sm font-bold text-amber-400">{fmt(Number(playAmount))}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Prize</div>
              <div className="text-sm font-bold text-green-400">{fmt(potentialWin)}</div>
            </div>
          </div>

          <div className="mb-1 w-full max-w-md flex flex-col items-center justify-center" style={{ height: "var(--chart-h, 300px)" }}>
            <div className="text-center mb-3">
              <div className="text-5xl mb-3">💣</div>
              <div className="text-base font-bold text-white bg-black/30 border border-white/20 rounded-lg px-4 py-2 inline-block">
                Level: {level + 1}/{TOTAL_LEVELS} • Multiplier: ×{currentMultiplier}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
              {WIRES.map((wire) => {
                const isClicked = clickedWire === wire;
                const wireColor = wire === 'red' ? 'bg-red-500' : wire === 'blue' ? 'bg-blue-500' : wire === 'green' ? 'bg-green-500' : 'bg-yellow-500';
                const wireEmoji = wire === 'red' ? '🔴' : wire === 'blue' ? '🔵' : wire === 'green' ? '🟢' : '🟡';
                return (
                  <button 
                    key={wire} 
                    onClick={() => cutWire(wire)} 
                    disabled={!gameActive || clickedWire !== null} 
                    className={`py-2 px-3 rounded-lg font-bold text-sm transition-all duration-200 ${wireColor} text-white shadow-lg hover:shadow-2xl hover:brightness-110 active:scale-95 disabled:opacity-50 ${isClicked ? 'scale-95 brightness-125 ring-4 ring-white' : ''}`}
                    style={{ transform: isClicked ? 'scale(0.95)' : 'scale(1)' }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="text-lg">{wireEmoji}</div>
                      <div className="text-[10px]">{wire.toUpperCase()}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap">
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 100) : Math.min(vault, current + 100); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">100</button><button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 1000) : Math.min(vault, current + 1000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">1K</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 10000) : Math.min(vault, current + 10000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">10K</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 100000) : Math.min(vault, current + 100000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">100K</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 100) : Math.min(vault, current + 100); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">100</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = Math.max(MIN_PLAY, current - 100); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">−</button>
            <div className="relative">
              <input type="text" value={isEditingPlay ? playAmount : formatPlayDisplay(playAmount)} onFocus={() => setIsEditingPlay(true)} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setPlayAmount(val || '0'); }} onBlur={() => { setIsEditingPlay(false); const current = Number(playAmount) || MIN_PLAY; setPlayAmount(String(Math.max(MIN_PLAY, current))); }} disabled={gameActive} className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-xs pr-6" />
              <button onClick={() => { setPlayAmount(String(MIN_PLAY)); playSfx(clickSound.current); }} disabled={gameActive} className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs disabled:opacity-50 flex items-center justify-center" title="Reset to minimum play">↺</button>
            </div>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = Math.min(vault, current + 1000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">+</button>
          </div>

          <div ref={ctaRef} className="flex flex-col gap-3 w-full max-w-sm" style={{ minHeight: '140px' }}>
            <button 
              onClick={gameActive ? cashOut : (gameResult ? resetGame : () => startGame(false))} 
              disabled={gameActive && level === 0}
              className={`w-full py-3 rounded-lg font-bold text-base shadow-lg hover:brightness-110 transition-all disabled:opacity-50 ${
                gameActive 
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600' 
                  : 'bg-gradient-to-r from-red-500 to-orange-600'
              } text-white`}
            >
              {gameActive ? `💰 CASH OUT ${fmt(currentPrize)}` : (gameResult ? "PLAY AGAIN" : "START")}
            </button>
            {sessionError ? <div className="text-center text-xs text-red-300">{sessionError}</div> : null}
            <div className="flex gap-2">
              <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
              <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
              <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
            </div>
          </div>
        </div>

        {showResultPopup && gameResult && (<div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"><div className={`${gameResult.win ? 'bg-green-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}><div className="text-4xl mb-2">{gameResult.perfect ? '💯' : gameResult.win ? '✅' : '💥'}</div><div className="text-2xl font-bold mb-1">{gameResult.perfect ? 'PERFECT!' : gameResult.win ? 'DEFUSED!' : 'BOOM!'}</div><div className="text-lg">{gameResult.win ? `+${fmt(gameResult.prize)} MLEO` : `-${fmt(Math.abs(gameResult.profit))} MLEO`}</div><div className="text-sm opacity-80 mt-2">Level {gameResult.level}/{TOTAL_LEVELS}</div></div></div>)}

        {menuOpen && (<div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}><div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div><div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div><div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div><div className="mt-4 text-xs opacity-70"><p>Bomb Squad v2.0</p></div></div></div>)}

        {showHowToPlay && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💣 How to Play</h2><div className="space-y-3 text-sm"><p><strong>1. Start Defusing:</strong> Min {MIN_PLAY} MLEO</p><p><strong>2. Cut Right Wire:</strong> 1 out of 4 wires is correct!</p><p><strong>3. Cash Out or Continue:</strong> Take your prize or risk it for more!</p><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3"><p className="text-red-300 font-semibold mb-2">💥 Level Prizes:</p><div className="text-xs text-white/80 space-y-1"><p>• <strong>Level 1:</strong> ×2.5</p><p>• <strong>Level 2:</strong> ×3.9</p><p>• <strong>Level 3:</strong> ×5.8</p><p>• <strong>Level 4:</strong> ×9.2</p><p>• <strong>Level 5:</strong> ×17 🏆</p></div></div><div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-2"><p className="text-green-300 font-semibold text-xs">💡 Strategy: Cash out early for safer wins, or risk it all for ×17!</p></div></div><button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showStats && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Games</div><div className="text-xl font-bold">{stats.totalGames}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Win Rate</div><div className="text-xl font-bold text-green-400">{stats.totalGames > 0 ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : 0}%</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Play</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalPlay)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Perfect</div><div className="text-lg font-bold text-purple-400">{stats.perfectDefuses}</div></div></div></div><button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showVaultModal && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2><div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center"><div className="text-sm text-white/60 mb-1">Current Balance</div><div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div></div><div className="space-y-4"><div><label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label><div className="flex gap-2 mb-2"><input type="number" step="1" value={collectAmount} onChange={(e) => setCollectAmount(normalizeWholeAmount(e.target.value))} className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white" min="1" max={vault} /><button onClick={() => setCollectAmount(vault)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">MAX</button></div><button onClick={collectToWallet} disabled={collectAmount <= 0 || collectAmount > vault || claiming} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">{claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}</button></div><div className="text-xs text-white/60"><p>• Your vault is shared across all MLEO games</p><p>• Collect earnings to your wallet anytime</p><p>• Network: BSC Testnet (TBNB)</p></div></div><button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}
      </div>
    </Layout>
  );
}
