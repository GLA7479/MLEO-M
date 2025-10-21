# 🐛 Bug Fix: UI Seats Display Issue

## בעיה
בצד שמאל כל המושבים מציגים "Idle 0" ולחיצה לא עושה כלום.
בצד ימין הכפתור "Sit here" עובד תקין.

---

## 🔍 גורם השורש

### הבעיה בקוד (שורה 1096):
```javascript
const isTaken = !!serverSeat;  // ❌ WRONG!
```

**למה זה שגוי?**
- `serverSeat` קיים **תמיד** (נוצר ב-/table עבור כל 9 המושבים)
- גם כשהמושב **ריק** (`player_name = null`), `!!serverSeat` מחזיר `true`
- זה גורם לכפתור להיות `disabled={isTaken}` גם למושבים פנויים!

### הבעיה השנייה (שורה 1090):
```javascript
const p = serverSeat ? { 
  name: serverSeat.player_name,  // null אם המושב ריק
  chips: serverSeat.stack,
  ...
} : localSeat;
```

**למה זה שגוי?**
- אם `serverSeat` קיים אבל `player_name` הוא `null`, זה יוצר אובייקט `p` עם `name: null`
- אז `!p` מחזיר `false` (כי `p` הוא object, לא null)
- התנאי בשורה 1105 `{!p ? (...כפתור Sit...) : (...פרטי שחקן...)}` מציג את חלק "פרטי שחקן"
- זה גורם ל-"Idle 0" במקום "Sit here"

---

## ✅ הפתרון

### 1. תיקון `isTaken` - בדיקה גם של `player_name`:
```javascript
const isTaken = !!(serverSeat && serverSeat.player_name);  // ✅ CORRECT!
```

### 2. תיקון יצירת `p` - רק אם יש שחקן:
```javascript
const p = (serverSeat && serverSeat.player_name) ? { 
  name: serverSeat.player_name, 
  chips: serverSeat.stack_live || serverSeat.stack,
  you: isYou,
  id: serverSeat.player_name
} : localSeat;
```

עכשיו:
- אם `serverSeat` קיים אבל `player_name` הוא `null` → `p` יהיה `undefined`
- אז `!p` מחזיר `true` והכפתור "Sit here" מוצג ✅

### 3. שימוש ב-`stack_live`:
```javascript
chips: serverSeat.stack_live || serverSeat.stack,
```
במשחק פעיל, `stack_live` הוא הערך הנוכחי (אחרי הימורים).

---

## 🎯 תוצאה לאחר התיקון

### מושב ריק:
- `serverSeat` קיים, אבל `player_name = null`
- `isTaken = false`
- `p = undefined`
- מוצג: **"Sit here (≥ 1K)"** ✅
- הכפתור לא disabled ✅

### מושב תפוס:
- `serverSeat` קיים, `player_name = "Alice"`
- `isTaken = true`
- `p = {name: "Alice", chips: 2000, ...}`
- מוצג: פרטי השחקן ✅
- לחיצה על "Sit here" במושב אחר תבדוק אם תפוס ✅

---

## 🧪 בדיקה

### לפני התיקון:
```
Seat #1: [Idle 0] (כפתור disabled)
Seat #2: [Idle 0] (כפתור disabled)
Seat #3: [You 2000 chips] [Leave table]
```

### אחרי התיקון:
```
Seat #1: [Sit here (≥ 1K)] (כפתור active ✅)
Seat #2: [Sit here (≥ 1K)] (כפתור active ✅)
Seat #3: [You 2000 chips] [Leave table]
```

---

## 📝 סיכום התיקון

| קובץ | שורה | לפני | אחרי |
|------|------|------|------|
| `mleo-t-holdem.js` | 1090 | `serverSeat ? {...}` | `(serverSeat && serverSeat.player_name) ? {...}` |
| `mleo-t-holdem.js` | 1092 | `chips: serverSeat.stack` | `chips: serverSeat.stack_live \|\| serverSeat.stack` |
| `mleo-t-holdem.js` | 1096 | `const isTaken = !!serverSeat;` | `const isTaken = !!(serverSeat && serverSeat.player_name);` |

---

## ✅ סטטוס

- [x] תוקן תנאי `isTaken`
- [x] תוקן תנאי יצירת `p`
- [x] שימוש ב-`stack_live` עבור משחק פעיל
- [x] נבדק ללא linter errors

**עכשיו כל המושבים הפנויים יציגו "Sit here" והכפתור יהיה לחיץ!** 🎉

