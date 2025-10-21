# 🎴 Texas Hold'em Poker - Complete System Documentation

## מערכת פוקר מלאה עם Realtime, Side-Pots, Idempotency ואבטחה

---

## 📦 מה יש במערכת?

### Backend API (8 Endpoints)
```
/api/poker/table         - GET/POST  - טעינה/יצירת שולחן
/api/poker/sit           - POST      - ישיבה ליד השולחן
/api/poker/leave         - POST      - עזיבת השולחן
/api/poker/start-hand    - POST      - התחלת יד חדשה
/api/poker/state         - GET       - קבלת מצב היד
/api/poker/action        - POST      - ביצוע פעולה (fold/check/call/raise/allin)
/api/poker/advance-street- POST      - קידום רחוב (flop→turn→river→showdown)
/api/poker/tick          - POST      - טיפול בtimeouts
```

### Frontend
```
pages/mleo-t-holdem.js   - עמוד המשחק
game/mleo-t-holdem.js    - לוגיקה מלאה + Realtime
```

### Libraries & Utilities
```
lib/db.js                - PostgreSQL connection pool
lib/holdem-eval.js       - הערכת ידיים (7 קלפים)
test-poker-api.js        - Smoke tests אוטומטיים
test-allin-sidepots.js   - בדיקת All-in מלאה
public/test-poker.html   - Test console אינטראקטיבי
```

### Database Migrations
```
migrations/002_idempotency.sql - Idempotency + side-pots tables
migrations/003_security_rls.sql- Row Level Security policies
```

### Documentation
```
README-TESTING.md           - מדריך בדיקות מפורט
PRODUCTION-HARDENING.md     - קשיחות לפרודקשן
FINAL-ACCEPTANCE-TESTS.md   - בדיקות קבלה סופיות
```

---

## 🚀 Quick Start (3 דקות)

### 1. התקנה
```bash
cd MLEO-GAME
npm install
```

### 2. הגדרת Database
צור קובץ `.env.local`:
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
PGSSL=true
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. הרץ Migrations
ב-Supabase SQL Editor:
```sql
-- Run schema from your existing setup
-- Then run:
\i migrations/002_idempotency.sql
```

### 4. הרץ שרת
```bash
npm run dev
```

### 5. בדיקה מהירה
```bash
# Option A: Automated tests
node test-poker-api.js

# Option B: Interactive console
# Open: http://localhost:3000/test-poker.html

# Option C: Browser
# Open: http://localhost:3000/mleo-t-holdem?room=test
```

---

## ⚡ Features Implemented

### ✅ Core Poker Logic
- [x] 2-9 שחקנים
- [x] SB/BB אוטומטיים
- [x] Dealer rotation
- [x] חלוקת קלפים
- [x] Preflop/Flop/Turn/River
- [x] Fold/Check/Call/Bet/Raise/All-in
- [x] 30s turn timer
- [x] Auto-fold/check on timeout

### ✅ Advanced Features
- [x] **Side-Pots**: חלוקה מדויקת עם All-in
- [x] **Hand Evaluation**: הערכת ידיים מלאה (7 קלפים)
- [x] **Realtime Sync**: עדכונים מיידיים (Supabase Realtime)
- [x] **Idempotency**: מניעת double-click
- [x] **Min-Raise**: חישוב מדויק
- [x] **Room Isolation**: כל room נפרד

### ✅ Production Ready
- [x] Row Level Security policies
- [x] Connection pooling
- [x] Error handling & logging
- [x] Transactions & locks
- [x] Rate limiting ready
- [x] Cron-ready timeout engine

---

## 🎮 How to Play

### Solo Testing (1 Browser)
1. Open `http://localhost:3000/mleo-t-holdem?room=solo`
2. Set display name: "Player1"
3. Click "Sit here" on seat 0 (buy-in: 2000)
4. Click "Sit here" on seat 1 (buy-in: 2000) - pretend to be Player2
5. Click "Start" button
6. Click actions when your turn comes
7. Watch the game progress through streets

### Multiplayer Testing (2 Browsers/Devices)
1. **Player 1**: Open `http://localhost:3000/mleo-t-holdem?room=friends`
   - Name: Alice
   - Sit on seat 0
   - Click "Start"

2. **Player 2**: Open `http://localhost:3000/mleo-t-holdem?room=friends`
   - Name: Bob
   - Sit on seat 1

