# 🔧 Redis Setup Instructions

## Quick Setup (5 minutes)

### Step 1: Create Upstash Account
1. Go to https://console.upstash.com/
2. Sign up (free, no credit card needed)
3. Click "Create Database"
4. Choose any name (e.g., "mleo-crash")
5. Select a region close to you

### Step 2: Get Credentials
1. After creating, you'll see your database dashboard
2. Scroll down to "REST API" section
3. Copy these two values:
   - `UPSTASH_REDIS_REST_URL` (looks like: https://xxx.upstash.io)
   - `UPSTASH_REDIS_REST_TOKEN` (long string)

### Step 3: Create .env.local File
Create a file named `.env.local` in the MLEO-GAME folder with:

```
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token-here
```

Replace the values with what you copied from Upstash.

### Step 4: Restart Next.js
Stop and restart your dev server:
```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Step 5: Test
Open http://localhost:3000/crash
The game should now persist across refreshes!

## Troubleshooting

### "Redis not configured" warning
- Make sure .env.local exists in MLEO-GAME folder
- Restart your dev server
- Check that variable names are exactly: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN

### Game resets on refresh
- Redis might not be connected
- Check console for error messages
- Verify credentials are correct

## Free Tier Limits
- 10,000 commands/day
- 256 MB storage
- More than enough for the crash game!

