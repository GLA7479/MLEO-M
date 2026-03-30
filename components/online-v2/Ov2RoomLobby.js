import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getOv2MinPlayersForProduct, ONLINE_V2_GAME_IDS, ONLINE_V2_REGISTRY } from "../../lib/online-v2/onlineV2GameRegistry";
import {
  commitOv2RoomStake,
  fetchOv2RoomById,
  fetchOv2RoomMembers,
  joinOv2Room,
  leaveOv2Room,
  setOv2MemberReady,
  startOv2RoomIntent,
} from "../../lib/online-v2/ov2RoomsApi";
import { buildOnlineV2EconomyEventKey, clampSuggestedOnlineV2Stake } from "../../lib/online-v2/ov2Economy";
import { debitOnlineV2Vault, peekOnlineV2Vault, readOnlineV2Vault } from "../../lib/online-v2/onlineV2VaultBridge";

function fmtStake(n) {
  return Math.floor(Number(n) || 0).toLocaleString();
}

function ov2StakeDebitLocalKey(roomId, matchSeq, participantKey) {
  return `ov2_stake_debit_v1:${roomId}:${matchSeq}:${participantKey}`;
}

/**
 * Room lobby: members, ready, host start, then per-seat stake commit (RPC then vault debit).
 */
export default function Ov2RoomLobby({ roomId, participantId, displayName, onBack, onRoomChanged }) {
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const gameTitle = useMemo(() => {
    if (!room?.product_game_id) return "";
    return ONLINE_V2_REGISTRY.find(g => g.id === room.product_game_id)?.title || room.product_game_id;
  }, [room?.product_game_id]);

  const minPlayers = useMemo(() => (room ? getOv2MinPlayersForProduct(room.product_game_id) : 2), [room]);

  const amMember = useMemo(
    () => Boolean(participantId && members.some(m => m.participant_key === participantId)),
    [members, participantId]
  );

  const isHost = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  const myMember = useMemo(() => members.find(m => m.participant_key === participantId) || null, [members, participantId]);

  const allReady = useMemo(() => members.length > 0 && members.every(m => m.is_ready), [members]);

  const canStart = useMemo(() => {
    if (!room || room.lifecycle_phase !== "lobby" || !isHost) return false;
    if (members.length < minPlayers) return false;
    return allReady;
  }, [room, isHost, members.length, minPlayers, allReady]);

  const canLeave = useMemo(
    () => room && (room.lifecycle_phase === "lobby" || room.lifecycle_phase === "pending_start"),
    [room]
  );

  const needsStakeCommit = useMemo(() => {
    if (!room || !amMember || !myMember) return false;
    if (myMember.wallet_state === "committed") return false;
    return room.lifecycle_phase === "pending_start" || room.lifecycle_phase === "pending_stakes";
  }, [room, amMember, myMember]);

  const load = useCallback(async () => {
    setMsg("");
    try {
      const r = await fetchOv2RoomById(roomId);
      setRoom(r);
      const m = await fetchOv2RoomMembers(roomId);
      setMembers(m);
    } catch (e) {
      setMsg(e?.message || String(e));
      setRoom(null);
      setMembers([]);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureBalance(stake) {
    await readOnlineV2Vault({ fresh: true }).catch(() => {});
    const bal = Math.floor(Number(peekOnlineV2Vault().balance) || 0);
    const need = clampSuggestedOnlineV2Stake(stake);
    if (bal < need) {
      setMsg(`Need at least ${fmtStake(need)} coins (have ${fmtStake(bal)}).`);
      return false;
    }
    return true;
  }

  async function onJoin() {
    if (!displayName.trim()) {
      setMsg("Set your display name on the Rooms screen.");
      return;
    }
    if (!room) return;
    if (!(await ensureBalance(room.stake_per_seat))) return;
    setBusy(true);
    setMsg("");
    try {
      await joinOv2Room({
        room_id: roomId,
        participant_key: participantId,
        display_name: displayName.trim(),
      });
      await load();
      onRoomChanged?.();
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
      onRoomChanged?.();
      onBack();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleReady(next) {
    if (!room || room.lifecycle_phase !== "lobby" || !myMember) return;
    if (!(await ensureBalance(room.stake_per_seat))) return;
    setBusy(true);
    setMsg("");
    try {
      await setOv2MemberReady({ room_id: roomId, participant_key: participantId, is_ready: next });
      await load();
      onRoomChanged?.();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    if (!canStart) return;
    setBusy(true);
    setMsg("");
    try {
      const updatedRoom = await startOv2RoomIntent({ room_id: roomId, host_participant_key: participantId });
      if (updatedRoom && typeof updatedRoom === "object") setRoom(updatedRoom);
      await load();
      onRoomChanged?.();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCommitStake() {
    if (!room || !myMember) return;
    if (!(await ensureBalance(room.stake_per_seat))) return;
    const stake = clampSuggestedOnlineV2Stake(room.stake_per_seat);
    const idem = buildOnlineV2EconomyEventKey("commit", roomId, participantId, room.match_seq, "v1");
    setBusy(true);
    setMsg("");
    try {
      const stakeOut = await commitOv2RoomStake({
        room_id: roomId,
        participant_key: participantId,
        idempotency_key: idem,
      });
      if (stakeOut?.room) setRoom(stakeOut.room);
      if (Array.isArray(stakeOut?.members)) setMembers(stakeOut.members);
      const debitKey =
        typeof window !== "undefined" ? ov2StakeDebitLocalKey(roomId, room.match_seq, participantId) : null;
      const debitAlreadyDone = debitKey && window.localStorage.getItem(debitKey) === "1";
      if (!debitAlreadyDone) {
        const debit = await debitOnlineV2Vault(stake, room.product_game_id);
        if (!debit?.ok) {
          setMsg(
            debit?.error ||
              "Vault debit failed after the server recorded your stake. Tap Commit again to retry the debit, or sync your balance."
          );
          await load();
          onRoomChanged?.();
          return;
        }
        if (debitKey) window.localStorage.setItem(debitKey, "1");
      }
      await load();
      onRoomChanged?.();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!room) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <button type="button" onClick={onBack} className="self-start rounded border border-white/20 px-2 py-1 text-[11px]">
          ← Back
        </button>
        <p className="text-[11px] text-zinc-500">{msg || "Loading…"}</p>
      </div>
    );
  }

  const lobbyLocked = room.lifecycle_phase !== "lobby";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onBack} className="rounded border border-white/20 px-2 py-1 text-[11px]">
          ← Back
        </button>
        <button type="button" onClick={() => void load()} className="rounded border border-white/15 px-2 py-1 text-[10px] text-zinc-400">
          Refresh
        </button>
      </div>

      <div className="shrink-0 rounded-xl border border-white/10 bg-black/30 p-3">
        <h2 className="text-base font-bold text-white">{room.title || "Table"}</h2>
        <p className="mt-1 text-[11px] text-zinc-400">
          {gameTitle} · stake {fmtStake(room.stake_per_seat)} · phase <span className="text-amber-200/90">{room.lifecycle_phase}</span>
        </p>
        {isHost ? <p className="mt-1 text-[10px] text-emerald-400">You are the host</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Members ({members.length})</div>
        <ul className="mt-2 space-y-2">
          {members.map(m => {
            const host = room.host_participant_key === m.participant_key;
            const me = m.participant_key === participantId;
            return (
              <li
                key={m.id || `${m.participant_key}`}
                className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px]"
              >
                <div>
                  <span className="font-medium text-white">{m.display_name || "Player"}</span>
                  {host ? <span className="ml-1 text-[10px] text-amber-300">host</span> : null}
                  {me ? <span className="ml-1 text-[10px] text-sky-300">you</span> : null}
                  <div className="mt-0.5 font-mono text-[9px] text-zinc-600">
                    {(m.participant_key || "").slice(0, 8)}…
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    joined {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                  </div>
                </div>
                <span className="text-right text-[10px] leading-tight text-zinc-500">
                  <span className={m.is_ready ? "text-emerald-400" : "text-zinc-500"}>{m.is_ready ? "Ready" : "Not ready"}</span>
                  <span className="text-zinc-600"> · </span>
                  <span className={m.wallet_state === "committed" ? "text-emerald-400" : "text-zinc-600"}>
                    {m.wallet_state === "committed" ? "Staked" : "Not staked"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        {!amMember && !lobbyLocked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onJoin()}
            className="rounded-lg border border-emerald-500/40 bg-emerald-900/30 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
          >
            Join room
          </button>
        ) : null}

        {amMember && !lobbyLocked ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !myMember}
              onClick={() => void onToggleReady(!myMember?.is_ready)}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {myMember?.is_ready ? "Unready" : "Ready"}
            </button>
            <button
              type="button"
              disabled={busy || !canLeave}
              title={!canLeave ? "Cannot leave after stakes are in progress." : undefined}
              onClick={() => void onLeave()}
              className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200 disabled:opacity-40"
            >
              Leave
            </button>
          </div>
        ) : null}

        {amMember && lobbyLocked ? (
          <button
            type="button"
            disabled={busy || !canLeave}
            title={!canLeave ? "Cannot leave after stakes are in progress." : undefined}
            onClick={() => void onLeave()}
            className="rounded-lg border border-red-500/30 bg-red-950/30 py-2 text-xs text-red-200 disabled:opacity-40"
          >
            Leave
          </button>
        ) : null}

        {needsStakeCommit ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCommitStake()}
            className="rounded-lg border border-emerald-500/40 bg-emerald-900/30 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
          >
            Commit stake ({fmtStake(room.stake_per_seat)})
          </button>
        ) : null}

        {isHost && room.lifecycle_phase === "lobby" ? (
          <button
            type="button"
            disabled={busy || !canStart}
            onClick={() => void onStart()}
            className="rounded-lg border border-amber-500/50 bg-amber-900/40 py-2 text-xs font-bold text-amber-100 disabled:opacity-40"
            title={
              !canStart
                ? `Need ≥${minPlayers} players, all ready (have ${members.length})`
                : "Move room to pending_start"
            }
          >
            Start match
          </button>
        ) : null}

        {room.lifecycle_phase === "pending_start" ? (
          <p className="text-center text-[11px] text-amber-200/90">Host started the match — each player must commit stake.</p>
        ) : null}
        {room.lifecycle_phase === "pending_stakes" ? (
          <p className="text-center text-[11px] text-amber-200/90">Waiting for all players to commit their stake.</p>
        ) : null}
        {room.lifecycle_phase === "active" ? (
          <p className="text-center text-[11px] text-emerald-200/85">All stakes locked — gameplay not wired yet.</p>
        ) : null}

        {room.product_game_id === ONLINE_V2_GAME_IDS.BOARD_PATH && amMember ? (
          <Link
            href={`/ov2-board-path?room=${encodeURIComponent(roomId)}`}
            className="block rounded-lg border border-teal-500/35 bg-teal-950/25 py-2 text-center text-xs font-semibold text-teal-100"
          >
            Open Board Path table
          </Link>
        ) : null}

        {msg ? (
          <div className="rounded border border-red-500/30 bg-red-950/30 px-2 py-1 text-[11px] text-red-200">{msg}</div>
        ) : null}
      </div>
    </div>
  );
}
