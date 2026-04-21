---
name: OV2 Bomber Arena Rebuild
overview: "Locked product spec: 2P Bomber duel with 2 bombs, chain reactions, fuse 6, emergency-only wait, anti-stall + sudden death, Bomber-native UI identity—implemented via forward SQL + Bomber-only client, settlement unchanged."
todos:
  - id: sql-player-step-core
    content: "Forward migration: player_step — maxBombs=2; no same-turn fuse tick on new bomb; chain propagation (fixpoint sweeps); bombs in blast arm to 0 same wave; wait only if legalMoveCount=0; sim_tick cap draw; sudden_death rulesPhase; lastAction; finishReason-compatible fields"
    status: completed
  - id: sql-board-factory
    content: "Forward migration: initial_board_json — 9x9 structured lanes + 3-step Manhattan spawn bubble; maxSimTicks=200 suddenDeathStartTick=140 bombRadius=1 fuseTicksDefault=6 maxBombsPerPlayer=2 embedded"
    status: completed
  - id: sql-snapshot
    content: "Forward migration: build_client_snapshot — simTicksRemaining rulesPhase canWait legalMoveCount lastAction finishReason optional chainGen"
    status: completed
  - id: client-bomber-identity
    content: Adapter + hook + Ov2BomberArenaScreen + minimal shell props — VS HUD, orange/slate bomb identity, control hierarchy, explosion/turn feedback, finish copy K.O./Time limit, hide dead rematch
    status: completed
  - id: qa-full
    content: "QA: two-bomb placement, chain scenarios, wait rejection when moves exist, timeout draw settlement, double KO, mobile controls"
    status: completed
isProject: false
---

# OV2 Bomber Arena — rebuild plan (revision 2: locked decisions, planning only)

## 1. Current implementation summary

**Architecture:** Server-authoritative 2P arena. Host calls `ov2_bomber_arena_open_session` ([161](migrations/online-v2/bomber-arena/161_ov2_bomber_arena_session_rpcs.sql)); `board` is a single `jsonb` on `ov2_bomber_arena_sessions` ([159](migrations/online-v2/bomber-arena/159_ov2_bomber_arena_schema.sql)) holding `w,h`, `walls`, `breakables`, `players`, `bombs`, `turnSeat`, `bombRadius`, `fuseTicksDefault`, `maxBombsPerPlayer`. Moves go through `ov2_bomber_arena_player_step` ([162](migrations/online-v2/bomber-arena/162_ov2_bomber_arena_gameplay_rpcs.sql) + forward [168](migrations/online-v2/bomber-arena/168_ov2_bomber_arena_player_step_gameplay.sql)) with per-player idempotency keys.

**Gameplay loop (verified):** On each accepted step: apply `move` / `bomb` / `wait` → **decrement fuse on every bomb in the same tick** (including bombs just placed) → resolve any `fuse <= 0` explosions (walls stop ray; breakables take hit and stop ray; players on hit tiles die) → if both dead `is_draw`; else winner; else flip `turnSeat`. `sim_tick` increments every successful step.

**Board factory:** `ov2_bomber_arena_initial_board_json` ([160](migrations/online-v2/bomber-arena/160_ov2_bomber_arena_engine_helpers.sql) + [167](migrations/online-v2/bomber-arena/167_ov2_bomber_arena_initial_board_gameplay.sql)): 9×9, border walls + pillar grid, breakables fill interior minus spawns and four pocket tiles; `fuseTicksDefault` **5** in repo today.

**Snapshot:** `ov2_bomber_arena_build_client_snapshot` returns `sessionId`, `roomId`, `matchSeq`, `revision`, `simTick`, `phase`, `status`, `turnSeat`, full `board`, `mySeat`, `winnerSeat`, `isDraw`, `seats[]` ([161](migrations/online-v2/bomber-arena/161_ov2_bomber_arena_session_rpcs.sql)). `ov2_bomber_arena_get_snapshot` resolves latest session when `active_session_id` is null ([166](migrations/online-v2/bomber-arena/166_ov2_bomber_arena_get_snapshot_after_room_clear.sql)).

**Settlement:** `phase = finished` trigger → `ov2_bomber_arena_win` or draw split lines from `pot_locked` ([163](migrations/online-v2/bomber-arena/163_ov2_bomber_arena_settlement.sql)); room pointer clear ([164](migrations/online-v2/bomber-arena/164_ov2_bomber_arena_room_clear_on_finish.sql)). Client vault path: [`useOv2BomberArenaSession`](hooks/useOv2BomberArenaSession.js) → [`ov2BomberArenaSettlement.js`](lib/online-v2/bomber-arena/ov2BomberArenaSettlement.js).