3. **Both players**: See real-time updates as actions occur!

### Testing All-in Scenario
```bash
# Run automated All-in test with 4 players
node test-allin-sidepots.js

# Expected output:
# ✅ P0: 2000 chips
# ✅ P1: 400 chips (short stack - will be all-in)
# ✅ P2: 1200 chips
# ✅ P3: 800 chips
# 🎯 Side pots created correctly
# 🏆 Winners determined and paid
```

---

## 🔧 API Usage Examples

### Create Room & Sit Players
```javascript
// 1. Create table
const table = await fetch('/api/poker/table?name=my-room').then(r => r.json());
const tableId = table.table.id;

// 2. Sit players
await fetch('/api/poker/sit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    table_id: tableId,
    seat_index: 0,
    player_name: 'Alice',
    buyin: 2000,
  }),
});

await fetch('/api/poker/sit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    table_id: tableId,
    seat_index: 1,
    player_name: 'Bob',
    buyin: 2000,
  }),
});

// 3. Start hand
const hand = await fetch('/api/poker/start-hand', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ table_id: tableId }),
}).then(r => r.json());

const handId = hand.hand_id;
```

### Get State & Perform Action
```javascript
// Get current state
const state = await fetch(`/api/poker/state?hand_id=${handId}`).then(r => r.json());

console.log({
  stage: state.hand.stage,           // "preflop"
  currentTurn: state.hand.current_turn, // 0
  pot: state.hand.pot_total,         // 30
  toCall: state.to_call,              // {0: 20, 1: 0}
  board: state.hand.board,            // []
});

// Perform action (with idempotency)
const actionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

await fetch('/api/poker/action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hand_id: handId,
    seat_index: 0,
    action: 'call',
    amount: 20,
    action_id: actionId,  // Idempotency key
  }),
});
```

### Advance Through Streets
```javascript
// Advance from Preflop to Flop
const flop = await fetch('/api/poker/advance-street', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hand_id: handId }),
}).then(r => r.json());

console.log({
  stage: flop.stage,  // "flop"
  board: flop.board,  // ["As", "Kh", "Qd"]
});

// Continue to Turn
const turn = await fetch('/api/poker/advance-street', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hand_id: handId }),
}).then(r => r.json());

console.log({
  stage: turn.stage,  // "turn"
  board: turn.board,  // ["As", "Kh", "Qd", "Jc"]
});

// River
const river = await fetch('/api/poker/advance-street', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hand_id: handId }),
}).then(r => r.json());

console.log({
  stage: river.stage,  // "river"
  board: river.board,  // ["As", "Kh", "Qd", "Jc", "Td"]
});

// Showdown
const showdown = await fetch('/api/poker/advance-street', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hand_id: handId }),
}).then(r => r.json());

console.log({
  stage: showdown.stage,  // "hand_end"
  winners: showdown.winners, // [{seat: 0, amount: 1500}]
});
```

---

## 🎯 Realtime Integration

הקוד ב-`mleo-t-holdem.js` כבר כולל Realtime:

```javascript
// Auto-subscribes when hand starts
useEffect(() => {
  if (!currentHandId) return;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const channel = supabase
    .channel(`hand:${currentHandId}`)
    .on('postgres_changes', 
      { event: '*', schema: 'poker', table: 'poker_hands', filter: `id=eq.${currentHandId}` },
      () => refreshState()
    )
    .on('postgres_changes',
      { event: '*', schema: 'poker', table: 'poker_hand_players', filter: `hand_id=eq.${currentHandId}` },
      () => refreshState()
    )
    .on('postgres_changes',
      { event: 'INSERT', schema: 'poker', table: 'poker_actions', filter: `hand_id=eq.${currentHandId}` },
      () => refreshState()
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [currentHandId]);
```

**הפעלה:**
1. הפעל Realtime בSupabase Dashboard → Database → Replication
2. סמן את `poker` schema
3. פתח 2 חלונות דפדפן
4. שחק - עדכונים יגיעו מיידית!

---

## 📊 Database Schema

### Main Tables
```sql
poker.poker_tables        - שולחנות
poker.poker_seats         - מושבים (9 per table)
poker.poker_hands         - ידיים
poker.poker_hand_players  - שחקנים ביד
poker.poker_actions       - היסטוריית פעולות
poker.poker_pots          - קופות (main + side)
poker.poker_pot_members   - זכאות לקופות
```

