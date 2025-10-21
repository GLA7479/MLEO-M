# 🧪 Texas Hold'em Poker - Testing Guide

## 🚀 Quick Start

### 1. התקנה והגדרה ראשונית

```bash
# התקן dependencies
npm install

# הגדר .env.local עם DATABASE_URL שלך
# (קבל אותו מ-Supabase Dashboard → Settings → Database)
```

צור קובץ `.env.local`:
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.gltguiacptjnldxpqbtb.supabase.co:5432/postgres
PGSSL=true
```

### 2. הרצת השרת

```bash
npm run dev
# השרת רץ על http://localhost:3000
```

---

## 🧪 Smoke Tests (בדיקות מהירות)

### אופציה A: דרך הסקריפט האוטומטי

```bash
node test-poker-api.js
```

הסקריפט יבצע:
- ✅ טעינת טבלה
- ✅ ישיבת 2 שחקנים  
- ✅ התחלת יד
- ✅ בדיקת state
- ✅ ביצוע פעולה
- ✅ בדיקת עדכון

### אופציה B: בדיקות ידניות עם cURL

#### 1️⃣ טעינת טבלה
```bash
curl "http://localhost:3000/api/poker/table?name=public"
```

שמור את `table.id` (נניח: `123`)

#### 2️⃣ ישיבת שחקנים
```bash
# Alice בכיסא 0
curl -X POST http://localhost:3000/api/poker/sit \
  -H "Content-Type: application/json" \
  -d '{"table_id":"123","seat_index":0,"player_name":"Alice","buyin":2000}'

# Bob בכיסא 1
curl -X POST http://localhost:3000/api/poker/sit \
  -H "Content-Type: application/json" \
  -d '{"table_id":"123","seat_index":1,"player_name":"Bob","buyin":2000}'
```

#### 3️⃣ התחלת יד
```bash
curl -X POST http://localhost:3000/api/poker/start-hand \
  -H "Content-Type: application/json" \
  -d '{"table_id":"123"}'
```

שמור את `hand_id` (נניח: `456`)

#### 4️⃣ בדיקת מצב
```bash
curl "http://localhost:3000/api/poker/state?hand_id=456"
```

תצפה לראות:
```json
{
  "hand": {
    "stage": "preflop",
    "current_turn": 0,
    "pot_total": 30,
    "board": []
  },
  "to_call": {
    "0": 20,
    "1": 0
  }
}
```

#### 5️⃣ ביצוע פעולה
```bash
# התור של כיסא 0 - Call 20
curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d '{"hand_id":"456","seat_index":0,"action":"call","amount":20}'

# התור של כיסא 1 - Check
curl -X POST http://localhost:3000/api/poker/action \
  -H "Content-Type: application/json" \
  -d '{"hand_id":"456","seat_index":1,"action":"check"}'
```

#### 6️⃣ קידום רחוב (Preflop → Flop)
```bash
curl -X POST http://localhost:3000/api/poker/advance-street \
  -H "Content-Type: application/json" \
  -d '{"hand_id":"456"}'
```

תצפה לראות:
```json
{
  "ok": true,
  "stage": "flop",
  "board": ["As", "Kh", "Qd"]
}
```

#### 7️⃣ המשך עד Showdown
חזור על שלבים 5-6 עד שתגיע ל-River, ואז:

```bash
# קידום מ-River → Showdown
curl -X POST http://localhost:3000/api/poker/advance-street \
  -H "Content-Type: application/json" \
  -d '{"hand_id":"456"}'
```

תצפה לראות:
```json
{
  "ok": true,
  "stage": "hand_end",
  "winners": [
    {"seat": 0, "amount": 1500}
  ]
}
```

---

## 🎮 בדיקה דרך הדפדפן

1. **פתח 2 חלונות דפדפן:**
   - חלון 1: `http://localhost:3000/mleo-t-holdem?room=test`
   - חלון 2: `http://localhost:3000/mleo-t-holdem?room=test`

2. **הגדר שמות:**
   - חלון 1: הכנס "Alice"
   - חלון 2: הכנס "Bob"

3. **שב:**
   - כל שחקן לוחץ על מקום ריק
   - Buyin: 2000 (או יותר)

4. **התחל:**
   - לחץ "Start" באחד החלונות

5. **שחק:**
   - ה-ActionBar יופיע רק בתור שלך
   - בחר Fold / Check / Call / Bet / Raise / All-in
   - המשחק יעבור אוטומטית בין הרחובות

6. **Showdown:**
   - אחרי River, המשחק יראה את הקלפים של כולם
   - הזוכה יקבל את הקופה (או תתחלק במקרה של שוויון)

---

## ✅ מה לבדוק

### בדיקות בסיסיות:
- [ ] 2 שחקנים יכולים לשבת
- [ ] Start Hand עובד
- [ ] Blinds מורדים אוטומטית
- [ ] ActionBar מופיע רק בתור הנכון
- [ ] Flop/Turn/River נפתחים
- [ ] Showdown מחשב נכון את הזוכה

### בדיקות מתקדמות:
- [ ] **All-in scenario:**
  - שחקן 1: All-in 500
  - שחקן 2: All-in 1000
  - שחקן 3: Call 1000
  - Side-pots נוצרים נכון?
  
- [ ] **Split pot:**
  - 2 שחקנים עם אותה יד
  - הקופה מתחלקת שווה?

- [ ] **Multiple players (3+):**
  - 3-9 שחקנים
  - התור עובר נכון?

- [ ] **Timeout:**
  - אל תפעל למשך 30 שניות
  - Auto-fold/check קורה?

- [ ] **Room separation:**
  - חדר A: `?room=roomA`
  - חדר B: `?room=roomB`
  - השחקנים לא מעורבבים?

---

## 🐛 פתרון בעיות

### "Table load failed"
```bash
# בדוק שה-database schema קיים:
# רוץ את הקובץ supabase-schema.sql בSupabase SQL Editor
```

### "Cannot advance street"
```bash
# בדוק ש-poker-evaluator מותקן:
npm list poker-evaluator

# אם לא, התקן:
npm install poker-evaluator
```

### "Action failed: not_your_turn"
- ודא שאתה פועל בתור הנכון
- בדוק `current_turn` ב-state API

### "Database pool not initialized"
- ודא ש-`.env.local` קיים
- ודא ש-`DATABASE_URL` תקין
- הפעל מחדש את השרת

---

## 📊 לוגים שימושיים

### בדוק Console:
```javascript
// כל קריאת API תציג:
console.log("State updated:", {
  stage: state.hand.stage,
  pot: state.hand.pot_total,
  players: state.players.length,
  current_turn: state.hand.current_turn
});
```

### בדוק Network Tab:
- `POST /api/poker/action` → צריך להחזיר `{ok:true}`
- `GET /api/poker/state` → צריך להחזיר hand/players/to_call
- `POST /api/poker/advance-street` → צריך להחזיר stage חדש

---

## 🎯 מטרות הבדיקה

1. ✅ **API עובד** - כל ה-endpoints מחזירים תגובות תקינות
2. ✅ **Rooms נפרדים** - כל room הוא משחק עצמאי
3. ✅ **Showdown נכון** - הערכת ידיים + side-pots
4. ✅ **Real-time sync** - שחקנים רואים עדכונים מיד
5. ✅ **No crashes** - אין שגיאות בקונסול

---

## 🚀 הצלחה!

אם כל הבדיקות עוברות, המערכת **מוכנה לפרודקשן**! 🎉

לשאלות או בעיות, בדוק:
1. Browser Console (F12)
2. Server logs (terminal)
3. Supabase Dashboard → Logs

