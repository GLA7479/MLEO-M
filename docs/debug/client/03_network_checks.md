# Network checks

ב-DevTools -> Network:

לבדוק קריאות ל:
- /api/arcade/device
- /api/csrf-token
- /api/base/state
- /api/base/presence
- /api/miners/state

מה לבדוק:
- status code
- response body
- request headers
- cookies sent
- csrf token header if relevant
- האם הקריאה נכשלת רק ב-presence או גם ב-state
