---
name: Orbit Trap OV2
overview: Integrate Orbit Trap as a new shared-room OV2 product by cloning the proven Snakes & Ladders (2–4) client shell and server-authoritative session boundary, adding a pure deterministic engine module for rules, and deferring Quick Match until policy/SQL parity is verified.
todos:
  - id: audit-parity
    content: Mirror Snakes shared-room integration checklist (registry, Ov2SharedRoomScreen branches, LiveShell, session API, settlement) for ov2_orbit_trap
    status: pending
  - id: engine-first
    content: Implement ov2OrbitTrapBoardSpec + ov2OrbitTrapEngine with tests before deep UI animation work
    status: pending
  - id: backend-rpc-set
    content: Design Postgres session table + RPC names + realtime channel; align with ov2_shared economy policy SQL (later migration phase)
    status: pending
  - id: ui-shell
    content: Build Ov2OrbitTrapScreen layout (HUD + board + tray) under OnlineV2GamePageShell with useAppViewportHeight if needed to kill page scroll
    status: pending
isProject: false
---

# Orbit Trap — OV2 integration plan (audit-based)

## 1. Best architectural reference in current OV2

**Primary reference: [Snakes & Ladders (shared product)](components/online-v2/snakes-and-ladders/Ov2SnakesLiveShell.js) + [`ov2_snakes_and_ladders`](lib/online-v2/snakes-and-ladders/ov2SnakesSessionApi.js)**

- **Why this is the best fit (not Ludo / UNO):** Same **shared-room** lifecycle (`ov2_rooms` + members), **2–4 seats**, **discrete turn actions**, **authoritative JSON snapshot** with `sessionId` + `revision`, **Realtime** on a dedicated session table, **host-driven `open_session`** with `expectedRoomMatchSeq` (see [`Ov2SharedRoomScreen.js`](components/online-v2/shared-rooms/Ov2SharedRoomScreen.js) branches around `requestOv2SnakesOpenSession`), and a **game screen** composable inside [`OnlineV2GamePageShell`](components/online-v2/OnlineV2GamePageShell.js) without redesigning global lobby/shell patterns.
- **Supporting patterns to reuse verbatim:** [`ov2PreferNewerSnapshot`](lib/online-v2/ov2PreferNewerSnapshot.js) for out-of-order fetch/realtime; [`fetchOv2RoomLedgerForViewer`](lib/online-v2/ov2RoomsApi.js) + fatal redirect hook pattern in live shells; settlement bridge pattern from [`useOv2SnakesSession`](hooks/useOv2SnakesSession.js) + [`ov2SnakesSettlement.js`](lib/online-v2/snakes-and-ladders/ov2SnakesSettlement.js).
- **Secondary reference (narrow slices only):** **Checkers/Chess** [`chromePreset="ov2_board"`](components/online-v2/OnlineV2GamePageShell.js) if you want a thinner HUD row for the “board hero” layout — optional cosmetic alignment, not a dependency.

---

## 2. Recommended MVP launch shape

**Register as:** a new `product_game_id` string in [`ONLINE_V2_GAME_KINDS`](lib/online-v2/ov2Economy.js) (convention: `ov2_orbit_trap`), mirrored in [`ONLINE_V2_REGISTRY`](lib/online-v2/onlineV2GameRegistry.js) and included in [`ONLINE_V2_ACTIVE_SHARED_PRODUCT_IDS`](lib/online-v2/onlineV2GameRegistry.js) so it appears in [`ONLINE_V2_SHARED_LOBBY_GAMES`](lib/online-v2/onlineV2GameRegistry.js) (used by [`OnlineV2RoomsScreen`](components/online-v2/OnlineV2RoomsScreen.js)).

**Launch channel (safest MVP):** **Shared rooms only (create / join-by-code / directory)** — same as other table games. **Defer Quick Match** until: (a) backend RPCs exist and are stable, (b) economy entry policy is mirrored in SQL (`ov2_shared_resolve_economy_entry_policy` family — identified later, not authored here), and (c) you add the parallel branches in [`Ov2SharedRoomScreen.js`](components/online-v2/shared-rooms/Ov2SharedRoomScreen.js) that today exist for Snakes QM host-side session open (effect block ~594–607). Quick Match stake presets are generic ([`ov2QuickMatchStakes.js`](lib/online-v2/shared-rooms/ov2QuickMatchStakes.js)); **product eligibility** is what you would extend carefully.

