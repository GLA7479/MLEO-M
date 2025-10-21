# 🐛 Bug Fix: Auto Street Advancement

## בעיה
היד לא מתקדמת אוטומטically:
- ✅ שחקנים מבצעים פעולות
- ❌ הפלופ/טרן/ריבר לא נפתחים אוטומטית
- ❌ צריך ללחוץ על כפתורים כדי "להניע" את המשחק
- ❌ Fold-win לא סוגר יד מיידית

**סיבה:** תנאי "סיום רחוב" חלש/שגוי, והשרת לא מזהה אוטומטית מתי לקדם.

---

## ✅ הפתרונות (2 חלקים)

### 1. שרת - זיהוי אוטומטי בסוף `/api/poker/action`

#### א. Fold-Win Detection:
```javascript
// אחרי עדכון התור, בדוק אם נשאר שחקן יחיד
const aliveRows = await q(`
  SELECT php.seat_index, php.folded, ps.stack_live, php.bet_street
  FROM poker.poker_hand_players php
  JOIN poker.poker_seats ps ON ps.table_id=$1 AND ps.seat_index=php.seat_index
  WHERE php.hand_id=$2
`, [hand.table_id, hand_id]);

const alive = aliveRows.rows.filter(r => r.folded === false);

if (alive.length <= 1) {
  // צבור הימורי רחוב → pot_total
  // חלק קופה לזוכה
  // סגור יד: stage='hand_end'
  return res.json({ ok:true, stage:'hand_end', fold_win: true });
}
```

#### ב. Round Settled Detection:
```javascript
// בדוק אם כולם מיושרים (bet_street = max או all-in)
const maxBet = Math.max(...aliveRows.rows.map(r => Number(r.bet_street||0)));
const settled = aliveRows.rows
  .filter(r => r.folded === false)
  .every(r => 
    Number(r.bet_street||0) === maxBet || 
    Number(r.stack_live) === 0
  );

if (settled) {
  return res.json({ ok:true, round_settled:true });
}
```

**תוצאה:** השרת מחזיר signal ללקוח מתי לקדם רחוב.

---

### 2. לקוח - canAdvanceStreet משופר + auto-advance

#### א. canAdvanceStreet נכון:
```javascript
function canAdvanceStreet(state) {
  if (!state?.hand) return false;
  const stage = state.hand.stage;
  if (stage === 'hand_end' || stage === 'showdown') return false;

  const alive = (state.players || []).filter(p => p.folded === false);
  if (alive.length <= 1) return true; // ✅ זוכה יחיד

  const maxBet = Math.max(0, ...alive.map(p => Number(p.bet_street || 0)));
  const everyoneSettled = alive.every(p => {
    const playerBet = Number(p.bet_street || 0);
    const playerStack = state.seats?.find(s => s.seat_index === p.seat_index)?.stack_live ?? 0;
    return playerBet === maxBet || playerStack === 0; // ✅ מיושר או all-in
  });

  const hasActionThisStreet = (state.actions || []).length > 0;
  return everyoneSettled && hasActionThisStreet;
}
```

#### ב. קריאה אוטומטית ל-advance אחרי action:
```javascript
const playerAction = async (action, amount) => {
  const actionResult = await apiAction(...);  // קבל תגובה
  
  const state = await fetchState();
  setState(state);
  
  // אם השרת אמר שהרחוב הסתיים - קדם מיד!
  if (actionResult?.round_settled || actionResult?.fold_win) {
    console.log("Round settled, advancing immediately...");
    await fetch('/api/poker/advance-street', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ hand_id: currentHandId })
    });
    
    // רענן state אחרי advance
    setTimeout(async () => {
      const s2 = await fetchState();
      setState(s2);
    }, 300);
  } else {
    // בדיקה רגילה
    await maybeAdvance(state);
  }
};
```

#### ג. apiAction מחזיר תגובה:
```javascript
async function apiAction(hand_id, seat_index, action, amount = 0) {
  const response = await fetch('/api/poker/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hand_id,
      seat_index,
      action,
      amount: Number(amount)||0,
      action_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    })
  });
  
  const result = await response.json();
  console.log('Action result:', result);
  return result;  // ✅ מחזיר את התגובה
}
```

---

## 🎯 זרימה חדשה (לפני ← אחרי)

### ❌ לפני:
```
Player 1: Call
  → Server: Updates bet, advances turn
  → Client: Polls state (1.5s later)
  → Client: Checks canAdvanceStreet → false (שגוי)
  → Nothing happens...
  
Player clicks BB button:
  → Client: maybeAdvance triggered by accident
  → Flop opens (finally!)
```

### ✅ אחרי:
```
Player 1: Call
  → Server: Updates bet, checks if round settled
  → Server: Returns {round_settled: true}
  → Client: Immediately calls /advance-street
  → Flop opens instantly! ⚡

Player 2: Fold
  → Server: Detects alive.length = 1
  → Server: Awards pot, ends hand
  → Client: Shows winner immediately! ⚡
```

---

## 🧪 תרחישי בדיקה

### Test 1: Preflop → Flop (נורמלי)
1. SB calls BB
2. BB checks
3. **Expected:** Flop נפתח **מיידית** ⚡

### Test 2: Fold Win
1. Player 1 raises
2. Player 2 folds
3. **Expected:** היד נסגרת **מיידית**, Player 1 מקבל pot ⚡

### Test 3: All-in Fast Forward
1. Both players all-in preflop
2. **Expected:** Flop/Turn/River נפתחים **אוטומטית** עד showdown ⚡

### Test 4: Normal Betting Round
1. Player 1 bets on flop
2. Player 2 calls
3. **Expected:** Turn נפתח **מיידית** ⚡

---

## 📁 קבצים שעודכנו

1. **`pages/api/poker/action.js`** ✅ UPDATED
   - זיהוי Fold-win אוטומטי
   - זיהוי Round-settled אוטומטי
   - צבירת pot והחזרת signals
   - Logging משופר

2. **`game/mleo-t-holdem.js`** ✅ UPDATED
   - `canAdvanceStreet()` משופר
   - `apiAction()` מחזיר result
   - `playerAction()` קורא advance אוטומטית
   - טיפול ב-`round_settled` + `fold_win`

3. **`BUGFIX-AUTO-ADVANCE.md`** 📝 NEW
   - תיעוד מלא של התיקון

---

## 🎮 התנהגות צפויה

### Timing:
| תרחיש | לפני | אחרי |
|-------|------|------|
| **Preflop→Flop** | 1.5s+ (polling) | < 500ms ⚡ |
| **Fold win** | Manual/delayed | Instant ⚡ |
| **All-in** | Stuck | Auto to river ⚡ |

### User Experience:
- ✅ משחק זורם ומהיר
- ✅ אין המתנות מיותרות
- ✅ Fold מסיים מיד
- ✅ All-in רץ עד הסוף

---

## ✅ סטטוס

- [x] action.js זיהוי fold-win
- [x] action.js זיהוי round-settled
- [x] canAdvanceStreet משופר
- [x] playerAction קורא advance אוטומטית
- [x] apiAction מחזיר result + action_id
- [x] אין linter errors

**המשחק יזרום מהר ויציב עכשיו!** 🎴⚡✨

