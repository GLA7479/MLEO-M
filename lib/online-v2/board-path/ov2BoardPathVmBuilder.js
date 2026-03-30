import { resolveBoardPathPhase } from "./ov2BoardPathPhases";

/**
 * @param {{
 *   room: import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike|null|undefined,
 *   members?: import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[],
 *   session: import("../ov2BoardPathAdapter").Ov2BoardPathSessionLike|null|undefined,
 *   seats: import("../ov2BoardPathBootstrapContract").Ov2BoardPathSeatRowLike[]|null|undefined,
 *   localParticipantKey: string|null,
 *   sessionState: import("../ov2BoardPathAdapter").BoardPathViewModel["sessionState"],
 *   flags: { hasSettlement: boolean, isBlocked?: boolean },
 * }} input
 */
export function buildOv2BoardPathVM(input) {
  const { room, session, seats, localParticipantKey, sessionState, flags } = input;

  const phase = resolveBoardPathPhase({
    roomLifecycle: room?.lifecycle_phase,
    sessionState,
    hasSettlement: flags.hasSettlement,
    isBlocked: flags.isBlocked,
  });

  const seatMap = {};
  (seats || []).forEach(s => {
    const pk = s.participant_key != null ? String(s.participant_key) : "";
    if (!pk) return;
    seatMap[pk] = {
      seatIndex: s.seat_index,
    };
  });

  const selfSeat = localParticipantKey ? seatMap[String(localParticipantKey)] || null : null;

  const sessPhase = session?.phase ?? session?.engine_phase;

  return {
    phase,
    sessionState,

    room: {
      id: room?.id,
      lifecycle: room?.lifecycle_phase,
      matchSeq: room?.match_seq,
      potLocked: room?.pot_locked,
    },

    session: {
      id: session?.id,
      phase: sessPhase,
      turnIndex: session?.turn_index ?? session?.turnMeta?.turnNumber ?? null,
      roundIndex: session?.round_index ?? null,
      activeSeatIndex:
        session?.active_seat_index ?? session?.activeSeatIndex ?? session?.turnMeta?.activeSeatIndex ?? null,
      winnerSeatIndex: session?.winner_seat_index ?? session?.winnerSeatIndex ?? null,
    },

    self: {
      participantKey: localParticipantKey,
      seatIndex: selfSeat?.seatIndex ?? null,
    },

    seats: seatMap,

    board: session?.board_state ?? session?.boardState ?? null,
  };
}