**First playable mode:** **Private / manual stake, 2–4 humans, full rules on server, UI = HUD + board + tray** — smallest risk surface; no bots, no ranked.

---

## 3. Exact files likely to create

| Area | Likely new files |
|------|------------------|
| **Page** | [`pages/ov2-orbit-trap.js`](pages/ov2-orbit-trap.js) — thin re-export of live shell (mirror [`pages/ov2-snakes-and-ladders.js`](pages/ov2-snakes-and-ladders.js)). |
| **Live shell** | [`components/online-v2/orbit-trap/Ov2OrbitTrapLiveShell.js`](components/online-v2/orbit-trap/Ov2OrbitTrapLiveShell.js) — room gate, ledger load, Realtime on `ov2_rooms` / `ov2_room_members`, `requestOv2OrbitTrapOpenSession`, fatal redirect, leave/forfeit parity with Snakes shell. |
| **Game screen** | [`components/online-v2/orbit-trap/Ov2OrbitTrapScreen.js`](components/online-v2/orbit-trap/Ov2OrbitTrapScreen.js) — HUD strip + centered board + bottom tray; non-active “waiting” state; optional finish modal frame reuse ([`Ov2SharedFinishModalFrame`](components/online-v2/Ov2SharedFinishModalFrame.js)). |
| **Hook** | [`hooks/useOv2OrbitTrapSession.js`](hooks/useOv2OrbitTrapSession.js) — snapshot state, RPC busy flags, `revision` dedupe for animations, settlement claim orchestration (Snakes-shaped). |
| **API / session bridge** | [`lib/online-v2/orbit-trap/ov2OrbitTrapSessionApi.js`](lib/online-v2/orbit-trap/ov2OrbitTrapSessionApi.js) — `fetch*Snapshot`, `subscribe*Snapshot` (postgres_changes on new session table), `requestOpenSession`, `requestApplyMove`, `requestApplyRotate`, `requestApplyLock` (exact RPC split TBD with backend naming). |
| **Settlement** | [`lib/online-v2/orbit-trap/ov2OrbitTrapSettlement.js`](lib/online-v2/orbit-trap/ov2OrbitTrapSettlement.js) — mirror Snakes: claim RPC + vault delivery helper usage. |
| **Constants / topology** | [`lib/online-v2/orbit-trap/ov2OrbitTrapBoardSpec.js`](lib/online-v2/orbit-trap/ov2OrbitTrapBoardSpec.js) — ring sizes (8/8/8), static gates, trap/boost/lock coordinates, start positions, initial orb anchors, **label → index** maps. |
| **Engine (pure)** | [`lib/online-v2/orbit-trap/ov2OrbitTrapEngine.js`](lib/online-v2/orbit-trap/ov2OrbitTrapEngine.js) — deterministic: legal moves/rotations/locks, apply action → next state + events log (for tests + optional client preview). Server should either call the same logic (ideal) or duplicate minimally (acceptable short-term risk — see section 6). |
| **Client legality (optional)** | [`lib/online-v2/orbit-trap/ov2OrbitTrapClientLegality.js`](lib/online-v2/orbit-trap/ov2OrbitTrapClientLegality.js) — thin wrappers over engine for highlight sets only (must never be trusted for authority). |
| **Presentation** | [`components/online-v2/orbit-trap/Ov2OrbitTrapBoardView.js`](components/online-v2/orbit-trap/Ov2OrbitTrapBoardView.js) (SVG or layered divs) + small presentational files if needed (`Ov2OrbitTrapHudStrip.js`, `Ov2OrbitTrapActionTray.js`) — keep screen file thin. |

---

## 4. Exact files likely to modify

