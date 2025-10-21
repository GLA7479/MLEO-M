# 🐛 Bug Fix: Sit/Leave Issues

## בעיה שזוהתה
המשתמש לא יכול לשבת - כל המושבים מציגים "Idle" ולא ניתן לשבת או לעזוב.

---

## 🔍 גורמי השורש

### 1. **sit.js** - דריסת מושבים תפוסים
**הבעיה:** הקוד המקורי עשה UPDATE ללא בדיקה אם המושב פנוי, מה שהוביל לדריסת שחקנים קיימים.

**הפתרון:**
```sql
UPDATE poker.poker_seats
SET player_name=$3, stack=$4, stack_live=$4, sat_out=false
WHERE table_id=$1 AND seat_index=$2 
  AND (player_name IS NULL OR player_name = '')  -- ✅ רק אם פנוי!
RETURNING seat_index, player_name, stack_live, sat_out
```

אם המושב תפוס, `rowCount = 0` והשרת מחזיר `409 Conflict`.

---

### 2. **leave.js** - מחיקת רשומות במקום ריקון
**הבעיה:** הקוד המקורי עשה `DELETE FROM poker_seats`, מה שגרם למושב "להיעלם" לגמרי מהטבלה. כשהטבלה מטעינה מחדש, היא מצפה ל-9 מושבים, אבל חסרים כאלה שנמחקו.

**הפתרון:**
```sql
UPDATE poker.poker_seats
SET player_name = NULL,
    stack_live  = 0,
    sat_out     = false
WHERE table_id=$1 AND seat_index=$2
RETURNING seat_index
```

עכשיו המושב נשאר קיים, פשוט ריק.

---

### 3. **Client-Side** - בדיקת מושב תפוס לא מדויקת
**הבעיה:** הקוד בדק `if (serverSeat)` - אבל גם מושב ריק עם `player_name: null` מחזיר object, אז הבדיקה חסמה את כולם!

**הפתרון:**
```javascript
const serverSeat = seatByIndex.get(seatIdx);
if (serverSeat && serverSeat.player_name) {  // ✅ בדיקה גם של player_name!
  alert("Seat is already taken!");
  return;
}
```

---

### 4. **Logging & Error Handling**
הוספנו logging מפורט:
```javascript
console.log("apiSit called:", { table_id, seat_index, player_name, buyin });
console.log("apiSit response:", response.status, data);
```

וטיפול בשגיאות:
```javascript
if (data.error === 'seat_taken') {
  alert("Seat is already taken!");
} else {
  alert(`Failed to sit: ${data.error || 'Unknown error'}`);
}
```

---

## ✅ קבצים שתוקנו

1. **`pages/api/poker/sit.js`**
   - ✅ בדיקת מושב פנוי (`player_name IS NULL OR player_name = ''`)
   - ✅ יצירת מושב אם לא קיים (`ON CONFLICT DO NOTHING`)
   - ✅ החזרת 409 אם מושב תפוס
   - ✅ Transaction safety (`BEGIN/COMMIT/ROLLBACK`)

2. **`pages/api/poker/leave.js`**
   - ✅ UPDATE במקום DELETE
   - ✅ ריקון מושב (NULL, 0, false)
   - ✅ החזרת 404 אם מושב לא קיים
   - ✅ Error handling

3. **`game/mleo-t-holdem.js`**
   - ✅ בדיקת `serverSeat.player_name` נוסף ל-`serverSeat`
   - ✅ Logging מפורט ב-`apiSit` ו-`apiLeave`
   - ✅ טיפול בשגיאות HTTP (409, 404, 500)
   - ✅ החזרת Vault במקרה של כישלון
   - ✅ הצגת הודעות שגיאה ברורות למשתמש

---

## 🧪 בדיקות להרצה

### Test 1: טעינת שולחן
```bash
curl "http://localhost:3000/api/poker/table?name=test"
```
**Expected:** 9 seats, all with `player_name: null`

---

