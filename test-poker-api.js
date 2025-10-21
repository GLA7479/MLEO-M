#!/usr/bin/env node
// test-poker-api.js - Smoke tests for poker API endpoints
// Usage: node test-poker-api.js

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testAPI(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n🔵 Testing: ${options.method || 'GET'} ${endpoint}`);
  
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
      console.log(`❌ Failed (${response.status}):`, data);
      return { success: false, data, status: response.status };
    }
    
    console.log(`✅ Success:`, JSON.stringify(data, null, 2));
    return { success: true, data, status: response.status };
  } catch (error) {
    console.log(`❌ Error:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🎴 Starting Texas Hold\'em Poker API Smoke Tests\n');
  console.log('📍 Base URL:', BASE_URL);
  console.log('=' .repeat(60));

  // Test 1: Create/Load Table
  console.log('\n📋 Test 1: Create/Load Table');
  const tableResult = await testAPI('/api/poker/table?name=test-room');
  if (!tableResult.success) {
    console.log('\n❌ Cannot proceed without table. Make sure:');
    console.log('   1. Server is running (npm run dev)');
    console.log('   2. DATABASE_URL is set in .env.local');
    console.log('   3. Database schema is created');
    return;
  }
  
  const tableId = tableResult.data.table.id;
  console.log(`\n🆔 Table ID: ${tableId}`);

  // Test 2: Sit Players
  console.log('\n📋 Test 2: Sit Players (Alice & Bob)');
  const aliceResult = await testAPI('/api/poker/sit', {
    method: 'POST',
    body: JSON.stringify({
      table_id: tableId,
      seat_index: 0,
      player_name: 'Alice',
      buyin: 2000,
    }),
  });
  
  const bobResult = await testAPI('/api/poker/sit', {
    method: 'POST',
    body: JSON.stringify({
      table_id: tableId,
      seat_index: 1,
      player_name: 'Bob',
      buyin: 2000,
    }),
  });

  if (!aliceResult.success || !bobResult.success) {
    console.log('\n❌ Failed to seat players');
    return;
  }

  // Test 3: Start Hand
  console.log('\n📋 Test 3: Start Hand');
  const startResult = await testAPI('/api/poker/start-hand', {
    method: 'POST',
    body: JSON.stringify({ table_id: tableId }),
  });

  if (!startResult.success) {
    console.log('\n❌ Failed to start hand');
    return;
  }

  const handId = startResult.data.hand_id;
  console.log(`\n🆔 Hand ID: ${handId}`);

  // Test 4: Get State
  console.log('\n📋 Test 4: Get Hand State');
  const stateResult = await testAPI(`/api/poker/state?hand_id=${handId}`);
  
  if (!stateResult.success) {
    console.log('\n❌ Failed to get state');
    return;
  }

  console.log('\n📊 Hand State Summary:');
  console.log(`   Stage: ${stateResult.data.hand.stage}`);
  console.log(`   Current Turn: ${stateResult.data.hand.current_turn}`);
  console.log(`   Pot Total: ${stateResult.data.hand.pot_total}`);
  console.log(`   Players: ${stateResult.data.players.length}`);
  console.log(`   To Call:`, stateResult.data.to_call);

  // Test 5: Action - Player acts
  const currentTurn = stateResult.data.hand.current_turn;
  const toCallAmount = stateResult.data.to_call[currentTurn] || 0;
  
  console.log(`\n📋 Test 5: Player Action (Seat ${currentTurn})`);
  const actionResult = await testAPI('/api/poker/action', {
    method: 'POST',
    body: JSON.stringify({
      hand_id: handId,
      seat_index: currentTurn,
      action: toCallAmount > 0 ? 'call' : 'check',
      amount: toCallAmount,
    }),
  });

  if (!actionResult.success) {
    console.log('\n❌ Failed to perform action');
    return;
  }

  // Test 6: Check updated state
  console.log('\n📋 Test 6: Check Updated State');
  const state2Result = await testAPI(`/api/poker/state?hand_id=${handId}`);
  
  if (state2Result.success) {
    console.log('\n📊 Updated State:');
    console.log(`   Stage: ${state2Result.data.hand.stage}`);
    console.log(`   Current Turn: ${state2Result.data.hand.current_turn}`);
    console.log(`   Actions: ${state2Result.data.actions.length}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Smoke Tests Complete!\n');
  console.log('✅ All basic endpoints are working');
  console.log('\n📝 Next Steps:');
  console.log('   1. Open browser to http://localhost:3000/mleo-t-holdem?room=test');
  console.log('   2. Test full hand flow (preflop → flop → turn → river → showdown)');
  console.log('   3. Test All-in scenarios for side-pots');
  console.log('   4. Test multiple players (3+)');
  console.log('\n💡 Tip: Check the console for detailed API responses');
}

// Run tests
runTests().catch(console.error);

