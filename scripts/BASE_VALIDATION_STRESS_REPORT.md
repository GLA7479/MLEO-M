# BASE — Validation & stress test (long-term sim)

**Baseline under test:** `daily_mleo_cap = 2800`, `mleo_gain_mult = 0.40`, softcut **A_current**  
**Tool:** `scripts/base-progression-longterm-sim.mjs`  
**Commands:**  
`node scripts/base-progression-longterm-sim.mjs` — דוח רגיל + JSON  
`node scripts/base-progression-longterm-sim.mjs --stress` — טבלאות רגישות A–E  
**Output:** `scripts/base-progression-longterm-output.json` (כולל `stressValidation`, `assumptionAudit`, `stressSummaryTable`)

---

## 1) Summary קצר

- הוספנו **sensitivity sweep** על אותו מודל: **מהירות שדרוג** (`upgradeMult`) ו**יעילות reinvest** (`reinvestMult`) — לא framework חדש.
- **B (as-modeled)** נשאר נקודת הבסיס; **A** מחמיר, **C–E** מדמים progression מהיר יותר (סיכון אם המשחק האמיתי מהיר מהסימולציה).
- **דגל סיכון אוטומטי** `extreme_cap_spam_midgame`: ≥15 ימי cap ל־archetype **extreme** בחלון **31–90** (מתאים ל"שבירה" כשהקצה מתחיל לפגוע ב-cap לפני late game).
- **במסגרת הריצה האחרונה:** תרחישים **A–D** — אין spam midgame ל־extreme; **E (2×)** — **`extreme_cap_spam_midgame: true`** (36 ימי cap ב־31–90).
- **מסקנה:** **2800 / 0.40 / A** נראה **עמיד (robust)** עד **~1.5×** מהירות progression מהמודל; ב־**2×** המערכת **נשברת לקצה** (extreme "ננעל" על cap באמצע המשחק).

---

## 2) Assumption audit (מפורש)

הטבלה נשמרת גם ב־JSON תחת `report.assumptionAudit`. סיכום כיווני שגיאה:

| הנחה | bias | אם המציאות מהירה מהמודל | אם המציאות איטית יותר |
|------|------|-------------------------|-------------------------|
| מהירות refinery (sqrt×K) | neutral | milestones **מוקדמים** | **מאוחרים** |
| mleoMult (crew/hq/miner/research) | neutral | **מוקדמים** | **מאוחרים** |
| bankBonus (blueprint+logistics) | neutral | **מוקדמים** | **מאוחרים** |
| expeditions (תצפית ללא DATA gate) | optimistic | קצת **מוקדם** | — |
| managementQuality | conservative | **מוקדם** (אם uptime אמיתי גבוה) | **מאוחר** |
| reinvest | neutral (× ב-stress) | **מוקדם** | **מאוחר** |
| active/offline | conservative (אין offline merge) | offline מוסיף הכנסה → **מוקדם** | — |
| shipping | neutral ל-cap | לא משפיע על `mleo_produced_today` | — |
| ore/energy tick | optimistic (אין רעב משאבים) | — | bottlenecks → **מאוחר** |
| עלויות שדרוג אמיתיות | optimistic | עלויות איטיות → **מאוחר** | rush → **מוקדם** |
| offline merge מלא | conservative | מיזוג מוסיף → **מוקדם** | — |

---

## 3) Sensitivity scenarios (A–E)

| ID | upgradeMult | reinvestMult | משמעות |
|----|---------------|--------------|--------|
| A_slower | 0.75 | 0.75 | איטי יותר |
| B_modeled | 1 | 1 | המודל הנוכחי |
| C_faster | 1.25 | 1.25 | מהיר יותר |
| D_much_faster | 1.5 | 1.5 | מהיר משמעותית |
| E_extreme_fast | 2 | 2 | קיצון (סטרס) |

**מימוש:** `effective progression day d = calendarDay × upgradeMult`; `effReinvest = archetype.reinvest × reinvestMult` ל־blueprint/logistics.

---

## 4) טבלאות — יום ראשון ל־p25 / p50 / p75 / p90 / p100 (מתוך `--stress`)

*(הרץ `node scripts/base-progression-longterm-sim.mjs --stress` לעדכון מספרים מדויקים.)*

**ממצאים אופייניים (ריצה אחרונה):**

- **engaged — p25:** A: null · B: **165** · C: **128** · D: **106** · E: **60**  
  (אף תרחיש לא הגיע ל־**p75** ב־180 יום במסגרת המודל — ה-cap יחסית גבוה מול קצב ההכנסה.)
- **extreme — p100:** A: null · B: **169** · C: **126** · D: **88** · E: **55**
- **extreme — cap hits חלון 31–90:** A: 0 · B: 0 · C: 0 · D: **3** · E: **36**

---

## 5) Danger thresholds ("מה נחשב מוקדם מדי")

מוגדרים בקוד: `DANGER_THRESHOLDS_DOC` + `dangerFlags` לכל תרחיש.

