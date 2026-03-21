# Safe debug order

סדר בדיקות מומלץ:

1. לבדוק קודם SQL:
   - BASE overview
   - MINERS overview
   - VAULT overview
   - SYSTEM combined overview

2. לבדוק משתמש ספציפי:
   - BASE single user
   - MINERS single user
   - VAULT single user
   - SYSTEM single user trace

3. רק אחר כך לבדוק בדפדפן:
   - arcade device
   - csrf token
   - base state
   - miners state
   - network tab
   - console errors

4. פעולות הרסניות רק בסוף:
   - delete
   - soft reset
   - manual balance updates
