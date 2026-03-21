# BASE — Final cap comparison (script-only)

**Fixed:** `mleo_gain_mult = 0.40`, softcut **A_current**, assumptions = long-term sim (balanced).

**Candidates:** 3000, 3200, 3400, 3600

## A) Micro (24h ideal refinery)

### Cap 3000

| Profile | MLEO 24h | % cap | h→25% | h→50% | h→75% | h→90% | h→100% |
|---------|----------|-------|-------|-------|-------|-------|--------|
| early | 1142.97 | 38.1% | 15.75 | 31.5 | 57.55 | 89.05 | 131.05 |
| early-mid | 2147.58 | 71.59% | 7.05 | 14.09 | 25.75 | 39.84 | 58.63 |
| mid | 2734.55 | 91.15% | 4.03 | 8.05 | 14.71 | 22.76 | 33.5 |
| advanced | 3000 | 100% | 1.92 | 3.83 | 7 | 10.83 | 15.94 |

### Cap 3200

| Profile | MLEO 24h | % cap | h→25% | h→50% | h→75% | h→90% | h→100% |
|---------|----------|-------|-------|-------|-------|-------|--------|
| early | 1142.97 | 35.72% | 16.8 | 33.6 | 61.39 | 94.99 | 139.78 |
| early-mid | 2197.07 | 68.66% | 7.52 | 15.03 | 27.47 | 42.5 | 62.54 |
| mid | 2864.28 | 89.51% | 4.29 | 8.59 | 15.69 | 24.28 | 35.73 |
| advanced | 3200 | 100% | 2.04 | 4.09 | 7.47 | 11.55 | 17 |

### Cap 3400

| Profile | MLEO 24h | % cap | h→25% | h→50% | h→75% | h→90% | h→100% |
|---------|----------|-------|-------|-------|-------|-------|--------|
| early | 1142.97 | 33.62% | 17.85 | 35.7 | 65.23 | 100.92 | 148.52 |
| early-mid | 2246.58 | 66.08% | 7.99 | 15.97 | 29.18 | 45.15 | 66.45 |
| mid | 2959.46 | 87.04% | 4.56 | 9.13 | 16.67 | 25.8 | 37.97 |
| advanced | 3400 | 100% | 2.17 | 4.34 | 7.93 | 12.28 | 18.07 |

### Cap 3600

| Profile | MLEO 24h | % cap | h→25% | h→50% | h→75% | h→90% | h→100% |
|---------|----------|-------|-------|-------|-------|-------|--------|
| early | 1142.97 | 31.75% | 18.9 | 37.8 | 69.06 | 106.86 | 157.26 |
| early-mid | 2296.08 | 63.78% | 8.46 | 16.91 | 30.9 | 47.81 | 70.36 |
| mid | 3054.64 | 84.85% | 4.83 | 9.66 | 17.66 | 27.32 | 40.2 |
| advanced | 3600 | 100% | 2.3 | 4.6 | 8.4 | 13 | 19.13 |

## B) Long-term (first day hitting % of cap, 180d)

### Cap 3000

| Archetype | p25 | p50 | p75 | p90 | p100 | 1–7 | 8–30 | 31–90 | 91–180 |
|-----------|-----|-----|-----|-----|------|-----|------|-------|--------|
| casual-light | — | — | — | — | — | 0 | 0 | 0 | 0 |
| casual-consistent | — | — | — | — | — | 0 | 0 | 0 | 0 |
| engaged | — | — | — | — | — | 0 | 0 | 0 | 0 |
| grinder | 55 | 120 | — | — | — | 0 | 0 | 0 | 0 |
| hardcore-optimizer | 21 | 52 | 135 | — | — | 0 | 0 | 0 | 0 |
| extreme | 8 | 23 | 46 | 99 | — | 0 | 0 | 0 | 0 |

### Cap 3200

| Archetype | p25 | p50 | p75 | p90 | p100 | 1–7 | 8–30 | 31–90 | 91–180 |
|-----------|-----|-----|-----|-----|------|-----|------|-------|--------|
| casual-light | — | — | — | — | — | 0 | 0 | 0 | 0 |
| casual-consistent | — | — | — | — | — | 0 | 0 | 0 | 0 |
| engaged | — | — | — | — | — | 0 | 0 | 0 | 0 |
| grinder | 58 | 148 | — | — | — | 0 | 0 | 0 | 0 |
| hardcore-optimizer | 26 | 58 | 160 | — | — | 0 | 0 | 0 | 0 |
| extreme | 12 | 23 | 53 | 111 | — | 0 | 0 | 0 | 0 |

