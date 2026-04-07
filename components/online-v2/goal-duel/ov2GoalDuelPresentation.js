/**
 * Goal Duel — client-side presentation state only (render / feel).
 * Server snapshot remains authoritative; this layer predicts local motion and smooths remote + ball.
 *
 * Physics constants aligned with `ov2_gd_sim_step` (138_ov2_goal_duel_engine.sql).
 */

/** @typedef {{ x: number, y: number, vx: number, vy: number }} GdVecBody */
/** @typedef {{ x: number, y: number, vx: number, vy: number, r: number }} GdBallBody */

const GRAV = 2200;
const P_ACCEL = 5200;
const P_MAX_X = 420;
const JUMP_V = 680;
const HW = 14;
const HH = 22;

/** Large error → snap local player to authority (world px). Stale or fresh — safety only. */
const PLAYER_SNAP_DIST = 105;
/** No soft correction below this (fresh auth only). */
const LOCAL_DEAD_ZONE = 4;
/**
 * Soft catch-up toward authority when a new snapshot revision arrives.
 * NOTE: This is applied only on fresh authoritative updates, so it is tuned *per update* (not per second).
 */
const LOCAL_CORRECT_BASE = 0.045;
const LOCAL_CORRECT_PER_PX = 0.00135;
/** Caps blend factor for one correction tick (fresh auth). */
const LOCAL_CORRECT_MAX_STEP = 0.32;
/** While steering, allow limited x-correction if drift is large (prevents long-lived lead). */
const LOCAL_STEER_DRIFT_X = 26;
const LOCAL_STEER_X_CORRECT_SCALE = 0.22;
/** Remote player smoothing (higher = snappier follow of snapshots). */
const REMOTE_SMOOTH_RATE = 14;

/**
 * Fresh-auth velocity reconciliation for the local player.
 *
 * Prevents stale local velocity from integrating away from authority (notably under mirrored seat-1 snapshots),
 * while preserving responsive steering/jump feel.
 *
 * @param {GdVecBody} p
 * @param {GdVecBody} auth
 * @param {{ steerX: boolean, jumpHeld: boolean }} opts
 * @returns {{ vxSynced: boolean, vySynced: boolean, dvx: number, dvy: number }}
 */
function reconcileLocalVelocity(p, auth, opts) {
  const dvx = auth.vx - p.vx;
  const dvy = auth.vy - p.vy;

  let vxSynced = false;
  let vySynced = false;

  // Horizontal velocity: if not actively steering, match authority exactly.
  if (!opts.steerX) {
    p.vx = auth.vx;
    vxSynced = true;
  } else {
    // While steering, do not fully overwrite vx unless divergence is severe.
    const s0 = Math.sign(p.vx);
    const s1 = Math.sign(auth.vx);
    const signMismatchX = s0 !== 0 && s1 !== 0 && s0 !== s1;
    const largeVelErrorX = Math.abs(dvx) >= 90;
    if (signMismatchX || largeVelErrorX) {
      // Strong blend; still not a full overwrite.
      p.vx += dvx * 0.45;
      vxSynced = true;
    }
  }

  // Vertical velocity: if jump is not held, match authority exactly.
  if (!opts.jumpHeld) {
    p.vy = auth.vy;
    vySynced = true;
  }

  return { vxSynced, vySynced, dvx, dvy };
}

/** Ball-only: snap presentation to authority if drift exceeds this (world px). */
const BALL_SNAP_DIST = 78;
/** Velocity-aware smoothing: min/max effective rates (per second, scaled by `dt` in `smoothK`). */
const BALL_SMOOTH_LO = 6.5;
const BALL_SMOOTH_HI = 23;
/** Reference speed for lerping between LO and HI (world units/s, order of sprinting ball). */
const BALL_SMOOTH_SPEED_REF = 420;
/** Short look-ahead along authoritative velocity (seconds), capped in px. */
const BALL_EXTRAP_SEC = 0.024;
const BALL_EXTRAP_MAX = 16;
/** Local kick nudge: impulse strength (world px equivalent), decay per second. */
const BALL_KICK_NUDGE_STR = 9;
const BALL_KICK_NUDGE_MAX_DIST = 56;
const BALL_NUDGE_DECAY = 16;

