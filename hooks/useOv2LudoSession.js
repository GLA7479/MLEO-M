import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createOv2LudoLocalPreviewBoard,
  applyOv2LudoLocalPreviewMove,
  setOv2LudoLocalPreviewDice,
  passPreviewTurnIfNoLegalMoves,
} from "../lib/online-v2/ludo/ov2LudoLocalPreview";
import {
  OV2_LUDO_PLAY_MODE,
  OV2_LUDO_PREVIEW_CONTROLLED_SEAT_INDEX,
  OV2_LUDO_PRODUCT_GAME_ID,
  fetchOv2LudoAuthoritativeSnapshot,
  requestOv2LudoMovePiece,
  requestOv2LudoRollDice,
  resolveOv2LudoPlayMode,
  resolveOv2LudoMySeatFromRoomMembers,
  subscribeOv2LudoAuthoritativeSnapshot,
} from "../lib/online-v2/ludo/ov2LudoSessionAdapter";

/**
 * OV2 Ludo — React session layer above `ov2LudoSessionAdapter` + `ov2LudoLocalPreview`.
 *
 * 1. `PREVIEW_LOCAL` — local sandbox.
 * 2. `LIVE_ROOM_NO_MATCH_YET` — Ludo room, no session / fetch returned null (migrations off or host has not opened).
 * 3. `LIVE_MATCH_ACTIVE` — authoritative snapshot loaded (RPC + Realtime).
 *
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2LudoSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];
  const selfKey = baseContext?.self?.participant_key?.trim() || null;

  /** @type {import("../lib/online-v2/ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot|null} */
  const [authoritativeSnapshot, setAuthoritativeSnapshot] = useState(null);

  useEffect(() => {
    setAuthoritativeSnapshot(null);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_LUDO_PRODUCT_GAME_ID) {
      setAuthoritativeSnapshot(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const snap = await fetchOv2LudoAuthoritativeSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setAuthoritativeSnapshot(snap ?? null);
    })();

    const unsub = subscribeOv2LudoAuthoritativeSnapshot(roomId, {
      participantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setAuthoritativeSnapshot(s);
      },
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, selfKey]);

  const playMode = useMemo(() => {
    const ctx = roomId ? { room: { id: roomId } } : null;
    return resolveOv2LudoPlayMode(ctx, authoritativeSnapshot);
  }, [roomId, authoritativeSnapshot]);

  const liveMySeat = useMemo(() => {
    if (authoritativeSnapshot?.mySeat != null) return authoritativeSnapshot.mySeat;
    return resolveOv2LudoMySeatFromRoomMembers(members, selfKey);
  }, [authoritativeSnapshot, members, selfKey]);

  const previewControlledSeatIndex =
    playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL ? OV2_LUDO_PREVIEW_CONTROLLED_SEAT_INDEX : null;

  const interactionTier = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) return "local_preview";
    if (
      playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE &&
      authoritativeSnapshot &&
      authoritativeSnapshot.boardViewReadOnly !== true
    ) {
      return "live_authoritative";
    }
    return "none";
  }, [playMode, authoritativeSnapshot]);

  const boardViewReadOnly = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET) return true;
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && authoritativeSnapshot?.boardViewReadOnly === true) {
      return true;
    }
    return false;
  }, [playMode, authoritativeSnapshot]);

  const [previewBoard, setPreviewBoard] = useState(() => createOv2LudoLocalPreviewBoard());
  const [diceRolling, setDiceRolling] = useState(false);
  const rollTimerRef = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null));

  const resetPreviewBoard = useCallback(() => {
    if (rollTimerRef.current != null) {
      clearTimeout(rollTimerRef.current);
      rollTimerRef.current = null;
    }
    setDiceRolling(false);
    setPreviewBoard(createOv2LudoLocalPreviewBoard());
  }, []);

  useEffect(() => {
    resetPreviewBoard();
  }, [playMode, roomId, resetPreviewBoard]);

  useEffect(() => {
    return () => {
      if (rollTimerRef.current != null) clearTimeout(rollTimerRef.current);
    };
  }, []);

  const displayBoard = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && authoritativeSnapshot?.board) {
      return authoritativeSnapshot.board;
    }
    return previewBoard;
  }, [playMode, authoritativeSnapshot, previewBoard]);

  const phaseLine = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) {
      return "Local preview — not an OV2 room match. Rules run in-browser for UI/testing only.";
    }
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET) {
      if (roomProductId === OV2_LUDO_PRODUCT_GAME_ID) {
        return "Ludo room — no live session loaded yet (host must open a session after SQL is applied, or migrations missing).";
      }
      return "Room open — authoritative Ludo match is not enabled yet. Board below is read-only.";
    }
    if (authoritativeSnapshot?.phase === "finished") {
      return "Match finished — authoritative result from server.";
    }
    return "Live match — server-owned dice and moves.";
  }, [playMode, authoritativeSnapshot, roomProductId]);

  const rollDicePreview = useCallback(async () => {
    if (interactionTier === "live_authoritative") {
      if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
      setDiceRolling(true);
      try {
        const res = await requestOv2LudoRollDice(roomId, authoritativeSnapshot.sessionId, {
          revision: authoritativeSnapshot.revision,
          participantKey: selfKey,
        });
        if (res.ok && res.snapshot) setAuthoritativeSnapshot(res.snapshot);
      } finally {
        setDiceRolling(false);
      }
      return;
    }
    if (interactionTier !== "local_preview") return;
    if (typeof window === "undefined") return;
    if (previewControlledSeatIndex == null) return;
    if (
      previewBoard.turnSeat !== previewControlledSeatIndex ||
      previewBoard.dice != null ||
      previewBoard.winner != null
    ) {
      return;
    }
    setDiceRolling(true);
    if (rollTimerRef.current != null) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = window.setTimeout(() => {
      rollTimerRef.current = null;
      const v = 1 + Math.floor(Math.random() * 6);
      setPreviewBoard(prev => {
        const withDice = setOv2LudoLocalPreviewDice(prev, v);
        const pass = passPreviewTurnIfNoLegalMoves(withDice, previewControlledSeatIndex);
        return pass.changed ? pass.board : withDice;
      });
      setDiceRolling(false);
    }, 450);
  }, [
    interactionTier,
    previewControlledSeatIndex,
    previewBoard.turnSeat,
    previewBoard.dice,
    previewBoard.winner,
    roomId,
    selfKey,
    authoritativeSnapshot,
  ]);

  const onPieceClick = useCallback(
    async pieceIdx => {
      if (interactionTier === "live_authoritative") {
        if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
        const res = await requestOv2LudoMovePiece(roomId, authoritativeSnapshot.sessionId, pieceIdx, {
          revision: authoritativeSnapshot.revision,
          participantKey: selfKey,
        });
        if (res.ok && res.snapshot) setAuthoritativeSnapshot(res.snapshot);
        return;
      }
      if (interactionTier !== "local_preview" || previewControlledSeatIndex == null) return;
      if (previewBoard.turnSeat !== previewControlledSeatIndex || previewBoard.dice == null) return;
      const res = applyOv2LudoLocalPreviewMove(previewBoard, previewControlledSeatIndex, pieceIdx);
      if (!res.ok) return;
      setPreviewBoard(res.board);
    },
    [interactionTier, previewControlledSeatIndex, previewBoard, roomId, selfKey, authoritativeSnapshot]
  );

  const boardSeatForUi = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) return previewControlledSeatIndex;
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && authoritativeSnapshot?.mySeat != null) {
      return authoritativeSnapshot.mySeat;
    }
    return null;
  }, [playMode, previewControlledSeatIndex, authoritativeSnapshot]);

  const canRoll = useMemo(() => {
    if (interactionTier === "local_preview") {
      return (
        previewControlledSeatIndex != null &&
        previewBoard.turnSeat === previewControlledSeatIndex &&
        previewBoard.dice == null &&
        previewBoard.winner == null &&
        !diceRolling
      );
    }
    if (interactionTier === "live_authoritative" && authoritativeSnapshot) {
      return authoritativeSnapshot.canClientRoll === true && !diceRolling;
    }
    return false;
  }, [interactionTier, previewControlledSeatIndex, previewBoard, diceRolling, authoritativeSnapshot]);

  const previewWaitingOtherSeat =
    playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL &&
    previewControlledSeatIndex != null &&
    previewBoard.turnSeat !== previewControlledSeatIndex &&
    previewBoard.winner == null;

  const winnerSeat =
    displayBoard.winner != null
      ? displayBoard.winner
      : authoritativeSnapshot?.winnerSeat != null
        ? authoritativeSnapshot.winnerSeat
        : null;

  const liveLegalMovablePieceIndices =
    playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE ? authoritativeSnapshot?.legalMovablePieceIndices ?? null : null;

  return {
    vm: {
      playMode,
      interactionTier,
      previewControlledSeatIndex,
      liveMySeat,
      board: displayBoard,
      diceRolling,
      phaseLine,
      boardSeatForUi,
      boardViewReadOnly,
      previewWaitingOtherSeat,
      winnerSeat,
      liveLegalMovablePieceIndices,
    },
    rollDicePreview,
    onPieceClick,
    canRoll,
    resetPreviewBoard,
  };
}
