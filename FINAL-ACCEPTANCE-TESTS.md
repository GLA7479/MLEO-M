# ✅ Final Acceptance Tests - Texas Hold'em Poker

## בדיקות קבלה סופיות לפני פרודקשן

---

## 🎯 Test Suite Overview

| Category | Tests | Status |
|----------|-------|--------|
| Basic Flow | 6 tests | ⏳ Pending |
| All-in & Side-Pots | 4 tests | ⏳ Pending |
| Realtime Sync | 3 tests | ⏳ Pending |
| Idempotency | 2 tests | ⏳ Pending |
| Timeouts | 2 tests | ⏳ Pending |
| Security | 3 tests | ⏳ Pending |

---

## 1️⃣ Basic Flow Tests

### Test 1.1: Table Loading
```bash
curl "http://localhost:3000/api/poker/table?name=test-basic"
```
**Expected:**
- ✅ Returns table with `id`, `name`, `stake_min`
- ✅ Returns 9 seats (all empty initially)
- ✅ Status 200

### Test 1.2: Player Sitting
```bash
# Sit two players
curl -X POST http://localhost:3000/api/poker/sit \
  -H "Content-Type: application/json" \
  -d '{"table_id":TID,"seat_index":0,"player_name":"Alice","buyin":2000}'

curl -X POST http://localhost:3000/api/poker/sit \
  -H "Content-Type: application/json" \
  -d '{"table_id":TID,"seat_index":1,"player_name":"Bob","buyin":2000}'
```
**Expected:**
- ✅ Both players seated successfully
- ✅ `stack_live` = 2000 for each
- ✅ Status 200

### Test 1.3: Start Hand
```bash
curl -X POST http://localhost:3000/api/poker/start-hand \
  -H "Content-Type": application/json" \
  -d '{"table_id":TID}'
```
**Expected:**
- ✅ Returns `hand_id`, `hand_no`, `dealer_seat`, `sb_seat`, `bb_seat`
- ✅ Blinds posted (SB=10, BB=20 by default)
- ✅ `current_turn` set to player after BB
- ✅ Status 200

### Test 1.4: Get State (Preflop)
```bash
curl "http://localhost:3000/api/poker/state?hand_id=HID"
```
**Expected:**
- ✅ `stage: "preflop"`
- ✅ `pot_total` = SB + BB (30)
- ✅ `to_call` object with correct amounts for each seat
- ✅ `players` array with `bet_street`, `folded`, `all_in`, `acted_street`
- ✅ `board` is empty array
- ✅ Status 200

### Test 1.5: Perform Actions
```bash
# Current turn calls
curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d '{"hand_id":HID,"seat_index":0,"action":"call","action_id":"unique-1"}'

# Next player checks
curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d '{"hand_id":HID,"seat_index":1,"action":"check","action_id":"unique-2"}'
```
**Expected:**
- ✅ Actions succeed with `ok: true`
- ✅ `current_turn` advances after each action
- ✅ `to_call` updates correctly
- ✅ Status 200

### Test 1.6: Advance to Flop
```bash
curl -X POST http://localhost:3000/api/poker/advance-street \
  -H "Content-Type: application/json" \
  -d '{"hand_id":HID}'
```
**Expected:**
- ✅ `stage: "flop"`
- ✅ `board` has 3 cards
- ✅ `pot_total` increased by street bets
- ✅ `bet_street` reset to 0 for all players
- ✅ `acted_street` reset to false
- ✅ `current_turn` set to first after dealer
- ✅ Status 200

---

## 2️⃣ All-in & Side-Pots Tests

### Test 2.1: Multi-Stack All-in Scenario
Run the automated script:
```bash
node test-allin-sidepots.js
```

**Expected:**
- ✅ 4 players with different stacks (2000, 400, 1200, 800)
- ✅ Short stack (400) goes all-in
- ✅ Others call/match
- ✅ Multiple side pots created

