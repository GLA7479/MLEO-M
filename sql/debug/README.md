# Debug SQL folders index

תיקיות קיימות:
- `sql/debug/base`
- `sql/debug/miners`
- `sql/debug/vault`
- `sql/debug/system`

מה הכי בטוח לבדיקה יומיומית:
- overview files
- single user files
- active users files
- config files
- function definition files
- mismatch / combined overview files

מה מסוכן:
- delete files
- soft reset files
- manual update files
- bulk delete inactive files

סדר עבודה מומלץ:
1. BASE
2. MINERS
3. VAULT
4. SYSTEM
5. CLIENT docs

לפני הרצה של קבצים למשתמש ספציפי:
- להחליף `PUT-DEVICE-ID-HERE`

לא להריץ קבצים הרסניים בלי לבדוק קודם overview ו-single-user files.