### Test 2: ישיבה למושב
```bash
curl -X POST http://localhost:3000/api/poker/sit \
  -H "Content-Type: application/json" \
  -d '{"table_id":"<TID>","seat_index":0,"player_name":"Alice","buyin":2000}'
```
**Expected:** `200 OK` + `{seat: {seat_index:0, player_name:"Alice", stack_live:2000}}`

---

### Test 3: ניסיון ישיבה למושב תפוס
```bash
# Same seat as above
curl -X POST http://localhost:3000/api/poker/sit \
  -H "Content-Type: application/json" \
  -d '{"table_id":"<TID>","seat_index":0,"player_name":"Bob","buyin":2000}'
```
**Expected:** `409 Conflict` + `{error: "seat_taken"}`

---

### Test 4: עזיבה
```bash
curl -X POST http://localhost:3000/api/poker/leave \
  -H "Content-Type: application/json" \
  -d '{"table_id":"<TID>","seat_index":0}'
```
**Expected:** `200 OK` + `{ok: true}`

---

### Test 5: טעינה מחדש - המושב ריק
```bash
curl "http://localhost:3000/api/poker/table?name=test"
```
**Expected:** Seat 0 has `player_name: null`, still exists in array

---

## 🎮 בדיקה בדפדפן

### סצנריו A: שחקן בודד
1. פתח `http://localhost:3000/mleo-t-holdem?room=test`
2. הכנס שם: "Player1"
3. לחץ "Sit here" בכיסא 0
4. **Expected:** ✅ יושב בהצלחה, מושב מציג "Player1 (You)" + chips
5. לחץ "Leave table"
6. **Expected:** ✅ עוזב, מושב חוזר ל-"Sit here"
7. שב שוב
8. **Expected:** ✅ עובד בלי בעיות

---

### סצנריו B: שני שחקנים
1. **חלון 1:** `http://localhost:3000/mleo-t-holdem?room=test`
   - שם: "Alice"
   - שב בכיסא 0

2. **חלון 2:** `http://localhost:3000/mleo-t-holdem?room=test`
   - שם: "Bob"
   - ניסיון לשבת בכיסא 0
   - **Expected:** ❌ "Seat is already taken!"
   - שב בכיסא 1
   - **Expected:** ✅ מצליח

3. **חלון 1:** לחץ "Leave table"
4. **חלון 2:** מושב 0 אמור להיות פנוי עכשיו
5. **חלון 2:** שב בכיסא 0
   - **Expected:** ✅ מצליח

---

## 🐛 Console Logs (לdebug)

אחרי התיקון, צפה לראות:
```javascript
// כשמנסה לשבת:
apiSit called: {table_id: "abc-123", seat_index: 0, player_name: "Alice", buyin: 2000}
apiSit response: 200 {seat: {...}}

// אם מושב תפוס:
apiSit called: {table_id: "abc-123", seat_index: 0, player_name: "Bob", buyin: 2000}
apiSit response: 409 {error: "seat_taken"}

// כשעוזב:
apiLeave called: {table_id: "abc-123", seat_index: 0}
apiLeave response: 200 {ok: true}
```

---

## 📊 לפני ואחרי

### ❌ לפני התיקון:
- לא ניתן לשבת (כל המושבים "Idle")
- leave מוחק רשומות ומקלקל את המצב
- אין feedback למשתמש
- אי אפשר לדעת מה השגיאה

### ✅ אחרי התיקון:
- ניתן לשבת במושבים פנויים
- leave מרוקן מושב ללא מחיקה
- הודעות ברורות למשתמש
- Logging מפורט ב-console
- טיפול נכון בשגיאות

---

## 🚀 סטטוס

- [x] תוקן sit.js - מניעת דריסה
- [x] תוקן leave.js - UPDATE במקום DELETE
- [x] תוקן client - בדיקת player_name
- [x] הוסף logging מפורט
- [x] הוסף error handling
- [x] נבדק ללא linter errors

**המערכת מוכנה לשימוש!** 🎉

