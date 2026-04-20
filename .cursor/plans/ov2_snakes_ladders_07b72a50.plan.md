---
name: OV2 Snakes Ladders (FINAL APPROVAL ONLY)
overview: Final locked OV2 Snakes & Ladders specification. No implementation until the owner explicitly approves this document in writing. Zero reuse of legacy Snakes artifacts.
todos:
  - id: gate-no-work
    content: BLOCKED — No SQL, migrations, new files, patches, client/backend wiring, or QA until explicit written approval of this plan.
    status: completed
  - id: await-explicit-approval
    content: Owner must reply with explicit written approval of this entire plan before any implementation task may start.
    status: completed
isProject: false
---

# OV2 Snakes & Ladders — FINAL WRITTEN PLAN (APPROVAL ONLY)

## Authority and gates (non-negotiable)

- **This file is the only implementation spec.** Nothing may be built from memory, from other chats, or from legacy Snakes material until you **explicitly approve this plan in writing** (e.g. “Approved as written” or an equivalent clear go-ahead).
- **Until that approval:** no SQL, no migrations, no new files, no patches, no client wiring, no backend wiring, no QA execution, no “backend first meanwhile,” no “preparing files meanwhile.”
- **No reuse:** all paths listed under “Ignored legacy / failed material” are **DO NOT USE** — not as code, not as SQL patterns, not as naming reference, not as numbering reference.

**V1 — no double mechanic (economy and product):** V1 includes **no** double mechanic of any kind: **no** stake double, **no** doubling cube, **no** offer/accept/decline double, **no** raise of stake during the match, **no** dormant double RPCs, **no** double UI, and **no** double-related wording in this plan except the phrase **“double-click roll”** below, which means **duplicate RPC/submit protection (idempotency) only**, not a game or economy double.

**Locked summary (economy, verbatim):** V1 includes no double mechanic of any kind. Economy is fixed shared-room stake only, with multiplier 1, ON_HOST_START commit flow, and full-pot winner settlement through the normal OV2 vault path.

---

## 1. Ignored legacy Snakes material (DO NOT USE)

If any of these paths exist on a branch or disk, they are **failed historical material — IGNORE**:

- `migrations/online-v2/snakes-ladders/200_ov2_snakes_v2_schema.sql`
- `migrations/online-v2/snakes-ladders/201_ov2_snakes_v2_language_sql_helpers.sql`
- `migrations/online-v2/snakes-ladders/202_ov2_snakes_v2_session_rpcs.sql`
- `migrations/online-v2/snakes-ladders/203_ov2_snakes_v2_gameplay_rpcs.sql`
- `migrations/online-v2/snakes-ladders/204_ov2_snakes_v2_double_rule8.sql`
- `migrations/online-v2/snakes-ladders/205_ov2_snakes_v2_settlement.sql`
- `migrations/online-v2/snakes-ladders/206_ov2_snakes_v2_shared_room_integration.sql`
- `components/online-v2/snakes-ladders/Ov2SnakesLaddersLiveShellV2.js`
- `components/online-v2/snakes-ladders/Ov2SnakesLaddersScreenV2.js`
- `hooks/useOv2SnakesLaddersSessionV2.js`
- `lib/online-v2/snakes-ladders/ov2SnakesV2SessionAdapter.js`
- `lib/online-v2/snakes-ladders/ov2SnakesV2Settlement.js`
- `lib/online-v2/snakes-ladders/ov2SnakesV2TurnEnforcement.js`
- `scripts/gen-snakes-v2-204.mjs`

Verbatim paths above are for exclusion only; where a legacy filename contains the substring `double`, that is **not** a V1 Snakes feature and **not** referenced by this specification.

---

## 2. SQL migration numbering (final)

- **Repository rule:** leading digits of each `*.sql` basename under `migrations/online-v2/` (recursive).
- **Highest existing prefix in repo at plan time:** **149** (`149_ov2_settlement_two_phase_vault_delivery.sql`).
- **Locked Snakes primitives (sequential, no gaps):** **150 through 155** in folder **`migrations/online-v2/snakes-and-ladders/`**, ascending numeric order.
- **Shared integration (neutral path, applied after 155):** **`migrations/online-v2/156_ov2_shared_integrate_snakes.sql`** at repo root under `migrations/online-v2/` (not under `snakes-and-ladders/`). It replaces `ov2_shared_leave_room` and related shared policy/QM helpers only after all Snakes primitives exist.

---

## 3. Locked identifiers and routes