/**
 * @param {number} authSpeed
 * @param {number} dt
 * @returns {number} blend factor in (0,1], multiply by dt already applied inside
 */
export function gdBallSmoothRateForSpeed(authSpeed, dt) {
  const spd = Math.max(0, authSpeed);
  const t = Math.min(1, spd / BALL_SMOOTH_SPEED_REF);
  const perSec = BALL_SMOOTH_LO + (BALL_SMOOTH_HI - BALL_SMOOTH_LO) * t;
  return Math.min(1, perSec * dt);
}

/**
 * @returns {{
 *   p0: GdVecBody,
 *   p1: GdVecBody,
 *   ball: GdBallBody,
 *   ballNudgeX: number,
 *   ballNudgeY: number,
 *   init: boolean,
 *   lastSessionId: string,
 *   lastScore0: number,
 *   lastScore1: number,
 *   lastAuthRevisionFrame: number,
 * }}
 */
export function gdCreatePresentationState() {
  return {
    p0: { x: 180, y: 338, vx: 0, vy: 0 },
    p1: { x: 620, y: 338, vx: 0, vy: 0 },
    ball: { x: 400, y: 220, vx: 0, vy: 0, r: 11 },
    ballNudgeX: 0,
    ballNudgeY: 0,
    init: false,
    lastSessionId: "",
    lastScore0: 0,
    lastScore1: 0,
    /** Previous frame snapshot revision — when unchanged, authoritative positions are stale vs sim. */
    lastAuthRevisionFrame: NaN,
  };
}

/**
 * @param {Record<string, unknown>} pub
 */
function readArena(pub) {
  const a = pub.arena && typeof pub.arena === "object" ? /** @type {Record<string, unknown>} */ (pub.arena) : {};
  return {
    aw: Number(a.w ?? 800) || 800,
    gy: Number(a.groundY ?? 360) || 360,
    gm: Number(a.goalMargin ?? 48) || 48,
  };
}

/**
 * @param {GdVecBody} p
 * @param {Record<string, unknown>} src
 */
function syncPlayerFromAuth(p, src) {
  p.x = Number(src.x ?? p.x);
  p.y = Number(src.y ?? p.y);
  p.vx = Number(src.vx ?? 0);
  p.vy = Number(src.vy ?? 0);
}

/**
 * @param {GdBallBody} b
 * @param {Record<string, unknown>} src
 */
function syncBallFromAuth(b, src) {
  b.x = Number(src.x ?? b.x);
  b.y = Number(src.y ?? b.y);
  b.vx = Number(src.vx ?? 0);
  b.vy = Number(src.vy ?? 0);
  b.r = Number(src.r ?? 11);
}

/**
 * @param {ReturnType<typeof gdCreatePresentationState>} st
 * @param {Record<string, unknown>} pub
 */
export function gdHardSyncPresentationFromAuthoritative(st, pub) {
  const p0 = pub.p0 && typeof pub.p0 === "object" ? /** @type {Record<string, unknown>} */ (pub.p0) : {};
  const p1 = pub.p1 && typeof pub.p1 === "object" ? /** @type {Record<string, unknown>} */ (pub.p1) : {};
  const ball = pub.ball && typeof pub.ball === "object" ? /** @type {Record<string, unknown>} */ (pub.ball) : {};
  syncPlayerFromAuth(st.p0, p0);
  syncPlayerFromAuth(st.p1, p1);
  syncBallFromAuth(st.ball, ball);
  st.ballNudgeX = 0;
  st.ballNudgeY = 0;
  st.init = true;
}

/**
 * One integration step for a single player (matches server accel / clamp / jump / ground / x-bounds).
 *
 * @param {GdVecBody} p
 * @param {{ l: boolean, r: boolean, j: boolean, k: boolean }} sin
 * @param {number} dt
 * @param {{ aw: number, gy: number, gm: number }} arena
 */
