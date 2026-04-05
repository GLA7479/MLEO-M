import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  claimOv2Seat,
  hostStartOv2Room,
  joinOv2Room,
  releaseOv2Seat,
} from "../../../lib/online-v2/room-api/ov2SharedRoomsApi";
import {
  fetchOv2LudoAuthoritativeSnapshot,
  requestOv2LudoOpenSession,
} from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { openOv2BingoSession, OV2_BINGO_PRODUCT_GAME_ID } from "../../../lib/online-v2/bingo/ov2BingoSessionAdapter";
import { openOv2Rummy51Session, OV2_RUMMY51_PRODUCT_GAME_ID } from "../../../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";
import {
  commitOv2RoomStake,
  fetchOv2RoomById,
  fetchOv2RoomMembers,
  leaveOv2RoomWithForfeitRetry,
  setOv2MemberReady,
  startOv2RoomIntent,
} from "../../../lib/online-v2/ov2RoomsApi";
import {
  clearOv2SharedLastRoomSessionKey,
  isOv2ActiveSharedProductId,
} from "../../../lib/online-v2/onlineV2GameRegistry";
import { buildOnlineV2EconomyEventKey, clampSuggestedOnlineV2Stake } from "../../../lib/online-v2/ov2Economy";
import { debitOnlineV2Vault, peekOnlineV2Vault, readOnlineV2Vault } from "../../../lib/online-v2/onlineV2VaultBridge";
import {
  formatSeatedStakeBlockers,
  seatedPlayersNotStakeCommitted,
} from "../../../lib/online-v2/shared-rooms/ov2SharedRoomStakeFromLedger";
import { useOv2SharedRoom } from "../../../hooks/useOv2SharedRoom";
import { ov2QuickMatchAutoStartDeadline } from "../../../lib/online-v2/room-api/ov2QuickMatchApi";
import { isOv2QuickMatchRoom, parseOv2QuickMatchLobbyDeadlineIso } from "../../../lib/online-v2/shared-rooms/ov2QuickMatchUi";
import Ov2SharedSeatGrid from "./Ov2SharedSeatGrid";

function ov2StakeDebitLocalKey(roomId, matchSeq, participantKey) {
  return `ov2_stake_debit_v1:${roomId}:${matchSeq}:${participantKey}`;
}

function fmtStake(n) {
  return Math.floor(Number(n) || 0).toLocaleString();
}

function lifecyclePhase(canon) {
  return String(canon?.lifecycle_phase || "").trim();
}

