# Monthly Real User Behavior Simulator

Runs 20 persistent QA personas against the **real current** Miners, BASE, Solo V2, and OV2 modules.

## Owner approval gates

| Gate | What | Command requirement |
|------|------|---------------------|
| 1 | Plan approved | Owner sign-off before implementation |
| 2 | Implementation | Scripts + migration (no long live run) |
| 3 | Short validation | 2 users, local, compressed OK |
| 4 | 24h pilot | `--approve-pilot` + `--mode=live` |
| 5 | 30-day run | `--approve-full-run` + `--mode=live`, no `--compressed` |

## Setup

1. Apply migration on current Supabase MP project:

```bash
# via Supabase SQL editor or CLI
# migrations/qa/001_qa_sim_tables.sql
```

2. Ensure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL_MP`, `SUPABASE_SERVICE_ROLE_KEY_MP`, and signing secret for arcade cookies.

## Wall-clock scheduling

- `--mode=live` without `--compressed`: each action **waits until `scheduledAt`** (real wall-clock).
- `--mode=local` or `--compressed` or `--dry-run`: immediate batch execution (validation only).
- `--compressed` is **rejected** with `--mode=live` (pilot and full run).

Proof: `npm run qa:wall-clock-proof`

## Coverage reporting

- `node scripts/qa-monthly-sim/coverage-matrix.mjs` — static plan (all Solo/OV2/BASE/Miners targets).
- Per-run artifact: `reports/coverage-<runId>-day<N>.json`
- HTML report includes covered / missed / `coverage_gap` per module.

## Commands (also in package.json)

```bash
# Dry-run schedule only
npm run qa:dry-run

# Phase 3 — local validation (2 users, compressed)
npm run qa:validate

# Phase 4 — live pilot (owner must pass --approve-pilot)
npm run qa:pilot

# Phase 5 — full 30-day (owner must pass --approve-full-run)
npm run qa:run

# Daily / final report
npm run qa:report -- --run-id=<uuid> --day=1
npm run qa:report:final -- --run-id=<uuid>

# Cleanup preview / execute
npm run qa:cleanup -- --run-id=<uuid>
npm run qa:cleanup -- --run-id=<uuid> --confirm
```

## Environment

- `--mode=live` — real current Vercel/live site (`QA_SIM_LIVE_BASE` or `NEXT_PUBLIC_AUTH_REDIRECT_BASE`)
- `--mode=local` — `http://localhost:3000`
- `--mock` — local diagnostic only; never for live pilot or 30-day run

## QA traceability

- Device IDs: deterministic per `qa_<persona>` via `qaDeviceId()`
- Display names: `[QA] ...` in OV2
- Reporting: `qa_sim_*` tables + `reports/*.html`

## Excluded

Legacy Arcade, Old Online, poker routes — not driven by this simulator.
