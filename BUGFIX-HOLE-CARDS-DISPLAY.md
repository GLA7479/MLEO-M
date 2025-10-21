# 🐛 Bug Fix: Hole Cards Not Displaying

## בעיה
לא רואים קלפים (hole cards) במשחק - כל המושבים מציגים גב קלף (🂠) במקום הקלפים האמיתיים.

**סיבה:** ה-API של `state` לא מחזיר את ה-hole cards של הצופה, כך שה-UI לא יודע מה לצייר.

---

## 🔍 ניתוח הבעיה

### מה קרה:
1. ✅ השרת שמר את הקלפים ב-`poker_hand_players.hole_cards` (start-hand)
2. ❌ השרת הסתיר את הקלפים מכולם (כולל הצופה עצמו!)
3. ❌ הלקוח קיבל `players` ללא `hole_cards`
4. ❌ פונקציית `holeFor()` החזירה `null`
5. ❌ ה-UI ציירה גב קלף (🂠)

---

## ✅ הפתרון (2 חלקים)

### 1. שרת - החזרת קלפי הצופה בלבד

#### עדכון `/api/poker/state.js`:

**קבלת שם הצופה:**
```javascript
const { hand_id, viewer } = req.method === "POST" ? req.body : req.query;
```

**מציאת מושב הצופה:**
```javascript
let my_seat_index = null;
let my_hole = null;

if (viewer && String(viewer).trim()) {
  const me = await q(
    `SELECT seat_index FROM poker.poker_seats 
     WHERE table_id=$1 AND player_name=$2`,
    [hand.table_id, String(viewer).trim()]
  );
  
  if (me.rowCount) {
    my_seat_index = me.rows[0].seat_index;
    const hc = await q(
      `SELECT hole_cards FROM poker.poker_hand_players 
       WHERE hand_id=$1 AND seat_index=$2`,
      [hand_id, my_seat_index]
    );
    if (hc.rowCount) {
      my_hole = hc.rows[0].hole_cards || null;
    }
  }
}
```

**החזרת הנתונים:**
```javascript
return res.json({
  hand,
  table,
  board: [...],
  players: [...],
  seats: [...],
  to_call: {...},
  my_seat_index,    // ← המושב שלי
  my_hole           // ← הקלפים שלי בלבד!
});
```

---

### 2. לקוח - שליחת שם הצופה + שימוש בקלפים

#### א. state חדש להחזקת הקלפים:
```javascript
const [myHole, setMyHole] = useState(null);
```

#### ב. עדכון כל הקריאות ל-state (6 מקומות):

**Realtime subscriptions:**
```javascript
fetch(`/api/poker/state?hand_id=${currentHandId}&viewer=${encodeURIComponent(displayName || '')}`)
  .then(r => r.json())
  .then(s => {
    if (!s?.error && s.hand) {
      setState(s);
      if (s.my_hole) setMyHole(s.my_hole);  // ← שמירת הקלפים שלי
    }
  });
```

**Polling interval:**
```javascript
const response = await fetch(`/api/poker/state?hand_id=${hand_id}&viewer=${encodeURIComponent(displayName || '')}`);
const state = await response.json();

if (state.my_hole) {
  setMyHole(state.my_hole);
}
```

**After action:**
```javascript
const r = await fetch(`/api/poker/state?hand_id=${currentHandId}&viewer=${encodeURIComponent(displayName || '')}`);
if (r.ok) {
  const state = await r.json();
  if (state.my_hole) {
    setMyHole(state.my_hole);
  }
}
```

#### ג. עדכון `holeFor()` להשתמש ב-myHole:
```javascript
function holeFor(seatIdx) {
  // If this is my seat and I have hole cards from server, use them
  if (seatIdx === meIdx && myHole && Array.isArray(myHole) && myHole.length === 2) {
    return myHole;  // ✅ הקלפים שלי מהשרת
  }
  
  // In showdown, everyone's cards are visible
  if (stage === "showdown" || stage === "hand_end") {
    const fromPlayers = state.players.find(p => p.seat_index === seatIdx)?.hole_cards;
    if (fromPlayers && fromPlayers.length === 2) return fromPlayers;
  }
  
  // Fallback
  return null;
}
```

---

## 🎯 זרימת המידע

### לפני התיקון:
```
Server: hole_cards saved ✅
Server → Client: {} (no hole cards) ❌
Client: holeFor() → null ❌
UI: Displays 🂠 ❌
```

### אחרי התיקון:
```
Server: hole_cards saved ✅
Client → Server: ?viewer=ERAN ✅
Server → Client: {my_hole: ["As","Kh"]} ✅
Client: holeFor() → ["As","Kh"] ✅
UI: Displays A♠ K♥ ✅
```

---

## 🧪 בדיקה

### Test 1: שחקן יחיד רואה את הקלפים שלו
```javascript
// Console (F12):
const state = await fetch('/api/poker/state?hand_id=HID&viewer=ERAN').then(r => r.json());
console.log('My hole cards:', state.my_hole);
```

**Expected:** `["As", "Kh"]` (או 2 קלפים אחרים)

### Test 2: שחקן לא רואה קלפים של אחרים
```javascript
const state = await fetch('/api/poker/state?hand_id=HID&viewer=ERAN').then(r => r.json());
console.log('Players:', state.players);
```

**Expected:** שדה `hole_cards` לא קיים ב-players (או null)

### Test 3: בShowdown כולם רואים הכל
```javascript
// אחרי שהגענו ל-showdown:
const state = await fetch('/api/poker/state?hand_id=HID&viewer=ERAN').then(r => r.json());
console.log('Stage:', state.hand.stage);  // "showdown"
console.log('My hole:', state.my_hole);    // ["As","Kh"]
// בעתיד נוסיף החזרת כל הקלפים ב-showdown
```

---

## 📁 קבצים שעודכנו

1. **`pages/api/poker/state.js`** ✅ UPDATED
   - קבלת פרמטר `viewer`
   - שאילתת קלפים של הצופה בלבד
   - החזרת `my_seat_index` + `my_hole`

2. **`game/mleo-t-holdem.js`** ✅ UPDATED (7 שינויים)
   - state חדש: `myHole`
   - 6 מקומות: הוספת `&viewer=` לקריאות state
   - עדכון `holeFor()` להשתמש ב-`myHole`

3. **`BUGFIX-HOLE-CARDS-DISPLAY.md`** 📝 NEW
   - תיעוד מלא של הבעיה והפתרון

---

## 🎮 מה תראה עכשיו:

### במסך שלך:
```
┌─────────────────┐
│ Seat #1         │
│ You        2000 │
│ Idle       Hole:│
│ A♠ K♥          │ ← הקלפים שלך! ✅
└─────────────────┘
```

### במסך של שחקן אחר:
```
┌─────────────────┐
│ Seat #1         │
│ ERAN       2000 │
│ Idle       Hole:│
│ 🂠 🂠          │ ← לא רואה את הקלפים שלך ✅
└─────────────────┘
```

---

## ✅ סטטוס

- [x] `state.js` מחזיר `my_hole` לצופה
- [x] לקוח שולח `viewer` בכל קריאה
- [x] `myHole` state נוסף
- [x] `holeFor()` משתמש ב-`myHole`
- [x] פרטיות נשמרת (שחקן אחר לא רואה)
- [x] אין linter errors

**המערכת תציג קלפים כעת! נסה - זה אמור לעבוד!** 🎴✨