| Area | Likely modifications |
|------|----------------------|
| **Registration / economy id** | [`lib/online-v2/ov2Economy.js`](lib/online-v2/ov2Economy.js) — add `ORBIT_TRAP: "ov2_orbit_trap"` to `ONLINE_V2_GAME_KINDS`. |
| **Registry / lobby eligibility** | [`lib/online-v2/onlineV2GameRegistry.js`](lib/online-v2/onlineV2GameRegistry.js) — `ONLINE_V2_REGISTRY` entry (`routePath: "/ov2-orbit-trap"`, `minPlayers: 2`, stake defaults aligned with peers); append id to `ONLINE_V2_ACTIVE_SHARED_PRODUCT_IDS`; optionally [`getOv2DefaultMaxPlayersForProduct`](lib/online-v2/onlineV2GameRegistry.js) → **4** for Orbit Trap (2–4 players). |
| **Room / lobby integration** | [`components/online-v2/shared-rooms/Ov2SharedRoomScreen.js`](components/online-v2/shared-rooms/Ov2SharedRoomScreen.js) — add `isOrbitTrapRoom`, duplicate **host start → open session → router.push** and **QM host driver** and **auto-route when `IN_GAME`** patterns beside Snakes (~594–607, ~1160–1177, and the auto-route section near ~1665+ per grep hits). |
| **Economy entry policy mirror** | [`lib/online-v2/room-core/roomEconomyEntryPolicy.js`](lib/online-v2/room-core/roomEconomyEntryPolicy.js) — add `ov2_orbit_trap` to the `ON_HOST_START` group (Snakes legacy ids are listed; **also verify** `ov2_snakes_and_ladders` parity in SQL separately — client mirror must stay consistent with deployed `ov2_shared_resolve_economy_entry_policy`). |
| **Optional lobby chrome** | [`components/online-v2/shared-rooms/Ov2SharedLobbyScreen.js`](components/online-v2/shared-rooms/Ov2SharedLobbyScreen.js) — emoji map entry only if you keep that pattern for new tiles. |
| **Quick Match (phase 2+)** | [`lib/online-v2/room-api/ov2QuickMatchApi.js`](lib/online-v2/room-api/ov2QuickMatchApi.js) — only if you enable QM routing/remap rules for this product (Snakes has special remap from legacy id). |

**Explicitly out of scope for file churn:** Bingo paths, Board Path bundle coordinator, C21/CC/CW live-table systems, global [`Layout`](components/Layout) or shared shell redesign.

---

## 5. Proposed authoritative state model (MVP JSON)

Authoritative document stored in session row (Postgres `jsonb`) or normalized columns + jsonb snapshot — **shape** should match what RPC `get_snapshot` returns (Snakes pattern).

```ts
// Conceptual schema (names illustrative; keep stable once shipped)
type RingId = "outer" | "mid" | "inner";
type SlotIndex = 0..7; // per ring, logical index before rotation
type CoreState = {
  sessionId: string;
  roomId: string;
  matchSeq: number;
  revision: number;
  phase: "lobby" | "playing" | "finished"; // or map to existing OV2 phase strings used elsewhere
  status: string; // align with Snakes session status vocabulary if reused
  activeSeats: number[]; // seated player indices 0..3 actually in match
  turnSeat: number | null;
  winnerSeat: number | null;
  // timers (server clocks)
  turnDeadlineMs: number | null; // epoch ms or server-computed deadline
  // board
  rings: {
    outer: { offset: number }; // 0..7 rotation steps CW from spec home
    mid: { offset: number };
    inner: { offset: number };
  };
  // player-derived (per seat 0..3)
  players: Array<{
    seat: number;
    ring: RingId | "core";
    slot: SlotIndex | 0; // core: slot 0 only when occupied
    orbsHeld: 0 | 1 | 2;
    lockToken: 0 | 1;
    stunnedNextTurn: boolean;
    trapSlowNextTurn: boolean; // “move 1 only” from trap
    boostStepsNextTurn: number | null; // 3 or 2 when heavy; null if none
    ringLockUntilSeatTurn: RingId | null; // ring frozen until this seat’s next turn start
  }>;
  // orb sources
  fixedOrbRemaining: Partial<Record<`${RingId}:${SlotIndex}`, boolean>>; // which preset board orbs not yet collected
  looseOrbs: Array<{ ring: RingId; slot: SlotIndex }>; // rotates with ring offset math
  // optional: last event summary for UI animations
  lastAction: null | { type: "move"|"rotate"|"lock"; bySeat: number; payload: unknown };
};
```

