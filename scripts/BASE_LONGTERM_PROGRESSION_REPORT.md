# BASE — Long-term progression simulation report

**Tool:** `scripts/base-progression-longterm-sim.mjs`  
**Machine output:** `scripts/base-progression-longterm-output.json` (regenerate with `node scripts/base-progression-longterm-sim.mjs`)

---

## 1) Summary

This report answers: **does the live baseline (`daily_mleo_cap = 2800`, `mleo_gain_mult = 0.40`, softcut **A_current**) support *months/years* of felt progression, or does the **daily cap / softcut** dominate too early?**

**What we simulated (explicitly *not* a 24h snapshot):**

- Day-by-day lifecycle **1 → 180** with **6 player archetypes** and **3 upgrade styles** (conservative / balanced / aggressive).
- **Micro layer:** server-aligned refinery raw rate  
  `refinery × 0.015 × mleo_mult × bank_bonus × mleo_gain_mult` + discrete softcut integration (same family as `base_softcut_factor`).
- **Daily loop:** `effectiveSeconds = activeMinutes × 60 × managementQuality` (sessions collapsed to one block/day).
- **Expeditions:** expected banked MLEO from the expedition RPC shape (mean banked roll ≈ 6), scaled by `gain_mult` and softcut.
- **Progression:** refinery / blueprint / logistics / crew / research gates are **explicit functions of day + archetype**, not “fake seniority” — but they are **not** full economic simulation of every `buildingCost()` purchase (see §2).

**Headline results for baseline 2800 / 0.40 / A (balanced style, last run):**

| Archetype | First day ≥25% of daily cap | First day ≥100% cap | Cap-hit days (1–7 / 8–30 / 31–90 / 91–180) |
|-----------|----------------------------|---------------------|---------------------------------------------|
| casual-light | **never in 180d** | never | 0 / 0 / 0 / 0 |
| casual-consistent | never | never | 0 / 0 / 0 / 0 |
| engaged | **~day 165** | never in 180d | 0 / 0 / 0 / 0 |
| grinder | ~day 46 | never | 0 / 0 / 0 / 0 |
| hardcore-optimizer | ~day 21 | never | 0 / 0 / 0 / 0 |
| extreme | ~day 8 | **~day 169** | 0 / 0 / 0 / **12** |

**Activity sensitivity (extreme archetype, baseline):** at **20–180 min/day** simulated active time, **no full cap** within 180d; at **360 min/day**, first **100% cap ~day 110** (see JSON `activityGrid`).

**Verdict on baseline vs your design goals:** **Mostly passes** for “cap is rare; veterans earn more per hour over time” **under this progression model**. **Caveat:** if **real** players upgrade refinery / bank bonuses **faster** than the sqrt-day curves in the script, cap milestones move earlier — treat §2 sensitivity seriously.

---

## 2) Assumptions (explicit)

| Topic | Assumption |
|-------|------------|
| **Server vs client core** | Simulation uses **SQL** core **0.015** (`base_server_authority.sql`). `game/mleo-base.js` uses **0.0165** per level — real client output is ~**+10%** vs this sim unless reconciled. |
| **Resources / energy** | **Not** modeled tick-by-tick. Refinery is assumed **running** during effective online seconds (`managementQuality` = “how often energy/ore/scrap loop is healthy”). This **deflates** cap pressure vs perfect play and **inflates** it vs bad play. |
| **Offline** | **Not** merged into production seconds (conservative: cap pressure may be **higher** in live if offline rules add effective progress). |
| **Shipping** | Does **not** change `mleo_produced_today` in authority model — **omitted** for cap analysis. |
| **Progression curves** | Refinery level ≈ `f(√day, archetype, upgrade style)` + blueprint/logistics growth; research unlocks by **scaled day**. This is **tunable** at top of `base-progression-longterm-sim.mjs` (`refinerySqrtK`, etc.). |
| **Candidate ranking** | Heuristic `rankScore` + `longevityScore` — **not** a proof of optimality; use for **relative** comparison. |

**Sensitivity:** If real progression is **~1.5× faster** than the script’s refinery/bank curve, **first-day-to-p25** scales roughly **÷1.3–1.6** (order-of-magnitude).

---

## 3) Tables — archetypes (baseline 2800 / 0.40 / A, balanced)

**First calendar day reaching % of daily cap (single-day max `produced / cap`):**

*(From `archetypesBalanced[].firstDayMilestone` in JSON.)*

- **casual-light / casual-consistent:** `p25`–`p100` all **null** (under 25% of cap in any single day by day 180).
- **engaged:** `p25 ≈ 165`, `p50+` **null** within 180d.
- **grinder:** `p25 ≈ 46`, `p50 ≈ 105`.
- **hardcore-optimizer:** `p25 ≈ 21`, `p50 ≈ 48`, `p75 ≈ 120`.
- **extreme:** `p25 ≈ 8`, `p50 ≈ 23`, `p75 ≈ 46`, `p90 ≈ 83`, `p100 ≈ 169`.

**Rolling averages of daily production (`weeklyAvg`):**

| Archetype | Avg produced (days 1–7) | Avg (8–30) | Avg (31–90) | Avg (91–180) |
|-----------|-------------------------|------------|-------------|--------------|
| casual-light | ~8 | ~16 | ~32 | ~61 |
| casual-consistent | ~21 | ~45 | ~97 | ~192 |
| engaged | ~65 | ~143 | ~332 | ~626 |
| grinder | ~160 | ~374 | ~921 | ~1543 |
| hardcore-optimizer | ~259 | ~667 | ~1584 | ~2143 |
| extreme | ~474 | ~1265 | ~2282 | ~2677 |

