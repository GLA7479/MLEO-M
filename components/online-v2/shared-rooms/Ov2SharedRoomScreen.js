import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  claimOv2Seat,
  hostStartOv2Room,
  leaveOv2Room,
  releaseOv2Seat,
} from "../../../lib/online-v2/room-api/ov2SharedRoomsApi";
import {
  fetchOv2LudoAuthoritativeSnapshot,
  requestOv2LudoOpenSession,
} from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { openOv2Rummy51Session, OV2_RUMMY51_PRODUCT_GAME_ID } from "../../../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";
import {
  commitOv2RoomStake,
  fetchOv2RoomById,
  fetchOv2RoomMembers,
} from "../../../lib/online-v2/ov2RoomsApi";
import { buildOnlineV2EconomyEventKey, clampSuggestedOnlineV2Stake } from "../../../lib/online-v2/ov2Economy";
import { debitOnlineV2Vault, peekOnlineV2Vault, readOnlineV2Vault } from "../../../lib/online-v2/onlineV2VaultBridge";
import {
  formatSeatedStakeBlockers,
  seatedPlayersNotStakeCommitted,
} from "../../../lib/online-v2/shared-rooms/ov2SharedRoomStakeFromLedger";
import { useOv2SharedRoom } from "../../../hooks/useOv2SharedRoom";
import Ov2SharedSeatGrid from "./Ov2SharedSeatGrid";

function ov2StakeDebitLocalKey(roomId, matchSeq, participantKey) {
  return `ov2_stake_debit_v1:${roomId}:${matchSeq}:${participantKey}`;
}

