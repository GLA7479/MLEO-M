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

function loadSpaceMleoState(){
  try {
    const raw = localStorage.getItem(SPACE_MLEO_LS_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      st.vault = st.vault || 0;
      st.claimedToWallet = st.claimedToWallet || 0;
      st.history = Array.isArray(st.history) ? st.history : [];
      return st;
    }
  } catch {}
  return { vault: 0, claimedToWallet: 0, history: [] };
}

function saveSpaceMleoState(st){
  try { localStorage.setItem(SPACE_MLEO_LS_KEY, JSON.stringify(st)); } catch {}
}

// ===== Formatting Functions =====
const SUFFIXES_BASE = ["", "K", "M", "B", "T"];

function suffixFromTier(tier) {
  if (tier < SUFFIXES_BASE.length) return SUFFIXES_BASE[tier];
  const idx = tier - SUFFIXES_BASE.length; // 0→AA, 1→AB ...
  // ממיר למחרוזת אותיות בסגנון גיליון (A..Z, AA..), ומבריח ל-2+ אותיות
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

// ===== Space MLEO Functions =====
function addMleoToVault(amount, setSpaceMleo) {
  const st = loadSpaceMleoState();
  st.vault = Number(((st.vault || 0) + amount).toFixed(2));
  saveSpaceMleoState(st);
  setSpaceMleo(st);
  return st;
}

function claimGameMleoToVault(setSpaceMleo, setCenterPopup, setGiftToastWithTTL, gameMleo, stateRef) {
  const gameMleoAmount = Number((gameMleo || 0).toFixed(2));
  if (!gameMleoAmount) { 
    setGiftToastWithTTL("No MLEO to claim from game"); 
    return; 
  }

  // Move MLEO from game to vault
  const st = loadSpaceMleoState();
  st.vault = Number(((st.vault || 0) + gameMleoAmount).toFixed(2));
  st.history = Array.isArray(st.history) ? st.history : [];
  st.history.unshift({ 
    t: Date.now(), 
    kind: "claim_to_vault", 
    amount: gameMleoAmount, 
    tx: "space_mining_game" 
  });
  
  saveSpaceMleoState(st);
  setSpaceMleo(st);
  
  // Reset game MLEO to 0
  if (stateRef.current) {
    stateRef.current.mleo = 0;
    stateRef.current.totalMleo = Math.max(0, (stateRef.current.totalMleo || 0) - gameMleoAmount);
  }
  
  setCenterPopup?.({ text: `✅ Moved ${formatMleoShort(gameMleoAmount)} MLEO to vault`, id: Math.random() });
}

async function claimSpaceMleoToWallet(setSpaceMleo, setCenterPopup, setGiftToastWithTTL, isConnected, openConnectModal, chainId, switchChain, writeContractAsync, publicClient, address) {
  const st = loadSpaceMleoState();
  const vaultNow = Number((st?.vault || 0).toFixed(2));
  if (!vaultNow) { 
    setGiftToastWithTTL("Vault is empty"); 
    return; 
  }

  // Check if wallet is connected
  if (!isConnected) { 
    openConnectModal?.(); 
    return; 
  }

  // Check if we're on the correct chain
  if (chainId !== CLAIM_CHAIN_ID) {
    try { 
      await switchChain?.({ chainId: CLAIM_CHAIN_ID }); 
    }
    catch { 
      setGiftToastWithTTL("Switch to BSC Testnet (TBNB)"); 
      return; 
    }
  }

  // Check if contract address is valid
  if (!isValidAddress(CLAIM_ADDRESS)) {
    setGiftToastWithTTL("Missing/invalid CLAIM address (NEXT_PUBLIC_MLEO_CLAIM_ADDRESS)");
    return;
  }

  try {
    // Convert to wei
    const amountWei = parseUnits(
      vaultNow.toString(),
      MLEO_DECIMALS
    );

    // Call the contract
    const hash = await writeContractAsync({
      address: CLAIM_ADDRESS,
      abi: MINING_CLAIM_ABI,
      functionName: "claim",
      args: [BigInt(GAME_ID), amountWei],
      chainId: CLAIM_CHAIN_ID,
      account: address,
    });

    // Wait for transaction confirmation
    await publicClient.waitForTransactionReceipt({ hash });

    // Update local state only after successful transaction
    const after = loadSpaceMleoState();
    const delta = Number(vaultNow);
    after.vault = Math.max(0, Number(((after.vault || 0) - delta).toFixed(2)));
    after.claimedToWallet = Number(((after.claimedToWallet || 0) + delta).toFixed(2));
    after.history = Array.isArray(after.history) ? after.history : [];
    after.history.unshift({ 
      t: Date.now(), 
      kind: "claim_wallet", 
      amount: delta, 
      tx: String(hash) 
    });
    
    saveSpaceMleoState(after);
    setSpaceMleo(after);
    
    setCenterPopup?.({ text: `✅ Sent ${formatMleoShort(delta)} MLEO to wallet`, id: Math.random() });
  } catch (err) {
    console.error(err);
    setGiftToastWithTTL("Claim failed or rejected");
  }
}



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
const LS_KEY = "mleoSpaceMining_v1_1";

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
  basic: {
    name: "Mining Bot",
    color: "#00ff88",
    efficiency: 1,
    speed: 1,
    cost: 100,
    description: "Basic mining robot"
  },
  advanced: {
    name: "Quantum Bot",
    color: "#0088ff",
    efficiency: 2,
    speed: 1.5,
    cost: 500,
    description: "Advanced quantum mining bot"
  },
  elite: {
    name: "Nebula Bot",
    color: "#ff0088",
    efficiency: 3,
    speed: 2,
    cost: 2000,
    description: "Elite nebula mining bot"
  },
  legendary: {
    name: "Cosmic Bot",
    color: "#ffaa00",
    efficiency: 5,
    speed: 3,
    cost: 10000,
    description: "Legendary cosmic mining bot"
  }
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
  if (IMAGE_CACHE[src]) {
    return IMAGE_CACHE[src];
  }
  
  const img = new Image();
  img.src = src;
  IMAGE_CACHE[src] = img;
  return img;
}

