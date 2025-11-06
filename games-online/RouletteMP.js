// Roulette Multiplayer - European Roulette (0-36)
// Aligned with PokerMP/BlackjackMP patterns

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";

// ===== Config =====
const BETTING_SECONDS = Number(process.env.NEXT_PUBLIC_ROULETTE_BETTING_SECONDS || 30);
const SPINNING_SECONDS = 5;
const RESULTS_SECONDS = 5; // Show result for 5 seconds
const MIN_BET = 100;

// European Roulette numbers (0-36)
const ROULETTE_NUMBERS = [
  { num: 0, color: 'green', row: 0 },
  { num: 32, color: 'red', row: 0 }, { num: 15, color: 'black', row: 0 }, { num: 19, color: 'red', row: 0 },
  { num: 4, color: 'black', row: 0 }, { num: 21, color: 'red', row: 0 }, { num: 2, color: 'black', row: 0 },
  { num: 25, color: 'red', row: 0 }, { num: 17, color: 'black', row: 0 }, { num: 34, color: 'red', row: 0 },
  { num: 6, color: 'black', row: 0 }, { num: 27, color: 'red', row: 0 }, { num: 13, color: 'black', row: 0 },
  { num: 36, color: 'red', row: 0 }, { num: 11, color: 'black', row: 0 }, { num: 30, color: 'red', row: 0 },
  { num: 8, color: 'black', row: 0 }, { num: 23, color: 'red', row: 0 }, { num: 10, color: 'black', row: 0 },
  { num: 5, color: 'red', row: 0 }, { num: 24, color: 'black', row: 0 }, { num: 16, color: 'red', row: 0 },
  { num: 33, color: 'black', row: 0 }, { num: 1, color: 'red', row: 0 }, { num: 20, color: 'black', row: 0 },
  { num: 14, color: 'red', row: 0 }, { num: 31, color: 'black', row: 0 }, { num: 9, color: 'red', row: 0 },
  { num: 22, color: 'black', row: 0 }, { num: 18, color: 'red', row: 0 }, { num: 29, color: 'black', row: 0 },
  { num: 7, color: 'red', row: 0 }, { num: 28, color: 'black', row: 0 }, { num: 12, color: 'red', row: 0 },
  { num: 35, color: 'black', row: 0 }, { num: 3, color: 'red', row: 0 }, { num: 26, color: 'black', row: 0 }
];

// Helper functions
function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function readVault() {
  const rush = safeRead("mleo_rush_core_v4", {});
  return Math.max(0, Number(rush.vault || 0));
}

function writeVault(v) {
  const rush = safeRead("mleo_rush_core_v4", {});
  rush.vault = Math.max(0, Math.floor(v));
  safeWrite("mleo_rush_core_v4", rush);
  if (window.updateVaultCallback) window.updateVaultCallback(rush.vault);
}

function fmt(n) {
  n = Math.floor(Number(n || 0));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
}

// Get color for a number
function getColor(num) {
  const entry = ROULETTE_NUMBERS.find(n => n.num === num);
  return entry?.color || 'green';
}

