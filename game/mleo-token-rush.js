// ============================================================================
// MLEO Token Rush — Simplified Crypto Mining App
// Clean, focused mining experience with meaningful progression
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useChainId,
  usePublicClient
} from "wagmi";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { parseUnits } from "viem";

// ============================================================================
// CONFIG & CONSTANTS
// ============================================================================
const LS_KEYS = {
  CORE: "mleo_rush_core_v4",
  SESSION: "mleo_rush_session_v4",
  GUILD: "mleo_rush_guild_v4",
  PRESTIGE: "mleo_rush_prestige_v4",
  ACHIEVEMENTS: "mleo_rush_achievements_v4",
  MASTERY: "mleo_rush_mastery_v4",
};

const OTHER_GAME_CORE_KEY = "mleoMiningEconomy_v2.1"; // MLEO-MINERS

const ENV = {
  CLAIM_CHAIN_ID: Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97),
  CLAIM_ADDRESS: (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || process.env.NEXT_PUBLIC_CLAIM_ADDRESS || "").trim(),
  TOKEN_DECIMALS: Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18),
  GAME_ID: 2, // Rush
};

const GAME_ID_BI = BigInt(2);

const CLAIM_ABI_V3 = [
  {
    inputs: [
      { internalType: "uint256", name: "gameId", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const CONFIG = {
  // Core Mining
  IDLE_TO_OFFLINE_MS: 5 * 60 * 1000,        // 5 minutes idle → offline
  OFFLINE_MAX_HOURS: 12,                     // max offline accumulation
  ONLINE_BASE_RATE: 1200,                    // MLEO per hour (online)
  OFFLINE_RATE_FACTOR: 0.6,                  // 60% rate when offline
  
  // Boost (simple)
  BOOST_PER_CLICK: 0.02,                     // +2% per click
  BOOST_DECAY_MS: 60 * 1000,                 // decays over 60s
  MAX_CLICKS_PER_SEC: 6,                     // anti-bot
  
  // Gifts & Bonuses
  GIFT_COOLDOWN_SEC: 3600,                   // 1 hour
  GIFT_LUCK_CHANCE: 0.10,                    // 10% chance for lucky
  GIFT_LUCK_MULT: [2, 3],                    // x2 or x3
  DAILY_BONUS_TABLE: [50, 75, 100, 150, 200, 275, 400],
  
  // Upgrades (cost in MLEO, mult = multiplier per level)
  UPGRADES: [
    { id: "drill",   name: "Auto-Drill",    baseCost: 1000,   mult: 0.08, maxLvl: 25, desc: "Automated drilling increases mining speed" },
    { id: "helmet",  name: "Miner Helmet",  baseCost: 2500,   mult: 0.10, maxLvl: 20, desc: "Advanced helmet boosts efficiency" },
    { id: "cart",    name: "Quantum Cart",  baseCost: 5000,   mult: 0.15, maxLvl: 15, desc: "Quantum technology multiplies output" },
    { id: "robot",   name: "Leo Bot",       baseCost: 20000,  mult: 0.30, maxLvl: 10, desc: "AI-powered mining assistant" },
  ],
  
  // Guild
  GUILD_SAMPLES: [0.02, 0.03, 0.05, 0.08],  // random bonuses

  // Modifiers (mini-events) - Fixed global schedule
  MODIFIER_CYCLE_HOURS: 3,                   // Full cycle every 3 hours
  MODIFIER_DURATION_MIN: 30,                 // Each event lasts 30 minutes
  MODIFIERS_POOL: [
    { id: "GIFT_X2",   label: "🎁 Gifts ×2",      mult: { gift: 2 }, desc: "Double rewards from hourly gifts" },
    { id: "ONLINE_P",  label: "⚡ +30% Mining",   mult: { online: 1.30 }, desc: "30% increased online mining speed" },
    { id: "OFFLINE_P", label: "🌙 +30% Offline",  mult: { offline: 1.30 }, desc: "30% increased offline mining rate" },
    { id: "SALE_25",   label: "💰 -25% Upgrades", mult: { upgradeCost: 0.75 }, desc: "25% discount on all upgrades" },
  ],
  
  // Time Chest (random spawn)
  CHEST_MINUTES_MIN: 20,
  CHEST_MINUTES_MAX: 40,
  CHEST_WINDOW_SEC: 60,                      // 60s to claim
  CHEST_REWARD_RANGE: [500, 5000],

  // Prestige System
  PRESTIGE_MIN_VAULT: 10000000,              // 10M MLEO minimum for prestige
  PRESTIGE_POINTS_PER_MILLION: 1,            // 1 prestige point per 1M MLEO
  PRESTIGE_MULT_PER_POINT: 0.02,             // +2% per prestige point

  // Prestige Upgrades (persist through resets)
  PRESTIGE_UPGRADES: [
    { id: "pp_mult", name: "Prestige Multiplier", baseCost: 1, mult: 0.5, maxLvl: 10, desc: "Increases prestige points gained" },
    { id: "pp_auto", name: "Auto Prestige", baseCost: 3, mult: 1, maxLvl: 1, desc: "Automatically prestige at 15M MLEO" },
    { id: "pp_efficiency", name: "Prestige Efficiency", baseCost: 2, mult: 0.3, maxLvl: 15, desc: "More MLEO from mining" },
    { id: "pp_speed", name: "Prestige Speed", baseCost: 5, mult: 0.2, maxLvl: 8, desc: "Faster upgrade progression" },
  ],

  // Achievements
  ACHIEVEMENTS: [
    { id: "first_million", name: "First Million", desc: "Mine 1.00M MLEO total", goal: 1000000, reward: { type: "prestige", amount: 1 } },
    { id: "boost_master", name: "Boost Master", desc: "Click boost 1000 times", goal: 1000, reward: { type: "prestige", amount: 1 } },
    { id: "online_warrior", name: "Online Warrior", desc: "Stay online for 24 hours", goal: 1440, reward: { type: "prestige", amount: 2 } },
    { id: "upgrade_king", name: "Upgrade King", desc: "Buy 100 upgrades total", goal: 100, reward: { type: "prestige", amount: 1 } },
    { id: "gift_collector", name: "Gift Collector", desc: "Claim 500 gifts", goal: 500, reward: { type: "prestige", amount: 1 } },
    { id: "prestige_novice", name: "Prestige Novice", desc: "Complete your first prestige", goal: 1, reward: { type: "prestige", amount: 5 } },
  ],

  // Mastery System
  MASTERY_BRANCHES: [
    { id: "mining", name: "Mining Mastery", color: "emerald" },
    { id: "efficiency", name: "Efficiency Mastery", color: "blue" },
    { id: "automation", name: "Automation Mastery", color: "purple" },
  ],
};

// ============================================================================
// STORAGE HELPERS
// ============================================================================
function safeRead(key, fallback = {}) {
  if (typeof window === "undefined") return fallback;
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ============================================================================
// CORE STATE
// ============================================================================
const initialCore = {
  miningPool: 0,      // accumulates from passive mining
  vault: 0,           // collected MLEO (for upgrades or wallet claim)
  totalMined: 0,      // lifetime total

  mode: "online",
  offlineStart: 0,
  lastActiveAt: Date.now(),

  upgrades: {},

  lastGiftAt: 0,
  lastDailyAt: 0,
  dailyStreak: 0,

  guild: { id: null, name: null, members: 0, bonus: 0 },

  // New progression systems
  prestigePoints: 0,
  prestigeUpgrades: {},
  totalBoosts: 0,
  totalUpgrades: 0,
  totalGifts: 0,
  totalMinutesOnline: 0,
};

const initialSession = {
  boost: 0,
  clicksWindow: [],
  modifier: null,
  chest: null,
};

// ============================================================================
// UTILITIES
// ============================================================================
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function fmt(n) {
  if (n >= 1e9) return (n/1e9).toFixed(2)+"B";
  if (n >= 1e6) return (n/1e6).toFixed(2)+"M";
  if (n >= 1e3) return (n/1e3).toFixed(2)+"K";
  return Math.floor(n).toString();
}
const dayKey = (d = new Date()) => d.toISOString().slice(0,10);
const isNewDailyReset = (ts) => !ts || dayKey(new Date(ts)) !== dayKey(new Date());
function randInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================
function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
      <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl border-2 border-emerald-400 flex items-center gap-3">
        <span className="text-2xl">✨</span>
        <span className="font-bold text-lg">{message}</span>
      </div>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState(null);
  
  const showToast = (message) => {
    setToast(message);
  };
  
  const ToastContainer = () => (
    toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null
  );
  
  return { showToast, ToastContainer };
}

// ============================================================================
// INFO MODAL
// ============================================================================
function InfoModal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm"></div>
      <div className="relative bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-emerald-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-2xl font-bold text-zinc-400 hover:text-white"
        >
          ×
        </button>
        <h3 className="text-2xl font-bold mb-4 text-emerald-400">{title}</h3>
        <div className="text-zinc-300 space-y-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PRESENCE & MINING ENGINE
// ============================================================================
function usePresenceAndMining(getMultiplier, liveModifierMult) {
  const [core, setCore] = useState(() => ({ ...initialCore, ...safeRead(LS_KEYS.CORE, initialCore) }));
  const [sess, setSess] = useState(() => ({ ...initialSession, ...safeRead(LS_KEYS.SESSION, initialSession) }));
  const idleTimerRef = useRef(null);
  const rafRef = useRef(0);
  const prevRef = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());
  const sessRef = useRef(sess); // Track current session state

  useEffect(() => { safeWrite(LS_KEYS.CORE, core); }, [core]);
  useEffect(() => {
    safeWrite(LS_KEYS.SESSION, sess); 
    sessRef.current = sess; // Keep ref in sync
  }, [sess]);

  // Init: schedule modifiers & chest
  useEffect(() => {
    if (core.offlineStart && core.offlineStart > 0) setCore(c => ({ ...c, mode: "offline" }));
    resetIdleTimer();
    scheduleNextModifier(setSess);
    maybeSpawnChest(setSess);
    // eslint-disable-next-line
  }, []);

  function resetIdleTimer() {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setCore(c => {
        if (!c.offlineStart) return { ...c, mode: "offline", offlineStart: Date.now() };
        return { ...c, mode: "offline" };
      });
    }, CONFIG.IDLE_TO_OFFLINE_MS);
  }

  function settleOffline(c, mult) {
    const start = c.offlineStart || Date.now();
    const elapsedMs = Date.now() - start;
    const capped = Math.min(elapsedMs, CONFIG.OFFLINE_MAX_HOURS * 3600 * 1000);
    const hours = capped / 3600000;
    const perHour = CONFIG.ONLINE_BASE_RATE * CONFIG.OFFLINE_RATE_FACTOR * mult * (liveModifierMult("offline") || 1);
    return Math.floor(perHour * hours);
  }

  function markActivity(ev) {
    if (ev && ev.isTrusted === false) return;
    const now = Date.now();

    // Anti-bot + boost update
    setSess(s => {
      const w = [...s.clicksWindow, now].filter(t => now - t <= 1000);
      if (w.length > CONFIG.MAX_CLICKS_PER_SEC) {
        console.log("Too many clicks per second, ignoring");
        return { ...s, clicksWindow: w };
      }

      // Safe boost calculation
      const currentBoost = Number(s.boost) || 0;
      const lastBoostTick = Number(s.lastBoostTick) || now;
      
      // Calculate decay
      const elapsed = Math.max(0, now - lastBoostTick);
      const decayFactor = Math.min(elapsed / CONFIG.BOOST_DECAY_MS, 1);
      const decayedBoost = currentBoost * (1 - decayFactor);
      
      // Add new boost
      const newBoost = Math.min(decayedBoost + CONFIG.BOOST_PER_CLICK, 1.0);
      
      console.log("Boost update:", { currentBoost, elapsed, decayFactor, newBoost });

      return {
        ...s,
        clicksWindow: w,
        boost: newBoost,
        lastBoostTick: now,
      };
    });

    // OFFLINE→ONLINE settlement
    setCore(c => {
      let next = { ...c, lastActiveAt: now };
      if (c.mode === "offline") {
        const mult = getMultiplier();
        const earned = settleOffline(c, mult);
        next.miningPool += earned;
        next.totalMined += earned;
        next.mode = "online";
        next.offlineStart = 0;
      }
      return next;
    });

    resetIdleTimer();
  }

  // Mining loop (online accumulation + boost decay)
  useEffect(() => {
    function loop(t) {
      const prev = prevRef.current || t;
      const dt = (t - prev) / 1000;
      prevRef.current = t;

      // 1) Decay boost over time (using current state)
      setSess(currentSess => {
        if (currentSess.boost > 0 && currentSess.lastBoostTick) {
          const boost = Number(currentSess.boost) || 0;
          const lastTick = Number(currentSess.lastBoostTick) || t;
          const elapsed = Math.max(0, t - lastTick);
          
          // Update every frame for smooth decay
          const progress = Math.min(elapsed / CONFIG.BOOST_DECAY_MS, 1);
          const newBoost = Math.max(0, boost * (1 - progress));
          
          // Only update if change is significant
          if (Math.abs(newBoost - boost) > 0.001) {
            if (newBoost < 0.001) {
              // Boost fully decayed
              return { ...currentSess, boost: 0, lastBoostTick: 0 };
            } else {
              // Update boost value
              return { ...currentSess, boost: newBoost };
            }
          }
        }
        return currentSess; // No change
      });

      // 2) Mine with current boost (using ref for performance)
      setCore(c => {
        if (c.mode !== "online") return c;
        const mult = getMultiplier();
        const perSec = (CONFIG.ONLINE_BASE_RATE * mult * (liveModifierMult("online") || 1)) / 3600;
        const focusFactor = document?.hidden ? 0.5 : 1;
        const boostFactor = 1 + (sessRef.current.boost || 0);
        const gain = perSec * boostFactor * focusFactor * dt;
        if (gain <= 0) return c;
        return { ...c, miningPool: c.miningPool + gain, totalMined: c.totalMined + gain };
      });

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line
  }, [getMultiplier, liveModifierMult]); // Remove sess.boost to avoid infinite loop

  return {
    core, setCore,
    sess, setSess,
    markActivity,
    wake: () => markActivity({ isTrusted: true }),
  };
}

// ============================================================================
// MODIFIERS & CHEST SCHEDULER
// ============================================================================
function scheduleNextModifier(setSess) {
  const nextInMs = CONFIG.MODIFIER_ROTATE_EVERY_MIN * 60000;
  setTimeout(() => {
    const mod = pick(CONFIG.MODIFIERS_POOL);
    const until = Date.now() + CONFIG.MODIFIER_DURATION_MIN * 60000;
    setSess(s => ({ ...s, modifier: { ...mod, until } }));
    setTimeout(() => scheduleNextModifier(setSess), CONFIG.MODIFIER_DURATION_MIN * 60000);
  }, nextInMs);
}

function maybeSpawnChest(setSess) {
  const minutes = randInt(CONFIG.CHEST_MINUTES_MIN, CONFIG.CHEST_MINUTES_MAX);
  setTimeout(() => {
    const expiresAt = Date.now() + CONFIG.CHEST_WINDOW_SEC * 1000;
    const reward = randInt(CONFIG.CHEST_REWARD_RANGE[0], CONFIG.CHEST_REWARD_RANGE[1]);
    setSess(s => ({ ...s, chest: { expiresAt, reward } }));
    setTimeout(() => {
      setSess(s => ({ ...s, chest: null }));
      setTimeout(() => maybeSpawnChest(setSess), randInt(5,10)*60000);
    }, CONFIG.CHEST_WINDOW_SEC * 1000);
  }, minutes * 60000);
}

// ============================================================================
// ECONOMY FUNCTIONS
// ============================================================================
function calcUpgradeCost(baseCost, level, liveModifierMult) {
  const sale = liveModifierMult?.("upgradeCost") || 1;
  return Math.floor(baseCost * Math.pow(1.35, level) * sale);
}

function upgradesMultiplier(upgrades = {}, guild = null, prestigeMultiplier = 1) {
  let mult = 1;
  for (const u of CONFIG.UPGRADES) {
    const lvl = upgrades[u.id] || 0;
    if (lvl > 0) mult += u.mult * lvl;
  }
  if (guild?.bonus) mult += guild.bonus;
  return mult * prestigeMultiplier;
}

function canClaimGift(core) {
  const now = Date.now();
  return !core.lastGiftAt || (now - core.lastGiftAt) >= CONFIG.GIFT_COOLDOWN_SEC * 1000;
}

function giftAmount(core, liveGiftMult = 1) {
  const base = 200 + Math.floor(core.totalMined * 0.002);
  let amt = clamp(base, 100, 20000);
  amt = Math.floor(amt * liveGiftMult);
  return amt;
}

function canClaimDaily(core) { return isNewDailyReset(core.lastDailyAt); }
function nextDailyAmount(core) {
  const idx = clamp(core.dailyStreak, 0, CONFIG.DAILY_BONUS_TABLE.length - 1);
  return CONFIG.DAILY_BONUS_TABLE[idx];
}

function luckyRoll() {
  return Math.random() < CONFIG.GIFT_LUCK_CHANCE ? pick(CONFIG.GIFT_LUCK_MULT) : 1;
}

// ============================================================================
// GLOBAL EVENT SCHEDULER (Fixed UTC-based)
// ============================================================================
function getCurrentGlobalEvent() {
  const now = Date.now();
  const cycleMs = CONFIG.MODIFIER_CYCLE_HOURS * 60 * 60 * 1000; // 3 hours in ms
  const durationMs = CONFIG.MODIFIER_DURATION_MIN * 60 * 1000;   // 30 min in ms
  
  // Calculate which cycle we're in (since Unix epoch)
  const cycleIndex = Math.floor(now / cycleMs);
  const cycleStart = cycleIndex * cycleMs;
  const timeInCycle = now - cycleStart;
  
  // Each event takes 30 minutes, then 30 minutes break, repeat
  const eventIndex = Math.floor(timeInCycle / durationMs);
  const eventInCycleStart = eventIndex * durationMs;
  const eventEnd = cycleStart + eventInCycleStart + durationMs;
  
  // Check if we're in an active event window
  if (timeInCycle >= eventInCycleStart && timeInCycle < (eventInCycleStart + durationMs)) {
    const modifierIndex = eventIndex % CONFIG.MODIFIERS_POOL.length;
    const modifier = CONFIG.MODIFIERS_POOL[modifierIndex];
    
    return {
      modifier: {
        ...modifier,
        until: eventEnd
      },
      nextEventStart: eventEnd + durationMs // Next event starts after current ends + break
    };
  }
  
  // We're in a break period, calculate next event
  const nextEventIndex = eventIndex + 1;
  const nextEventStart = cycleStart + (nextEventIndex * durationMs);
  
  return {
    modifier: null,
    nextEventStart: nextEventStart
  };
}

function getEventSchedule() {
  const now = Date.now();
  const cycleMs = CONFIG.MODIFIER_CYCLE_HOURS * 60 * 60 * 1000;
  const durationMs = CONFIG.MODIFIER_DURATION_MIN * 60 * 1000;
  
  const schedule = [];
  const cycleIndex = Math.floor(now / cycleMs);
  const cycleStart = cycleIndex * cycleMs;
  
  // Generate schedule for current and next cycle
  for (let cycle = 0; cycle < 2; cycle++) {
    const currentCycleStart = cycleStart + (cycle * cycleMs);
    
    for (let i = 0; i < CONFIG.MODIFIERS_POOL.length; i++) {
      const eventStart = currentCycleStart + (i * durationMs);
      const eventEnd = eventStart + durationMs;
      
      if (eventEnd > now) { // Only show future/current events
        const modifier = CONFIG.MODIFIERS_POOL[i];
        const isActive = now >= eventStart && now < eventEnd;
        
        schedule.push({
          modifier,
          start: eventStart,
          end: eventEnd,
          isActive
        });
      }
    }
  }
  
  return schedule.slice(0, 8); // Return next 8 events
}

// ============================================================================
// GUILD FUNCTIONS
// ============================================================================
function useGuildActions(setCore) {
  function joinRandomGuild() {
    const id = Math.floor(Math.random()*100000).toString(36);
    const bonus = CONFIG.GUILD_SAMPLES[Math.floor(Math.random()*CONFIG.GUILD_SAMPLES.length)];
    const members = 1 + Math.floor(Math.random()*20);
    setCore(c => ({ ...c, guild: { id, name: `Leo Guild ${id.toUpperCase()}`, members, bonus } }));
  }
  function leaveGuild() { setCore(c => ({ ...c, guild: { id:null, name:null, members:0, bonus:0 } })); }
  return { joinRandomGuild, leaveGuild };
}

// ============================================================================
// UI COMPONENTS
// ============================================================================
function Stat({ label, value, sub, onInfo }) {
  return (
    <div className="rounded-xl p-3 bg-gradient-to-br from-white/5 to-white/10 border border-white/10 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase opacity-70 font-semibold">{label}</div>
        {onInfo && (
          <button
            onClick={onInfo}
            className="w-4 h-4 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 font-bold text-xs flex items-center justify-center"
            title="Info"
          >
            ?
          </button>
        )}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-xs opacity-60 mt-1">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children, onInfo }) {
  return (
    <div className="rounded-xl p-4 border border-white/10 bg-gradient-to-br from-black/40 to-black/20 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">{title}</h3>
        {onInfo && (
          <button
            onClick={onInfo}
            className="w-6 h-6 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 font-bold text-xs flex items-center justify-center"
            title="Info"
          >
            ?
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ActionButton({ children, onClick, disabled }) {
  return (
    <button
      className={`px-5 py-2.5 rounded-xl font-bold text-white transition-all ${
        disabled 
          ? "bg-zinc-700 cursor-not-allowed opacity-50" 
          : "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg hover:shadow-emerald-500/50"
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function WalletStatus() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const short = (a)=> a ? `${a.slice(0,6)}…${a.slice(-4)}` : "";
  const wrongNet = chainId !== ENV.CLAIM_CHAIN_ID;

  if (!isConnected) {
    return (
      <ActionButton onClick={() => openConnectModal?.()}>
        Connect Wallet
      </ActionButton>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => openAccountModal?.()}
        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 font-semibold"
      >
        {short(address)}{wrongNet ? " • Wrong Network" : ""}
      </button>

      {wrongNet && (
        <ActionButton onClick={()=>switchChain({ chainId: ENV.CLAIM_CHAIN_ID })} disabled={isSwitching}>
          {isSwitching ? "Switching…" : "Switch Network"}
        </ActionButton>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MLEOTokenRushPage() {
  const [mounted, setMounted] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [infoModal, setInfoModal] = useState(null);
  const { showToast, ToastContainer } = useToast();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 100); // Update every 100ms for smooth boost
    return () => clearInterval(id);
  }, []);


  // Core hooks - Use global event system
  const liveModifierMult = (kind) => {
    const { modifier } = getCurrentGlobalEvent();
    if (!modifier) return 1;
    return modifier.mult?.[kind] || 1;
  };

  const getMultiplier = () => upgradesMultiplier(core.upgrades, core.guild, 1 + (core.prestigePoints * CONFIG.PRESTIGE_MULT_PER_POINT));

  const { core, setCore, sess, setSess, markActivity, wake } = 
    usePresenceAndMining(getMultiplier, liveModifierMult);

  // New state for progression systems
  const [achievements, setAchievements] = useState(() => safeRead(LS_KEYS.ACHIEVEMENTS, {}));
  const [mastery, setMastery] = useState(() => safeRead(LS_KEYS.MASTERY, {}));

  // Track boost clicks for achievements
  useEffect(() => {
    if (sess?.boost > 0 && sess?.lastBoostTick) {
      setCore(c => ({ ...c, totalBoosts: c.totalBoosts + 1 }));
    }
  }, [sess?.boost, sess?.lastBoostTick]);

  // Track online time for achievements
  useEffect(() => {
    if (core.mode === "online") {
      const interval = setInterval(() => {
        setCore(c => ({ ...c, totalMinutesOnline: c.totalMinutesOnline + 1 }));
      }, 60000); // Every minute
      return () => clearInterval(interval);
    }
  }, [core.mode]);

  // Wallet hooks
    const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  // Guild
  const { joinRandomGuild, leaveGuild } = useGuildActions(setCore);

  // Bridge
  const [bridgeAmount, setBridgeAmount] = useState("");
  const [otherVault, setOtherVault] = useState(() => {
    const other = safeRead(OTHER_GAME_CORE_KEY, null);
    return other && typeof other.vault === "number" ? other.vault : 0;
  });

  const refreshOtherVault = () => {
    const other = safeRead(OTHER_GAME_CORE_KEY, null);
    setOtherVault(other && typeof other.vault === "number" ? other.vault : 0);
  };

  const bridgeFromOther = () => {
    const amt = Math.max(0, Math.floor(Number(bridgeAmount) || 0));
    if (amt <= 0) { showToast("❌ Enter a positive amount"); return; }
    
    const minersData = localStorage.getItem(OTHER_GAME_CORE_KEY);
    if (!minersData) { showToast("❌ No MLEO-MINERS data found"); return; }
    
    const minersState = JSON.parse(minersData);
    const available = Number((minersState?.vault || 0).toFixed(2));
    
    if (amt > available) { showToast("❌ Not enough balance in MLEO-MINERS"); return; }
    
    const newMinersState = {
      ...minersState,
      vault: Number((available - amt).toFixed(2)),
      history: Array.isArray(minersState.history) ? minersState.history : []
    };
    newMinersState.history.unshift({ 
      t: Date.now(), 
      kind: 'bridge_to_rush', 
      amount: amt 
    });
    
    localStorage.setItem(OTHER_GAME_CORE_KEY, JSON.stringify(newMinersState));
    
    setCore(c => ({ ...c, vault: c.vault + amt }));
    setBridgeAmount(""); 
    setOtherVault(available - amt);
    showToast(`✅ Bridged ${fmt(amt)} MLEO from MINERS!`);
  };

  // Actions
  const collectMined = () => {
    const amt = Math.floor(core.miningPool || 0);
    if (amt <= 0) return;
    setCore(c => ({ ...c, miningPool: 0, vault: c.vault + amt }));
    showToast(`💰 Collected ${fmt(amt)} MLEO!`);
  };

  // Prestige System
  const canPrestige = () => core.vault >= CONFIG.PRESTIGE_MIN_VAULT;
  const getPrestigePoints = () => Math.floor(core.vault / 1000000) * CONFIG.PRESTIGE_POINTS_PER_MILLION;
  const getPrestigeMultiplier = () => 1 + (core.prestigePoints * CONFIG.PRESTIGE_MULT_PER_POINT);

  const performPrestige = () => {
    if (!canPrestige()) return;
    
    const points = getPrestigePoints();
    const newPrestigePoints = core.prestigePoints + points;
    
    // Reset everything except prestige data
    setCore(c => ({
      ...initialCore,
      prestigePoints: newPrestigePoints,
      prestigeUpgrades: c.prestigeUpgrades,
      totalBoosts: c.totalBoosts,
      totalUpgrades: c.totalUpgrades,
      totalGifts: c.totalGifts,
      totalMinutesOnline: c.totalMinutesOnline,
    }));
    
    showToast(`🌟 Prestiged! Gained ${points} Prestige Points!`);
    checkAchievements();
  };

  // Achievement System
  const checkAchievements = () => {
    const newAchievements = { ...achievements };
    let hasNew = false;

    CONFIG.ACHIEVEMENTS.forEach(achievement => {
      if (newAchievements[achievement.id]) return; // Already unlocked

      let progress = 0;
      switch (achievement.id) {
        case "first_million":
          progress = core.totalMined;
          break;
        case "boost_master":
          progress = core.totalBoosts;
          break;
        case "online_warrior":
          progress = core.totalMinutesOnline;
          break;
        case "upgrade_king":
          progress = core.totalUpgrades;
          break;
        case "gift_collector":
          progress = core.totalGifts;
          break;
        case "prestige_novice":
          progress = core.prestigePoints > 0 ? 1 : 0;
          break;
      }

      if (progress >= achievement.goal) {
        newAchievements[achievement.id] = {
          unlocked: true,
          unlockedAt: Date.now(),
          reward: achievement.reward
        };
        
        // Apply reward
        if (achievement.reward.type === "prestige") {
          setCore(c => ({ ...c, prestigePoints: c.prestigePoints + achievement.reward.amount }));
        }
        
        showToast(`🏆 Achievement Unlocked: ${achievement.name}!`);
        hasNew = true;
      }
    });

    if (hasNew) {
      setAchievements(newAchievements);
      safeWrite(LS_KEYS.ACHIEVEMENTS, newAchievements);
    }
  };

  // Prestige Upgrades
  const buyPrestigeUpgrade = (upgradeId) => {
    const upgrade = CONFIG.PRESTIGE_UPGRADES.find(u => u.id === upgradeId);
    if (!upgrade) return;

    const currentLevel = core.prestigeUpgrades[upgradeId] || 0;
    if (currentLevel >= upgrade.maxLvl) return;

    const cost = Math.floor(upgrade.baseCost * Math.pow(1.5, currentLevel));
    if (core.prestigePoints < cost) return;

    setCore(c => ({
      ...c,
      prestigePoints: c.prestigePoints - cost,
      prestigeUpgrades: { ...c.prestigeUpgrades, [upgradeId]: currentLevel + 1 }
    }));

    showToast(`⭐ Bought ${upgrade.name} Level ${currentLevel + 1}!`);
  };

  const canGift = canClaimGift(core);
  const canDaily = canClaimDaily(core);

  const nextGiftInSec = useMemo(() => {
    if (!core.lastGiftAt) return 0;
    const d = CONFIG.GIFT_COOLDOWN_SEC - Math.floor((nowTick - core.lastGiftAt) / 1000);
    return Math.max(0, d);
  }, [core.lastGiftAt, nowTick]);

  const claimGift = () => {
    if (!canGift) return;
    const luck = luckyRoll();
    const liveMult = liveModifierMult("gift");
    const amt = Math.floor(giftAmount(core, liveMult) * luck);
    setCore(c => ({
      ...c,
      lastGiftAt: Date.now(),
      vault: c.vault + amt,
      totalMined: c.totalMined + amt,
      totalGifts: c.totalGifts + 1,
    }));
    showToast(`🎁 Gift claimed: ${fmt(amt)} MLEO${luck > 1 ? ` (Lucky ×${luck}!)` : ''}!`);
    checkAchievements();
  };

  const claimDaily = () => {
    if (!canDaily) return;
    const amt = nextDailyAmount(core);
    const streak = isNewDailyReset(core.lastDailyAt) ? (core.dailyStreak + 1) : core.dailyStreak;
    setCore(c => ({
      ...c,
      lastDailyAt: Date.now(),
      dailyStreak: clamp(streak, 0, CONFIG.DAILY_BONUS_TABLE.length),
      vault: c.vault + amt,
      totalMined: c.totalMined + amt,
    }));
    showToast(`🎉 Daily Bonus: ${fmt(amt)} MLEO! (Streak: ${streak})`);
  };

  const claimChest = () => {
    const ch = sess.chest;
    if (!ch || ch.expiresAt < Date.now()) return;
    setCore(c => ({
      ...c,
      vault: c.vault + ch.reward,
      totalMined: c.totalMined + ch.reward,
    }));
    setSess(s => ({ ...s, chest: null }));
    showToast(`📦 Time Chest claimed: ${fmt(ch.reward)} MLEO!`);
  };

  const buyUpgrade = (id) => {
    const u = CONFIG.UPGRADES.find(x => x.id === id);
    if (!u) return;
    const lvl = core.upgrades[id] || 0;
    if (lvl >= u.maxLvl) return;
    const cost = calcUpgradeCost(u.baseCost, lvl, liveModifierMult);
    if (core.vault < cost) return;
    setCore(c => ({
      ...c,
      vault: c.vault - cost,
      upgrades: { ...c.upgrades, [id]: lvl + 1 },
      totalUpgrades: c.totalUpgrades + 1,
    }));
    showToast(`⬆️ Upgraded ${u.name} to Level ${lvl + 1}!`);
    checkAchievements();
  };

  // Claim to wallet
  const claimingRef = useRef(false);
  const [claimAmount, setClaimAmount] = useState("");
  
  async function claimToWallet() {
    if (claimingRef.current) {
      console.log("Already claiming, skipping...");
      return;
    }
    
    // Determine amount to claim
    const vaultAmount = Math.floor(core.vault || 0);
    let amount;
    
    if (claimAmount && claimAmount.trim() !== "") {
      // User specified amount
      amount = Math.floor(Number(claimAmount) || 0);
      if (amount <= 0) { showToast("❌ Enter a valid amount"); return; }
      if (amount > vaultAmount) { showToast(`❌ Not enough balance. Available: ${fmt(vaultAmount)}`); return; }
    } else {
      // Claim all
      amount = vaultAmount;
    }
    
    console.log("🔵 Starting claim process, claiming amount:", amount, "vault total:", vaultAmount);
    
    if (!ENV.CLAIM_ADDRESS) { showToast("❌ CLAIM_ADDRESS not configured"); return; }
    if (!isConnected || !address) { showToast("❌ Connect wallet first"); return; }
    if (amount <= 0) { showToast("❌ Nothing to claim"); return; }

    if (chainId !== ENV.CLAIM_CHAIN_ID) {
      try { 
        showToast(`⏳ Switching to network ${ENV.CLAIM_CHAIN_ID}...`);
        await switchChain({ chainId: ENV.CLAIM_CHAIN_ID }); 
      }
      catch (switchErr) { 
        console.error("Network switch error:", switchErr);
        showToast(`❌ Please switch to network ${ENV.CLAIM_CHAIN_ID}`); 
        return; 
      }
    }

    try {
      const units = parseUnits(amount.toFixed(2), ENV.TOKEN_DECIMALS);
      if (units <= 0n) { showToast("❌ Invalid amount"); return; }

    claimingRef.current = true;
      showToast("⏳ Preparing transaction...");

      console.log("🔵 Simulating contract call...");
    const { request } = await publicClient.simulateContract({
      address: ENV.CLAIM_ADDRESS,
      abi: CLAIM_ABI_V3,
      functionName: "claim",
        args: [GAME_ID_BI, units],
      account: address,
    });

      console.log("🔵 Writing contract...");
      showToast("⏳ Please confirm in wallet...");
    const hash = await writeContract(request);
      
      if (!hash) {
        console.error("❌ No transaction hash returned");
        showToast("❌ Transaction failed");
        return;
      }

      console.log("🔵 Transaction sent, hash:", hash);
      showToast("⏳ Waiting for blockchain confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash,
        confirmations: 1,
        timeout: 60000 // 60 seconds
      });

      console.log("🔵 Receipt received:", receipt?.status);

      if (receipt?.status === "success") {
        console.log("✅ Transaction confirmed! Resetting vault...");
        
        // Deduct claimed amount from vault
        setCore(prevCore => {
          const currentVault = prevCore.vault || 0;
          const newVault = Math.max(0, currentVault - amount);
          const newCore = { ...prevCore, vault: newVault };
          console.log("✅ Vault updated. Before:", currentVault, "Claimed:", amount, "After:", newVault);
          return newCore;
        });
        
        // Clear claim amount input
        setClaimAmount("");
        
        showToast(`✅ Successfully claimed ${fmt(amount)} MLEO!`);
      } else {
        console.error("❌ Transaction status:", receipt?.status);
        showToast("❌ Transaction failed on blockchain");
      }
    } catch (err) {
      console.error("❌ Claim error:", err);
      const msg = String(err?.shortMessage || err?.message || err);
      
      // Don't show confusing technical errors
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        showToast("❌ Transaction cancelled");
      } else if (!/Cannot convert undefined to a BigInt/i.test(msg)) {
        showToast(`❌ Error: ${msg.slice(0, 50)}`);
      }
    } finally {
      claimingRef.current = false;
      console.log("🔵 Claim process finished, ref reset");
    }
  }

  const mult = useMemo(() => getMultiplier(), [core.upgrades, core.guild]);

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-6xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Token Rush</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }
 
  return (
    <Layout isGame={true} title="MLEO — Token Rush">
      <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
        <div className="max-w-6xl mx-auto p-4 pb-20">

          <ToastContainer />

          {/* HEADER */}
          <header className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
  <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-green-300 bg-clip-text text-transparent">
                MLEO Token Rush
              </h1>
              <div className="text-sm opacity-70 mt-1">Passive crypto mining • Earn MLEO tokens</div>
              <div className="mt-3 flex flex-wrap gap-2">
      {(() => {
                  const { modifier } = getCurrentGlobalEvent();
                  return modifier ? (
                    <span className="px-3 py-1.5 rounded-xl text-xs border border-amber-500/30 bg-amber-500/10 text-amber-300 font-bold">
                      🔥 Active: {modifier.label}
                    </span>
                  ) : (
                    <button
                      onClick={() => setInfoModal('events')}
                      className="px-3 py-1.5 rounded-xl text-xs border border-white/10 bg-white/5 opacity-60 hover:opacity-100 hover:bg-white/10 transition"
                    >
                      No active event
                    </button>
                  );
                })()}
                {sess.chest && sess.chest.expiresAt > Date.now() && (
                  <span className="px-3 py-1.5 rounded-xl text-xs border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 font-bold animate-pulse">
                    📦 Chest expires in {Math.max(0, Math.ceil((sess.chest.expiresAt - Date.now())/1000))}s!
                  </span>
                )}
    </div>
  </div>

            <div className="flex items-center gap-2">
              <Link href="/mining">
                <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                  ← BACK
                </button>
    </Link>
    <WalletStatus />
              <button
                onClick={wake}
                className={`px-4 py-2 rounded-xl text-sm font-bold ${
                  core.mode === "online"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-amber-600 hover:bg-amber-500 animate-pulse"
                }`}
                title={core.mode === "online" ? "Click to boost mining speed" : "Resume mining and collect offline earnings"}
              >
                {core.mode === "online" ? "⚡ BOOST" : "🔔 RESUME"}
              </button>
  </div>
</header>

          {/* TOP STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <Stat
              label="Mining Status"
    value={
                <span className={`inline-flex items-center gap-2 ${core.mode === "online" ? "text-emerald-400" : "text-amber-400"}`}>
                  <span className={`w-3 h-3 rounded-full animate-pulse ${core.mode === "online" ? "bg-emerald-400" : "bg-amber-400"}`} />
        {core.mode.toUpperCase()}
      </span>
    }
              sub={core.mode === "online" ? "Active mining" : "Offline (reduced rate)"}
              onInfo={() => setInfoModal('mining_status')}
            />

            <Stat 
              label="Mining Pool" 
              value={fmt(core.miningPool)} 
              sub="Click COLLECT to claim"
              onInfo={() => setInfoModal('mining_pool')}
            />

            <Stat 
              label="Total Mined" 
              value={fmt(core.totalMined)} 
              sub={`Multiplier: ${mult.toFixed(2)}×`}
              onInfo={() => setInfoModal('total_mined')}
            />

            <div className="rounded-xl p-3 bg-gradient-to-br from-white/5 to-white/10 border border-white/10 shadow-sm">
  <div className="flex items-center justify-between">
                <div className="text-xs uppercase opacity-70 font-semibold">BOOST</div>
    <button
                  onClick={() => setInfoModal('boost')}
                  className="w-4 h-4 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 font-bold text-xs flex items-center justify-center"
                  title="Info"
                >
                  ?
    </button>
  </div>
              <div className="text-xl font-bold tabular-nums mt-1">
                {(() => {
                  const boost = Number(sess.boost) || 0;
                  const lastTick = Number(sess.lastBoostTick) || 0;
                  
                  if (boost === 0 || !lastTick) return "0%";
                  
                  // Calculate current decayed boost for display
                  const elapsed = Math.max(0, nowTick - lastTick);
                  const progress = Math.min(elapsed / CONFIG.BOOST_DECAY_MS, 1);
                  const currentBoost = Math.max(0, boost * (1 - progress));
                  
                  if (currentBoost < 0.001) return "0%";
                  if (currentBoost > 1.0) return "100%";
                  return Math.round(currentBoost * 100) + "%";
                })()}
  </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mt-1">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400" style={{ 
                  width: `${(() => {
                    const boost = Number(sess.boost) || 0;
                    const lastTick = Number(sess.lastBoostTick) || 0;
                    
                    if (boost === 0 || !lastTick) return 0;
                    
                    const elapsed = Math.max(0, nowTick - lastTick);
                    const progress = Math.min(elapsed / CONFIG.BOOST_DECAY_MS, 1);
                    const currentBoost = Math.max(0, boost * (1 - progress));
                    
                    return Math.min(currentBoost * 100, 100);
                  })()}%` 
                }} />
              </div>
              <div className="text-xs opacity-60 mt-1">
                {core.mode === "online" ? "Click to boost" : "Click to resume"}
              </div>
  </div>
</div>

          {/* VAULT & ACTIONS */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <Section 
              title="Your MLEO Vault" 
              onInfo={() => setInfoModal('vault')}
            >
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-xl bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30 p-3">
                  <div className="text-xs opacity-70 mb-1">Available MLEO</div>
                  <div className="text-xl font-bold tabular-nums text-emerald-400">{fmt(core.vault)}</div>
</div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-xs opacity-70 mb-1">Claim Amount</div>
                  <input 
                    type="number" 
                    className="w-full bg-transparent border-none text-sm outline-none"
                    value={claimAmount} 
                    onChange={e=>setClaimAmount(e.target.value)} 
                    placeholder="All"
                    min="0"
                    max={core.vault}
                  />
                </div>
      </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={collectMined}
                  disabled={core.miningPool <= 0}
                  className={`h-10 rounded-lg font-bold text-white text-sm transition-all ${
                    core.miningPool <= 0
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400"
                  }`}
                >
                  💰 COLLECT MINED
        </button>

                <button 
                  onClick={claimToWallet}
                  disabled={isPending || core.vault <= 0}
                  className={`h-10 rounded-lg font-bold text-white text-sm transition-all ${
                    (isPending || core.vault <= 0)
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-indigo-600 to-purple-500 hover:from-indigo-500 hover:to-purple-400"
                  }`}
                >
                  {isPending ? "⏳ CLAIMING..." : "🔗 CLAIM"}
        </button>
      </div>

              <div className="mt-3 text-xs opacity-60">
                Collect your mined MLEO to the vault. Use it for upgrades or claim to your wallet.
      </div>
            </Section>

            {/* GIFTS & BONUSES */}
            <Section 
              title="Gifts & Bonuses"
              onInfo={() => setInfoModal('gifts')}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <ActionButton onClick={claimGift} disabled={!canGift}>
                    🎁 Hourly Gift {!canGift && `(${nextGiftInSec}s)`}
                  </ActionButton>
                  <ActionButton onClick={claimDaily} disabled={!canDaily}>
                    🌟 Daily Bonus
                  </ActionButton>
        </div>

                {sess.chest && sess.chest.expiresAt > Date.now() && (
                  <ActionButton onClick={claimChest}>
                    📦 CLAIM CHEST: {fmt(sess.chest.reward)} MLEO
                  </ActionButton>
                )}

                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="text-sm opacity-70 mb-1">Daily Streak</div>
                  <div className="text-2xl font-bold">{core.dailyStreak} days</div>
                  <div className="text-xs opacity-60 mt-1">Next bonus: {nextDailyAmount(core)} MLEO</div>
      </div>
    </div>
  </Section>
          </div>

          {/* BRIDGE + GUILD - Same Row */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            {/* BRIDGE */}
            <Section 
              title="🌉 Bridge from MINERS"
              onInfo={() => setInfoModal('bridge')}
            >
              <div className="flex flex-col gap-2">
                <div className="text-xs opacity-60">
                  MINERS Vault: <span className="font-semibold text-emerald-400">{fmt(otherVault)}</span>
                  <button className="ml-2 underline" onClick={refreshOtherVault}>↻</button>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    value={bridgeAmount} 
                    onChange={e=>setBridgeAmount(e.target.value)} 
                    placeholder="Amount" 
                    min="0" 
                  />
                  <button
                    onClick={bridgeFromOther} 
                    disabled={(Number(bridgeAmount)||0) <= 0}
                    className={`px-4 py-2 rounded-lg font-bold text-white transition-all text-sm whitespace-nowrap ${
                      (Number(bridgeAmount)||0) <= 0
                        ? "bg-zinc-700 cursor-not-allowed opacity-50" 
                        : "bg-gradient-to-r from-teal-600 to-cyan-500 hover:from-teal-500 hover:to-cyan-400"
                    }`}
                  >
                    Bridge
        </button>
      </div>
    </div>
  </Section>

            {/* GUILD */}
            <Section 
              title="👥 Mining Guild"
              onInfo={() => setInfoModal('guild')}
            >
              {!core.guild?.id ? (
                <div className="flex flex-col gap-3">
                  <div className="text-sm opacity-80">Join a guild for mining bonus!</div>
                  <ActionButton onClick={joinRandomGuild}>
                    Join Random Guild
                  </ActionButton>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="font-bold text-lg text-emerald-400">{core.guild.name}</div>
                    <div className="text-sm opacity-70 mt-1">
                      Members: {core.guild.members} • Bonus: <span className="text-emerald-400 font-bold">+{Math.round((core.guild.bonus||0)*100)}%</span>
    </div>
    </div>
                  <ActionButton onClick={leaveGuild}>
                    Leave Guild
                  </ActionButton>
                </div>
              )}
  </Section>
</div>

          {/* UPGRADES */}
          <Section 
            title="Upgrades"
            onInfo={() => setInfoModal('upgrades')}
          >
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {CONFIG.UPGRADES.map(u => {
      const lvl = core.upgrades[u.id] || 0;
      const maxed = lvl >= u.maxLvl;
                const cost = calcUpgradeCost(u.baseCost, lvl, liveModifierMult);
                const cantAfford = core.vault < cost;
      return (
                  <div key={u.id} className="rounded-2xl p-4 bg-gradient-to-br from-white/5 to-white/10 border border-white/10 flex flex-col gap-3 hover:border-emerald-500/30 transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-lg">{u.name}</div>
                        <div className="text-xs opacity-60 mt-1">{u.desc}</div>
          </div>
                      <div className="text-xs px-2 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 font-bold whitespace-nowrap">
                        Lv {lvl}/{u.maxLvl}
          </div>
        </div>
                    <div className="text-sm opacity-70">
                      Effect: <span className="text-emerald-400 font-bold">+{Math.round(u.mult * 100)}%</span> per level
  </div>
                    <div className="mt-auto">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="opacity-70">Cost</span>
                        <span className="font-bold tabular-nums text-lg">{fmt(cost)}</span>
  </div>
          <button
                        onClick={() => buyUpgrade(u.id)} 
                        disabled={maxed || cantAfford}
                        className={`w-full h-12 rounded-xl font-bold text-white transition-all ${
                          (maxed || cantAfford) 
                            ? "bg-zinc-700 cursor-not-allowed opacity-50" 
                            : "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 shadow-lg"
                        }`}
                      >
                        {maxed ? "✓ MAXED" : cantAfford ? "Insufficient MLEO" : `BUY (${fmt(cost)})`}
          </button>
                    </div>
        </div>
      );
    })}
  </div>
</Section>

          {/* PRESTIGE SYSTEM */}
          <Section 
            title="🌟 Prestige System"
            onInfo={() => setInfoModal('prestige')}
          >
            <div className="grid lg:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl p-4 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 border border-yellow-500/30">
                <div className="text-sm font-semibold mb-2">Prestige Points</div>
                <div className="text-2xl font-bold text-yellow-400">{core.prestigePoints}</div>
                <div className="text-xs opacity-70 mt-1">Permanent boost: +{Math.round((getPrestigeMultiplier() - 1) * 100)}%</div>
    </div>
              
              <div className="rounded-xl p-4 bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/30">
                <div className="text-sm font-semibold mb-2">Next Prestige</div>
                <div className="text-lg font-bold text-purple-400">
                  {canPrestige() ? `+${getPrestigePoints()} Points` : `${fmt(CONFIG.PRESTIGE_MIN_VAULT - core.vault)} to go`}
                </div>
            <button
                  onClick={performPrestige}
                  disabled={!canPrestige()}
                  className={`w-full mt-3 py-2 rounded-lg font-bold text-white text-sm transition-all ${
                    canPrestige()
                      ? "bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400 shadow-lg"
                      : "bg-zinc-700 cursor-not-allowed opacity-50"
                  }`}
                >
                  {canPrestige() ? `🌟 PRESTIGE (+${getPrestigePoints()})` : "Need 10M MLEO"}
            </button>
    </div>
  </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {CONFIG.PRESTIGE_UPGRADES.map(u => {
                const lvl = core.prestigeUpgrades[u.id] || 0;
                const maxed = lvl >= u.maxLvl;
                const cost = Math.floor(u.baseCost * Math.pow(1.5, lvl));
                const cantAfford = core.prestigePoints < cost;
                
                return (
                  <div key={u.id} className="rounded-xl p-3 bg-gradient-to-br from-yellow-600/10 to-orange-600/10 border border-yellow-500/20">
                    <div className="text-sm font-semibold mb-1">{u.name}</div>
                    <div className="text-xs opacity-70 mb-1">{u.desc}</div>
                    <div className="text-sm font-bold mb-2">Lv {lvl}/{u.maxLvl}</div>
                    <button
                      onClick={() => buyPrestigeUpgrade(u.id)}
                      disabled={maxed || cantAfford}
                      className={`w-full py-1.5 rounded text-white text-xs font-bold transition-all ${
                        maxed
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : cantAfford
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400"
                      }`}
                    >
                      {maxed ? "✓ MAXED" : cantAfford ? `${cost} PP` : `Buy ${cost} PP`}
                    </button>
    </div>
                );
              })}
    </div>
  </Section>

          {/* ACHIEVEMENTS */}
<Section
            title="🏆 Achievements"
            onInfo={() => setInfoModal('achievements')}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              {CONFIG.ACHIEVEMENTS.map(achievement => {
                const unlocked = achievements[achievement.id];
                let progress = 0;
                
                switch (achievement.id) {
                  case "first_million": progress = core.totalMined; break;
                  case "boost_master": progress = core.totalBoosts; break;
                  case "online_warrior": progress = core.totalMinutesOnline; break;
                  case "upgrade_king": progress = core.totalUpgrades; break;
                  case "gift_collector": progress = core.totalGifts; break;
                  case "prestige_novice": progress = core.prestigePoints > 0 ? 1 : 0; break;
                }
                
                const progressPercent = Math.min((progress / achievement.goal) * 100, 100);
                
                return (
                  <div key={achievement.id} className={`rounded-xl p-3 border ${
                    unlocked 
                      ? "bg-gradient-to-br from-green-600/20 to-emerald-600/20 border-green-500/30" 
                      : "bg-gradient-to-br from-white/5 to-white/10 border-white/10"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">{achievement.name}</div>
                      {unlocked && <span className="text-green-400">✓</span>}
  </div>
                    <div className="text-xs opacity-70 mb-2">{achievement.desc}</div>
                    <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                      <div 
                        className="h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="text-xs opacity-60">
                      {progress >= achievement.goal ? "Completed!" : 
                        achievement.id === "first_million" ? 
                          `${fmt(progress)}/1.00M` : 
                          `${fmt(progress)}/${fmt(achievement.goal)}`}
                    </div>
                  </div>
                );
              })}
            </div>
</Section>

          {/* INFO MODALS */}
          <InfoModal isOpen={infoModal === 'vault'} onClose={() => setInfoModal(null)} title="💰 MLEO Vault">
            <p><strong>Mining Pool:</strong> Accumulates passively from your mining operations.</p>
            <p><strong>COLLECT MINED:</strong> Transfers your Mining Pool into the Vault.</p>
            <p><strong>Vault:</strong> Your main MLEO balance. Use it to buy upgrades or claim to your wallet.</p>
            <p><strong>CLAIM TO WALLET:</strong> Sends MLEO to your connected wallet on the blockchain (requires gas fees).</p>
            <p className="mt-3 text-amber-400"><strong>⚡ BOOST Button:</strong> When online, clicking boosts your mining speed by +2% per click. When offline, it resumes mining and collects your offline earnings (max 12 hours).</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'gifts'} onClose={() => setInfoModal(null)} title="🎁 Gifts & Bonuses">
            <p><strong>Hourly Gift:</strong> Claim every hour for bonus MLEO. 10% chance for Lucky multiplier (×2 or ×3)!</p>
            <p><strong>How it works:</strong> After claiming, you must wait exactly 1 hour before the next gift is available.</p>
            <p><strong>Daily Bonus:</strong> Claim once per day. Streak increases reward amount (up to 7 days).</p>
            <p><strong>Time Chest:</strong> Spawns randomly every 20-40 minutes. You have 60 seconds to claim it!</p>
            <p className="text-emerald-400 mt-2"><strong>💡 Tip:</strong> Check back every hour to claim your gifts!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'bridge'} onClose={() => setInfoModal(null)} title="🌉 Bridge">
            <p><strong>What is Bridge?</strong> Transfer MLEO tokens from your MLEO-MINERS game to this game's vault.</p>
            <p><strong>Why use it?</strong> If you have MLEO in the other game, you can move it here to buy upgrades faster.</p>
            <p><strong>How it works:</strong> Enter amount → Click BRIDGE → Tokens are moved from MINERS vault to RUSH vault.</p>
            <p className="text-amber-400"><strong>⚠️ Note:</strong> This is a one-way transfer. Tokens moved here cannot be moved back automatically.</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'upgrades'} onClose={() => setInfoModal(null)} title="⬆️ Upgrades">
            <p><strong>What are Upgrades?</strong> Permanent boosts that increase your mining multiplier.</p>
            <p><strong>Cost:</strong> Paid with MLEO from your Vault. Cost increases with each level (×1.35 per level).</p>
            <p><strong>Effect:</strong> Each upgrade adds a percentage to your mining rate per level.</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              {CONFIG.UPGRADES.map(u => (
                <li key={u.id}><strong>{u.name}:</strong> +{Math.round(u.mult*100)}% per level (max {u.maxLvl})</li>
              ))}
  </ul>
            <p className="text-emerald-400 mt-2"><strong>💡 Tip:</strong> Watch for -25% Upgrade cost events to save MLEO!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'prestige'} onClose={() => setInfoModal(null)} title="🌟 Prestige System">
            <p><strong>Prestige</strong> resets your progress in exchange for permanent bonuses!</p>
            <p><strong>How it works:</strong></p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Need 10M MLEO in vault to prestige</li>
              <li>Gain 1 Prestige Point per 1M MLEO</li>
              <li>Each Prestige Point gives +2% permanent boost</li>
              <li>Prestige Upgrades persist through resets</li>
            </ul>
            <p className="text-yellow-400 mt-2"><strong>🌟 Prestige Upgrades:</strong></p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              {CONFIG.PRESTIGE_UPGRADES.map(u => (
                <li key={u.id}><strong>{u.name}:</strong> {u.desc}</li>
              ))}
            </ul>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'achievements'} onClose={() => setInfoModal(null)} title="🏆 Achievements">
            <p><strong>Achievements</strong> reward you for reaching milestones!</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {CONFIG.ACHIEVEMENTS.map(a => (
                <li key={a.id}><strong>{a.name}:</strong> {a.desc} → {a.reward.amount} Prestige Points</li>
              ))}
            </ul>
            <p className="text-green-400 mt-2"><strong>🏆 Tip:</strong> Complete achievements to earn bonus Prestige Points!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'mining_status'} onClose={() => setInfoModal(null)} title="⛏️ Mining Status">
            <p><strong>ONLINE:</strong> Active mining at full speed with all bonuses applied.</p>
            <p><strong>OFFLINE:</strong> Reduced mining rate (50% of online speed) with a 12-hour cap.</p>
            <p><strong>Switch:</strong> Click the BOOST button to toggle between online/offline modes.</p>
            <p className="text-emerald-400 mt-2"><strong>💡 Tip:</strong> Stay online for maximum mining efficiency!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'mining_pool'} onClose={() => setInfoModal(null)} title="⛏️ Mining Pool">
            <p><strong>Mining Pool</strong> accumulates MLEO from your passive mining operations.</p>
            <p><strong>Collection:</strong> Click "COLLECT MINED" to transfer all accumulated MLEO to your Vault.</p>
            <p><strong>Rate:</strong> Mining speed depends on your upgrades, guild bonus, and prestige multiplier.</p>
            <p className="text-blue-400 mt-2"><strong>💡 Tip:</strong> Collect regularly to avoid losing progress!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'total_mined'} onClose={() => setInfoModal(null)} title="📊 Total Mined">
            <p><strong>Total Mined</strong> tracks your lifetime MLEO production across all sessions.</p>
            <p><strong>Multiplier:</strong> Shows your current mining multiplier from upgrades, guild, and prestige.</p>
            <p><strong>Prestige:</strong> Higher prestige levels increase your base multiplier permanently.</p>
            <p className="text-purple-400 mt-2"><strong>💡 Tip:</strong> This number never resets, even after prestige!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'boost'} onClose={() => setInfoModal(null)} title="⚡ Boost System">
            <p><strong>BOOST</strong> temporarily increases your mining speed!</p>
            <p><strong>How it works:</strong></p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Click to add +2% mining speed</li>
              <li>Maximum boost: 100% (50 clicks)</li>
              <li>Decays over 60 seconds</li>
              <li>When offline: Click to resume mining</li>
            </ul>
            <p className="text-emerald-400 mt-2"><strong>⚡ Tip:</strong> Click frequently for maximum mining efficiency!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'events'} onClose={() => setInfoModal(null)} title="🔥 Global Events Schedule">
            <p><strong>Global Events</strong> run on a fixed UTC-based schedule, active for everyone at the same time!</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="font-bold text-emerald-400 mb-2">Available Events:</p>
                <div className="space-y-2">
                  {CONFIG.MODIFIERS_POOL.map(mod => (
                    <div key={mod.id} className="p-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="font-bold">{mod.label}</div>
                      <div className="text-xs opacity-70 mt-1">{mod.desc}</div>
                    </div>
                  ))}
                </div>
