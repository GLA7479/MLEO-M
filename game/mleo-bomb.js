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

const LS_KEY = "mleo_bomb_v2";
const MIN_BET = 1000;
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
function getVault() { const rushData = safeRead("mleo_rush_core_v4", {}); return rushData.vault || 0; }
function setVault(amount) { const rushData = safeRead("mleo_rush_core_v4", {}); rushData.vault = amount; safeWrite("mleo_rush_core_v4", rushData); }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return Math.floor(n).toString(); }
function shortAddr(addr) { if (!addr || addr.length < 10) return addr || ""; return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }

export default function BombPage() {
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
  const [collectAmount, setCollectAmount] = useState(1000);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const clickSound = useRef(null);
  const winSound = useRef(null);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalGames: 0, wins: 0, losses: 0, totalBet: 0, totalWon: 0, biggestWin: 0, perfectDefuses: 0, lastBet: MIN_BET }));

  const playSfx = (sound) => { if (sfxMuted || !sound) return; try { sound.currentTime = 0; sound.play().catch(() => {}); } catch {} };

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) setBetAmount(String(savedStats.lastBet));
    const interval = setInterval(() => { const status = getFreePlayStatus(); setFreePlayTokens(status.tokens); setVaultState(getVault()); }, 2000);
    if (typeof Audio !== "undefined") {
      try { clickSound.current = new Audio(S_CLICK); winSound.current = new Audio(S_WIN); } catch {}
    }
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { clearInterval(interval); document.removeEventListener("fullscreenchange", handleFullscreenChange); };
  }, [router.query]);

  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);
  useEffect(() => { if (gameResult) { setShowResultPopup(true); const timer = setTimeout(() => setShowResultPopup(false), 4000); return () => clearTimeout(timer); } }, [gameResult]);

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

  const startGame = (isFreePlayParam = false) => {
    playSfx(clickSound.current);
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) { bet = result.amount; setIsFreePlay(false); router.replace('/bomb', undefined, { shallow: true }); }
      else { alert('No free play tokens available!'); setIsFreePlay(false); return; }
    } else {
      if (bet < MIN_BET) { alert(`Minimum bet is ${MIN_BET} MLEO`); return; }
      if (currentVault < bet) { alert('Insufficient MLEO in vault'); return; }
      setVault(currentVault - bet); setVaultState(currentVault - bet);
    }
    setBetAmount(String(bet));
    setGameResult(null);
    setLevel(0);
    setCorrectWire(WIRES[Math.floor(Math.random() * WIRES.length)]);
    setGameActive(true);
  };

  const cutWire = (wire) => {
    if (!gameActive) return;
    playSfx(clickSound.current);
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
  };

  const endGame = (win, finalLevel) => {
    const bet = Number(betAmount);
    const multiplier = 1 + (finalLevel * 2);
    const prize = win ? Math.floor(bet * multiplier) : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault); setVaultState(newVault);
      playSfx(winSound.current);
    }

    const resultData = { win, level: finalLevel, multiplier, prize, profit: win ? prize - bet : -bet, perfect: finalLevel >= TOTAL_LEVELS };
    setGameResult(resultData);
    setGameActive(false);
    
    const newStats = { ...stats, totalGames: stats.totalGames + 1, wins: win ? stats.wins + 1 : stats.wins, losses: win ? stats.losses : stats.losses + 1, totalBet: stats.totalBet + bet, totalWon: win ? stats.totalWon + prize : stats.totalWon, biggestWin: Math.max(stats.biggestWin, win ? prize : 0), perfectDefuses: resultData.perfect ? stats.perfectDefuses + 1 : stats.perfectDefuses, lastBet: bet };
    setStats(newStats);
  };

  const resetGame = () => { setGameResult(null); setShowResultPopup(false); setLevel(0); setCorrectWire(null); setGameActive(false); };
  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-orange-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  const currentMultiplier = 1 + (level * 2);
  const potentialWin = Math.floor(Number(betAmount) * currentMultiplier);

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-red-900 via-black to-orange-900" style={{ height: 'var(--app-100vh, 100vh)' }}>
        <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3">
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

        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-16 pt-14 overflow-y-auto" style={{ minHeight: '100%' }}>
          <div className="text-center mb-3"><h1 className="text-3xl md:text-4xl font-extrabold text-white mb-1">💣 Bomb Squad</h1><p className="text-white/70 text-sm">Defuse the bomb • Cut the right wire!</p></div>
          <div className="grid grid-cols-3 gap-2 mb-3 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Vault</div><div className="text-lg font-bold text-emerald-400">{fmt(vault)}</div></div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Bet</div><div className="text-lg font-bold text-amber-400">{fmt(Number(betAmount))}</div></div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Prize</div><div className="text-lg font-bold text-green-400">{fmt(potentialWin)}</div></div>
          </div>

          <div className="mb-3" style={{ minHeight: '200px' }}>
            <div className="text-center mb-2"><div className="text-5xl mb-2">💣</div><div className="text-xs text-white/70">Level: {level + 1}/{TOTAL_LEVELS} • Multiplier: ×{currentMultiplier}</div></div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              {WIRES.map((wire) => (<button key={wire} onClick={() => cutWire(wire)} disabled={!gameActive} className={`py-4 rounded-lg font-bold text-sm transition-all ${wire === 'red' ? 'bg-red-500' : wire === 'blue' ? 'bg-blue-500' : wire === 'green' ? 'bg-green-500' : 'bg-yellow-500'} text-white hover:brightness-110 disabled:opacity-50`}>{wire === 'red' ? '🔴' : wire === 'blue' ? '🔵' : wire === 'green' ? '🟢' : '🟡'} {wire.toUpperCase()}</button>))}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.max(MIN_BET, current - 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50">−</button>
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} disabled={gameActive} className="w-32 h-12 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-sm" min={MIN_BET} />
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50">+</button>
        </div>

          <div className="flex flex-col gap-3 w-full max-w-sm" style={{ minHeight: '100px' }}>
            <button onClick={gameResult ? resetGame : () => startGame(false)} disabled={gameActive} className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50">{gameResult ? "PLAY AGAIN" : "START"}</button>
            <div className="flex gap-2">
              <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
              <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
              <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
            </div>
          </div>
        </div>

        {showResultPopup && gameResult && (<div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"><div className={`${gameResult.win ? 'bg-green-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}><div className="text-4xl mb-2">{gameResult.perfect ? '💯' : gameResult.win ? '✅' : '💥'}</div><div className="text-2xl font-bold mb-1">{gameResult.perfect ? 'PERFECT!' : gameResult.win ? 'DEFUSED!' : 'BOOM!'}</div><div className="text-lg">{gameResult.win ? `+${fmt(gameResult.prize)} MLEO` : `-${fmt(Math.abs(gameResult.profit))} MLEO`}</div><div className="text-sm opacity-80 mt-2">Level {gameResult.level}/{TOTAL_LEVELS}</div></div></div>)}

        {menuOpen && (<div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}><div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div><div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div><div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div><div className="mt-4 text-xs opacity-70"><p>Bomb Squad v2.0</p></div></div></div>)}

        {showHowToPlay && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💣 How to Play</h2><div className="space-y-3 text-sm"><p><strong>1. Start Defusing:</strong> Min {MIN_BET} MLEO</p><p><strong>2. Cut Right Wire:</strong> 25% chance each level!</p><p><strong>3. Complete 5 Levels:</strong> Win big!</p><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3"><p className="text-red-300 font-semibold">Each level: ×2 multiplier!</p></div></div><button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showStats && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Games</div><div className="text-xl font-bold">{stats.totalGames}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Win Rate</div><div className="text-xl font-bold text-green-400">{stats.totalGames > 0 ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : 0}%</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Bet</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalBet)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Perfect</div><div className="text-lg font-bold text-purple-400">{stats.perfectDefuses}</div></div></div></div><button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showVaultModal && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2><div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center"><div className="text-sm text-white/60 mb-1">Current Balance</div><div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div></div><div className="space-y-4"><div><label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label><div className="flex gap-2 mb-2"><input type="number" value={collectAmount} onChange={(e) => setCollectAmount(Number(e.target.value))} className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white" min="1" max={vault} /><button onClick={() => setCollectAmount(vault)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">MAX</button></div><button onClick={collectToWallet} disabled={collectAmount <= 0 || collectAmount > vault || claiming} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">{claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}</button></div><div className="text-xs text-white/60"><p>• Your vault is shared across all MLEO games</p><p>• Collect earnings to your wallet anytime</p><p>• Network: BSC Testnet (TBNB)</p></div></div><button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}
      </div>
    </Layout>
  );
}
