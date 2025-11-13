// ============================================================================
// MLEO Texas Hold'em Rooms — Single File Page (Next.js /pages/holdem.js)
// Works with your Vault + Supabase schema (casino_tables, casino_players, casino_games)
// No RPCs required. Uses realtime channels.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAccount } from "wagmi";
import { supabaseMP as supabase } from "../lib/supabaseClients";

// --------------------------- Vault helpers (same as Coin Flip) --------------
function safeRead(key, fallback = {}) {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function safeWrite(key, val) { if (typeof window !== "undefined") try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function getVault() { const rush = safeRead("mleo_rush_core_v4", {}); return rush.vault || 0; }
function setVault(amount) { const rush = safeRead("mleo_rush_core_v4", {}); rush.vault = amount; safeWrite("mleo_rush_core_v4", rush); }
function fmt(n){ if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return Math.floor(n).toString(); }

// --------------------------- UI helpers -------------------------------------
function useIOSViewportFix() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const setVH = () => root.style.setProperty("--app-100vh", `${Math.round(vv ? vv.height : window.innerHeight)}px`);
    const onOrient = () => requestAnimationFrame(() => setTimeout(setVH, 250));
    setVH(); vv?.addEventListener("resize", setVH); vv?.addEventListener("scroll", setVH);
    window.addEventListener("orientationchange", onOrient);
    return () => { vv?.removeEventListener("resize", setVH); vv?.removeEventListener("scroll", setVH); window.removeEventListener("orientationchange", onOrient); };
  }, []);
}

// --------------------------- Poker consts -----------------------------------
const SUITS = ['S','H','D','C'];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const RANKS_ORDER = {A:14,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13};
const PLAYER_STATUS = { ACTIVE:'active', FOLDED:'folded', ALL_IN:'all_in' };
const GAME_STATUS   = { WAITING:'waiting', PLAYING:'playing', FINISHED:'finished' };
const BETTING_TIME_LIMIT = 30000; // 30s per action

