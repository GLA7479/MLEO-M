// === MLEO SPACE MINING STATION ===
// v1.1 - Futuristic space mining game with robots and asteroids
// Completely different style from the original miners game

import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { useRouter } from "next/router";

// ===== Space Mining MLEO System =====
const SPACE_MLEO_LS_KEY = "mleoSpaceMining_v1_1";

// ===== Mining Contract Configuration =====
// BSC Testnet
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);

// כתובת חוזה ה- V3 (חובה!)
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || process.env.NEXT_PUBLIC_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);

// משחק זה = GameId 2 (SPACE)
const GAME_ID = 2;

function isValidAddress(a){ return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }

// ABI מינימלי של V3: claim(gameId, amount)
const MINING_CLAIM_ABI = [{
  type: "function",
  name: "claim",
  stateMutability: "nonpayable",
  inputs: [
    { name: "gameId", type: "uint256" },
    { name: "amount", type: "uint256" }
  ],
  outputs: []
}];

// אפשרות עקיפה לטסטנט (אם השתמשת בזה לשחרור מוקדם; לא נדרש לחתימה)
const ALLOW_TESTNET_WALLET_FLAG =
  (process.env.NEXT_PUBLIC_ALLOW_TESTNET_WALLET || "").toLowerCase() === "1" ||
  (process.env.NEXT_PUBLIC_ALLOW_TESTNET_WALLET || "").toLowerCase() === "true";

// ===== Formatting Functions =====
const SUFFIXES_BASE = ["", "K", "M", "B", "T"];

function suffixFromTier(tier) {
  if (tier < SUFFIXES_BASE.length) return SUFFIXES_BASE[tier];
  const idx = tier - SUFFIXES_BASE.length; // 0→AA, 1→AB ...
  let n = idx + 26; // 26→"AA"
  let s = "";
  while (n >= 0) {
    const q = Math.floor(n / 26) - 1;
    const r = n % 26;
    s = String.fromCharCode(65 + r) + s;
    n = q;
  }
  return s;
}

function formatAbbrevInt(n) {
  const sign = (n || 0) < 0 ? "-" : "";
  const abs  = Math.abs(Number(n) || 0);
  const p = 100; // 2 ספרות

  if (abs < 1000) {
    const t = Math.trunc(abs * p) / p;
    return sign + t.toString();
  }

  const tier = Math.floor(Math.log10(abs) / 3);
  const scaled = abs / Math.pow(1000, tier);
  const trimmed = Math.trunc(scaled * p) / p;
  return sign + trimmed.toFixed(2) + suffixFromTier(tier);
}

const formatShort = formatAbbrevInt;

function formatMleoShort(n) {
  return formatAbbrevInt(n);
}

function formatMleo2(n) {
  const num = Number(n || 0);
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const p = 100; // 2 ספרות
  const t = Math.trunc(abs * p) / p;
  return sign + t.toString();
}

// ===== Space MLEO Functions (vault/history) =====
function loadSpaceMleoState(){
  try {
    const raw = localStorage.getItem(SPACE_MLEO_LS_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      st.vault = Number(st.vault || 0);
      st.claimedToWallet = Number(st.claimedToWallet || 0);
      st.history = Array.isArray(st.history) ? st.history : [];
      return st;
    }
  } catch {}
  return { vault: 0, claimedToWallet: 0, history: [] };
}
function saveSpaceMleoState(st){
  try { localStorage.setItem(SPACE_MLEO_LS_KEY, JSON.stringify(st)); } catch {}
}

function addMleoToVault(amount, setSpaceMleo) {
  const st = loadSpaceMleoState();
  st.vault = Number(((st.vault || 0) + amount).toFixed(2));
  saveSpaceMleoState(st);
  setSpaceMleo(st);
  return st;
}

// ===== Robust Game-State Persist (Atomic + Throttle) =====
const LS_KEY = "mleoSpaceMining_v1_1";
const LS_STAGING = `${LS_KEY}__staging`;
const SAVE_THROTTLE_MS = 1500;
function atomicSave(key, obj) {
  const payload = JSON.stringify(obj);
  localStorage.setItem(LS_STAGING, payload);
  localStorage.setItem(key, payload);
  localStorage.removeItem(LS_STAGING);
}
let __saveTimer = 0;
function saveGameState(state, {force=false} = {}) {
  try {
    if (force) { atomicSave(LS_KEY, state); state.lastSave = Date.now(); return; }
    if (__saveTimer) clearTimeout(__saveTimer);
    __saveTimer = setTimeout(() => {
      atomicSave(LS_KEY, state);
      state.lastSave = Date.now();
      __saveTimer = 0;
    }, SAVE_THROTTLE_MS);
  } catch (e) {
    console.warn("Failed to save game state:", e);
  }
}

function loadGameState() {
  try {
    const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_STAGING);
    if (!raw) return getInitialState();
    const state = JSON.parse(raw);
    // Ensure all required arrays/objects exist
    state.robots = state.robots || [];
    state.asteroids = state.asteroids || [];
    state.materials = state.materials || {
      iron: 0, silicon: 0, titanium: 0, platinum: 0, rare_earth: 0, quantum_core: 0
    };
    state.nextRobotId = state.nextRobotId || 1;
    state.lastSave = state.lastSave || Date.now();
    state.lastUpdate = state.lastUpdate || Date.now();
    
    // Ensure robot upgrades exist
    state.robotUpgrades = state.robotUpgrades || {
      speed: 0,
      efficiency: 0,
      range: 0,
      autoMerge: 0
    };
    
    return state;
  } catch {
    return getInitialState();
  }
}

// ===== Robot Upgrades System =====
const ROBOT_UPGRADES = {
  speed: {
    id: 'speed',
    name: 'Speed Boost',
    description: 'Increase robot movement speed by 50%',
    baseCost: 300,
    maxLevel: 5,
    effect: (level) => 1 + (level * 0.5) // +50% per level
  },
  efficiency: {
    id: 'efficiency',
    name: 'Mining Efficiency',
    description: 'Increase mining efficiency by 30%',
    baseCost: 500,
    maxLevel: 5,
    effect: (level) => 1 + (level * 0.3) // +30% per level
  },
  range: {
    id: 'range',
    name: 'Mining Range',
    description: 'Increase mining range by 100%',
    baseCost: 800,
    maxLevel: 3,
    effect: (level) => 1 + (level * 1.0) // +100% per level
  },
  autoMerge: {
    id: 'autoMerge',
    name: 'Auto Merge',
    description: 'Increase auto merge speed',
    baseCost: 1000,
    maxLevel: 3,
    effect: (level) => 1 - (level * 0.2) // -20% cooldown per level
  }
};

// ===== Robot Upgrade Functions =====
function getUpgradeCost(upgradeId, currentLevel) {
  const upgrade = ROBOT_UPGRADES[upgradeId];
  if (!upgrade) return 0;
  return Math.floor(upgrade.baseCost * Math.pow(1.5, currentLevel));
}

function canAffordUpgrade(state, upgradeId) {
  const upgrade = ROBOT_UPGRADES[upgradeId];
  if (!upgrade) return false;
  
  const currentLevel = state.robotUpgrades?.[upgradeId] || 0;
  if (currentLevel >= upgrade.maxLevel) return false;
  
  const cost = getUpgradeCost(upgradeId, currentLevel);
  return state.credits >= cost;
}

function purchaseUpgrade(state, upgradeId) {
  if (!canAffordUpgrade(state, upgradeId)) return false;
  
  const upgrade = ROBOT_UPGRADES[upgradeId];
  const currentLevel = state.robotUpgrades?.[upgradeId] || 0;
  const cost = getUpgradeCost(upgradeId, currentLevel);
  
  state.credits -= cost;
  state.robotUpgrades = state.robotUpgrades || {};
  state.robotUpgrades[upgradeId] = currentLevel + 1;
  
  console.log(`⚡ Upgraded ${upgrade.name} to level ${currentLevel + 1}!`);
  return true;
}

function applyRobotUpgrades(state) {
  if (!state.robotUpgrades || !state.robots) return;
  
  const speedMultiplier = ROBOT_UPGRADES.speed.effect(state.robotUpgrades.speed || 0);
  const efficiencyMultiplier = ROBOT_UPGRADES.efficiency.effect(state.robotUpgrades.efficiency || 0);
  
  state.robots.forEach(robot => {
    // Store base values if not already stored
    if (!robot.baseSpeed) robot.baseSpeed = robot.speed;
    if (!robot.baseEfficiency) robot.baseEfficiency = robot.efficiency;
    
    robot.speed = robot.baseSpeed * speedMultiplier;
    robot.efficiency = robot.baseEfficiency * efficiencyMultiplier;
  });
}

