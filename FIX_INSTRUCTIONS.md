# 🔧 תיקון בעיית text[] vs jsonb עם Supabase

## הבעיה:
```
column "hole_cards" is of type text[] but expression is of type jsonb
```

## הפתרון:
1. **הרץ את הפקודות SQL** בקובץ `fix_database.sql` ב-Supabase SQL Editor
2. **הקוד כבר תוקן** - הקבצים `deal-init.js` ו-`advance-street.js` עודכנו

## מה שתוקן:
- ✅ `deal-init.js` - משתמש ב-Supabase RPC עם מערכי מחרוזות
- ✅ `advance-street.js` - משתמש ב-Supabase RPC לעדכון board/deck
- ✅ פונקציות RPC נוצרו - `set_hole_cards`, `set_board`, `set_deck_remaining`

## דוגמאות שימוש:
```js
// חלוקת קלפים
await supabase.rpc('set_hole_cards', { 
  p_hand: hand_id, 
  p_seat: 0, 
  p_cards: ['Kc','5d'] 
});

// עדכון board
await supabase.rpc('set_board', { 
  p_hand: hand_id, 
  p_cards: ['Ah','7d','3c'] 
});

// עדכון deck
await supabase.rpc('set_deck_remaining', { 
  p_hand: hand_id, 
  p_cards: ['As','Kd', ...] 
});
```

## בדיקה:
1. הרץ את `fix_database.sql` ב-Supabase SQL Editor
2. רענן את הדפדפן
3. נסה להתחיל יד חדשה - אמור לעבוד!

## אם עדיין יש בעיה:
בדוק שהפונקציות נוצרו ב-Supabase:
```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'set_%';
```
