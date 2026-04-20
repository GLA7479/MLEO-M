# OV2 Snakes & Ladders — Retrospective and Lessons Learned

## 1. What went wrong

The problem was **not** the Snakes & Ladders game rules themselves. The pain came from the **implementation process** and the **integration shape**: how work was sequenced, where files lived, how dependencies were named, how SQL was written, and how migrations were applied versus what lived in the repo.

Concrete points:

- **Implementation started before ownership and final shape were truly stable.** Work proceeded while boundaries between “this game” and “shared OV2” were still moving, which multiplied rework.
- **Shared/global integration was initially placed in the wrong location.** Treating shared concerns as if they belonged only under a game-specific tree made merges, discovery, and mental ownership harder and encouraged the wrong dependency graph.
- **A non-neutral helper dependency was introduced and had to be removed.** Anything that reads as “another product’s helper” is a liability for every future game and for reviewers.
- **SQL functions repeatedly failed at compile time.** PostgreSQL’s compiler surfaced issues (types, row variables, `INTO` shapes) in waves rather than in one clean pass.
- **On-disk files and actual DB-applied versions drifted apart.** Fixes were applied in the database (or in ad-hoc snippets) without the canonical migration file being updated in the same moment, so the repo stopped being a reliable source of truth.
- **Running whole migration files blindly caused repeated failures.** Large files mixed schema, helpers, and many functions; a single bad block blocked everything and obscured which unit was actually wrong.
- **Isolating functions one-by-one was what finally worked.** Extracting or running a single `CREATE OR REPLACE FUNCTION` at a time, fixing only that unit, and reconciling the file immediately broke the failure spiral.

## 2. Shared vs game-specific ownership

**Rule:** Game-private SQL belongs under the **game folder** (schemas, seats, sessions, game RPCs for that product). **Shared/global OV2 integration** must **not** live under a game-specific folder: it is cross-cutting infrastructure used by many products.

Shared/global functions—examples include **leave-room**, **QM allowlists / caps**, **economy entry policy**—must be treated as **core/shared OV2 infrastructure**, with clear ownership and neutral naming, not as “part of Snakes.”

**Explicit statement:** Unstable or ambiguous **ownership boundaries between Snakes-only SQL and shared OV2 SQL** were **one of the major causes of instability** in the Snakes rollout. Future games should decide this split **before** large bodies of SQL land.

## 3. Neutral dependency rule

**Rule:** A new OV2 game may depend only on:

- **Neutral shared OV2 infrastructure** (shared rooms, shared economy hooks, generic patterns agreed for all games).
- **Neutral OV2 helpers** (names and APIs that do not imply a specific other game).
- **Its own game-specific files** (under that game’s area).

It **must not** import helpers **named after another product** (e.g. a helper whose name or module path encodes “Ludo,” “BoardPath,” etc.) unless that is genuinely a shared, renamed, neutralized API—which should be rare and deliberate.

**Explicit statement:** Snakes originally depended on a **BoardPath-named** helper; that coupling was **wrong for a new game** and **had to be neutralized** (or replaced with a neutral shared helper) so Snakes and future games do not inherit accidental semantics or ownership confusion.

## 4. SQL lessons learned

For **new OV2 functions**, strongly prefer:

- **Scalar variables** for everything you read from a row and use in control flow.
- **`PERFORM … FOR UPDATE`** when you need a row lock without stuffing the whole row into a PL/pgSQL variable.
- **Scalar assignment** using `:= (SELECT …)` (or similar) for individual fields, so types and nullability stay obvious.

**Avoid when possible:**

- **`%ROWTYPE`** on table rows for transient “current row” state in complex functions.
- **Row variables** like `v_room`, `v_sess` that encourage `v_room.field` sprawl and subtle drift after partial updates.
- **`SELECT * INTO rowvar`** (harder to review, easier to break when tables evolve).
- **Complex multi-column `SELECT … INTO …`** unless kept very small and stable; they often regressed into row-shaped thinking.

**Statement:** The repeated **compile-time** and **install-time** failures were **all variations of brittle row-centric PL/pgSQL**—row types, `SELECT * INTO`, and multi-column `INTO` combined with later returns that still assumed a fresh row snapshot. Moving toward **scalar-only** style and **explicit re-reads** where needed aligned the code with what Postgres validates cleanly.

## 5. Migration execution lesson

**Operational rule:** **Never** begin by running an entire new game migration chain blindly end-to-end.

**Instead:**

1. Run **schema/helpers** first (tables, types, small immutable helpers).
2. **Isolate** each `CREATE OR REPLACE FUNCTION` block (or logical block) so it can be applied alone.
3. **Execute functions one-by-one** in dependency order.
4. **Fix only the exact failing function** (minimal change, preserve behavior).
5. **After each passed function, immediately update the on-disk migration file** to match the version that actually applied.
6. **Only after all function blocks pass**, move on to the next migration file in the chain.
7. **Only after all SQL is stable**, run **runtime testing** in the app.

**Statement:** This **isolation approach** is what **finally got Snakes through** the SQL wall: small blast radius, clear causality, and the repo stayed aligned with the database.

## 6. Drift prevention rule

**Rule:** At **no** point should **repo migration files** and **actually applied DB function definitions** be allowed to **drift**.

After **any** manual isolated SQL fix that **passes** in the database, the corresponding **on-disk migration file must be updated immediately** before continuing to the next block or the next debugging step. The migration file is the contract for the next environment and for CI/review; the database alone is not.

## 7. Future OV2 game checklist

Use this as a **short gate** before and during implementation:

- [ ] **Lock spec first** (rules, phases, seats, stakes, leave/forfeit semantics at a high level).
- [ ] **Lock ownership boundaries first** (what is game-private SQL vs shared/global SQL).
- [ ] **Separate game-private vs shared/global SQL before coding** (folder layout and migration numbering plan).
- [ ] **Use neutral helpers only** (no imports from another product’s named helper surface).
- [ ] **Prefer scalar-only PL/pgSQL style** for new shared-adjacent functions and complex game RPCs.
- [ ] **Isolate SQL functions during first execution** (never the whole chain as the first move).
- [ ] **Update repo files immediately after any passed isolated fix** (zero drift tolerance).
- [ ] **Only then** run the game flow **end-to-end** in the app.

## 8. Final conclusion

The Snakes problems were **not** caused by the game itself being inherently difficult to specify or play. They were caused by **unstable ownership boundaries** between shared and game-specific work, **non-neutral dependency usage** that tied a new product to another product’s naming and helpers, **brittle SQL function style** (row variables and broad `INTO` patterns that fought the compiler), and **running large migration chunks before isolating failing units**, which let **repo and database drift**. Fixing the **process**—boundaries, neutrality, scalar SQL style, and incremental apply-with-immediate file sync—is what makes the next OV2 game tractable.