### Cap 3400

| Archetype | p25 | p50 | p75 | p90 | p100 | 1–7 | 8–30 | 31–90 | 91–180 |
|-----------|-----|-----|-----|-----|------|-----|------|-------|--------|
| casual-light | — | — | — | — | — | 0 | 0 | 0 | 0 |
| casual-consistent | — | — | — | — | — | 0 | 0 | 0 | 0 |
| engaged | — | — | — | — | — | 0 | 0 | 0 | 0 |
| grinder | 58 | 165 | — | — | — | 0 | 0 | 0 | 0 |
| hardcore-optimizer | 26 | 58 | 165 | — | — | 0 | 0 | 0 | 0 |
| extreme | 12 | 28 | 55 | 120 | — | 0 | 0 | 0 | 0 |

### Cap 3600

| Archetype | p25 | p50 | p75 | p90 | p100 | 1–7 | 8–30 | 31–90 | 91–180 |
|-----------|-----|-----|-----|-----|------|-----|------|-------|--------|
| casual-light | — | — | — | — | — | 0 | 0 | 0 | 0 |
| casual-consistent | — | — | — | — | — | 0 | 0 | 0 | 0 |
| engaged | — | — | — | — | — | 0 | 0 | 0 | 0 |
| grinder | 59 | 178 | — | — | — | 0 | 0 | 0 | 0 |
| hardcore-optimizer | 29 | 65 | — | — | — | 0 | 0 | 0 | 0 |
| extreme | 12 | 30 | 56 | 141 | — | 0 | 0 | 0 | 0 |

## C) Stress (B_modeled, C_faster, D_much_faster, E_extreme_fast)

### Cap 3000

**B: as-modeled (1× / 1×)**
- extreme: first p100 day = —, cap days 31–90 = 0, 91–180 = 0
- engaged: first p25 day = —
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**C: faster (1.25× / 1.25×)**
- extreme: first p100 day = 132, cap days 31–90 = 0, 91–180 = 49
- engaged: first p25 day = 153
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**D: much faster (1.5× / 1.5×)**
- extreme: first p100 day = 107, cap days 31–90 = 0, 91–180 = 74
- engaged: first p25 day = 110
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**E: extreme-fast (2× / 2×)**
- extreme: first p100 day = 60, cap days 31–90 = 31, 91–180 = 90
- engaged: first p25 day = 80
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":true}

### Cap 3200

**B: as-modeled (1× / 1×)**
- extreme: first p100 day = —, cap days 31–90 = 0, 91–180 = 0
- engaged: first p25 day = —
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**C: faster (1.25× / 1.25×)**
- extreme: first p100 day = 154, cap days 31–90 = 0, 91–180 = 27
- engaged: first p25 day = 176
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**D: much faster (1.5× / 1.5×)**
- extreme: first p100 day = 110, cap days 31–90 = 0, 91–180 = 71
- engaged: first p25 day = 134
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**E: extreme-fast (2× / 2×)**
- extreme: first p100 day = 83, cap days 31–90 = 8, 91–180 = 90
- engaged: first p25 day = 83
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

### Cap 3400

**B: as-modeled (1× / 1×)**
- extreme: first p100 day = —, cap days 31–90 = 0, 91–180 = 0
- engaged: first p25 day = —
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**C: faster (1.25× / 1.25×)**
- extreme: first p100 day = 164, cap days 31–90 = 0, 91–180 = 17
- engaged: first p25 day = —
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**D: much faster (1.5× / 1.5×)**
- extreme: first p100 day = 137, cap days 31–90 = 0, 91–180 = 44
- engaged: first p25 day = 147
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**E: extreme-fast (2× / 2×)**
- extreme: first p100 day = 103, cap days 31–90 = 0, 91–180 = 78
- engaged: first p25 day = 100
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

### Cap 3600

**B: as-modeled (1× / 1×)**
- extreme: first p100 day = —, cap days 31–90 = 0, 91–180 = 0
- engaged: first p25 day = —
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**C: faster (1.25× / 1.25×)**
- extreme: first p100 day = —, cap days 31–90 = 0, 91–180 = 0
- engaged: first p25 day = —
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**D: much faster (1.5× / 1.5×)**
- extreme: first p100 day = 160, cap days 31–90 = 0, 91–180 = 21
- engaged: first p25 day = 160
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

