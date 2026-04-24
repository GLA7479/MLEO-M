import { useMemo, useState } from "react";
import {
  createInitialOtState,
  otActiveRoster,
  otCanApplyLock,
  otListLegalMoveDestinations,
  otListLegalRotateRings,
} from "../lib/online-v2/orbit-trap/ov2OrbitTrapEngine.js";
import { orbitTrapGameStateFromRpc } from "../lib/online-v2/orbit-trap/ov2OrbitTrapSessionApi.js";

function boardViewPropsFromEngineState(st) {
  return {
    players: st.players,
    looseOrbs: st.looseOrbs,
    fixedOrbKeys: [...st.fixedOrbKeys],
    turnSeat: st.turnSeat,
    ringLock: st.ringLock,
    phase: st.phase,
    activeSeats: st.activeSeats?.length >= 2 ? st.activeSeats : [0, 1, 2, 3],
  };
}

/**
 * Authoritative snapshot → engine + legal sets (same role as `snap`/`vm` in other OV2 session hooks).
 * @param {{ liveSessionId?: string | null; authoritativeSnapshot?: object | null }} args
 */
export function useOv2OrbitTrapSession({ liveSessionId = null, authoritativeSnapshot = null }) {
  const [previewState] = useState(() => createInitialOtState());

  const engineState = useMemo(() => {
    if (liveSessionId && authoritativeSnapshot?.state && typeof authoritativeSnapshot.state === "object") {
      const raw = { .../** @type {Record<string, unknown>} */ (authoritativeSnapshot.state) };
      const innerAct = raw.activeSeats;
      if (!Array.isArray(innerAct) || innerAct.length < 2) {
        const top = authoritativeSnapshot.activeSeats;
        if (Array.isArray(top) && top.length >= 2) raw.activeSeats = top;
      }
      const g = orbitTrapGameStateFromRpc(raw);
      return g || previewState;
    }
    return previewState;
  }, [liveSessionId, authoritativeSnapshot, previewState]);

  const roster = useMemo(() => otActiveRoster(engineState), [engineState]);
  const rosterSet = useMemo(() => new Set(roster), [roster]);
  const boardProps = useMemo(() => boardViewPropsFromEngineState(engineState), [engineState]);
  const legalMoves = useMemo(
    () => otListLegalMoveDestinations(engineState, engineState.turnSeat),
    [engineState]
  );
  const legalRotates = useMemo(() => otListLegalRotateRings(engineState, engineState.turnSeat), [engineState]);
  const canLock = useMemo(() => otCanApplyLock(engineState, engineState.turnSeat), [engineState]);

  const legalLockRings = useMemo(() => {
    if (!canLock) return [];
    const rings = ["outer", "mid", "inner"];
    return rings.filter(r => {
      if (engineState.ringLock && engineState.ringLock.ring === r) return false;
      return true;
    });
  }, [engineState, canLock]);

  const mySeat = authoritativeSnapshot?.mySeat ?? null;
  const isAuthoritative = Boolean(
    liveSessionId &&
      authoritativeSnapshot &&
      authoritativeSnapshot.state &&
      typeof authoritativeSnapshot.state === "object"
  );

  const isMyTurn =
    isAuthoritative &&
    mySeat != null &&
    engineState.phase === "playing" &&
    engineState.turnSeat === mySeat;

  const authRevision = isAuthoritative ? Number(authoritativeSnapshot?.revision) || 0 : null;

  return {
    engineState,
    roster,
    rosterSet,
    boardProps,
    legalMoves,
    legalRotates,
    legalLockRings,
    canLock,
    mySeat,
    isAuthoritative,
    isMyTurn,
    authRevision,
  };
}
