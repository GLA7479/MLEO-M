# BASE — 2800 vs 3200 (`mleo_gain_mult = 0.40`, softcut A_current)

**Generated:** after code update to **3200** + comparison runs.  
**Artifacts:**
- `scripts/base-cap-2800-vs-3200-output.json` — long-term + full stress (2800 vs 3200)
- `scripts/base-mleo-model-sim.mjs --compare-2800-3200` — micro snapshots JSON (stdout)

---

## A) Micro snapshots (24h ideal refinery, same raw MLEO)

Absolute **mleo24h** does **not** change with cap — only **ratio to cap** and **hours to ratio** (distance to softcut brackets in absolute MLEO).

| Profile | Cap | mleo24h | % of cap in 24h | hitsCapDaily | h→100% cap |
|---------|-----|---------|-----------------|--------------|------------|
| early | 2800 | 1142.97 | 40.82% | no | 122.31 |
| early | 3200 | 1142.97 | **35.72%** | no | 139.78 |
| early-mid | 2800 | 2098.08 | 74.93% | no | 54.72 |
| early-mid | 3200 | 2197.07 | **68.66%** | no | 62.54 |
| mid | 2800 | 2596.97 | 92.75% | no | 31.27 |
| mid | 3200 | 2864.28 | **89.51%** | no | 35.73 |
| advanced | 2800 | 2800 | 100% | **yes** | 14.88 |
| advanced | 3200 | 3200 | 100% | **yes** | 17.00 |

**Read:** Strong builds still **fill the cap** in a day; **weaker** profiles show **lower % of cap** at 3200 — same absolute income, **larger psychological “room”** if the UI is %-based.

---

## B) Long-term sim (B_modeled, 180 days)

Same **absolute** daily production for a given archetype/day — **only the denominator (cap)** changes. Therefore **% milestones** (p25…p100) are **harder** at 3200: you need **more absolute MLEO/day** to reach e.g. 25% of cap.

### First day reaching % of **daily cap**

| Archetype | Cap | p25 | p50 | p75 | p90 | p100 |
|-----------|-----|-----|-----|-----|-----|------|
| engaged | 2800 | 165 | — | — | — | — |
| engaged | 3200 | **—** | — | — | — | — |
| grinder | 2800 | 46 | 105 | — | — | — |
| grinder | 3200 | 58 | 148 | — | — | — |
| hardcore | 2800 | 21 | 48 | 120 | — | — |
| hardcore | 3200 | 26 | 58 | **160** | — | — |
| extreme | 2800 | 8 | 23 | 46 | 83 | **169** |
| extreme | 3200 | 12 | 23 | 53 | 111 | **—** |

**Read:** At **3200**, **engaged** never reaches **25% of cap** in 180d (needs **800**/day vs ~**715** max at d180 in this model). **Extreme** does not reach **100% of cap** in 180d (cap-hit days **0** in all windows vs **12** in 91–180 at 2800).  
So: **3200 = fewer cap events & later %-milestones** — **better longevity vs ceiling**, **weaker %-of-cap feedback** for mid players.

### Cap-hit frequency (extreme)

| Cap | 1–7 | 8–30 | 31–90 | 91–180 |
|-----|-----|------|-------|--------|
| 2800 | 0 | 0 | 0 | **12** |
| 3200 | 0 | 0 | 0 | **0** |

---

## C) Stress suite (all scenarios A–E)

Full matrix is in `base-cap-2800-vs-3200-output.json` under `stress.cap2800` / `stress.cap3200`.  
Rule of thumb: **3200** pushes **p100** and **cap spam** later / removes them within 180d for the same progression speed.

---

## D) Answers (explicit)

1. **Does 3200 improve longevity?**  
   **Yes** in this model: fewer %-of-cap touches, **no** extreme cap streak in 91–180 at B_modeled; engaged no longer hits p25% in 180d.

2. **Does 3200 push “progress feeling” too far?**  
   **If** players judge progress by **% of daily cap**, **yes** — same absolute MLEO looks **smaller %**. **If** they judge by **absolute MLEO/day** or upgrades, **no**.

3. **3200 vs 2800 — which is “better”?**  
   - **Longevity / cap anxiety:** **3200**  
   - **Clarity of %-to-cap milestones:** **2800**

4. **Price by segment**

| Segment | 2800 | 3200 |
|---------|------|------|
| casual / consistent | Little change (no milestones either way) | Same |
| engaged | Sees **p25** ~d165 | **No** p25 in 180d — **less “% cap” feedback** |
| grinder | Earlier %-milestones | **Later** milestones |
| extreme | **12** full-cap days late window | **0** full-cap days in 180d — **much less ceiling** |

---

## E) Recommendation

- **Try 3200** if the design priority is **cap as a distant ceiling** and you can show **absolute banked MLEO/day** (or non-% goals).  
- **Prefer 2800** if **% of daily cap** is the **primary** progress bar for engaged players.

**No SQL change beyond migrations/config** was requested for rollback — keep **011** reversible with a down migration if needed.

---

## F) Commands to reproduce

```bash
node scripts/base-mleo-model-sim.mjs
node scripts/base-mleo-model-sim.mjs --compare-2800-3200
node scripts/base-cap-2800-vs-3200.mjs
node scripts/base-progression-longterm-sim.mjs --stress
```
