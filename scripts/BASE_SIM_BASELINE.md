# BASE sim / production baseline

- **Production `daily_mleo_cap`:** **3400** (`base_economy_config`, `game/mleo-base/data.js`, SQL fallbacks in `sql/base_*.sql`).
- **`mleo_gain_mult`:** **0.40** (unchanged).
- **Softcut:** **A_current** from DB / config (unchanged).

## Scripts that intentionally keep other caps

| Script / doc | Purpose |
|--------------|---------|
| `base-cap-2800-vs-3200.mjs` | Historical **2800 vs 3200** comparison (archival). |
| `base-cap-final-comparison.mjs` | Sweeps **3000–3600**; not the live baseline alone. |
| `BASE_CAP_3200_VS_2800_COMPARISON.md`, `BASE_CAP_FINAL_COMPARISON.md` | Archived analysis from candidate runs. |

Run `migrations/012_base_economy_cap_3400.sql` on an existing DB that already applied **011** (or any DB where `base_economy_config` row `id = 1` exists).
