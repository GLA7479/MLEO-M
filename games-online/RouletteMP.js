// Roulette Multiplayer - European Roulette (0-36)
// Aligned with PokerMP/BlackjackMP patterns

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";

// ===== Config =====
const BETTING_SECONDS = Number(process.env.NEXT_PUBLIC_ROULETTE_BETTING_SECONDS || 20);
const SPINNING_SECONDS = 5;
const RESULTS_SECONDS = 5; // Show result for 5 seconds

const MIN_BUYIN_OPTIONS = {
  '1K': 1_000,
  '10K': 10_000,
  '100K': 100_000,
  '1M': 1_000_000,
  '10M': 10_000_000,
  '100M': 100_000_000,
};

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

const SEGMENT_SIZE = 360 / ROULETTE_NUMBERS.length;

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function angleToIndex(angle) {
  const normalized = normalizeAngle(angle);
  return Math.min(
    ROULETTE_NUMBERS.length - 1,
    Math.floor(normalized / SEGMENT_SIZE)
  );
}

function indexToCenterAngle(idx) {
  return idx * SEGMENT_SIZE + SEGMENT_SIZE / 2;
}


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
  const value = parseInt(betValue, 10);

  switch (betType) {
    case 'number':
      return parseInt(betValue, 10) === result;
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
    case 'dozen': {
      if (value === 1) return result >= 1 && result <= 12;
      if (value === 2) return result >= 13 && result <= 24;
      if (value === 3) return result >= 25 && result <= 36;
      return false;
    }
    case 'column': {
      if (value === 1) return [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(result);
      if (value === 2) return [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(result);
      if (value === 3) return [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(result);
      return false;
    }
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
case 'dozen':
case 'column':
      return 3;
    default:
      return 1;
  }
}

export default function RouletteMP({ roomId, playerName, vault, setVaultBoth, tierCode = '10K' }) {
  useEffect(() => {
    window.updateVaultCallback = setVaultBoth;
    return () => {
      delete window.updateVaultCallback;
    };
  }, [setVaultBoth]);

  const name = playerName || "Guest";
  const clientId = useMemo(() => getClientId(), []);
  const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;
  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [bets, setBets] = useState([]);
  const [spinHistory, setSpinHistory] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");
  const [selectedBet, setSelectedBet] = useState(null);
  const [betAmount, setBetAmount] = useState(minRequired);

  useEffect(() => {
    setBetAmount(minRequired);
  }, [minRequired]);
  const [spinAngle, setSpinAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showBetPanel, setShowBetPanel] = useState(false);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [bettingTimeLeft, setBettingTimeLeft] = useState(0);
  const timerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const lastSpinAngleRef = useRef(0);
  const currentSpinAngleRef = useRef(0);
  const [isSlowingDown, setIsSlowingDown] = useState(false);
  const slowingDownStartRef = useRef(null);
  const bettingStartTimeRef = useRef(null);
  const bettingStartAngleRef = useRef(null); // Store the initial angle when betting phase starts
  const animationRunningRef = useRef(false); // Prevent multiple animations

  const openBetPanel = () => {
    setPanelDismissed(false);
    setShowBetPanel(true);
  };

  const closeBetPanel = () => {
    setPanelDismissed(true);
    setShowBetPanel(false);
  };

  const handleToggleBetPanel = () => {
    if (showBetPanel) {
      closeBetPanel();
    } else {
      openBetPanel();
    }
  };

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync spinAngle with ref when it changes externally (but not during betting animation)
  useEffect(() => {
    if (session?.stage !== "betting") {
      currentSpinAngleRef.current = spinAngle;
    }
  }, [spinAngle, session?.stage]);

  // Helper function to calculate current velocity at a given time in betting phase
  // During 30 seconds: starts fast and gradually slows down
  const calculateCurrentVelocity = (elapsed, totalDuration) => {
    const initialVelocity = 360 / 0.5; // degrees per second - very fast at start (full rotation every 0.5 seconds)
    const finalVelocity = 360 / 3; // degrees per second - slower at end (full rotation every 3 seconds)
    const timeProgress = Math.min(elapsed / totalDuration, 1);
    // Smooth ease-out deceleration
    const easeOutFactor = 1 - Math.pow(1 - timeProgress, 2); // ease-out quadratic for smoother transition
    return initialVelocity + (finalVelocity - initialVelocity) * easeOutFactor;
  };

  // Helper function to calculate winning number from angle
  const calculateWinningNumberFromAngle = (angle) => {
    const idx = angleToIndex(angle);
    return ROULETTE_NUMBERS[idx]?.num ?? 0;
  };

  // Continuous spin animation during betting stage (30 seconds) + 5 seconds slowdown
  useEffect(() => {
    let animationFrameId = null;
    const BETTING_DURATION = BETTING_SECONDS;
    const FINAL_SLOWDOWN_DURATION = 10; // seconds
    
    // Initialize betting start time when betting stage starts
    if (session?.stage === "betting" && bettingTimeLeft > 0) {
      if (!bettingStartTimeRef.current) {
        // Calculate when betting actually started based on deadline
        if (session?.betting_deadline) {
          const deadline = new Date(session.betting_deadline).getTime();
          bettingStartTimeRef.current = deadline - (BETTING_SECONDS * 1000);
        } else {
          bettingStartTimeRef.current = Date.now();
        }
        // Store the initial angle when betting phase starts - this stays constant for the entire animation
        bettingStartAngleRef.current = currentSpinAngleRef.current || lastSpinAngleRef.current || 0;
        currentSpinAngleRef.current = bettingStartAngleRef.current;
        setSpinAngle(bettingStartAngleRef.current);
      }
    }
    
    // Start final slowdown when betting time reaches 0
    // Ensure smooth transition - use the exact final velocity from 30-second phase
    if (session?.stage === "betting" && bettingTimeLeft === 0 && !isSlowingDown && currentSpinAngleRef.current !== null && bettingStartTimeRef.current) {
      // Use the final velocity that matches the end of the 30-second phase
      // This ensures perfect continuity - no jumps
      const finalVelocityAt30s = 360 / 3; // degrees per second - matches finalVelocity in betting phase
      
      // Get the current angle - preserve it for smooth transition
      const currentAngle = currentSpinAngleRef.current || 0;
      
      setIsSlowingDown(true);
      slowingDownStartRef.current = {
        angle: currentAngle,
        time: Date.now(),
        velocity: finalVelocityAt30s // Use exact final velocity for smooth transition
      };
    }
    
    if (session?.stage === "betting" && bettingTimeLeft > 0 && bettingStartTimeRef.current && bettingStartAngleRef.current !== null && !animationRunningRef.current) {
      // Reset slowing down state if betting restarted
      if (isSlowingDown) {
        setIsSlowingDown(false);
        slowingDownStartRef.current = null;
      }
      
      // Mark animation as running to prevent multiple instances
      animationRunningRef.current = true;
      
      // Gradual slowdown during 30 seconds of betting - starts fast, ends slower
      const startTime = bettingStartTimeRef.current;
      const startAngle = bettingStartAngleRef.current; // Use the fixed start angle - never changes during animation
      const initialVelocity = 360 / 0.5; // degrees per second - very fast at start
      const finalVelocity = 360 / 3; // degrees per second - slower at end (matches slowdown phase)
      
      // Use requestAnimationFrame for smooth animation
      const animate = () => {
        // Check if we should continue animating
        if (session?.stage !== "betting" || bettingTimeLeft <= 0 || !bettingStartTimeRef.current || bettingStartAngleRef.current === null) {
          animationRunningRef.current = false;
          return;
        }
        
        const elapsed = (Date.now() - startTime) / 1000; // seconds since betting started
        const timeProgress = Math.min(elapsed / BETTING_DURATION, 1); // 0 to 1
        
        // Calculate distance using integration of velocity curve
        // For ease-out quadratic: v(t) = initial + (final - initial) * (1 - (1-t)^2)
        // Distance = ∫v(t)dt from 0 to elapsed
        // We integrate: ∫[final - (final - initial) * (1-t)^2]dt
        // = final*t - (final - initial) * ∫(1-t)^2 dt
        // = final*t - (final - initial) * [-(1-t)^3/3]
        // = final*t + (final - initial) * [(1-t)^3 - 1]/3 * DURATION
        const distance = finalVelocity * elapsed + (finalVelocity - initialVelocity) * BETTING_DURATION * (Math.pow(1 - timeProgress, 3) - 1) / 3;
        
        // Calculate new angle from fixed start angle - this ensures smooth, continuous rotation
        // startAngle never changes, only distance accumulates
        const newAngle = startAngle + distance;
        
        // Store the full angle in ref for continuity
        currentSpinAngleRef.current = newAngle;
        // Update display - CSS handles large values correctly (720deg = 360deg visually)
        setSpinAngle(newAngle);
        
        // Continue animation
        animationFrameId = requestAnimationFrame(animate);
      };
      
      animationFrameId = requestAnimationFrame(animate);
      
    } else if (session?.stage === "betting" && isSlowingDown && slowingDownStartRef.current) {
      // Final slowdown phase - 5 seconds of gradual slowdown to complete stop
      // This continues smoothly from where the 30-second phase ended
      const startData = slowingDownStartRef.current;
      const startTime = startData.time;
      const startAngle = startData.angle;
      const initialVelocity = startData.velocity; // degrees per second at start of final slowdown (should match finalVelocity from betting phase)
      
      // Use requestAnimationFrame for smooth slowdown animation
      const animate = () => {
        const elapsed = (Date.now() - startTime) / 1000; // seconds since slowdown started
        const clampedElapsed = Math.min(elapsed, FINAL_SLOWDOWN_DURATION);
        const t = clampedElapsed / FINAL_SLOWDOWN_DURATION;

        // Ease-out cubic: v(t) = initialVelocity * (1 - t^3)
        // Distance = initialVelocity * FINAL_SLOWDOWN_DURATION * (t - t^4/4)
        const distance = initialVelocity * FINAL_SLOWDOWN_DURATION * (t - (t * t * t * t) / 4);
        const candidateAngle = startAngle + distance;

        if (elapsed >= FINAL_SLOWDOWN_DURATION) {
          const snappedIndex = angleToIndex(candidateAngle);
          const snappedAngle = indexToCenterAngle(snappedIndex);

          currentSpinAngleRef.current = snappedAngle;
          setSpinAngle(snappedAngle);
          setIsSlowingDown(false);
          slowingDownStartRef.current = null;
          animationRunningRef.current = false;

          const winningNumber = ROULETTE_NUMBERS[snappedIndex].num;
          setTimeout(() => {
            declareWinner(winningNumber);
          }, 50);
          return;
        }

        currentSpinAngleRef.current = candidateAngle;
        setSpinAngle(candidateAngle);
        animationFrameId = requestAnimationFrame(animate);
      };
      
      animationFrameId = requestAnimationFrame(animate);
      
    } else if (session?.stage !== "betting") {
      // Reset when stage changes
      animationRunningRef.current = false;
      if (isSlowingDown) {
        setIsSlowingDown(false);
        slowingDownStartRef.current = null;
      }
      bettingStartTimeRef.current = null;
      bettingStartAngleRef.current = null;
    }
    
    // Cleanup function
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationRunningRef.current = false;
    };
  }, [session?.stage, bettingTimeLeft, isSlowingDown]);

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
    if (session?.stage === "betting" && bettingTimeLeft > 0) {
      if (panelDismissed) {
        if (showBetPanel) setShowBetPanel(false);
      } else if (!showBetPanel) {
        setShowBetPanel(true);
      }
    } else {
      if (showBetPanel) setShowBetPanel(false);
      if (panelDismissed) setPanelDismissed(false);
    }
  }, [session?.stage, bettingTimeLeft, panelDismissed, showBetPanel]);

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

  // ===== Channel: Spin history =====
  useEffect(() => {
    if (!session?.id) {
      setSpinHistory([]);
      return;
    }

    const fetchHistory = async () => {
      const { data } = await supabase
        .from("roulette_spins")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setSpinHistory(data || []);
    };

    const ch = supabase
      .channel("roulette_spins:" + session.id)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roulette_spins",
        filter: `session_id=eq.${session.id}`,
      }, fetchHistory)
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          await fetchHistory();
        }
      });

    // Initial fetch in case subscription misses early data
    fetchHistory();

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

      if (readVault() < minRequired) {
        setMsg(`Minimum buy-in is ${fmt(minRequired)}`);
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

    if (readVault() < minRequired) {
      setMsg(`Minimum buy-in is ${fmt(minRequired)}`);
      return;
    }

    const amount = Math.floor(Number(betAmount));
    if (amount < minRequired) {
      setMsg(`Minimum bet is ${fmt(minRequired)}`);
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
    const newVault = v - amount;
    writeVault(newVault);
    setVaultBoth?.(newVault);

    setMsg("");
  }

  // ===== Declare winner (replaces spinWheel) =====
  const spinningRef = useRef(false);
  
  async function declareWinner(winningNumber) {
    if (!isLeader) return;
    if (session && !["betting", "spinning"].includes(session.stage)) return;
    
    // Guard against concurrent declarations
    if (spinningRef.current) return;
    spinningRef.current = true;
    
    try {
      const color = getColor(winningNumber);
      
      // Update session with result immediately
      const { data: updatedSession, error: sessionError } = await supabase
        .from("roulette_sessions")
        .update({
          stage: "results",
          spin_result: winningNumber,
          spin_color: color,
          betting_deadline: null
        })
        .eq("id", session.id)
        .select()
        .single();

      if (sessionError) {
        spinningRef.current = false;
        return;
      }

      setSession(updatedSession);

      // Calculate payouts
      await calculatePayouts(winningNumber, color, updatedSession.id);

      // Save spin to history
      await supabase.from("roulette_spins").insert({
        session_id: updatedSession.id,
        spin_number: updatedSession.spin_number,
        result: winningNumber,
        color: color,
        total_bets: updatedSession.total_bets || 0,
        total_payouts: updatedSession.total_payouts || 0,
      });

      // After results display, immediately start next betting round
      setTimeout(async () => {
        if (isLeader) {
          const deadline = new Date(Date.now() + BETTING_SECONDS * 1000).toISOString();
          
          // Clear old resolved bets before starting new round
          await supabase
            .from("roulette_bets")
            .delete()
            .eq("session_id", updatedSession.id)
            .not("is_winner", "is", null);
          
          // Reset player bets
          await supabase
            .from("roulette_players")
            .update({ total_bet: 0, total_won: 0 })
            .eq("session_id", updatedSession.id);
          
          // Start betting stage immediately
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
            // Reset betting start time for new round
            bettingStartTimeRef.current = null;
          }
        }
      }, RESULTS_SECONDS * 1000);
      
      spinningRef.current = false;
    } catch (error) {
      console.error("Error declaring winner:", error);
      spinningRef.current = false;
    }
  }
  
  // Legacy function - no longer used but kept for compatibility
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

    // Animate spin - reset slowing down state
    setIsSlowingDown(false);
    slowingDownStartRef.current = null;
    setIsSpinning(true);
    const spins = 5 + Math.random() * 5; // 5-10 full rotations
    const currentAngle = currentSpinAngleRef.current % 360; // Get current position from ref
    const finalAngle = currentAngle + (spins * 360) + (result * (360 / 37));
    setSpinAngle(finalAngle);
    currentSpinAngleRef.current = finalAngle;
    lastSpinAngleRef.current = finalAngle;

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

    // Update session totals (aggregate with existing value)
    const { data: currentSessionTotals } = await supabase
      .from("roulette_sessions")
      .select("total_payouts")
      .eq("id", sessionId)
      .maybeSingle();
    
    const aggregatedPayouts = (currentSessionTotals?.total_payouts || 0) + totalPayouts;
    
    const { data: updatedSession } = await supabase
      .from("roulette_sessions")
      .update({ total_payouts: aggregatedPayouts })
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
      const updateTimer = async () => {
        const now = Date.now();
        const deadline = new Date(session.betting_deadline).getTime();
        const timeLeft = Math.max(0, Math.floor((deadline - now) / 1000));
        setBettingTimeLeft(timeLeft);
        
        if (timeLeft <= 0) {
          // Don't auto-spin immediately - let the 5 second slowdown happen first
          // spinWheel (declareWinner) will be called after slowdown completes
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
          <span>Min: {fmt(minRequired)}</span>
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
                        transform: `rotate3d(0, 0, 1, ${spinAngle}deg)`,
                        transformStyle: 'preserve-3d',
                        willChange: 'transform',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        WebkitTransform: `rotate3d(0, 0, 1, ${spinAngle}deg)`,
                      }}
                    />
                    
                    {/* Numbers overlay - positioned on outer edge, counter-rotate to stay upright */}
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        transform: `rotate3d(0, 0, 1, ${spinAngle}deg)`,
                        transformStyle: 'preserve-3d',
                        willChange: 'transform',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        WebkitTransform: `rotate3d(0, 0, 1, ${spinAngle}deg)`,
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
                        const centerPx = 128; // Half of 256px (w-64 h-64 = 256px)
                        
                        const x = centerPx + radiusPx * Math.cos(angleRad);
                        const y = centerPx + radiusPx * Math.sin(angleRad);
                        
                        // Counter-rotate to keep numbers upright
                        // Use negative of spinAngle directly - CSS handles large values correctly
                        // No modulo needed - CSS will handle rotation smoothly even for values > 360
                        const counterRotation = -spinAngle;
                        
                        return (
                          <div
                            key={`num-${n.num}-${i}`}
                            className="absolute flex items-center justify-center text-white text-[9px] font-bold"
                            style={{
                              left: `${x}px`,
                              top: `${y}px`,
                              transform: `translate3d(-50%, -50%, 0) rotate(${counterRotation}deg)`,
                              transformStyle: 'preserve-3d',
                              willChange: 'transform',
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden',
                              WebkitTransform: `translate3d(-50%, -50%, 0) rotate(${counterRotation}deg)`,
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
                          <div className="text-white/40 text-sm uppercase tracking-wide">No More Bet</div>
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
                    onClick={handleToggleBetPanel}
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
                             (bet.bet_type === 'dozen' && bet.bet_value === '1') ? '1st 12' :
                             (bet.bet_type === 'dozen' && bet.bet_value === '2') ? '2nd 12' :
                             (bet.bet_type === 'dozen' && bet.bet_value === '3') ? '3rd 12' :
                             (bet.bet_type === 'column' && bet.bet_value === '1') ? 'Col 1' :
                             (bet.bet_type === 'column' && bet.bet_value === '2') ? 'Col 2' :
                             (bet.bet_type === 'column' && bet.bet_value === '3') ? 'Col 3' :
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

          {/* Recent Results */}
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-white font-bold text-sm mb-2 text-center">Last 10 Results</div>
            {spinHistory.length > 0 ? (
              <div className="flex flex-wrap gap-2 justify-center">
                {spinHistory.map((spin) => {
                  const chipColor =
                    spin.color === "red"
                      ? "bg-red-600/80 border-red-400"
                      : spin.color === "black"
                      ? "bg-gray-900/80 border-gray-500"
                      : "bg-emerald-600/80 border-emerald-400";
                  const textColor =
                    spin.color === "black" ? "text-gray-100" : "text-white";
                  return (
                    <div
                      key={spin.id || `${spin.session_id}-${spin.spin_number}`}
                      className={`px-3 py-1.5 rounded border ${chipColor} ${textColor} text-xs sm:text-sm flex items-center gap-2`}
                    >
                      <span className="font-bold text-base">{spin.result}</span>
                      <span className="uppercase tracking-wide text-[10px] sm:text-xs">
                        {spin.color}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-white/40 text-xs text-center py-2">No results yet</div>
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
            onClick={closeBetPanel}
          />
          
          {/* Bet Panel */}
          <div
            className="fixed bottom-0 bg-gradient-to-t from-zinc-900 via-zinc-800 to-zinc-900 border-t-2 border-white/20 rounded-t-2xl shadow-2xl z-50 transition-transform duration-300"
            style={{
              maxHeight: '80vh',
              ...(isMobile ? {
                left: 0,
                right: 0,
                width: '100%',
                maxWidth: '100%'
              } : {
                left: '50%',
                transform: 'translateX(-50%)',
                width: '45vw',
                maxWidth: '45vw'
              }),
              boxShadow: '0 -10px 40px rgba(0,0,0,0.8)'
            }}
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div
                className="w-12 h-1 bg-white/30 rounded-full cursor-pointer"
                onClick={closeBetPanel}
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
                onClick={closeBetPanel}
                className="text-white/60 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Panel Content - Scrollable */}
            <div className="overflow-y-auto p-3 md:p-4" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {/* Bet Amount Controls */}
              <div className="flex items-center gap-1 md:gap-2 mb-4 flex-nowrap overflow-x-auto" style={{ width: '100%' }}>
                <button
                  onClick={() => setBetAmount(a => Math.max(minRequired, Math.floor((a || minRequired) - minRequired)))}
                  disabled={!canBet}
                  className="px-2 md:px-3 py-2 rounded bg-white/10 text-white text-xs md:text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  −
                </button>
                
                <input
                  type="number"
                  min={minRequired}
                  step={minRequired}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Math.max(minRequired, parseInt(e.target.value) || minRequired))}
                  disabled={!canBet}
                  className="flex-1 min-w-[60px] md:min-w-[80px] max-w-[100px] md:max-w-[120px] px-2 md:px-3 py-2 rounded bg-white/10 text-white border border-white/20 text-center text-xs md:text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                />
                
                <button
                  onClick={() => setBetAmount(a => Math.max(minRequired, Math.floor((a || minRequired) + minRequired)))}
                  disabled={!canBet}
                  className="px-2 md:px-3 py-2 rounded bg-white/10 text-white text-xs md:text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  +
                </button>
                
                <button 
                  onClick={() => setBetAmount(minRequired)} 
                  disabled={!canBet}
                  className="px-2 md:px-3 py-2 rounded bg-white/10 text-white text-xs md:text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  Min
                </button>
                <button 
                  onClick={() => setBetAmount(Math.max(minRequired, Math.floor(readVault() / 20)))} 
                  disabled={!canBet}
                  className="px-2 md:px-3 py-2 rounded bg-white/10 text-white text-xs md:text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  5%
                </button>
                <button 
                  onClick={() => setBetAmount(Math.max(minRequired, Math.floor(readVault() / 10)))} 
                  disabled={!canBet}
                  className="px-2 md:px-3 py-2 rounded bg-white/10 text-white text-xs md:text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  10%
                </button>
                <button 
                  onClick={() => setBetAmount(Math.max(minRequired, Math.floor(readVault() / 4)))} 
                  disabled={!canBet}
                  className="px-2 md:px-3 py-2 rounded bg-white/10 text-white text-xs md:text-sm border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  25%
                </button>
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
                    onClick={() => placeBet('dozen', '1')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    1st 12 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('dozen', '2')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    style={{ backgroundColor: '#db2777' /* pink-600 */, }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#be185d'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#db2777'}
                  >
                    2nd 12 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('dozen', '3')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    3rd 12 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('column', '1')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    style={{ backgroundColor: '#4f46e5' /* indigo-600 */ }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
                  >
                    Col 1 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('column', '2')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    style={{ backgroundColor: '#0f766e' /* teal-600 */ }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0d9488'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0f766e'}
                  >
                    Col 2 (3x)
                  </button>
                  <button
                    onClick={() => placeBet('column', '3')}
                    disabled={!canBet}
                    className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Col 3 (3x)
                  </button>
                </div>

                {/* Number Grid */}
                <div className="grid grid-cols-5 xs:grid-cols-6 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-10 gap-1">
                  {Array.from({ length: 37 }, (_, num) => num).map((num) => {
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
                      {myBets.map((bet) => {
                        let label = bet.bet_type.toUpperCase();
                        if (bet.bet_type === 'number') label = `#${bet.bet_value}`;
                        else if (bet.bet_type === 'red') label = 'RED';
                        else if (bet.bet_type === 'black') label = 'BLACK';
                        else if (bet.bet_type === 'even') label = 'EVEN';
                        else if (bet.bet_type === 'odd') label = 'ODD';
                        else if (bet.bet_type === 'low') label = '1-18';
                        else if (bet.bet_type === 'high') label = '19-36';
                        else if (bet.bet_type === 'dozen') {
                          if (bet.bet_value === '1') label = '1st 12';
                          else if (bet.bet_value === '2') label = '2nd 12';
                          else if (bet.bet_value === '3') label = '3rd 12';
                        } else if (bet.bet_type === 'column') {
                          if (bet.bet_value === '1') label = 'Col 1';
                          else if (bet.bet_value === '2') label = 'Col 2';
                          else if (bet.bet_value === '3') label = 'Col 3';
                        }
                        return (
                          <div
                            key={bet.id}
                            className="px-3 py-1 rounded bg-white/10 text-white text-xs sm:text-sm"
                          >
                            {label}: {fmt(bet.amount)}
                          </div>
                        );
                      })}
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

