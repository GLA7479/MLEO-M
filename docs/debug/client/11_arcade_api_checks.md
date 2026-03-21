# Arcade API checks

בדיקות לצד הדפדפן (לא SQL):

- `/api/arcade/device` — יצירה/זיהוי מכשיר (cookies).
- קריאות שמתחילות סשן ארקייד / מסיימות אותו דרך ה־backend (לרוב דרך RPC מאובטח, לא ישירות לטבלה).

אחרי בדיקת רשת:

- להשוות `device_id` מהתשובה מול `sql/debug/arcade/02_arcade_single_device_sessions.sql`.
- לבדוק סטטוסים `started` / `finished` / `cancelled` מול `04_arcade_stuck_started_sessions.sql` אם נראה תקיעות.

למסד נתונים מלא:

- `sql/debug/arcade/README.md`
