# Texas Hold'em Multiplayer Setup

## ✅ מה נוצר:

### 1. **מנוע פוקר** (`lib/pokerEngine.js`)
- הערכת ידיים מלאה (7→5 קלפים)
- ניהול side pots
- חלוקת זכיות אוטומטית
- פונקציות עזר להימורים

### 2. **קומפוננטת משחק** (`games-online/PokerMP.js`)
- דיל מלא + בליינדים/אנטה
- תורים עם שעון (20 שניות)
- הימורים: fold/check/call/bet/raise/all-in
- מעבר סטריט אוטומטי
- side pots + showdown אוטומטי

### 3. **רישום בלובי** (`pages/arcade-online.js`)
- פוקר נוסף ל-REGISTRY
- תמיכה בחדרים (RoomBrowser)
- Presence + Chat
- ניקוי מושבים ביציאה

### 4. **SQL Schema** (`sql/poker_schema.sql`)
- 4 טבלאות: sessions, players, pots, actions
- RLS policies
- אינדקסים לביצועים
- Realtime subscriptions

## 🚀 הוראות הפעלה:

### 1. **הרץ SQL Schema**
```sql
-- העתק והדבק את התוכן של sql/poker_schema.sql
-- ב-Supabase SQL Editor (פרויקט MP)
```

### 2. **הפעל השרת**
```bash
cd MLEO-GAME
npm run dev
```

### 3. **בדוק את הפוקר**
1. לך ל: `http://localhost:3000/arcade-online`
2. בחר "Texas Hold'em (MP)" 
3. צור חדר או הצטרף לחדר קיים
4. התחל משחק!

## 🎮 תכונות הפוקר:

### **שעון תור**
- 20 שניות לכל תור
- Auto-check אם אפשר, אחרת auto-fold

### **הימורים מלאים**
- **FOLD** - ויתור
- **CHECK** - השוואה (אם אפשר)
- **CALL** - השוואה להימור
- **BET** - הימור ראשון
- **RAISE** - העלאה
- **ALL-IN** - הכל

### **מעבר סטריטים**
- Preflop → Flop → Turn → River → Showdown
- אוטומטי כשכולם השוו

### **Side Pots**
- ניהול אוטומטי של קופות צד
- חלוקת זכיות לפי היד הטובה

### **UI משופר**
- קלפים גדולים עם צבעים
- טיימר ויזואלי
- כפתורי quick bet (1×BB, ½ Pot, Pot)
- סטטוס ברור לכל שחקן

## 🔧 הגדרות נוספות:

### **טיימר מותאם אישית**
```env
# ב-.env.local
NEXT_PUBLIC_POKER_TURN_SECONDS=30
```

### **הגדרות משחק**
- **Blinds**: SB = BB/2, BB = min_bet
- **Stack**: 2000 chips לכל שחקן
- **Seats**: 6 מושבים מקסימום
- **Ante**: אופציונלי (0 ברירת מחדל)

## 🐛 פתרון בעיות:

### **"Module not found"**
```bash
# ודא שהקבצים קיימים:
ls lib/pokerEngine.js
ls games-online/PokerMP.js
```

### **"Supabase error"**
- ודא שהרצת את ה-SQL schema
- בדוק את ה-credentials ב-.env.local

### **"No rooms"**
- צור חדר חדש ב-RoomBrowser
- או השתמש ב-URL ישיר: `/arcade-online?game=poker&room=<id>`

## 🎯 מה הבא:

1. **RLS Security** - הגבלת פעולות לפי חברות בחדר
2. **Edge Functions** - auto-fold שרתי
3. **UI Improvements** - הסתרת קלפים לשחקנים אחרים
4. **Tournament Mode** - טורנירים עם brackets
5. **Statistics** - היסטוריית משחקים

---

**הכל מוכן!** 🎉
Texas Hold'em Multiplayer עובד עם שעון, side pots, וכל התכונות המתקדמות.