**Client:** [`Ov2BomberArenaLiveShell`](components/online-v2/bomber-arena/Ov2BomberArenaLiveShell.js) → [`Ov2BomberArenaScreen`](components/online-v2/bomber-arena/Ov2BomberArenaScreen.js); adapter [`ov2BomberArenaSessionAdapter.js`](lib/online-v2/bomber-arena/ov2BomberArenaSessionAdapter.js).

---

## 2. Root causes of the gameplay / product problems

| Problem | Cause in current code |
|--------|------------------------|
| Flat duel | **One bomb** + **no chain** caps zoning and comeback lines; board fills with passive shuffling. |
| Pacing / bombs feel punitive | **Same-turn fuse tick** on newly placed bombs shrinks real escape window ([162](migrations/online-v2/bomber-arena/162_ov2_bomber_arena_gameplay_rpcs.sql) ~325–333). |
| Stall risk | **`wait` always legal** with no sim cap → infinite passive play. |
| Weak Bomber identity | UI reads as **generic OV2 emerald board**; Snakes framing without **explosion / hazard / chain** language. |
| Readability | Zinc-on-zinc tiles; numeric fuse only; no **VS** or **threat** strip. |

---

## 3. Locked gameplay decisions (replaces prior “options”)

### 3.1 Max bombs per player — **FINAL: 2**

**Recommendation: move to `maxBombsPerPlayer = 2`.**

**Why not stay at 1:** On a 9×9 with two players, a single bomb is **too linear**: the whole round becomes “one threat object tracking.” Real Bomber PVP is **area denial + timing traps** (cross-fire, corner cuts, bait-and-chain). One bomb cannot hold two lanes or force a commit while threatening a second angle.

**What else must change with 2 bombs (non-negotiable):**

1. **`player_step` bomb limit** — already keyed off `maxBombsPerPlayer` by counting owner bombs in `board.bombs`; set factory default to **2**.
2. **Explosion resolution** — must process **all bombs with `fuse <= 0` in one tick**, then **chain**: any bomb whose cell is in `v_hit` from that wave must **arm to detonate in the same resolution pass** (see §3.2). Order must be **deterministic** (recommend: sort exploding bombs by `(y, x)` then repeat sweeps until no new bomb joins the set).
3. **Chain + double bomb** raises lethality — **compensate with fuse 6 + no same-turn decrement** (§3.3), **structured board** with real lanes (§7 table), **not** by shrinking radius on the baseline board.
4. **Snapshot / HUD** — show **bombs placed count** or infer from `board.bombs`; disable **Drop bomb** when at cap (server already rejects; client mirrors).

Keeping **1** would be “safer engineering” but **caps skill expression**; the product target (§6) assumes **multi-threat**.

### 3.2 Chain reaction — **FINAL: YES (core identity)**

**Decision: Chain reactions are in scope for the rebuild.** They are part of what players mean by “Bomber,” and with **max 2 bombs per seat** (≤4 bombs on field) the sim stays bounded.

**Why “not now” would be wrong for gameplay quality:** Without chain, two bombs are mostly **independent timers**; with chain, they become **geometry + sequencing** (the duel actually starts).

**Exact implementation constraints (authoritative SQL):**

1. **Single “explosion frame” per `player_step` after fuse decrement:** Build initial set `E0` = all bombs with `fuse <= 0`. Compute blast `H` from `E0` using existing ray rules (walls stop, breakables absorb hit and stop ray, **bombs on tile**: cell is in `H`; bomb is not “wall” for ray—treat as **traversable for blast** so a bomb can be **hit** by another bomb’s cross).
2. **Arm rule:** Any bomb whose `(x,y) ∈ H` and not already in `E0` → set `fuse := 0` (or add to detonation queue). Recompute `H` from expanded set; **iterate until fixed point** (max iterations = number of bombs on board, ≤4 in worst case for this ruleset—still cap at e.g. **16** in code as safety).
3. **Breakables / players:** Apply destruction and kills **once** after final `H` is stable (same as today’s post-processing order, but `H` is larger).
4. **Determinism:** No RNG. Fixed sort order for processing bombs.
5. **Same-turn newly placed bomb:** Still excluded from **fuse decrement** that turn (§3.3); if a **chain** would hit it same frame, **it detonates** (fuse 0) like any other bomb—allowed and intended for high-skill plays.