| Item | Locked value |
|------|----------------|
| **Product id** (`ov2_rooms.product_game_id`) | `ov2_snakes_and_ladders` |
| **Registry / economy constant key** | `SNAKES_AND_LADDERS` → `"ov2_snakes_and_ladders"` in [`lib/online-v2/ov2Economy.js`](lib/online-v2/ov2Economy.js) `ONLINE_V2_GAME_KINDS` and [`lib/online-v2/onlineV2GameRegistry.js`](lib/online-v2/onlineV2GameRegistry.js) |
| **Public route slug (Next page path)** | `/ov2-snakes-and-ladders` |
| **Next.js page file** | `pages/ov2-snakes-and-ladders.js` |
| **SQL folder** | `migrations/online-v2/snakes-and-ladders/` |
| **Client components folder** | `components/online-v2/snakes-and-ladders/` |
| **Lib folder** | `lib/online-v2/snakes-and-ladders/` |

**Hard constraint:** Bingo must not be modified (no edits under Bingo-only modules).

---

## 4. Locked SQL file names and roles

| File | Locked purpose |
|------|----------------|
| `migrations/online-v2/snakes-and-ladders/150_ov2_snakes_schema.sql` | Tables `public.ov2_snakes_sessions`, `public.ov2_snakes_seats`, `public.ov2_snakes_roll_idempotency`; constraints; RLS deny client writes; **enable** Supabase Realtime publication for `ov2_snakes_sessions` and `ov2_snakes_seats` for live UI refresh. |
| `migrations/online-v2/snakes-and-ladders/151_ov2_snakes_engine_helpers.sql` | Immutable SQL helpers: fixed V1 board map (Appendix A), single-step snake/ladder resolution, initial board JSON builder. |
| `migrations/online-v2/snakes-and-ladders/152_ov2_snakes_session_rpcs.sql` | `ov2_snakes_open_session`, `ov2_snakes_get_snapshot`; links session to `ov2_rooms.active_session_id` / `match_seq`; host-only open; member guard. |
| `migrations/online-v2/snakes-and-ladders/153_ov2_snakes_gameplay_rpcs.sql` | `ov2_snakes_roll` (authoritative die, move, snakes/ladders, extra turn on 6, triple-six rule, exact-finish overshoot handling, win detection, idempotency on roll); `ov2_snakes_finish_if_ready` (idempotent phase seal when win predicate already satisfied). |
| `migrations/online-v2/snakes-and-ladders/154_ov2_snakes_forfeit_and_timeouts.sql` | `ov2_snakes_leave_game` — in-match voluntary forfeit / elimination consistent with §8; **no** Snakes-specific missed-turn timer RPC in v1. |
| `migrations/online-v2/snakes-and-ladders/155_ov2_snakes_settlement.sql` | On match finish, insert one `ov2_settlement_lines` row per winner with `line_kind = ov2_snakes_win`, `amount = ov2_rooms.pot_locked` (read under row lock), and **idempotency_key** uniquely derived from `(room_id, match_seq, recipient_participant_key, 'ov2_snakes_win')`; `ov2_snakes_claim_settlement` marks delivery using the same two-phase vault rules as other non–`rummy51_%` OV2 products. |
| `migrations/online-v2/156_ov2_shared_integrate_snakes.sql` | Extend `ov2_shared_resolve_economy_entry_policy`, `ov2_qm_allowed_product`, `ov2_qm_max_players_for_product`, and `ov2_shared_leave_room` for `ov2_snakes_and_ladders`; add `IN_GAME` active-match branch so leave-with-forfeit invokes `ov2_snakes_leave_game` for the leaving `participant_key` when the room’s `active_session_id` references a live `ov2_snakes_sessions` row in `playing` phase. **Neutral root path** — not under `snakes-and-ladders/`. |

---

## 5. Locked database object names

### Tables (all `public.`)

| Table | Locked purpose |
|-------|----------------|
| `ov2_snakes_sessions` | One row per match; `room_id`, `match_seq`, `phase` (`playing` \| `finished`), `status` (`live` \| `closed`), `revision`, `board` jsonb (positions, turn, last die, consecutive-six chain state, winner), `winner_seat`, timestamps. |
| `ov2_snakes_seats` | `(session_id, seat_index)` unique; `participant_key`; nullable `room_member_id` → `ov2_room_members.id`. |
| `ov2_snakes_roll_idempotency` | Primary key `(session_id, idempotency_key)`; prevents **duplicate** `ov2_snakes_roll` RPC submits (same logical roll). |

### RPCs (all `public.`; signatures implementation-complete in SQL migrations)

