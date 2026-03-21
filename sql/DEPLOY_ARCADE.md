# Arcade RPC deploy order (Supabase)

1. **Vault / base schema** — whatever your project uses for `vault_balances`, etc.

2. **`arcade_sessions_coinflip_pilot.sql`** — creates `arcade_device_sessions`, `start_paid_session`, `start_freeplay_session`.  
   It intentionally does **not** redefine `finish_arcade_session`, so you never overwrite the full multi-game implementation from step 3.

3. **`arcade_sessions_add_slots_mystery.sql`** — **source of truth** for **`finish_arcade_session`**: coin-flip, dice, baccarat, slots, mystery, **blackjack**, poker, and all other arcade games in one function. Also sets `REVOKE`/`GRANT` for `service_role`.

**Never** paste an old “pilot-only” `finish_arcade_session` (two games) after step 3 — it will break blackjack and the rest.

After pulling repo updates, re-apply `arcade_sessions_add_slots_mystery.sql` if you need fixes such as horse `won` semantics, the global “finish too quickly” window, or **arcade poker** (`game_id = 'poker'`) finish timing (was 1800ms, now aligned to 100ms after global guard).

## Error: `finish_arcade_session is not configured for game_id=...`

Supabase still has a **truncated** `finish_arcade_session` (e.g. only coin-flip + dice). **Fix:** in SQL Editor, run the **entire** `sql/arcade_sessions_add_slots_mystery.sql` so `CREATE OR REPLACE FUNCTION public.finish_arcade_session` includes every game branch.
