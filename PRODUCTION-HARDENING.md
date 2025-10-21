# 🛡️ Production Hardening Checklist

## קשיחות ואבטחה לפרודקשן - Texas Hold'em Poker

---

## ✅ 1. Database & Performance

### Connection Pooling
```javascript
// lib/db.js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,                  // מקסימום קונקשנים
  idleTimeoutMillis: 30000, // timeout לקונקשן idle
  connectionTimeoutMillis: 2000,
});
```

### Indexes (כבר קיים ב-migrations)
```sql
CREATE INDEX IF NOT EXISTS idx_poker_hands_table_id_active 
ON poker.poker_hands(table_id) 
WHERE stage != 'hand_end';

CREATE INDEX IF NOT EXISTS idx_poker_seats_table_player 
ON poker.poker_seats(table_id, player_name) 
WHERE player_name IS NOT NULL;
```

### Query Optimization
- ✅ כל השאילתות משתמשות ב-prepared statements ($1, $2...)
- ✅ `FOR UPDATE` locks רק שורות נדרשות
- ✅ Transactions קצרות ויעילות

---

## ⏱️ 2. Timeout Engine

### Option A: Vercel Cron (מומלץ)
```javascript
// pages/api/cron/poker-tick.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    // Find active hands with expired deadlines
    const expired = await q(`
      SELECT id FROM poker.poker_hands
      WHERE stage IN ('preflop','flop','turn','river')
        AND turn_deadline < now()
      LIMIT 10
    `);

    for (const row of expired.rows) {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/poker/tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hand_id: row.id }),
      });
    }

    return res.json({ ok: true, processed: expired.rowCount });
  } catch (e) {
    console.error("Cron tick error:", e);
    return res.status(500).json({ error: e.message });
  }
}
```

**vercel.json:**
```json
{
  "crons": [{
    "path": "/api/cron/poker-tick",
    "schedule": "*/2 * * * *"
  }]
}
```

### Option B: Supabase Edge Functions
יצירת Function שרץ כל 2-3 שניות ומטפל ב-timeouts.

---

## 🔒 3. Idempotency (כבר מיושם!)

### Client-Side
```javascript
// Generate unique action_id
function generateActionId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Send with action
await apiAction(handId, seatIndex, 'call', amount, {
  action_id: generateActionId()
});
```

### Server-Side (כבר ב-action.js)
```javascript
// Check if action_id exists
if (action_id) {
  const existing = await q(`SELECT id FROM poker.poker_actions WHERE action_id=$1`, [action_id]);
  if (existing.rowCount > 0) {
    return res.json({ ok: true, idempotent: true });
  }
}
```

---

## 🚨 4. Rate Limiting

### Option A: Vercel Edge Middleware
```javascript
// middleware.js
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"), // 10 actions per 10 seconds
});

export async function middleware(request) {
  if (request.nextUrl.pathname.startsWith('/api/poker/action')) {
    const ip = request.ip || request.headers.get("x-forwarded-for") || "127.0.0.1";
    const { success } = await ratelimit.limit(ip);
    
    if (!success) {
      return new Response("Too many requests", { status: 429 });
    }
  }
  
  return NextResponse.next();
}
```

### Option B: Simple In-Memory (לפיתוח)
```javascript
// lib/rate-limit.js
const requests = new Map();

export function checkRateLimit(ip, maxRequests = 10, windowMs = 10000) {
  const now = Date.now();
  const record = requests.get(ip) || { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  
  record.count++;
  requests.set(ip, record);
  
  return record.count <= maxRequests;
}
```

---

## 🔐 5. Security & RLS

### Enable Row Level Security (אחרי הוספת Auth)
```sql
-- Enable RLS on sensitive tables
ALTER TABLE poker.poker_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_hand_players ENABLE ROW LEVEL SECURITY;

-- Policy: Players can only see their own hole cards
CREATE POLICY "players_own_cards" ON poker.poker_hand_players
  FOR SELECT
  USING (
    seat_index IN (
      SELECT seat_index FROM poker.poker_seats
      WHERE table_id = poker_hand_players.hand_id
        AND player_id = auth.uid()
    )
    OR 
    -- Everyone can see cards in showdown
    EXISTS (
      SELECT 1 FROM poker.poker_hands
      WHERE id = poker_hand_players.hand_id
        AND stage = 'showdown'
    )
  );

-- Policy: Players can only act on their own seat
CREATE POLICY "players_own_actions" ON poker.poker_actions
  FOR INSERT
  WITH CHECK (
    seat_index IN (
      SELECT seat_index FROM poker.poker_seats
      WHERE player_id = auth.uid()
    )
  );
```

