# Debug SQL folders index

תיקיות קיימות:
- `sql/debug/base`
- `sql/debug/miners`
- `sql/debug/vault`
- `sql/debug/system`
- `sql/debug/arcade`

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
5. ARCADE (משחקי device / סשנים)
6. CLIENT docs

לפני הרצה של קבצים למשתמש ספציפי:
- להחליף `PUT-DEVICE-ID-HERE`
- בתיקיית `arcade`: גם `PUT-SESSION-ID-HERE` כשמדובר בסשן בודד

לא להריץ קבצים הרסניים בלי לבדוק קודם overview ו-single-user files.
