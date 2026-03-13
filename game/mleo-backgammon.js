// ============================================================================
// MLEO Backgammon - Full-Screen Game Template
// Classic Backgammon vs Bot! Win to earn MLEO!
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

const LS_KEY = "mleo_backgammon_v2";
const MIN_PLAY = 1000;
const WIN_MULTIPLIER = 1.92; // RTP 96% for skill game
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 21;
const MINING_CLAIM_ABI = [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] }];
const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";

function safeRead(key, fallback = {}) { if (typeof window === "undefined") return fallback; try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val) { if (typeof window === "undefined") return; try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function getVault() { const rushData = safeRead("mleo_rush_core_v4", {}); return rushData.vault || 0; }
function setVault(amount) { const rushData = safeRead("mleo_rush_core_v4", {}); rushData.vault = amount; safeWrite("mleo_rush_core_v4", rushData); }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return Math.floor(n).toString(); }
function formatPlayDisplay(n) { const num = Number(n) || 0; if (num >= 1e6) return (num / 1e6).toFixed(num % 1e6 === 0 ? 0 : 2) + "M"; if (num >= 1e3) return (num / 1e3).toFixed(num % 1e3 === 0 ? 0 : 2) + "K"; return num.toString(); }
function shortAddr(addr) { if (!addr || addr.length < 10) return addr || ""; return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }

function rollDice() {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
}

function initBoard() {
  const board = Array(24).fill(0);
  board[0] = -2;   // Bot pieces
  board[5] = 5;    // Player pieces
  board[7] = 3;    // Player pieces
  board[11] = -5;  // Bot pieces
  board[12] = 5;   // Player pieces
  board[16] = -3;  // Bot pieces
  board[18] = -5;  // Bot pieces
  board[23] = 2;   // Player pieces
  return board;
}

function canMove(board, from, steps, playerType) {
  if (board[from] === 0 || Math.sign(board[from]) !== playerType) return false;
  const to = playerType === 1 ? from + steps : from - steps;
  if (to < 0 || to > 23) {
    if (playerType === 1) {
      return from >= 18 && board.slice(18, 24).some((v, i) => v > 0 && 18 + i + steps >= 24);
    } else {
      return from <= 5 && board.slice(0, 6).some((v, i) => v < 0 && i - steps < 0);
    }
  }
  if (to < 0 || to > 23) return false;
  if (board[to] === 0) return true;
  if (Math.sign(board[to]) === playerType) return true;
  return Math.abs(board[to]) === 1;
}

function makeMove(board, from, steps, playerType) {
  const newBoard = [...board];
  const to = playerType === 1 ? from + steps : from - steps;
  
  if (to < 0 || to > 23) {
    newBoard[from] -= playerType;
    return newBoard;
  }
  
  if (newBoard[to] !== 0 && Math.sign(newBoard[to]) !== playerType) {
    newBoard[to] = 0;
  }
  
  newBoard[from] -= playerType;
  newBoard[to] = (newBoard[to] || 0) + playerType;
  
  return newBoard;
}

function getValidMoves(board, dice, playerType) {
  const moves = [];
  for (let i = 0; i < 24; i++) {
    if (canMove(board, i, dice[0], playerType)) {
      moves.push({ from: i, steps: dice[0] });
    }
    if (dice[0] !== dice[1] && canMove(board, i, dice[1], playerType)) {
      moves.push({ from: i, steps: dice[1] });
    }
  }
  return moves;
}

function checkGameOver(board) {
  const playerPieces = board.slice(18, 24).reduce((sum, v) => sum + (v > 0 ? v : 0), 0);
  const botPieces = board.slice(0, 6).reduce((sum, v) => sum + (v < 0 ? Math.abs(v) : 0), 0);
  if (playerPieces === 15) return 'player';
  if (botPieces === 15) return 'bot';
  return null;
}

