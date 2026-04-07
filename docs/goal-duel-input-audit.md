# Goal Duel — Phase 1–2 Audit Findings (Dev-only)

This document is the **Phase 1 + Phase 2** deliverable.
It must be updated **only** after reproducing issues using the debug overlay + logs (enabled via `localStorage.ov2_gd_debug=1`).

## Debug enablement (dev only)

- **Flag**: `localStorage.setItem("ov2_gd_debug","1")`
- **Disable**: `localStorage.removeItem("ov2_gd_debug")`
- **Isolate mode (optional, debug only)**: `localStorage.setItem("ov2_gd_mode", "<mode>")`
  - supported: `authOnly`, `unmirror` (seat-1 snapshot unmirrored locally for diagnostics)
  - clear: `localStorage.removeItem("ov2_gd_mode")`

## What the instrumentation shows

- **Screen intent**: `inputRef.current.{l,r,j,k}` (+ `jTap/kTap`)
- **World/send intent**: last computed send payload in the step tick (`gdDebug.lastSend`)
- **Snapshot timing**: `gdDebug.lastSnapshotReceiveMs`
- **Send timing**: `gdDebug.lastStepSendMs`
- **Auth vs Presentation delta**: `dx/dy/dist` for local player
- **Auth + Presentation positions**: p0/p1/ball

## Repro matrix (Phase 2)

For each scenario below, capture:
- a screenshot with overlay visible
- the relevant console logs: `[ov2/gd][send]` and `[ov2/gd][recv]`

### Modes

- **Baseline**: `ov2_gd_mode` unset (presentation on)
- **Auth-only**: `ov2_gd_mode=authOnly`
- **Unmirror diag** (seat 1 only): `ov2_gd_mode=unmirror`

### Inputs

- hold left / hold right
- left+jump, right+jump
- left+kick, right+kick
- multi-touch: hold move while tapping jump/kick
- short taps (<50ms) for jump and kick

## Findings (fill after evidence)

### Root cause (single sentence)

TBD (requires reproducing the bug with overlay+logs; do not guess)

### Evidence (must be concrete)

- **Repro steps**: TBD
- **Overlay evidence**: TBD (include key lines)
- **Log evidence**: TBD (include sample `[send]` and `[recv]`)

> Note: In this environment I cannot capture interactive browser screenshots automatically.
> Evidence must be captured by running the dev server and reproducing in a real browser with `ov2_gd_debug=1`,
> then pasting overlay screenshots + console excerpts here.

### Exact file/line references

Fill with the exact line ranges once confirmed. Minimum required references:

1. **Server snapshot mirroring (seat 1)**
   - `migrations/online-v2/goal-duel/139_ov2_goal_duel_rpcs.sql`:
     - `ov2_gd_mirror_public_state`: lines **6–41** (mirrors `x`, negates `vx`, flips `face`)
     - `ov2_goal_duel_build_client_snapshot`: lines **43–73** (seat 1 gets `v_me := ov2_gd_mirror_public_state(v_pub)`)

2. **Client input capture + multi-touch**
   - `components/online-v2/goal-duel/Ov2GoalDuelScreen.js`:
     - multi-touch mapping: `pointerPadMapRef` line **242**
     - merged input write: `computePadInput` lines **266–300**
     - pointerdown capture + tap latch: `handlePointerDownPad` lines **303–320**
     - pointer end: `handlePointerEndPad` lines **322+** (continue below this excerpt)

3. **Client step send mapping + tap latching**
   - `hooks/useOv2GoalDuelSession.js`:
     - send cadence loop: around lines **344+**
     - seat-based send mapping: lines **358–359** (`sendL/sendR` swapped when `mySeat===1`)
     - tap latching: lines **360–363** (`sendJ/sendK` include `jTap/kTap`, then cleared)
     - debug console log: lines **364+** (`[ov2/gd][send]`)

4. **Local presentation + reconciliation**
   - `components/online-v2/goal-duel/ov2GoalDuelPresentation.js` (`stepPlayerPhysics`, correction logic, snap thresholds)

### Conclusions (layer isolation)

Mark exactly which layer caused each symptom:

- **Return-force / resistance**: TBD (input mapping vs prediction vs reconciliation)
- **Sticky goal**: TBD (clamp mismatch vs collision vs snapshot mirroring)
- **Short tap loss (jump/kick)**: TBD (capture vs latching vs send cadence)
- **Seat 0 vs seat 1 mismatch**: TBD (mirror + send mapping vs presentation)

## Isolate mode results (fill after matrix)

For each case, state: **bug persists? yes/no**, and paste evidence.

1. seat 0 baseline: TBD
2. seat 1 baseline: TBD
3. seat 1 authOnly (`ov2_gd_mode=authOnly`): TBD
4. seat 1 unmirror (`ov2_gd_mode=unmirror`): TBD