**E: extreme-fast (2× / 2×)**
- extreme: first p100 day = 120, cap days 31–90 = 0, 91–180 = 61
- engaged: first p25 day = 110
- danger flags: {"engaged_p75_before_day_90":false,"grinder_p100_before_day_120":false,"hardcore_cap_hits_midgame":false,"extreme_p100_before_day_45":false,"extreme_cap_burst_early":false,"extreme_cap_spam_midgame":false}

## D) Verdict table

| Cap | Progress feel | Longevity | Early cap risk | Too-cold risk | Overall |
|-----|---------------|-----------|----------------|---------------|----------|
| 3600 | lower %-of-cap feedback | very rare cap | low | medium (harder %-bar) | strong |
| 3400 | lower %-of-cap feedback | very rare cap | low | medium (harder %-bar) | strong |
| 3200 | lower %-of-cap feedback | very rare cap | low | low | viable |
| 3000 | lower %-of-cap feedback | very rare cap | high (E scenario) | low | viable |

## E) Ranking & recommendation

1. **3600** (score 6.5)
2. **3400** (score 6)
3. **3200** (score 5.5)
4. **3000** (score 5)

**Winner (naive heuristic):** **3600** — highest numeric score in the built-in heuristic.

**Runner-up (naive heuristic):** **3400**.

_The built-in score favors higher cap headroom; see **F** for a design-first override._

---

## F) Design-first Q&A + final rank (חזון: cap נדיר, progression מורגש)

**אותו מודל לכל ה-caps:** absolute MLEO/day זהה; רק **המכנה (cap)** משפיע על **% מה-cap** ועל **ימי cap מלאים**.

| שאלה | 3000 | 3200 | 3400 | 3600 |
|------|------|------|------|------|
| 1. Longevity? | טוב | טוב | טוב מאוד | טוב מאוד |
| 2. מרחיק מדי את תחושת התקדמות (%)? | פחות | בינוני | יותר | הכי הרבה |
| 3. cap נדיר לחזקים (B)? | כן | כן | כן | כן |
| 4. “קר” ל-engaged/grinder? | פחות | בינוני | בינוני–גבוה | גבוה יותר |
| 5. extreme מוקדם מדי? | **E: spam midgame** | E: ללא spam | E: נקי מ-31–90 | E: נקי מ-31–90 |
| 6. Plateau מוקדם? | לא בולט ב-sim | לא | לא | לא |
| 7. Tradeoff מרכזי | **סיכון תחת progression מהיר** | איזון | יותר headroom, פחות % | max headroom, % נמוך |

### דירוג 1–4 (לפי חזון — לא רק score)

1. **3400** — headroom גבוה בלי “להרגיש ריק” כמו 3600 במיקרו (mid עדיין ~87% ב-24h).
2. **3200** — איזון: ב-**E** אין `extreme_cap_spam_midgame`; פחות cap יומי מלא מ-3000 ברמות גבוהות.
3. **3600** — הכי “נדיר” לגעת ב-cap; המחיר: **% מה-cap** נמוך יותר לכל אותו MLEO מוחלט.
4. **3000** — הכי “חם” ב-%; **אבל** בתרחיש **E (extreme-fast)** מופיע **spam ב-31–90** — סיכון אם progression אמיתי מהיר.

### המלצה סופית (עיצוב)

- **Winner: 3400** — שומר על cap נדיר גם תחת סטרס, פחות קיצוני מ-3600 בתחושת %.
- **Runner-up: 3200** — אם רוצים מספר עגול ופחות שינוי תחושתי מ-3200 שכבר נבדק.

**לא לבחור 3000** כברירת מחדל רק בגלל %-חם יותר — **ה-stress E** מראה שבר תחת progression מהיר.

---

## G) קבצים (ללא שינוי SQL/UI)

| קובץ | תפקיד |
|------|--------|
| `scripts/base-cap-final-comparison.mjs` | הרצת השוואה |
| `scripts/base-cap-final-comparison.json` | פלט מלא |
| `scripts/base-progression-longterm-sim.mjs` | `main()` רק כשמריצים את הקובץ ישירות (למניעת side-effect בייבוא) |

**הרצה:** `node scripts/base-cap-final-comparison.mjs`