**QA focus:** T-shaped two-bomb chain; simultaneous zeros; breakable in between stopping one ray but not necessarily chain trigger on adjacent bomb cell.

### 3.3 Fuse — **FINAL: `fuseTicksDefault = 6` (single number)**

**Locked value: 6.**

**Why exactly 6 (not 5, not 7–8):**

- After **no same-turn decrement**, the first full opponent turn leaves the bomb at **6** until the **end-of-step** decrement on the **next** turns—players get a **clean first beat** to reposition after place.
- **Two bombs** + **chains** increase kill pressure; **6** is one full beat **longer** than the repo’s current `5` post-fix mental model, without returning to “chess clock” slowness of 8+.
- Interacts with **spawn pocket** (larger Manhattan bubble): opening is safer **without** lengthening midgame to boredom.
- Interacts with **wait policy** (§3.4): you cannot burn the clock with `wait`; fuse length is for **tactical** timing, not stall.

**Wide ranges removed:** Implement **only** `6` in `initial_board_json` and use `coalesce(..., 6)` fallback in `player_step`.

### 3.4 Wait policy — **FINAL: Emergency fallback only**

**Decision: Keep `wait` only when the player has zero legal orthogonal moves** (`legalMoveCount == 0`). Otherwise return `BAD_WAIT` / `BLOCKED` with a clear code.

**Why this is the best fit:**

- **Removing `wait` entirely** risks rare **true gridlock** (both players boxed by bombs + breakables topology) with no progress rule—would need another “forced suicide” rule anyway.
- **Strict cap without legality** still allows **stall-by-wait** when moves exist.
- **Emergency-only** matches “Bomber”: you pass when you are **actually trapped**; you cannot pass to avoid playing.

**Server implementation:** Before accepting `wait`, run a **bounded BFS/DFS** from current cell over walkable cells (floor, not wall/breakable/bomb/opponent tile as today). If any of four neighbors is legal move target, **reject `wait`**.

**Client:** `canWait` from snapshot; hide or heavily de-emphasize Pass button when false (or show disabled with tooltip only if product allows one short string—optional).

### 3.5 Anti-stall, sudden death, finish

- **`maxSimTicks`:** **200** (locked). At `sim_tick >= 200` with both alive → `phase = finished`, `is_draw = true` (existing settlement).
- **`suddenDeathStartTick`:** **140** (locked). For `sim_tick >= 140`, set `board.rulesPhase = 'sudden_death'` (string in `board` or top-level snapshot mirror).
- **Sudden death behavior (YES):** At **`sim_tick >= 140`**, set `board.rulesPhase = 'sudden_death'` and apply **`board.suddenDeathBombRadius = 2`** for explosion ray math only (grid size unchanged). No random ring removal in v1 (optional v1.1).

**Finish / draw (unchanged semantics):** elimination winner; simultaneous kill `is_draw`; timeout `is_draw`; forfeit path unchanged.

---

## 4. Final intended play feel

| Dimension | Target |
|-----------|--------|
| **Average match length (wall-clock)** | **3–7 minutes** for evenly matched players at casual pace; **sub-3** when both play aggressively (chains + low HP). |
| **Pacing** | **Fast opener** (readable lanes, two bombs online quickly), **midgame tension climb** from tick ~100, **forced climax** after tick 140 (radius 2), **hard stop** at 200. |
| **Pressure level** | **High** after sudden death; **moderate** before—players should fear **chain**, not confuse **fuse**. |
| **Readability** | **High**: in **<2 seconds** a player identifies walls vs crates vs floor; in **<10 seconds** (product ask below) they know where they are relative to opponent and where bombs tick. |
| **Behaviors encouraged** | Lane control, **cross-bomb timing**, baiting into **chain**, deliberate **breakable opens** for radius-2 phase. |
| **Behaviors prevented** | **Infinite wait stall**, **same-turn self-trap** (fuse fix), **passive corner hide** (sudden death + tick cap). |

---

## 5. Final recommended runtime / snapshot changes

Extend **`ov2_bomber_arena_build_client_snapshot`** ([161](migrations/online-v2/bomber-arena/161_ov2_bomber_arena_session_rpcs.sql)) with **locked names**:

