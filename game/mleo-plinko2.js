// ============================================================================
// MLEO Plinko2 - Full-Screen Game Template with Physics
// Plinko with full physics + new UI template
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

const LS_KEY = "mleo_plinko2_v1";
const MIN_BET = 1000;
const MULTIPLIERS = [0, 10, 1.5, 3, 1, 0.5, 0.2, 0, 0.2, 0.5, 1, 3, 1.5, 10, 0];
const BUCKET_COLORS = [
  "from-gray-700 to-gray-800", "from-yellow-400 to-amber-500", "from-orange-500 to-orange-600",
  "from-green-500 to-emerald-500", "from-blue-500 to-cyan-500", "from-purple-500 to-purple-600",
  "from-red-500 to-red-600", "from-gray-700 to-gray-800", "from-red-500 to-red-600",
  "from-purple-500 to-purple-600", "from-blue-500 to-cyan-500", "from-green-500 to-emerald-500",
  "from-orange-500 to-orange-600", "from-yellow-400 to-amber-500", "from-gray-700 to-gray-800"
];
const ROWS = 13;
const COLS = 15;
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 12;
const MINING_CLAIM_ABI = [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] }];
const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";

// Physics configs
const PHYS_WIDE = { gravity: 1200, airDrag: 0.012, restitution: 0.45, wallRestitution: 0.35, pegRadius: 8, ballRadius: 6, maxVel: 2200, spawnJitterX: 14, spawnVy: 30, centerBias: 0.0008, bucketCaptureVy: 150 };
const PHYS_NARROW = { gravity: 1000, airDrag: 0.015, restitution: 0.4, wallRestitution: 0.3, pegRadius: 4, ballRadius: 3, maxVel: 1800, spawnJitterX: 10, spawnVy: 25, centerBias: 0.001, bucketCaptureVy: 120 };
const BOARD_WIDE = { marginX: 20, marginTop: 20, marginBottom: 15, pegGapX: 42, pegGapY: 44 };
const BOARD_NARROW = { marginX: 15, marginTop: 15, marginBottom: 10, pegGapX: 28, pegGapY: 32 };

function safeRead(key, fallback = {}) { if (typeof window === "undefined") return fallback; try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val) { if (typeof window === "undefined") return; try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function getVault() { const rushData = safeRead("mleo_rush_core_v4", {}); return rushData.vault || 0; }
function setVault(amount) { const rushData = safeRead("mleo_rush_core_v4", {}); rushData.vault = amount; safeWrite("mleo_rush_core_v4", rushData); }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return Math.floor(n).toString(); }
function shortAddr(addr) { if (!addr || addr.length < 10) return addr || ""; return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }
function rand01() { return Math.random(); }