function stepPlayerPhysics(p, sin, dt, arena) {
  const { aw, gy } = arena;
  const gyNum = gy;
  let ax = 0;
  if (sin.l && !sin.r) ax -= P_ACCEL;
  if (sin.r && !sin.l) ax += P_ACCEL;
  p.vx += ax * dt;
  if (p.vx > P_MAX_X) p.vx = P_MAX_X;
  if (p.vx < -P_MAX_X) p.vx = -P_MAX_X;
  const feet = p.y + HH;
  if (sin.j && feet >= gyNum - 0.5) {
    p.vy = -JUMP_V;
  }
  p.vy += GRAV * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.y + HH >= gyNum) {
    p.y = gyNum - HH;
    p.vy = 0;
  }
  // Server sim clamps players to the arena walls, not the goal mouth margin.
  const minX = HW;
  const maxX = aw - HW;
  if (p.x < minX) p.x = minX;
  if (p.x > maxX) p.x = maxX;
}

/**
 * Reconcile local predicted player toward authority.
 * Soft correction runs only on frames where `authRevision` changed (new server snapshot).
 * Between snapshots the player is not pulled toward stale targets (avoids rubber-band).
 * While steering or holding jump, correction is weakened so input is not opposed.
 *
 * @param {GdVecBody} p
 * @param {GdVecBody} auth
 * @param {number} dt
 * @param {{ freshAuth: boolean, steerX: boolean, jumpHeld: boolean }} opts
 */
function softCorrectLocalPlayer(p, auth, dt, opts) {
  const dx = auth.x - p.x;
  const dy = auth.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > PLAYER_SNAP_DIST) {
    p.x = auth.x;
    p.y = auth.y;
    p.vx = auth.vx;
    p.vy = auth.vy;
    return;
  }
  const neutral = !opts.steerX && !opts.jumpHeld;

  // Neutral drift guard (runs every frame, even when authority is not fresh).
  // Goal: avoid long-lived idle drift (notably for seat 1 mirrored snapshots) without opposing active control.
  if (neutral) {
    p.vx = auth.vx;
    p.vy = auth.vy;

    const adx = Math.abs(dx);
    if (adx >= 48) p.x = auth.x;
    else if (adx >= 18) p.x += dx * 0.18;

    const ady = Math.abs(dy);
    if (ady >= 18) p.y = auth.y;
    else if (ady >= 6) p.y += dy * 0.25;
  }

  if (!opts.freshAuth) return;

  // Always reconcile velocity on fresh auth, even when position error is tiny.
  const vel = reconcileLocalVelocity(p, auth, { steerX: opts.steerX, jumpHeld: opts.jumpHeld });

  if (d < LOCAL_DEAD_ZONE) {
    p.__vxSynced = vel.vxSynced;
    p.__vySynced = vel.vySynced;
    p.__dvx = vel.dvx;
    p.__dvy = vel.dvy;
    return;
  }

  const t = Math.min(LOCAL_CORRECT_MAX_STEP, LOCAL_CORRECT_BASE + d * LOCAL_CORRECT_PER_PX);
  /**
   * Production rule: while the player is actively controlling an axis, do not apply soft correction that can
   * feel like opposing force. Authority will still be enforced via: (a) snap on large desync, (b) settle when neutral.
   */
  let hx = 1;
  if (opts.steerX) {
    // Default: no opposing pull while steering.
    // Safety valve: if x-drift grows large, apply a small catch-up so drift cannot accumulate to ~60px.
    hx = Math.abs(dx) >= LOCAL_STEER_DRIFT_X ? LOCAL_STEER_X_CORRECT_SCALE : 0;
  }
  const hy = opts.jumpHeld ? 0 : 1;
  if (hx !== 0) p.x += dx * t * hx;
  if (hy !== 0) p.y += dy * t;

  // Expose to optional dev logging in `gdAdvancePresentation`.
  p.__vxSynced = vel.vxSynced;
  p.__vySynced = vel.vySynced;
  p.__dvx = vel.dvx;
  p.__dvy = vel.dvy;
}

/**
 * @param {GdVecBody} p
 * @param {GdVecBody} auth
 * @param {number} dt
 */