// Check if bet wins
function checkBetWin(betType, betValue, result) {
  const resultColor = getColor(result);
  
  switch (betType) {
    case 'number':
      return parseInt(betValue) === result;
    case 'red':
      return resultColor === 'red';
    case 'black':
      return resultColor === 'black';
    case 'even':
      return result !== 0 && result % 2 === 0;
    case 'odd':
      return result !== 0 && result % 2 === 1;
    case 'low':
      return result >= 1 && result <= 18;
    case 'high':
      return result >= 19 && result <= 36;
    case 'dozen1':
      return result >= 1 && result <= 12;
    case 'dozen2':
      return result >= 13 && result <= 24;
    case 'dozen3':
      return result >= 25 && result <= 36;
    case 'column1':
      return [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(result);
    case 'column2':
      return [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(result);
    case 'column3':
      return [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(result);
    default:
      return false;
  }
}

// Get payout multiplier
function getPayoutMultiplier(betType) {
  switch (betType) {
    case 'number':
      return 35;
    case 'red':
    case 'black':
    case 'even':
    case 'odd':
    case 'low':
    case 'high':
      return 2;
    case 'dozen1':
    case 'dozen2':
    case 'dozen3':
    case 'column1':
    case 'column2':
    case 'column3':
      return 3;
    default:
      return 1;
  }
}

export default function RouletteMP({ roomId, playerName, vault, setVaultBoth }) {
  useEffect(() => {
    window.updateVaultCallback = setVaultBoth;
    return () => {
      delete window.updateVaultCallback;
    };
  }, [setVaultBoth]);

  const name = playerName || "Guest";
  const clientId = useMemo(() => getClientId(), []);
  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [bets, setBets] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");
  const [selectedBet, setSelectedBet] = useState(null);
  const [betAmount, setBetAmount] = useState(MIN_BET);
  const [spinAngle, setSpinAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showBetPanel, setShowBetPanel] = useState(false);
  const [bettingTimeLeft, setBettingTimeLeft] = useState(0);
  const timerRef = useRef(null);

  // Leader detection
  const isLeader = useMemo(() => {
    if (!roomMembers.length || !name) return false;
    const sorted = [...roomMembers].sort((a, b) => (a.player_name || '').localeCompare(b.player_name || ''));
    return sorted[0]?.player_name === name;
  }, [roomMembers, name]);

  // My player row
  const myRow = players.find(p => p.client_id === clientId) || null;
  
  // My bets - sorted and memoized
  // Show bets from current spin, or keep previous spin bets until new betting starts
  const myBets = useMemo(() => {
    if (!myRow?.id) return [];
    
    // Get bets for current player
    const arr = bets.filter(b => b.player_id === myRow.id) || [];
    
    // If in betting stage, only show unresolved bets (active bets)
    // Otherwise, show all bets (to show results from previous spin)
    const filteredBets = session?.stage === "betting" 
      ? arr.filter(b => b.is_winner === null)
      : arr; // Keep all bets during results/spinning/lobby to show winners/losers
    
    filteredBets.sort((a, b) => {
      // Sort by: unresolved first, then by type
      if (a.is_winner === null && b.is_winner !== null) return -1;
      if (a.is_winner !== null && b.is_winner === null) return 1;
      return (a.bet_type + a.bet_value).localeCompare(b.bet_type + b.bet_value);
    });
    
    return filteredBets;
  }, [bets, myRow?.id, session?.stage]);

  // Auto-open bet panel when betting stage starts
  useEffect(() => {
    if (session?.stage === "betting") {
      setShowBetPanel(true);
    } else if (session?.stage !== "betting") {
      // Keep panel open during spinning/results, close only when in lobby
      if (session?.stage === "lobby") {
        setShowBetPanel(false);
      }
    }
  }, [session?.stage]);

  // ===== Channel: Sessions per room =====
  useEffect(() => {
    if (!roomId) return;

    const ch = supabase
      .channel("roulette_sessions:" + roomId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roulette_sessions",
        filter: `room_id=eq.${roomId}`,
      }, async () => {
        const { data } = await supabase
          .from("roulette_sessions")
          .select("*")
          .eq("room_id", roomId)
          .maybeSingle();
        setSession(data || null);
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          const { data } = await supabase
            .from("roulette_sessions")
            .select("*")
            .eq("room_id", roomId)
            .maybeSingle();
          setSession(data || null);
          await ch.track({
            player_name: name,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => ch.unsubscribe();
  }, [roomId, name]);

  // ===== Channel: Players per session =====
  useEffect(() => {
    if (!session?.id) return;

    const ch = supabase
      .channel("roulette_players:" + session.id)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roulette_players",
        filter: `session_id=eq.${session.id}`,
      }, async () => {
        const { data } = await supabase
          .from("roulette_players")
          .select("*")
          .eq("session_id", session.id);
        setPlayers(data || []);
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          const { data } = await supabase
            .from("roulette_players")
            .select("*")
            .eq("session_id", session.id);
          setPlayers(data || []);
        }
      });

    return () => ch.unsubscribe();
  }, [session?.id]);

  // ===== Channel: Bets per session =====
  useEffect(() => {
    if (!session?.id) return;

    const ch = supabase
      .channel("roulette_bets:" + session.id)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roulette_bets",
        filter: `session_id=eq.${session.id}`,
      }, async () => {
        // Get bets for current spin only (same spin_number as session)
        // Keep bets from previous spin until new betting starts
        const { data } = await supabase
          .from("roulette_bets")
          .select("*")
          .eq("session_id", session.id)
          .order("created_at", { ascending: false });
        setBets(data || []);
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          const { data } = await supabase
            .from("roulette_bets")
            .select("*")
            .eq("session_id", session.id)
            .order("created_at", { ascending: false });
          setBets(data || []);
        }
      });

    return () => ch.unsubscribe();
  }, [session?.id]);

  // ===== Ensure session =====
  async function ensureRouletteSession(roomId) {
    const { data: existing } = await supabase
      .from("roulette_sessions")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (existing) return existing;

    const { data: created, error } = await supabase
      .from("roulette_sessions")
      .insert({
        room_id: roomId,
        stage: "lobby",
        spin_number: 0,
        betting_deadline: null,
        spin_result: null,
        spin_color: null,
        total_bets: 0,
        total_payouts: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return created;
  }

  // ===== Join/Leave =====
  const joinGameBusyRef = useRef(false);
  
  async function joinGame() {
    // Guard against concurrent calls
    if (joinGameBusyRef.current) return;
    joinGameBusyRef.current = true;
    
    try {
      if (!clientId) {
        setMsg("Client not recognized");
        return;
      }

      let sess = session;
      if (!sess || !sess.id) {
        sess = await ensureRouletteSession(roomId);
        setSession(sess);
      }

      // Use upsert to handle conflicts gracefully
      const { error } = await supabase
        .from("roulette_players")
        .upsert(
          {
            session_id: sess.id,
            player_name: name,
            client_id: clientId,
            balance: 0,
            total_bet: 0,
            total_won: 0,
          },
          { onConflict: "session_id,client_id", ignoreDuplicates: false }
        );

      if (error) {
        setMsg(error.message);
        return;
      }
      setMsg("");
    } finally {
      joinGameBusyRef.current = false;
    }
  }

  async function leaveGame() {
    if (!myRow) return;
    await supabase.from("roulette_players").delete().eq("id", myRow.id);
  }

  // ===== Start round =====
  async function startRound() {
    if (!isLeader) return;
    if (!session?.id) return;

    const deadline = new Date(Date.now() + BETTING_SECONDS * 1000).toISOString();

    // Clear old resolved bets before starting new round
    await supabase
      .from("roulette_bets")
      .delete()
      .eq("session_id", session.id)
      .not("is_winner", "is", null);

    // Reset player bets first
    await supabase
      .from("roulette_players")
      .update({ total_bet: 0, total_won: 0 })
      .eq("session_id", session.id);

    const { data, error } = await supabase
      .from("roulette_sessions")
      .update({
        stage: "betting",
        betting_deadline: deadline,
        spin_result: null,
        spin_color: null,
        spin_number: (session.spin_number || 0) + 1,
        total_bets: 0,
        total_payouts: 0,
      })
      .eq("id", session.id)
      .select()
      .single();

    if (!error && data) {
      setSession(data);
    }
  }

  // ===== Auto-start first round =====
  useEffect(() => {
    if (!session?.id || !isLeader) return;
    if (session.stage === "lobby" && (session.spin_number || 0) === 0) {
      // Auto-start first round when in lobby and no spins yet
      const timer = setTimeout(async () => {
        const deadline = new Date(Date.now() + BETTING_SECONDS * 1000).toISOString();

        // Clear any old resolved bets before starting
        await supabase
          .from("roulette_bets")
          .delete()
          .eq("session_id", session.id)
          .not("is_winner", "is", null);

        // Reset player bets first
        await supabase
          .from("roulette_players")
          .update({ total_bet: 0, total_won: 0 })
          .eq("session_id", session.id);

        const { data, error } = await supabase
          .from("roulette_sessions")
          .update({
            stage: "betting",
            betting_deadline: deadline,
            spin_result: null,
            spin_color: null,
            spin_number: 1,
            total_bets: 0,
            total_payouts: 0,
          })
          .eq("id", session.id)
          .select()
          .single();

        if (!error && data) {
          setSession(data);
        }
      }, 1000); // Small delay to ensure session is loaded
      return () => clearTimeout(timer);
    }
  }, [session?.id, session?.stage, session?.spin_number, isLeader]);

  // ===== Place bet =====
  async function placeBet(betType, betValue) {
    // Ensure session exists
    let sess = session;
    if (!sess || !sess.id) {
      sess = await ensureRouletteSession(roomId);
      setSession(sess);
    }
    
    let currentPlayer = myRow;
    
    // Auto-join if needed
    if (!currentPlayer) {
      await joinGame();
      // Wait a bit and refresh players list
      await new Promise(resolve => setTimeout(resolve, 300));
      const { data: refreshedPlayers } = await supabase
        .from("roulette_players")
        .select("*")
        .eq("session_id", sess.id);
      if (refreshedPlayers) {
        setPlayers(refreshedPlayers);
        currentPlayer = refreshedPlayers.find(p => p.client_id === clientId);
      }
      if (!currentPlayer) {
        setMsg("Join failed. Try again.");
        return;
      }
    }

    // Double-check we have a player
    if (!currentPlayer) {
      setMsg("Join the game first");
      return;
    }

    if (sess.stage !== "betting") {
      setMsg("Betting is closed");
      return;
    }

    const amount = Math.floor(Number(betAmount));
    if (amount < MIN_BET) {
      setMsg(`Minimum bet is ${MIN_BET}`);
      return;
    }

    if (amount > readVault()) {
      setMsg("Insufficient vault balance");
      return;
    }

    const multiplier = getPayoutMultiplier(betType);

    const currentPlayerId = currentPlayer.id;

    const { error } = await supabase.from("roulette_bets").insert({
      session_id: sess.id,
      player_id: currentPlayerId,
      bet_type: betType,
      bet_value: String(betValue),
      amount: amount,
      payout_multiplier: multiplier,
      is_winner: null,
      payout_amount: null,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    // Update player balance
    const { data: updatedPlayer } = await supabase
      .from("roulette_players")
      .update({ total_bet: (currentPlayer.total_bet || 0) + amount })
      .eq("id", currentPlayerId)
      .select()
      .single();

    // Update session total bets (with select to ensure return representation)
    await supabase
      .from("roulette_sessions")
      .update({ total_bets: (sess.total_bets || 0) + amount })
      .eq("id", sess.id)
      .select()
      .single();

    // Deduct from vault
    const v = readVault();
    writeVault(v - amount);

    setMsg("");
  }

  // ===== Spin wheel =====
  const spinningRef = useRef(false);
  
  async function spinWheel() {
    if (!isLeader) return;
    if (session?.stage !== "betting") return;
    
    // Guard against concurrent spins
    if (spinningRef.current) return;
    spinningRef.current = true;
    
    try {
      // Close betting
      await supabase
        .from("roulette_sessions")
        .update({ stage: "spinning", betting_deadline: null })
        .eq("id", session.id);

    // Generate random number (0-36)
    const result = Math.floor(Math.random() * 37);
    const color = getColor(result);

    // Animate spin
    setIsSpinning(true);
    const spins = 5 + Math.random() * 5; // 5-10 full rotations
    const finalAngle = spins * 360 + (result * (360 / 37));
    setSpinAngle(finalAngle);

    setTimeout(async () => {
      setIsSpinning(false);

      // Update session with result
      const { data: updatedSession, error: sessionError } = await supabase
        .from("roulette_sessions")
        .update({
          stage: "results",
          spin_result: result,
          spin_color: color,
        })
        .eq("id", session.id)
        .select()
        .single();

      if (sessionError) return;

      setSession(updatedSession);

      // Calculate payouts
      await calculatePayouts(result, color, updatedSession.id);

      // Save spin to history
      await supabase.from("roulette_spins").insert({
        session_id: updatedSession.id,
        spin_number: updatedSession.spin_number,
        result: result,
        color: color,
        total_bets: updatedSession.total_bets || 0,
        total_payouts: updatedSession.total_payouts || 0,
      });

      // Move to results stage, then immediately start countdown for next round
      setTimeout(async () => {
        // After results display, immediately start next betting round
        if (isLeader) {
          const deadline = new Date(Date.now() + BETTING_SECONDS * 1000).toISOString();
          
          // Clear old resolved bets before starting new round (keep bets visible during results)
          await supabase
            .from("roulette_bets")
            .delete()
            .eq("session_id", updatedSession.id)
            .not("is_winner", "is", null); // Delete only resolved bets
          
          // Reset player bets
          await supabase
            .from("roulette_players")
            .update({ total_bet: 0, total_won: 0 })
            .eq("session_id", updatedSession.id);
          
          // Start betting stage immediately (with 30 second countdown)
          const { data: newSession } = await supabase
            .from("roulette_sessions")
            .update({
              stage: "betting",
              betting_deadline: deadline,
              spin_result: null,
              spin_color: null,
              spin_number: (updatedSession.spin_number || 0) + 1,
              total_bets: 0,
              total_payouts: 0,
            })
            .eq("id", updatedSession.id)
            .select()
            .single();
          
          if (newSession) {
            setSession(newSession);
            // Don't clear bets list - let the channel refresh it
          }
        } else {
          // For non-leaders, just update stage (bets will be cleared when leader starts new round)
          await supabase
            .from("roulette_sessions")
            .update({ stage: "betting", spin_result: null, spin_color: null })
            .eq("id", updatedSession.id);
        }
        
        // Reset spinning flag
        spinningRef.current = false;
      }, RESULTS_SECONDS * 1000);
    }, SPINNING_SECONDS * 1000);
    } catch (error) {
      // On error, reset immediately
      spinningRef.current = false;
      console.error("Spin error:", error);
    }
  }

  // ===== Calculate payouts =====
  async function calculatePayouts(result, color, sessionId) {
    // Get all active bets
    const { data: activeBets } = await supabase
      .from("roulette_bets")
      .select("*")
      .eq("session_id", sessionId)
      .is("is_winner", null);

    if (!activeBets || activeBets.length === 0) return;

    let totalPayouts = 0;

    for (const bet of activeBets) {
      const isWinner = checkBetWin(bet.bet_type, bet.bet_value, result);
      const payout = isWinner ? Math.floor(bet.amount * bet.payout_multiplier) : 0;

      await supabase
        .from("roulette_bets")
        .update({
          is_winner: isWinner,
          payout_amount: payout,
        })
        .eq("id", bet.id);

      if (isWinner && payout > 0) {
        // Update player balance
        const { data: player } = await supabase
          .from("roulette_players")
          .select("balance, total_won, client_id")
          .eq("id", bet.player_id)
          .single();

        if (player) {
          const newBalance = (player.balance || 0) + payout;
          await supabase
            .from("roulette_players")
            .update({
              balance: newBalance,
              total_won: (player.total_won || 0) + payout,
            })
            .eq("id", bet.player_id);

          // Add to vault if it's the current player
          if (player.client_id === clientId) {
            const v = readVault();
            writeVault(v + payout);
          }
        }

        totalPayouts += payout;
      }
    }

    // Update session totals
    const { data: updatedSession } = await supabase
      .from("roulette_sessions")
      .update({ total_payouts: totalPayouts })
      .eq("id", sessionId)
      .select()
      .single();
    
    if (updatedSession) {
      setSession(updatedSession);
    }

    // Refresh bets list - keep all bets (including resolved) to show results
    const { data: refreshedBets } = await supabase
      .from("roulette_bets")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    setBets(refreshedBets || []);

    // Refresh players to get updated balances
    const { data: refreshedPlayers } = await supabase
      .from("roulette_players")
      .select("*")
      .eq("session_id", sessionId);
    setPlayers(refreshedPlayers || []);
  }

  // ===== Timer - Smooth countdown =====
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Update timer immediately
    if (session?.betting_deadline && session.stage === "betting") {
      const updateTimer = () => {
        const now = Date.now();
        const deadline = new Date(session.betting_deadline).getTime();
        const timeLeft = Math.max(0, Math.floor((deadline - now) / 1000));
        setBettingTimeLeft(timeLeft);
        
        if (timeLeft <= 0) {
          // Auto-spin if leader (automatic)
          if (isLeader) {
            spinWheel();
          }
          clearInterval(timerRef.current);
        }
      };
      
      // Update immediately
      updateTimer();
      
      // Then update every second
      timerRef.current = setInterval(updateTimer, 1000);
    } else if (session?.stage === "results") {
      // Clear timer during results
      setBettingTimeLeft(0);
    } else {
      setBettingTimeLeft(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.betting_deadline, session?.stage, isLeader]);

  // ===== UI =====
  if (!roomId)
    return (
      <div className="w-full h-full flex items-center justify-center text-white/70">
        Select or create a room.
      </div>
    );

  const isBetting = session?.stage === "betting";
  const isSpinningStage = session?.stage === "spinning";
  const isResults = session?.stage === "results";
  const canBet = isBetting && myRow && bettingTimeLeft > 0;

  return (
    <div className="w-full h-full flex flex-col p-2 gap-2">
      {/* Header */}
      <div className="flex items-center justify-between bg-white/5 rounded-xl p-2 border border-white/10">
        <div className="text-white font-bold text-lg">🎰 Roulette</div>
        <div className="flex items-center gap-2 text-white/80 text-sm">
          <span>💰 {fmt(readVault())}</span>
          {myRow && <span>Balance: {fmt(myRow.balance || 0)}</span>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-2 overflow-auto">
        {/* Game Board */}
        <div className="flex-1 flex flex-col gap-2">
              {/* Roulette Wheel */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center justify-center gap-4">
                  {/* Wheel */}
                  <div className="relative w-64 h-64">
                    {/* Wheel background with gradient */}
                    <div
                      className="absolute inset-0 rounded-full border-4 border-white/20"
                      style={{
                        background: "conic-gradient(" +
                          ROULETTE_NUMBERS.map((n, i) => {
                            const c = n.color === 'red' ? '#dc2626' : n.color === 'black' ? '#1f2937' : '#059669';
                            const a0 = (i / ROULETTE_NUMBERS.length) * 360;
                            const a1 = ((i + 1) / ROULETTE_NUMBERS.length) * 360;
                            return `${c} ${a0}deg ${a1}deg`;
                          }).join(", ") + ")",
                        transform: `rotate(${spinAngle}deg)`,
                        transition: isSpinning ? "transform 5s cubic-bezier(0.25,0.1,0.25,1)" : "none",
                      }}
                    />
                    
                    {/* Numbers overlay - positioned on outer edge, counter-rotate to stay upright */}
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        transform: `rotate(${spinAngle}deg)`,
                        transition: isSpinning ? "transform 5s cubic-bezier(0.25,0.1,0.25,1)" : "none",
                      }}
                    >
                      {ROULETTE_NUMBERS.map((n, i) => {
                        // Calculate angle for this number slot (center of segment)
                        const segmentSize = 360 / ROULETTE_NUMBERS.length;
                        const segmentAngle = i * segmentSize;
                        const centerAngle = segmentAngle + (segmentSize / 2);
                        
                        // Convert to radians, adjust for starting at top (-90 degrees)
                        const angleRad = (centerAngle - 90) * (Math.PI / 180);
                        
                        // Position at outer edge
                        const radiusPx = 120;
                        const centerPx = 128; // Half of 256px
                        
                        const x = centerPx + radiusPx * Math.cos(angleRad);
                        const y = centerPx + radiusPx * Math.sin(angleRad);
                        
                        return (
                          <div
                            key={`num-${n.num}-${i}`}
                            className="absolute flex items-center justify-center text-white text-[9px] font-bold"
                            style={{
                              left: `${x}px`,
                              top: `${y}px`,
                              transform: `translate(-50%, -50%) rotate(-${spinAngle}deg)`,
                              transition: isSpinning ? "transform 5s cubic-bezier(0.25,0.1,0.25,1)" : "none",
                              color: n.color === 'red' ? '#ffcccc' : n.color === 'black' ? '#ffffff' : '#90ee90',
                              textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                              zIndex: 20,
                            }}
                          >
                            {n.num}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Center Display - Result in center of wheel */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-32 h-32 rounded-full bg-black/80 border-4 border-white/30 flex flex-col items-center justify-center shadow-2xl">
                        {isResults && session?.spin_result !== null ? (
                          <>
                            <div className="text-5xl font-bold mb-1" style={{
                              color: session.spin_color === 'red' ? '#dc2626' : 
                                     session.spin_color === 'black' ? '#ffffff' : 
                                     '#059669'
                            }}>
                              {session.spin_result}
                            </div>
                            <div 
                              className="text-xs font-semibold px-3 py-1 rounded-full"
                              style={{
                                backgroundColor: session.spin_color === 'red' ? '#dc2626' : 
                                                session.spin_color === 'black' ? '#1f2937' : 
                                                '#059669',
                                color: '#ffffff'
                              }}
                            >
                              {session.spin_color?.toUpperCase() || ''}
                            </div>
                          </>
                        ) : isSpinningStage ? (
                          <div className="text-yellow-400 text-3xl animate-pulse">🎰</div>
                        ) : isBetting && bettingTimeLeft > 0 ? (
                          <>
                            <div className="text-white/60 text-xs mb-1">Time Left</div>
                            <div className="text-3xl font-bold text-white tabular-nums">{bettingTimeLeft}</div>
                          </>
                        ) : (
                          <div className="text-white/40 text-sm">Ready</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Pointer */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[20px] border-transparent border-t-yellow-400 z-10"></div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-2">
                {isBetting && (
                  <button
                    onClick={() => setShowBetPanel(!showBetPanel)}
                    className={`px-6 py-3 rounded-lg text-white font-bold transition-all ${
                      showBetPanel
                        ? 'bg-purple-600/80 hover:bg-purple-600'
                        : 'bg-blue-600/80 hover:bg-blue-600'
                    }`}
                  >
                    {showBetPanel ? 'HIDE BETS' : 'SHOW BETS'}
                  </button>
                )}
                {!myRow ? (
                  <button
                    onClick={joinGame}
                    className="px-4 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white font-semibold"
                  >
                    JOIN
                  </button>
                ) : (
                  <button
                    onClick={leaveGame}
                    className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white font-semibold"
                  >
                    LEAVE
                  </button>
                )}
              </div>

              {/* My Bets - Always visible */}
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <div className="text-white font-bold text-sm mb-2 text-center">My Bets</div>
                {myBets.length > 0 ? (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {myBets.map((bet) => {
                      // Determine if bet is winner, loser, or pending
                      const isWinner = bet.is_winner === true;
                      const isLoser = bet.is_winner === false;
                      const isPending = bet.is_winner === null;
                      
                      // Color based on result
                      const bgColor = isWinner 
                        ? 'bg-green-600/80 border-green-400' 
                        : isLoser 
                        ? 'bg-red-600/80 border-red-400' 
                        : 'bg-white/10 border-white/20';
                      
                      const textColor = isWinner 
                        ? 'text-green-100' 
                        : isLoser 
                        ? 'text-red-100' 
                        : 'text-white';
                      
                      return (
                        <div
                          key={bet.id}
                          className={`px-3 py-1.5 rounded ${bgColor} ${textColor} text-xs sm:text-sm border`}
                        >
                          <span className="font-semibold">
                            {bet.bet_type === 'number' ? `#${bet.bet_value}` : 
                             bet.bet_type === 'red' ? 'RED' :
                             bet.bet_type === 'black' ? 'BLACK' :
                             bet.bet_type === 'even' ? 'EVEN' :
                             bet.bet_type === 'odd' ? 'ODD' :
                             bet.bet_type === 'low' ? '1-18' :
                             bet.bet_type === 'high' ? '19-36' :
                             bet.bet_type === 'dozen1' ? '1st 12' :
                             bet.bet_type === 'dozen2' ? '2nd 12' :
                             bet.bet_type === 'dozen3' ? '3rd 12' :
                             bet.bet_type === 'column1' ? 'Col 1' :
                             bet.bet_type === 'column2' ? 'Col 2' :
                             bet.bet_type === 'column3' ? 'Col 3' :
                             bet.bet_type}
                          </span>
                          <span className={`ml-1 ${isPending ? 'text-yellow-400' : isWinner ? 'text-green-100' : 'text-red-100'}`}>
                            {fmt(bet.amount)}
                          </span>
                          {isWinner && bet.payout_amount > 0 && (
                            <span className="ml-1 text-green-200">+{fmt(bet.payout_amount)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-white/40 text-xs text-center py-2">No bets placed</div>
                )}
              </div>
            </div>
        
        {msg && (
          <div className="text-center">
            <div className="inline-block bg-amber-900/60 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-lg text-sm">
              {msg}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bet Panel - Bottom Sheet */}
      {showBetPanel && (
        <>
          {/* Backdrop - Only on mobile */}
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setShowBetPanel(false)}
          />
          
          {/* Bet Panel */}
          <div
            className="fixed bottom-0 left-1/2 -translate-x-1/2 bg-gradient-to-t from-zinc-900 via-zinc-800 to-zinc-900 border-t-2 border-white/20 rounded-t-2xl shadow-2xl z-50 transition-transform duration-300"
            style={{
              maxHeight: '80vh',
              maxWidth: '65vw',
              width: '100%',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.8)'
            }}
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div
                className="w-12 h-1 bg-white/30 rounded-full cursor-pointer"
                onClick={() => setShowBetPanel(false)}
              />
            </div>

            {/* Panel Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="text-white font-bold text-lg">Place Your Bet</div>
              {isBetting && bettingTimeLeft > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-white/60 text-sm">Time:</div>
                  <div className="text-yellow-400 font-bold text-lg tabular-nums">{bettingTimeLeft}</div>
                </div>
              )}
              <button
                onClick={() => setShowBetPanel(false)}
                className="text-white/60 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Panel Content - Scrollable */}
            <div className="overflow-y-auto p-3 md:p-4" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {/* Bet Amount Controls */}
              <div className="flex items-center gap-2 mb-4 flex-wrap" style={{ width: '50%', marginLeft: 'auto', marginRight: 'auto' }}>
                <button
                  onClick={() => setBetAmount(a => Math.max(MIN_BET, Math.floor((a || MIN_BET) - MIN_BET)))}
                  disabled={!canBet}
                  className="px-3 py-2 rounded bg-white/10 text-white text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  −
                </button>
                
                <input
                  type="number"
                  min={MIN_BET}
                  step={MIN_BET}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Math.max(MIN_BET, parseInt(e.target.value) || MIN_BET))}
                  disabled={!canBet}
                  className="flex-1 min-w-[80px] max-w-[120px] px-3 py-2 rounded bg-white/10 text-white border border-white/20 text-center disabled:opacity-40 disabled:cursor-not-allowed"
                />
                
                <button
                  onClick={() => setBetAmount(a => Math.max(MIN_BET, Math.floor((a || MIN_BET) + MIN_BET)))}
                  disabled={!canBet}
                  className="px-3 py-2 rounded bg-white/10 text-white text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +
                </button>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <button 
                    onClick={() => setBetAmount(MIN_BET)} 
                    disabled={!canBet}
                    className="px-3 py-2 rounded bg-white/10 text-white text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Min
                  </button>
                  <button 
                    onClick={() => setBetAmount(Math.max(MIN_BET, Math.floor(readVault() / 20)))} 
                    disabled={!canBet}
                    className="px-3 py-2 rounded bg-white/10 text-white text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    5%
                  </button>
                  <button 
                    onClick={() => setBetAmount(Math.max(MIN_BET, Math.floor(readVault() / 10)))} 
                    disabled={!canBet}
                    className="px-3 py-2 rounded bg-white/10 text-white text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    10%
                  </button>
                  <button 
                    onClick={() => setBetAmount(Math.max(MIN_BET, Math.floor(readVault() / 4)))} 
                    disabled={!canBet}
                    className="px-3 py-2 rounded bg-white/10 text-white text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    25%
                  </button>
                </div>
              </div>

              {!canBet && (
                <div className="text-white/60 text-sm mb-3 text-center">
                  {!myRow ? "Join the game to bet." :
                    session?.stage !== "betting" ? "Waiting for betting stage..." :
                    "Betting closed."}
                </div>
              )}

              {/* Outside Bets */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
                  <button
                    onClick={() => placeBet('red', 'red')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    RED (2x)
                  </button>
                  <button
                    onClick={() => placeBet('black', 'black')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-gray-900 hover:bg-gray-800 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    BLACK (2x)
                  </button>
                  <button
                    onClick={() => placeBet('even', 'even')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    EVEN (2x)
                  </button>
                  <button
                    onClick={() => placeBet('odd', 'odd')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    ODD (2x)
                  </button>
                  <button
                    onClick={() => placeBet('low', 'low')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    1-18 (2x)
                  </button>
                  <button
                    onClick={() => placeBet('high', 'high')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    19-36 (2x)
                  </button>
                  <button
                    onClick={() => placeBet('dozen1', '1')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    1st 12 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('dozen2', '2')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-pink-600 hover:bg-pink-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    2nd 12 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('dozen3', '3')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    3rd 12 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('column1', '1')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Col 1 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('column2', '2')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Col 2 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('column3', '3')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Col 3 (3x)
                  </button>
                </div>

                {/* Number Grid */}
                <div className="grid grid-cols-5 xs:grid-cols-6 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-10 gap-1">
                  {[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26].map((num) => {
                    const color = getColor(num);
                    return (
                      <button
                        key={num}
                        onClick={() => placeBet('number', num)}
                        disabled={!canBet}
                        className={`px-2 py-2 rounded text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          color === 'red'
                            ? 'bg-red-600 hover:bg-red-700'
                            : color === 'black'
                            ? 'bg-gray-900 hover:bg-gray-800'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>

                {/* My Bets - In Panel */}
                {myBets.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-white font-bold mb-2 text-sm">My Bets</div>
                    <div className="flex flex-wrap gap-2">
                      {myBets.map((bet) => (
                        <div
                          key={bet.id}
                          className="px-3 py-1 rounded bg-white/10 text-white text-xs sm:text-sm"
                        >
                          {bet.bet_type === 'number' ? bet.bet_value : bet.bet_type}: {fmt(bet.amount)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

      {/* Message */}
      {msg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
          <div className="inline-block bg-amber-900/60 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-lg text-sm shadow-lg">
            {msg}
          </div>
        </div>
      )}
    </div>
  );
}

