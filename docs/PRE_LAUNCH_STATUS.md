# סטטוס לפני השקה — MLEO BASE

## כבר בוצע (שלב 1)

| נושא | סטטוס |
|------|--------|
| **מקור אמת למספרים** | `mleo-base.js`: CONFIG עם 36 / 120_000 / 300; ship cap = 12000 + blueprint×5000; cooldown קבוע. `base_server_authority.sql` ו־`base_atomic_rpc.sql` מיושרים לאותה נוסחה. |
| **Build אטומי** | `base/action/build.js` עובר ל־RPC `base_build_upgrade` בלבד. |
| **תחביר mleo-base.js** | נבדק: אין `.prev` / `.base` / `.(` שבורים — כל המופעים הם spread תקין (`...prev`, `...base`, `...( ... )`). |
| **vault/apply** | Ship ו־spend חסומים ב־vault/apply (410 + USE_ACTION_API). מותר רק `mleo-base-logistics-bonus` (בונוס אחרי ship). |

---

## ממתין לקוד שלך (שלב 2)

| נושא | פעולה |
|------|--------|
| **Crew/Maintenance/Module/Research אטומיים** | להכניס 4 RPC: `base_hire_crew`, `base_perform_maintenance`, `base_install_module`, `base_unlock_research` ולהחליף את קבצי ה־API. |
| **אכיפת prerequisites בשרת** | ב־`base_build_upgrade` ו־RPC מחקר — לבדוק `requires` (בניין/מחקר) ולא רק cost ו־max level. |

---

## מומלץ אחרי שלב 2 (פוליש)

- mission progress רק state שרתי (לא optimistic).
- version/updated_at guard ב־updates לא־אטומיים.
- מבנה אחיד ל־`state` בתשובות API.
- להחזיר `cost`/`delta` בכל פעולה.
- energy/DATA checks ב־UI תואמים ל־RPC (refill 5 DATA, overclock 12 DATA).
- UX: softcut tooltip, cooldown מ־`expedition_ready_at`, unlock reason בכפתורים.
- error codes אחידים, audit logs, בדיקות גבול, max limits בשרת.

---

## חמשת "אל תדלג"

1. **איחוד כל המספרים** — בוצע.
2. **Build אטומי** — בוצע.
3. **Crew/Maintenance/Module/Research אטומיים** — ממתין ל־RPC + קבצי API.
4. **אכיפת prerequisites בשרת** — להשלים ב־RPC החדשים.
5. **בדיקת syntax ב־mleo-base.js** — בוצע, אין שברים.