function createDeck(){ const d=[]; for(const s of SUITS)for(const v of VALUES)d.push({suit:s,value:v}); return d; }
function shuffleDeck(deck){ const a=[...deck]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// --------------------------- Hand eval (compact + safe) ---------------------
const norm = (cards)=> (Array.isArray(cards)?cards:[]).map(c=>{
  if(!c) return null;
  const r = typeof c.r==='number'?c.r:(c.value && RANKS_ORDER[c.value]);
  const s = c.s||c.suit; if(!r||!s) return null; return {r,s};
}).filter(Boolean).sort((a,b)=>b.r-a.r);

const uniqDesc = (rs)=>{ const set=new Set(); const out=[]; for(const x of rs){ if(!set.has(x)){set.add(x); out.push(x);} } return out; };
const straightTop = (desc)=>{ const arr=[...desc]; if(arr.includes(14)) arr.push(1); let run=[arr[0]]; for(let i=1;i<arr.length;i++){ const p=arr[i-1],cur=arr[i]; if(cur===p)continue; if(cur===p-1) run.push(cur); else run=[cur]; if(run.length>=5){ const slice=run.slice(-5); return slice.includes(14)&&slice.includes(5)?5:Math.max(...slice);} } return null; };
const findFlush = (c)=>{ const m=new Map(); for(const x of c){ const a=m.get(x.s)||[]; a.push(x); m.set(x.s,a);} for(const v of m.values()) if(v.length>=5) return v.sort((a,b)=>b.r-a.r).slice(0,5); return null; };
const pickStraight = (cards)=>{ const u=uniqDesc(cards.map(c=>c.r)); const top=straightTop(u); if(!top) return null; const need=[]; const seq=(top===5)?[5,4,3,2,14]:[top,top-1,top-2,top-3,top-4]; for(const r of seq){ const pick=cards.find(c=>c.r===r&&!need.includes(c)); if(!pick) return null; need.push(pick);} return need.sort((a,b)=>b.r-a.r); };
const tupleName = {9:'Straight Flush',8:'Four of a Kind',7:'Full House',6:'Flush',5:'Straight',4:'Three of a Kind',3:'Two Pair',2:'Pair',1:'High Card'};

function handTuple(best5){
  if(!best5||best5.length!==5) return [0];
  const cnt=new Map(); for(const c of best5) cnt.set(c.r,(cnt.get(c.r)||0)+1);
  const entries=[...cnt.entries()].sort((a,b)=>(b[1]-a[1])||(b[0]-a[0]));
  const ranks=best5.map(c=>c.r).sort((a,b)=>b-a);
  const isFlush=best5.every(c=>c.s===best5[0].s);
  const isStr=straightTop(uniqDesc(ranks))!==null;
  if(isFlush&&isStr){ const high=(best5.some(c=>c.r===14)&&best5.some(c=>c.r===5))?5:Math.max(...ranks); return [9,high]; }
  if(entries[0][1]===4){ const four=entries[0][0]; const k=Math.max(...ranks.filter(r=>r!==four)); return [8,four,k]; }
  if(entries[0][1]===3 && entries[1]?.[1]===2) return [7,entries[0][0],entries[1][0]];
  if(isFlush) return [6,...ranks];
  if(isStr){ const high=(best5.some(c=>c.r===14)&&best5.some(c=>c.r===5))?5:Math.max(...ranks); return [5,high]; }
  if(entries[0][1]===3){ const t=entries[0][0]; const ks=ranks.filter(r=>r!==t).slice(0,2); return [4,t,...ks]; }
  if(entries[0][1]===2 && entries[1]?.[1]===2){ const hi=Math.max(entries[0][0],entries[1][0]); const lo=Math.min(entries[0][0],entries[1][0]); const k=Math.max(...ranks.filter(r=>r!==hi&&r!==lo)); return [3,hi,lo,k]; }
  if(entries[0][1]===2){ const p=entries[0][0]; const ks=ranks.filter(r=>r!==p).slice(0,3); return [2,p,...ks]; }
  return [1,...ranks];
}
function compareTuple(a,b){ for(let i=0;i<Math.max(a.length,b.length);i++){ const ai=a[i]||0, bi=b[i]||0; if(ai!==bi) return ai-bi; } return 0; }
function best5of7(cards){
  const flush5=findFlush(cards), straight5=pickStraight(cards);
  const cand=[];
  if(flush5){ const sf=pickStraight(flush5); if(sf) cand.push(sf); cand.push(flush5); }
  if(straight5) cand.push(straight5);
  if(cand.length===0 || cand.every(h=>handTuple(h)[0]<9)){
    for(let a=0;a<3;a++) for(let b=a+1;b<4;b++) for(let d=b+1;d<5;d++) for(let e=d+1;e<6;e++) for(let f=e+1;f<7;f++) cand.push([cards[a],cards[b],cards[d],cards[e],cards[f]]);
  }
  let best=null, t=null; for(const h of cand){ const tt=handTuple(h); if(!best || compareTuple(tt,t)>0){ best=h; t=tt; } }
  return {best5:best, tuple:t};
}
function evalHand(all){ const n = norm(all); if(n.length<5) return {rank:0,name:"Invalid",score:[0],best5:[]}; const {best5,tuple}=best5of7(n); const rev={2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'}; return {rank:tuple[0], name:tupleName[tuple[0]]||"Unknown", score:tuple, best5:(best5||[]).map(c=>({value:rev[c.r], suit:c.s}))}; }

// --------------------------- Seat/turn helpers -------------------------------
const seatRing = (players)=> players.map(p=>p.seat_index);
const nextSeat = (seats, from)=>{ if(!seats.length) return null; const u=[...new Set(seats)].sort((a,b)=>a-b); const i=u.indexOf(from); return i===-1?u[0]:u[(i+1)%u.length]; };
const arrIndexFromSeat = (players, seat)=> players.findIndex(p=>p.seat_index===seat);
const firstToActIndex = (playersSorted, dealerSeat) => {
  const seats=seatRing(playersSorted); let s=nextSeat(seats,dealerSeat);
  for(let k=0;k<playersSorted.length;k++){ const idx=arrIndexFromSeat(playersSorted,s); const p=playersSorted[idx]; if(p && p.status!==PLAYER_STATUS.FOLDED && p.status!==PLAYER_STATUS.ALL_IN) return idx; s=nextSeat(seats,s); }
  return 0;
};

// ============================================================================
// Page
// ============================================================================
export default function HoldemPage(){
  useIOSViewportFix();
  const router = useRouter();
  const { address } = useAccount();

  // UI
  const [mounted,setMounted]=useState(false);
  const [screen,setScreen]=useState("lobby"); // lobby | table | game
  const [error,setError]=useState("");

  // Lobby
  const [playerName,setPlayerName]=useState("");
  const [vault,setVaultState]=useState(0);
  const [tables,setTables]=useState([]);

  // Table/Game
  const [selectedTable,setSelectedTable]=useState(null);
  const [currentTableId,setCurrentTableId]=useState(null);
  const [currentGameId,setCurrentGameId]=useState(null);
  const [playerId,setPlayerId]=useState(null);
  const [players,setPlayers]=useState([]);
  const [game,setGame]=useState(null);
  const [me,setMe]=useState(null);

  // Betting
  const [raiseTo,setRaiseTo]=useState(null);
  const [actionTimer,setActionTimer]=useState(null);
  const [timeLeft,setTimeLeft]=useState(0);

  useEffect(()=>{ setMounted(true); setVaultState(getVault()); },[]);
  useEffect(()=>{ if(screen!=="lobby") return; loadTables(); const ch=supabase.channel("tables_watch").on("postgres_changes",{event:"*",schema:"public",table:"casino_tables"},loadTables).subscribe(); return ()=>ch.unsubscribe(); },[screen]);

  // --- Derived (MUST be above any early return): myIndex, isMyTurn, raiseTo default ---
  const myIndex = useMemo(
    () => players.findIndex(p => p.id === playerId),
    [players, playerId]
  );

  const isMyTurn = useMemo(() => {
    if (!game || !me || myIndex < 0) return false;
    return (
      game.current_player_index === myIndex &&
      me.status !== PLAYER_STATUS.FOLDED &&
      game.status === GAME_STATUS.PLAYING &&
      game.round !== "showdown"
    );
  }, [game, me, myIndex]);

  useEffect(() => {
    if (!game || !me) return;
    const minRaiseSize = Math.max(
      (game.last_raise_to || 0) - (game.current_bet || 0),
      (selectedTable?.big_blind || 0)
    );
    const minTo = (game.current_bet || 0) + minRaiseSize;
    const maxTo = (me.current_bet || 0) + (me.chips || 0);
    setRaiseTo(Math.min(Math.max(minTo, me.current_bet || 0), maxTo));
  }, [
    game?.current_bet,
    game?.last_raise_to,
    me?.chips,
    me?.current_bet,
    selectedTable?.big_blind,
  ]);

  async function loadTables(){
    const { data, error } = await supabase.from("casino_tables").select("*").eq("status","active").order("min_buyin",{ascending:true});
    if(error){ console.error(error); return; }
    const withCounts = await Promise.all((data||[]).map(async t=>{
      const { count } = await supabase.from("casino_players").select("*",{count:"exact",head:true}).eq("table_id",t.id);
      return { ...t, current_players: count||0 };
    }));
    setTables(withCounts);
  }

  // ----------------------- Join/Leave ---------------------------------------
  async function joinTable(table){
    if(!playerName.trim()){ setError("הכנס שם שחקן"); return; }
    if(vault < table.min_buyin){ setError(`צריך לפחות ${fmt(table.min_buyin)} MLEO ב-Vault`); return; }

    // find free seat
    const { data:seatRows } = await supabase.from("casino_players").select("seat_index").eq("table_id",table.id);
    const occ = new Set((seatRows||[]).map(x=>x.seat_index));
    let seat=-1; for(let i=0;i<table.max_players;i++){ if(!occ.has(i)){ seat=i; break; } }
    if(seat===-1){ setError("אין כיסאות פנויים"); return; }

    // deduct buy-in locally
    const newV = vault - table.min_buyin; setVault(newV); setVaultState(newV);

    // insert player
    const { data:p, error:pe } = await supabase.from("casino_players").insert({
      table_id: table.id, player_name: playerName.trim(), player_wallet: address||"guest",
      seat_index: seat, chips: table.min_buyin, status: PLAYER_STATUS.ACTIVE
    }).select().single();
    if(pe){ setError(pe.message); return; }

    setPlayerId(p.id); setCurrentTableId(table.id); setSelectedTable(table); setScreen("table");
  }

  async function leaveTable(){
    if(!playerId){ setScreen("lobby"); return; }
    
    // Clean up timer when leaving table
    if (actionTimer) { clearInterval(actionTimer); setActionTimer(null); }
    setTimeLeft(0);
    
    try{
      // If not in game => cash out chips
      const { data: row } = await supabase.from("casino_players").select("chips,game_id,table_id").eq("id",playerId).single();
      if(row && (!row.game_id)){
        if(row.chips>0){ const nv=vault+row.chips; setVault(nv); setVaultState(nv); }
        await supabase.from("casino_players").delete().eq("id",playerId);
      }else{
        // in-hand: mark will_leave + fold
        await supabase.from("casino_players").update({ status: PLAYER_STATUS.FOLDED, will_leave: true }).eq("id",playerId);
      }
    }catch(e){ console.error(e); }
    setScreen("lobby"); setPlayerId(null); setCurrentGameId(null); setCurrentTableId(null); setPlayers([]); setGame(null); setMe(null);
  }

  // ----------------------- Table subs ---------------------------------------
  useEffect(()=>{
    if(!currentTableId || screen!=="table") return;
    loadTablePlayers();
    const ch = supabase.channel(`t_${currentTableId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"casino_players",filter:`table_id=eq.${currentTableId}`},loadTablePlayers)
      .on("postgres_changes",{event:"*",schema:"public",table:"casino_tables",filter:`id=eq.${currentTableId}`},loadTablePlayers)
      .subscribe();
    return ()=>ch.unsubscribe();
  },[currentTableId,screen]);

  async function loadTablePlayers(){
    const { data } = await supabase.from("casino_players").select("*").eq("table_id",currentTableId).order("seat_index");
    setPlayers(data||[]);
    if(playerId){ setMe((data||[]).find(p=>p.id===playerId)||null); }
  }

  // Auto-start when ready - with protection against double execution
  const [isStartingGame, setIsStartingGame] = useState(false);
  useEffect(() => {
    if (screen !== "table") return;
    if (isStartingGame) return;
    const ready = players.filter(p => (p.chips || 0) > 0).length >= 2;
    if (!ready) return;
    let cancelled = false;
    setIsStartingGame(true);
    startOrAttachGame()
      .catch(console.error)
      .finally(() => { if (!cancelled) setIsStartingGame(false); });
    return () => { cancelled = true; };
  }, [players, screen, isStartingGame]);

  async function startOrAttachGame(){
    // attach if exists
    const { data: tRow } = await supabase.from("casino_tables").select("id,current_game_id,small_blind,big_blind").eq("id",currentTableId).single();
    if(tRow?.current_game_id){ setCurrentGameId(tRow.current_game_id); setScreen("game"); return; }

    const seated = [...players].filter(p=> (p.chips||0)>0).sort((a,b)=>a.seat_index-b.seat_index);
    if(seated.length<2) return;

    const deck = shuffleDeck(createDeck());
    const dealerSeat = seated[0].seat_index; // first seat as dealer initial
    // compute positions
    const seats = seatRing(seated);
    const sbSeat = nextSeat(seats, dealerSeat);
    const bbSeat = nextSeat(seats, sbSeat);
    const first = nextSeat(seats, bbSeat);
    const smallBlindIdx = arrIndexFromSeat(seated, sbSeat);
    const bigBlindIdx   = arrIndexFromSeat(seated, bbSeat);
    const firstToActIdx = arrIndexFromSeat(seated, first);

    // create game
    const { data:g, error:ge } = await supabase.from("casino_games").insert({
      table_id: currentTableId, status: GAME_STATUS.PLAYING, deck,
      round: "preflop", dealer_index: dealerSeat,
      current_player_index: firstToActIdx, last_raiser_index: bigBlindIdx,
      pot: 0, current_bet: 0, last_raise_to: 0, community_cards: [], community_visible: 0,
      turn_deadline: new Date(Date.now()+BETTING_TIME_LIMIT).toISOString()
    }).select().single();
    if(ge){ console.error(ge); setError(ge.message); return; }

    // lock game id on table (CAS) - select to see affected rows
    const { data: locked, error: casError } = await supabase
      .from("casino_tables")
      .update({ current_game_id: g.id })
      .eq("id", currentTableId)
      .is("current_game_id", null)
      .select("id");           // חשוב כדי לקבל rows

    if (casError || (locked?.length ?? 0) === 0) {
      console.error("Failed to lock game on table - another game may have started");
      setError("Another game is already in progress on this table");
      return;
    }

    // deal hole cards + post blinds
    const upd = [];
    seated.forEach((p,idx)=>{
      const c1 = deck[idx*2], c2 = deck[idx*2+1];
      upd.push({ id:p.id, hole_cards:[c1,c2], current_bet:0, status:PLAYER_STATUS.ACTIVE, game_id:g.id, revealed:false, hand_invested:0, chips:p.chips });
    });
    const sb = upd[smallBlindIdx]; const bb = upd[bigBlindIdx];
    const { data:tbl } = await supabase.from("casino_tables").select("small_blind,big_blind").eq("id",currentTableId).single();
    sb.current_bet = Math.min(tbl.small_blind||0, sb.chips); sb.chips -= sb.current_bet; sb.hand_invested = sb.current_bet;
    bb.current_bet = Math.min(tbl.big_blind||0, bb.chips); bb.chips -= bb.current_bet; bb.hand_invested = bb.current_bet;

    for(const p of upd){
      await supabase.from("casino_players").update({
        hole_cards:p.hole_cards, current_bet:p.current_bet, status:p.status, game_id:g.id, revealed:p.revealed, chips:p.chips, hand_invested:p.hand_invested
      }).eq("id",p.id);
    }
    const pot = upd.reduce((s,p)=>s+(p.current_bet||0),0);
    const currentBet = Math.max(...upd.map(p=>p.current_bet||0),0);
    await supabase.from("casino_games").update({
      pot, current_bet: currentBet, last_raise_to: currentBet, current_player_index: firstToActIdx, last_raiser_index: bigBlindIdx
    }).eq("id",g.id);

    setCurrentGameId(g.id);
    setScreen("game");
  }

  // ----------------------- Game subs ----------------------------------------
  useEffect(()=>{
    if(!currentGameId || screen!=="game") return;
    loadGameState();
    const ch = supabase.channel(`g_${currentGameId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"casino_games",filter:`id=eq.${currentGameId}`},loadGameState)
      .on("postgres_changes",{event:"*",schema:"public",table:"casino_players",filter:`game_id=eq.${currentGameId}`},loadGameState)
      .subscribe();
    return ()=>ch.unsubscribe();
  },[currentGameId,screen]);

  async function loadGameState(){
    const { data:g } = await supabase.from("casino_games").select("*").eq("id",currentGameId).maybeSingle();
    if(!g){ // game finished/cleaned
      setCurrentGameId(null); setScreen("table"); return;
    }
    const { data:ps } = await supabase.from("casino_players").select("*").eq("game_id",currentGameId).order("seat_index");
    setGame(g); setPlayers(ps||[]);
    if(playerId) setMe((ps||[]).find(p=>p.id===playerId)||null);
  }

  // ----------------------- Action timer -------------------------------------
  useEffect(()=>{
    if(!game || !me || screen!=="game") return;
    const myIndex = players.findIndex(p=>p.id===playerId);
    const isMyTurn = myIndex>=0 && game.current_player_index===myIndex && me.status!==PLAYER_STATUS.FOLDED && game.status===GAME_STATUS.PLAYING;
    if(!isMyTurn){ if(actionTimer){ clearInterval(actionTimer); setActionTimer(null); setTimeLeft(0);} return; }
    if(actionTimer) clearInterval(actionTimer);
    setTimeLeft(BETTING_TIME_LIMIT/1000);
    const t = setInterval(()=>{
      setTimeLeft(prev=>{
        if(prev<=1){ clearInterval(t); forceTimeoutFold(); return 0; }
        return prev-1;
      });
    },1000);
    setActionTimer(t);
    return ()=>{ clearInterval(t); };
  },[game?.current_player_index, me?.status, game?.status, players, playerId, screen]);

  async function forceTimeoutFold(){
    const { data:g } = await supabase.from("casino_games").select("*").eq("id",currentGameId).single();
    if(!g) return;
    const { data:ps } = await supabase.from("casino_players").select("*").eq("game_id",currentGameId).order("seat_index");
    const cur = ps?.[g.current_player_index]; if(!cur) return;
    await supabase.from("casino_players").update({ status: PLAYER_STATUS.FOLDED, last_action:"timeout" }).eq("id",cur.id);
    await nextTurnOrStreet(g, ps);
  }

  // ----------------------- Player actions -----------------------------------
  async function act(action, amount=0){
    if(!game || !me) return;
    // reload canonical
    const { data:g } = await supabase.from("casino_games").select("*").eq("id",currentGameId).single();
    const { data:ps } = await supabase.from("casino_players").select("*").eq("game_id",currentGameId).order("seat_index");

    const myIdx = ps.findIndex(p=>p.id===playerId);
    if(myIdx!==g.current_player_index) return; // not my turn

    const toCall = Math.max(0,(g.current_bet||0) - (me.current_bet||0));
    let newBet = me.current_bet||0;
    let newChips = me.chips||0;
    let newStatus = me.status;
    let put = 0;

    if(action==="fold"){ newStatus=PLAYER_STATUS.FOLDED; }
    else if(action==="check"){ if(toCall>0) return; }
    else if(action==="call"){
      put = Math.min(toCall,newChips); newBet+=put; newChips-=put; if(put<toCall) newStatus=PLAYER_STATUS.ALL_IN;
    }else if(action==="raise"){
      const minRaiseSize = Math.max((g.last_raise_to||0)-(g.current_bet||0), (selectedTable?.big_blind||0));
      let raiseTo = Math.max((g.current_bet||0)+minRaiseSize, amount);
      raiseTo = Math.min(raiseTo, newBet + newChips);
      put = raiseTo - newBet; if(put<=0) return;
      newBet = raiseTo; newChips -= put; if(newChips===0) newStatus=PLAYER_STATUS.ALL_IN;
    }else if(action==="allin"){
      put = newChips; newBet += put; newChips = 0; newStatus=PLAYER_STATUS.ALL_IN;
    }

    await supabase.from("casino_players").update({
      current_bet:newBet, chips:newChips, status:newStatus, hand_invested:(me.hand_invested||0)+put, last_action:action, last_action_time:new Date().toISOString()
    }).eq("id",playerId);

    // refresh -> next
    const { data:ps2 } = await supabase.from("casino_players").select("*").eq("game_id",currentGameId).order("seat_index");
    await nextTurnOrStreet(g, ps2);
  }

  async function nextTurnOrStreet(gNow, playersNow){
    const pot = playersNow.reduce((s,p)=>s+(p.current_bet||0),0);
    const currentBet = Math.max(...playersNow.map(p=>p.current_bet||0),0);

    const canAct = (p)=>p.status!==PLAYER_STATUS.FOLDED && p.status!==PLAYER_STATUS.ALL_IN;
    const stillIn = playersNow.filter(p=>p.status!==PLAYER_STATUS.FOLDED);
    // single player => award entire pot
    if(stillIn.length===1){
      const w = stillIn[0];
      // give pot to winner
      await supabase.from("casino_players").update({ chips:(w.chips||0)+pot }).eq("id",w.id);
      await supabase.from("casino_players").update({ current_bet:0, hand_invested:0 }).eq("game_id",gNow.id);
      await supabase.from("casino_games").update({ pot:0, current_bet:0, status:GAME_STATUS.FINISHED, round:"showdown", community_visible:5 }).eq("id",gNow.id);
      setTimeout(()=>startNextHand(), 2500);
      return;
    }

    // determine if betting round complete
    const everyoneMatched = playersNow.filter(p=>p.status!==PLAYER_STATUS.FOLDED).every(p => p.status===PLAYER_STATUS.ALL_IN || (p.current_bet||0)===currentBet);
    let nextIdx = (gNow.current_player_index + 1) % playersNow.length;
    while(playersNow[nextIdx] && !canAct(playersNow[nextIdx])){
      nextIdx = (nextIdx + 1) % playersNow.length;
      if(nextIdx===gNow.current_player_index) break;
    }
    const bettingDone = everyoneMatched && nextIdx=== (gNow.last_raiser_index ?? nextIdx);

    if(!bettingDone){
      await supabase.from("casino_games").update({
        pot, current_bet:currentBet, current_player_index:nextIdx,
        turn_deadline: new Date(Date.now()+BETTING_TIME_LIMIT).toISOString()
      }).eq("id",gNow.id);
      return;
    }

    // move to next street
    const nextRound = (r => ({preflop:"flop",flop:"turn",turn:"river",river:"showdown"}[r]||"showdown"))(gNow.round);
    const deck = gNow.deck||[];
    const n = playersNow.length;
    const base = n*2; // start of board/burns
    let board = gNow.community_cards||[];

    if(nextRound==="flop"  && gNow.round==="preflop") board = [deck[base+1],deck[base+2],deck[base+3]]; // burn base+0
    if(nextRound==="turn"  && gNow.round==="flop")    board = [...board, deck[base+5]];                // burn base+4
    if(nextRound==="river" && gNow.round==="turn")    board = [...board, deck[base+7]];                // burn base+6

    // reset current_bet for active players
    for(const p of playersNow) if(p.status!==PLAYER_STATUS.FOLDED) await supabase.from("casino_players").update({ current_bet:0 }).eq("id",p.id);

    // first to act = left of dealer
    const playersSorted = [...playersNow].sort((a,b)=>a.seat_index-b.seat_index);
    const startIdx = firstToActIndex(playersSorted, gNow.dealer_index);

    await supabase.from("casino_games").update({
      pot, current_bet:0, last_raise_to:0, last_raiser_index:startIdx,
      round: nextRound, community_cards: board, community_visible: Math.min(5, board.length),
      current_player_index: startIdx,
      turn_deadline: new Date(Date.now()+BETTING_TIME_LIMIT).toISOString()
    }).eq("id",gNow.id);

    // If showdown -> pick winners (simple main pot)
    if(nextRound==="showdown"){
      const board5 = (board||[]).slice(0,5);
      const ranked = playersNow.filter(p=>p.status!==PLAYER_STATUS.FOLDED).map(p=>{
        const all = [...(p.hole_cards||[]), ...board5];
        const ev = evalHand(all);
        return { p, score: ev.score };
      }).sort((a,b)=> compareTuple(b.score,a.score));
      const best = ranked[0].score;
      const winners = ranked.filter(r=> compareTuple(r.score,best)===0).map(r=>r.p);
      const share = Math.floor(pot / winners.length);
      for(const w of winners){ await supabase.from("casino_players").update({ chips:(w.chips||0)+share }).eq("id",w.id); }
      await supabase.from("casino_players").update({ current_bet:0, hand_invested:0 }).eq("game_id",gNow.id);
      await supabase.from("casino_games").update({ pot:0, current_bet:0, status:GAME_STATUS.FINISHED, community_visible:5 }).eq("id",gNow.id);
      setTimeout(()=>startNextHand(), 3000);
    }
  }

  async function startNextHand(){
    if(!currentGameId) return;
    const { data:g } = await supabase.from("casino_games").select("*").eq("id",currentGameId).single();
    if(!g) return;
    const { data:ps } = await supabase.from("casino_players").select("*").eq("table_id",g.table_id).order("seat_index");
    const participants = (ps||[]).filter(p=> (p.chips||0)>0);
    if(participants.length<2){
      // stop game
      await supabase.from("casino_tables").update({ current_game_id: null }).eq("id",g.table_id);
      await supabase.from("casino_games").delete().eq("id",g.id);
      setCurrentGameId(null); setScreen("table"); return;
    }

    const deck = shuffleDeck(createDeck());
    // next dealer seat
    const prev = g.dealer_index ?? participants[0].seat_index;
    const dealerSeat = nextSeat(seatRing(participants), prev);
    const sorted = [...participants].sort((a,b)=>a.seat_index-b.seat_index);
    const sbSeat = nextSeat(seatRing(sorted), dealerSeat);
    const bbSeat = nextSeat(seatRing(sorted), sbSeat);
    const first = nextSeat(seatRing(sorted), bbSeat);
    const smallBlindIdx = arrIndexFromSeat(sorted, sbSeat);
    const bigBlindIdx   = arrIndexFromSeat(sorted, bbSeat);
    const firstToActIdx = arrIndexFromSeat(sorted, first);

    // deal + blinds
    const { data:tbl } = await supabase.from("casino_tables").select("small_blind,big_blind").eq("id",g.table_id).single();
    for(let i=0;i<sorted.length;i++){
      const p = sorted[i];
      const c1=deck[i*2], c2=deck[i*2+1];
      await supabase.from("casino_players").update({
        game_id: g.id, hole_cards:[c1,c2], current_bet:0, status:PLAYER_STATUS.ACTIVE, revealed:false, hand_invested:0
      }).eq("id",p.id);
    }
    const sb = sorted[smallBlindIdx]; const bb = sorted[bigBlindIdx];
    await supabase.from("casino_players").update({
      current_bet: Math.min(tbl.small_blind||0, sb.chips), chips: (sb.chips||0) - Math.min(tbl.small_blind||0, sb.chips), hand_invested: Math.min(tbl.small_blind||0, sb.chips)
    }).eq("id",sb.id);
    await supabase.from("casino_players").update({
      current_bet: Math.min(tbl.big_blind||0, bb.chips), chips: (bb.chips||0) - Math.min(tbl.big_blind||0, bb.chips), hand_invested: Math.min(tbl.big_blind||0, bb.chips)
    }).eq("id",bb.id);

    const { data:ps2 } = await supabase.from("casino_players").select("*").eq("game_id",g.id);
    const pot = (ps2||[]).reduce((s,p)=>s+(p.current_bet||0),0);
    const currentBet = Math.max(...(ps2||[]).map(p=>p.current_bet||0),0);

    await supabase.from("casino_games").update({
      status:GAME_STATUS.PLAYING, deck, pot, current_bet: currentBet, last_raise_to: currentBet,
      round:"preflop", community_cards:[], community_visible:0, dealer_index:dealerSeat,
      last_raiser_index: bigBlindIdx, current_player_index: firstToActIdx,
      turn_deadline: new Date(Date.now()+BETTING_TIME_LIMIT).toISOString()
    }).eq("id",g.id);
  }

  // ----------------------- Render -------------------------------------------
  const communityVisible = game?.community_visible||0;
  const board = (game?.community_cards||[]).slice(0,communityVisible);

  // minimal playing card view
  const Card = ({card})=>{
    if(!card) return <div className="w-10 h-14 rounded bg-white/10 border border-white/20 flex items-center justify-center">?</div>;
    const red = card.suit==="H"||card.suit==="D"; const sym = {S:'♠',H:'♥',D:'♦',C:'♣'}[card.suit]||'?';
    return (
      <div className="w-10 h-14 rounded bg-white border border-gray-300 shadow text-center relative">
        <div className={`absolute left-1 top-0.5 text-[10px] font-bold ${red?'text-red-600':'text-black'}`}>{card.value}</div>
        <div className={`h-full grid place-items-center text-lg ${red?'text-red-600':'text-black'}`}>{sym}</div>
      </div>
    );
  };

  if(!mounted){
    return <Layout><div className="min-h-[var(--app-100vh)] grid place-items-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">Loading…</div></Layout>;
  }

  // LOBBY
  if(screen==="lobby"){
    return (
      <Layout>
        <div className="min-h-[var(--app-100vh)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-extrabold text-white text-center mb-2">🃏 Texas Hold’em Rooms</h1>
            <div className="bg-black/30 rounded-xl p-4 border border-white/10 mb-4">
              <div className="flex items-center justify-between">
                <div className="text-white">Vault:</div>
                <div className="text-emerald-400 font-bold">{fmt(vault)} MLEO</div>
              </div>
              <div className="mt-3">
                <input value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="Enter your name…" className="w-full px-3 py-3 rounded-lg bg-white/10 border border-white/20 text-white"/>
              </div>
              {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
            </div>

            <div className="space-y-3">
              {(tables||[]).map(t=>(
                <div key={t.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold text-lg">🪑 {t.name}</div>
                    <div className="text-white/70 text-sm">Blinds: <span className="text-amber-400">{fmt(t.small_blind)}</span> / <span className="text-amber-400">{fmt(t.big_blind)}</span></div>
                    <div className="text-white/60 text-sm">Min Buy-in: <span className="text-emerald-400">{fmt(t.min_buyin)}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/60 text-sm mb-1">Players: {t.current_players}/{t.max_players}</div>
                    <button onClick={()=>joinTable(t)} disabled={t.current_players>=t.max_players || vault < t.min_buyin} className={`px-5 py-3 rounded-lg font-bold ${ (t.current_players>=t.max_players || vault<t.min_buyin)?'bg-gray-600 text-gray-300':'bg-emerald-600 text-white hover:brightness-110' }`}>JOIN TABLE</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-6">
              <button onClick={()=>router.push('/arcade')} className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold">← Back to Arcade</button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // TABLE (waiting)
  if(screen==="table"){
    return (
      <Layout>
        <div className="min-h-[var(--app-100vh)] grid place-items-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
          <div className="w-full max-w-xl bg-black/30 border border-white/10 rounded-2xl p-5">
            <h2 className="text-white text-2xl font-extrabold text-center mb-2">🃏 {selectedTable?.name}</h2>
            <div className="text-center text-white/70 mb-4">Waiting for players… ({players.length}/{selectedTable?.max_players})</div>
            <div className="space-y-2 mb-4">
              {players.map(p=>(
                <div key={p.id} className={`p-3 rounded-lg ${p.id===playerId?'bg-purple-500/20 border border-purple-400':'bg-white/5 border border-white/10'}`}>
                  <div className="text-white font-semibold">{p.player_name}{p.id===playerId?' (You)':''}</div>
                  <div className="text-white/60 text-sm">Seat #{(p.seat_index||0)+1} • {fmt(p.chips)} chips</div>
                </div>
              ))}
            </div>
            <div className="text-center">
              <button onClick={leaveTable} className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold">Leave Table</button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // GAME

  // Safe slider calculations to prevent NaN/min>max issues
  const sliderMin = (game?.current_bet || 0) + Math.max(
    (game?.last_raise_to || 0) - (game?.current_bet || 0),
    (selectedTable?.big_blind || 0)
  );
  const sliderMax = (me?.current_bet || 0) + (me?.chips || 0);
  const safeMin = Number.isFinite(sliderMin) ? sliderMin : 0;
  const safeMax = Number.isFinite(sliderMax) && sliderMax >= safeMin ? sliderMax : safeMin;

  const safeRaiseTo = Math.min(
    Math.max(raiseTo ?? safeMin, safeMin),
    safeMax
  );

  return (
    <Layout>
      <div className="min-h-[var(--app-100vh)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-white text-2xl font-extrabold">🃏 {selectedTable?.name}</div>
              <div className="text-white/70 text-sm">Round: {game?.round} • Pot: {fmt(game?.pot||0)} MLEO</div>
            </div>
            <button onClick={leaveTable} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold">Leave Table</button>
          </div>

          <div className="bg-green-900/80 border border-green-600/40 rounded-2xl p-6">
            {/* Community */}
            <div className="text-center mb-6">
              <div className="text-white/70 text-sm mb-2">Community Cards</div>
              <div className="flex gap-2 justify-center">
                {board.map((c,i)=><Card key={i} card={c}/>)}
                {Array.from({length:5-board.length}).map((_,i)=><Card key={`x${i}`} />)}
              </div>
            </div>

            {/* Players */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {players.map((p,idx)=>{
                const cur = game?.current_player_index===idx;
                const isMe = p.id===playerId;
                return (
                  <div key={p.id} className={`p-3 rounded-lg border-2 ${cur?'border-yellow-400 bg-yellow-400/20': isMe?'border-purple-400 bg-purple-400/20':'border-white/20 bg-white/5'}`}>
                    <div className="text-white text-sm font-bold">{p.player_name}{isMe?' (You)':''}{cur?' 👑':''}</div>
                    <div className="text-emerald-300 text-xs">{fmt(p.chips)} chips</div>
                    {p.current_bet>0 && <div className="text-amber-300 text-xs">Bet: {fmt(p.current_bet)}</div>}
                    {isMe && p.hole_cards && <div className="flex gap-1 mt-1 justify-center">{p.hole_cards.map((c,i)=><Card key={i} card={c}/>)}</div>}
                    {p.status===PLAYER_STATUS.FOLDED && <div className="text-red-400 text-xs mt-1">FOLDED</div>}
                    {p.status===PLAYER_STATUS.ALL_IN && <div className="text-orange-400 text-xs mt-1">ALL IN</div>}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            {isMyTurn && me?.status!==PLAYER_STATUS.FOLDED && game?.round!=="showdown" && (
              <div className="text-center">
                <div className="text-white/70 text-sm mb-2">Your Turn {timeLeft>0?`(${timeLeft}s)`:''}</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button onClick={()=>act("fold")} className="px-5 py-3 rounded-lg bg-red-600 text-white font-bold">FOLD</button>
                  <button onClick={()=>act((game?.current_bet||0)>(me?.current_bet||0)?"call":"check")} className="px-5 py-3 rounded-lg bg-blue-600 text-white font-bold">
                    {(game?.current_bet||0)>(me?.current_bet||0)?"CALL":"CHECK"}
                  </button>
                  <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-lg px-3 py-2">
                    <input
                      type="range"
                      min={safeMin}
                      max={safeMax}
                      step={selectedTable?.big_blind || 1}
                      value={safeRaiseTo}
                      onChange={(e)=>setRaiseTo(Number(e.target.value))}
                      className="w-40"
                    />
                    <input
                      type="number"
                      value={safeRaiseTo}
                      onChange={(e)=>{
                        const v = Number(e.target.value) || 0;
                        setRaiseTo(Math.min(Math.max(v, safeMin), safeMax));
                      }}
                      className="w-24 bg-black/40 border border-white/20 rounded px-2 py-1 text-white"
                    />
                    <button onClick={()=>act("raise", safeRaiseTo)} className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold">RAISE TO</button>
                  </div>
                  <button onClick={()=>act("allin")} className="px-5 py-3 rounded-lg bg-orange-600 text-white font-bold">ALL IN</button>
                </div>
              </div>
            )}

            {game?.status===GAME_STATUS.FINISHED && (
              <div className="text-center text-white mt-4">Hand finished. Starting next hand…</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}