function getInitialState() {
  return {
    // Resources
    credits: 500,
    energy: 100,
    mleo: 0, // MLEO tokens
    materials: {
      iron: 0, silicon: 0, titanium: 0, platinum: 0, rare_earth: 0, quantum_core: 0
    },

    // Station
    currentSector: "alpha",
    unlockedSectors: ["alpha"],

    // Robots
    robots: [],
    nextRobotId: 1,

    // Asteroids
    asteroids: [],

    // Upgrades
    stationLevel: 1,
    energyCapacity: 100,
    energyRegen: 1,

    // Statistics
    totalMined: 0,
    totalRobots: 0,
    totalCredits: 500,
    totalMleo: 0,

    // Timers
    lastSave: Date.now(),
    lastUpdate: Date.now(),
    lastMerge: 0,

    // Settings
    muted: false,
    showTutorial: true,
    
    // Robot Upgrades
    robotUpgrades: {
      speed: 0,
      efficiency: 0,
      range: 0,
      autoMerge: 0
    }
  };
}

// ===== WAL (write-ahead log) for claim to wallet =====
const WAL_LS_KEY = "mleoSpaceMining_v1_1__wal";
function walLoad(){ try{ return JSON.parse(localStorage.getItem(WAL_LS_KEY)||"null"); }catch{return null;} }
function walSave(obj){ try{ localStorage.setItem(WAL_LS_KEY, JSON.stringify(obj)); }catch{} }
function walSetPending(amount){ walSave({ amount: Number(amount||0), createdAt: Date.now(), txHash: null }); }
function walAttachTx(hash){ const w = walLoad(); if(!w) return; w.txHash = hash; walSave(w); }
function walClear(){ try{ localStorage.removeItem(WAL_LS_KEY); }catch{} }
function walIsPending(){ const w = walLoad(); return !!(w && (w.amount > 0)); }

// --- iOS 100vh fix ---
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

// ====== Game Configuration ======
const STATION_WIDTH = 800;
const STATION_HEIGHT = 600;
const ASTEROID_COUNT = 6;
const MAX_ROBOTS = 8;

// MLEO Token Configuration
const MLEO_BASE_PER_LEVEL = 3; // Base MLEO tokens per asteroid level
const MLEO_LEVELS = {
  iron: 1,        // 3 MLEO
  silicon: 2,     // 6 MLEO  
  titanium: 3,    // 9 MLEO
  platinum: 4,    // 12 MLEO
  rare_earth: 5,  // 15 MLEO
  quantum_core: 6 // 18 MLEO
};

// Space Sectors
const SPACE_SECTORS = [
  {
    id: "alpha",
    name: "Alpha Sector",
    color: "#1a1a2e",
    difficulty: 1,
    reward: 1,
    asteroidTypes: ["iron", "silicon"],
    unlockCost: 0
  },
  {
    id: "beta",
    name: "Beta Sector", 
    color: "#16213e",
    difficulty: 1.5,
    reward: 2,
    asteroidTypes: ["iron", "silicon", "titanium"],
    unlockCost: 1000
  },
  {
    id: "gamma",
    name: "Gamma Sector",
    color: "#0f3460",
    difficulty: 2,
    reward: 3,
    asteroidTypes: ["titanium", "platinum", "rare_earth"],
    unlockCost: 5000
  },
  {
    id: "omega",
    name: "Omega Sector",
    color: "#533483",
    difficulty: 3,
    reward: 5,
    asteroidTypes: ["platinum", "rare_earth", "quantum_core"],
    unlockCost: 20000
  }
];

// Robot Types
const ROBOT_TYPES = {
  basic: { name: "Mining Bot", color: "#00ff88", efficiency: 1, speed: 1, cost: 100, description: "Basic mining robot" },
  advanced: { name: "Quantum Bot", color: "#0088ff", efficiency: 2, speed: 1.5, cost: 500, description: "Advanced quantum mining bot" },
  elite: { name: "Nebula Bot", color: "#ff0088", efficiency: 3, speed: 2, cost: 2000, description: "Elite nebula mining bot" },
  legendary: { name: "Cosmic Bot", color: "#ffaa00", efficiency: 5, speed: 3, cost: 10000, description: "Legendary cosmic mining bot" }
};

// Asteroid Types
const ASTEROID_TYPES = {
  iron: { color: "#8B4513", value: 10, hardness: 1 },
  silicon: { color: "#C0C0C0", value: 25, hardness: 1.5 },
  titanium: { color: "#708090", value: 50, hardness: 2 },
  platinum: { color: "#E5E4E2", value: 100, hardness: 2.5 },
  rare_earth: { color: "#32CD32", value: 250, hardness: 3 },
  quantum_core: { color: "#FF1493", value: 1000, hardness: 4 }
};

// Image Assets
const IMAGES = {
  // Space Backgrounds
  spaceBg: {
    alpha: "/images/space/space-bg-alpha.png",
    beta: "/images/space/space-bg-beta.png",
    gamma: "/images/space/space-bg-gamma.png",
    omega: "/images/space/space-bg-omega.png"
  },
  // Robots
  robots: {
    basic: "/images/space/robot-basic.png",
    advanced: "/images/space/robot-quantum.png",
    elite: "/images/space/robot-nebula.png",
    legendary: "/images/space/robot-cosmic.png"
  },
  // Asteroids
  asteroids: {
    iron: "/images/space/asteroid-iron.png",
    silicon: "/images/space/asteroid-silicon.png",
    titanium: "/images/space/asteroid-titanium.png",
    platinum: "/images/space/asteroid-platinum.png",
    rare_earth: "/images/space/asteroid-rare-earth.png",
    quantum_core: "/images/space/asteroid-quantum-core.png"
  },
  // Effects
  effects: {
    sparkle: "/images/space/particle-sparkle.png",
    explosion: "/images/space/explosion.png"
  }
};

// Terms Configuration
const TERMS_VERSION = "v1.1";
const TERMS_KEY = `mleoSpaceMining_termsAccepted_${TERMS_VERSION}`;

// ===== Image Loading System =====
const IMAGE_CACHE = {};
function loadImage(src) {
  if (IMAGE_CACHE[src]) return IMAGE_CACHE[src];
  const img = new Image();
  img.src = src;
  IMAGE_CACHE[src] = img;
  return img;
}
function preloadImages() {
  Object.values(IMAGES.spaceBg).forEach(src => loadImage(src));
  Object.values(IMAGES.robots).forEach(src => loadImage(src));
  Object.values(IMAGES.asteroids).forEach(src => loadImage(src));
  Object.values(IMAGES.effects).forEach(src => loadImage(src));
}

