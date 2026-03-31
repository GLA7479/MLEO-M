# Online V2 (OV2) migrations

## מבנה / Layout

קבצים **משותפים** (לובי, חדרים, יתומים, realtime כללי, מושבים מאוחדים) נשארים **בשורש** `migrations/online-v2/`.

תיקיות לפי **משחק**:

| תיקייה        | תוכן |
|---------------|------|
| `board-path/` | Board Path + Mark grid (סכימה, RPCs, settlement) |
| `ludo/`       | לודו OV2 |
| `bingo/`      | בינגו OV2 |

## סדר הרצה

ההרצה היא לפי **המספר בתחילת שם הקובץ** (001, 002, …) על כל הפרויקט, לא לפי שם התיקייה.

**אל תסמוך על מיון לפי נתיב מלא** בין תיקיות — השתמש ברשימה ב־`APPLY_ORDER.txt`, או מיין לפי **basename** בלבד.

קבצים חדשים: שמרו על מספור עולה גלובלי והוסיפו את הנתיב ל־`APPLY_ORDER.txt`.

**Supabase Realtime:** לובי ו־Board Path מנויים ל־`postgres_changes` על טבלאות `public.ov2_*`. הטבלאות חייבות להיות בפרסום `supabase_realtime` — ראו `014_ov2_realtime_publication.sql`.
