# 🔧 תיקון בעיית text[] vs jsonb

## הבעיה:
```
column "hole_cards" is of type text[] but expression is of type jsonb
```

## הפתרון:
1. **הרץ את הפקודות SQL** בקובץ `fix_database.sql` במסד הנתונים שלך
2. **הקוד כבר תוקן** - הקבצים `deal-init.js` ו-`advance-street.js` עודכנו

## מה שתוקן:
- ✅ `deal-init.js` - שולח מערכי מחרוזות במקום JSONB
- ✅ `advance-street.js` - משתמש בפונקציות RPC לעדכון board/deck
- ✅ פונקציות RPC נוצרו - `set_hole_cards`, `set_board`, `set_deck_remaining`

## בדיקה:
1. הרץ את `fix_database.sql` במסד הנתונים
2. רענן את הדפדפן
3. נסה להתחיל יד חדשה - אמור לעבוד!

## אם עדיין יש בעיה:
בדוק שהפונקציות נוצרו:
```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'set_%';
```