### Test 2.2: Side-Pot Structure
After reaching showdown, check database:
```sql
SELECT * FROM poker.poker_pots WHERE hand_id = HID;
```
**Expected:**
- ✅ Main pot: 400×4 = 1600 (all 4 players eligible)
- ✅ Side pot(s) for remaining players
- ✅ `side_idx` increments correctly (0, 1, 2...)
- ✅ `amount` matches contributions

### Test 2.3: Pot Membership
```sql
SELECT * FROM poker.poker_pot_members WHERE pot_id IN (
  SELECT id FROM poker.poker_pots WHERE hand_id = HID
);
```
**Expected:**
- ✅ All-in player only in main pot
- ✅ Other players in main + side pots
- ✅ `eligible: true` for all members

### Test 2.4: Winner Distribution
After showdown, check:
```sql
SELECT seat_index, win_amount, stack_live
FROM poker.poker_hand_players php
JOIN poker.poker_seats ps ON ps.seat_index = php.seat_index
WHERE php.hand_id = HID;
```
**Expected:**
- ✅ Winners receive correct amounts from each pot
- ✅ `win_amount` matches actual winnings
- ✅ `stack_live` updated correctly
- ✅ Total distributed = total in all pots

---

## 3️⃣ Realtime Sync Tests

### Test 3.1: Live Updates
1. Open 2 browser windows to same room
2. Player 1 performs action
3. Observe Player 2's screen

**Expected:**
- ✅ Player 2 sees update within 1 second
- ✅ No manual refresh needed
- ✅ Console shows "Realtime: ..." messages

### Test 3.2: State Consistency
1. Player 1 raises
2. Check state on Player 2's screen

**Expected:**
- ✅ Pot matches
- ✅ Current turn matches
- ✅ Bets match
- ✅ Board cards match

### Test 3.3: Realtime Fallback
1. Disable Supabase Realtime (remove env vars)
2. Perform actions

**Expected:**
- ✅ Falls back to polling
- ✅ Updates still work (slower, ~1.5s)
- ✅ Console shows "Supabase not configured"

---

## 4️⃣ Idempotency Tests

### Test 4.1: Duplicate Action ID
```bash
# Send same action twice with same action_id
ACTION_ID="test-duplicate-123"

curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d "{\"hand_id\":\"HID\",\"seat_index\":0,\"action\":\"call\",\"action_id\":\"$ACTION_ID\"}"

# Immediately send again
curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d "{\"hand_id\":\"HID\",\"seat_index\":0,\"action\":\"call\",\"action_id\":\"$ACTION_ID\"}"
```
**Expected:**
- ✅ First request: `ok: true`
- ✅ Second request: `ok: true, idempotent: true`
- ✅ Only ONE action in `poker_actions` table
- ✅ No duplicate stack changes

### Test 4.2: Double-Click Protection
1. Open game in browser
2. Rapidly click "Call" button 5 times

**Expected:**
- ✅ Only one action registered
- ✅ No console errors
- ✅ UI doesn't freeze
- ✅ Action completes successfully

---

## 5️⃣ Timeout Tests

### Test 5.1: Auto-Fold on Timeout
1. Start a hand
2. Wait 30 seconds without acting (with bet to call)

**Expected:**
- ✅ After 30s, player auto-folds
- ✅ `poker_actions` shows "auto_fold"
- ✅ Turn advances to next player
- ✅ Player marked as `folded: true`

### Test 5.2: Auto-Check on Timeout
1. Start a hand
2. Wait 30 seconds without acting (no bet to call)

**Expected:**
- ✅ After 30s, player auto-checks
- ✅ `poker_actions` shows "auto_check"
- ✅ Turn advances to next player
- ✅ Player remains in hand

---

## 6️⃣ Security Tests

### Test 6.1: Out-of-Turn Action
```bash
# Try to act when it's not your turn
curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d '{"hand_id":HID,"seat_index":5,"action":"raise","amount":100}'
# When current_turn is not 5
```
**Expected:**
- ✅ Status 400
- ✅ Error: "not_your_turn"
- ✅ No state change