export default function Plinko2Page() {
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
  const [isWideScreen, setIsWideScreen] = useState(true);
  const [result, setResult] = useState(null);
  const [finalBuckets, setFinalBuckets] = useState([]);
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
  const dropSound = useRef(null);
  const bounceSound = useRef(null);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalDrops: 0, totalBet: 0, totalWon: 0, biggestWin: 0, history: [], lastBet: MIN_BET }));

  // Canvas & Physics state
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);
  const pegsRef = useRef([]);
  const ballsRef = useRef([]);
  const bucketsRef = useRef([]);
  const boardRef = useRef(null);
  const lastTsRef = useRef(0);
  const accumulatorRef = useRef(0);
  const FIXED_DT = 1 / 120;

  const PHYS = useMemo(() => isWideScreen ? PHYS_WIDE : PHYS_NARROW, [isWideScreen]);
  const BOARD = useMemo(() => isWideScreen ? BOARD_WIDE : BOARD_NARROW, [isWideScreen]);

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
    if (typeof Audio !== "undefined") { try { clickSound.current = new Audio(S_CLICK); winSound.current = new Audio(S_WIN); dropSound.current = new Audio(S_CLICK); bounceSound.current = new Audio(S_CLICK); } catch {} }
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { clearInterval(interval); document.removeEventListener("fullscreenchange", handleFullscreenChange); };
  }, [router.query]);

  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);
  useEffect(() => { if (result) { setShowResultPopup(true); const timer = setTimeout(() => setShowResultPopup(false), 4000); return () => clearTimeout(timer); } }, [result]);

  // Screen detection
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      const isWide = width > 768 || (width / window.innerHeight) > 1.2;
      setIsWideScreen(isWide);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    window.addEventListener('orientationchange', checkScreenSize);
    return () => {
      window.removeEventListener('resize', checkScreenSize);
      window.removeEventListener('orientationchange', checkScreenSize);
    };
  }, []);

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

  const dropBall = (isFreePlayParam = false) => {
    playSfx(clickSound.current);
    let bet = Number(betAmount) || MIN_BET;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) { bet = result.amount; setIsFreePlay(false); router.replace('/plinko2', undefined, { shallow: true }); }
      else { alert('No free play tokens available!'); setIsFreePlay(false); return; }
    } else {
      if (bet < MIN_BET) { alert(`Minimum bet is ${MIN_BET} MLEO`); return; }
      const currentVault = getVault();
      if (currentVault < bet) { alert('Insufficient MLEO in vault'); return; }
      setVault(currentVault - bet); setVaultState(currentVault - bet);
    }
    setBetAmount(String(bet));
    const board = boardRef.current;
    if (!board) return;
    const x0 = board.centerX + (rand01() * 2 - 1) * PHYS.spawnJitterX;
    const y0 = board.top - 20;
    const ball = { x: x0, y: y0, vx: (rand01() * 2 - 1) * 40, vy: PHYS.spawnVy + rand01() * 40, _landed: false, betAmount: bet };
    ballsRef.current.push(ball);
    playSfx(dropSound.current);
  };

  const resetGame = () => { setResult(null); setShowResultPopup(false); setFinalBuckets([]); };
  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  // Physics functions (simplified from original)
  function buildBoardGeometry(w, h) {
    const left = BOARD.marginX;
    const right = w - BOARD.marginX;
    const top = BOARD.marginTop;
    const totalWidth = (COLS - 1) * BOARD.pegGapX;
    const innerWidth = right - left;
    const scaleX = innerWidth / totalWidth;
    const gapX = BOARD.pegGapX * scaleX;
    const gapY = BOARD.pegGapY * Math.max(0.85, Math.min(1.15, scaleX));
    const centerX = left + innerWidth * 0.5;
    const totalRows = 15;
    const lastPegY = top + (totalRows - 1) * gapY + 24;
    const baseBottom = h - BOARD.marginBottom;
    const mobileGap = isWideScreen ? 16 : 12;
    const desiredBottom = lastPegY + PHYS.pegRadius + mobileGap;
    const bottom = Math.min(h - 20, Math.max(baseBottom, desiredBottom));

    const pegs = [];
    for (let r = 0; r < ROWS; r++) {
      let pegsInRow = r === 0 ? 3 : r < 9 ? r + 3 : 10 + (r - 9) * 2;
      if (r === 10) pegsInRow = 13;
      if (r === 11) pegsInRow = 14;
      if (r === 12) pegsInRow = 15;
      
      let offset = (r % 2 === 1) ? gapX * 0.05 : 0;
      if (r === 10) offset = 0;
      if (r === 11) offset = gapX * 0.05;
      if (r === 12) offset = 0;
      offset -= gapX * 0.1;
      
      const rowWidth = (pegsInRow - 1) * gapX;
      const startX = centerX - rowWidth / 2 + offset;
      
      for (let c = 0; c < pegsInRow; c++) {
        const x = startX + c * gapX;
        const y = top + r * gapY + 24;
        pegs.push({ x, y, r: PHYS.pegRadius });
      }
    }

    const totalFlexUnits = 15;
    const unitWidth = innerWidth / totalFlexUnits;
    const buckets = [];
    let currentX = left;
    
    for (let i = 0; i < COLS; i++) {
      let bucketFlex = 1;
      if (i === 0 || i === 14) bucketFlex = 1.5;
      else if (i === 1 || i === 13) bucketFlex = 0.5;
      else if (i === 3 || i === 11) bucketFlex = 0.5;
      else if (i === 7) bucketFlex = 2;
      
      const width = unitWidth * bucketFlex;
      buckets.push({ x: currentX, width, index: i });
      currentX += width;
    }

    boardRef.current = { w, h, left, right, top, bottom, centerX, innerWidth, bucketWidth: unitWidth };
    pegsRef.current = pegs;
    bucketsRef.current = buckets;
  }

  function step(dt) {
    const board = boardRef.current;
    if (!board) return;

    for (let b of ballsRef.current) {
      if (b._landed) continue;

      b.vy += PHYS.gravity * dt;
      b.vx *= (1 - PHYS.airDrag);
      b.vy *= (1 - PHYS.airDrag);
      
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > PHYS.maxVel) {
        b.vx = (b.vx / speed) * PHYS.maxVel;
        b.vy = (b.vy / speed) * PHYS.maxVel;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const R = PHYS.ballRadius;
      if (b.x - R < board.left) { b.x = board.left + R; b.vx = Math.abs(b.vx) * PHYS.wallRestitution; }
      if (b.x + R > board.right) { b.x = board.right - R; b.vx = -Math.abs(b.vx) * PHYS.wallRestitution; }

      for (let p of pegsRef.current) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < R + p.r) {
          const overlap = R + p.r - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx * PHYS.restitution;
          b.vy -= 2 * dot * ny * PHYS.restitution;
          playSfx(bounceSound.current);
        }
      }

      const floorY = board.bottom - R;
      if (b.y >= floorY) {
        if (Math.abs(b.vy) < PHYS.bucketCaptureVy) {
          b.y = floorY;
          const idx = Math.max(0, Math.min(COLS - 1, Math.floor((b.x - board.left) / board.bucketWidth)));
          landInBucket(idx, b);
        } else {
          b.y = floorY;
          b.vy = -Math.abs(b.vy) * PHYS.wallRestitution * 0.8;
          b.vx *= 0.98;
        }
      }
    }

    ballsRef.current = ballsRef.current.filter(b => !b._landed);
  }

  function landInBucket(idx, ball) {
    ball._landed = true;
    setFinalBuckets(prev => [...prev, idx]);
    setTimeout(() => { setFinalBuckets(prev => prev.filter(i => i !== idx)); }, 1500);

    const mult = MULTIPLIERS[idx] ?? 0;
    const prize = Math.floor(ball.betAmount * mult);
    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault); setVaultState(newVault);
    }

    setStats(s => ({
      totalDrops: s.totalDrops + 1,
      totalBet: (s.totalBet || 0) + ball.betAmount,
      totalWon: s.totalWon + prize,
      biggestWin: Math.max(s.biggestWin, prize),
      history: [{ mult, prize, bucket: idx, timestamp: Date.now() }, ...s.history.slice(0, 9)],
      lastBet: ball.betAmount
    }));

    setResult({ win: mult >= 1, message: `×${mult}`, prize, multiplier: mult });
    if (mult >= 2) playSfx(winSound.current);
  }

  // Canvas init & resize
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const resize = () => {
      const parent = canvas.parentElement;
      const w = Math.min(parent.clientWidth, 880);
      const h = Math.max(isWideScreen ? 420 : 380, Math.floor(w * 0.8));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
      buildBoardGeometry(w, h);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [mounted, isWideScreen]);

  // RAF loop
  useEffect(() => {
    if (!mounted) return;
    let running = true;
    lastTsRef.current = performance.now();
    accumulatorRef.current = 0;

    const loop = (ts) => {
      if (!running) return;
      const dtMs = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const frame = Math.min(0.05, dtMs / 1000);
      accumulatorRef.current += frame;
      while (accumulatorRef.current >= FIXED_DT) {
        step(FIXED_DT);
        accumulatorRef.current -= FIXED_DT;
      }
      render();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [mounted]);

  function render() {
    const ctx = ctxRef.current;
    const board = boardRef.current;
    if (!ctx || !board) return;

    const { w, h, left, right, top, bottom, innerWidth, bucketWidth } = board;
    ctx.clearRect(0, 0, w, h);

    const buckets = bucketsRef.current || [];
    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      ctx.fillStyle = i % 2 === 0 ? "rgba(30,58,138,0.24)" : "rgba(6,78,59,0.22)";
      ctx.fillRect(bucket.x + 1, bottom, bucket.width - 2, 18);
    }

    const balls = ballsRef.current;
    for (let p of pegsRef.current) {
      let glow = false;
      for (let b of balls) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy < (p.r + PHYS.ballRadius + 6) ** 2) { glow = true; break; }
      }
      
      ctx.save();
      if (glow) {
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = glow ? "#ffffff" : "#e2e8f0";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let b of balls) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(b.x, b.y, PHYS.ballRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const activeCount = ballsRef.current.length;

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-blue-900 via-black to-indigo-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-blue-900 via-black to-indigo-900" style={{ height: 'var(--app-100vh, 100vh)' }}>
        <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3">
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={backSafe} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              {freePlayTokens > 0 && (<button onClick={() => dropBall(true)} className="relative px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all" title={`${freePlayTokens} Free Play${freePlayTokens > 1 ? 's' : ''} Available`}><span className="text-base">🎁</span><span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{freePlayTokens}</span></button>)}
            </div>
            <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
              <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
            </div>
          </div>
        </div>

        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-16 pt-14 overflow-y-auto" style={{ minHeight: '100%' }}>
          <div className="text-center mb-3"><h1 className="text-3xl md:text-4xl font-extrabold text-white mb-1">🎯 Plinko2</h1><p className="text-white/70 text-sm">Drop balls • Real physics • Win big!</p></div>
          <div className="grid grid-cols-3 gap-2 mb-3 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Vault</div><div className="text-lg font-bold text-emerald-400">{fmt(vault)}</div></div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Bet</div><div className="text-lg font-bold text-amber-400">{fmt(Number(betAmount))}</div></div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center"><div className="text-xs text-white/60 mb-1">Active</div><div className="text-lg font-bold text-blue-400">{activeCount}</div></div>
          </div>

          <div className="mb-3" style={{ minHeight: '140px' }}>
            <div className="bg-black/20 rounded-xl p-4 border border-white/10">
              <canvas ref={canvasRef} className="w-full h-full rounded-lg" style={{ maxHeight: '400px' }} />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.max(MIN_BET, current - 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold">−</button>
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-32 h-12 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold text-sm" min={MIN_BET} />
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold">+</button>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button onClick={() => dropBall(false)} className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg hover:brightness-110 transition-all">🎯 DROP BALL</button>
            <div className="flex gap-2">
              <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
              <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
              <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
            </div>
          </div>
        </div>

        {showResultPopup && result && (<div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"><div className={`${result.win ? 'bg-green-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}><div className="text-4xl mb-2">{result.win ? '🎯' : '💔'}</div><div className="text-2xl font-bold mb-1">{result.win ? 'WINNER!' : 'NO WIN'}</div><div className="text-lg">{result.win ? `+${fmt(result.prize)} MLEO` : `×${result.multiplier}`}</div></div></div>)}

        {menuOpen && (<div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}><div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div><div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div><div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div><div className="mt-4 text-xs opacity-70"><p>Plinko2 v1.0</p></div></div></div>)}

        {showHowToPlay && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">🎯 How to Play</h2><div className="space-y-3 text-sm"><p><strong>1. Set Bet:</strong> Choose your bet amount</p><p><strong>2. Drop Ball:</strong> Click to drop a ball</p><p><strong>3. Watch Physics:</strong> Real gravity and bounces!</p><p><strong>4. Win Prizes:</strong> Land in high multiplier buckets!</p><div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><p className="text-blue-300 font-semibold">Multipliers:</p><div className="text-xs text-white/80 mt-2 space-y-1"><p>• ×10 (Yellow) - Jackpot!</p><p>• ×3 (Green) - Great!</p><p>• ×1.5 (Orange) - Good</p><p>• ×1 (Blue) - Break even</p><p>• ×0.5 (Purple) - Loss</p><p>• ×0.2 (Red) - Big loss</p></div></div></div><button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showStats && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Drops</div><div className="text-xl font-bold">{stats.totalDrops}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Bet</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalBet)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Return Rate</div><div className="text-lg font-bold text-blue-400">{stats.totalDrops > 0 ? `${((stats.totalWon / stats.totalBet) * 100).toFixed(1)}%` : "0%"}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Net Profit</div><div className={`text-lg font-bold ${stats.totalWon - stats.totalBet >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(stats.totalWon - stats.totalBet)}</div></div></div></div><button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showVaultModal && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2><div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center"><div className="text-sm text-white/60 mb-1">Current Balance</div><div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div></div><div className="space-y-4"><div><label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label><div className="flex gap-2 mb-2"><input type="number" value={collectAmount} onChange={(e) => setCollectAmount(Number(e.target.value))} className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white" min="1" max={vault} /><button onClick={() => setCollectAmount(vault)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">MAX</button></div><button onClick={collectToWallet} disabled={collectAmount <= 0 || collectAmount > vault || claiming} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">{claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}</button></div><div className="text-xs text-white/60"><p>• Your vault is shared across all MLEO games</p><p>• Collect earnings to your wallet anytime</p><p>• Network: BSC Testnet (TBNB)</p></div></div><button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}
      </div>
    </Layout>
  );
}