function preloadImages() {
  // Preload all images
  Object.values(IMAGES.spaceBg).forEach(src => loadImage(src));
  Object.values(IMAGES.robots).forEach(src => loadImage(src));
  Object.values(IMAGES.asteroids).forEach(src => loadImage(src));
  Object.values(IMAGES.effects).forEach(src => loadImage(src));
}

// ===== Game State Management =====
function loadGameState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return getInitialState();
    const state = JSON.parse(raw);
    
    // Ensure all required arrays and objects exist
    state.robots = state.robots || [];
    state.asteroids = state.asteroids || [];
    state.materials = state.materials || {
      iron: 0,
      silicon: 0,
      titanium: 0,
      platinum: 0,
      rare_earth: 0,
      quantum_core: 0
    };
    state.nextRobotId = state.nextRobotId || 1;
    
    return state;
  } catch {
    return getInitialState();
  }
}

function saveGameState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save game state:", e);
  }
}

function getInitialState() {
  return {
    // Resources
    credits: 500,
    energy: 100,
    mleo: 0, // MLEO tokens
    materials: {
      iron: 0,
      silicon: 0,
      titanium: 0,
      platinum: 0,
      rare_earth: 0,
      quantum_core: 0
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
    
    // Settings
    muted: false,
    showTutorial: true
  };
}

// ===== MLEO Functions =====
function calculateMleoReward(asteroidType) {
  const level = MLEO_LEVELS[asteroidType] || 1;
  return level * MLEO_BASE_PER_LEVEL;
}

function destroyAsteroid(state, asteroid, setAsteroidPopup) {
  const materialType = asteroid.type;
  const value = asteroid.value;
  const mleoReward = calculateMleoReward(materialType);
  
  // Add credits and materials
  state.materials[materialType] = (state.materials[materialType] || 0) + value;
  state.credits += value;
  state.totalMined += value;
  
  // Add MLEO tokens to game state (not vault yet)
  state.mleo += mleoReward;
  state.totalMleo += mleoReward;
  
  // Show asteroid destruction popup
  setAsteroidPopup?.({
    credits: value,
    mleo: mleoReward,
    material: materialType,
    id: Math.random()
  });
  
  return { credits: value, mleo: mleoReward };
}

// ===== Utility Functions =====
function generateAsteroid(sector) {
  const sectorData = SPACE_SECTORS.find(s => s.id === sector);
  const asteroidType = sectorData.asteroidTypes[Math.floor(Math.random() * sectorData.asteroidTypes.length)];
  const typeData = ASTEROID_TYPES[asteroidType];
  
  // Define safe boundaries to avoid clipping
  const margin = 80; // Space from edges
  const topMargin = 100; // Space from header
  const bottomMargin = 120; // Space from bottom
  
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

function calculateDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
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
    credits: 500,
    energy: 100,
    mleo: 0,
    currentSector: "alpha",
    stationLevel: 1
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
  const [spaceMleo, setSpaceMleo] = useState({
    vault: 0, claimedToWallet: 0, history: []
  });
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

  // Load space MLEO state
  useEffect(() => {
    if (!mounted) return;
    try { setSpaceMleo(loadSpaceMleoState()); } catch {}
    const id = setInterval(() => {
      try { setSpaceMleo(loadSpaceMleoState()); } catch {}
    }, 1000);
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
        // First time - set initial time
        const now = Date.now();
        setLastGiftTime(now);
        localStorage.setItem('spaceGiftTimer', JSON.stringify({ lastGiftTime: now }));
        setGiftTimer(30);
      }
    } catch {
      // Fallback - set initial time
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

  // Gift modal - no auto-hide, requires button click

  // Online/Offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    setIsOnline(navigator.onLine);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-offline after 1 minute of inactivity
  useEffect(() => {
    if (!mounted) return;
    
    let inactivityTimer;
    
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        setIsOnline(false);
      }, 60000); // 1 minute = 60000ms
    };
    
    // Reset timer on any user interaction
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, true);
    });
    
    // Start the timer
    resetInactivityTimer();
    
    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer, true);
      });
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
      
      // If time is up, reset the timer
      if (remainingTime <= 0) {
        const newTime = Date.now();
        setLastGiftTime(newTime);
        localStorage.setItem('spaceGiftTimer', JSON.stringify({ lastGiftTime: newTime }));
        setGiftTimer(30);
      }
    }, 1000); // Every second

    return () => clearInterval(timerInterval);
  }, [mounted, lastGiftTime]);

  // Gift system - every 30 seconds
  useEffect(() => {
    if (!mounted || !lastGiftTime) return;
    
    const giftInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastGift = now - lastGiftTime;
      
      // Only give gift if 30 seconds have passed
      if (timeSinceLastGift >= 30000) {
        const random = Math.random();
        if (random < 0.8) {
          // 80% chance for credits
          const creditsAmount = Math.floor(Math.random() * 200) + 50; // 50-250 credits
          setGiftType('credits');
          setGiftAmount(creditsAmount);
          setShowGiftModal(true);
        } else {
          // 20% chance for robot
          setGiftType('robot');
          setGiftAmount(1);
          setShowGiftModal(true);
        }
        
        // Save the time when gift was given
        setLastGiftTime(now);
        localStorage.setItem('spaceGiftTimer', JSON.stringify({ lastGiftTime: now }));
      }
    }, 1000); // Check every second

    return () => clearInterval(giftInterval);
  }, [mounted, lastGiftTime]);

  // Gift functions
  function setGiftToastWithTTL(text, ttl = 3000) {
    const id = Math.random().toString(36).slice(2);
    setGiftToast?.({ text, id });
    setTimeout(() => { setGiftToast?.(cur => (cur && cur.id === id ? null : cur)); }, ttl);
  }

  function claimGift() {
    if (giftType === 'credits') {
      // Add credits to game state
      if (stateRef.current) {
        stateRef.current.credits += giftAmount;
        setCenterPopup?.({ text: `🎁 +${giftAmount} Credits!`, id: Math.random() });
      }
    } else if (giftType === 'robot') {
      // Add robot if there's space
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
      } else {
        setGiftToastWithTTL("No space for robot!");
      }
    }
    
    // Set online status when claiming gift
    setIsOnline(true);
    
    setShowGiftModal(false);
    setGiftType(null);
    setGiftAmount(0);
  }

  // Helper functions
  function shortAddr(addr) {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function openWalletModalUnified() {
    try { 
      // Close overlays that might cover RainbowKit
      setMenuOpen(false);
      setShowShop(false);
      setShowSectors(false);
    } catch {}
    
    if (isConnected) {
      openAccountModal();
    } else {
      openConnectModal();
    }
  }

  function hardDisconnect() {
    try { disconnect(); } catch {}
    setMenuOpen(false);
  }

  // Initialize game state
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const state = loadGameState();
    stateRef.current = state;
    
    // Debug: Log loaded state
    console.log("Loaded game state:", {
      robots: state.robots?.length || 0,
      asteroids: state.asteroids?.length || 0,
      credits: state.credits
    });
    
    // Only generate initial asteroids if none exist (new game)
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
    
    // Preload images
    preloadImages();
    
    setMounted(true);
    
    // Check terms acceptance
    const termsAccepted = localStorage.getItem(TERMS_KEY);
    if (!termsAccepted) {
      setShowTerms(true);
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (!mounted) return;

    let lastTime = 0;
    const gameLoop = (currentTime) => {
      if (!stateRef.current) return;
      
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      tick(deltaTime);
      draw();
      
      rafRef.current = requestAnimationFrame(gameLoop);
    };
    
    rafRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [mounted]);

  // Robot merging function - Force robots of same level to meet and merge
  function checkRobotMerging(state) {
    if (!state.robots || state.robots.length < 2) return;
    
    // Group robots by level
    const robotsByLevel = {};
    state.robots.forEach(robot => {
      if (!robotsByLevel[robot.level]) {
        robotsByLevel[robot.level] = [];
      }
      robotsByLevel[robot.level].push(robot);
    });
    
    // Check each level for mergeable robots
    Object.keys(robotsByLevel).forEach(level => {
      const robots = robotsByLevel[level];
      if (robots.length >= 2) {
        // Find the two closest robots of the same level
        let closestDistance = Infinity;
        let robot1 = null;
        let robot2 = null;
        
        for (let i = 0; i < robots.length - 1; i++) {
          for (let j = i + 1; j < robots.length; j++) {
            const distance = calculateDistance(robots[i].x, robots[i].y, robots[j].x, robots[j].y);
            if (distance < closestDistance) {
              closestDistance = distance;
              robot1 = robots[i];
              robot2 = robots[j];
            }
          }
        }
        
        if (robot1 && robot2) {
          // Force robots to move towards each other
          const dx = robot2.x - robot1.x;
          const dy = robot2.y - robot1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0) {
            // Move both robots towards each other
            const moveSpeed = 2; // Speed of movement towards each other
            const moveX = (dx / distance) * moveSpeed;
            const moveY = (dy / distance) * moveSpeed;
            
            robot1.x += moveX;
            robot1.y += moveY;
            robot2.x -= moveX;
            robot2.y -= moveY;
            
            // If they're close enough, merge them
            const newDistance = calculateDistance(robot1.x, robot1.y, robot2.x, robot2.y);
            if (newDistance <= 20) { // Smaller merge distance for forced merging
              mergeRobots(state, robot1, robot2);
              return; // Exit after one merge per tick
            }
          }
        }
      }
    });
  }
  
  // Merge two robots into one upgraded robot
  function mergeRobots(state, robot1, robot2) {
    // Remove both robots from the array
    const index1 = state.robots.findIndex(r => r.id === robot1.id);
    const index2 = state.robots.findIndex(r => r.id === robot2.id);
    
    if (index1 !== -1 && index2 !== -1) {
      state.robots.splice(Math.max(index1, index2), 1);
      state.robots.splice(Math.min(index1, index2), 1);
      
      // Create new merged robot
      const newRobot = {
        id: state.nextRobotId++,
        type: robot1.type, // Keep the same type
        level: robot1.level + 1, // Increase level
        x: (robot1.x + robot2.x) / 2, // Average position
        y: (robot1.y + robot2.y) / 2,
        targetAsteroid: null,
        efficiency: robot1.efficiency * 1.01, // Increase efficiency by 1%
        speed: robot1.speed // Keep same speed
      };
      
      state.robots.push(newRobot);
      
      // Show merge notification
      setCenterPopup?.({ 
        text: `🤖 Robot Level ${newRobot.level}! Efficiency +1%`, 
        id: Math.random() 
      });
      
      // Save the state
      saveGameState(state);
    }
  }

  // Game tick function
  function tick(dt) {
    const state = stateRef.current;
    if (!state || flagsRef.current.paused) return;
    
    const now = Date.now();
    
    // Auto-merge robots of same level
    checkRobotMerging(state);
    
    // Update robots
    state.robots.forEach(robot => {
      if (robot.targetAsteroid) {
        const asteroid = state.asteroids.find(a => a.id === robot.targetAsteroid);
        if (asteroid && asteroid.hp > 0) {
          // Move towards asteroid
          const dx = asteroid.x - robot.x;
          const dy = asteroid.y - robot.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 5) {
            const speed = robot.speed * 50 * (dt / 1000);
            robot.x += (dx / distance) * speed;
            robot.y += (dy / distance) * speed;
          } else {
            // Mine asteroid
            const damage = robot.efficiency * (dt / 1000) * 10;
            asteroid.hp -= damage;
            
            if (asteroid.hp <= 0) {
              // Asteroid destroyed, collect resources
              const rewards = destroyAsteroid(state, asteroid, setAsteroidPopup);
              
              // Remove asteroid and generate new one
              const asteroidIndex = state.asteroids.findIndex(a => a.id === asteroid.id);
              state.asteroids[asteroidIndex] = generateAsteroid(state.currentSector);
              
              // Update UI
              setUi(prev => ({ 
                ...prev, 
                credits: state.credits,
                mleo: state.mleo 
              }));
            }
          }
        } else {
          // Find new target
          robot.targetAsteroid = null;
        }
      } else {
        // Find nearest asteroid
        let nearestAsteroid = null;
        let nearestDistance = Infinity;
        
        state.asteroids.forEach(asteroid => {
          if (asteroid.hp > 0) {
            const distance = calculateDistance(robot.x, robot.y, asteroid.x, asteroid.y);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestAsteroid = asteroid;
            }
          }
        });
        
        if (nearestAsteroid) {
          robot.targetAsteroid = nearestAsteroid.id;
        }
      }
    });
    
    // Auto-save every 30 seconds
    if (now - state.lastSave > 30000) {
      saveGameState(state);
      state.lastSave = now;
    }
  }

  // Drawing function
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const w = rect.width;
    const h = rect.height;
    
    // Clear canvas
    ctx.fillStyle = "#000011";
    ctx.fillRect(0, 0, w, h);
    
    // Draw space background (full screen)
    drawSpaceBackground(ctx, w, h);
    
    // Draw game elements (offset to avoid header)
    drawAsteroids(ctx, w, h - 80);
    drawRobots(ctx, w, h - 80);
    drawUI(ctx, w, h);
  }

  function drawSpaceBackground(ctx, w, h) {
    const state = stateRef.current;
    if (!state) return;
    
    const sector = SPACE_SECTORS.find(s => s.id === state.currentSector);
    const bgImageSrc = IMAGES.spaceBg[sector.id];
    const bgImage = loadImage(bgImageSrc);
    
    if (bgImage.complete && bgImage.naturalWidth > 0) {
      // Draw space background image (full screen)
      ctx.drawImage(bgImage, 0, 0, w, h);
    } else {
      // Fallback: draw gradient background (full screen)
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, sector.color);
      gradient.addColorStop(1, "#000000");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      
      // Draw stars (full screen)
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 100; i++) {
        const x = (i * 137.5) % w;
        const y = (i * 73.2) % h;
        const size = Math.random() * 2;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawAsteroids(ctx, w, h) {
    const state = stateRef.current;
    if (!state) return;
    
    const offsetY = 80; // Offset to avoid header
    
    state.asteroids.forEach(asteroid => {
      if (asteroid.hp <= 0) return;
      
      const asteroidImageSrc = IMAGES.asteroids[asteroid.type];
      const asteroidImage = loadImage(asteroidImageSrc);
      
      // Calculate size based on HP
      const hpPercent = asteroid.hp / asteroid.maxHp;
      const currentSize = asteroid.size * (0.3 + 0.7 * hpPercent); // Size between 30% and 100%
      
      if (asteroidImage.complete && asteroidImage.naturalWidth > 0) {
        // Draw asteroid image
        const size = currentSize * 2;
        ctx.drawImage(asteroidImage, asteroid.x - size/2, asteroid.y - size/2 + offsetY, size, size);
      } else {
        // Fallback: draw asteroid shape
        ctx.fillStyle = asteroid.color;
        ctx.beginPath();
        ctx.arc(asteroid.x, asteroid.y + offsetY, currentSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw asteroid border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Draw HP bar at bottom of asteroid
      const barWidth = currentSize * 1.2;
      const barHeight = 6;
      const barY = asteroid.y + offsetY + currentSize - 12;
      
      // HP bar background
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(asteroid.x - barWidth/2, barY, barWidth, barHeight);
      
      // HP bar fill
      ctx.fillStyle = hpPercent > 0.5 ? "#00ff00" : hpPercent > 0.25 ? "#ffff00" : "#ff0000";
      ctx.fillRect(asteroid.x - barWidth/2, barY, barWidth * hpPercent, barHeight);
    });
  }

  function drawRobots(ctx, w, h) {
    const state = stateRef.current;
    if (!state) return;
    
    const offsetY = 80; // Offset to avoid header
    
    state.robots.forEach(robot => {
      const robotType = ROBOT_TYPES[robot.type];
      const robotImageSrc = IMAGES.robots[robot.type];
      const robotImage = loadImage(robotImageSrc);
      
      if (robotImage.complete && robotImage.naturalWidth > 0) {
        // Draw robot image (increased size)
        const size = 40;
        ctx.drawImage(robotImage, robot.x - size/2, robot.y - size/2 + offsetY, size, size);
      } else {
        // Fallback: draw robot shape (increased size)
        ctx.fillStyle = robotType.color;
        ctx.beginPath();
        ctx.arc(robot.x, robot.y + offsetY, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw robot border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Direction indicator removed for cleaner look
      
      // Draw robot level at bottom (no background/shadow)
      const levelText = robot.level.toString();
      
      // Set font size with outline
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      
      // Draw black outline first
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.strokeText(levelText, robot.x, robot.y + 25 + offsetY);
      
      // Draw white text on top
      ctx.fillStyle = "#ffffff";
      ctx.fillText(levelText, robot.x, robot.y + 25 + offsetY);
    });
  }

  function drawUI(ctx, w, h) {
    const state = stateRef.current;
    if (!state) return;
    
    // All UI elements moved to HTML header
  }


  // Game actions
  function addRobot() {
    const state = stateRef.current;
    if (!state) return;
    
    const robotType = ROBOT_TYPES[selectedRobot];
    if (state.credits < robotType.cost) return;
    if (state.robots.length >= MAX_ROBOTS) return;
    
    // Define safe boundaries for robots
    const margin = 80;
    const topMargin = 100;
    const bottomMargin = 120;
    
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
    
    // Debug: Log robot addition
    console.log("Added robot:", robot, "Total robots:", state.robots.length);
    
    setUi(prev => ({ ...prev, credits: state.credits }));
    saveGameState(state);
  }

  function switchSector(sectorId) {
    const state = stateRef.current;
    if (!state) return;
    
    const sector = SPACE_SECTORS.find(s => s.id === sectorId);
    if (!sector) return;
    
    if (sector.unlockCost > 0 && state.credits < sector.unlockCost) return;
    
    state.currentSector = sectorId;
    state.credits -= sector.unlockCost;
    
    // Generate new asteroids for this sector
    state.asteroids = [];
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      state.asteroids.push(generateAsteroid(sectorId));
    }
    
    setUi(prev => ({ ...prev, currentSector: sectorId, credits: state.credits }));
    saveGameState(state);
  }

  if (!mounted) {
    return <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="text-2xl">Loading Space Station...</div>
    </div>;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-black text-white">
        {/* Game Canvas */}
        <div className="relative w-full h-screen">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair relative z-0 top-0"
            onClick={(e) => {
              // Add robot at click position
              addRobot();
            }}
          />
          
          {/* Header */}
          <div className="absolute top-0 left-0 w-full h-16 flex items-center justify-between px-4 z-10">
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
                  <button
                    onClick={() => setIsOnline(true)}
                    className="font-bold text-red-400 hover:text-red-300 underline text-xs"
                  >
                    OFFLINE
                  </button>
                )}
              </div>
              
              {/* Gift Timer */}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                <span className="font-bold text-yellow-400 text-xs">
                  🎁 {giftTimer}s
                </span>
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
                {Object.entries(stateRef.current?.materials || {}).map(([material, amount], index) => {
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
          
          {/* UI Overlay */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
            <button
              onClick={() => setShowShop(true)}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold"
            >
              🤖 Shop
            </button>
            <button
              onClick={() => setShowSectors(true)}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold"
            >
              🌌 Sectors
            </button>
          </div>
        </div>

        {/* MLEO Collection Modal */}
        {showMleoCollection && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 p-4 rounded-lg max-w-sm w-full border border-gray-700 max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-3 text-center text-orange-400">🪙 MLEO Collection</h2>
              
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
                    <div className="flex justify-between">
                      <span>Iron:</span>
                      <span className="text-orange-400">3</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Silicon:</span>
                      <span className="text-orange-400">6</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Titanium:</span>
                      <span className="text-orange-400">9</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Platinum:</span>
                      <span className="text-orange-400">12</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rare Earth:</span>
                      <span className="text-orange-400">15</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Quantum Core:</span>
                      <span className="text-orange-400">18</span>
                    </div>
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
                    <div className="font-extrabold text-slate-900 tabular-nums">
                      {formatMleo2(Number(spaceMleo?.vault || 0))}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-100">
                    <div className="text-slate-500 text-xs">Claimed</div>
                    <div className="font-extrabold text-slate-900 tabular-nums">
                      {formatMleo2(Number(spaceMleo?.claimedToWallet || 0))}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => claimGameMleoToVault(
                      setSpaceMleo, 
                      setCenterPopup, 
                      setGiftToastWithTTL, 
                      stateRef.current?.mleo || 0,
                      stateRef
                    )}
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
                    onClick={() => claimSpaceMleoToWallet(
                      setSpaceMleo, 
                      setCenterPopup, 
                      setGiftToastWithTTL, 
                      isConnected, 
                      openConnectModal, 
                      chainId, 
                      switchChain, 
                      writeContractAsync, 
                      publicClient, 
                      address
                    )}
                    disabled={Number((spaceMleo?.vault || 0).toFixed(2)) <= 0}
                    className={`px-3 py-2 rounded-lg font-extrabold text-xs active:scale-95 ${
                      Number((spaceMleo?.vault || 0).toFixed(2)) > 0
                        ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                        : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    }`}
                    title="Claim MLEO from vault to wallet"
                  >
                    CLAIM TO WALLET
                  </button>
                </div>
              </div>
              
              <button
                onClick={() => setShowMleoCollection(false)}
                className="w-full bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded font-bold text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Center Popup */}
        {centerPopup && (
          <div className="fixed inset-0 z-[10000] pointer-events-none flex items-center justify-center">
            <div className="bg-black/80 text-white px-6 py-3 rounded-lg font-bold text-lg">
              {centerPopup.text}
            </div>
          </div>
        )}

        {/* Asteroid Destruction Popup */}
        {asteroidPopup && (
          <div className="fixed inset-0 z-[10000] pointer-events-none flex items-center justify-center">
            <div className="bg-black/80 text-white px-4 py-3 rounded-lg font-bold text-center shadow-2xl">
              <div className="text-lg mb-1">💥 Asteroid Destroyed!</div>
              <div className="text-sm">
                <div className="text-yellow-300">💰 Credits: +{asteroidPopup.credits}</div>
                <div className="text-orange-300">🪙 MLEO: +{asteroidPopup.mleo}</div>
                <div className="text-gray-300 text-xs mt-1 capitalize">
                  {asteroidPopup.material.replace('_', ' ')} Asteroid
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
                {giftType === 'credits' && (
                  <div className="text-yellow-300">💰 Credits: +{giftAmount}</div>
                )}
                {giftType === 'robot' && (
                  <div className="text-blue-300">🤖 Robot: +1</div>
                )}
              </div>
              <button
                onClick={claimGift}
                className="bg-orange-500 hover:bg-orange-400 text-white px-3 py-1 rounded text-xs font-bold active:scale-95"
              >
                CLAIM
              </button>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {menuOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="
                w-[86vw] max-w-[250px]
                max-h-[70vh]
                bg-[#0b1220] text-white
                shadow-2xl rounded-2xl
                p-4 md:p-5
                overflow-y-auto
              "
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <h2 className="text-xl font-extrabold">Settings</h2>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center"
                  title="Close"
                >
                  ✕
                </button>
              </div>


              {/* Sound */}
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Sound</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSfxMuted(v => !v)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                      sfxMuted
                        ? "bg-rose-500/90 hover:bg-rose-500 text-white"
                        : "bg-emerald-500/90 hover:bg-emerald-500 text-white"
                    }`}
                  >
                    SFX: {sfxMuted ? "Off" : "On"}
                  </button>
                  <button
                    onClick={() => setMusicMuted(v => !v)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                      musicMuted
                        ? "bg-rose-500/90 hover:bg-rose-500 text-white"
                        : "bg-emerald-500/90 hover:bg-emerald-500 text-white"
                    }`}
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
                      // Reset game state
                      const initialState = getInitialState();
                      stateRef.current = initialState;
                      
                      // Generate new asteroids
                      initialState.asteroids = [];
                      for (let i = 0; i < ASTEROID_COUNT; i++) {
                        initialState.asteroids.push(generateAsteroid(initialState.currentSector));
                      }
                      
                      // Update UI
                      setUi({
                        credits: initialState.credits,
                        energy: initialState.energy,
                        mleo: initialState.mleo,
                        currentSector: initialState.currentSector,
                        stationLevel: initialState.stationLevel
                      });
                      
                      // Save reset state
                      saveGameState(initialState);
                      
                      // Close settings
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

        {/* Shop Modal */}
        {showShop && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-center">🤖 Robot Shop</h2>
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
                        onClick={() => {
                          setSelectedRobot(type);
                          addRobot();
                        }}
                        disabled={stateRef.current?.credits < data.cost || stateRef.current?.robots.length >= MAX_ROBOTS}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm"
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowShop(false)}
                className="mt-4 w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Sectors Modal */}
        {showSectors && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-center">🌌 Space Sectors</h2>
              <div className="space-y-3">
                {SPACE_SECTORS.map(sector => (
                  <button
                    key={sector.id}
                    onClick={() => {
                      switchSector(sector.id);
                      setShowSectors(false);
                    }}
                    disabled={sector.unlockCost > 0 && stateRef.current?.credits < sector.unlockCost}
                    className={`w-full p-3 rounded text-left ${
                      sector.unlockCost === 0 || (stateRef.current?.credits >= sector.unlockCost)
                        ? 'bg-gray-800 hover:bg-gray-700'
                        : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                    }`}
                    style={{ borderLeft: `4px solid ${sector.color}` }}
                  >
                    <div className="font-bold">{sector.name}</div>
                    <div className="text-sm text-gray-400">
                      Difficulty: {sector.difficulty}x | Reward: {sector.reward}x
                    </div>
                    {sector.unlockCost > 0 && (
                      <div className="text-sm text-yellow-400">
                        Unlock Cost: {sector.unlockCost} Credits
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowSectors(false)}
                className="mt-4 w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
              >
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
                  onClick={() => {
                    localStorage.setItem(TERMS_KEY, "accepted");
                    setShowTerms(false);
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-bold"
                >
                  Accept
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-bold"
                >
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