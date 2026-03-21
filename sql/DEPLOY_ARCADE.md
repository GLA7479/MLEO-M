# Arcade RPC deploy order (Supabase)

1. **Vault / base schema** — whatever your project uses for `vault_balances`, etc.

2. **`arcade_sessions_coinflip_pilot.sql`** — creates `arcade_device_sessions`, `start_paid_session`, `start_freeplay_session`.  
   It does **not** define `finish_arcade_session` (so it cannot overwrite the full implementation).

3. **`arcade_sessions_add_slots_mystery.sql`** — defines **`finish_arcade_session`** for all arcade games (coin-flip, dice, **blackjack**, slots, poker, …) and grants `service_role` execute.

## Error: `finish_arcade_session is not configured for game_id=blackjack`

The database is still using an old **stub** `finish_arcade_session` that only knew coin-flip + dice (e.g. from a previous pilot script). **Fix:** run the full **`arcade_sessions_add_slots_mystery.sql`** in the Supabase SQL Editor (replace entire function). No app code change is required.