export default function BackgammonPage() {
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
  const [playAmount, setPlayAmount] = useState("1000");
  const [isEditingPlay, setIsEditingPlay] = useState(false);
  const [board, setBoard] = useState(() => initBoard());
  const [dice, setDice] = useState([1, 1]);
  const [currentPlayer, setCurrentPlayer] = useState('player');
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
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [usedDice, setUsedDice] = useState([]);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0, lastPlay: MIN_PLAY }));

  const playSfx = (sound) => { if (sfxMuted || !sound) return; try { sound.currentTime = 0; sound.play().catch(() => {}); } catch {} };

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    const savedStats = safeRead(LS_KEY, { lastPlay: MIN_PLAY });
    if (savedStats.lastPlay) setPlayAmount(String(savedStats.lastPlay));
    const interval = setInterval(() => { const status = getFreePlayStatus(); setFreePlayTokens(status.tokens); setVaultState(getVault()); }, 2000);
    if (typeof Audio !== "undefined") {
      try { clickSound.current = new Audio(S_CLICK); winSound.current = new Audio(S_WIN); } catch {}
    }
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { clearInterval(interval); document.removeEventListener("fullscreenchange", handleFullscreenChange); };
  }, [router.query]);

  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);
  useEffect(() => { if (!wrapRef.current) return; const calc = () => { const rootH = window.visualViewport?.height ?? window.innerHeight; const safeBottom = Number(getComputedStyle(document.documentElement).getPropertyValue("--satb").replace("px", "")) || 0; const headH = headerRef.current?.offsetHeight || 0; document.documentElement.style.setProperty("--head-h", headH + "px"); const topPad = headH + 8; const used = headH + (metersRef.current?.offsetHeight || 0) + (betRef.current?.offsetHeight || 0) + (ctaRef.current?.offsetHeight || 0) + topPad + 48 + safeBottom + 24; const freeH = Math.max(200, rootH - used); document.documentElement.style.setProperty("--chart-h", freeH + "px"); }; calc(); window.addEventListener("resize", calc); window.visualViewport?.addEventListener("resize", calc); return () => { window.removeEventListener("resize", calc); window.visualViewport?.removeEventListener("resize", calc); }; }, [mounted]);
  useEffect(() => { if (gameResult) { setShowResultPopup(true); const timer = setTimeout(() => setShowResultPopup(false), 4000); return () => clearTimeout(timer); } }, [gameResult]);

  useEffect(() => {
    if (!gameActive || currentPlayer !== 'bot' || gameResult || usedDice.length === 2) return;
    const botDice = rollDice();
    setDice(botDice);
    
    const timeout = setTimeout(() => {
      const moves = getValidMoves(board, botDice, -1);
      if (moves.length > 0) {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        const newBoard = makeMove(board, randomMove.from, randomMove.steps, -1);
        setBoard(newBoard);
        setUsedDice([...usedDice, randomMove.steps]);
        
        const winner = checkGameOver(newBoard);
        if (winner) {
          endGame(winner === 'player');
        } else if (usedDice.length + 1 === 2) {
          setCurrentPlayer('player');
          setUsedDice([]);
          setDice(rollDice());
        }
      } else {
        setCurrentPlayer('player');
        setUsedDice([]);
        setDice(rollDice());
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [gameActive, currentPlayer, board, gameResult, usedDice]);

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
    if (gameActive) return;
    playSfx(clickSound.current);
    const currentVault = getVault();
    let play = Number(playAmount) || MIN_PLAY;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) { play = result.amount; setIsFreePlay(false); router.replace('/backgammon', undefined, { shallow: true }); }
      else { alert('No free play tokens available!'); setIsFreePlay(false); return; }
    } else {
      if (play < MIN_PLAY) { alert(`Minimum play is ${MIN_PLAY} MLEO`); return; }
      if (currentVault < play) { alert('Insufficient MLEO in vault'); return; }
      setVault(currentVault - play); setVaultState(currentVault - play);
    }
    setPlayAmount(String(play));
    setBoard(initBoard());
    setDice(rollDice());
    setSelectedPoint(null);
    setUsedDice([]);
    setCurrentPlayer('player');
    setGameActive(true);
    setGameResult(null);
  };

  function handlePointClick(pointIndex) {
    if (!gameActive || currentPlayer !== 'player' || gameResult) return;
    
    if (selectedPoint === null) {
      if (board[pointIndex] > 0) {
        setSelectedPoint(pointIndex);
        playSfx(clickSound.current);
      }
    } else {
      const availableSteps = dice.filter((d, i) => !usedDice.includes(i));
      for (const step of availableSteps) {
        if (canMove(board, selectedPoint, step, 1)) {
          const to = selectedPoint + step;
          if (to === pointIndex || (to >= 24 && pointIndex >= 18)) {
            const newBoard = makeMove(board, selectedPoint, step, 1);
            setBoard(newBoard);
            setUsedDice([...usedDice, step]);
            setSelectedPoint(null);
            playSfx(clickSound.current);
            
            const winner = checkGameOver(newBoard);
            if (winner) {
              endGame(winner === 'player');
            } else if (usedDice.length + 1 === 2) {
              setCurrentPlayer('bot');
              setUsedDice([]);
              setDice(rollDice());
            }
            return;
          }
        }
      }
      setSelectedPoint(null);
    }
  }

  function endGame(playerWon) {
    const play = Number(playAmount);
    const prize = playerWon ? Math.floor(play * WIN_MULTIPLIER) : 0;
    const win = playerWon;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault); setVaultState(newVault);
      playSfx(winSound.current);
    }

    const resultData = { win, prize, profit: win ? prize - play : -play };
    setGameResult(resultData);
    setGameActive(false);
    setCurrentPlayer(null);

    const newStats = { ...stats, totalGames: stats.totalGames + 1, wins: win ? stats.wins + 1 : stats.wins, losses: win ? stats.losses : stats.losses + 1, totalPlay: stats.totalPlay + play, totalWon: win ? stats.totalWon + prize : stats.totalWon, biggestWin: Math.max(stats.biggestWin, win ? prize : 0), lastPlay: play };
    setStats(newStats);
  }

  const resetGame = () => { setGameResult(null); setShowResultPopup(false); setBoard(initBoard()); setDice([1, 1]); setSelectedPoint(null); setUsedDice([]); setCurrentPlayer('player'); setGameActive(false); };
  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-amber-900 via-black to-yellow-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  const potentialWin = Math.floor(Number(playAmount) * WIN_MULTIPLIER);

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-amber-900 via-black to-yellow-900" style={{ height: '100svh' }}>
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
            <h1 className="text-2xl font-extrabold text-white mb-0.5">🎲 Backgammon</h1>
            <p className="text-white/70 text-xs">Classic Backgammon • Win ×{WIN_MULTIPLIER}!</p>
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
              <div className="text-[10px] text-white/60">Win</div>
              <div className="text-sm font-bold text-green-400">{fmt(potentialWin)}</div>
            </div>
          </div>

          <div className="mb-1 w-full max-w-md flex flex-col items-center justify-center" style={{ height: "var(--chart-h, 350px)" }}>
            <div className="w-full max-w-md bg-gradient-to-b from-amber-900 to-amber-700 rounded-lg p-2 border-4 border-amber-600" style={{ aspectRatio: "1/1", maxHeight: "calc(100% - 32px)" }}>
              {/* Backgammon board with triangular points */}
              <div className="relative h-full w-full">
                {/* Top half - Outer board and Home board (points 13-24) */}
                <div className="absolute top-0 left-0 right-0 h-1/2 flex">
                  {/* Right side - points 19-24 (Home board) */}
                  <div className="w-1/2 flex">
                    {[19, 20, 21, 22, 23, 24].reverse().map((pointIdx) => {
                      const count = board[pointIdx - 1];
                      const isSelected = selectedPoint === pointIdx - 1;
                      const pieces = Math.abs(count);
                      const playerType = count > 0 ? 'player' : count < 0 ? 'bot' : null;
                      const isDark = pointIdx % 2 === 1;
                      
                      return (
                        <button
                          key={`top-right-${pointIdx}`}
                          onClick={() => handlePointClick(pointIdx - 1)}
                          disabled={!gameActive || gameResult || currentPlayer !== 'player'}
                          className={`relative flex-1 ${isDark ? 'bg-amber-800' : 'bg-amber-100'} border-r border-amber-600 transition-all ${
                            isSelected ? 'ring-2 ring-blue-400' : ''
                          } hover:brightness-110 disabled:opacity-50`}
                          style={{
                            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                          }}
                        >
                          {pieces > 0 && (
                            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-0.5">
                              {Array.from({ length: Math.min(pieces, 5) }).map((_, i) => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-full border ${playerType === 'player' ? 'bg-red-600 border-red-800' : 'bg-blue-600 border-blue-800'}`} />
                              ))}
                              {pieces > 5 && <span className="text-[7px] text-white font-bold">+{pieces - 5}</span>}
                            </div>
                          )}
                          <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-[8px] text-white/60">{pointIdx}</span>
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Left side - points 13-18 (Outer board) */}
                  <div className="w-1/2 flex">
                    {[13, 14, 15, 16, 17, 18].map((pointIdx) => {
                      const count = board[pointIdx];
                      const isSelected = selectedPoint === pointIdx;
                      const pieces = Math.abs(count);
                      const playerType = count > 0 ? 'player' : count < 0 ? 'bot' : null;
                      const isDark = pointIdx % 2 === 0;
                      
                      return (
                        <button
                          key={`top-left-${pointIdx}`}
                          onClick={() => handlePointClick(pointIdx)}
                          disabled={!gameActive || gameResult || currentPlayer !== 'player'}
                          className={`relative flex-1 ${isDark ? 'bg-amber-800' : 'bg-amber-100'} border-l border-amber-600 transition-all ${
                            isSelected ? 'ring-2 ring-blue-400' : ''
                          } hover:brightness-110 disabled:opacity-50`}
                          style={{
                            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                          }}
                        >
                          {pieces > 0 && (
                            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-0.5">
                              {Array.from({ length: Math.min(pieces, 5) }).map((_, i) => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-full border ${playerType === 'player' ? 'bg-red-600 border-red-800' : 'bg-blue-600 border-blue-800'}`} />
                              ))}
                              {pieces > 5 && <span className="text-[7px] text-white font-bold">+{pieces - 5}</span>}
                            </div>
                          )}
                          <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-[8px] text-white/60">{pointIdx + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Center bar - Dice display */}
                <div className="absolute top-1/2 left-0 right-0 h-8 -translate-y-1/2 bg-amber-600/90 border-y-2 border-amber-800 flex items-center justify-center z-10">
                  <div className="text-center">
                    <div className="text-xs text-white/90 font-semibold">Dice: {dice[0]} {dice[1]}</div>
                    {usedDice.length > 0 && <div className="text-[10px] text-white/60">Used: {usedDice.join(', ')}</div>}
                  </div>
                </div>
                
                {/* Bottom half - Home board and Outer board (points 1-12) */}
                <div className="absolute bottom-0 left-0 right-0 h-1/2 flex">
                  {/* Left side - points 7-12 (Outer board) */}
                  <div className="w-1/2 flex">
                    {[7, 8, 9, 10, 11, 12].map((pointIdx) => {
                      const count = board[pointIdx];
                      const isSelected = selectedPoint === pointIdx;
                      const pieces = Math.abs(count);
                      const playerType = count > 0 ? 'player' : count < 0 ? 'bot' : null;
                      const isDark = pointIdx % 2 === 0;
                      
                      return (
                        <button
                          key={`bottom-left-${pointIdx}`}
                          onClick={() => handlePointClick(pointIdx)}
                          disabled={!gameActive || gameResult || currentPlayer !== 'player'}
                          className={`relative flex-1 ${isDark ? 'bg-amber-800' : 'bg-amber-100'} border-r border-amber-600 transition-all ${
                            isSelected ? 'ring-2 ring-blue-400' : ''
                          } hover:brightness-110 disabled:opacity-50`}
                          style={{
                            clipPath: 'polygon(0 100%, 100% 100%, 50% 0)',
                          }}
                        >
                          {pieces > 0 && (
                            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex flex-col-reverse items-center gap-0.5">
                              {Array.from({ length: Math.min(pieces, 5) }).map((_, i) => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-full border ${playerType === 'player' ? 'bg-red-600 border-red-800' : 'bg-blue-600 border-blue-800'}`} />
                              ))}
                              {pieces > 5 && <span className="text-[7px] text-white font-bold">+{pieces - 5}</span>}
                            </div>
                          )}
                          <span className="absolute top-0 left-1/2 transform -translate-x-1/2 text-[8px] text-white/60">{pointIdx + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Right side - points 1-6 (Home board) */}
                  <div className="w-1/2 flex">
                    {[1, 2, 3, 4, 5, 6].reverse().map((pointIdx) => {
                      const count = board[pointIdx - 1];
                      const isSelected = selectedPoint === pointIdx - 1;
                      const pieces = Math.abs(count);
                      const playerType = count > 0 ? 'player' : count < 0 ? 'bot' : null;
                      const isDark = pointIdx % 2 === 1;
                      
                      return (
                        <button
                          key={`bottom-right-${pointIdx}`}
                          onClick={() => handlePointClick(pointIdx - 1)}
                          disabled={!gameActive || gameResult || currentPlayer !== 'player'}
                          className={`relative flex-1 ${isDark ? 'bg-amber-800' : 'bg-amber-100'} border-l border-amber-600 transition-all ${
                            isSelected ? 'ring-2 ring-blue-400' : ''
                          } hover:brightness-110 disabled:opacity-50`}
                          style={{
                            clipPath: 'polygon(0 100%, 100% 100%, 50% 0)',
                          }}
                        >
                          {pieces > 0 && (
                            <div className="absolute bottom-1 right-1/2 transform translate-x-1/2 flex flex-col-reverse items-center gap-0.5">
                              {Array.from({ length: Math.min(pieces, 5) }).map((_, i) => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-full border ${playerType === 'player' ? 'bg-red-600 border-red-800' : 'bg-blue-600 border-blue-800'}`} />
                              ))}
                              {pieces > 5 && <span className="text-[7px] text-white font-bold">+{pieces - 5}</span>}
                            </div>
                          )}
                          <span className="absolute top-0 right-1/2 transform translate-x-1/2 text-[8px] text-white/60">{pointIdx}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center mt-2" style={{ height: '28px' }}>
              <div className={`text-base font-bold transition-opacity ${gameResult ? 'opacity-100' : 'opacity-0'} ${gameResult?.win ? 'text-green-400' : 'text-red-400'}`}>
                {gameResult ? (gameResult.win ? 'YOU WIN!' : 'YOU LOSE') : gameActive ? (currentPlayer === 'player' ? 'Your Turn' : 'Bot Thinking...') : 'Ready to Play'}
              </div>
            </div>
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap">
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 1000) : Math.min(vault, current + 1000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">1K</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 10000) : Math.min(vault, current + 10000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">10K</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 100000) : Math.min(vault, current + 100000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">100K</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = current === MIN_PLAY ? Math.min(vault, 1000000) : Math.min(vault, current + 1000000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">1M</button>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = Math.max(MIN_PLAY, current - 1000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">−</button>
            <div className="relative">
              <input type="text" value={isEditingPlay ? playAmount : formatPlayDisplay(playAmount)} onFocus={() => setIsEditingPlay(true)} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setPlayAmount(val || '0'); }} onBlur={() => { setIsEditingPlay(false); const current = Number(playAmount) || MIN_PLAY; setPlayAmount(String(Math.max(MIN_PLAY, current))); }} disabled={gameActive} className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-xs pr-6" />
              <button onClick={() => { setPlayAmount(String(MIN_PLAY)); playSfx(clickSound.current); }} disabled={gameActive} className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs disabled:opacity-50 flex items-center justify-center" title="Reset to minimum play">↺</button>
            </div>
            <button onClick={() => { const current = Number(playAmount) || MIN_PLAY; const newBet = Math.min(vault, current + 1000); setPlayAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameActive} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">+</button>
          </div>

          <div ref={ctaRef} className="flex flex-col gap-3 w-full max-w-sm" style={{ minHeight: '140px' }}>
            <button onClick={gameResult ? resetGame : () => startGame(false)} disabled={gameActive} className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50">{gameResult ? "PLAY AGAIN" : gameActive ? "GAME IN PROGRESS" : "START GAME"}</button>
            <div className="flex gap-2">
              <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
              <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
              <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
            </div>
          </div>
        </div>

        {showResultPopup && gameResult && (<div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"><div className={`${gameResult.win ? 'bg-green-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}><div className="text-4xl mb-2">{gameResult.win ? '🎉' : '😔'}</div><div className="text-2xl font-bold mb-1">{gameResult.win ? 'YOU WIN!' : 'YOU LOSE'}</div><div className="text-lg">{gameResult.win ? `+${fmt(gameResult.prize)} MLEO` : `-${fmt(Math.abs(gameResult.profit))} MLEO`}</div></div></div>)}

        {menuOpen && (<div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}><div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div><div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div><div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div><div className="mt-4 text-xs opacity-70"><p>Backgammon v2.0</p></div></div></div>)}

        {showHowToPlay && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">🎲 How to Play</h2><div className="space-y-3 text-sm"><p><strong>1. Place Play:</strong> Min {MIN_PLAY} MLEO</p><p><strong>2. Start Game:</strong> Click "START GAME" to begin</p><p><strong>3. Move Pieces:</strong> Click your point, then click destination</p><p><strong>4. Win:</strong> Bear off all your pieces first!</p><div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3"><p className="text-amber-300 font-semibold mb-2">💰 Win Rewards:</p><div className="text-xs text-white/80 space-y-1"><p>• Win the game: ×{WIN_MULTIPLIER}</p><p>• Lose: Lose your play amount</p><p>• Move pieces based on dice rolls!</p></div></div><div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 mt-2"><p className="text-blue-300 font-semibold text-xs">💡 Tip: Bear off pieces from your home board!</p></div></div><button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showStats && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Games</div><div className="text-xl font-bold">{stats.totalGames}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Win Rate</div><div className="text-xl font-bold text-green-400">{stats.totalGames > 0 ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : 0}%</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Play</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalPlay)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Net Profit</div><div className={`text-lg font-bold ${stats.totalWon - stats.totalPlay >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(stats.totalWon - stats.totalPlay)}</div></div></div></div><button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showVaultModal && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2><div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center"><div className="text-sm text-white/60 mb-1">Current Balance</div><div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div></div><div className="space-y-4"><div><label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label><div className="flex gap-2 mb-2"><input type="number" value={collectAmount} onChange={(e) => setCollectAmount(Number(e.target.value))} className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white" min="1" max={vault} /><button onClick={() => setCollectAmount(vault)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">MAX</button></div><button onClick={collectToWallet} disabled={collectAmount <= 0 || collectAmount > vault || claiming} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">{claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}</button></div><div className="text-xs text-white/60"><p>• Your vault is shared across all MLEO games</p><p>• Collect earnings to your wallet anytime</p><p>• Network: BSC Testnet (TBNB)</p></div></div><button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}
      </div>
    </Layout>
  );
}
