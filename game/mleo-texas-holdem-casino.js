// ============================================================================
// MLEO Texas Hold'em Rooms - Drop-in/Drop-out Multiplayer
// Built with Supabase for permanent poker rooms
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { supabase } from "../lib/supabase";

// ============================================================================
// VAULT SYSTEM
// ============================================================================

function safeRead(key, def) {
  if (typeof window === "undefined") return def;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : def;
  } catch {
    return def;
  }
}

function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
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
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

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

// ============================================================================
// POKER CONSTANTS & UTILITIES
// ============================================================================

const SUITS = ['S','H','D','C'];
const SUIT_SYMBOL = { S:'♠', H:'♥', D:'♦', C:'♣' };
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANKS_ORDER = { A:14,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
const BETTING_TIME_LIMIT = 30000; // 30 seconds

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

function PlayingCard({ card, hidden = false, delay = 0 }) {
  if (hidden) {
    return (
      <div 
        className="w-10 h-14 rounded bg-gradient-to-br from-red-600 to-red-800 border border-white/30 flex items-center justify-center shadow text-lg"
        style={{ animation: `slideInCard 0.4s ease-out ${delay}ms both`, opacity: 0 }}
      >
        🂠
      </div>
    );
  }
  
  const isRed = card.suit === "H" || card.suit === "D";
  const color = isRed ? "text-red-600" : "text-black";
  const suitSymbol = SUIT_SYMBOL[card.suit] || card.suit || '•';
  
  return (
    <div 
      className="w-10 h-14 rounded bg-white border border-gray-400 shadow p-0.5 relative"
      style={{ animation: `slideInCard 0.4s ease-out ${delay}ms both`, opacity: 0 }}
    >
      <div className={`text-xs font-bold ${color} absolute top-0.5 left-1 leading-tight`}>
        {card.value}
      </div>
      <div className={`text-base ${color} flex items-center justify-center h-full`}>
        {suitSymbol}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TexasHoldemCasinoPage() {
  useIOSViewportFix();
  const router = useRouter();

  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // State
  const [screen, setScreen] = useState("lobby"); // lobby, table, game
  const [mounted, setMounted] = useState(false);
  const [vaultAmount, setVaultAmount] = useState(0);
  const [playerName, setPlayerName] = useState("");
  
  // Lobby state
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  
  // Table state
  const [currentTableId, setCurrentTableId] = useState(null);
  const [currentGameId, setCurrentGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [game, setGame] = useState(null);
  const [myPlayer, setMyPlayer] = useState(null);
  
  // UI states
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setVaultAmount(getVault());
  }, []);

  useEffect(() => {
    if (mounted) {
      setVaultAmount(getVault());
    }
  }, [mounted]);

  // Subscribe to tables
  useEffect(() => {
    if (screen !== "lobby") return;
    
    loadTables();
    
    const subscription = supabase
      .channel('casino_tables_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'casino_tables' }, 
        () => loadTables()
      )
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, [screen]);

  const loadTables = async () => {
    try {
      const { data: tablesData, error: tablesError } = await supabase
        .from('casino_tables')
        .select('*')
        .eq('status', 'active')
        .order('min_buyin', { ascending: true });
      
      if (tablesError) throw tablesError;
      
      // Get player counts for each table
      const tablesWithCounts = await Promise.all(
        (tablesData || []).map(async (table) => {
          const { count } = await supabase
            .from('casino_players')
            .select('*', { count: 'exact', head: true })
            .eq('table_id', table.id);
          
          return { ...table, current_players: count || 0 };
        })
      );
      
      setTables(tablesWithCounts);
    } catch (err) {
      console.error("Error loading tables:", err);
    }
  };

  const handleJoinTable = async (table) => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    
    if (vaultAmount < table.min_buyin) {
      setError(`You need at least ${fmt(table.min_buyin)} MLEO to join this table`);
      return;
    }
    
    try {
      setError("");
      
      // Check if table is full
      const { count } = await supabase
        .from('casino_players')
        .select('*', { count: 'exact', head: true })
        .eq('table_id', table.id);
      
      if (count >= table.max_players) {
        setError("Table is full");
        return;
      }
      
      // Find available seat
      const { data: existingPlayers } = await supabase
        .from('casino_players')
        .select('seat_index')
        .eq('table_id', table.id);
      
      const occupiedSeats = new Set(existingPlayers?.map(p => p.seat_index) || []);
      let seatIndex = -1;
      for (let i = 0; i < table.max_players; i++) {
        if (!occupiedSeats.has(i)) {
          seatIndex = i;
          break;
        }
      }
      
      if (seatIndex === -1) {
        setError("No available seats");
        return;
      }
      
      // Deduct from vault
      const newVault = vaultAmount - table.min_buyin;
      setVault(newVault);
      setVaultAmount(newVault);
      
      // Add player to table
      const { data: newPlayer, error: playerError } = await supabase
        .from('casino_players')
        .insert({
          table_id: table.id,
          player_name: playerName.trim(),
          player_wallet: address || "guest",
          chips: table.min_buyin,
          seat_index: seatIndex,
          status: 'active'
        })
        .select()
        .single();
      
      if (playerError) throw playerError;
      
      setPlayerId(newPlayer.id);
      setCurrentTableId(table.id);
      setSelectedTable(table);
      setScreen("table");
      
    } catch (err) {
      console.error("Error joining table:", err);
      setError("Failed to join table: " + err.message);
    }
  };

  const handleLeaveTable = async () => {
    if (!playerId || !currentTableId) return;
    
    try {
      // Get player's current chips
      const { data: player } = await supabase
        .from('casino_players')
        .select('chips')
        .eq('id', playerId)
        .single();
      
      if (player && player.chips > 0) {
        // Return chips to vault
        const newVault = vaultAmount + player.chips;
        setVault(newVault);
        setVaultAmount(newVault);
      }
      
      // Remove player from table
      await supabase
        .from('casino_players')
        .delete()
        .eq('id', playerId);
      
      // Reset state
      setPlayerId(null);
      setCurrentTableId(null);
      setCurrentGameId(null);
      setSelectedTable(null);
      setPlayers([]);
      setGame(null);
      setMyPlayer(null);
      setScreen("lobby");
      
    } catch (err) {
      console.error("Error leaving table:", err);
      setError("Failed to leave table: " + err.message);
    }
  };

  // Subscribe to table updates
  useEffect(() => {
    if (!currentTableId || screen !== "table") return;
    
    loadTableData();
    
    const playersChannel = supabase
      .channel(`table_${currentTableId}_players`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_players', filter: `table_id=eq.${currentTableId}` },
        () => loadTableData()
      )
      .subscribe();
    
    return () => {
      playersChannel.unsubscribe();
    };
  }, [currentTableId, screen]);

  // Auto-start game when 2+ players
  useEffect(() => {
    if (players.length >= 2 && !currentGameId) {
      startGame();
    }
  }, [players.length, currentGameId]);

  // Subscribe to game updates
  useEffect(() => {
    if (!currentGameId || screen !== "game") return;
    
    loadGameData();
    
    const gameChannel = supabase
      .channel(`game_${currentGameId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_games', filter: `id=eq.${currentGameId}` },
        () => loadGameData()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_players', filter: `game_id=eq.${currentGameId}` },
        () => loadGameData()
      )
      .subscribe();
    
    return () => {
      gameChannel.unsubscribe();
    };
  }, [currentGameId, screen]);

  const loadTableData = async () => {
    if (!currentTableId) return;
    
    try {
      const { data: playersData } = await supabase
        .from('casino_players')
        .select('*')
        .eq('table_id', currentTableId)
        .order('seat_index', { ascending: true });
      
      setPlayers(playersData || []);
      
      if (playerId) {
        const me = playersData?.find(p => p.id === playerId);
        setMyPlayer(me);
      }
    } catch (err) {
      console.error("Error loading table data:", err);
    }
  };

  const loadGameData = async () => {
    if (!currentGameId) return;
    
    try {
      const { data: gameData } = await supabase
        .from('casino_games')
        .select('*')
        .eq('id', currentGameId)
        .single();
      
      const { data: playersData } = await supabase
        .from('casino_players')
        .select('*')
        .eq('game_id', currentGameId)
        .order('seat_index', { ascending: true });
      
      setGame(gameData);
      setPlayers(playersData || []);
      
      if (playerId) {
        const me = playersData?.find(p => p.id === playerId);
        setMyPlayer(me);
      }
    } catch (err) {
      console.error("Error loading game data:", err);
    }
  };

  // Start a new game
  const startGame = async () => {
    if (!currentTableId || players.length < 2) return;
    
    try {
      const deck = shuffleDeck(createDeck());
      
      // Create new game
      const { data: newGame, error: gameError } = await supabase
        .from('casino_games')
        .insert({
          table_id: currentTableId,
          status: 'playing',
          deck: deck,
          round: 'preflop',
          dealer_index: 0,
          current_player_index: 0
        })
        .select()
        .single();
      
      if (gameError) throw gameError;
      
      setCurrentGameId(newGame.id);
      setGame(newGame);
      setScreen("game");
      
      // Deal cards to players
      const updatedPlayers = players.map((p, idx) => {
        const card1 = deck[idx * 2];
        const card2 = deck[idx * 2 + 1];
        
        return {
          ...p,
          game_id: newGame.id,
          hole_cards: [card1, card2],
          current_bet: 0,
          status: 'active',
          chips: selectedTable.min_buyin
        };
      });
      
      // Post blinds
      const smallBlindIndex = 1 % players.length;
      const bigBlindIndex = 2 % players.length;
      
      updatedPlayers[smallBlindIndex].current_bet = Math.min(selectedTable.small_blind, updatedPlayers[smallBlindIndex].chips);
      updatedPlayers[smallBlindIndex].chips -= updatedPlayers[smallBlindIndex].current_bet;
      
      updatedPlayers[bigBlindIndex].current_bet = Math.min(selectedTable.big_blind, updatedPlayers[bigBlindIndex].chips);
      updatedPlayers[bigBlindIndex].chips -= updatedPlayers[bigBlindIndex].current_bet;
      
      // Update players in database
      for (const player of updatedPlayers) {
        await supabase
          .from('casino_players')
          .update({
            game_id: player.game_id,
            hole_cards: player.hole_cards,
            current_bet: player.current_bet,
            status: player.status,
            chips: player.chips
          })
          .eq('id', player.id);
      }
      
      // Update game with pot and current bet
      const pot = updatedPlayers.reduce((sum, p) => sum + p.current_bet, 0);
      const currentBet = Math.max(...updatedPlayers.map(p => p.current_bet));
      
      await supabase
        .from('casino_games')
        .update({
          pot: pot,
          current_bet: currentBet,
          current_player_index: 0
        })
        .eq('id', newGame.id);
      
    } catch (err) {
      console.error("Error starting game:", err);
      setError("Failed to start game: " + err.message);
    }
  };

  // ============================================================================
  // RENDER SCREENS
  // ============================================================================

  if (!mounted) {
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={0}
      >
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="text-white text-xl">Loading...</div>
        </div>
      </Layout>
    );
  }

  // ============================================================================
  // LOBBY SCREEN
  // ============================================================================

  if (screen === "lobby") {
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={vaultAmount}
      >
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
          {/* Header */}
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="text-4xl font-extrabold text-white mb-2">
                🎰 Texas Hold'em Rooms
              </h1>
              <p className="text-white/70">Join a table and play poker with real players!</p>
            </div>

            {/* Player Info */}
            <div className="bg-black/30 rounded-xl p-4 mb-4 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white font-semibold">Your Balance:</div>
                <div className="text-emerald-400 text-xl font-bold">{fmt(vaultAmount)} MLEO</div>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter your name..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
                  maxLength={20}
                />
              </div>
              
              {error && (
                <div className="mt-2 text-red-400 text-sm">{error}</div>
              )}
            </div>

            {/* Tables List */}
            <div className="space-y-3">
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="bg-gradient-to-br from-purple-900/50 to-slate-900/50 rounded-xl p-5 backdrop-blur-sm border border-white/10 hover:border-purple-400/50 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">
                        🃏 {table.name}
                      </h3>
                      <div className="text-white/70 text-sm">
                        Min Buy-in: <span className="text-emerald-400 font-semibold">{fmt(table.min_buyin)} MLEO</span>
                      </div>
                      <div className="text-white/70 text-sm">
                        Blinds: <span className="text-amber-400">{fmt(table.small_blind)}</span> / <span className="text-amber-400">{fmt(table.big_blind)}</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-white/70 text-sm mb-2">
                        Players: {table.current_players}/{table.max_players}
                      </div>
                      <div className="flex gap-1 mb-3">
                        {Array.from({ length: table.max_players }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                              i < table.current_players
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white/10 text-white/30'
                            }`}
                          >
                            {i < table.current_players ? '👤' : '▫'}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleJoinTable(table)}
                        disabled={table.current_players >= table.max_players || vaultAmount < table.min_buyin}
                        className={`px-6 py-3 rounded-lg font-bold transition-all ${
                          table.current_players >= table.max_players || vaultAmount < table.min_buyin
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:scale-105'
                        }`}
                      >
                        {table.current_players >= table.max_players ? 'FULL' : 'JOIN TABLE'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {tables.length === 0 && (
                <div className="text-center py-12 text-white/50">
                  <div className="text-4xl mb-3">🎴</div>
                  <div>No tables available. Please check back later.</div>
                </div>
              )}
            </div>

            {/* Back Button */}
            <div className="mt-6 text-center">
              <button
                onClick={() => router.push('/arcade')}
                className="px-8 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
              >
                ← Back to Arcade
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ============================================================================
  // TABLE SCREEN (Waiting for game to start)
  // ============================================================================

  if (screen === "table") {
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={vaultAmount}
      >
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 flex items-center justify-center">
          <div className="max-w-2xl w-full">
            {/* Table Info */}
            <div className="bg-black/40 rounded-xl p-6 backdrop-blur-sm border border-white/10 mb-4">
              <h2 className="text-2xl font-bold text-white mb-4 text-center">
                🃏 {selectedTable?.name}
              </h2>
              
              <div className="text-white/70 text-center mb-6">
                <div className="mb-2">Blinds: {fmt(selectedTable?.small_blind)} / {fmt(selectedTable?.big_blind)}</div>
                <div>Waiting for players to join...</div>
              </div>

              {/* Players List */}
              <div className="space-y-2 mb-6">
                {players.map((player, idx) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg flex items-center justify-between ${
                      player.id === playerId
                        ? 'bg-purple-500/30 border border-purple-400'
                        : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">
                        {player.id === playerId ? '👑' : '👤'}
                      </div>
                      <div>
                        <div className="text-white font-semibold">
                          {player.player_name}
                          {player.id === playerId && ' (You)'}
                        </div>
                        <div className="text-white/50 text-sm">
                          Seat #{player.seat_index + 1}
                        </div>
                      </div>
                    </div>
                    <div className="text-emerald-400 font-bold">
                      {fmt(player.chips)} chips
                    </div>
                  </div>
                ))}
              </div>

              {/* Game Status */}
              <div className="text-center text-white/70 mb-4">
                {players.length < 2 ? (
                  <div className="text-amber-400">
                    ⏳ Waiting for at least 2 players to start...
                  </div>
                ) : (
                  <div className="text-emerald-400">
                    ✅ Ready to play! Game will start soon...
                  </div>
                )}
              </div>
            </div>

            {/* Leave Button */}
            <div className="text-center">
              <button
                onClick={handleLeaveTable}
                className="px-8 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all"
              >
                Leave Table
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ============================================================================
  // GAME SCREEN (Active poker game)
  // ============================================================================

  if (screen === "game") {
    const isMyTurn = myPlayer && game && game.current_player_index === players.findIndex(p => p.id === playerId);
    const communityCards = game?.community_cards || [];
    const visibleCards = communityCards.slice(0, game?.community_visible || 0);
    
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={vaultAmount}
      >
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
          {/* Header */}
          <div className="max-w-6xl mx-auto mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  🃏 {selectedTable?.name}
                </h2>
                <div className="text-white/70 text-sm">
                  Round: {game?.round || 'preflop'} | Pot: {fmt(game?.pot || 0)} MLEO
                </div>
              </div>
              
              <button
                onClick={handleLeaveTable}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all"
              >
                Leave Table
              </button>
            </div>
          </div>

          {/* Game Table */}
          <div className="max-w-6xl mx-auto">
            <div className="bg-gradient-to-br from-green-800 to-green-900 rounded-2xl p-6 shadow-2xl border border-green-600/30">
              
              {/* Community Cards */}
              <div className="text-center mb-8">
                <div className="text-white/70 text-sm mb-3">Community Cards</div>
                <div className="flex justify-center gap-2">
                  {visibleCards.map((card, idx) => (
                    <PlayingCard key={idx} card={card} delay={idx * 100} />
                  ))}
                  {Array.from({ length: 5 - visibleCards.length }).map((_, idx) => (
                    <div key={idx} className="w-10 h-14 rounded bg-white/10 border border-white/20 flex items-center justify-center">
                      ?
                    </div>
                  ))}
                </div>
              </div>

              {/* Players */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {players.map((player, idx) => {
                  const isCurrentPlayer = game?.current_player_index === idx;
                  const isMe = player.id === playerId;
                  
                  return (
                    <div
                      key={player.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isCurrentPlayer
                          ? 'border-yellow-400 bg-yellow-400/20'
                          : isMe
                          ? 'border-purple-400 bg-purple-400/20'
                          : 'border-white/20 bg-white/5'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-white font-bold text-sm mb-1">
                          {player.player_name}
                          {isMe && ' (You)'}
                          {isCurrentPlayer && ' 👑'}
                        </div>
                        
                        <div className="text-emerald-400 text-xs mb-2">
                          {fmt(player.chips)} chips
                        </div>
                        
                        {player.current_bet > 0 && (
                          <div className="text-amber-400 text-xs">
                            Bet: {fmt(player.current_bet)}
                          </div>
                        )}
                        
                        {player.status === 'folded' && (
                          <div className="text-red-400 text-xs">FOLDED</div>
                        )}
                        
                        {player.status === 'all_in' && (
                          <div className="text-orange-400 text-xs">ALL IN</div>
                        )}
                      </div>
                      
                      {/* Player Cards */}
                      {isMe && player.hole_cards && (
                        <div className="flex justify-center gap-1 mt-2">
                          {player.hole_cards.map((card, cardIdx) => (
                            <PlayingCard key={cardIdx} card={card} delay={cardIdx * 100} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              {isMyTurn && myPlayer?.status !== 'folded' && game?.status === 'playing' && (
                <div className="text-center">
                  <div className="text-white/70 text-sm mb-4">Your Turn</div>
                  <div className="flex justify-center gap-3">
                    <button className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold">
                      FOLD
                    </button>
                    <button className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold">
                      CALL
                    </button>
                    <button className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold">
                      RAISE
                    </button>
                    <button className="px-6 py-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold">
                      ALL IN
                    </button>
                  </div>
                </div>
              )}

              {/* Game Status */}
              {game?.status === 'finished' && (
                <div className="text-center text-white/70">
                  <div className="text-2xl mb-2">🎉</div>
                  <div>Hand finished! Starting new hand...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return null;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
@keyframes slideInCard {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