| Field | Purpose |
|-------|--------|
| `maxSimTicks` | Always **200** (mirror `board` or constant). |
| `simTicksRemaining` | `200 - sim_tick` clamped ≥0 while playing. |
| `rulesPhase` | `'normal' \| 'sudden_death' \| 'finished'` (finished optional if redundant with `phase`). |
| `suddenDeathBombRadius` | **1** or **2** effective for UI hinting blast extent. |
| `canWait` | From server legality check. |
| `legalMoveCount` | 0–4; drives UI + education-free clarity. |
| `lastAction` | `{ seat, type, dx?, dy? }` last resolved step (for duel strip + optional client pulse). |
| `finishReason` | Enum string: `elimination` \| `double_ko` \| `time_limit` \| `forfeit` (forfeit may be client-inferred if hard on server—prefer server if leave RPC sets session state consistently). |

**`dangerCells`:** Optional **v1 client-only** preview from bombs + effective radius (max 4 bombs); server can omit.

**Board JSON:** embed `maxSimTicks`, `suddenDeathStartTick`, `suddenDeathBombRadius` (or override key), `fuseTicksDefault: 6`, `maxBombsPerPlayer: 2`.

---

## 6. PVP atmosphere — Bomber identity pass (concrete)

**Stop feeling generic / shared-shell**

- **Palette split:** Arena uses **amber/orange/slate danger** for bombs, fuse rings, and sudden-death warnings. **Do not** use the same emerald primary as the default action chrome for bombs—reserve emerald for **movement** or neutral chrome; make **Drop bomb** read as **hazard primary** (orange gradient + stronger border).
- **Frame copy:** Top strip is **`YOU  vs  <OpponentName>`** (from `members` + `seats`), not “seat N.” Subline: **`YOUR TURN` / `OPPONENT TURN`** in caps with color tied to seat **0/1** dog colors already used.
- **Board** — within [`Ov2BomberArenaScreen`](components/online-v2/bomber-arena/Ov2BomberArenaScreen.js):
  - **Indestructible wall:** dark cool stone, **sharp** edge (high contrast), no warm tint.
  - **Breakable:** **warm “crate”** panel (wood-ish gradient + single bolt highlight); readable at a glance vs floor.
  - **Floor:** neutral cool gray, **less** saturation than crates.
  - **Spawn pocket:** optional **subtle floor mark** (two-tile corner arc) so “why can I step here?” is obvious in first seconds.
- **Bombs:** **Thickening fuse ring** or **segmented countdown** (6 segments); at `fuse<=1` add **rapid pulse** (CSS). Numeric fuse stays but is **secondary** to ring.
- **Controls:** D-pad stays; **Drop bomb** is **larger touch target** than directional cells; when not your turn, **ghost** the whole pad (already partially there)—add **reduced opacity on bomb** specifically to signal “not your threat to place.”
- **Action feedback:** On `revision`/`simTick` change: **3–5 frame** `scale(1.02)` + **orange flash** on grid container when any explosion cleared ≥1 breakable or killed; **subtle pulse on opponent’s previous cell** from `lastAction` when they moved (duel tracking).
- **Finish flow** (still `Ov2SharedFinishModalFrame`): Headline strings **Bomber-native**: `Victory` / `Defeat` / `Draw` unchanged ok, but **subtitle** must be **`K.O.`** / **`Double K.O.`** / **`Time limit — draw`** / **`Forfeit`** mapped from `finishReason`. Stake lines stay; remove Snakes-only vibe by **not** using snake metaphors in subtitles. **Hide** dead rematch/start-next rows entirely.

**First 10 seconds — what the player should feel**

1. **0–2s:** “I see **crates vs stone**; I see **me vs a named opponent**.”
2. **2–6s:** “I have **two exits** and **two bombs** worth of threat—I can **push**.”
3. **6–10s:** “I understand **whose clock** this is (`YOUR TURN`) and **how much world time** is left (`simTicksRemaining`).”

---

## 7. Economy / settlement constraints (unchanged)

- Stake commit gate before `open_session` — **unchanged**.
- Settlement **line_kind** / idempotency patterns — **unchanged**.
- Draw split / full pot — **unchanged**.
- Room pointer clear on finish — **unchanged**.
- Timeout and double-KO must only use **`is_draw` / `winner_seat`** columns exactly as [163](migrations/online-v2/bomber-arena/163_ov2_bomber_arena_settlement.sql) expects.

**Chain / radius override / new bombs:** must not write settlement lines directly from `player_step`—only **`phase` flip** triggers money.

---

## 8. Exact file-by-file implementation order