**Derived flags (either stored or computed server-side each snapshot):** `heavyCarrier` (= `orbsHeld === 2`), `canRotate`, `allowedMoveSteps`, `lockedRings` for UI.

**Identity / anti-cheat:** Always include `revision` (monotonic) like Snakes; consider `matchSeq` from room for open_session idempotency.

---

## 6. Turn / action validation model

**Single pipeline per RPC (recommended):** `validate actor → validate phase/turn → validate preconditions → apply → post-effects → win check → advance turn → bump revision → return snapshot`.

| Action | Preconditions | Apply | Order notes |
|--------|-----------------|-------|----------------|
| **Move** | Active seat; not stunned in a way that forbids (stunned still moves, 1 step); compute allowed step budget (base 2; heavy→1 unless boost; trap slow→1; boost next turn→3/2); path legality along ring edges + gates costing 1 step each; cannot end illegally | Update `ring/slot`; on finish cell: resolve **Bump** before orb pickup; then **collect** fixed or loose orb if capacity; then **Trap** (drop + set trap flag); then **Boost** set; then **Lock slot** grants token; **Core win** only if preconditions met | Bump: defender push 1 along ring direction if legal; else stun; orb drop max 1 at defender’s pre-push cell; attacker immediate pickup only if spec rule satisfied |
| **Rotate** | Not heavy; not stunned; target ring not under active lock | `rings[r].offset = (offset ± 1) % 8`; move all entities whose **canonical** position is on that ring | No tile effects, no collections, no bump |
| **Lock** | Holds lock token; not stunned? (spec says spend action — clarify stunned); ring not already frozen by self until next turn | Consume token; set `ringLockUntilSeatTurn` | Lock clears at **start** of that player’s next turn |

**Client:** sends intended action; **Server:** sole authority; client uses [`ov2PreferNewerSnapshot`](lib/online-v2/ov2PreferNewerSnapshot.js) and animates from `revision` diffs.

**Engine module role:** Implement the table above as pure functions + exhaustive tests; Postgres RPC should call duplicated logic or shared SQL functions in a later hardening phase (plan acknowledges duplication risk).

---

## 7. Backend / SQL recommendation (if any)

**Yes — required for multiplayer parity with OV2 risk bar**, following Snakes:

- **New session storage:** e.g. `ov2_orbit_trap_sessions` (row per `room_id` / `session_id`, `revision`, `state jsonb`, timestamps).
- **RPCs (minimum set):** `ov2_orbit_trap_open_session`, `ov2_orbit_trap_get_snapshot`, `ov2_orbit_trap_apply_move`, `ov2_orbit_trap_apply_rotate`, `ov2_orbit_trap_apply_lock` (or one `apply_action` with discriminated payload), optional `ov2_orbit_trap_forfeit` if not covered by generic room leave.
- **Realtime:** `postgres_changes` subscription filter on session table by `room_id` (Snakes: [`ov2SnakesSessionApi.js`](lib/online-v2/snakes-and-ladders/ov2SnakesSessionApi.js) pattern).
- **Settlement:** `ov2_orbit_trap_claim_settlement` + reuse [`applyOv2SettlementClaimLinesToVaultAndConfirm`](lib/online-v2/ov2SettlementVaultDelivery.js) pattern from Snakes hook.
- **Policy SQL (later):** extend `ov2_shared_resolve_economy_entry_policy` (or equivalent in your migrations tree) to recognize `ov2_orbit_trap` with **`ON_HOST_START`** debit timing to match [`roomEconomyEntryPolicy.js`](lib/online-v2/room-core/roomEconomyEntryPolicy.js).

**No migrations authored or run in this plan phase** — only identification.

---

## 8. Risks and edge cases

