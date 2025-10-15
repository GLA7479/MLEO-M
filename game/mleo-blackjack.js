// ============================================================================
// MLEO Blackjack - Simple Version (Build Test)
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";

const LS_KEY = "mleo_blackjack_v1";
const MIN_BET = 1000;

const safeRead = (key, def) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } };
const safeWrite = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
const fmt = (n) => Math.floor(n).toLocaleString("en-US");

function formatBetDisplay(amount) {
  const num = Number(amount);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export default function BlackjackGame() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const metersRef = useRef(null);
  const betRef = useRef(null);
  const ctaRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [isEditingBet, setIsEditingBet] = useState(false);
  const [gameState, setGameState] = useState("betting");
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [gameResult, setGameResult] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalHands: 0, wins: 0, totalBet: 0, totalWon: 0, biggestWin: 0 }));

  useEffect(() => { setMounted(true); const v = safeRead("mleo_vault", 10000000); setVaultState(v); }, []);
  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);
  useEffect(() => { if (!wrapRef.current) return; const calc = () => { const rootH = window.visualViewport?.height ?? window.innerHeight; const safeBottom = Number(getComputedStyle(document.documentElement).getPropertyValue("--satb").replace("px", "")) || 0; const headH = headerRef.current?.offsetHeight || 0; document.documentElement.style.setProperty("--head-h", headH + "px"); const topPad = headH + 8; const used = headH + (metersRef.current?.offsetHeight || 0) + (betRef.current?.offsetHeight || 0) + (ctaRef.current?.offsetHeight || 0) + topPad + 48 + safeBottom + 24; const freeH = Math.max(200, rootH - used); document.documentElement.style.setProperty("--chart-h", freeH + "px"); }; calc(); window.addEventListener("resize", calc); window.visualViewport?.addEventListener("resize", calc); return () => { window.removeEventListener("resize", calc); window.visualViewport?.removeEventListener("resize", calc); }; }, [mounted]);

  const openWalletModalUnified = () => isConnected ? openAccountModal?.() : openConnectModal?.();
  const hardDisconnect = () => { disconnect?.(); setMenuOpen(false); };
  const shortAddr = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const backSafe = () => { try { router.push("/"); } catch { window.location.href = "/"; } };

  const dealCards = () => {
    const bet = Number(betAmount);
    if (bet < MIN_BET || bet > vault) return;
    
    setVaultState(v => v - bet);
    setGameState("playing");
    setPlayerCards(["A♠", "K♠"]);
    setDealerCards(["Q♥", "??"]);
    setGameResult(null);
  };

  const hit = () => {
    setPlayerCards([...playerCards, "5♦"]);
  };

  const stand = () => {
    const bet = Number(betAmount);
    const prize = bet * 2;
    
    setDealerCards(["Q♥", "10♥"]);
    setGameState("finished");
    setGameResult({ win: true, prize, playerValue: 21, dealerValue: 20 });
    setVaultState(v => v + prize);
    
    setStats(s => ({
      ...s,
      totalHands: s.totalHands + 1,
      wins: s.wins + 1,
      totalBet: s.totalBet + bet,
      totalWon: s.totalWon + prize,
      biggestWin: Math.max(s.biggestWin, prize)
    }));
  };

  const newHand = () => {
    setGameState("betting");
    setPlayerCards([]);
    setDealerCards([]);
    setGameResult(null);
  };

  if (!mounted) return null;

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-red-900 via-black to-green-900" style={{ height: '100svh' }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        </div>

        <div ref={headerRef} className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={backSafe} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
            </div>
            <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={() => setMenuOpen(true)} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
            </div>
          </div>
        </div>

        <div className="relative h-full flex flex-col items-center justify-start px-4 pb-4" style={{ minHeight: "100%", paddingTop: "calc(var(--head-h, 56px) + 8px)" }}>
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">♠️ Blackjack</h1>
            <p className="text-white/70 text-xs">Simple Version • Testing Build</p>
          </div>

          <div ref={metersRef} className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Vault</div>
              <div className="text-sm font-bold text-emerald-400">{fmt(vault)}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Bet</div>
              <div className="text-sm font-bold text-amber-400">{fmt(Number(betAmount))}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Win</div>
              <div className="text-sm font-bold text-green-400">{fmt(Number(betAmount) * 2)}</div>
            </div>
          </div>

          <div className="mb-1 w-full max-w-md" style={{ height: "var(--chart-h, 300px)" }}>
            <div className="text-center mb-2">
              <div className="text-xs text-white/60 mb-1">Dealer Cards</div>
              <div className="flex gap-1 justify-center">
                {dealerCards.map((card, i) => (
                  <div key={i} className="w-12 h-16 bg-white rounded text-2xl flex items-center justify-center">{card}</div>
                ))}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-white/60 mb-1">Your Cards</div>
              <div className="flex gap-1 justify-center">
                {playerCards.map((card, i) => (
                  <div key={i} className="w-12 h-16 bg-white rounded text-2xl flex items-center justify-center">{card}</div>
                ))}
              </div>
            </div>
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap">
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 1000) : Math.min(vault, current + 1000); setBetAmount(String(newBet)); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">1K</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 10000) : Math.min(vault, current + 10000); setBetAmount(String(newBet)); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">10K</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 100000) : Math.min(vault, current + 100000); setBetAmount(String(newBet)); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">100K</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 1000000) : Math.min(vault, current + 1000000); setBetAmount(String(newBet)); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">1M</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.max(MIN_BET, current - 1000); setBetAmount(String(newBet)); }} disabled={gameState !== "betting"} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">−</button>
            <input type="text" value={isEditingBet ? betAmount : formatBetDisplay(betAmount)} onFocus={() => setIsEditingBet(true)} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setBetAmount(val || '0'); }} onBlur={() => { setIsEditingBet(false); const current = Number(betAmount) || MIN_BET; setBetAmount(String(Math.max(MIN_BET, current))); }} disabled={gameState !== "betting"} className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-xs" />
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); }} disabled={gameState !== "betting"} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">+</button>
            <button onClick={() => { setBetAmount(String(MIN_BET)); }} disabled={gameState !== "betting"} className="h-8 w-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs disabled:opacity-50" title="Reset to minimum bet">↺</button>
          </div>

          <div ref={ctaRef} className="flex flex-col gap-3 w-full max-w-sm" style={{ minHeight: '140px' }}>
            {gameState === "playing" && (
              <div className="flex gap-2">
                <button onClick={hit} className="flex-1 py-2 rounded-lg font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110">HIT</button>
                <button onClick={stand} className="flex-1 py-2 rounded-lg font-bold text-sm bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg hover:brightness-110">STAND</button>
              </div>
            )}
            {gameState !== "playing" && (
              <button onClick={gameState === "betting" ? dealCards : newHand} className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-red-500 to-green-600 text-white shadow-lg hover:brightness-110 transition-all">
                {gameState === "finished" ? "NEW HAND" : "DEAL"}
              </button>
            )}
            <div className="text-center text-sm text-white/80">
              {gameResult ? (gameResult.win ? "✅ YOU WIN!" : "❌ DEALER WINS") : "Place your bet"}
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}>
            <div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <h2 className="text-xl font-extrabold">Settings</h2>
                <button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button>
              </div>
              <div className="mb-3 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Wallet</h3>
                <div className="flex items-center gap-2">
                  <button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </button>
                  {isConnected && (
                    <button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>
                  )}
                </div>
                {isConnected && address && (
                  <button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">
                    {shortAddr(address)}
                    {copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}
                  </button>
                )}
              </div>
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Sound</h3>
                <button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>
                  SFX: {sfxMuted ? "Off" : "On"}
                </button>
              </div>
              <div className="mt-4 text-xs opacity-70">
                <p>Blackjack Simple v1.0</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