1. **New migration:** `ov2_bomber_arena_initial_board_json` — topology + locked numerics (`maxBombsPerPlayer=2`, `fuseTicksDefault=6`, `maxSimTicks=200`, `suddenDeathStartTick=140`, `suddenDeathBombRadius` rules as §3.5).
2. **New migration:** `ov2_bomber_arena_player_step` — no same-turn decrement for bombs placed this step; **chain fixpoint**; **wait** emergency-only; **sim_tick** cap; **sudden death** radius override read from `board`; `lastAction` persisted on `board.meta` or session row if you add column (**prefer `board.meta` only** to avoid schema migration).
3. **New migration:** `ov2_bomber_arena_build_client_snapshot` — §5 fields + `finishReason` derivation inside SQL from `is_draw`, `winner_seat`, `sim_tick`, seat alive flags.
4. [166](migrations/online-v2/bomber-arena/166_ov2_bomber_arena_get_snapshot_after_room_clear.sql) — unchanged unless snapshot typing breaks RPC (unlikely).
5. [163](migrations/online-v2/bomber-arena/163_ov2_bomber_arena_settlement.sql) / [164](migrations/online-v2/bomber-arena/164_ov2_bomber_arena_room_clear_on_finish.sql) — **no change**.
6. [165](migrations/online-v2/bomber-arena/165_ov2_bomber_arena_quick_match_allowlist.sql) — **no change**.
7. [`ov2BomberArenaSessionAdapter.js`](lib/online-v2/bomber-arena/ov2BomberArenaSessionAdapter.js) — pass through new snapshot keys.
8. [`useOv2BomberArenaSession.js`](hooks/useOv2BomberArenaSession.js) — derive nothing critical client-side except optional danger preview.
9. [`Ov2BomberArenaScreen.js`](components/online-v2/bomber-arena/Ov2BomberArenaScreen.js) — §6 visuals + controls + finish subtitles.
10. [`Ov2BomberArenaLiveShell.js`](components/online-v2/bomber-arena/Ov2BomberArenaLiveShell.js) — pass `members` for opponent name if not already.

---

## 9. QA plan (acceptance)

- **Two bombs:** place two, verify cap rejects third; both tick; both can chain.
- **Chain:** bomb A hits bomb B same frame; B’s blast merges; breakables/players correct.
- **Wait:** legal moves exist → `wait` fails; boxed in → `wait` succeeds.
- **Fuse 6 + no same-turn decrement:** golden-sequence count across alternating turns.
- **Sudden death:** at tick 140 effective radius 2; blast reaches previously safe distance-2 tiles along line.
- **Hard stop 200:** draw settlement lines; vault claim; snapshot after room clear.
- **UI:** VS strip, crate/wall read, bomb orange identity, explosion flash, finishReason copy.
- **Mobile:** bomb button size; no scroll leak.
- **Regression:** idempotency, leave/forfeit, Realtime refetch.

---

## 10. Risks (remaining)

| Risk | Mitigation |
|------|------------|
| Chain fixpoint infinite loop | Hard cap iterations + SQL assertion in dev. |
| Radius-2 sudden death feels abrupt | Only fires at 140 with long HUD warning; tune copy, not numbers, first ship. |
| `legalMoveCount` perf | 9×9 only; trivial. |
| Mid-migration sessions without new `board` keys | `coalesce` in snapshot and step RPC. |

---

## 11. Final locked ruleset summary (implementation source of truth)

| Rule | Final value |
|------|----------------|
| Board size | **9×9** |
| Spawn pocket philosophy | **3-step Manhattan open bubble** from each spawn + symmetric under 180° rotation |
| Breakable philosophy | **Structured lanes + risk pockets**; not “fill all interior” |
| Bomb radius (normal) | **1** |
| Bomb radius (sudden death) | **2** from `sim_tick >= 140` (override for explosion math only) |
| Fuse | **`fuseTicksDefault = 6`** |
| Same-turn fuse decrement on newly placed bomb | **No** |
| Max bombs per player | **2** |
| Chain reaction | **Yes** (fixpoint deterministic sweeps) |
| Wait policy | **Emergency only** (`legalMoveCount == 0`) |
| Anti-stall method | **`sim_tick` cap** + sudden death pressure |
| Hard stop | **`maxSimTicks = 200`** → `is_draw` if both alive |
| Sudden death | **Yes** — radius override at tick **140** |
| Finish / draw logic | **Unchanged** — elimination / double KO / time limit all end via existing `winner_seat` + `is_draw` semantics |

---

*Planning only. No code, SQL execution, or patches in this revision.*
