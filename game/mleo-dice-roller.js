// ============================================================================
// MLEO Dice Roller - Classic 3-Dice Game
// Cost: 1000 MLEO per roll
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_dice_roller_v1";
const MIN_BET = 1000; // Minimum bet amount

const WIN_CONDITIONS = [
  { name: "Triple Six", check: (dice) => dice.every(d => d === 6), mult: 10, emoji: "💎" },
  { name: "Triple Five", check: (dice) => dice.every(d => d === 5), mult: 8, emoji: "👑" },
  { name: "Any Triple", check: (dice) => dice[0] === dice[1] && dice[1] === dice[2], mult: 6, emoji: "🎯" },
  { name: "Sum 18", check: (dice) => dice.reduce((a,b)=>a+b,0) === 18, mult: 5, emoji: "⭐" },
  { name: "Sum 17", check: (dice) => dice.reduce((a,b)=>a+b,0) === 17, mult: 4, emoji: "🔥" },
  { name: "Sum 16", check: (dice) => dice.reduce((a,b)=>a+b,0) === 16, mult: 3, emoji: "✨" },
  { name: "Sum 15", check: (dice) => dice.reduce((a,b)=>a+b,0) === 15, mult: 2.5, emoji: "💫" },
  { name: "Sum 14", check: (dice) => dice.reduce((a,b)=>a+b,0) === 14, mult: 2, emoji: "🌟" },
  { name: "Sum 13", check: (dice) => dice.reduce((a,b)=>a+b,0) === 13, mult: 1.8, emoji: "⚡" },
  { name: "Sum 12", check: (dice) => dice.reduce((a,b)=>a+b,0) === 12, mult: 1.5, emoji: "🎁" },
  { name: "All Even", check: (dice) => dice.every(d => d % 2 === 0), mult: 1.5, emoji: "🎲" },
  { name: "All Odd", check: (dice) => dice.every(d => d % 2 === 1), mult: 1.5, emoji: "🎲" },
];

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

function setVault(amount) {
  const rushData = safeRead("mleo_rush_core_v4", {});
  rushData.vault = amount;
  safeWrite("mleo_rush_core_v4", rushData);
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

// ============================================================================
// GAME LOGIC
// ============================================================================
function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1
  ];
}

function checkWin(dice) {
  // Check conditions in order (best to worst)
  for (const condition of WIN_CONDITIONS) {
    if (condition.check(dice)) {
      return condition;
    }
  }
  return null;
}

