# MLEO Game Pool Stats - Real Contract Integration

## 🎯 מה זה עושה?

הקומפוננט `GamePoolStats` מציג נתונים אמיתיים מהחוזה `MLEOGameClaimV3` בדף ה-MINING של המשחק.

## 📊 הנתונים המוצגים:

- **Total Pool**: 200B MLEO (סה"כ הקצבה למשחקים)
- **Total Claimed**: כמה MLEO נדרשו עד כה
- **Remaining**: כמה MLEO נותרו לביקוש
- **Daily Cap**: 50M MLEO לכל משתמש ביום
- **Status**: Active/Paused
- **Progress Bar**: אחוז הביקוש
- **Token Address**: כתובת MLEO עם אפשרות העתקה

## 🔧 איך זה עובד:

### 1. API Endpoint (`/api/game-pool-data`)
- מתחבר לחוזה `MLEOGameClaimV3` ברשת TBNB
- קורא נתונים אמיתיים: `globalCap`, `globalClaimed`, `dailyUserCap`, `paused`
- אם החוזה לא זמין, מחזיר נתונים מדומים

### 2. Hook (`useGamePoolData`)
- קורא ל-API כל 30 שניות
- מטפל בשגיאות ומחזיר נתונים מדומים כגיבוי
- מציג מצב loading ו-error

### 3. Component (`GamePoolStats`)
- מציג את הנתונים בפורמט ידידותי (200B במקום 200000000000000000000000000000)
- מראה אינדיקטור אם הנתונים חיים או מדומים
- מעדכן אוטומטית כל 30 שניות
- כולל כתובת MLEO עם אפשרות העתקה ופידבק חזותי

## 🚀 הפעלה:

1. **התקן תלויות:**
   ```bash
   npm install
   ```

2. **הפעל את השרת:**
   ```bash
   npm run dev
   ```

3. **בדוק בדף MINING:**
   - לך ל-`http://localhost:3000/mining`
   - ראה את ה"🪙 Global MLEO Pool Status"
   - בדוק אם מוצג "🟢 Live Contract Data" או "🟡 Fallback Data"

## 📝 קבצים שעודכנו:

- `pages/api/game-pool-data.js` - API endpoint עם חיבור לחוזה
- `hooks/useGamePoolData.js` - Hook לקריאת נתונים
- `components/GamePoolStats.js` - קומפוננט תצוגה
- `components/GamePoolStats.module.css` - סגנונות

## 🔗 כתובת החוזה:

```
MLEOGameClaimV3: 0xC19AA307ed110F416dA458b4687a606ffbaCc1D0
```

## ⚠️ הערות:

- אם החוזה לא זמין, יוצגו נתונים מדומים
- הנתונים מתעדכנים כל 30 שניות
- התצוגה תומכת במספרים גדולים (B, M, K)
- יש טיפול בשגיאות עם הודעות ברורות
- כתובת MLEO עם אפשרות העתקה ופידבק חזותי

## 🎮 שימוש במשחק:

הקומפוננט מוצג בדף MINING (`/mining`) ומראה למשחקים:
- כמה MLEO נותרו לביקוש
- מה התקרה היומית שלהם
- מצב הבריכת המטבעות (פעיל/מושהה)
- כתובת MLEO עם אפשרות העתקה