| RPC | Locked responsibility |
|-----|------------------------|
| `ov2_snakes_open_session(p_room_id uuid, p_participant_key text, p_expected_room_match_seq integer)` | Host opens session when room is `IN_GAME`, seated count in **2–4**, all seated wallets `committed`; creates session + seats; sets `ov2_rooms.active_session_id`. |
| `ov2_snakes_get_snapshot(p_room_id uuid, p_participant_key text)` | Authoritative JSON for UI + reconnect. |
| `ov2_snakes_roll(p_room_id uuid, p_participant_key text, p_idempotency_key bigint, p_expected_revision bigint default null)` | Only current turn seat; server random 1–6; applies full turn logic in one transaction per §8; idempotent replay returns same outcome snapshot. |
| `ov2_snakes_leave_game(p_room_id uuid, p_participant_key text)` | Forfeit / eliminate leaver mid-match per §8; updates session; when **at most one** active seat remains, ends the match and sets the winner per §8. |
| `ov2_snakes_finish_if_ready(p_room_id uuid)` | Idempotent: if internal win predicate satisfied and phase still `playing`, set `finished` and seal result for settlement path; else structured no-op / not-finished response. |
| `ov2_snakes_claim_settlement(p_room_id uuid, p_participant_key text)` | Claim undelivered `ov2_snakes_win` lines for caller; vault apply pattern **identical discipline** to other non–`rummy51_%` OV2 products (two-phase delivery already defined repo-wide). |

### Settlement

| Item | Locked value |
|------|----------------|
| **`ov2_settlement_lines.line_kind` (winner credit)** | `ov2_snakes_win` |
| **Winner amount** | **`ov2_rooms.pot_locked`** at finish time (full pot to winner). No client-side recomputation. |

---

## 6. Locked client file names

| Path | Role |
|------|------|
| `components/online-v2/snakes-and-ladders/Ov2SnakesLiveShell.js` | Shared-room handoff target: `?room=` load, ledger fetch, host `open_session`, leave+forfeit, route guard for product id `ov2_snakes_and_ladders`. |
| `components/online-v2/snakes-and-ladders/Ov2SnakesScreen.js` | Board, seats, turn, last roll, roll control, messages; **server snapshot only** (no optimistic gameplay state). |
| `hooks/useOv2SnakesSession.js` | Subscriptions + RPC calls + settlement claim orchestration. |
| `lib/online-v2/snakes-and-ladders/ov2SnakesSessionApi.js` | Thin Supabase RPC wrappers for §5 RPCs. |
| `lib/online-v2/snakes-and-ladders/ov2SnakesSettlement.js` | Claim helper only; no prize math on client. |

### Minimal wiring in existing non-Bingo files (filenames fixed)

- [`lib/online-v2/ov2Economy.js`](lib/online-v2/ov2Economy.js) — add kind `SNAKES_AND_LADDERS`; **no** entry in the `ov2_shared_max_round_liability_mult` **16×** product list — Snakes stays on the SQL **`ELSE 1`** branch (**per-seat liability multiplier 1 only**; not the ping-pong **16×** liability escalation used by other OV2 1v1 products).
- [`lib/online-v2/onlineV2GameRegistry.js`](lib/online-v2/onlineV2GameRegistry.js) — active shared product, lobby entry, `routePath: "/ov2-snakes-and-ladders"`, `minPlayers: 2`, `getOv2DefaultMaxPlayersForProduct` value **4** for `ov2_snakes_and_ladders`.
- [`components/online-v2/shared-rooms/Ov2SharedRoomScreen.js`](components/online-v2/shared-rooms/Ov2SharedRoomScreen.js) — host start stake prep gate, `open_session`, `IN_GAME` route to `/ov2-snakes-and-ladders?room=…`, Quick Match host-driver parity.
- [`components/online-v2/OnlineV2RoomsScreen.js`](components/online-v2/OnlineV2RoomsScreen.js) — resume allowlist includes `ov2_snakes_and_ladders`.
- [`lib/online-v2/room-api/ov2QuickMatchApi.js`](lib/online-v2/room-api/ov2QuickMatchApi.js) — **zero** edits in v1; Quick Match allowlisting is entirely SQL in `156_ov2_shared_integrate_snakes.sql`.

---

## 7. Locked product rules (gameplay and UX)

