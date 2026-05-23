# MLEO QA — Laptop Runner Setup

Run **future Gate 4 daily simulations** from a secondary laptop, not the main work PC.

**Current campaign (do not create a new one):**

| Field | Value |
|-------|--------|
| Campaign ID | `8b562e38-00c9-466d-a64e-c98674394e23` |
| Last completed day | **1** |
| Next day | **2** |
| Day 2 status | `aborted` (accidental 2026-05-23, no actions) — safe to re-run Day 2 after laptop setup |

---

## Critical rules

1. **Never run the same QA day from two machines at once.**
2. **Do not migrate mid-run.** If the main PC has a live daily run in progress, let it finish OR stop it gracefully and mark `partial`/`aborted` in Supabase + campaign JSON before using the laptop.
3. **Future live daily runs = laptop only** (after this handoff).
4. **Keep the same campaign ID** — copy checkpoint files; do not run `getOrCreateCampaign` on a fresh clone without syncing checkpoints.
5. **Do not commit** `.env.local`, checkpoints with secrets, or live reports to git unless explicitly approved.

---

## 1. Laptop setup checklist

- [ ] Windows 10/11 laptop with Node.js **v20+** (match main PC: `node --version`)
- [ ] Git installed
- [ ] Network access to `https://mleo-m.vercel.app` and Supabase MP
- [ ] **Copy `.env.local`** from main PC to laptop repo root (same file, no edits unless owner approves)
- [ ] **Copy `scripts/qa-monthly-sim/checkpoints/`** from main PC (campaign JSON + `browser-state-*.json` for 20 personas)
- [ ] Run `npm ci` in repo root
- [ ] Run `npx playwright install chromium`
- [ ] Run `npm run qa:laptop-preflight` — must exit 0 before any live day
- [ ] Disable sleep during runs (see §9)
- [ ] Confirm main PC is **not** running `qa:day` (`npm run qa:day-status` on both machines)

---

## 2. Git clone / pull

**First time (laptop):**

```powershell
cd C:\Projects
git clone <your-repo-url> MLEO-GAME
cd MLEO-GAME
git pull
```

**Updates before each day:**

```powershell
cd C:\Projects\MLEO-GAME
git pull
```

Use the same branch/commit as main PC after Gate 4 fixes (`run-day.mjs`, `ov2PageWait.mjs`, etc.) are merged/pulled.

---

## 3. npm install

**Preferred (lockfile-faithful):**

```powershell
cd C:\Projects\MLEO-GAME
npm ci
```

**If `package-lock.json` changed:**

```powershell
npm install
```

---

## 4. Playwright install / check

```powershell
npx playwright install chromium
npx playwright --version
```

Bundled check (no live run):

```powershell
npm run qa:laptop-preflight
```

---

## 5. Required local env (presence only — no secrets printed)

Copy `.env.local` from main PC. Preflight verifies these are **set** without showing values:

| Purpose | Primary key | Fallback keys |
|---------|-------------|---------------|
| Supabase MP URL | `NEXT_PUBLIC_SUPABASE_URL_MP` | — |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY_MP` | `SUPABASE_SERVICE_ROLE_MP`, `SUPABASE_SERVICE_ROLE_KEY` |
| Live site URL | `NEXT_PUBLIC_AUTH_REDIRECT_BASE` | `QA_SIM_LIVE_BASE` |
| Device cookie signing | `CSRF_SECRET` | `ARCADE_DEVICE_COOKIE_SECRET`, `SESSION_COOKIE_SECRET`, `NEXTAUTH_SECRET` |

```powershell
npm run qa:laptop-preflight
```

---

## 6. Check campaign state (always first)

```powershell
npm run qa:day-status
```

Expected before Day 2 on laptop:

- `campaignId`: `8b562e38-00c9-466d-a64e-c98674394e23`
- `lastCompletedDay`: `1`
- `nextDay`: `2`
- Day 1: `completed`
- Day 2: `aborted` (or absent) — **not** `running`

If Day 2 shows `running`, stop the process on the other machine and mark aborted before continuing.

**Explicit campaign:**

```powershell
npm run qa:day-status -- --campaign-id=8b562e38-00c9-466d-a64e-c98674394e23
```

---

## 7. Dry-run (safe — no live actions)

Preview Day 2 schedule (~5h estimated, no HTTP/Playwright execution):

```powershell
npm run qa:day:2:dry-run
```

Alternative:

```powershell
npm run qa:day --day=2 --dry-run
```

---

## 8. Live daily run from laptop (owner approval required)

**Only after:** preflight passes, dry-run OK, main PC idle, sleep disabled.

```powershell
npm run qa:day --day=2
```

Equivalent:

```powershell
node scripts/qa-monthly-sim/run-day.mjs --day=2
```

`--approve-day` is injected automatically by `run-day.mjs`.

Auto next day (when Day 2 completes):

```powershell
npm run qa:day --day=3
```

---

## 9. Windows sleep / power settings

Live daily runs take **~5 hours**. Sleep kills the run.

**Before each live day:**

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

Or: Settings → System → Power → **Never** sleep on AC power.

Plug in the laptop. Close the lid only if configured to "Do nothing when lid closed."

---

## 10. Single-machine lock reminder

| Step | Main PC | Laptop |
|------|---------|--------|
| Before live day | `npm run qa:day-status` | `npm run qa:day-status` |
| Live `qa:day` | **OFF** after handoff | **ON** |
| During run | Do not start qa:day | Only this machine runs |

If unsure, run `npm run qa:laptop-preflight` — it warns if a day is still `running` in campaign or Supabase.

---

## Syncing checkpoints from main PC

Copy this folder to the laptop (overwrite):

```
scripts/qa-monthly-sim/checkpoints/
  campaign-active.json
  campaign-8b562e38-00c9-466d-a64e-c98674394e23.json
  browser-state-qa_*.json   (20 files)
  campaign-8b562e38-...-day-1.json   (optional)
```

Reports stay on whichever machine ran the day; copy `reports/daily-report-*` back for owner review if needed.

---

## Verification sequence (laptop, no live run)

```powershell
cd C:\Projects\MLEO-GAME
git pull
npm ci
npx playwright install chromium
npm run qa:laptop-preflight
npm run qa:day-status
npm run qa:day:2:dry-run
npm run qa:test:runner-fixes
```

All should succeed before owner approves `npm run qa:day --day=2`.

---

## Troubleshooting

| Issue | Action |
|-------|--------|
| New campaign created on laptop | Copy checkpoints from main PC; delete wrong `campaign-*.json` if owner approves |
| Day 2 blocked as `running` | Abort run in Supabase + fix campaign JSON on the machine that started it |
| OV2 CSP errors | Ensure latest `ov2PageWait.mjs` is pulled |
| npm drops `--day=2` | Use `npm run qa:day --day=2` or `node scripts/qa-monthly-sim/run-day.mjs --day=2` |
| Day 2 aborted re-run | Normal — run Day 2 again; no `--reset-day` needed unless owner wants clean slate |

---

## Related docs

- Master gates: `.cursor/plans/gate35_orchestration_preflight_b30580a7.plan.md`
- Simulator overview: `scripts/qa-monthly-sim/README.md`