// ===== Main Game Component =====
export default function MleoSpaceMining() {
  useIOSViewportFix();
  const router = useRouter();
  
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef(null);
  const flagsRef = useRef({ paused: false });
  
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { disconnect } = useDisconnect();

  const [ui, setUi] = useState({
    credits: 500, energy: 100, mleo: 0, currentSector: "alpha", stationLevel: 1
  });

  const [mounted, setMounted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showSectors, setShowSectors] = useState(false);
  const [selectedRobot, setSelectedRobot] = useState("basic");
  const [showMleoCollection, setShowMleoCollection] = useState(false);
  
  // Settings state
  const [menuOpen, setMenuOpen] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  
  // Space MLEO state
  const [spaceMleo, setSpaceMleo] = useState({ vault: 0, claimedToWallet: 0, history: [] });
  const [centerPopup, setCenterPopup] = useState(null);
  const [giftToast, setGiftToast] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftType, setGiftType] = useState(null);
  const [giftAmount, setGiftAmount] = useState(0);
  const [giftTimer, setGiftTimer] = useState(30);
  const [lastGiftTime, setLastGiftTime] = useState(null);
  
  // Asteroid destruction popup
  const [asteroidPopup, setAsteroidPopup] = useState(null);
  
  // Upgrades panel visibility
  const [showUpgrades, setShowUpgrades] = useState(true);
  
  // Particle effects
  const [particles, setParticles] = useState([]);

  // Play upgrade sound effect
  function playUpgradeSound() {
    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Audio not available');
    }
  }

  // Create particle effects
  function createUpgradeParticles(x, y) {
    const newParticles = [];
    for (let i = 0; i < 10; i++) {
      newParticles.push({
        id: Math.random(),
        x: x + (Math.random() - 0.5) * 50,
        y: y + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        color: `hsl(${Math.random() * 60 + 180}, 100%, 50%)` // Blue-green colors
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
    
    // Remove particles after animation
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.includes(p)));
    }, 2000);
  }

  // Double-click guard
  function useOneShot(delay=1200){
    const busyRef = useRef(false);
    return async (fn) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try { await fn(); } finally { setTimeout(()=>{ busyRef.current=false; }, delay); }
    };
  }
  const runOnceVault = useOneShot();
  const runOnceWallet = useOneShot();

  // Load space MLEO state
  useEffect(() => {
    if (!mounted) return;
    try { setSpaceMleo(loadSpaceMleoState()); } catch {}
    const id = setInterval(() => { try { setSpaceMleo(loadSpaceMleoState()); } catch {} }, 1000);
    return () => clearInterval(id);
  }, [mounted]);

  // Load gift timer state
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('spaceGiftTimer');
      if (saved) {
        const data = JSON.parse(saved);
        const now = Date.now();
        const timeSinceLastGift = now - data.lastGiftTime;
        const remainingTime = Math.max(0, 30000 - timeSinceLastGift);
        const remainingSeconds = Math.ceil(remainingTime / 1000);
        setGiftTimer(remainingSeconds);
        setLastGiftTime(data.lastGiftTime);
      } else {
        const now = Date.now();
        setLastGiftTime(now);
        localStorage.setItem('spaceGiftTimer', JSON.stringify({ lastGiftTime: now }));
        setGiftTimer(30);
      }
    } catch {
      const now = Date.now();
      setLastGiftTime(now);
      localStorage.setItem('spaceGiftTimer', JSON.stringify({ lastGiftTime: now }));
      setGiftTimer(30);
    }
  }, [mounted]);

  // Center popup auto-hide
  useEffect(() => {
    if (!centerPopup) return;
    const id = setTimeout(() => setCenterPopup(null), 1800);
    return () => clearTimeout(id);
  }, [centerPopup]);

  // Asteroid popup auto-hide
  useEffect(() => {
    if (!asteroidPopup) return;
    const id = setTimeout(() => setAsteroidPopup(null), 2000);
    return () => clearTimeout(id);
  }, [asteroidPopup]);

  // Update particles
  useEffect(() => {
    if (particles.length === 0) return;
    
    const interval = setInterval(() => {
      setParticles(prev => prev.map(particle => ({
        ...particle,
        x: particle.x + particle.vx,
        y: particle.y + particle.vy,
        life: particle.life - 0.02
      })).filter(particle => particle.life > 0));
    }, 16); // 60 FPS
    
    return () => clearInterval(interval);
  }, [particles.length]);

  // Online/Offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // Auto-offline after 1 minute of inactivity
  useEffect(() => {
    if (!mounted) return;
    let inactivityTimer;
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => { setIsOnline(false); }, 60000);
    };
    const events = ['mousedown','mousemove','keypress','scroll','touchstart','click'];
    events.forEach(evt => document.addEventListener(evt, resetInactivityTimer, true));
    resetInactivityTimer();
    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(evt => document.removeEventListener(evt, resetInactivityTimer, true));
    };
  }, [mounted]);

  // Gift timer - countdown every second
  useEffect(() => {
    if (!mounted || !lastGiftTime) return;
    const timerInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastGift = now - lastGiftTime;
      const remainingTime = Math.max(0, 30000 - timeSinceLastGift);
      const remainingSeconds = Math.ceil(remainingTime / 1000);
      setGiftTimer(remainingSeconds);
      if (remainingTime <= 0) {
        const newTime = Date.now();
        setLastGiftTime(newTime);
        localStorage.setItem('spaceGiftTimer', JSON.stringify({ lastGiftTime: newTime }));
        setGiftTimer(30);
      }
    }, 1000);
    return () => clearInterval(timerInterval);
  }, [mounted, lastGiftTime]);

  // Gift system - every 30 seconds
  useEffect(() => {
    if (!mounted || !lastGiftTime) return;
    const giftInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastGift = now - lastGiftTime;
      if (timeSinceLastGift >= 30000) {
        const random = Math.random();
        if (random < 0.8) {
          const creditsAmount = Math.floor(Math.random() * 200) + 50;
          setGiftType('credits'); setGiftAmount(creditsAmount); setShowGiftModal(true);
        } else {
          setGiftType('robot'); setGiftAmount(1); setShowGiftModal(true);
        }
        setLastGiftTime(now);
        localStorage.setItem('spaceGiftTimer', JSON.stringify({ lastGiftTime: now }));
      }
    }, 1000);
    return () => clearInterval(giftInterval);
  }, [mounted, lastGiftTime]);

  // Reconcile WAL on mount/focus (finishes pending claim after refresh)
  useEffect(() => {
    const pending = walLoad();
    if (!pending || !pending.txHash) return;
    let alive = true;
    async function recon() {
      try {
        const rcpt = await publicClient.waitForTransactionReceipt({ hash: pending.txHash });
        if (!alive) return;
        if (rcpt?.status === 'success') {
          const after = loadSpaceMleoState();
          const delta = Number(pending.amount || 0);
          after.vault = Math.max(0, Number(((after.vault || 0) - delta).toFixed(2)));
          after.claimedToWallet = Number(((after.claimedToWallet || 0) + delta).toFixed(2));
          after.history = Array.isArray(after.history) ? after.history : [];
          after.history.unshift({ t: Date.now(), kind: "claim_wallet", amount: delta, tx: String(pending.txHash) });
          saveSpaceMleoState(after);
          setSpaceMleo(after);
          walClear();
          setCenterPopup?.({ text: "✅ Claim confirmed on-chain", id: Math.random() });
        }
      } catch { /* still pending / RPC issue — try again next focus */ }
    }
    recon();
    const onF = () => recon();
    window.addEventListener('focus', onF);
    return () => { alive = false; window.removeEventListener('focus', onF); };
  }, [publicClient]);

  // Periodic autosave for long sessions
  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => { if (stateRef.current) saveGameState(stateRef.current); }, 10000);
    return () => clearInterval(id);
  }, [mounted]);

  // Save on unload/pagehide (mobile-safe)
  useEffect(() => {
    const onSave = () => stateRef.current && saveGameState(stateRef.current, {force:true});
    window.addEventListener("beforeunload", onSave);
    window.addEventListener("pagehide", onSave);
    return () => { window.removeEventListener("beforeunload", onSave); window.removeEventListener("pagehide", onSave); };
  }, []);

  // Handle window resize for mobile landscape
  useEffect(() => {
    const handleResize = () => {
      // Force canvas redraw on resize
      if (canvasRef.current) {
        draw();
      }
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      // Delay to allow viewport to settle
      setTimeout(handleResize, 100);
    });
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Initialize game state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const state = loadGameState();
    stateRef.current = state;
    
    // Debug
    console.log("Loaded game state:", {
      robots: state.robots?.length || 0,
      asteroids: state.asteroids?.length || 0,
      credits: state.credits
    });
    
    // Initial asteroids
    if (!state.asteroids || state.asteroids.length === 0) {
      for (let i = 0; i < ASTEROID_COUNT; i++) {
        state.asteroids.push(generateAsteroid(state.currentSector));
      }
    }
    
    setUi({
      credits: state.credits,
      energy: state.energy,
      mleo: state.mleo,
      currentSector: state.currentSector,
      stationLevel: state.stationLevel
    });
    
    preloadImages();
    setMounted(true);
    
    // Terms
    const termsAccepted = localStorage.getItem(TERMS_KEY);
    if (!termsAccepted) setShowTerms(true);
  }, []);

  // Game loop (mobile-safe): clamp dt + pause on hidden + FPS limit
  useEffect(() => {
    if (!mounted) return;
    let lastTime = 0;
    let running = true;
    const TARGET_FPS = 60;
    const FRAME_TIME = 1000 / TARGET_FPS;
      
    const loop = (currentTime) => {
      if (!running || !stateRef.current) return;
      if (!lastTime) lastTime = currentTime;
      
      // Limit FPS to 60 and clamp delta time
      const deltaTime = Math.min(currentTime - lastTime, FRAME_TIME);
      lastTime = currentTime;
      
      // Only tick if not paused
      if (!flagsRef.current.paused) {
        tick(deltaTime);
      }
      
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    const onVis = () => {
      if (document.hidden) {
        running = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } else {
        running = true;
        lastTime = 0; // reset delta
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    document.addEventListener("visibilitychange", onVis);
    rafRef.current = requestAnimationFrame(loop);
    
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mounted]);

  // Robot merging function - OPTIMIZED VERSION
  function checkRobotMerging(state) {
    if (!state.robots || state.robots.length < 2) return;
    
    // Group robots by level
    const robotsByLevel = {};
    state.robots.forEach(robot => {
      if (!robotsByLevel[robot.level]) robotsByLevel[robot.level] = [];
      robotsByLevel[robot.level].push(robot);
    });
    
    Object.keys(robotsByLevel).forEach(level => {
      const robots = robotsByLevel[level];
      if (robots.length >= 2) {
        let closestDistance = Infinity, robot1 = null, robot2 = null;
        for (let i = 0; i < robots.length - 1; i++) {
          for (let j = i + 1; j < robots.length; j++) {
            const d = calculateDistance(robots[i].x, robots[i].y, robots[j].x, robots[j].y);
            if (d < closestDistance) { closestDistance = d; robot1 = robots[i]; robot2 = robots[j]; }
          }
        }
        if (robot1 && robot2 && closestDistance < 100) { // Only merge if close enough
          // Additional validation
          if (robot1.id === robot2.id) {
            console.warn("Attempting to merge robot with itself!");
            return;
          }
          
          // Check if robots still exist in state
          const robot1Exists = state.robots.find(r => r.id === robot1.id);
          const robot2Exists = state.robots.find(r => r.id === robot2.id);
          
          if (!robot1Exists || !robot2Exists) {
            console.warn("Robot disappeared before merge!");
            return;
          }
          
          // Move robots towards each other
          const dx = robot2.x - robot1.x;
          const dy = robot2.y - robot1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0) {
            const moveSpeed = 3; // Slightly faster movement
            const moveX = (dx / distance) * moveSpeed;
            const moveY = (dy / distance) * moveSpeed;
            
            robot1.x += moveX; 
            robot1.y += moveY;
            robot2.x -= moveX; 
            robot2.y -= moveY;
            
            // Check if close enough to merge
            const newDistance = calculateDistance(robot1.x, robot1.y, robot2.x, robot2.y);
            if (newDistance <= 30) { 
              mergeRobots(state, robot1, robot2); 
              return; 
            }
          }
        }
      }
    });
  }
  
  // Merge two robots into one upgraded robot - OPTIMIZED VERSION
  function mergeRobots(state, robot1, robot2) {
    // Validate robots exist and are different
    if (!robot1 || !robot2 || robot1.id === robot2.id) {
      console.warn("Invalid robots for merging:", robot1?.id, robot2?.id);
      return;
    }
    
    // Find robot indices safely
    const index1 = state.robots.findIndex(r => r.id === robot1.id);
    const index2 = state.robots.findIndex(r => r.id === robot2.id);
    
    if (index1 === -1 || index2 === -1) {
      console.warn("Robot not found for merging:", robot1.id, robot2.id);
      return;
    }
    
    // Remove robots safely (from highest index to lowest)
    const indices = [index1, index2].sort((a, b) => b - a);
    indices.forEach(index => {
      if (index >= 0 && index < state.robots.length) {
        state.robots.splice(index, 1);
      }
    });
    
    // Create new merged robot
    const newRobot = {
      id: state.nextRobotId++,
      type: robot1.type, // Keep the same type
      level: robot1.level + 1, // Increase level
      x: (robot1.x + robot2.x) / 2, // Average position
      y: (robot1.y + robot2.y) / 2,
      targetAsteroid: null,
      efficiency: Math.min(robot1.efficiency * 1.1, 5), // 10% increase, max 5
      speed: Math.max(robot1.speed, robot2.speed) // Take the faster speed
    };
    
    state.robots.push(newRobot);
    
    console.log(`✅ Merged robots: ${robot1.id} + ${robot2.id} = ${newRobot.id} (Level ${newRobot.level})`);
    
    // Show merge notification
    setCenterPopup?.({ 
      text: `🤖 Robot Level ${newRobot.level}! Efficiency +10%`, 
      id: Math.random() 
    });
    
    // Save the state
    saveGameState(state);
  }

  // Debug function for robot tracking
  function debugRobots(state) {
    console.log(`🔍 Debug: ${state.robots.length} robots active`);
    state.robots.forEach((robot, i) => {
      console.log(`Robot ${i}: ID=${robot.id}, Level=${robot.level}, Pos=(${robot.x.toFixed(1)}, ${robot.y.toFixed(1)}), Target=${robot.targetAsteroid}`);
    });
  }
  
  // Performance monitoring
  let debugCounter = 0;
  const DEBUG_INTERVAL = 300; // Debug every 5 seconds at 60fps

  // Game tick function - PERFORMANCE OPTIMIZED
  function tick(dt) {
    const state = stateRef.current;
    if (!state || flagsRef.current.paused) return;
    
    const now = Date.now();
    
    // Debug every 5 seconds
    debugCounter++;
    if (debugCounter >= DEBUG_INTERVAL) {
      debugRobots(state);
      debugCounter = 0;
    }
    
    // Validate robot array integrity
    if (!Array.isArray(state.robots)) {
      console.error("Robots array is corrupted!");
      state.robots = [];
      return;
    }
    
    // Auto-merge robots (with cooldown to prevent stuttering)
    if (now - (state.lastMerge || 0) > 1000) { // 1 second cooldown
      checkRobotMerging(state);
      state.lastMerge = now;
    }
    
    // Apply robot upgrades
    applyRobotUpgrades(state);
    
    // Update robots - OPTIMIZED VERSION
    state.robots.forEach((robot, index) => {
      // Validate robot exists
      if (!robot || !robot.id) {
        console.warn("Invalid robot at index:", index);
        return;
      }
      
      if (robot.targetAsteroid) {
        const asteroid = state.asteroids.find(a => a.id === robot.targetAsteroid);
        if (asteroid && asteroid.hp > 0) {
          const dx = asteroid.x - robot.x;
          const dy = asteroid.y - robot.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 10) { // Increased distance for better performance
            const speed = (robot.speed * 50 * (dt / 1000)) || 1; // Prevent NaN
            robot.x += (dx / distance) * speed;
            robot.y += (dy / distance) * speed;
          } else {
            const damage = (robot.efficiency * (dt / 1000) * 10) || 0.1; // Prevent NaN
            asteroid.hp -= damage;
            
            if (asteroid.hp <= 0) {
              const asteroidIndex = state.asteroids.findIndex(a => a.id === asteroid.id);
              if (asteroidIndex !== -1) {
                const rewards = destroyAsteroid(state, asteroid, setAsteroidPopup);
                state.asteroids[asteroidIndex] = generateAsteroid(state.currentSector);
                setUi(prev => ({ ...prev, credits: state.credits, mleo: state.mleo }));
              }
            }
          }
        } else {
          robot.targetAsteroid = null;
        }
      } else {
        // Find new target - OPTIMIZED
        let nearestAsteroid = null, nearestDistance = Infinity;
        
        for (const asteroid of state.asteroids) {
          if (asteroid && asteroid.hp > 0) {
            const d = calculateDistance(robot.x, robot.y, asteroid.x, asteroid.y);
            if (d < nearestDistance && d < 300) { // Limit search range
              nearestDistance = d; 
              nearestAsteroid = asteroid;
            }
          }
        }
        
        if (nearestAsteroid) robot.targetAsteroid = nearestAsteroid.id;
      }
    });

    // periodic autosave (backup)
    if (now - state.lastSave > 30000) { saveGameState(state); state.lastSave = now; }
  }

  // Drawing function
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    
    const w = rect.width;
    const h = rect.height;
    
    // Clear canvas
    ctx.fillStyle = "#000011";
    ctx.fillRect(0, 0, w, h);
    
    // Draw space background (full screen)
    drawSpaceBackground(ctx, w, h);
    
    // Draw game elements (offset to avoid header - mobile responsive)
    let headerHeight = 80;
    if (window.innerWidth < 768) {
      if (window.innerHeight < 500) {
        headerHeight = 28; // Landscape: 28px
      } else {
        headerHeight = 48; // Portrait: 48px
      }
    }
    drawAsteroids(ctx, w, h - headerHeight);
    drawRobots(ctx, w, h - headerHeight);
    drawUI(ctx, w, h);
  }

  function drawSpaceBackground(ctx, w, h) {
    const state = stateRef.current; if (!state) return;
    const sector = SPACE_SECTORS.find(s => s.id === state.currentSector);
    const bgImageSrc = IMAGES.spaceBg[sector.id];
    const bgImage = loadImage(bgImageSrc);
    if (bgImage.complete && bgImage.naturalWidth > 0) {
      ctx.drawImage(bgImage, 0, 0, w, h);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, sector.color);
      gradient.addColorStop(1, "#000000");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 100; i++) {
        const x = (i * 137.5) % w;
        const y = (i * 73.2) % h;
        const size = Math.random() * 2;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawAsteroids(ctx, w, h) {
    const state = stateRef.current; if (!state) return;
    let offsetY = 80;
    if (window.innerWidth < 768) {
      if (window.innerHeight < 500) {
        offsetY = 28; // Landscape: 28px
      } else {
        offsetY = 48; // Portrait: 48px
      }
    }
    
    state.asteroids.forEach(asteroid => {
      if (asteroid.hp <= 0) return;
      
      const asteroidImage = loadImage(IMAGES.asteroids[asteroid.type]);
      const hpPercent = asteroid.hp / asteroid.maxHp;
      const currentSize = asteroid.size * (0.3 + 0.7 * hpPercent);
      
      if (asteroidImage.complete && asteroidImage.naturalWidth > 0) {
        const size = currentSize * 2;
        ctx.drawImage(asteroidImage, asteroid.x - size/2, asteroid.y - size/2 + offsetY, size, size);
      } else {
        ctx.fillStyle = asteroid.color;
        ctx.beginPath(); ctx.arc(asteroid.x, asteroid.y + offsetY, currentSize, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
      }

      const barWidth = currentSize * 1.2, barHeight = 6, barY = asteroid.y + offsetY + currentSize - 12;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(asteroid.x - barWidth/2, barY, barWidth, barHeight);
      ctx.fillStyle = hpPercent > 0.5 ? "#00ff00" : hpPercent > 0.25 ? "#ffff00" : "#ff0000";
      ctx.fillRect(asteroid.x - barWidth/2, barY, barWidth * hpPercent, barHeight);
    });
  }

  function drawRobots(ctx, w, h) {
    const state = stateRef.current; if (!state) return;
    let offsetY = 80;
    if (window.innerWidth < 768) {
      if (window.innerHeight < 500) {
        offsetY = 28; // Landscape: 28px
      } else {
        offsetY = 48; // Portrait: 48px
      }
    }
    state.robots.forEach(robot => {
      const robotImage = loadImage(IMAGES.robots[robot.type]);
      if (robotImage.complete && robotImage.naturalWidth > 0) {
        const size = 40;
        ctx.drawImage(robotImage, robot.x - size/2, robot.y - size/2 + offsetY, size, size);
      } else {
        const robotType = ROBOT_TYPES[robot.type];
        ctx.fillStyle = robotType.color;
        ctx.beginPath(); ctx.arc(robot.x, robot.y + offsetY, 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
      }
      const levelText = robot.level.toString();
      ctx.font = "bold 10px Arial"; ctx.textAlign = "center";
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.strokeText(levelText, robot.x, robot.y + 25 + offsetY);
      ctx.fillStyle = "#fff"; ctx.fillText(levelText, robot.x, robot.y + 25 + offsetY);
    });
  }

  function drawUI(ctx, w, h) {
    const state = stateRef.current;
    if (!state) return;
    // All UI elements moved to HTML header
  }

  // ===== MLEO core actions =====
  function setGiftToastWithTTL(text, ttl = 3000) {
    const id = Math.random().toString(36).slice(2);
    setGiftToast?.({ text, id });
    setTimeout(() => { setGiftToast?.(cur => (cur && cur.id === id ? null : cur)); }, ttl);
  }

  function claimGift() {
    if (giftType === 'credits') {
      if (stateRef.current) {
        stateRef.current.credits += giftAmount;
        setCenterPopup?.({ text: `🎁 +${giftAmount} Credits!`, id: Math.random() });
        saveGameState(stateRef.current);
      }
    } else if (giftType === 'robot') {
      if (stateRef.current && stateRef.current.robots.length < MAX_ROBOTS) {
        const newRobot = {
          id: stateRef.current.nextRobotId++,
          x: Math.random() * (STATION_WIDTH - 40) + 20,
          y: Math.random() * (STATION_HEIGHT - 40) + 20,
          type: "basic",
          level: 1,
          targetAsteroid: null,
          efficiency: 1,
          speed: 1
        };
        stateRef.current.robots.push(newRobot);
        setCenterPopup?.({ text: `🎁 +1 Robot!`, id: Math.random() });
        saveGameState(stateRef.current);
      } else {
        setGiftToastWithTTL("No space for robot!");
      }
    }
    setIsOnline(true);
    setShowGiftModal(false);
    setGiftType(null);
    setGiftAmount(0);
  }

  function addRobot() {
    const state = stateRef.current; if (!state) return;
    const robotType = ROBOT_TYPES[selectedRobot];
    if (state.credits < robotType.cost) return;
    if (state.robots.length >= MAX_ROBOTS) return;
    
    // Mobile responsive margins
    let margin = 80, topMargin = 100, bottomMargin = 120;
    if (window.innerWidth < 768) {
      margin = 20;
      if (window.innerHeight < 500) {
        topMargin = 40; // Landscape
        bottomMargin = 60;
      } else {
        topMargin = 60; // Portrait
        bottomMargin = 80;
      }
    }
    
    const robot = {
      id: state.nextRobotId++,
      type: selectedRobot,
      level: 1,
      x: Math.random() * (STATION_WIDTH - margin * 2) + margin,
      y: Math.random() * (STATION_HEIGHT - topMargin - bottomMargin) + topMargin,
      targetAsteroid: null,
      efficiency: robotType.efficiency,
      speed: robotType.speed
    };
    state.robots.push(robot);
    state.credits -= robotType.cost;
    state.totalRobots++;
    setUi(prev => ({ ...prev, credits: state.credits }));
    saveGameState(state);
  }

  function switchSector(sectorId) {
    const state = stateRef.current; if (!state) return;
    const sector = SPACE_SECTORS.find(s => s.id === sectorId);
    if (!sector) return;
    if (sector.unlockCost > 0 && state.credits < sector.unlockCost) return;
    
    state.currentSector = sectorId;
    state.credits -= sector.unlockCost;
    
    state.asteroids = [];
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      state.asteroids.push(generateAsteroid(sectorId));
    }
    setUi(prev => ({ ...prev, currentSector: sectorId, credits: state.credits }));
    saveGameState(state);
  }

  function copyAddressToClipboard(){
    if (!address) return;
    try { navigator.clipboard.writeText(address); setCopiedAddr(true); setTimeout(()=>setCopiedAddr(false), 1500); } catch {}
  }

  // ===== CLAIM FLOWS =====
  function claimGameMleoToVault() {
    const gameMleoAmount = Number(((stateRef.current?.mleo || 0)).toFixed(2));
    if (!gameMleoAmount) { setGiftToastWithTTL("No MLEO to claim from game"); return; }
    const st = loadSpaceMleoState();
    st.vault = Math.max(0, Number(((st.vault || 0) + gameMleoAmount).toFixed(2)));
    st.history = Array.isArray(st.history) ? st.history : [];
    st.history.unshift({ t: Date.now(), kind: "claim_to_vault", amount: gameMleoAmount, tx: "space_mining_game" });
    saveSpaceMleoState(st);
    setSpaceMleo(st);
    if (stateRef.current){
      stateRef.current.mleo = 0;
      stateRef.current.totalMleo = Math.max(0, Number((stateRef.current.totalMleo - gameMleoAmount).toFixed(2)));
      saveGameState(stateRef.current);
    }
    setCenterPopup?.({ text: `✅ Moved ${formatMleoShort(gameMleoAmount)} MLEO to vault`, id: Math.random() });
  }

  async function claimSpaceMleoToWallet() {
    const st = loadSpaceMleoState();
    const vaultNow = Number((st?.vault || 0).toFixed(2));
    if (!vaultNow) { setGiftToastWithTTL("Vault is empty"); return; }

    if (!isConnected) { openConnectModal?.(); return; }

    if (chainId !== CLAIM_CHAIN_ID) {
      try { await switchChain?.({ chainId: CLAIM_CHAIN_ID }); }
      catch { setGiftToastWithTTL("Switch to BSC Testnet (TBNB)"); return; }
    }
    if (!isValidAddress(CLAIM_ADDRESS)) {
      setGiftToastWithTTL("Missing/invalid CLAIM address (NEXT_PUBLIC_MLEO_CLAIM_ADDRESS)");
      return;
    }

    if (walIsPending()) { setGiftToastWithTTL("Claim already in progress…"); return; }
    walSetPending(vaultNow);

    try {
      const amountWei = parseUnits(vaultNow.toString(), MLEO_DECIMALS);
      const hash = await writeContractAsync({
        address: CLAIM_ADDRESS,
        abi: MINING_CLAIM_ABI,
        functionName: "claim",
        args: [BigInt(GAME_ID), amountWei],
        chainId: CLAIM_CHAIN_ID,
        account: address,
      });

      walAttachTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });

      const after = loadSpaceMleoState();
      const delta = Number(vaultNow);
      after.vault = Math.max(0, Number(((after.vault || 0) - delta).toFixed(2)));
      after.claimedToWallet = Number(((after.claimedToWallet || 0) + delta).toFixed(2));
      after.history = Array.isArray(after.history) ? after.history : [];
      after.history.unshift({ t: Date.now(), kind: "claim_wallet", amount: delta, tx: String(hash) });
      saveSpaceMleoState(after);
      setSpaceMleo(after);

      walClear();
      setCenterPopup?.({ text: `✅ Sent ${formatMleoShort(delta)} MLEO to wallet`, id: Math.random() });
    } catch (err) {
      console.error(err);
      walClear(); // clear lock on failure/reject
      setGiftToastWithTTL("Claim failed or rejected");
    }
  }

  // ===== Utility Functions =====
  function generateAsteroid(sector) {
    const sectorData = SPACE_SECTORS.find(s => s.id === sector);
    const asteroidType = sectorData.asteroidTypes[Math.floor(Math.random() * sectorData.asteroidTypes.length)];
    const typeData = ASTEROID_TYPES[asteroidType];
    // Mobile responsive margins
    let margin = 80, topMargin = 100, bottomMargin = 120;
    if (window.innerWidth < 768) {
      margin = 20;
      if (window.innerHeight < 500) {
        topMargin = 40; // Landscape
        bottomMargin = 60;
      } else {
        topMargin = 60; // Portrait
        bottomMargin = 80;
      }
    }
    
    return {
      id: Date.now() + Math.random(),
      x: Math.random() * (STATION_WIDTH - margin * 2) + margin,
      y: Math.random() * (STATION_HEIGHT - topMargin - bottomMargin) + topMargin,
      type: asteroidType,
      size: 30 + Math.random() * 40,
      hp: typeData.hardness * 100,
      maxHp: typeData.hardness * 100,
      value: typeData.value,
      color: typeData.color
    };
  }
  function calculateDistance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2); }

  // ===== RENDER =====
  if (!mounted) {
    return <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="text-2xl">Loading Space Station...</div>
    </div>;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-black text-white overflow-hidden">
        {/* Mobile-specific styles */}
        <style jsx>{`
          /* Global mobile optimizations */
          * {
            box-sizing: border-box;
          }
          
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          
          @media (max-width: 768px) {
            html, body {
              position: fixed;
              width: 100vw;
              height: 100vh;
              height: calc(var(--app-100vh, 100vh));
              touch-action: manipulation;
              -webkit-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
              -webkit-overflow-scrolling: touch;
            }
            
            /* Prevent zoom on input focus */
            input, select, textarea {
              font-size: 16px;
            }
            
            /* Smooth scrolling for modals */
            .modal-content {
              -webkit-overflow-scrolling: touch;
            }
            
            /* Game container mobile */
            .game-container {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              height: calc(var(--app-100vh, 100vh));
            }
            
            /* Canvas mobile */
            .canvas-wrapper {
              position: absolute;
              top: 0;
              left: 0;
              width: 100% !important;
              height: 100% !important;
            }
          }
          
          /* Portrait mobile fixes */
          @media (max-width: 768px) and (orientation: portrait) {
            .mobile-header {
              height: 48px !important;
              padding: 6px 12px !important;
            }
            
            .canvas-wrapper {
              height: calc(100vh - 48px) !important;
              height: calc(var(--app-100vh, 100vh) - 48px) !important;
              top: 48px !important;
            }
            
            /* UI buttons for portrait */
            .mobile-ui-buttons {
              bottom: 8px !important;
              right: 8px !important;
              gap: 6px !important;
            }
            
            .mobile-ui-buttons button {
              padding: 8px 12px !important;
              font-size: 12px !important;
            }
          }
          
          /* Landscape mobile fixes */
          @media (max-height: 500px) and (orientation: landscape) {
            .mobile-header {
              height: 28px !important;
              padding: 2px 6px !important;
            }
            
            .mobile-header .text-xs {
              font-size: 9px !important;
            }
            
            .mobile-header .font-bold {
              font-size: 10px !important;
            }
            
            .canvas-wrapper {
              height: calc(100vh - 28px) !important;
              height: calc(var(--app-100vh, 100vh) - 28px) !important;
              top: 28px !important;
            }
            
            /* UI buttons for landscape */
            .mobile-ui-buttons {
              bottom: 4px !important;
              right: 4px !important;
              gap: 3px !important;
            }
            
            .mobile-ui-buttons button {
              padding: 4px 6px !important;
              font-size: 10px !important;
              border-radius: 4px !important;
            }
            
            /* Fix modals for landscape */
            .modal-backdrop {
              padding: 4px !important;
            }
            
            .modal-content {
              max-height: calc(100vh - 8px) !important;
              max-height: calc(var(--app-100vh, 100vh) - 8px) !important;
              padding: 8px !important;
            }
            
            /* Fix upgrades panel for landscape */
            .upgrades-panel {
              max-height: calc(100vh - 32px) !important;
              max-height: calc(var(--app-100vh, 100vh) - 32px) !important;
              top: 32px !important;
              left: 4px !important;
              right: 4px !important;
              padding: 6px !important;
            }
          }
        `}</style>
        {/* Game Canvas */}
        <div className="relative w-full h-screen game-container">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair relative z-0 top-0 touch-none canvas-wrapper"
            onClick={(e) => { addRobot(); }}
            onTouchStart={(e) => { 
              e.preventDefault(); 
              const touch = e.touches[0];
              const rect = canvasRef.current.getBoundingClientRect();
              const x = touch.clientX - rect.left;
              const y = touch.clientY - rect.top;
              // Add robot at touch position
              addRobot();
            }}
            onTouchMove={(e) => {
              e.preventDefault();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
            }}
          />
          
          {/* Header - Mobile Responsive */}
          <div className="absolute top-0 left-0 w-full z-10">
            {/* Mobile Header (portrait) */}
            <div className="md:hidden bg-black/90 px-2 py-1 mobile-header">
              {/* Top Row */}
              <div className="flex justify-between items-center text-xs mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  <span className="font-bold text-yellow-400">{ui.credits}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="font-bold text-blue-400">{ui.energy}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-300">Sector:</span>
                  <span className="font-bold text-white">{SPACE_SECTORS.find(s => s.id === ui.currentSector)?.name || 'Unknown'}</span>
                </div>
              </div>
              
              {/* Bottom Row */}
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <span className={`font-bold text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-yellow-400">🎁 {giftTimer}s</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-white">
                    {stateRef.current?.robots?.length || 0}/{MAX_ROBOTS}
                  </span>
                </div>
                <button
                  onClick={() => setShowMleoCollection(true)}
                  className="bg-orange-600 hover:bg-orange-700 px-2 py-1 rounded text-xs font-bold"
                >
                  🪙 {stateRef.current?.mleo || 0}
                </button>
                <button
                  onClick={() => setMenuOpen(true)}
                  className="bg-gray-800 hover:bg-gray-700 w-6 h-6 rounded flex items-center justify-center"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Desktop Header (landscape) */}
            <div className="hidden md:flex items-center justify-between px-4 h-16">
              {/* Left side - Credits and Energy */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <span className="font-bold text-yellow-400 text-sm">Credits: {ui.credits}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                  <span className="font-bold text-blue-400 text-sm">Energy: {ui.energy}</span>
                </div>
              </div>

              {/* Center - Sector Info */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Sector:</span>
                <span className="font-bold text-white text-sm">{SPACE_SECTORS.find(s => s.id === ui.currentSector)?.name || 'Unknown'}</span>
              </div>

              {/* Right side - MLEO, Status, and Game Info */}
              <div className="flex items-center gap-4">
              {/* Online/Offline Status */}
              <div className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
                {isOnline ? (
                  <span className="font-bold text-green-400 text-xs">ONLINE</span>
                ) : (
                  <button onClick={() => setIsOnline(true)} className="font-bold text-red-400 hover:text-red-300 underline text-xs">
                    OFFLINE
                  </button>
                )}
              </div>
              
              {/* Gift Timer */}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                <span className="font-bold text-yellow-400 text-xs">🎁 {giftTimer}s</span>
              </div>
              
              {/* Robots Count */}
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-white text-xs">
                  Robots: {stateRef.current?.robots?.length || 0}/{MAX_ROBOTS}
                  {stateRef.current?.robots?.length > 0 && (
                    <span className="text-yellow-400 ml-1 text-xs">
                      (Max Level: {Math.max(...(stateRef.current.robots.map(r => r.level) || [1]))})
                    </span>
                  )}
                </span>
              </div>
              
              {/* Materials */}
              <div className="flex items-center gap-2 text-xs">
                {Object.entries(stateRef.current?.materials || {}).map(([material, amount]) => {
                  if (amount > 0) {
                    return (
                      <span key={material} className="font-bold text-white text-xs">
                        {material}: {amount}
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
              
              {/* MLEO Button */}
              <button
                onClick={() => setShowMleoCollection(true)}
                className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg font-bold text-sm"
              >
                🪙 MLEO: {stateRef.current?.mleo || 0}
              </button>
              
              {/* Menu Button */}
              <button
                onClick={() => setMenuOpen(true)}
                className="bg-gray-800 hover:bg-gray-700 w-10 h-10 rounded-lg flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
            </div>
          </div>
          
          {/* Robot Upgrades Panel - Mobile Responsive */}
          {showUpgrades && (
            <div className="absolute top-8 md:top-20 left-1 right-1 md:left-auto md:right-4 md:w-80 bg-black/90 text-white p-2 md:p-4 rounded-lg z-50 border-2 border-blue-500/50 max-h-[60vh] md:max-h-96 overflow-y-auto upgrades-panel">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-blue-300">⚡ Robot Upgrades</h3>
              <button
                onClick={() => {
                  const info = Object.entries(ROBOT_UPGRADES).map(([id, upgrade]) => {
                    const level = stateRef.current?.robotUpgrades?.[id] || 0;
                    const effect = Math.round((upgrade.effect(level) - 1) * 100);
                    return `${upgrade.name}: Level ${level} (${effect > 0 ? '+' : ''}${effect}%)`;
                  }).join('\n');
                  alert(`Upgrade Information:\n\n${info}`);
                }}
                className="w-6 h-6 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-xs font-bold"
                title="Upgrade Information"
              >
                ?
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Object.entries(ROBOT_UPGRADES).map(([id, upgrade]) => {
                const currentLevel = stateRef.current?.robotUpgrades?.[id] || 0;
                const cost = getUpgradeCost(id, currentLevel);
                const canAfford = stateRef.current?.credits >= cost;
                const maxed = currentLevel >= upgrade.maxLevel;
                const effectValue = Math.round((upgrade.effect(currentLevel) - 1) * 100);
                
                return (
                  <div key={id} className="bg-gray-800/80 p-3 rounded border border-gray-700 hover:border-blue-500/50 transition-all duration-200 hover:scale-105">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-semibold text-yellow-300">{upgrade.name}</div>
                      <div className="text-xs text-gray-400">
                        {currentLevel}/{upgrade.maxLevel}
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(currentLevel / upgrade.maxLevel) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-300 mb-2" title={`Next cost: ${getUpgradeCost(id, currentLevel + 1)} credits`}>
                      {upgrade.description}
                    </div>
                    {currentLevel > 0 && (
                      <div className="text-xs text-green-400 mb-2">
                        ✓ Current Effect: +{effectValue}%
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        if (purchaseUpgrade(stateRef.current, id)) {
                          saveGameState(stateRef.current);
                          setUi(prev => ({ ...prev, credits: stateRef.current.credits }));
                          setCenterPopup?.({ text: `⚡ Upgraded ${upgrade.name}!`, id: Math.random() });
                          createUpgradeParticles(e.clientX, e.clientY);
                          playUpgradeSound();
                        }
                      }}
                      disabled={!canAfford || maxed}
                      className={`w-full py-2 md:py-2 px-3 rounded text-xs md:text-sm font-bold transition-all touch-manipulation ${
                        canAfford && !maxed 
                          ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 hover:scale-105' 
                          : 'bg-gray-600 cursor-not-allowed opacity-50'
                      }`}
                    >
                      {maxed ? '✓ Maxed' : `Upgrade (${cost} 💰)`}
            </button>
                  </div>
                );
              })}
            </div>
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to reset all upgrades?")) {
                    stateRef.current.robotUpgrades = {
                      speed: 0,
                      efficiency: 0,
                      range: 0,
                      autoMerge: 0
                    };
                    saveGameState(stateRef.current);
                    setCenterPopup?.({ text: "🔄 Upgrades reset!", id: Math.random() });
                  }
                }}
                className="w-6 h-6 bg-orange-600 hover:bg-orange-700 rounded-full flex items-center justify-center text-xs font-bold"
                title="Reset Upgrades"
              >
                ↺
              </button>
              <button
                onClick={() => setShowUpgrades(false)}
                className="w-6 h-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-xs font-bold"
                title="Hide Upgrades Panel"
              >
                ×
              </button>
            </div>
          </div>
          )}

          {/* Particle Effects */}
          {particles.map(particle => (
            <div
              key={particle.id}
              className="absolute w-2 h-2 rounded-full pointer-events-none z-40"
              style={{
                left: particle.x,
                top: particle.y,
                backgroundColor: particle.color,
                opacity: particle.life,
                transform: `scale(${particle.life})`
              }}
            />
          ))}

          {/* UI Overlay - Mobile Responsive */}
          <div className="absolute bottom-1 right-1 md:bottom-4 md:right-4 flex flex-col gap-1 md:gap-2 z-20 mobile-ui-buttons">
            {/* Mobile: Horizontal buttons - Landscape optimized */}
            <div className="md:hidden flex gap-1">
              <button onClick={() => setShowShop(true)} className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs font-bold">
                🤖 Shop
              </button>
              {!showUpgrades && (
                <button onClick={() => setShowUpgrades(true)} className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs font-bold">
                  ⚡ Upgrades
                </button>
              )}
              <button onClick={() => setShowSectors(true)} className="bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded text-xs font-bold">
                🌌 Sectors
              </button>
            </div>
            
            {/* Desktop: Vertical buttons */}
            <div className="hidden md:flex flex-col gap-2">
              <button onClick={() => setShowShop(true)} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold">
                🤖 Shop
              </button>
              {!showUpgrades && (
                <button onClick={() => setShowUpgrades(true)} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold">
                  ⚡ Upgrades
                </button>
              )}
              <button onClick={() => setShowSectors(true)} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-bold">
                🌌 Sectors
              </button>
            </div>
          </div>
        </div>

        {/* MLEO Collection Modal - Mobile Responsive */}
        {showMleoCollection && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4 modal-backdrop">
            <div className="bg-gray-900 p-3 md:p-4 rounded-lg max-w-sm w-full border border-gray-700 max-h-[80vh] overflow-y-auto modal-content">
              <h2 className="text-lg md:text-xl font-bold mb-3 text-center text-orange-400">🪙 MLEO Collection</h2>
              
              <div className="space-y-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-400 mb-1">
                    {stateRef.current?.mleo || 0}
                  </div>
                  <div className="text-xs text-gray-400">MLEO Available</div>
                </div>
                
                <div className="bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-semibold mb-2 text-orange-400">Asteroid Rewards:</h3>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="flex justify-between"><span>Iron:</span><span className="text-orange-400">3</span></div>
                    <div className="flex justify-between"><span>Silicon:</span><span className="text-orange-400">6</span></div>
                    <div className="flex justify-between"><span>Titanium:</span><span className="text-orange-400">9</span></div>
                    <div className="flex justify-between"><span>Platinum:</span><span className="text-orange-400">12</span></div>
                    <div className="flex justify-between"><span>Rare Earth:</span><span className="text-orange-400">15</span></div>
                    <div className="flex justify-between"><span>Quantum Core:</span><span className="text-orange-400">18</span></div>
                  </div>
                </div>
                
                <div className="text-center text-xs text-gray-400">
                  <p>Destroy asteroids to earn MLEO tokens!</p>
                </div>
              </div>
              
              {/* Vault and Claim Section */}
              <div className="bg-gray-800 p-3 rounded-lg mb-3">
                <h3 className="text-sm font-semibold mb-2 text-orange-400">Vault & Claim</h3>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="p-2 rounded bg-slate-100">
                    <div className="text-slate-500 text-xs">Vault</div>
                    <div className="font-extrabold text-slate-900 tabular-nums">{formatMleo2(Number(spaceMleo?.vault || 0))}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-100">
                    <div className="text-slate-500 text-xs">Claimed</div>
                    <div className="font-extrabold text-slate-900 tabular-nums">{formatMleo2(Number(spaceMleo?.claimedToWallet || 0))}</div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => runOnceVault(claimGameMleoToVault)}
                    disabled={Number((stateRef.current?.mleo || 0).toFixed(2)) <= 0}
                    className={`px-3 py-2 rounded-lg font-extrabold text-xs active:scale-95 ${
                      Number((stateRef.current?.mleo || 0).toFixed(2)) > 0
                        ? "bg-blue-500 hover:bg-blue-400 text-white"
                        : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    }`}
                    title="Claim MLEO from game to vault"
                  >
                    CLAIM TO VAULT
                  </button>
                  
                  <button
                    onClick={() => runOnceWallet(claimSpaceMleoToWallet)}
                    disabled={Number((spaceMleo?.vault || 0).toFixed(2)) <= 0 || walIsPending()}
                    className={`px-3 py-2 rounded-lg font-extrabold text-xs active:scale-95 ${
                      Number((spaceMleo?.vault || 0).toFixed(2)) > 0 && !walIsPending()
                        ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                        : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    }`}
                    title="Claim MLEO from vault to wallet"
                  >
                    {walIsPending() ? "PENDING…" : "CLAIM TO WALLET"}
                  </button>
                </div>
              </div>
              
              <button onClick={() => setShowMleoCollection(false)} className="w-full bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded font-bold text-sm">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Center Popup - Mobile Responsive */}
        {centerPopup && (
          <div className="fixed inset-0 z-[10000] pointer-events-none flex items-center justify-center p-4">
            <div className="bg-black/80 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg font-bold text-sm md:text-lg text-center">
              {centerPopup.text}
            </div>
          </div>
        )}

        {/* Asteroid Destruction Popup - Mobile Responsive */}
        {asteroidPopup && (
          <div className="fixed inset-0 z-[10000] pointer-events-none flex items-center justify-center p-4">
            <div className="bg-black/80 text-white px-3 md:px-4 py-2 md:py-3 rounded-lg font-bold text-center shadow-2xl">
              <div className="text-sm md:text-lg mb-1">💥 Asteroid Destroyed!</div>
              <div className="text-xs md:text-sm">
                <div className="text-yellow-300">💰 Credits: +{asteroidPopup.credits}</div>
                <div className="text-orange-300">🪙 MLEO: +{asteroidPopup.mleo}</div>
                <div className="text-gray-300 text-xs mt-1 capitalize">
{humanizeMaterial(asteroidPopup?.material)} Asteroid
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gift Toast */}
        {giftToast && (
          <div className="fixed top-4 right-4 z-[10000] bg-orange-600 text-white px-4 py-2 rounded-lg font-bold">
            {giftToast.text}
          </div>
        )}

        {/* Gift Modal */}
        {showGiftModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="bg-black/80 text-white px-4 py-3 rounded-lg font-bold text-center shadow-2xl">
              <div className="text-lg mb-1">🎁 Gift Received!</div>
              <div className="text-sm mb-2">
                {giftType === 'credits' && (<div className="text-yellow-300">💰 Credits: +{giftAmount}</div>)}
                {giftType === 'robot' && (<div className="text-blue-300">🤖 Robot: +1</div>)}
              </div>
              <button onClick={claimGift} className="bg-orange-500 hover:bg-orange-400 text-white px-3 py-1 rounded text-xs font-bold active:scale-95">
                CLAIM
              </button>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {menuOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}>
            <div
              className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <h2 className="text-xl font-extrabold">Settings</h2>
                <button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center" title="Close">✕</button>
              </div>

              {/* Sound */}
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Sound</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSfxMuted(v => !v)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}
                  >
                    SFX: {sfxMuted ? "Off" : "On"}
                  </button>
                  <button
                    onClick={() => setMusicMuted(v => !v)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${musicMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}
                  >
                    Music: {musicMuted ? "Off" : "On"}
                  </button>
                </div>
              </div>

              {/* Game Info */}
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Game Info</h3>
                <div className="text-xs text-gray-300 space-y-1">
                  <p>Credits: {stateRef.current?.credits || 0}</p>
                  <p>MLEO: {stateRef.current?.mleo || 0}</p>
                  <p>Robots: {stateRef.current?.robots?.length || 0}/{MAX_ROBOTS}</p>
                  <p>Sector: {stateRef.current?.currentSector?.toUpperCase() || "ALPHA"}</p>
                </div>
              </div>

              {/* Reset Game */}
              <div className="mb-4">
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to reset the game? This will delete all progress!")) {
                      const initialState = getInitialState();
                      stateRef.current = initialState;
                      initialState.asteroids = [];
                      for (let i = 0; i < ASTEROID_COUNT; i++) initialState.asteroids.push(generateAsteroid(initialState.currentSector));
                      setUi({ credits: initialState.credits, energy: initialState.energy, mleo: initialState.mleo, currentSector: initialState.currentSector, stationLevel: initialState.stationLevel });
                      saveGameState(initialState, {force:true});
                      setMenuOpen(false);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold bg-red-500/90 hover:bg-red-500 text-white"
                >
                  🔄 Reset Game
                </button>
              </div>

              <div className="mt-4 text-xs opacity-70">
                <p>Space Mining Station v1.1</p>
              </div>
            </div>
          </div>
        )}

        {/* Shop Modal - Mobile Responsive */}
        {showShop && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-gray-900 p-3 md:p-6 rounded-lg max-w-md w-full border border-gray-700 max-h-[80vh] overflow-y-auto">
              <h2 className="text-lg md:text-2xl font-bold mb-4 text-center">🤖 Robot Shop</h2>
              <div className="space-y-3">
                {Object.entries(ROBOT_TYPES).map(([type, data]) => (
                  <div key={type} className="flex items-center justify-between p-3 bg-gray-800 rounded">
                    <div>
                      <div className="font-bold" style={{ color: data.color }}>{data.name}</div>
                      <div className="text-sm text-gray-400">{data.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400">{data.cost} Credits</div>
                      <button
                        onClick={() => { setSelectedRobot(type); addRobot(); }}
                        disabled={stateRef.current?.credits < data.cost || stateRef.current?.robots.length >= MAX_ROBOTS}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm"
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowShop(false)} className="mt-4 w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Sectors Modal - Mobile Responsive */}
        {showSectors && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-gray-900 p-3 md:p-6 rounded-lg max-w-md w-full border border-gray-700 max-h-[80vh] overflow-y-auto">
              <h2 className="text-lg md:text-2xl font-bold mb-4 text-center">🌌 Space Sectors</h2>
              <div className="space-y-3">
                {SPACE_SECTORS.map(sector => (
                  <button
                    key={sector.id}
                    onClick={() => { switchSector(sector.id); setShowSectors(false); }}
                    disabled={sector.unlockCost > 0 && stateRef.current?.credits < sector.unlockCost}
                    className={`w-full p-3 rounded text-left ${
                      sector.unlockCost === 0 || (stateRef.current?.credits >= sector.unlockCost)
                        ? 'bg-gray-800 hover:bg-gray-700'
                        : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                    }`}
                    style={{ borderLeft: `4px solid ${sector.color}` }}
                  >
                    <div className="font-bold">{sector.name}</div>
                    <div className="text-sm text-gray-400">Difficulty: {sector.difficulty}x | Reward: {sector.reward}x</div>
                    {sector.unlockCost > 0 && (<div className="text-sm text-yellow-400">Unlock Cost: {sector.unlockCost} Credits</div>)}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowSectors(false)} className="mt-4 w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Terms Modal */}
        {showTerms && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
            <h2 className="text-2xl font-bold mb-4 text-center">🚀 Terms & Conditions</h2>
              <p className="text-sm text-gray-300 mb-4">
                Welcome to MLEO Space Mining Station! This is a futuristic mining game where you control robots to mine asteroids in space.
                By playing, you agree to our terms of service.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { localStorage.setItem(TERMS_KEY, "accepted"); setShowTerms(false); }}
                  className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-bold"
                >
                  Accept
                </button>
                <button onClick={() => router.push('/')} className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-bold">
                  Decline
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ===== MLEO reward helpers & asteroid destruction =====
function calculateMleoReward(asteroidType) {
  const level = MLEO_LEVELS[asteroidType] || 1;
  return level * MLEO_BASE_PER_LEVEL;
}
function humanizeMaterial(m) {
  const s = String(m || "");
  return s ? s.replace(/_/g, " ") : "unknown";
}

function destroyAsteroid(state, asteroid, setAsteroidPopup) {
  const materialType = asteroid.type;
  const value = asteroid.value;
  const mleoReward = calculateMleoReward(materialType);

  state.materials[materialType] = (state.materials[materialType] || 0) + value;
  state.credits += value;
  state.totalMined += value;

  state.mleo += mleoReward;
  state.totalMleo += mleoReward;

  setAsteroidPopup?.({ credits: value, mleo: mleoReward, material: materialType, id: Math.random() });
  return { credits: value, mleo: mleoReward };
}
