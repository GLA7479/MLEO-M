# Tile Rush Duel (OV2) — archived

This game is **on hold** and **not approved for live launch**.

It was removed from the active Online V2 surface (lobby, quick match, routes, and registry) and stored here so the repo stays clean.

**Restore only if explicitly requested** — copy paths back under `migrations/online-v2/tilerushduel/` (SQL files), `components/online-v2/tilerushduel/`, `hooks/`, `lib/online-v2/tilerushduel/`, and `pages/`, then re-add registry / shared-room wiring and remove the `/ov2-tile-rush-duel` redirect in `next.config.js` if you re-enable the page.

Sources here are **not buildable in isolation**; imports assume the original project layout at the repo root.

Suggested migration order (filenames in `migrations/`): `132` → `136` schema through shared integration chain as documented in the SQL headers.
