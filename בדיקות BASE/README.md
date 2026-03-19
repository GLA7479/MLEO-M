# בדיקות BASE

תיקייה זו מרכזת בדיקות שרת/DB ו-smoke tests ל-BASE, ללא שינוי נתונים לא רצוי (מלבד פעולות המשחק עצמן כשמריצים אותן ידנית).

## סדר הרצה מומלץ

1. להריץ `sql/01_quick_server_health_check.sql`
2. להריץ `console/01_vault_apply_block_test.js` בדפדפן (DevTools Console)
3. לבצע Ship במשחק ואז להריץ `sql/02_ship_audit_last_5.sql`
4. לבצע Spend במשחק ואז להריץ `sql/03_spend_audit_last_10.sql`
5. להריץ `sql/04_live_state_check.sql`
6. להריץ `sql/05_offline_function_smoke.sql`
7. להריץ `console/02_rate_limit_smoke_ship.js`

## מה לשלוח חזרה לבדיקה

- תוצאה של `01_quick_server_health_check.sql`
- תוצאת ה-403 מ-`01_vault_apply_block_test.js`
- שורת audit אחת לפחות מ-`02_ship_audit_last_5.sql`
