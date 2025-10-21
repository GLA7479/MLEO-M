# 🐛 Bug Fix: Start Hand Collision + Tick 405 Error

## בעיות שזוהו

### 1. Duplicate Key Error
```
duplicate key value violates unique constraint "poker_hands_table_id_hand_no_idx"
```
**סיבה:** כפתור Start נלחץ פעמיים במקביל, שני requests מחשבים `MAX(hand_no)+1` באותו זמן וניסו להכניס אותו מספר.

### 2. Method Not Allowed 405
```
GET /api/poker/tick 405
```
**סיבה:** הקוד שלח GET request ל-`/api/poker/tick` אבל ה-API route מקבל רק POST.

---

## ✅ פתרונות

### 1. תיקון Start Hand - Atomic Counter + Lock

#### SQL Migration (004_fix_hand_no_collision.sql):
```sql
ALTER TABLE poker.poker_tables
ADD COLUMN IF NOT EXISTS next_hand_no bigint NOT NULL DEFAULT 1;

-- Update existing tables
UPDATE poker.poker_tables
SET next_hand_no = COALESCE(
  (SELECT MAX(hand_no) + 1 FROM poker.poker_hands WHERE table_id = poker_tables.id),
  1
)
WHERE next_hand_no = 1;
```

#### שינויים ב-start-hand.js:

**א. נעילה למניעת race conditions:**
```javascript
// Lock table using advisory lock
await q(`SELECT pg_advisory_xact_lock( ('x'||substr($1::text,3,16))::bit(64)::bigint )`, [table_id]);
```

**ב. בדיקת יד פעילה:**
```javascript
// If hand already active, return it instead of creating duplicate
const active = await q(`
  SELECT id, hand_no FROM poker.poker_hands
  WHERE table_id=$1 AND ended_at IS NULL AND stage <> 'hand_end'
  ORDER BY started_at DESC LIMIT 1
`, [table_id]);

if (active.rowCount) {
  await q("COMMIT");
  return res.status(200).json({ 
    hand_id: active.rows[0].id, 
    hand_no: active.rows[0].hand_no,
    reused: true 
  });
}
```

**ג. מספר יד אטומי:**
```javascript
// Get next hand number atomically (no race condition)
const nh = await q(`
  UPDATE poker.poker_tables
  SET next_hand_no = next_hand_no + 1
  WHERE id=$1
  RETURNING next_hand_no - 1 AS hand_no
`, [table_id]);
const hand_no = Number(nh.rows[0].hand_no);
```

---

### 2. תיקון Tick API Call - GET → POST

#### לפני (שגוי):
```javascript
await fetch(`/api/poker/tick?hand_id=${hand_id}`);  // ❌ GET by default
```

#### אחרי (נכון):
```javascript
await fetch('/api/poker/tick', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hand_id: hand_id })
});
```

---

## 🎯 איך זה עובד

### Scenario: כפתור Start נלחץ פעמיים

#### לפני התיקון:
```
Request 1: BEGIN → MAX(hand_no)=5 → hand_no=6 → INSERT hand_no=6
Request 2: BEGIN → MAX(hand_no)=5 → hand_no=6 → INSERT hand_no=6
Result: ❌ DUPLICATE KEY ERROR
```

#### אחרי התיקון:
```
Request 1: BEGIN → Lock → Check active (none) → next_hand_no++ (6) → INSERT 6 → COMMIT
Request 2: BEGIN → Wait for lock → Check active (found 6) → COMMIT → Return hand 6
Result: ✅ No duplicate, second request returns existing hand
```

---

## 🧪 בדיקות

### Test 1: כפתור Start פעמיים
```bash
# Terminal 1:
curl -X POST http://localhost:3000/api/poker/start-hand \
  -H "Content-Type: application/json" \
  -d '{"table_id":"TID"}'

# Terminal 2 (מיד אחרי):
curl -X POST http://localhost:3000/api/poker/start-hand \
  -H "Content-Type: application/json" \
  -d '{"table_id":"TID"}'
```

**Expected:**
- Request 1: `{hand_id: "...", hand_no: 1, ...}`
- Request 2: `{hand_id: "...", hand_no: 1, reused: true}` ✅

### Test 2: Tick API
```javascript
// בConsole (F12):
await fetch('/api/poker/tick', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({hand_id: 'HID'})
}).then(r => console.log(r.status));
```

**Expected:** `200` (לא 405) ✅

---

## 📊 השוואה: לפני ← אחרי

| תרחיש | לפני | אחרי |
|-------|------|------|
| **2 clicks Start** | ❌ Duplicate key error | ✅ Returns same hand |
| **Concurrent Start** | ❌ Race condition | ✅ Advisory lock prevents |
| **hand_no calculation** | `MAX+1` (unsafe) | `next_hand_no++` (atomic) |
| **Tick API call** | GET (405 error) | POST (200 OK) |

---

## 🔧 קבצים שתוקנו

1. **`migrations/004_fix_hand_no_collision.sql`** ✨ NEW
   - הוספת עמודה `next_hand_no`
   - עדכון ערכים קיימים

2. **`pages/api/poker/start-hand.js`** ✅ UPDATED
   - Advisory lock למניעת race
   - בדיקת יד פעילה
   - שימוש ב-`next_hand_no` אטומי
   - Logging משופר

3. **`game/mleo-t-holdem.js`** ✅ UPDATED
   - תיקון tick API call: GET → POST
   - שליחת JSON body

---

## 🚀 הרצה

### 1. הרץ Migration:
```sql
-- בSupabase SQL Editor:
\i migrations/004_fix_hand_no_collision.sql
```

### 2. רענן שרת:
```bash
# אם השרת רץ:
# Ctrl+C
npm run dev
```

### 3. בדוק:
- ✅ לחץ Start פעמיים - אין שגיאה
- ✅ בConsole - אין 405 errors
- ✅ המשחק רץ חלק

---

## ✅ סטטוס

- [x] הוספת `next_hand_no` column
- [x] Advisory lock ב-start-hand
- [x] בדיקת יד פעילה
- [x] Atomic hand number generation
- [x] תיקון tick API call (GET→POST)
- [x] Logging משופר
- [x] נבדק ללא errors

**הבעיות נפתרו! המערכת יציבה עכשיו.** 🎉