### Hide Opponent Hole Cards (כבר מיושם ב-client)
```javascript
// בstate API - החזר hole_cards רק לשחקן שלו
const me = (serverSeats || []).find(s => s && s.player_name === displayName);
const myHole = holeFor(meIdx);  // רק לי
```

---

## 📊 6. Logging & Monitoring

### Structured Logging
```javascript
// lib/logger.js
export function logPokerEvent(event, data) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...data,
  }));
}

// Usage
logPokerEvent('action_performed', {
  hand_id: handId,
  seat_index: seatIndex,
  action: 'raise',
  amount: 200,
});
```

### Vercel Analytics
- מופעל אוטומטית בפרודקשן
- Dashboard: https://vercel.com/dashboard/analytics

### Supabase Monitoring
- Database → Logs
- Database → Query Performance
- Settings → Usage

---

## 🔧 7. Error Handling

### API Error Responses (כבר מיושם)
```javascript
try {
  // ... poker logic
} catch (e) {
  console.error("API error:", e);
  await q("ROLLBACK").catch(()=>{});
  return res.status(500).json({
    error: "server_error",
    details: process.env.NODE_ENV === 'development' ? e.message : undefined
  });
}
```

### Client-Side Error Display
```javascript
const [errorMsg, setErrorMsg] = useState("");

try {
  const result = await apiAction(...);
  if (result.error) {
    setErrorMsg(`Action failed: ${result.error}`);
    setTimeout(() => setErrorMsg(""), 3000);
  }
} catch (e) {
  setErrorMsg("Network error. Please try again.");
}
```

---

## 🚀 8. Deployment Checklist

### Environment Variables (Production)
```env
# Database
DATABASE_URL=postgresql://...
PGSSL=true

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Security
CRON_SECRET=random-secret-here
NEXT_PUBLIC_BASE_URL=https://yourdomain.com

# Optional
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### package.json - Lock Versions
```json
{
  "dependencies": {
    "next": "14.0.4",           // ללא ^
    "pg": "8.11.3",
    "poker-evaluator": "2.1.1",
    "@supabase/supabase-js": "2.39.0"
  }
}
```

### Build & Deploy
```bash
# Test build locally
npm run build

# Deploy to Vercel
vercel --prod

# Or use GitHub integration (auto-deploy on push)
```

---

## 📝 9. Final Checklist

### Before Production:
- [ ] Run `migrations/002_idempotency.sql` on production DB
- [ ] Enable Supabase Realtime on `poker` schema
- [ ] Set all environment variables in Vercel
- [ ] Test with 4+ concurrent players
- [ ] Test All-in + Side-Pots scenario
- [ ] Test timeout auto-fold/check
- [ ] Enable rate limiting
- [ ] Configure cron for tick engine
- [ ] Enable SSL/HTTPS (automatic on Vercel)
- [ ] Test idempotency (double-click actions)

### Post-Launch:
- [ ] Monitor Vercel logs daily
- [ ] Monitor Supabase database performance
- [ ] Set up alerts for errors (Vercel/Sentry)
- [ ] Review poker_actions table for abuse patterns
- [ ] Backup database regularly (Supabase auto-backups)

---

## 🎯 Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Action Response Time | < 500ms | Vercel Analytics |
| State API Response | < 200ms | Network tab |
| Realtime Latency | < 1s | Console timestamps |
| Database Queries | < 50ms avg | Supabase Query Performance |
| Concurrent Players | 100+ rooms | Load testing |

---

## 🛠️ Troubleshooting

### High Database Load
1. Check slow queries in Supabase dashboard
2. Add missing indexes
3. Increase connection pool size
4. Consider read replicas

### Timeout Issues
1. Check cron logs
2. Verify turn_deadline values
3. Test `/api/poker/tick` manually

### Realtime Not Working
1. Check Supabase Realtime is enabled
2. Verify NEXT_PUBLIC_SUPABASE_URL/KEY
3. Check browser console for subscription errors

---

## 📚 Resources

- [Vercel Production Checklist](https://vercel.com/docs/production-checklist)
- [Supabase Best Practices](https://supabase.com/docs/guides/platform/performance)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Next.js Production Best Practices](https://nextjs.org/docs/deployment)

---

**המערכת מוכנה לפרודקשן! 🚀**

