# Owner Review — Monthly QA Simulator

## Before first live run

1. Apply SQL: `npm run qa:apply-migration` then run `migrations/qa/001_qa_sim_tables.sql` in Supabase SQL Editor (current MP project).
2. Set `QA_SIM_LIVE_BASE` to your current live site URL (optional if `NEXT_PUBLIC_AUTH_REDIRECT_BASE` is already correct).

## Gate checklist

| Gate | Status | Action |
|------|--------|--------|
| 1 Plan | Owner approved implementation | Done when you requested build |
| 2 Implementation | Scripts + migration file | Complete |
| 3 Short validation | `npm run qa:validate` (local, compressed) | Run with dev server for real API |
| 4 24h pilot | `npm run qa:pilot` | Requires `--approve-pilot` (already on script) |
| 5 30-day run | `npm run qa:run` | Requires `--approve-full-run`; one invocation per calendar day |
| 6 Final report | `npm run qa:report:final -- --run-id=<uuid>` | After day 30 |

## Inspecting all 20 users

- Supabase: query `qa_sim_daily_summary`, `qa_sim_event`, `qa_sim_alert` filtered by `run_id`.
- HTML: `reports/monthly-final-report.html` from reporter.
- Per user: `node scripts/qa-monthly-sim/reporter.mjs --run-id=<uuid> --user=qa_ghost`

## 30-day operation model

The simulator runs **one calendar day per invocation**. Schedule an external job (Task Scheduler / cron) daily:

```bash
node scripts/qa-monthly-sim/runner.mjs --resume --run-id=<uuid> --mode=live --approve-full-run
```

Increment day via checkpoint resume (or pass `--day N` explicitly).

## Cleanup (optional, after review)

```bash
npm run qa:cleanup -- --run-id=<uuid>
npm run qa:cleanup -- --run-id=<uuid> --confirm
```

Dry-run is default. Never deletes non-QA product tables.
