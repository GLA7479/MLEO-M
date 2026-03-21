# BASE presence manual test

מטרת הבדיקה:
לראות אם הבעיה היא רק presence או גם state.

צעדים:
1. לטעון את האתר
2. לבדוק קודם /api/csrf-token
3. לבדוק /api/base/state
4. רק אחר כך לבדוק האם /api/base/presence מצליח
5. אם state מצליח אבל presence נכשל:
   - זו בעיית presence/csrf
   - לא בעיית economy
