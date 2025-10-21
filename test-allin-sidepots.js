#!/usr/bin/env node
// test-allin-sidepots.js
// Complete test scenario for All-in + Side-Pots with 4 players
// Usage: node test-allin-sidepots.js

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function generateActionId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function api(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.log(`❌ ${endpoint}: ${JSON.stringify(data)}`);
      return null;
    }
    
    console.log(`✅ ${endpoint}`);
    return data;
  } catch (error) {
    console.log(`❌ ${endpoint}: ${error.message}`);
    return null;
  }
}

async function runAllInTest() {
  console.log('🎴 All-in + Side-Pots Test Scenario');
  console.log('=' .repeat(60));
  
  // Step 1: Create table
  console.log('\n📋 Step 1: Create Table');
  const tableData = await api('/api/poker/table?name=allin-test');
  if (!tableData) return;
  
  const tableId = tableData.table.id;
  console.log(`   Table ID: ${tableId}`);
  
  // Step 2: Sit 4 players with different stacks
  console.log('\n📋 Step 2: Sit 4 Players with Different Stacks');
  console.log('   P0: 2000 chips (big stack)');
  console.log('   P1: 400 chips (short stack - will be all-in)');
  console.log('   P2: 1200 chips (medium stack)');
  console.log('   P3: 800 chips (medium-small stack)');
  
  const players = [
    { name: 'P0', seat: 0, buyin: 2000 },
    { name: 'P1', seat: 1, buyin: 400 },
    { name: 'P2', seat: 2, buyin: 1200 },
    { name: 'P3', seat: 3, buyin: 800 },
  ];
  
  for (const p of players) {
    const result = await api('/api/poker/sit', {
      method: 'POST',
      body: JSON.stringify({
        table_id: tableId,
        seat_index: p.seat,
        player_name: p.name,
        buyin: p.buyin,
      }),
    });
    if (!result) return;
    console.log(`   ✓ ${p.name} sat at seat ${p.seat} with ${p.buyin} chips`);
  }
  
  // Step 3: Start hand
  console.log('\n📋 Step 3: Start Hand');
  const handData = await api('/api/poker/start-hand', {
    method: 'POST',
    body: JSON.stringify({ table_id: tableId }),
  });
  if (!handData) return;
  
  const handId = handData.hand_id;
  console.log(`   Hand ID: ${handId}`);
  console.log(`   Dealer: Seat ${handData.dealer_seat}`);
  console.log(`   SB: Seat ${handData.sb_seat} (${handData.sb} chips)`);
  console.log(`   BB: Seat ${handData.bb_seat} (${handData.bb} chips)`);
  
  // Step 4: Get initial state
  console.log('\n📋 Step 4: Initial State (Preflop)');
  let state = await api(`/api/poker/state?hand_id=${handId}`);
  if (!state) return;
  
  console.log(`   Stage: ${state.hand.stage}`);
  console.log(`   Current Turn: Seat ${state.hand.current_turn}`);
  console.log(`   Pot: ${state.hand.pot_total}`);
  console.log(`   To Call:`, JSON.stringify(state.to_call));
  
  // Step 5: Preflop actions - create All-in scenario
  console.log('\n📋 Step 5: Preflop Actions (Creating All-in Scenario)');
  
  // Scenario: P1 (400) goes all-in, others call/raise
  // Expected pots:
  // - Main pot: 400×4 = 1600 (all 4 eligible)
  // - Side pot 1: (800-400)×3 = 1200 (P0, P2, P3 eligible - not P1)
  // - Side pot 2: (1200-800)×2 = 800 (P0, P2 eligible)
  // - Side pot 3: (2000-1200)×1 = 800 (P0 only)
  
  const actions = [
    { seat: 3, action: 'raise', amount: 200, desc: 'P3 raises to 200' },
    { seat: 0, action: 'call', amount: 200, desc: 'P0 calls 200' },
    { seat: 1, action: 'allin', amount: 400, desc: 'P1 all-in 400 (SHORT STACK)' },
    { seat: 2, action: 'call', amount: 400, desc: 'P2 calls 400' },
    { seat: 3, action: 'call', amount: 200, desc: 'P3 completes to 400' },
    { seat: 0, action: 'call', amount: 200, desc: 'P0 completes to 400' },
  ];
  
  for (const a of actions) {
    // Get current state to check turn
    state = await api(`/api/poker/state?hand_id=${handId}`);
    if (!state) return;
    
    if (state.hand.current_turn !== a.seat) {
      console.log(`   ⚠️ Skipping ${a.desc} - not their turn (current: ${state.hand.current_turn})`);
      continue;
    }
    
    const toCall = state.to_call[a.seat] || 0;
    let actualAmount = a.amount;
    
    if (a.action === 'call') {
      actualAmount = toCall;
    } else if (a.action === 'allin') {
      // Get player's stack
      const player = state.players.find(p => p.seat_index === a.seat);
      actualAmount = state.seats.find(s => s.seat_index === a.seat)?.stack_live || a.amount;
    }
    
    console.log(`   → ${a.desc}`);
    const result = await api('/api/poker/action', {
      method: 'POST',
      body: JSON.stringify({
        hand_id: handId,
        seat_index: a.seat,
        action: a.action,
        amount: actualAmount,
        action_id: generateActionId(),
      }),
    });
    if (!result) {
      console.log(`   ⚠️ Action failed, continuing...`);
    }
    
    // Small delay to avoid race conditions
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Step 6: Check state after preflop
  console.log('\n📋 Step 6: State After Preflop');
  state = await api(`/api/poker/state?hand_id=${handId}`);
  if (!state) return;
  
  console.log(`   Pot: ${state.hand.pot_total}`);
  console.log(`   Players:`);
  state.players.forEach(p => {
    const seat = state.seats.find(s => s.seat_index === p.seat_index);
    console.log(`     Seat ${p.seat_index}: Bet=${p.bet_street}, AllIn=${p.all_in}, Folded=${p.folded}, Stack=${seat?.stack_live}`);
  });
  
  // Step 7: Advance to Flop
  console.log('\n📋 Step 7: Advance to Flop');
  const flopResult = await api('/api/poker/advance-street', {
    method: 'POST',
    body: JSON.stringify({ hand_id: handId }),
  });
  if (!flopResult) return;
  
  console.log(`   Stage: ${flopResult.stage}`);
  console.log(`   Board: ${flopResult.board?.join(' ') || 'N/A'}`);
  
  // Step 8: Fast-forward through streets (check all the way)
  console.log('\n📋 Step 8: Fast-Forward Through Streets');
  const streets = ['flop', 'turn', 'river'];
  
  for (const street of streets) {
    state = await api(`/api/poker/state?hand_id=${handId}`);
    if (!state || state.hand.stage === 'hand_end') break;
    
    console.log(`\n   ${street.toUpperCase()}:`);
    console.log(`   Current Turn: Seat ${state.hand.current_turn}`);
    
    // All active players check
    const activePlayers = state.players.filter(p => !p.folded && !p.all_in);
    for (const p of activePlayers) {
      if (state.hand.current_turn === p.seat_index) {
        console.log(`   → Seat ${p.seat_index}: check`);
        await api('/api/poker/action', {
          method: 'POST',
          body: JSON.stringify({
            hand_id: handId,
            seat_index: p.seat_index,
            action: 'check',
            action_id: generateActionId(),
          }),
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Re-fetch state
        state = await api(`/api/poker/state?hand_id=${handId}`);
      }
    }
    
    // Advance street
    console.log(`   → Advancing from ${state.hand.stage}...`);
    const advResult = await api('/api/poker/advance-street', {
      method: 'POST',
      body: JSON.stringify({ hand_id: handId }),
    });
    if (advResult) {
      console.log(`   ✓ Advanced to: ${advResult.stage}`);
      if (advResult.board) {
        console.log(`   Board: ${advResult.board.join(' ')}`);
      }
    }
    
    if (advResult?.stage === 'hand_end') {
      console.log('\n📊 SHOWDOWN!');
      if (advResult.winners) {
        console.log('   Winners:');
        advResult.winners.forEach(w => {
          console.log(`     Seat ${w.seat}: Won ${w.amount} chips`);
        });
      }
      break;
    }
  }
  
  // Step 9: Final state check
  console.log('\n📋 Step 9: Final State Check');
  state = await api(`/api/poker/state?hand_id=${handId}`);
  if (state) {
    console.log(`   Final Stage: ${state.hand.stage}`);
    console.log(`   Final Pot: ${state.hand.pot_total}`);
    console.log('\n   Final Stacks:');
    state.seats
      .filter(s => s.player_name)
      .forEach(s => {
        const player = state.players.find(p => p.seat_index === s.seat_index);
        const winAmount = player?.win_amount || 0;
        console.log(`     ${s.player_name} (Seat ${s.seat_index}): ${s.stack_live} chips (won: ${winAmount})`);
      });
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ All-in + Side-Pots Test Complete!\n');
  console.log('📊 Expected Behavior:');
  console.log('   1. P1 (400 chips) was all-in → eligible for main pot only');
  console.log('   2. Side pots created for remaining players');
  console.log('   3. Winners determined by hand strength');
  console.log('   4. Pots distributed correctly');
  console.log('   5. stack_live updated for all players');
  console.log('\n💡 Check poker.poker_pots and poker.poker_pot_members tables');
  console.log('   to verify side-pot creation and distribution.\n');
}

// Run test
runAllInTest().catch(console.error);