function smoothTowardVec(p, auth, dt) {
  const k = Math.min(1, REMOTE_SMOOTH_RATE * dt);
  p.x += (auth.x - p.x) * k;
  p.y += (auth.y - p.y) * k;
  p.vx = auth.vx;
  p.vy = auth.vy;
}

/**
 * Presentation-only ball: velocity-aware smoothing toward a short extrapolated target, snap on large error,
 * local kick nudge decay.
 *
 * @param {ReturnType<typeof gdCreatePresentationState>} st
 * @param {GdBallBody} auth
 * @param {number} dt
 * @param {boolean} localKickEdge
 * @param {GdVecBody} authLocalPlayer
 */
function advanceBallPresentation(st, auth, dt, localKickEdge, authLocalPlayer) {
  const b = st.ball;
  const err = Math.hypot(auth.x - b.x, auth.y - b.y);
  if (err > BALL_SNAP_DIST) {
    syncBallFromAuth(b, {
      x: auth.x,
      y: auth.y,
      vx: auth.vx,
      vy: auth.vy,
      r: auth.r,
    });
    st.ballNudgeX = 0;
    st.ballNudgeY = 0;
    return;
  }

  const authSpd = Math.hypot(auth.vx, auth.vy);
  const k = gdBallSmoothRateForSpeed(authSpd, dt);

  let tx = auth.x + Math.max(-BALL_EXTRAP_MAX, Math.min(BALL_EXTRAP_MAX, auth.vx * BALL_EXTRAP_SEC));
  let ty = auth.y + Math.max(-BALL_EXTRAP_MAX, Math.min(BALL_EXTRAP_MAX, auth.vy * BALL_EXTRAP_SEC));

  b.x += (tx - b.x) * k;
  b.y += (ty - b.y) * k;
  b.vx = auth.vx;
  b.vy = auth.vy;
  b.r = auth.r;

  const decay = Math.exp(-BALL_NUDGE_DECAY * dt);
  st.ballNudgeX *= decay;
  st.ballNudgeY *= decay;
  if (localKickEdge) {
    const dx = auth.x - authLocalPlayer.x;
    const dy = auth.y - authLocalPlayer.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.5 && d < BALL_KICK_NUDGE_MAX_DIST) {
      const inv = 1 / d;
      st.ballNudgeX += dx * inv * BALL_KICK_NUDGE_STR;
      st.ballNudgeY += dy * inv * BALL_KICK_NUDGE_STR * 0.65;
    }
  }
  if (Math.hypot(st.ballNudgeX, st.ballNudgeY) < 0.04) {
    st.ballNudgeX = 0;
    st.ballNudgeY = 0;
  }
}

/**
 * UI → sim axes. Server `ov2_gd_sim_step` uses the same world +x for both seats (l = −ax, r = +ax).
 * `inputRef.l` / `inputRef.r` are always screen-left / screen-right; no seat swap here.
 *
 * @param {{ l: boolean, r: boolean, j: boolean, k: boolean }} inp
 */
export function gdSeatWorldInput(inp) {
  return { l: inp.l, r: inp.r, j: inp.j, k: inp.k };
}

/**
 * Advance presentation for one render frame.
 *
 * @param {ReturnType<typeof gdCreatePresentationState>} st
 * @param {Record<string, unknown>} authPub — `vm.public` from server
 * @param {{ l: boolean, r: boolean, j: boolean, k: boolean }} inp
 * @param {0|1|null} mySeat
 * @param {number} dtSec
 * @param {{ sessionId: string, score0: number, score1: number, revision?: number, localKickEdge?: boolean }} meta
 */