### Key Fields
```sql
poker_hands:
  - stage: preflop/flop/turn/river/showdown/hand_end
  - current_turn: מי התור
  - pot_total: סכום בקופה
  - board: קלפי השולחן
  - turn_deadline: זמן timeout

poker_hand_players:
  - bet_street: הימור ברחוב נוכחי
  - contrib_total: סה"כ תרומה (לside-pots)
  - folded: האם קיפל
  - all_in: האם all-in
  - acted_street: האם פעל ברחוב נוכחי
  - win_amount: כמה זכה
  - hole_cards: 2 קלפים

poker_actions:
  - action_id: UUID לidempotency
  - action: fold/check/call/bet/raise/allin
  - amount: סכום
```

---

## 🔐 Security Notes

### Current Implementation
- ✅ SQL injection protected (parameterized queries)
- ✅ Transactions prevent race conditions
- ✅ FOR UPDATE locks prevent concurrent edits
- ✅ Idempotency prevents double-clicks
- ✅ Turn validation (not_your_turn)
- ✅ Min-raise validation

### After Adding Auth
Run `migrations/003_security_rls.sql` to enable:
- RLS policies on all tables
- Hole cards hidden from opponents
- Players can only act on their own seats
- Secure views for safe data access

---

## 🐛 Troubleshooting

### "Table load failed"
```bash
# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check if poker schema exists
psql $DATABASE_URL -c "SELECT * FROM poker.poker_tables LIMIT 1"
```

### "Cannot advance street"
```bash
# Check if poker-evaluator is installed
npm list poker-evaluator

# If missing:
npm install poker-evaluator
```

### "Realtime not working"
1. Check Supabase Dashboard → Database → Replication
2. Enable realtime on `poker` schema
3. Check browser console for subscription status
4. Verify env vars are set correctly

### "Actions not working"
```bash
# Check state API
curl "http://localhost:3000/api/poker/state?hand_id=YOUR_HAND_ID"

# Check current_turn matches your seat_index
# Check to_call amount for your seat
```

---

## 📈 Performance Tips

### Database
- Keep connection pool size appropriate (default 20)
- Monitor slow queries in Supabase Dashboard
- Add indexes if needed (already included in migrations)

### Frontend
- Realtime reduces polling frequency (1.5s → instant)
- State caching prevents unnecessary re-renders
- Idempotency reduces duplicate requests

### Backend
- Transactions are short and efficient
- FOR UPDATE locks only necessary rows
- Queries use indexes effectively

---

## 🚀 Deployment to Vercel

```bash
# 1. Push to GitHub
git add .
git commit -m "Complete Texas Hold'em Poker system"
git push

# 2. Deploy
vercel --prod

# 3. Set environment variables in Vercel Dashboard
DATABASE_URL=postgresql://...
PGSSL=true
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Post-Deployment
1. Run migrations on production DB
2. Enable Realtime in Supabase (production project)
3. Test with `test-poker-api.js` pointing to production URL
4. Monitor logs in Vercel Dashboard

---

## 📚 Further Reading

- `README-TESTING.md` - מדריך בדיקות מפורט
- `PRODUCTION-HARDENING.md` - קשיחות לפרודקשן
- `FINAL-ACCEPTANCE-TESTS.md` - בדיקות קבלה
- `SUPABASE_SETUP.md` - הגדרת Supabase
- `QUICK_START.md` - התחלה מהירה

---

## ✅ What's Complete

- [x] Full poker game logic (2-9 players)
- [x] All poker actions (fold/check/call/raise/allin)
- [x] Side-pots for All-in scenarios
- [x] Hand evaluation (7-card best hand)
- [x] Realtime multiplayer sync
- [x] Idempotency (anti double-click)
- [x] Timeout engine
- [x] Room isolation
- [x] Min-raise validation
- [x] Database transactions & locks
- [x] Error handling & logging
- [x] Test suites & tools
- [x] Production hardening docs
- [x] Security (RLS ready)

---

## 🎉 Ready to Play!

המערכת **מוכנה לחלוטין** לשימוש מקצועי!

```bash
# Start playing NOW:
npm run dev
# Open: http://localhost:3000/mleo-t-holdem?room=fun
```

**בהצלחה! 🎴♠️♥️♦️♣️**

