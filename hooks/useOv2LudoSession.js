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
  buildLudoLobbySeatStripFromMembers,
  fetchOv2LudoAuthoritativeSnapshot,
  requestOv2LudoMovePiece,
  requestOv2LudoOfferDouble,
  requestOv2LudoRespondDouble,
  requestOv2LudoRollDice,
  requestOv2LudoMarkMissedTurn,
  requestOv2LudoHandleDoubleTimeout,
  requestOv2LudoRequestRematch,
  requestOv2LudoCancelRematch,
  requestOv2LudoStartNextMatch,
  resolveOv2LudoPlayMode,
  resolveOv2LudoMySeatFromRoomMembers,
  subscribeOv2LudoAuthoritativeSnapshot,
} from "../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { supabaseMP } from "../lib/supabaseClients";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { requestOv2LudoClaimSettlement } from "../lib/online-v2/ludo/ov2LudoSettlement";

/** Total target time for live roll + reveal (RPC is authoritative; pacing is display-only). */
const OV2_LUDO_LIVE_ROLL_MIN_MS = 2000;
/** After a fast server pass, keep showing the rolled face briefly if the board no longer has `dice`. */
const OV2_LUDO_DICE_FACE_HOLD_MS = 1200;

/** @param {import("../lib/online-v2/ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot|null|undefined} snap */
function snapshotResolvedRollFace(snap) {
  if (!snap) return null;
  const raw = snap.board?.dice ?? snap.dice ?? snap.board?.lastDice ?? snap.lastDice;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : null;
}

function sleepMs(ms) {
  return new Promise(resolve => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.setTimeout(resolve, ms);
  });
}

