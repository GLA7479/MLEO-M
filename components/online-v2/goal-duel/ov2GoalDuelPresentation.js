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

/** Large error → snap to authority (pixels, world space) — players. */
const SNAP_DIST = 110;
/** Below this, skip micro correction (reduces jitter). */
const CORRECT_EPS = 0.35;
/** Local blend toward authority per frame (scaled by dt). */
const LOCAL_CORRECT_RATE = 10;
/** Remote player smoothing (higher = snappier follow of snapshots). */
const REMOTE_SMOOTH_RATE = 14;

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
  const { aw, gy, gm } = arena;
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
  const minX = gm + HW;
  const maxX = aw - gm - HW;
  if (p.x < minX) p.x = minX;
  if (p.x > maxX) p.x = maxX;
}

/**
 * @param {GdVecBody} p
 * @param {GdVecBody} auth
 * @param {number} dt
 */
function softCorrectTowardAuth(p, auth, dt) {
  const dx = auth.x - p.x;
  const dy = auth.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > SNAP_DIST) {
    p.x = auth.x;
    p.y = auth.y;
    p.vx = auth.vx;
    p.vy = auth.vy;
    return;
  }
  if (d < CORRECT_EPS) return;
  const t = Math.min(0.45, 0.08 + d * 0.0012) * Math.min(1, LOCAL_CORRECT_RATE * dt);
  p.x += dx * t;
  p.y += dy * t;
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
 * @param {{ sessionId: string, score0: number, score1: number, localKickEdge?: boolean }} meta
 */
export function gdAdvancePresentation(st, authPub, inp, mySeat, dtSec, meta) {
  const dt = Math.min(0.09, Math.max(0.001, dtSec));
  const arena = readArena(authPub);
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
    return;
  }

  if (mySeat !== 0 && mySeat !== 1) {
    gdHardSyncPresentationFromAuthoritative(st, authPub);
    return;
  }

  const localKey = mySeat === 0 ? "p0" : "p1";
  const remoteKey = mySeat === 0 ? "p1" : "p0";
  const local = st[localKey];
  const remote = st[remoteKey];
  const authLocal = localKey === "p0" ? authP0 : authP1;
  const authRemote = remoteKey === "p0" ? authP0 : authP1;

  const sin = gdSeatWorldInput(inp);
  stepPlayerPhysics(local, sin, dt, arena);
  softCorrectTowardAuth(local, authLocal, dt);

  smoothTowardVec(remote, authRemote, dt);

  const localKickEdge = Boolean(meta.localKickEdge);
  advanceBallPresentation(st, authBall, dt, localKickEdge, authLocal);
}