function fmtStake(n) {
  return Math.floor(Number(n) || 0).toLocaleString();
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
  const [ledgerMembers, setLedgerMembers] = useState([]);
  const [canonicalRoom, setCanonicalRoom] = useState(null);
  const [ledgerErr, setLedgerErr] = useState("");

  const refreshRummyEconomySnapshot = useCallback(async () => {
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
  const isLudoRoom = room?.product_game_id === "ov2_ludo";
  const isRummy51Room = String(room?.product_game_id || "").trim() === OV2_RUMMY51_PRODUCT_GAME_ID;
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

  useEffect(() => {
    if (!roomId || !isRummy51Room) return;
    void refreshRummyEconomySnapshot();
  }, [roomId, isRummy51Room, lastLoadedAt, refreshRummyEconomySnapshot]);

  async function reloadLedgerAndSeatedStakeBlockers() {
    await reload();
    const { ledger } = await refreshRummyEconomySnapshot();
    return { ledger, blockers: seatedPlayersNotStakeCommitted(ledger) };
  }

  async function ensureBalanceForStake(stake) {
    await readOnlineV2Vault({ fresh: true }).catch(() => {});
    const bal = Math.floor(Number(peekOnlineV2Vault().balance) || 0);
    const need = clampSuggestedOnlineV2Stake(stake);
    if (bal < need) {
      setMsg(`Need at least ${fmtStake(need)} coins (have ${fmtStake(bal)}).`);
      return false;
    }
    return true;
  }

  async function onCommitStakeFromShared() {
    if (!canonicalRoom || !participantId) return;
    const stake = clampSuggestedOnlineV2Stake(canonicalRoom.stake_per_seat);
    if (!(await ensureBalanceForStake(canonicalRoom.stake_per_seat))) return;
    const idem = buildOnlineV2EconomyEventKey("commit", roomId, participantId, canonicalRoom.match_seq, "v1");
    setBusy(true);
    setMsg("");
    try {
      const stakeOut = await commitOv2RoomStake({
        room_id: roomId,
        participant_key: participantId,
        idempotency_key: idem,
      });
      const rAfter = stakeOut?.room || canonicalRoom;
      if (stakeOut?.room) setCanonicalRoom(stakeOut.room);
      const debitKey =
        typeof window !== "undefined" ? ov2StakeDebitLocalKey(roomId, rAfter.match_seq, participantId) : null;
      const debitAlreadyDone = debitKey && window.localStorage.getItem(debitKey) === "1";
      if (!debitAlreadyDone) {
        const debit = await debitOnlineV2Vault(stake, rAfter.product_game_id);
        if (!debit?.ok) {
          setMsg(
            debit?.error ||
              "Vault debit failed after the server recorded your stake. Tap Commit stake again to retry the debit, or sync your balance."
          );
          await refreshRummyEconomySnapshot();
          await reload();
          return;
        }
        if (debitKey) window.localStorage.setItem(debitKey, "1");
      }
      await refreshRummyEconomySnapshot();
      await reload();
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
    setBusy(true);
    setMsg("");
    try {
      await leaveOv2Room({ room_id: roomId, participant_key: participantId });
      onExitRoom();
    } catch (e) {
      setMsg(e?.message || String(e));
      setBusy(false);
    }
  }

  async function onOpenRummy51InGame() {
    if (!isHost) {
      setMsg("Only the host can open the match.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { blockers } = await reloadLedgerAndSeatedStakeBlockers();
      if (blockers.length) {
        setMsg(
          `Cannot open match: one or more seated players have not committed stakes on the server. ${formatSeatedStakeBlockers(blockers)}`
        );
        return;
      }
      const open = await openOv2Rummy51Session(roomId, participantId);
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

  async function onHostStart() {
    setBusy(true);
    setMsg("");
    try {
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
      if (isRummy51Room) {
        await reload();
        const { ledger } = await refreshRummyEconomySnapshot();
        const blockers = seatedPlayersNotStakeCommitted(ledger);
        if (blockers.length) {
          setMsg(
            `Cannot open match: one or more seated players have not committed stakes on the server. ${formatSeatedStakeBlockers(blockers)}`
          );
          return;
        }
        const open = await openOv2Rummy51Session(roomId, participantId);
        if (!open?.ok) {
          setMsg(open?.error || "Could not open Rummy 51 session.");
          return;
        }
        didRouteToLiveRef.current = true;
        setLaunchingLive(true);
        await router.push(`/ov2-rummy51?room=${encodeURIComponent(roomId)}`);
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

    // Rummy51: shared snapshot JSON omits `active_session_id`; only navigate once canonical `ov2_rooms` has a session.
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
          // ignore transient read errors; next tick retries
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between">
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
          onClick={() => void reload()}
          className="rounded border border-white/20 px-2 py-1 text-[11px] text-zinc-300"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
        <div className="text-base font-bold text-white">{room?.title || "Room"}</div>
        <div className="text-xs text-zinc-400">
          {gameTitleById[room?.product_game_id] || room?.product_game_id} • {room?.visibility_mode} • {joinedCount} players
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {room?.min_players}-{room?.max_players} players • status {room?.status}
          {room?.requires_password ? " • password" : ""}
        </div>
        {room?.join_code ? <div className="mt-1 text-[11px] text-zinc-300">Code: {room.join_code}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
        <div className="mb-2 text-xs font-semibold text-zinc-400">Players</div>
        <ul className="space-y-1.5">
          {members.map(m => {
            const pk = String(m.participant_key || "").trim();
            const ledgerRow = pk ? ledgerByParticipant.get(pk) : null;
            const ws = ledgerRow ? String(ledgerRow.wallet_state ?? "").trim() : "";
            const stakeLabel =
              isRummy51Room && m.seat_index != null
                ? ws === "committed"
                  ? "stake committed"
                  : ws
                    ? `stake: ${ws}`
                    : "stake: (loading…)"
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
        {isRummy51Room && ledgerErr ? <p className="mt-2 text-[11px] text-red-300">Stake sync: {ledgerErr}</p> : null}
        {isRummy51Room && seatedStakeBlockersPreview.length ? (
          <p className="mt-2 text-[11px] text-amber-200/90">
            Stakes: {formatSeatedStakeBlockers(seatedStakeBlockersPreview)} — each seated player must tap Commit stake (or use
            the room lobby) before the host can open the match.
          </p>
        ) : null}
      </div>

      {room ? (
        <Ov2SharedSeatGrid
          room={room}
          members={members}
          participantId={participantId}
          busy={busy}
          onClaimSeat={onClaimSeat}
          onReleaseSeat={onReleaseSeat}
        />
      ) : null}

      {isRummy51Room && room?.status === "IN_GAME" && canonicalRoom && me?.seat_index != null ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-[11px] text-amber-100">
          {String(ledgerByParticipant.get(String(participantId).trim())?.wallet_state || "").trim() === "committed" ? (
            <p className="text-emerald-200/90">Your stake is committed on the server.</p>
          ) : (
            <>
              <p className="font-semibold text-amber-50">Commit your stake</p>
              <p className="mt-1 text-amber-200/85">
                The shared room list does not show server stake state until this syncs. Use Commit stake here (same as the room
                lobby) so the host can open the match.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onCommitStakeFromShared()}
                className="mt-2 w-full rounded-lg border border-amber-500/45 bg-amber-900/40 py-2 text-xs font-bold text-amber-50 disabled:opacity-45"
              >
                Commit stake ({fmtStake(canonicalRoom.stake_per_seat)})
              </button>
            </>
          )}
        </div>
      ) : null}

      {runtimeHandoff && !isRummy51Room ? (
        !isLudoRoom ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/25 p-3 text-xs text-sky-100">
            <div className="font-bold">Runtime handoff ready</div>
            <div className="mt-1">Runtime ID: {runtimeHandoff.active_runtime_id}</div>
            <div>Policy: {runtimeHandoff.economy_entry_policy}</div>
            <div className="mt-1 text-sky-200/80">Runtime migration is pending in a later phase.</div>
          </div>
        ) : null
      ) : null}
      {room?.status === "IN_GAME" && isRummy51Room && !launchingLive ? (
        <div className="rounded-xl border border-teal-500/35 bg-teal-950/20 p-3 text-[11px] text-teal-100">
          {isHost ? (
            <>
              <p className="font-semibold text-teal-50">Room started — open the Rummy match</p>
              <p className="mt-1 text-teal-200/90">The table is not live until the host opens the session (authoritative RPC).</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-teal-50">Waiting for host</p>
              <p className="mt-1 text-teal-200/90">The host must open the Rummy 51 match before you can join the live table.</p>
            </>
          )}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onLeave()}
          className="flex-1 rounded-lg border border-red-500/30 bg-red-950/30 py-2 text-xs font-semibold text-red-100 disabled:opacity-45"
        >
          Leave room
        </button>
        {room?.status === "OPEN" ? (
          <button
            type="button"
            disabled={busy || !isHost}
            onClick={() => void onHostStart()}
            className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-100 disabled:opacity-45"
          >
            Start
          </button>
        ) : room?.status === "IN_GAME" && isRummy51Room ? (
          isHost ? (
            <button
              type="button"
              disabled={busy || launchingLive}
              onClick={() => void onOpenRummy51InGame()}
              className="flex-1 rounded-lg border border-teal-500/45 bg-teal-900/45 py-2 text-xs font-bold text-teal-100 disabled:opacity-45"
            >
              {busy || launchingLive ? "Opening…" : "Open match"}
            </button>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-600/50 bg-zinc-900/40 py-2 text-[10px] font-medium text-zinc-400">
              Waiting for host…
            </div>
          )
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

      {loading ? <p className="text-[11px] text-zinc-500">Loading room...</p> : null}
      {launchingLive ? (
        <p className="text-[11px] text-sky-300">
          {isRummy51Room ? "Opening live Rummy 51 game..." : "Opening live Ludo game..."}
        </p>
      ) : null}
      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
      {msg ? <p className="text-[11px] text-amber-200">{msg}</p> : null}
      {displayName ? null : <p className="text-[11px] text-zinc-500">Set your display name to continue.</p>}
      {me ? null : <p className="text-[11px] text-zinc-500">You are not currently joined in this room.</p>}
    </div>
  );
}