function parseSeatIndex(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3) return null;
  return n;
}

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
  const roomLifecycle = room?.lifecycle_phase != null ? String(room.lifecycle_phase) : null;
  const activeSessionKey =
    room?.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id)
      : "";
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];
  const selfKey = baseContext?.self?.participant_key?.trim() || null;

  /** @type {import("../lib/online-v2/ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot|null} */
  const [authoritativeSnapshot, setAuthoritativeSnapshot] = useState(null);
  const [presentKeys, setPresentKeys] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const authoritativeSnapshotRef = useRef(/** @type {import("../lib/online-v2/ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot|null} */ (null));
  const processedExpiredTurnKeysRef = useRef(new Set());
  const processedDoubleExpiryKeysRef = useRef(new Set());
  /** Dedupe: one client-side auto-roll per authoritative turn window (session + turn seat + deadline). */
  const liveAutoRollCompletedKeyRef = useRef(/** @type {string|null} */ (null));
  const liveAutoRollPendingKeyRef = useRef(/** @type {string|null} */ (null));
  const rollDicePreviewRef = useRef(/** @type {(() => Promise<void>)|null} */ (null));
  /** Per session: last seen double multiplier — when snapshot shows an increase, refresh server-backed vault display (all clients via Realtime snapshot). */
  const vaultDoubleMultRef = useRef(/** @type {{ sessionId: string, mult: number } | null} */ (null));
  /** One server-backed vault read per finished session (win/loss settlement visible on strip). */
  const vaultFinishedRefreshForSessionRef = useRef(/** @type {string|null} */ (null));

  useEffect(() => {
    authoritativeSnapshotRef.current = authoritativeSnapshot;
  }, [authoritativeSnapshot]);

  useEffect(() => {
    setAuthoritativeSnapshot(null);
    processedExpiredTurnKeysRef.current.clear();
    processedDoubleExpiryKeysRef.current.clear();
    liveAutoRollCompletedKeyRef.current = null;
    liveAutoRollPendingKeyRef.current = null;
    setLiveDiceRevealHold(null);
    setLiveRollServerFace(null);
    vaultDoubleMultRef.current = null;
    vaultFinishedRefreshForSessionRef.current = null;
    setVaultClaimBusy(false);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || activeSessionKey === "") return;
    setAuthoritativeSnapshot(null);
    processedExpiredTurnKeysRef.current.clear();
    processedDoubleExpiryKeysRef.current.clear();
    liveAutoRollCompletedKeyRef.current = null;
    liveAutoRollPendingKeyRef.current = null;
    setLiveDiceRevealHold(null);
    setLiveRollServerFace(null);
    vaultDoubleMultRef.current = null;
    vaultFinishedRefreshForSessionRef.current = null;
    setVaultClaimBusy(false);
  }, [roomId, activeSessionKey]);

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
  }, [roomId, roomProductId, selfKey, activeSessionKey]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_LUDO_PRODUCT_GAME_ID) return undefined;
    const channel = supabaseMP
      .channel(`ov2_ludo_presence:${roomId}`)
      .on("presence", { event: "sync" }, () => {
        const st = channel.presenceState();
        const all = Object.values(st).flat();
        const keys = all
          .map(r => (r && typeof r === "object" && "participant_key" in r ? String(r.participant_key || "").trim() : ""))
          .filter(Boolean);
        setPresentKeys(keys);
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await channel.track({ participant_key: selfKey, at: new Date().toISOString() });
        }
      });
    return () => {
      void supabaseMP.removeChannel(channel);
      setPresentKeys([]);
    };
  }, [roomId, selfKey, roomProductId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const t = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  const playMode = useMemo(() => {
    const ctx = roomId ? { room: { id: roomId } } : null;
    return resolveOv2LudoPlayMode(ctx, authoritativeSnapshot);
  }, [roomId, authoritativeSnapshot]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return;
    if (roomProductId !== OV2_LUDO_PRODUCT_GAME_ID) return;
    const sid = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sid) return;
    const mult = Math.max(1, Number(authoritativeSnapshot.doubleState?.value ?? 1) || 1);
    const prev = vaultDoubleMultRef.current;
    if (prev && prev.sessionId === sid && mult > prev.mult) {
      void readOnlineV2Vault({ fresh: true }).catch(() => {});
    }
    vaultDoubleMultRef.current = { sessionId: sid, mult };
  }, [playMode, authoritativeSnapshot, roomProductId]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return;
    if (roomProductId !== OV2_LUDO_PRODUCT_GAME_ID) return;
    if (String(authoritativeSnapshot.phase || "").trim().toLowerCase() !== "finished") return;
    const sid = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sid || !roomId || !selfKey) return;
    if (vaultFinishedRefreshForSessionRef.current === sid) return;
    vaultFinishedRefreshForSessionRef.current = sid;
    setVaultClaimBusy(true);
    void (async () => {
      try {
        const claim = await requestOv2LudoClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          await applyBoardPathSettlementClaimLinesToVault(claim.lines, OV2_LUDO_PRODUCT_GAME_ID);
        } else if (!claim.ok) {
          vaultFinishedRefreshForSessionRef.current = null;
        }
      } catch {
        vaultFinishedRefreshForSessionRef.current = null;
      } finally {
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
        setVaultClaimBusy(false);
      }
    })();
  }, [playMode, authoritativeSnapshot, roomProductId, roomId, selfKey]);

  const lobbySeatStrip = useMemo(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET || roomProductId !== OV2_LUDO_PRODUCT_GAME_ID) {
      return { labels: ["Seat 1 · —", "Seat 2 · —", "Seat 3 · —", "Seat 4 · —"], selfRingIndex: null };
    }
    return buildLudoLobbySeatStripFromMembers(members, selfKey);
  }, [playMode, roomProductId, members, selfKey]);

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

  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);

  const [previewBoard, setPreviewBoard] = useState(() => createOv2LudoLocalPreviewBoard());
  const [diceRolling, setDiceRolling] = useState(false);
  /** Live-only: random face while diceRolling (never replaces server outcome). */
  const [liveSpinTick, setLiveSpinTick] = useState(1);
  /** Once roll RPC returns, lock display to resolved face until reveal window ends (interval must not randomize over it). */
  const [liveRollServerFace, setLiveRollServerFace] = useState(/** @type {number|null} */ (null));
  /** After roll, keep showing the resolved face if the next snapshot dropped `dice` (e.g. auto-pass). */
  const [liveDiceRevealHold, setLiveDiceRevealHold] = useState(
    /** @type {{ face: number, until: number } | null} */ (null)
  );
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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !diceRolling) return undefined;
    if (liveRollServerFace != null) return undefined;
    const id = window.setInterval(() => {
      setLiveSpinTick(prev => {
        let n = prev;
        for (let i = 0; i < 8 && n === prev; i++) {
          n = 1 + Math.floor(Math.random() * 6);
        }
        return n;
      });
    }, 85);
    return () => window.clearInterval(id);
  }, [playMode, diceRolling, liveRollServerFace]);

  useEffect(() => {
    if (!liveDiceRevealHold) return;
    if (nowMs < liveDiceRevealHold.until) return;
    setLiveDiceRevealHold(null);
  }, [nowMs, liveDiceRevealHold]);

  const liveDiceDisplayValue = useMemo(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE) return undefined;
    if (diceRolling) return liveSpinTick;
    if (liveDiceRevealHold != null && nowMs < liveDiceRevealHold.until) {
      return liveDiceRevealHold.face;
    }
    return undefined;
  }, [playMode, diceRolling, liveSpinTick, liveDiceRevealHold, nowMs]);

  const displayBoard = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && authoritativeSnapshot?.board) {
      return authoritativeSnapshot.board;
    }
    return previewBoard;
  }, [playMode, authoritativeSnapshot, previewBoard]);

  const refreshAuthoritativeSnapshot = useCallback(async () => {
    if (!roomId || roomProductId !== OV2_LUDO_PRODUCT_GAME_ID) return null;
    const snap = await fetchOv2LudoAuthoritativeSnapshot(roomId, { participantKey: selfKey ?? "" });
    if (snap) setAuthoritativeSnapshot(snap);
    return snap ?? null;
  }, [roomId, roomProductId, selfKey]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return;
    const poll = window.setInterval(() => {
      void (async () => {
        const snap = await fetchOv2LudoAuthoritativeSnapshot(roomId || "", { participantKey: selfKey ?? "" });
        if (snap) setAuthoritativeSnapshot(snap);
      })();
    }, 2000);
    return () => window.clearInterval(poll);
  }, [playMode, authoritativeSnapshot, roomId, selfKey]);

  const phaseLine = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) {
      return "Local preview — not an OV2 room match. Rules run in-browser for UI/testing only.";
    }
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET) {
      if (roomProductId === OV2_LUDO_PRODUCT_GAME_ID) {
        if (roomLifecycle === "active" && !activeSessionKey) {
          return "Match stakes are locked — waiting for the host to open the Ludo session from the lobby or here.";
        }
        if (roomLifecycle && roomLifecycle !== "active") {
          return `Room is ${roomLifecycle} — open a live Ludo match once the room reaches active and the host starts the game.`;
        }
        return "Ludo room — no live session yet (room host opens when 2–4 players are seated).";
      }
      return "Room open — authoritative Ludo match is not enabled yet. Board below is read-only.";
    }
    if (authoritativeSnapshot?.phase === "finished") {
      return "Match finished — authoritative result from server.";
    }
    return "Live match — server-owned dice and moves.";
  }, [playMode, authoritativeSnapshot, roomProductId, roomLifecycle, activeSessionKey]);

  const rollDicePreview = useCallback(async () => {
    if (interactionTier === "live_authoritative") {
      if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
      const t0 = typeof Date.now === "function" ? Date.now() : 0;
      setLiveRollServerFace(null);
      setDiceRolling(true);
      try {
        const res = await requestOv2LudoRollDice(roomId, authoritativeSnapshot.sessionId, {
          revision: authoritativeSnapshot.revision,
          participantKey: selfKey,
        });
        const face = res.ok && res.snapshot ? snapshotResolvedRollFace(res.snapshot) : null;
        if (face != null) {
          setLiveRollServerFace(face);
          setLiveSpinTick(face);
        }
        const wait = Math.max(0, OV2_LUDO_LIVE_ROLL_MIN_MS - (Date.now() - t0));
        await sleepMs(wait);
        if (res.ok && res.snapshot) {
          setAuthoritativeSnapshot(res.snapshot);
          const snap = res.snapshot;
          const bd = snap.board?.dice;
          const hasDice = bd != null && bd !== "" && !Number.isNaN(Number(bd));
          if (!hasDice && face != null) {
            setLiveDiceRevealHold({ face, until: Date.now() + OV2_LUDO_DICE_FACE_HOLD_MS });
          }
        }
      } finally {
        setLiveRollServerFace(null);
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

  rollDicePreviewRef.current = rollDicePreview;

  /** When the server snapshot moves out of "my turn, dice null, may roll", stop retrying auto-roll for this turn key. */
  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot || !roomId || !selfKey) return;
    if (interactionTier !== "live_authoritative") return;
    if (authoritativeSnapshot.phase !== "playing") return;
    if (authoritativeSnapshot.boardViewReadOnly === true) return;
    const deadline = Number(authoritativeSnapshot.turnDeadline);
    const liveTurnSeat = parseSeatIndex(authoritativeSnapshot.board?.turnSeat);
    const sessionId = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sessionId || liveTurnSeat == null || !Number.isFinite(deadline)) return;
    if (liveMySeat == null || liveTurnSeat !== liveMySeat) return;
    const rev = Number(authoritativeSnapshot.revision);
    if (!Number.isFinite(rev)) return;
    const autoKey = `${sessionId}|${liveTurnSeat}|${deadline}|${rev}|autoroll`;
    const stillRollable =
      authoritativeSnapshot.canClientRoll === true && authoritativeSnapshot.board?.dice == null;
    if (stillRollable) return;
    liveAutoRollCompletedKeyRef.current = autoKey;
    if (liveAutoRollPendingKeyRef.current === autoKey) {
      liveAutoRollPendingKeyRef.current = null;
    }
  }, [playMode, interactionTier, authoritativeSnapshot, roomId, selfKey, liveMySeat]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot || !roomId || !selfKey) return;
    if (interactionTier !== "live_authoritative") return;
    if (authoritativeSnapshot.phase !== "playing") return;
    if (authoritativeSnapshot.boardViewReadOnly === true) return;
    if (!authoritativeSnapshot.canClientRoll) return;
    if (authoritativeSnapshot.board?.dice != null) return;
    if (diceRolling) return;
    const deadline = Number(authoritativeSnapshot.turnDeadline);
    const liveTurnSeat = parseSeatIndex(authoritativeSnapshot.board?.turnSeat);
    const sessionId = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sessionId || liveTurnSeat == null || !Number.isFinite(deadline)) return;
    if (!Array.isArray(authoritativeSnapshot.board?.activeSeats) || !authoritativeSnapshot.board.activeSeats.includes(liveTurnSeat)) {
      return;
    }
    if (liveMySeat == null || liveTurnSeat !== liveMySeat) return;
    const rev = Number(authoritativeSnapshot.revision);
    if (!Number.isFinite(rev)) return;
    const autoKey = `${sessionId}|${liveTurnSeat}|${deadline}|${rev}|autoroll`;
    if (liveAutoRollCompletedKeyRef.current === autoKey) return;
    if (liveAutoRollPendingKeyRef.current === autoKey) return;
    liveAutoRollPendingKeyRef.current = autoKey;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const clearPendingIfMatch = () => {
          if (liveAutoRollPendingKeyRef.current === autoKey) {
            liveAutoRollPendingKeyRef.current = null;
          }
        };
        if (cancelled) {
          clearPendingIfMatch();
          return;
        }
        const snap = authoritativeSnapshotRef.current;
        if (
          !snap ||
          snap.phase !== "playing" ||
          snap.boardViewReadOnly === true ||
          !snap.canClientRoll ||
          snap.board?.dice != null
        ) {
          liveAutoRollCompletedKeyRef.current = autoKey;
          clearPendingIfMatch();
          return;
        }
        const d = Number(snap.turnDeadline);
        const seat = parseSeatIndex(snap.board?.turnSeat);
        const sid = String(snap.sessionId || "").trim();
        const snapRev = Number(snap.revision);
        if (sid !== sessionId || seat !== liveTurnSeat || d !== deadline || snapRev !== rev) {
          clearPendingIfMatch();
          return;
        }
        const t0 = Date.now();
        let rollStateStarted = false;
        setLiveRollServerFace(null);
        setDiceRolling(true);
        rollStateStarted = true;
        try {
          const res = await requestOv2LudoRollDice(roomId, sid, {
            revision: snap.revision,
            participantKey: selfKey,
          });
          if (cancelled) return;
          const face = res.ok && res.snapshot ? snapshotResolvedRollFace(res.snapshot) : null;
          if (face != null) {
            setLiveRollServerFace(face);
            setLiveSpinTick(face);
          }
          const wait = Math.max(0, OV2_LUDO_LIVE_ROLL_MIN_MS - (Date.now() - t0));
          await sleepMs(wait);
          if (res.ok) {
            liveAutoRollCompletedKeyRef.current = autoKey;
            if (res.snapshot) {
              setAuthoritativeSnapshot(res.snapshot);
              const ns = res.snapshot;
              const bd = ns.board?.dice;
              const hasDice = bd != null && bd !== "" && !Number.isNaN(Number(bd));
              if (!hasDice && face != null) {
                setLiveDiceRevealHold({ face, until: Date.now() + OV2_LUDO_DICE_FACE_HOLD_MS });
              }
            }
          }
        } finally {
          if (rollStateStarted) {
            setLiveRollServerFace(null);
            setDiceRolling(false);
          }
          clearPendingIfMatch();
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      if (liveAutoRollPendingKeyRef.current === autoKey) {
        liveAutoRollPendingKeyRef.current = null;
      }
    };
  }, [
    playMode,
    interactionTier,
    authoritativeSnapshot,
    roomId,
    selfKey,
    diceRolling,
    liveMySeat,
  ]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot || !roomId) return;
    if (authoritativeSnapshot.phase !== "playing") return;
    const deadline = Number(authoritativeSnapshot.turnDeadline);
    const liveTurnSeat = parseSeatIndex(authoritativeSnapshot.board?.turnSeat);
    const sessionId = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sessionId || liveTurnSeat == null || !Number.isFinite(deadline)) return;
    if (!Array.isArray(authoritativeSnapshot.board?.activeSeats) || !authoritativeSnapshot.board.activeSeats.includes(liveTurnSeat)) {
      return;
    }
    const turnMember = members.find(m => Number(m?.seat_index) === Number(liveTurnSeat)) || null;
    const turnParticipantKey = turnMember?.participant_key ? String(turnMember.participant_key).trim() : "";
    if (!turnParticipantKey || presentKeys.includes(turnParticipantKey)) return;
    const turnKey = `${sessionId}|${liveTurnSeat}|${deadline}|playing`;
    if (processedExpiredTurnKeysRef.current.has(turnKey)) return;
    const runMissedTurn = async () => {
      if (processedExpiredTurnKeysRef.current.has(turnKey)) return;
      const snap = authoritativeSnapshotRef.current;
      if (!snap || snap.phase !== "playing") return;
      const verifySeat = parseSeatIndex(snap.board?.turnSeat);
      const verifyDeadline = Number(snap.turnDeadline);
      const verifySessionId = String(snap.sessionId || "").trim();
      const verifyKey =
        verifySessionId && verifySeat != null && Number.isFinite(verifyDeadline)
          ? `${verifySessionId}|${verifySeat}|${verifyDeadline}|playing`
          : null;
      if (verifyKey !== turnKey || Date.now() < verifyDeadline) return;
      if (!Array.isArray(snap.board?.activeSeats) || !snap.board.activeSeats.includes(verifySeat)) return;
      const verifyMember = members.find(m => Number(m?.seat_index) === Number(verifySeat)) || null;
      const verifyParticipantKey = verifyMember?.participant_key ? String(verifyMember.participant_key).trim() : "";
      if (!verifyParticipantKey || presentKeys.includes(verifyParticipantKey)) return;
      const res = await requestOv2LudoMarkMissedTurn(roomId, verifySeat, {
        revision: snap.revision,
        participantKey: verifyParticipantKey,
        isGone: true,
      });
      if (res.ok) {
        processedExpiredTurnKeysRef.current.add(turnKey);
        if (res.snapshot) setAuthoritativeSnapshot(res.snapshot);
        else await refreshAuthoritativeSnapshot();
      } else {
        await refreshAuthoritativeSnapshot();
      }
    };
    const ms = Math.max(0, deadline - Date.now());
    const t = window.setTimeout(() => {
      void runMissedTurn();
    }, ms);
    return () => window.clearTimeout(t);
  }, [playMode, authoritativeSnapshot, roomId, members, presentKeys, refreshAuthoritativeSnapshot]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot || !roomId) return;
    const dbl = authoritativeSnapshot.doubleState;
    const awaiting = dbl && dbl.awaiting != null ? Number(dbl.awaiting) : null;
    const expiresAt = dbl && dbl.expires_at != null ? Number(dbl.expires_at) : null;
    if (awaiting == null || expiresAt == null || Number.isNaN(expiresAt)) return;
    const timeoutKey = `${String(authoritativeSnapshot.sessionId || "")}|${awaiting}|${expiresAt}`;
    if (processedDoubleExpiryKeysRef.current.has(timeoutKey)) return;
    const runDoubleTimeout = async () => {
      if (processedDoubleExpiryKeysRef.current.has(timeoutKey)) return;
      const res = await requestOv2LudoHandleDoubleTimeout(roomId, awaiting, { revision: authoritativeSnapshot.revision });
      if (res.ok) {
        processedDoubleExpiryKeysRef.current.add(timeoutKey);
        if (res.snapshot) setAuthoritativeSnapshot(res.snapshot);
        else await refreshAuthoritativeSnapshot();
      } else {
        await refreshAuthoritativeSnapshot();
      }
    };
    const ms = expiresAt - Date.now();
    if (ms <= 0) {
      void runDoubleTimeout();
      return;
    }
    const t = window.setTimeout(() => {
      void runDoubleTimeout();
    }, ms);
    return () => window.clearTimeout(t);
  }, [playMode, authoritativeSnapshot, roomId, refreshAuthoritativeSnapshot]);

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

  const activeSeatsLive = useMemo(() => {
    if (!Array.isArray(authoritativeSnapshot?.board?.activeSeats)) return [];
    return authoritativeSnapshot.board.activeSeats
      .map(s => parseSeatIndex(s))
      .filter(s => s != null);
  }, [authoritativeSnapshot?.board?.activeSeats]);
  const turnSeatRaw = authoritativeSnapshot?.board?.turnSeat ?? null;
  const turnSeatParsed = parseSeatIndex(turnSeatRaw);
  const turnSeat = turnSeatParsed != null && activeSeatsLive.includes(turnSeatParsed) ? turnSeatParsed : null;
  const turnDeadline = authoritativeSnapshot?.turnDeadline ?? null;
  const authoritativeTurnKey = useMemo(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return null;
    if (authoritativeSnapshot.phase !== "playing") return null;
    if (authoritativeSnapshot.boardViewReadOnly === true) return null;
    const sessionId = String(authoritativeSnapshot.sessionId || "").trim();
    const deadline = Number(authoritativeSnapshot.turnDeadline);
    if (!sessionId || turnSeat == null || !Number.isFinite(deadline)) return null;
    if (!activeSeatsLive.includes(turnSeat)) return null;
    return `${sessionId}|${turnSeat}|${deadline}|playing`;
  }, [playMode, authoritativeSnapshot, turnSeat, activeSeatsLive]);
  const turnTimeLeftMs = authoritativeTurnKey != null ? Math.max(0, Number(turnDeadline) - nowMs) : null;
  const turnTimeLeftSec = turnTimeLeftMs != null ? Math.ceil(turnTimeLeftMs / 1000) : null;
  const isTurnTimerActive = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && turnTimeLeftMs != null && turnTimeLeftMs > 0;
  const isMyTurnLive = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && liveMySeat != null && turnSeat === liveMySeat;

  const doubleState = authoritativeSnapshot?.doubleState ?? null;
  const currentMultiplier = Math.max(1, Number(doubleState?.value || 1) || 1);
  const doubleProposedBySeat = parseSeatIndex(doubleState?.proposed_by);
  const doubleAwaitingRaw = parseSeatIndex(doubleState?.awaiting);
  const doubleAwaitingSeat =
    doubleAwaitingRaw != null && activeSeatsLive.includes(doubleAwaitingRaw) ? doubleAwaitingRaw : null;
  const doublePendingSeats = Array.isArray(doubleState?.pending)
    ? doubleState.pending.map(s => parseSeatIndex(s)).filter(s => s != null)
    : [];
  const isDoublePending = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && authoritativeSnapshot?.phase === "playing" && doubleAwaitingSeat != null;
  const doubleExpiresAt =
    doubleState?.expires_at != null && Number.isFinite(Number(doubleState.expires_at))
      ? Number(doubleState.expires_at)
      : null;
  const doubleTimeLeftMs =
    isDoublePending && doubleExpiresAt != null ? Math.max(0, doubleExpiresAt - nowMs) : null;
  const doubleTimeLeftSec = doubleTimeLeftMs != null ? Math.ceil(doubleTimeLeftMs / 1000) : null;
  const isDoubleTimerActive = doubleTimeLeftMs != null && doubleTimeLeftMs > 0;

  const doubleInitiationsRecord = useMemo(() => {
    const d = authoritativeSnapshot?.doubleInitiations;
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    return /** @type {Record<string, unknown>} */ (d);
  }, [authoritativeSnapshot?.doubleInitiations]);
  const myDoubleOfferCount =
    liveMySeat != null
      ? Math.max(0, Math.floor(Number(doubleInitiationsRecord[String(liveMySeat)] ?? 0) || 0))
      : 0;
  const isDoubleOfferCapped = myDoubleOfferCount >= 2;
  const isAtDoubleMultiplierCap = currentMultiplier >= 16;

  const seatStrikeCountMap = useMemo(() => {
    const out = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const raw = authoritativeSnapshot?.missedTurns;
    if (!raw || typeof raw !== "object") return out;
    const byParticipant = new Map(
      members.map(m => [String(m?.participant_key || ""), parseSeatIndex(m?.seat_index)]).filter(([k]) => k)
    );
    for (const [k, v] of Object.entries(raw)) {
      const strikes = Math.max(0, Number(v) || 0);
      if (!strikes) continue;
      const seatFromKey = parseSeatIndex(k);
      if (seatFromKey != null) {
        out[seatFromKey] = Math.max(out[seatFromKey], strikes);
        continue;
      }
      const seat = byParticipant.get(String(k));
      if (seat != null) {
        out[seat] = Math.max(out[seat], strikes);
      }
    }
    return out;
  }, [authoritativeSnapshot?.missedTurns, members]);

  const eliminatedSeats = useMemo(() => {
    return [0, 1, 2, 3].filter(seat => Number(seatStrikeCountMap[seat] || 0) >= 3 && !activeSeatsLive.includes(seat));
  }, [activeSeatsLive, seatStrikeCountMap]);

  const strikeDisplayMap = useMemo(() => {
    const out = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const seat of [0, 1, 2, 3]) {
      const strikes = Number(seatStrikeCountMap?.[seat] || 0);
      out[seat] = Math.max(0, Math.min(3, strikes));
    }
    return out;
  }, [seatStrikeCountMap]);

  const statusLine = useMemo(() => {
    if (authoritativeSnapshot?.phase === "finished" && authoritativeSnapshot?.result?.winner != null) {
      return `Match finished — winner Seat ${Number(authoritativeSnapshot.result.winner) + 1}.`;
    }
    if (eliminatedSeats.length > 0) {
      return `Seat ${eliminatedSeats.map(s => Number(s) + 1).join(", ")} eliminated after 3 missed turns.`;
    }
    if (doubleExpiresAt != null && !isDoublePending && doubleExpiresAt <= nowMs) {
      return "Double response timed out — resolving.";
    }
    return "";
  }, [authoritativeSnapshot?.phase, authoritativeSnapshot?.result, eliminatedSeats, isDoublePending, doubleExpiresAt, nowMs]);

  return {
    vaultClaimBusy,
    vm: {
      playMode,
      interactionTier,
      previewControlledSeatIndex,
      liveMySeat,
      board: displayBoard,
      diceRolling,
      liveDiceDisplayValue,
      doubleCycleUsedSeats: authoritativeSnapshot?.doubleCycleUsedSeats ?? [],
      doubleInitiations: doubleInitiationsRecord,
      myDoubleOfferCount,
      isDoubleOfferCapped,
      isAtDoubleMultiplierCap,
      /** Authoritative session phase when in live match (`lobby` | `playing` | `finished` | …). */
      matchPhase: authoritativeSnapshot?.phase ?? null,
      phaseLine,
      boardSeatForUi,
      boardViewReadOnly,
      previewWaitingOtherSeat,
      winnerSeat,
      liveLegalMovablePieceIndices,
      lobbySeatLabels: lobbySeatStrip.labels,
      lobbySelfRingIndex: lobbySeatStrip.selfRingIndex,
      turnSeat,
      turnDeadline,
      authoritativeTurnKey,
      turnTimeLeftMs,
      turnTimeLeftSec,
      isTurnTimerActive,
      isMyTurnLive,
      doubleState,
      currentMultiplier,
      doubleProposedBySeat,
      doubleAwaitingSeat,
      doublePendingSeats,
      isDoublePending,
      doubleTimeLeftMs,
      doubleTimeLeftSec,
      isDoubleTimerActive,
      result: authoritativeSnapshot?.result ?? null,
      missedTurns: authoritativeSnapshot?.missedTurns ?? null,
      seatStrikeCountMap,
      strikeDisplayMap,
      eliminatedSeats,
      statusLine,
      /** Active authoritative session id (for finish dismiss / UI keys). */
      sessionId: authoritativeSnapshot?.sessionId != null ? String(authoritativeSnapshot.sessionId).trim() : "",
    },
    rollDicePreview,
    onPieceClick,
    canRoll,
    resetPreviewBoard,
    offerDouble: async () => {
      if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
      const res = await requestOv2LudoOfferDouble(roomId, authoritativeSnapshot.sessionId, {
        revision: authoritativeSnapshot.revision,
        participantKey: selfKey,
      });
      if (res.ok && res.snapshot) setAuthoritativeSnapshot(res.snapshot);
    },
    respondDouble: async answer => {
      if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
      const res = await requestOv2LudoRespondDouble(roomId, authoritativeSnapshot.sessionId, answer, {
        revision: authoritativeSnapshot.revision,
        participantKey: selfKey,
      });
      if (res.ok && res.snapshot) setAuthoritativeSnapshot(res.snapshot);
    },
    requestRematch: async () => {
      if (!roomId || !selfKey) return { ok: false, error: "missing" };
      return requestOv2LudoRequestRematch(roomId, selfKey);
    },
    cancelRematch: async () => {
      if (!roomId || !selfKey) return { ok: false, error: "missing" };
      return requestOv2LudoCancelRematch(roomId, selfKey);
    },
    startNextMatch: async () => {
      if (!roomId || !selfKey) return { ok: false, error: "missing" };
      const rawSeq = room?.match_seq;
      const seq =
        rawSeq != null && rawSeq !== "" && Number.isFinite(Number(rawSeq)) ? Math.floor(Number(rawSeq)) : null;
      return requestOv2LudoStartNextMatch(roomId, selfKey, seq);
    },
  };
}
