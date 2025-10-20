# 🎴 Texas Hold'em Supabase Setup

## 📋 הוראות התקנה

### 1. יצירת Supabase Project

1. **לך ל-** https://supabase.com
2. **הרשם/התחבר** (חינמי)
3. **לחץ "New Project"**
4. **בחר שם** - כמו "mleo-poker"
5. **בחר Database Password** (שמור אותו!)
6. **לחץ "Create new project"**

### 2. הגדרת Database

1. **לך ל-SQL Editor** ב-Supabase Dashboard
2. **העתק את הקוד** מ-`supabase-schema.sql`
3. **הדבק ב-SQL Editor**
4. **לחץ "Run"**

### 3. קבלת API Keys

1. **לך ל-Settings → API**
2. **העתק את:**
   - **Project URL** (https://xxxxx.supabase.co)
   - **anon public key** (eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)

### 4. הגדרת Environment Variables

צור קובץ `.env.local` בשורש הפרויקט:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 5. הפעלת המשחק

1. **הרץ** `npm run dev`
2. **לך ל-** `localhost:3000/arcade`
3. **בחר "Texas Hold'em Supabase"**
4. **המשחק יעבוד!** 🎴

## ✅ מה יש במשחק החדש:

- **Real-time multiplayer** עם Supabase
- **חיבור אמיתי** בין שחקנים
- **מהיר ויציב** - לא מקרטע
- **עובד על Vercel** - מושלם
- **2-6 שחקנים** - עד 6 שחקנים במשחק
- **Real-time sync** - עדכונים מיידיים

## 🚀 איך זה עובד:

1. **המארח יוצר חדר** → נוצר ב-Supabase
2. **האורח מצטרף** → מוסיף למשחק ב-Supabase
3. **Real-time updates** → שני השחקנים רואים שינויים מיד
4. **המשחק רץ** → הכל מסונכרן בזמן אמת

## 🔧 פתרון בעיות:

### "Failed to create room"
- בדוק שה-API keys נכונים
- ודא שה-SQL schema רץ בהצלחה

### "Room not found"
- ודא שה-room code נכון
- בדוק שהמשחק לא התחיל כבר

### "Connection issues"
- בדוק את החיבור לאינטרנט
- ודא שה-Supabase project פעיל

## 📞 תמיכה:

אם יש בעיות, בדוק:
1. **Supabase Dashboard** - האם הפרויקט פעיל
2. **Browser Console** - האם יש שגיאות
3. **Network Tab** - האם יש בעיות חיבור

**המשחק החדש יעבוד הרבה יותר טוב מהקודם!** 🎴⚡


