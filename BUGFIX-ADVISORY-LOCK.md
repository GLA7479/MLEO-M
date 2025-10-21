# 🐛 Bug Fix: Advisory Lock Hexadecimal Error

## בעיה
```
"\"-\" is not a valid hexadecimal digit"
```

**סיבה:** השורה שמנסה ליצור advisory lock ניסתה להמיר UUID ישירות ל-hexadecimal, אבל UUID מכיל מקפים (`-`) שגורמים לשגיאה.

---

## ❌ הקוד השגוי (לפני):

```javascript
await q(`SELECT pg_advisory_xact_lock( ('x'||substr($1::text,3,16))::bit(64)::bigint )`, [table_id]);
```

**הבעיה:**
- `table_id` הוא UUID כמו: `123e4567-e89b-12d3-a456-426614174000`
- `substr($1::text,3,16)` מחזיר: `3e4567-e89b-12d3`
- המקף (`-`) גורם ל: `"\"-\" is not a valid hexadecimal digit"`

---

## ✅ הפתרון (אחרי):

### גרסה מועדפת - hashtextextended:
```javascript
await q(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [table_id]);
```

**למה זה עובד:**
- `hashtextextended(text, seed)` מחזירה `bigint` ישירות
- מקבלת כל מחרוזת (כולל UUID עם מקפים)
- מחזירה hash יציב של 64-bit
- זמינה ב-PostgreSQL 9.x+ (כולל Supabase)

### חלופה - md5:
אם `hashtextextended` לא זמינה:
```javascript
await q(`
  SELECT pg_advisory_xact_lock(
    ('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint
  )
`, [table_id]);
```

---

## 🎯 מה עושה Advisory Lock?

Advisory lock מבטיח שרק **transaction אחד בכל פעם** יכול להתחיל יד חדשה עבור אותו שולחן.

### תרחיש ללא Lock:
```
Request 1: BEGIN → Get hand_no → INSERT hand...
Request 2: BEGIN → Get hand_no → INSERT hand... ❌ DUPLICATE!
```

### תרחיש עם Lock:
```
Request 1: BEGIN → LOCK (acquired) → Get hand_no → INSERT → COMMIT (lock released)
Request 2: BEGIN → LOCK (waiting...) → Acquired → Check active hand → Return existing ✅
```

---

## 🧪 בדיקה

### Test: כפתור Start פעמיים במהירות

```javascript
// Console (F12):
const table = await fetch('/api/poker/table?name=test').then(r => r.json());

// Click 1:
fetch('/api/poker/start-hand', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({table_id: table.table.id})
}).then(r => r.json()).then(console.log);

// Click 2 (מיד אחרי):
fetch('/api/poker/start-hand', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({table_id: table.table.id})
}).then(r => r.json()).then(console.log);
```

**Expected:**
```javascript
// Response 1:
{hand_id: "abc-123", hand_no: 1, dealer_seat: 0, ...}

// Response 2:
{hand_id: "abc-123", hand_no: 1, reused: true, ...}  // ✅ Same hand!
```

**לא צריך לראות:**
- ❌ `"\"-\" is not a valid hexadecimal digit"`
- ❌ `duplicate key value violates unique constraint`
- ❌ 500 Internal Server Error

---

## 📊 השוואה

| גישה | יתרונות | חסרונות |
|------|---------|----------|
| **substr + bit cast** | פשוט | ❌ נכשל עם UUID (מקפים) |
| **md5 + substr** | עובד תמיד | קצת יותר מסובך |
| **hashtextextended** ✅ | פשוט + מהיר + עובד | דורש PG 9.x+ (יש לכולם) |

---

## 🔧 קבצים שתוקנו

1. **`pages/api/poker/start-hand.js`** ✅ UPDATED
   - שורה 23: החלפת advisory lock ל-`hashtextextended`
   - הסרת הסתמכות על hexadecimal parsing

---

## ✅ תוצאה סופית

**לפני:**
```
POST /api/poker/start-hand
→ 500 Error: "\"-\" is not a valid hexadecimal digit"
```

**אחרי:**
```
POST /api/poker/start-hand
→ 200 OK: {hand_id: "...", hand_no: 1}
```

---

**התיקון פשוט ויעיל! המערכת תעבוד כעת.** 🎉