function getDiceFace(value) {
  const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  return faces[value - 1] || "?";
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function DiceRollerPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState([1, 1, 1]);
  const [result, setResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalRolls: 0, totalWon: 0, biggestWin: 0, tripleCount: 0, lastBet: MIN_BET })
  );
  const [showRules, setShowRules] = useState(false);

  const rollSound = useRef(null);
  const winSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    
    // Load last bet amount
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) {
      setBetAmount(String(savedStats.lastBet));
    }
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
    }, 2000);
    
    if (typeof Audio !== "undefined") {
      rollSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
    
    return () => clearInterval(interval);
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    roll(true);
  };

  const roll = async (isFreePlayParam = false) => {
    if (rolling) return;

    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/dice', undefined, { shallow: true });
      } else {
        setResult({ error: true, message: 'No free play tokens available!' });
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        setResult({ error: true, message: `Minimum bet is ${MIN_BET} MLEO!` });
        return;
      }

      const currentVault = getVault();
      if (currentVault < bet) {
        setResult({ error: true, message: "Not enough MLEO!" });
        return;
      }

      // Deduct cost
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setCurrentBet(bet); // Store bet amount for prize calculations

    setRolling(true);
    setResult(null);
    
    if (rollSound.current) {
      rollSound.current.currentTime = 0;
      rollSound.current.play().catch(() => {});
    }

    // Animate rolling
    const iterations = 15;
    for (let i = 0; i < iterations; i++) {
      await new Promise(resolve => setTimeout(resolve, 80));
      setDice(rollDice());
    }

    // Final result
    const finalDice = rollDice();
    setDice(finalDice);

    const win = checkWin(finalDice);
    
    if (win) {
      const prize = Math.floor(currentBet * win.mult);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      const isTriple = win.name.includes("Triple");
      setStats(s => ({
        totalRolls: s.totalRolls + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        tripleCount: s.tripleCount + (isTriple ? 1 : 0),
        lastBet: currentBet
      }));

      setResult({ 
        win: true, 
        message: win.name, 
        prize,
        emoji: win.emoji,
        mult: win.mult
      });
      
      if (winSound.current) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
    } else {
      setResult({ 
        win: false, 
        message: "No match!", 
        sum: finalDice.reduce((a,b)=>a+b,0)
      });
      setStats(s => ({ ...s, totalRolls: s.totalRolls + 1, lastBet: currentBet }));
    }

    setRolling(false);
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Dice Roller</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  const diceSum = dice.reduce((a, b) => a + b, 0);

  return (
    <Layout isGame={true} title="MLEO Dice Roller 🎲">
      <main className="min-h-[100svh] bg-gradient-to-b from-red-950 via-orange-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🎲</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-amber-400 bg-clip-text text-transparent">
                  MLEO Dice
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Roll 3 dice and win big!</div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* DICE GAME - Main Window */}
          <div className="rounded-3xl p-8 bg-gradient-to-br from-red-900/30 via-orange-900/20 to-amber-900/30 border-4 border-orange-600/50 shadow-2xl mb-6">
            
            {/* DICE */}
            <div className="flex justify-center gap-6 mb-8">
              {dice.map((value, idx) => (
                <div
                  key={idx}
                  className={`relative w-32 h-32 rounded-3xl bg-gradient-to-br from-white to-zinc-200 border-4 border-red-500 flex items-center justify-center text-8xl shadow-2xl ${
                    rolling ? "animate-spin" : "animate-bounce-once"
                  }`}
                  style={{
                    animationDelay: `${idx * 0.1}s`,
                    perspective: "1000px",
                    transform: rolling ? "rotateX(360deg) rotateY(360deg)" : "none"
                  }}
                >
                  <div className="text-red-900 font-bold">{value}</div>
                </div>
              ))}
            </div>

            {/* SUM */}
            <div className="text-center mb-6">
              <div className="text-sm opacity-70 mb-1">Total Sum</div>
              <div className="text-5xl font-bold text-orange-400">{diceSum}</div>
            </div>

            {/* RESULT */}
            {result && (
              <div className={`text-center mb-6 p-4 rounded-xl border-2 ${
                result.error
                  ? "bg-red-900/30 border-red-500"
                  : result.win
                  ? "bg-green-900/30 border-green-500 animate-pulse"
                  : "bg-zinc-800/50 border-zinc-600"
              }`}>
                {result.win ? (
                  <>
                    <div className="text-4xl mb-2">{result.emoji}</div>
                    <div className="text-2xl font-bold mb-2">{result.message}</div>
                    <div className="text-3xl font-bold text-green-400">
                      +{fmt(result.prize)} MLEO
                    </div>
                    <div className="text-sm opacity-70 mt-1">×{result.mult} multiplier</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold mb-2">{result.message}</div>
                    <div className="text-sm opacity-70">Sum: {result.sum}</div>
                  </>
                )}
              </div>
            )}

            {/* ROLL BUTTON */}
            <div className="text-center mb-6">
              {freePlayTokens > 0 && !rolling && (
                <button
                  onClick={startFreePlay}
                  className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                >
                  🎁 FREE PLAY ({freePlayTokens}/5)
                </button>
              )}
              
              <button
                onClick={() => roll(false)}
                disabled={rolling || vault < (Number(betAmount) || MIN_BET)}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  rolling
                    ? "bg-zinc-700 cursor-wait"
                    : vault < (Number(betAmount) || MIN_BET)
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-red-600 via-orange-500 to-amber-600 hover:from-red-500 hover:via-orange-400 hover:to-amber-500 hover:scale-105"
                }`}
              >
                {rolling ? "🎲 ROLLING..." : `🎲 ROLL (${fmt(Number(betAmount) || MIN_BET)})`}
              </button>
              <div className="text-sm opacity-60 mt-3">
                Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
              </div>
            </div>

            {/* Bet Amount Input */}
            <div className="max-w-sm mx-auto">
              <label className="block text-sm text-zinc-400 mb-2">Bet Amount (MLEO)</label>
              <input 
                type="number" 
                min={MIN_BET} 
                step="100" 
                value={betAmount} 
                onChange={(e) => setBetAmount(e.target.value)} 
                className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-red-500" 
                placeholder="1000" 
              />
              <div className="flex gap-2 mt-2 justify-center flex-wrap">
                {[1000, 2500, 5000, 10000].map((v) => (
                  <button 
                    key={v} 
                    onClick={() => setBetAmount(String(v))} 
                    className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    {v >= 1000 ? `${v/1000}K` : v}
                  </button>
                ))}
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
              <div className="text-xs opacity-70 mb-1">Total Rolls</div>
              <div className="text-lg font-bold">{stats.totalRolls}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Triples</div>
              <div className="text-lg font-bold text-amber-400">{stats.tripleCount}</div>
            </div>
          </div>

          {/* WIN CONDITIONS */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10">
            <button
              onClick={() => setShowRules(!showRules)}
              className="w-full flex items-center justify-between text-lg font-bold mb-4"
            >
              <span>🏆 Win Conditions</span>
              <span>{showRules ? "▲" : "▼"}</span>
            </button>
            
            {showRules && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 text-center font-semibold text-sm border-b border-white/20 pb-2">
                  <div>Emoji</div>
                  <div>Condition</div>
                  <div>Prize</div>
                  <div>Mult</div>
                </div>
                
                {WIN_CONDITIONS.map((cond, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2 text-center text-sm py-2 border-b border-white/10 items-center">
                    <div className="text-2xl">{cond.emoji}</div>
                    <div className="font-semibold">{cond.name}</div>
                    <div className="font-bold text-green-400">{fmt((Number(betAmount) || MIN_BET) * cond.mult)}</div>
                    <div className="text-amber-400">×{cond.mult}</div>
                  </div>
                ))}
                
                <div className="text-xs opacity-60 text-center mt-4">
                  💡 Higher conditions are checked first!
                </div>
              </div>
            )}
          </div>


        </div>
      </main>
    </Layout>
  );
}