export default function Ov2SharedRoomScreen({
  roomId,
  participantId,
  displayName,
  gameTitleById,
  onExitRoom,
}) {
  const router = useRouter();
  const { room, members, me, isHost, loading, error, isEjected, reload, lastLoadedAt } = useOv2SharedRoom({
    roomId,
    participantKey: participantId,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [runtimeHandoff, setRuntimeHandoff] = useState(null);
  const [autoExitPending, setAutoExitPending] = useState(false);
  const [launchingLive, setLaunchingLive] = useState(false);
  const didRouteToLiveRef = useRef(false);
  const leaveInFlightRef = useRef(false);
  const autoJoinPublicAttemptedRef = useRef(false);
  const [ledgerMembers, setLedgerMembers] = useState([]);
  const [canonicalRoom, setCanonicalRoom] = useState(null);
  const [ledgerErr, setLedgerErr] = useState("");
  /** Bingo non-host live handoff: reset only on explicit Refresh (not silent room polls). */
  const [bingoHandoffResetTick, setBingoHandoffResetTick] = useState(0);
  const [bingoHandoffTimedOut, setBingoHandoffTimedOut] = useState(false);
  const bingoHandoffWaitStartRef = useRef(null);
  const qmHostIntentTriedRef = useRef(false);
  const qmLiveOpenDoneRef = useRef(false);
  const [qmNowMs, setQmNowMs] = useState(() => Date.now());

  const refreshSharedEconomySnapshot = useCallback(async () => {
    if (!roomId) return { ledger: [], canon: null };
    try {
      setLedgerErr("");
      const [ledger, canon] = await Promise.all([fetchOv2RoomMembers(roomId), fetchOv2RoomById(roomId)]);
      const rows = ledger || [];
      setLedgerMembers(rows);
      setCanonicalRoom(canon);
      return { ledger: rows, canon };
    } catch (e) {
      setLedgerErr(e?.message || String(e));
      return { ledger: [], canon: null };
    }
  }, [roomId]);

  const joinedCount = useMemo(() => members.length, [members]);
  const isQmRoom = useMemo(() => isOv2QuickMatchRoom(room), [room]);
  const qmLobbyDeadlineIso = useMemo(() => parseOv2QuickMatchLobbyDeadlineIso(room), [room]);
  const isLudoRoom = room?.product_game_id === "ov2_ludo";
  const isRummy51Room = String(room?.product_game_id || "").trim() === OV2_RUMMY51_PRODUCT_GAME_ID;
  const isBingoRoom = String(room?.product_game_id || "").trim() === OV2_BINGO_PRODUCT_GAME_ID;
  const isStakeSharedRoom = isRummy51Room || isLudoRoom || isBingoRoom;
  const liveRuntimeId = room?.active_runtime_id || room?.active_session_id || null;

  const ledgerByParticipant = useMemo(() => {
    const m = new Map();
    for (const row of ledgerMembers) {
      const pk = String(row?.participant_key || "").trim();
      if (pk) m.set(pk, row);
    }
    return m;
  }, [ledgerMembers]);

  const seatedStakeBlockersPreview = useMemo(() => seatedPlayersNotStakeCommitted(ledgerMembers), [ledgerMembers]);

  const sharedLedgerSynced = useMemo(() => {
    if (!isStakeSharedRoom || ledgerErr) return false;
    if (!members.length) return true;
    return ledgerMembers.length >= members.length;
  }, [isStakeSharedRoom, ledgerErr, members.length, ledgerMembers.length]);

  useEffect(() => {
    if (!roomId || !isStakeSharedRoom) return;
    void refreshSharedEconomySnapshot();
  }, [roomId, isStakeSharedRoom, lastLoadedAt, refreshSharedEconomySnapshot]);

  useEffect(() => {
    autoJoinPublicAttemptedRef.current = false;
  }, [roomId]);

  useEffect(() => {
    qmHostIntentTriedRef.current = false;
    qmLiveOpenDoneRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (loading || !roomId || !room) return;
    if (me) return;
    if (String(room.visibility_mode || "").toLowerCase() !== "public") return;
    if (String(room.status || "").toUpperCase() !== "OPEN") return;
    const dn = String(displayName || "").trim();
    const pk = String(participantId || "").trim();
    if (!dn || !pk) return;
    if (autoJoinPublicAttemptedRef.current) return;
    autoJoinPublicAttemptedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await joinOv2Room({
          room_id: roomId,
          participant_key: pk,
          display_name: dn,
          password_plaintext: null,
        });
        if (!cancelled) await reload();
      } catch (e) {
        if (!cancelled) {
          autoJoinPublicAttemptedRef.current = false;
          setMsg(e?.message || String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, room, me, roomId, participantId, displayName, reload]);

  const sharedStatusUpper = useMemo(() => String(room?.status || "").toUpperCase(), [room?.status]);
  const canonicalStatusUpper = useMemo(() => String(canonicalRoom?.status || "").toUpperCase(), [canonicalRoom?.status]);

  const onHeaderRefreshClick = useCallback(() => {
    if (isBingoRoom && sharedStatusUpper === "IN_GAME" && !launchingLive) {
      setBingoHandoffResetTick(t => t + 1);
    }
    void reload();
  }, [isBingoRoom, sharedStatusUpper, launchingLive, reload]);

  useEffect(() => {
    if (!isBingoRoom || sharedStatusUpper !== "IN_GAME" || launchingLive) {
      bingoHandoffWaitStartRef.current = null;
      setBingoHandoffTimedOut(false);
      return undefined;
    }
    bingoHandoffWaitStartRef.current = Date.now();
    setBingoHandoffTimedOut(false);
    const budgetMs = 55000;
    const id = window.setInterval(() => {
      if (didRouteToLiveRef.current) return;
      const t0 = bingoHandoffWaitStartRef.current;
      if (t0 != null && Date.now() - t0 >= budgetMs) {
        setBingoHandoffTimedOut(true);
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [isBingoRoom, sharedStatusUpper, launchingLive, roomId, bingoHandoffResetTick]);

  const sharedPreStartStrict = useMemo(
    () =>
      isStakeSharedRoom &&
      sharedStatusUpper === "OPEN" &&
      canonicalStatusUpper === "OPEN" &&
      Boolean(canonicalRoom),
    [isStakeSharedRoom, sharedStatusUpper, canonicalStatusUpper, canonicalRoom]
  );

  const myPk = String(participantId || "").trim();
  const myWalletCommitted = useMemo(() => {
    const row = myPk ? ledgerByParticipant.get(myPk) : null;
    return String(row?.wallet_state || "").trim() === "committed";
  }, [ledgerByParticipant, myPk]);

  const phaseOpen = useMemo(() => {
    const p = lifecyclePhase(canonicalRoom);
    return p === "pending_start" || p === "pending_stakes";
  }, [canonicalRoom]);

  useEffect(() => {
    if (!qmLobbyDeadlineIso || sharedStatusUpper !== "OPEN" || !isQmRoom) return undefined;
    const id = window.setInterval(() => setQmNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [qmLobbyDeadlineIso, sharedStatusUpper, isQmRoom]);

  const qmSecondsLeft = useMemo(() => {
    if (!qmLobbyDeadlineIso) return null;
    const t = Date.parse(qmLobbyDeadlineIso);
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.ceil((t - qmNowMs) / 1000));
  }, [qmLobbyDeadlineIso, qmNowMs]);

  useEffect(() => {
    if (!roomId || !isQmRoom) return undefined;
    if (sharedStatusUpper !== "OPEN") return undefined;
    if (canonicalStatusUpper === "IN_GAME") return undefined;
    const run = async () => {
      try {
        const r = await ov2QuickMatchAutoStartDeadline({ room_id: roomId });
        const code = String(r?.code || "");
        if (code === "CANCELLED") {
          await reload();
          setMsg("Quick match ended — not enough eligible players when the timer finished.");
          return;
        }
        if (r?.ok === true && code === "STARTED") {
          await reload();
          await refreshSharedEconomySnapshot();
        }
        if (code === "HOST_START_FAILED" || code === "START_INTENT_FAILED") {
          await reload();
          setMsg(String(r?.message || "Quick match could not start."));
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    const id = window.setInterval(() => void run(), 2000);
    return () => window.clearInterval(id);
  }, [roomId, isQmRoom, sharedStatusUpper, canonicalStatusUpper, reload, refreshSharedEconomySnapshot]);

  useEffect(() => {
    if (!roomId || !isQmRoom || !isHost || !myPk) return;
    if (lifecyclePhase(canonicalRoom) !== "lobby") return;
    const minP = Math.max(2, Math.floor(Number(room?.min_players) || 2));
    const seatedN = members.filter(m => m.seat_index != null && m.seat_index !== "").length;
    if (seatedN < minP) return;
    if (qmHostIntentTriedRef.current) return;
    qmHostIntentTriedRef.current = true;
    void (async () => {
      try {
        await startOv2RoomIntent({ room_id: roomId, host_participant_key: myPk });
        await refreshSharedEconomySnapshot();
        await reload();
      } catch {
        qmHostIntentTriedRef.current = false;
      }
    })();
  }, [roomId, isQmRoom, isHost, myPk, canonicalRoom, members, room?.min_players, reload, refreshSharedEconomySnapshot]);

  useEffect(() => {
    if (sharedStatusUpper !== "IN_GAME") {
      qmLiveOpenDoneRef.current = false;
    }
  }, [sharedStatusUpper]);

  useEffect(() => {
    if (!isQmRoom || !isHost || sharedStatusUpper !== "IN_GAME") return undefined;
    if (didRouteToLiveRef.current || qmLiveOpenDoneRef.current) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        if (isLudoRoom) {
          const open = await requestOv2LudoOpenSession(roomId, participantId, {
            presenceLeaderKey: participantId,
          });
          if (cancelled || !open?.ok) return;
          qmLiveOpenDoneRef.current = true;
          didRouteToLiveRef.current = true;
          setLaunchingLive(true);
          await router.push(`/ov2-ludo?room=${encodeURIComponent(roomId)}`);
          return;
        }
        if (isBingoRoom) {
          const open = await openOv2BingoSession(roomId, participantId);
          if (cancelled || !open?.ok) return;
          qmLiveOpenDoneRef.current = true;
          didRouteToLiveRef.current = true;
          setLaunchingLive(true);
          await router.push(`/ov2-bingo?room=${encodeURIComponent(roomId)}`);
          return;
        }
        if (isRummy51Room) {
          const open = await openOv2Rummy51Session(roomId, participantId);
          if (cancelled || !open?.ok) return;
          qmLiveOpenDoneRef.current = true;
          didRouteToLiveRef.current = true;
          setLaunchingLive(true);
          await router.push(`/ov2-rummy51?room=${encodeURIComponent(roomId)}`);
        }
      } catch {
        /* retry on next snapshot */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isQmRoom,
    isHost,
    sharedStatusUpper,
    isLudoRoom,
    isBingoRoom,
    isRummy51Room,
    roomId,
    participantId,
    router,
  ]);

  useEffect(() => {
    if (sharedStatusUpper !== "IN_GAME") return;
    setMsg(m => {
      if (!m) return m;
      const lower = String(m).toLowerCase();
      if (
        lower.includes("waiting for stakes") ||
        lower.includes("only be committed while") ||
        lower.includes("waiting for seated players") ||
        lower.includes("could not open") ||
        lower.includes("not in the pre-start")
      ) {
        return "";
      }
      return m;
    });
  }, [sharedStatusUpper]);

  useEffect(() => {
    if (loading) return;
    if (!room) return;
    if (isOv2ActiveSharedProductId(room.product_game_id)) return;
    clearOv2SharedLastRoomSessionKey();
    onExitRoom();
  }, [room, loading, onExitRoom]);

  async function ensureBalanceForStake(stake) {
    await readOnlineV2Vault({ fresh: true }).catch(() => {});
    const bal = Math.floor(Number(peekOnlineV2Vault().balance) || 0);
    const need = clampSuggestedOnlineV2Stake(stake);
    if (bal < need) {
      return { ok: false, error: `Need at least ${fmtStake(need)} coins (have ${fmtStake(bal)}).` };
    }
    return { ok: true };
  }

  /**
   * Commit stake for `pk` when lifecycle is already pending_start / pending_stakes.
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  async function commitStakeForParticipant(canonRow, pk) {
    const phase = lifecyclePhase(canonRow);
    if (phase !== "pending_start" && phase !== "pending_stakes") {
      return { ok: false, error: `Cannot commit stake in lifecycle phase "${phase || "unknown"}".` };
    }
    try {
      await setOv2MemberReady({ room_id: roomId, participant_key: pk, is_ready: true });
    } catch {
      /* not in lobby */
    }
    const stake = clampSuggestedOnlineV2Stake(canonRow.stake_per_seat);
    const bal = await ensureBalanceForStake(canonRow.stake_per_seat);
    if (!bal.ok) return { ok: false, error: bal.error };
    const idem = buildOnlineV2EconomyEventKey("commit", roomId, pk, canonRow.match_seq, "v1");
    const stakeOut = await commitOv2RoomStake({
      room_id: roomId,
      participant_key: pk,
      idempotency_key: idem,
    });
    const rAfter = stakeOut?.room || canonRow;
    if (stakeOut?.room) setCanonicalRoom(stakeOut.room);
    const debitKey =
      typeof window !== "undefined" ? ov2StakeDebitLocalKey(roomId, rAfter.match_seq, pk) : null;
    const debitAlreadyDone = debitKey && window.localStorage.getItem(debitKey) === "1";
    if (!debitAlreadyDone) {
      const debit = await debitOnlineV2Vault(stake, rAfter.product_game_id);
      if (!debit?.ok) {
        await refreshSharedEconomySnapshot();
        await reload();
        return {
          ok: false,
          error:
            debit?.error ||
            "Vault debit failed after the server recorded your stake. Try again or sync your balance.",
        };
      }
      if (debitKey) window.localStorage.setItem(debitKey, "1");
    }
    return { ok: true };
  }

  /**
   * Host-only: lobby → pending stakes, host stake if needed, block until all seated players committed.
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  async function prepareSharedHostPreStartStakes() {
    if (!roomId || !myPk) return { ok: false, error: "Missing room or participant." };
    let { canon, ledger } = await refreshSharedEconomySnapshot();
    if (!canon || String(canon.status || "").toUpperCase() !== "OPEN") {
      return { ok: false, error: "Room is not in the pre-start (OPEN) state." };
    }
    try {
      await setOv2MemberReady({ room_id: roomId, participant_key: myPk, is_ready: true });
    } catch {
      /* ignore */
    }
    let phase = lifecyclePhase(canon);
    if (phase === "lobby") {
      await startOv2RoomIntent({ room_id: roomId, host_participant_key: myPk });
    }
    const snap = await refreshSharedEconomySnapshot();
    canon = snap.canon;
    ledger = snap.ledger;
    if (!canon) {
      return { ok: false, error: "Could not refresh room after starting stake round." };
    }
    phase = lifecyclePhase(canon);
    const hostRow = ledger.find(m => String(m.participant_key || "").trim() === myPk);
    const hostWs = String(hostRow?.wallet_state || "").trim();
    if (hostWs !== "committed" && (phase === "pending_start" || phase === "pending_stakes")) {
      const cr = await commitStakeForParticipant(canon, myPk);
      if (!cr.ok) return { ok: false, error: cr.error };
      const again = await refreshSharedEconomySnapshot();
      canon = again.canon;
      ledger = again.ledger;
    }
    const blockers = seatedPlayersNotStakeCommitted(ledger);
    if (blockers.length) {
      return {
        ok: false,
        error: `Waiting for seated players to join (stake): ${formatSeatedStakeBlockers(blockers)}`,
      };
    }
    return { ok: true };
  }

  async function onNonHostJoinMatchStake() {
    if (!roomId || !myPk || (isHost && !isQmRoom)) return;
    setBusy(true);
    setMsg("");
    try {
      const { canon } = await refreshSharedEconomySnapshot();
      if (!canon || String(canon.status || "").toUpperCase() !== "OPEN") {
        setMsg("Room is not open for stake join.");
        return;
      }
      const phase = lifecyclePhase(canon);
      if (phase === "lobby") {
        return;
      }
      if (phase !== "pending_start" && phase !== "pending_stakes") {
        setMsg(`Cannot join stake in phase "${phase || "unknown"}".`);
        return;
      }
      const r = await commitStakeForParticipant(canon, myPk);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      await refreshSharedEconomySnapshot();
      await reload();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onHostStartMatch() {
    if (!roomId || !myPk || !isHost) return;
    setBusy(true);
    setMsg("");
    try {
      const prep = await prepareSharedHostPreStartStakes();
      if (!prep.ok) {
        setMsg(prep.error);
        return;
      }

      const out = await hostStartOv2Room({
        room_id: roomId,
        host_participant_key: myPk,
      });
      setRuntimeHandoff(out.runtime_handoff || null);
      await reload();

      await refreshSharedEconomySnapshot();

      const open = await openOv2Rummy51Session(roomId, myPk);
      if (!open?.ok) {
        setMsg(open?.error || "Could not open Rummy 51 session.");
        return;
      }
      didRouteToLiveRef.current = true;
      setLaunchingLive(true);
      await router.push(`/ov2-rummy51?room=${encodeURIComponent(roomId)}`);
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onClaimSeat(seatIndex) {
    setBusy(true);
    setMsg("");
    try {
      await claimOv2Seat({ room_id: roomId, participant_key: participantId, seat_index: seatIndex });
      await reload();
      if (isStakeSharedRoom) {
        try {
          await setOv2MemberReady({ room_id: roomId, participant_key: participantId, is_ready: true });
        } catch {
          /* lobby-only */
        }
        await refreshSharedEconomySnapshot();
      }
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReleaseSeat() {
    setBusy(true);
    setMsg("");
    try {
      await releaseOv2Seat({ room_id: roomId, participant_key: participantId });
      await reload();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    if (leaveInFlightRef.current) return;
    leaveInFlightRef.current = true;
    setBusy(true);
    setMsg("");
    try {
      const canon = canonicalRoom || (await fetchOv2RoomById(roomId).catch(() => null));
      await leaveOv2RoomWithForfeitRetry({
        room: canon || room,
        room_id: roomId,
        participant_key: participantId,
      });
      onExitRoom();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      leaveInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onHostStart() {
    if (isRummy51Room) return;
    setBusy(true);
    setMsg("");
    try {
      if (isLudoRoom || isBingoRoom) {
        const prep = await prepareSharedHostPreStartStakes();
        if (!prep.ok) {
          setMsg(prep.error);
          return;
        }
      }
      const out = await hostStartOv2Room({
        room_id: roomId,
        host_participant_key: participantId,
      });
      setRuntimeHandoff(out.runtime_handoff || null);
      if (isLudoRoom) {
        const open = await requestOv2LudoOpenSession(roomId, participantId, {
          presenceLeaderKey: participantId,
        });
        if (!open?.ok) {
          setMsg(open?.error || "Could not open Ludo session.");
          return;
        }
        didRouteToLiveRef.current = true;
        setLaunchingLive(true);
        await router.push(`/ov2-ludo?room=${encodeURIComponent(roomId)}`);
        return;
      }
      if (isBingoRoom) {
        const open = await openOv2BingoSession(roomId, participantId);
        if (!open?.ok) {
          setMsg(open?.error || "Could not open Bingo session.");
          return;
        }
        didRouteToLiveRef.current = true;
        setLaunchingLive(true);
        await router.push(`/ov2-bingo?room=${encodeURIComponent(roomId)}`);
        return;
      }
      await reload();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!isEjected) {
      setAutoExitPending(false);
      return;
    }
    setAutoExitPending(true);
    const t = setTimeout(() => {
      onExitRoom();
    }, 900);
    return () => clearTimeout(t);
  }, [isEjected, onExitRoom]);

  useEffect(() => {
    if (didRouteToLiveRef.current) return;
    if (room?.status !== "IN_GAME") return;

    if (isRummy51Room) {
      let cancelled = false;
      let intervalId = null;
      const tick = async () => {
        try {
          const canon = await fetchOv2RoomById(roomId);
          if (cancelled || didRouteToLiveRef.current) return;
          if (canon?.active_session_id) {
            if (intervalId) clearInterval(intervalId);
            didRouteToLiveRef.current = true;
            setLaunchingLive(true);
            void router.push(`/ov2-rummy51?room=${encodeURIComponent(roomId)}`);
          }
        } catch {
          // ignore
        }
      };
      void tick();
      intervalId = setInterval(() => void tick(), 2500);
      return () => {
        cancelled = true;
        if (intervalId) clearInterval(intervalId);
      };
    }

    if (isBingoRoom) {
      let cancelled = false;
      let intervalId = null;
      const tick = async () => {
        try {
          const canon = await fetchOv2RoomById(roomId);
          if (cancelled || didRouteToLiveRef.current) return;
          if (canon?.active_session_id) {
            if (intervalId) clearInterval(intervalId);
            didRouteToLiveRef.current = true;
            setLaunchingLive(true);
            void router.push(`/ov2-bingo?room=${encodeURIComponent(roomId)}`);
          }
        } catch {
          // ignore
        }
      };
      void tick();
      intervalId = setInterval(() => void tick(), 2500);
      return () => {
        cancelled = true;
        if (intervalId) clearInterval(intervalId);
      };
    }

    if (!liveRuntimeId) return;
    if (isLudoRoom) {
      const ludoSid = room?.active_session_id || null;
      if (ludoSid) {
        didRouteToLiveRef.current = true;
        setLaunchingLive(true);
        void router.push(`/ov2-ludo?room=${encodeURIComponent(roomId)}`);
        return;
      }
      let cancelled = false;
      void fetchOv2LudoAuthoritativeSnapshot(roomId, { participantKey: participantId }).then(snap => {
        if (cancelled || didRouteToLiveRef.current) return;
        const ph = snap ? String(snap.phase || "").toLowerCase() : "";
        if (ph === "playing" || ph === "finished") {
          didRouteToLiveRef.current = true;
          setLaunchingLive(true);
          void router.push(`/ov2-ludo?room=${encodeURIComponent(roomId)}`);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [
    isLudoRoom,
    isRummy51Room,
    isBingoRoom,
    room?.status,
    room?.active_session_id,
    liveRuntimeId,
    roomId,
    participantId,
    router,
    lastLoadedAt,
  ]);

  if (isEjected || autoExitPending) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4">
        <div className="text-sm font-bold text-red-100">Room is closed</div>
        <p className="mt-1 text-xs text-red-200">This room is no longer active. Returning to the lobby...</p>
      </div>
    );
  }

  const sharedSeated = me?.seat_index != null && me?.seat_index !== "";
  const showNonHostJoinBtn =
    isStakeSharedRoom &&
    sharedPreStartStrict &&
    (!isHost || isQmRoom) &&
    sharedSeated &&
    !myWalletCommitted &&
    phaseOpen &&
    sharedLedgerSynced &&
    !ledgerErr;

  const showNonHostWaitingLobby =
    isStakeSharedRoom &&
    sharedPreStartStrict &&
    (!isHost || isQmRoom) &&
    sharedSeated &&
    !myWalletCommitted &&
    !phaseOpen &&
    sharedLedgerSynced;

  const showHostStartBtn =
    isStakeSharedRoom &&
    sharedPreStartStrict &&
    isHost &&
    sharedSeated &&
    sharedLedgerSynced &&
    !ledgerErr &&
    !isQmRoom;

  const sharedSecondFooterSlot =
    isStakeSharedRoom && sharedStatusUpper === "OPEN" ? (
      !sharedSeated ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-600/50 bg-zinc-900/40 py-2 text-[10px] font-medium text-zinc-500">
          Pick a seat
        </div>
      ) : showNonHostJoinBtn ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onNonHostJoinMatchStake()}
          className="flex-1 rounded-lg border border-violet-500/45 bg-violet-900/40 py-2 text-xs font-bold text-violet-100 disabled:opacity-45"
        >
          {busy ? "Working…" : isHost && isQmRoom ? "Commit stake" : "Join match (stake)"}
        </button>
      ) : isStakeSharedRoom &&
        sharedPreStartStrict &&
        sharedSeated &&
        myWalletCommitted &&
        (!isHost || isQmRoom) ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/25 py-2 text-[10px] font-medium text-emerald-200/90">
          Stake committed — waiting
        </div>
      ) : isHost ? (
        <button
          type="button"
          disabled={busy || !showHostStartBtn}
          title={!sharedLedgerSynced || ledgerErr ? "Syncing room state…" : undefined}
          onClick={() => void (isRummy51Room ? onHostStartMatch() : onHostStart())}
          className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-100 disabled:opacity-45"
        >
          {busy ? "Working…" : "Start match"}
        </button>
      ) : myWalletCommitted ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/25 py-2 text-[10px] font-medium text-emerald-200/90">
          Stake committed — waiting
        </div>
      ) : showNonHostWaitingLobby ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-600/50 bg-zinc-900/40 px-2 py-2 text-center text-[10px] font-medium text-zinc-400">
          {isQmRoom ? "Waiting for automatic game start…" : "Waiting for host to start match"}
        </div>
      ) : !sharedLedgerSynced || ledgerErr ? (
        <div
          className="flex flex-1 items-center justify-center rounded-lg border border-zinc-600/50 bg-zinc-900/40 px-2 py-2 text-center text-[10px] font-medium text-zinc-400"
          title={ledgerErr ? String(ledgerErr) : "Syncing stake state with server…"}
        >
          {ledgerErr ? "Room sync issue — tap Refresh above" : "Syncing room…"}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-600/50 bg-zinc-900/40 py-2 text-[10px] font-medium text-zinc-500">
          Loading…
        </div>
      )
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={onExitRoom}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onHeaderRefreshClick()}
          className="rounded border border-white/20 px-2 py-1 text-[11px] text-zinc-300"
        >
          Refresh
        </button>
      </div>

      <div className="shrink-0 rounded-xl border border-white/10 bg-black/25 p-3">
        <div className="text-base font-bold text-white">{room?.title || "Room"}</div>
        <div className="text-xs text-zinc-400">
          {gameTitleById[room?.product_game_id] || "Game"} • {room?.visibility_mode} • {joinedCount} players
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {room?.min_players}-{room?.max_players} players • status {room?.status}
          {room?.requires_password ? " • password" : ""}
        </div>
        {room?.join_code && !isQmRoom ? (
          <div className="mt-1 text-[11px] text-zinc-300">Code: {room.join_code}</div>
        ) : null}
        {isQmRoom && sharedStatusUpper === "OPEN" ? (
          <div className="mt-2 rounded-lg border border-amber-500/35 bg-amber-950/25 px-2 py-1.5 text-[11px] text-amber-100/95">
            Quick Match — the game starts automatically
            {qmSecondsLeft != null ? ` in ~${qmSecondsLeft}s` : ""}. Claim a seat and commit your stake before the timer
            ends.
          </div>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-xl border border-white/10 bg-black/20 p-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="mb-2 text-xs font-semibold text-zinc-400">Players</div>
        <ul className="space-y-1.5">
          {members.map(m => {
            const pk = String(m.participant_key || "").trim();
            const ledgerRow = pk ? ledgerByParticipant.get(pk) : null;
            const ws = ledgerRow ? String(ledgerRow.wallet_state ?? "").trim() : "";
            const stakeLabel =
              isStakeSharedRoom && m.seat_index != null
                ? ws === "committed"
                  ? "stake committed"
                  : ws
                    ? `stake: ${ws}`
                    : "stake: …"
                : null;
            return (
              <li key={m.id} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100">
                <span>
                  {m.display_name || "Player"}
                  {m.id === room?.host_member_id ? " • host" : ""}
                  {m.participant_key === participantId ? " • you" : ""}
                  {m.seat_index != null ? ` • seat ${Number(m.seat_index) + 1}` : ""}
                </span>
                {stakeLabel ? (
                  <span
                    className={`ml-1 ${ws === "committed" ? "text-emerald-400/95" : "text-amber-200/90"}`}
                  >{` • ${stakeLabel}`}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {isStakeSharedRoom && ledgerErr ? (
          <p className="mt-2 text-[11px] text-red-300">Room sync: {ledgerErr}</p>
        ) : null}

        {room ? (
          <div className="mt-3">
            <Ov2SharedSeatGrid
              room={room}
              members={members}
              participantId={participantId}
              busy={busy}
              onClaimSeat={onClaimSeat}
              onReleaseSeat={onReleaseSeat}
            />
          </div>
        ) : null}

        {isStakeSharedRoom && sharedStatusUpper === "IN_GAME" && seatedStakeBlockersPreview.length ? (
          <div className="mt-3 rounded-xl border border-rose-500/35 bg-rose-950/25 p-3 text-[11px] text-rose-100">
            <p className="font-semibold text-rose-50">Stake state incomplete</p>
            <p className="mt-1 text-rose-200/90">{formatSeatedStakeBlockers(seatedStakeBlockersPreview)}</p>
          </div>
        ) : null}

        {runtimeHandoff && !isRummy51Room ? (
          !isLudoRoom && !isBingoRoom ? (
            <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-950/25 p-3 text-xs text-sky-100">
              <div className="font-bold">Runtime handoff ready</div>
              <div className="mt-1">Runtime ID: {runtimeHandoff.active_runtime_id}</div>
              <div>Policy: {runtimeHandoff.economy_entry_policy}</div>
              <div className="mt-1 text-sky-200/80">Runtime migration is pending in a later phase.</div>
            </div>
          ) : null
        ) : null}
        {sharedStatusUpper === "IN_GAME" && (isRummy51Room || isBingoRoom) && !launchingLive ? (
          <div className="mt-3 rounded-xl border border-teal-500/35 bg-teal-950/20 p-3 text-[11px] text-teal-100">
            <p className="font-semibold text-teal-50">Match starting</p>
            <p className="mt-1 text-teal-200/90">
              Heading to the live table when the session is ready. If nothing happens, use Refresh or wait a few seconds.
            </p>
            {isBingoRoom && bingoHandoffTimedOut ? (
              <div className="mt-2 space-y-2 border-t border-teal-500/25 pt-2 text-[10px] text-amber-100/95">
                <p>Live Bingo is taking longer than expected — the table may still be opening.</p>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onHeaderRefreshClick()}
                    className="rounded-md border border-teal-400/50 bg-teal-900/35 px-2 py-1.5 font-semibold text-teal-50 disabled:opacity-45"
                  >
                    Refresh and retry wait
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void router.push(`/ov2-bingo?room=${encodeURIComponent(roomId)}`)}
                    className="rounded-md border border-sky-400/50 bg-sky-900/35 px-2 py-1.5 font-semibold text-sky-50 disabled:opacity-45"
                  >
                    Open live Bingo
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onExitRoom}
                    className="rounded-md border border-white/20 bg-white/10 px-2 py-1.5 font-semibold text-zinc-100 disabled:opacity-45"
                  >
                    Back to lobby
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onLeave()}
          className="flex-1 rounded-lg border border-red-500/30 bg-red-950/30 py-2 text-xs font-semibold text-red-100 disabled:opacity-45"
        >
          Leave room
        </button>
        {sharedStatusUpper === "OPEN" && isStakeSharedRoom ? (
          sharedSecondFooterSlot
        ) : sharedStatusUpper === "OPEN" ? (
          <button
            type="button"
            disabled={busy || !isHost}
            onClick={() => void onHostStart()}
            className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-100 disabled:opacity-45"
          >
            Start
          </button>
        ) : sharedStatusUpper === "IN_GAME" && isStakeSharedRoom ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-600/50 bg-zinc-900/40 px-2 py-2 text-center text-[10px] font-medium text-zinc-400">
            {launchingLive ? (
              "Opening…"
            ) : isBingoRoom && bingoHandoffTimedOut ? (
              <span>Session delayed — use Refresh or actions above</span>
            ) : (
              "Waiting for live session…"
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled
            className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-100 opacity-45"
          >
            Start
          </button>
        )}
      </div>

      <div className="shrink-0 space-y-0.5">
        {loading ? <p className="text-[11px] text-zinc-500">Loading room...</p> : null}
        {launchingLive ? (
          <p className="text-[11px] text-sky-300">
            {isRummy51Room ? "Opening live Rummy 51 game..." : isBingoRoom ? "Opening live Bingo..." : "Opening live Ludo game..."}
          </p>
        ) : null}
        {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
        {msg ? <p className="text-[11px] text-amber-200">{msg}</p> : null}
        {displayName ? null : <p className="text-[11px] text-zinc-500">Set your display name to continue.</p>}
        {me ? null : <p className="text-[11px] text-zinc-500">You are not currently joined in this room.</p>}
      </div>
    </div>
  );
}