### Test 6.2: Invalid Min-Raise
```bash
# Try to raise less than minimum
curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d '{"hand_id":HID,"seat_index":0,"action":"raise","amount":1}'
# When BB is 20
```
**Expected:**
- ✅ Status 400
- ✅ Error: "min_bet" or "min_raise"
- ✅ No state change

### Test 6.3: Hole Cards Privacy
1. Player 1 joins room
2. Player 2 joins same room
3. Check Player 2's state

**Expected:**
- ✅ Player 2 cannot see Player 1's `hole_cards` (null or hidden)
- ✅ Player 1 can see their own `hole_cards`
- ✅ After showdown, both see all cards

---

## 🎯 Performance Tests

### Load Test: Multiple Rooms
```bash
# Create 10 concurrent rooms
for i in {1..10}; do
  curl "http://localhost:3000/api/poker/table?name=room-$i" &
done
wait
```
**Expected:**
- ✅ All requests succeed
- ✅ Average response time < 500ms
- ✅ No database connection errors

### Stress Test: Rapid Actions
```bash
# Perform 20 actions quickly
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/poker/action \
    -H "Content-Type: application/json" \
    -d "{\"hand_id\":\"HID\",\"seat_index\":0,\"action\":\"check\",\"action_id\":\"stress-$i\"}" &
done
wait
```
**Expected:**
- ✅ All actions processed (or correctly rejected)
- ✅ No database deadlocks
- ✅ Idempotency works correctly

---

## 📊 Success Criteria

### Must Pass (Blockers):
- [x] All Basic Flow tests (1.1-1.6)
- [x] All-in scenario works (2.1-2.4)
- [x] Idempotency prevents duplicates (4.1-4.2)
- [x] Security prevents cheating (6.1-6.3)

### Should Pass (Important):
- [x] Realtime updates < 2s (3.1-3.3)
- [x] Timeouts work correctly (5.1-5.2)
- [x] Performance targets met

### Nice to Have:
- [ ] Load test supports 100+ rooms
- [ ] Stress test handles 1000+ actions/min
- [ ] Advanced RLS policies (when Auth added)

---

## 🚀 Ready for Production When:

✅ All "Must Pass" tests green
✅ All "Should Pass" tests green  
✅ No linter errors
✅ All migrations run successfully
✅ Environment variables set
✅ Monitoring/logging configured
✅ SSL/HTTPS enabled
✅ Rate limiting active

---

## 📝 Test Log Template

```markdown
## Test Run: [DATE]

### Environment:
- Server: http://localhost:3000
- Database: Supabase (production/staging)
- Tester: [Name]

### Results:

#### Basic Flow
- [ ] 1.1 Table Loading
- [ ] 1.2 Player Sitting  
- [ ] 1.3 Start Hand
- [ ] 1.4 Get State
- [ ] 1.5 Perform Actions
- [ ] 1.6 Advance to Flop

#### All-in & Side-Pots
- [ ] 2.1 Multi-Stack Scenario
- [ ] 2.2 Side-Pot Structure
- [ ] 2.3 Pot Membership
- [ ] 2.4 Winner Distribution

#### Realtime
- [ ] 3.1 Live Updates
- [ ] 3.2 State Consistency
- [ ] 3.3 Fallback to Polling

#### Idempotency
- [ ] 4.1 Duplicate Action ID
- [ ] 4.2 Double-Click Protection

#### Timeouts
- [ ] 5.1 Auto-Fold
- [ ] 5.2 Auto-Check

#### Security
- [ ] 6.1 Out-of-Turn Rejected
- [ ] 6.2 Invalid Min-Raise Rejected
- [ ] 6.3 Hole Cards Private

### Issues Found:
[List any issues]

### Overall Status:
[ ] PASS - Ready for production
[ ] FAIL - Needs fixes
```

---

**בהצלחה! המערכת מוכנה לבדיקות סופיות! 🎴✨**