---

## 4) Growth curves / milestones (engaged, baseline)

From `growthCompare.engagedMilestones` + sample days:

| Day | Refinery (sim) | Produced (sim day) | % of cap (2800) |
|-----|----------------|-------------------|-----------------|
| 7 | 3 | ~76 | ~2.7% |
| 14 | 4 | ~112 | ~4.0% |
| 30 | 6 | ~188 | ~6.7% |
| 60 | 8 | ~297 | ~10.6% |
| 90 | 10 | ~485 | ~17.3% |
| 180 | 12 | ~715 | ~25.5% |

**Same archetype, month 6 vs week 2:** `ratio_engaged_d180_vs_d14` ≈ **6.4×** daily production (see JSON `growthCompare`).

**vs casual at day 60:** engaged ~297 vs casual-consistent ~115 (order-of-magnitude gap — see `growthCompare.engagedVsCasual_d60` in JSON).

---

## 5) Cap-hit frequency by lifecycle stage (baseline)

| Archetype | Days 1–7 | 8–30 | 31–90 | 91–180 |
|-----------|----------|------|-------|--------|
| extreme | 0 | 0 | 0 | **12** |
| others (incl. hardcore) | 0 | 0 | 0 | 0 |

So **only the “extreme” profile** accumulates multiple **full cap** days in half a year — and **only in the last window** (91–180) in this run.

---

## 6) Plateau analysis

`report.plateau` runs a naive rolling-14-day derivative on **hardcore-optimizer** daily production.

- If `plateau.plateauStartDay` is **null**, the sim did **not** detect a flat **rolling 14d** window under the default threshold — production still trends up as **bankBonus / mults** climb even when **refinery is capped at 12**.

**Design read:** mechanical **refinery cap at level 12** can create a **secondary progression** through **bankBonus / research / modules** — but if those stall, you’d see income plateau **before** hitting `% of daily cap`. This sim keeps bank growth through day 180 for engaged+.

---

## 7) Does baseline 2800 / 0.40 / A pass your vision?

| Goal | Result in sim |
|------|----------------|
| Casuals far from cap | **Yes** — no p25 in 180d. |
| Consistent players see growth | **Yes** — strong rolling avg growth (table §3). |
| Engaged approaches cap only later | **Yes** — single-day p25 ~day 165; no full cap. |
| Grinder / hardcore cap “late” | **Yes** — no cap days in 180d (except extreme). |
| Only extreme hits cap reliably | **Mostly yes** — 12 cap days, all in 91–180. |
| Months/years longevity | **Plausible**, provided **real** upgrade pace isn’t much faster than §2; otherwise **re-run** with higher `refinerySqrtK`. |

**Where it could “break” in live:**

1. **Faster refinery / bank scaling** than sqrt model → cap milestones shift **weeks earlier**.  
2. **Client 0.0165 vs server 0.015** → ~10% more raw → earlier thresholds.  
3. **Perfect resource / energy uptime** (sim’s `managementQuality` < 1 for most) → earlier cap.  
4. **Offline / mission systems** adding banked MLEO beyond this model.

---

## 8) Top parameter sets (from candidate matrix)

The script ranks combos by `rankScore` (lower = fewer extreme cap hits & “later” pressure; see code).

**Observed pattern (last run):**

- **Higher `daily_mleo_cap`** with **moderate `gain`** often ranks — **but** `engagedP25` becomes **null** because 25% of a larger cap is harder to reach in 180d under the same power curve.
- **Lower gain (0.3)** clusters high — fewer cap events for extreme profiles.

**Use the JSON `topCandidates` array** for exact rows (`dailyCap`, `gainMult`, `curve`, `extremeCapHits_total`, `engagedP25`).

---

## 9) Single recommendation (if you must pick one *now*)

**Keep the current baseline for live experiments:**

- `daily_mleo_cap = 2800`
- `mleo_gain_mult = 0.40`
- Softcut **A_current**

**Why:** Under long-horizon progression, it keeps **casual/engaged** far from daily cap, pushes **first touch of “serious % of cap”** to **late mid-game** for engaged, and reserves **reliable cap** for **extreme** play — matching your stated **GOOD / BAD** criteria **in this model**.

**If** live telemetry shows refinery/bank **2× faster** than this sim: consider **only** lowering `mleo_gain_mult` **or** softening softcut (**C_softer**) **before** touching cap — re-run the script after tuning `refinerySqrtK`.

---

## 10) Why this supports multi-month / multi-year economy

- **Veterans earn more per day** at the same archetype: production at day 180 ≫ day 14 for engaged (**~6×** in this run).  
- **Daily cap** acts as a **ceiling for a given build + playday**, but **not** the primary progression axis — **bank bonus, logistics, research, refinery tier** move the raw curve over **weeks**.  
- **Softcut A** stretches the path to high `% of cap` so **mid-tier** players feel **growth** without **hitting the ceiling** every reset.

---

## 11) How to extend (no production code)

1. Add **offline effective seconds** via `base_effective_offline_seconds` approximation.  
2. Replace sqrt progression with **cost-based** upgrades using `buildingCost()` from `game/mleo-base/data.js` + a simple income model.  
3. Import **`derive()`** from client in a **Node-safe** harness (would require bundling or duplicating formulas — already duplicated from SQL path here).

---

*Generated for design review; numbers depend on `base-progression-longterm-sim.mjs` calibration constants.*