</div>

              <div>
                <p className="font-bold text-amber-400 mb-2">Event Schedule:</p>
                <div className="text-xs opacity-70 space-y-1">
                  <p>• Each event lasts <strong>30 minutes</strong></p>
                  <p>• Events repeat every <strong>3 hours</strong></p>
                  <p>• 30-minute break between events</p>
                  <p>• Schedule is synchronized globally (UTC time)</p>
        </div>
              </div>

              <div>
                <p className="font-bold text-blue-400 mb-2">Upcoming Events:</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {getEventSchedule().map((event, idx) => {
                    const timeUntil = event.start - Date.now();
                    const duration = event.end - event.start;
                    const hours = Math.floor(timeUntil / (60 * 60 * 1000));
                    const minutes = Math.floor((timeUntil % (60 * 60 * 1000)) / (60 * 1000));
                    
    return (
                      <div key={idx} className={`p-2 rounded-lg ${event.isActive ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-white/5 border border-white/10'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{event.modifier.label}</span>
                          {event.isActive ? (
                            <span className="text-xs text-amber-300 font-bold">🔥 ACTIVE NOW</span>
                          ) : (
                            <span className="text-xs opacity-60">
                              {hours > 0 ? `in ${hours}h ${minutes}m` : `in ${minutes}m`}
                            </span>
                          )}
                        </div>
                        <div className="text-xs opacity-60 mt-1">
                          {new Date(event.start).toLocaleTimeString()} - {new Date(event.end).toLocaleTimeString()}
                        </div>
      </div>
    );
                  })}
      </div>
    </div>
            </div>
            <p className="text-emerald-400 mt-4"><strong>💡 Tip:</strong> Plan your gameplay around events to maximize your rewards!</p>
          </InfoModal>

          <InfoModal isOpen={infoModal === 'guild'} onClose={() => setInfoModal(null)} title="👥 Mining Guild">
            <p><strong>What is a Guild?</strong> A social group that provides a passive mining bonus.</p>
            <p><strong>Bonus:</strong> Guilds give +2% to +8% extra mining multiplier (random).</p>
            <p><strong>How to join:</strong> Click "Join Random Guild" to be assigned to a guild.</p>
            <p><strong>Leave anytime:</strong> You can leave and join a different guild if you want a better bonus.</p>
            <p className="text-amber-400"><strong>Note:</strong> This is a local demo. In production, guilds would be shared across players.</p>
          </InfoModal>

        </div>
      </main>
    </Layout>
  );
}