| Topic | Locked rule |
|-------|-------------|
| **Players** | **2–4** seated participants per match. |
| **Board** | Cells **1–100**. **Start:** every pawn begins on cell **`1`**. Each roll adds integer **`d ∈ [1,6]`** to the current cell, then applies Appendix A edges once, then applies exact-finish overshoot and triple-six rules. |
| **Die** | One die per roll: **uniform 1–6** server-side. |
| **Exact finish** | Must land **exactly on 100** to win; if `position + roll > 100`, **no move** for that roll (bounce / no progress), then **end of that roll’s turn** (no extra turn for 6 in that case). |
| **Six grants extra roll** | If a roll of **6** is taken and the piece **moves legally** (including exact-finish case where 6 wins), the **same player** rolls again **unless** the triple-six chain rule below voids the chain. |
| **Triple six** | Track **consecutive sixes within the current player’s bonus chain**. On the **third consecutive `6` in that chain**: **that roll applies zero displacement** (pawn cell unchanged), **no further bonus rolls** from that `6`, then **next player’s turn**. After any roll **≠ 6**, reset the consecutive-six counter to **0**. |
| **Snakes / ladders** | Apply **Appendix A** once per roll after linear advance (slide down / climb up). |
| **Map source of truth** | **Appendix A** encoded in **`151_ov2_snakes_engine_helpers.sql`** (immutable SQL); not client-editable. |
| **Reconnect** | Client always rehydrates from **`ov2_snakes_get_snapshot`** + room ledger; **no optimistic state**. |
| **Double-click roll** (idempotency only) | Same roll action invoked twice quickly (e.g. double-tap): **`ov2_snakes_roll_idempotency`** returns the **same** authoritative snapshot; **not** a stake double, cube, or any in-match raise. |

---

## 8. Locked economy, leave, Quick Match, hidden rooms

| Topic | Locked rule |
|-------|-------------|
| **Economy entry policy** | **`ON_HOST_START`** — same class as Rummy shared rooms: stake commit before/at participation per existing `ov2_stake_commit` / shared lifecycle. |
| **Pot semantics** | **Winner receives full `pot_locked`** via one **`ov2_snakes_win`** settlement line for the winner’s `participant_key`; amount equals **`pot_locked`** at finish; losers’ committed stakes are already represented by existing room economics (forfeit / loss) consistent with other full-pot OV2 games. **No client-side pot math.** |
| **Mid-match leave / forfeit** | Leaving during **active** Snakes match requires **`ov2_shared_leave_room` with forfeit** as today’s shared pattern; integration calls **`ov2_snakes_leave_game`** so the leaver is eliminated and **forfeits** per seat rules; remaining players continue; **last remaining player wins `pot_locked`**. |
| **Disconnect / crash** | Treated as **forfeit path through shared room mechanics** (same economic outcome as leave-forfeit); **no** new Snakes-only disconnect daemon in v1. |
| **Quick Match** | **Required:** `ov2_snakes_and_ladders` is in **`ov2_qm_allowed_product`** and **`ov2_qm_max_players_for_product` → 4**; QM host-driver **`open_session`** + route to **`/ov2-snakes-and-ladders`** after `IN_GAME`, same structural pattern as other shared-table OV2 games (e.g. Goal Duel). |
| **Hidden / code / password** | **Inherit-only:** no Snakes-specific listing or join RPCs; public directory behavior unchanged; hidden rooms not in public list; join-by-code and password flows use **existing** shared room / ledger RPCs and UI. |

---

## 9. AFK / timer (final)

- **No** Snakes-specific turn deadline, **no** `mark_missed_turn` RPC, **no** cron-based Snakes AFK in v1.
- Any countdown shown in the UI is **display-only**; **authority never auto-forfeits on elapsed time alone** in v1.

---

## 10. Implementation order (after written approval of this document only)

1. Apply SQL **`150` → `155`** under `snakes-and-ladders/`, then **`156_ov2_shared_integrate_snakes.sql`** at `migrations/online-v2/` root (shared integration last).
2. Report exact SQL files touched and one-line confirmation each matches §4.
3. Implement **`lib/online-v2/snakes-and-ladders/`** then **`hooks/useOv2SnakesSession.js`** then **`Ov2SnakesScreen.js`** then **`Ov2SnakesLiveShell.js`** then **`pages/ov2-snakes-and-ladders.js`**.
4. Minimal registry + shared-room + QM wiring per §6.
5. Manual QA: shared create/join, hidden join-by-code, password fail/success, QM match, 2/3/4 players, ladder, snake, exact finish, six chain + triple-six, leave-forfeit, pot to winner, reconnect, **double-click roll** duplicate-submit idempotency (not a game/economy double).

---

## Appendix A — Locked V1 ladder and snake teleports (1–100)

**Ladders (from → to):**  
2→15, 7→28, 22→41, 28→55, 41→63, 50→69, 57→76, 65→82, 68→90, 71→91  

**Snakes (from → to):**  
16→6, 49→12, 62→19, 74→35, 89→52, 94→71, 99→80  

---

## Your approval block (copy and fill)

**Approval:** [ ] Approved as written / [ ] Approved with amendments (paste amendments below)

**Amendments:**

**Signed (name/handle) + date:**