| סימן BAD | כלל (ברירת מחדל) | מתי נדלק בריצה האחרונה |
|----------|-------------------|-------------------------|
| engaged נוגע ב־75% מוקדם | `p75` קיים ו־`≤ 90` | לא נדלק (אין p75 ב־180d) |
| grinder מגיע ל־100% מוקדם | `p100` קיים ו־`≤ 120` | לא נדלק |
| hardcore נוגע cap ב־midgame | כל hit ב־8–30 או 31–90 | לא נדלק |
| extreme מגיע ל־cap מוקדם מדי | `p100 ≤ 45` | לא נדלק (E: יום **55**) |
| burst מוקדם (extreme) | סכום hits ב־1–7 + 8–30 ≥ 3 | לא נדלק |
| **spam ב־midgame (extreme)** | hits ב־**31–90** ≥ **15** | **נדלק ב־E בלבד** |

**פרשנות:** אם progression האמיתי ≈ **1.25–1.5×** מהמודל — עדיין בטוח יחסית לפי הדגלים האלה. ב־**2×** — **הקצה** מתנהג כמו "maintenance cap player" באמצע העונה.

---

## 6) Plateau / boredom risk (כיוון הפוך)

מדדים: `growthFeel` — ייצור יומי בימים 14 / 30 / 60 / 90 / 180 + יחסים `ratio_90_vs_14`, `ratio_180_vs_30`.

**B (modeled), דוגמה (ריצה אחרונה):**

- **casual-consistent:** `ratio_90_vs_14 ≈ 3.5`, `ratio_180_vs_30 ≈ 4.4` — גדילה חזקה לאורך זמן.
- **engaged:** `ratio_90_vs_14 ≈ 4.3`, `ratio_180_vs_30 ≈ 3.8` — עדיין מרגיש progression משמעותי.

**A (איטי יותר):** יחסים נמוכים יותר אך עדיין >2.8 — פחות "wow", פחות סיכון cap.

**E (2×):** engaged עדיין עולה חזק בין ימים, אבל **extreme** נכנס ל־cap spam — זה **לא boredom** אלא **תקרה תכופה מדי**.

---

## 7) Robustness verdict — 2800 / 0.40 / A_current

| תנאי | מסקנה |
|------|--------|
| Progression כמו B (מודל) | **בטוח יחסית** — אין דגלי סיכון |
| עד **~1.5×** (C–D) מהיר יותר | **עדיין סביר** — extreme מתקרב ל-cap אך ללא spam חמור (D: 3 ימי cap ב־31–90) |
| **~2×** (E) | **לא robust לקצה** — `extreme_cap_spam_midgame` |

**תשובה ישירה:** ההגדרות **לא תלויות רק** ב"מודל מדויק", אבל **כן רגישות** אם המשחק האמיתי דוחף שחקנים חזקים ל־**~2×** מהירות מההנחות (או client core 0.0165 + שדרוגים מהירים).

---

## 8) מה לעשות עכשיו (ללא שינוי SQL)

| אפשרות | המלצה |
|--------|--------|
| להשאיר כמו שזה | **כן** לבדיקות שטח + טלמטריה — עד שנראה progression אמיתי |
| להוריד gain | רק אם טלמטריה מראה **p100**/**spam** מוקדם גם ב־**~1.25×** מהמודל |
| להעלות cap | רק אם הבעיה היא **תחושת ערך** נמוכה בלי cap (לא מומלץ רק בגלל סימולציה) |
| להקשיח softcut | אם **extreme** מגיע ל־spam **לפני** 2× — לא ראינו את זה ב־D |

---

## 9) Telemetry — 5–10 מדדים לכיול (מומלץ)

1. **ממוצע רמת refinery** לפי דלי יום (1–7, 8–30, 31–90, 91–180) לפי cohort.
2. **ממוצע `mleo_produced_today` ליום** (התפלגות percentiles) — מול cap.
3. **אחוז שחקנים** שהגיעו ל־25/50/75/90/100% של cap **ביום לפחות פעם אחת** בחלון זמן.
4. **ממוצע דקות פעילות / יום** (או session length) — לכיול `managementQuality`.
5. **ממוצע expeditions / יום** — לכיול עקומת expedition.
6. **ממוצע shipped MLEO / יום** (vault) — לא cap, אבל health של הלופ.
7. **מגמת `bankBonus` / `mleoMult` אפקטיביים** — אם תישמר צלמית בשרת/לוג — לאימות מול `derive`.
8. **זמן ממוצע בין שדרוגי refinery** (אירועים).
9. **שיעור ימים עם cap מלא** לשחקן (rolling 30d) — ישירות ל־"spam".
10. **גרסת client** / flag אם סימולציה client (0.0165) vs reconcile server.

עם זה אפשר **לאשר או להפריך** את `upgradeMult`/`reinvestMult` האפקטיביים.

---

## 10) הפניה לקוד

- `STRESS_SCENARIOS`, `runStressValidationSuite`, `dangerFlagsForScenario`, `growthFeelMetrics`
- `report.assumptionAudit`, `report.stressValidation`, `report.stressSummaryTable`

---

*מסמך עזר לעיצוב; מספרים מדויקים — מהרצת הסקריפט המקומית האחרונה.*