export function gdAdvancePresentation(st, authPub, inp, mySeat, dtSec, meta) {
  const dt = Math.min(0.09, Math.max(0.001, dtSec));
  const authRevision = Number(meta.revision ?? 0);
  const p0a = authPub.p0 && typeof authPub.p0 === "object" ? /** @type {Record<string, unknown>} */ (authPub.p0) : {};
  const p1a = authPub.p1 && typeof authPub.p1 === "object" ? /** @type {Record<string, unknown>} */ (authPub.p1) : {};
  const ba = authPub.ball && typeof authPub.ball === "object" ? /** @type {Record<string, unknown>} */ (authPub.ball) : {};

  const authP0 = { x: Number(p0a.x ?? 180), y: Number(p0a.y ?? 338), vx: Number(p0a.vx ?? 0), vy: Number(p0a.vy ?? 0) };
  const authP1 = { x: Number(p1a.x ?? 620), y: Number(p1a.y ?? 338), vx: Number(p1a.vx ?? 0), vy: Number(p1a.vy ?? 0) };
  const authBall = {
    x: Number(ba.x ?? 400),
    y: Number(ba.y ?? 220),
    vx: Number(ba.vx ?? 0),
    vy: Number(ba.vy ?? 0),
    r: Number(ba.r ?? 11),
  };

  const needHard =
    !st.init ||
    meta.sessionId !== st.lastSessionId ||
    meta.score0 !== st.lastScore0 ||
    meta.score1 !== st.lastScore1;

  if (needHard) {
    gdHardSyncPresentationFromAuthoritative(st, authPub);
    st.lastSessionId = meta.sessionId;
    st.lastScore0 = meta.score0;
    st.lastScore1 = meta.score1;
    st.lastAuthRevisionFrame = authRevision;
    return;
  }

  if (mySeat !== 0 && mySeat !== 1) {
    gdHardSyncPresentationFromAuthoritative(st, authPub);
    st.lastAuthRevisionFrame = authRevision;
    return;
  }

  const localKey = mySeat === 0 ? "p0" : "p1";
  const remoteKey = mySeat === 0 ? "p1" : "p0";
  const local = st[localKey];
  const remote = st[remoteKey];
  const authLocal = localKey === "p0" ? authP0 : authP1;
  const authRemote = remoteKey === "p0" ? authP0 : authP1;

  const sin = gdSeatWorldInput(inp);
  const freshAuth =
    !Number.isFinite(st.lastAuthRevisionFrame) || authRevision !== st.lastAuthRevisionFrame;
  st.lastAuthRevisionFrame = authRevision;

  // Temporary dev-only debug output for diagnosis (Goal Duel only).
  // Note: prints only when enabled and when error is noticeable, throttled.
  const dbgOn =
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    window.localStorage?.getItem("ov2_gd_debug") === "1";

  // TODO(goal-duel): remove this temporary authority-follow fallback once both seats share
  // a stable local prediction/reconciliation path again.
  // Temporary parity/stability mode:
  // keep both seats on the same local-player render path so neither side is "worse".
  // The local player follows authority directly on both seats until we return for a deeper fix.
  syncPlayerFromAuth(local, authLocal);
  if (dbgOn) {
    const dx = authLocal.x - local.x;
    const dy = authLocal.y - local.y;
    const dist = Math.hypot(dx, dy);
    const dvx = Number(local.__dvx ?? 0);
    const dvy = Number(local.__dvy ?? 0);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const last = Number(st.__dbgLastMs ?? 0);
    if ((dist >= 18 || Math.abs(dx) >= 18) && now - last > 160) {
      st.__dbgLastMs = now;
      // eslint-disable-next-line no-console
      console.info("[ov2/gd][pres]", {
        rev: authRevision,
        freshAuth,
        neutral: !(sin.l !== sin.r) && !Boolean(sin.j),
        steerX: sin.l !== sin.r,
        jumpHeld: Boolean(sin.j),
        auth: { x: authLocal.x, vx: authLocal.vx, vy: authLocal.vy },
        pres: { x: local.x, vx: local.vx, vy: local.vy },
        dx,
        dist,
        dvx,
        dvy,
        velSync: { vx: Boolean(local.__vxSynced), vy: Boolean(local.__vySynced) },
      });
    }
  }

  smoothTowardVec(remote, authRemote, dt);

  const localKickEdge = Boolean(meta.localKickEdge);
  advanceBallPresentation(st, authBall, dt, localKickEdge, authLocal);
}