- **Ring rotation UI:** drag-to-snap must map to exactly one server step; gesture conflicts with scroll — mitigate with `touch-action` and capturing drags on ring hit targets only; keep tray as fallback “nudge left/right” only if drag fails accessibility.
- **Path clarity on mobile:** multi-ring + gates; mitigate with **only legal endpoints highlighted** + short path preview polyline after first tap.
- **Authoritative sync:** duplicate late RPC responses → already mitigated by `revision` + [`ov2PreferNewerSnapshot`](lib/online-v2/ov2PreferNewerSnapshot.js).
- **Dropped orb + occupant + fixed orb on same cell:** needs deterministic precedence (pickup priority, simultaneous presence) — **must be nailed in open questions**.
- **Bump push direction ambiguity:** “pushed 1 step” when both directions legal — **open question** (pick rule: attacker’s approach direction, clockwise preference, or “away from attacker”).
- **Lock timing vs rotation queue:** ensure lock is evaluated on server before accepting rotate from others; display frozen ring clearly.
- **Animation vs truth drift:** drive motion from optimistic local preview only after RPC `ok`; otherwise animate from snapshot diff keyed by `revision`.
- **Reconnect:** refetch snapshot; if mid-animation, discard local overlay when `revision` jumps.
- **Economy client mirror mismatch:** if SQL policy lags JS list, stake debit timing bugs — treat as deployment coupling risk.

---

## 9. Phased implementation plan

| Phase | Goal | Deliverable | Acceptance criteria |
|-------|------|-------------|------------------------|
| **0 — Audit** | Confirm integration seams | Written map of Snakes flows you will mirror | Checklist: registry, shared room branches, page route, session API surface, settlement |
| **1 — Local single-screen prototype** | UX skeleton without backend | `Ov2OrbitTrapScreen` with mock state: HUD + static board + tray; `h-dvh` layout, no page scroll | Mobile viewport: board fills hero zone; tray never overlaps unreadable content; inactive mode hides actions |
| **2 — Deterministic engine** | Rule-complete single process | `ov2OrbitTrapEngine.js` + unit tests (Jest or existing runner) | Given any legal sequence, state transitions match locked MVP spec; property tests for “rotate moves all ring contents” |
| **3 — OV2 room integration (client-only wiring)** | Navigate from real room | Live shell loads ledger, validates `product_game_id`, calls stub RPCs or feature-flagged backend | Wrong room id shows controlled error; correct room reaches screen; leave/forfeit path works like Snakes |
| **4 — Authoritative sync / multiplayer** | Ship playable online | Postgres RPC + session table + realtime + wire hook | Two clients see identical snapshots; illegal actions rejected with stable error codes; turn timer enforced server-side |
| **5 — Visual polish / onboarding** | Premium feel | Motion for move path, rotate snap, bump/orb FX within performance budget | 60fps-ish on mid Android; no mandatory full-page scroll; Info panel documents win condition |

---

## 10. First implementation order (min rework)

1. **Product id + registry + economy policy list** (enables room creation in dev DB once SQL exists).
2. **Board spec constants** (single source for client board + later server seed).
3. **Pure engine + tests** (rules locked before UI animation debt).
4. **Page + LiveShell skeleton** (routing, ledger gate, no actions).
5. **Session API module** (interfaces match future RPC names).
6. **Hook + screen wiring** to real snapshots (even stubbed local until RPC ready).
7. **BoardView + interaction flows** (move highlight → rotate drag → lock).
8. **Backend RPC + table** (parallel track once engine frozen).
9. **`Ov2SharedRoomScreen` integration** (host open + in-game auto-route + optional QM).
10. **Settlement + vault claim** (copy Snakes sequence).
11. **Polish + timer tuning**.

---

## 11. Minimal unresolved questions

1. **Bump displacement direction:** When both clockwise and counter-clockwise pushes are legal, which direction is canonical?
2. **Cell stacking:** Can a **Loose Orb** coexist on a slot with a **fixed uncollected Orb** or another player? If yes, what is the pickup/drop precedence order?
3. **Stunned + Lock token:** Can a stunned player still spend a **Lock** action, or only Move?
4. **Trap vs Boost stacking:** If multiple modifiers apply next turn, what is the **single** resolution order (e.g., trap “move 1” vs boost “move 3”)?
5. **Core entry edge case:** If a player meets orb count + starts on inner ring but **enters Core via an illegal intermediate path** in the same move, is the win rejected mid-path (server must validate full path, not endpoint-only)?
