import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatOv2QuickMatchStakeShortLabel,
  OV2_QUICK_MATCH_STAKE_OPTIONS,
} from "../../../lib/online-v2/shared-rooms/ov2QuickMatchStakes";
import {
  ov2QuickMatchConfirm,
  ov2QuickMatchDecline,
  ov2QuickMatchEnqueue,
  ov2QuickMatchJoinInvitedRoom,
  ov2QuickMatchLeaveQueue,
  ov2QuickMatchTick,
  Ov2QuickMatchRpcError,
} from "../../../lib/online-v2/room-api/ov2QuickMatchApi";

const POLL_MS = 2000;

/**
 * @param {{
 *   games: { id: string, title: string }[],
 *   selectedGameId: string | null,
 *   participantId: string,
 *   displayName: string,
 *   busy: boolean,
 *   setBusy: (v: boolean) => void,
 *   setMsg: (s: string) => void,
 *   onEnterRoom: (roomId: string) => void,
 * }} props
 */
export default function Ov2SharedQuickMatchBar({
  games,
  selectedGameId,
  participantId,
  displayName,
  busy,
  setBusy,
  setMsg,
  onEnterRoom,
}) {
  const [open, setOpen] = useState(false);
  const [selectedPresetUnits, setSelectedPresetUnits] = useState(1000);
  const [flowStakeUnits, setFlowStakeUnits] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [offerId, setOfferId] = useState(null);
  const [peers, setPeers] = useState([]);
  const [confirmDeadline, setConfirmDeadline] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const pollActiveRef = useRef(false);
  const joiningRef = useRef(false);

  const gameId = useMemo(() => {
    if (selectedGameId && games.some(g => g.id === selectedGameId)) return selectedGameId;
    return null;
  }, [games, selectedGameId]);

  const stakeLabelForDisplay = useMemo(() => {
    const u = flowStakeUnits != null ? flowStakeUnits : selectedPresetUnits;
    return formatOv2QuickMatchStakeShortLabel(u);
  }, [flowStakeUnits, selectedPresetUnits]);

  const applyTickPayload = useCallback(
    async out => {
      const pk = String(participantId || "").trim();
      const ph = String(out?.phase || "idle");
      if (out?.stake_per_seat != null && out.stake_per_seat !== "") {
        const n = Number(out.stake_per_seat);
        if (Number.isFinite(n)) setFlowStakeUnits(Math.floor(n));
      }
      setPhase(ph);
      if (ph === "confirm") {
        setOfferId(typeof out.offer_id === "string" ? out.offer_id : null);
        setConfirmDeadline(typeof out.confirm_deadline_at === "string" ? out.confirm_deadline_at : null);
        setPeers(Array.isArray(out.peers) ? out.peers : []);
      } else {
        setOfferId(null);
        setConfirmDeadline(null);
        setPeers([]);
      }
      if (ph === "join_room" && out.room_id && !joiningRef.current) {
        joiningRef.current = true;
        setBusy(true);
        try {
          await ov2QuickMatchJoinInvitedRoom({
            room_id: String(out.room_id),
            participant_key: pk,
            display_name: displayName.trim() || "Player",
          });
          setOpen(false);
          pollActiveRef.current = false;
          setFlowStakeUnits(null);
          onEnterRoom(String(out.room_id));
        } catch (e) {
          setMsg(e?.message || String(e));
        } finally {
          setBusy(false);
          joiningRef.current = false;
        }
      }
    },
    [participantId, displayName, onEnterRoom, setBusy, setMsg]
  );

  const refreshTick = useCallback(async () => {
    const pk = String(participantId || "").trim();
    if (!pk) return;
    try {
      const out = await ov2QuickMatchTick({ participant_key: pk, room_id: null });
      await applyTickPayload(out);
    } catch (e) {
      const msg = e instanceof Ov2QuickMatchRpcError ? e.message : e?.message || String(e);
      setMsg(msg);
    }
  }, [participantId, applyTickPayload, setMsg]);

  useEffect(() => {
    if (!open || !pollActiveRef.current) return undefined;
    const id = window.setInterval(() => void refreshTick(), POLL_MS);
    return () => window.clearInterval(id);
  }, [open, refreshTick]);

  useEffect(() => {
    if (phase !== "confirm" || !confirmDeadline) return undefined;
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [phase, confirmDeadline]);

  const confirmSecondsLeft = useMemo(() => {
    if (!confirmDeadline) return null;
    const t = Date.parse(confirmDeadline);
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.ceil((t - nowTick) / 1000));
  }, [confirmDeadline, nowTick]);

  async function startQuickMatch() {
    if (!displayName.trim()) {
      setMsg("Set a display name first.");
      return;
    }
    if (!gameId) {
      setMsg("Pick a game tab first (Ludo, Rummy 51, or Bingo). Quick Match needs an exact game.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      pollActiveRef.current = true;
      setFlowStakeUnits(selectedPresetUnits);
      setOpen(true);
      const first = await ov2QuickMatchEnqueue({
        participant_key: participantId,
        display_name: displayName,
        product_game_id: gameId,
        stake_per_seat: selectedPresetUnits,
        preferred_max_players: null,
      });
      await applyTickPayload(first);
    } catch (e) {
      pollActiveRef.current = false;
      setOpen(false);
      setFlowStakeUnits(null);
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelFlow() {
    setBusy(true);
    setMsg("");
    try {
      pollActiveRef.current = false;
      await ov2QuickMatchLeaveQueue({ participant_key: participantId });
      setPhase("idle");
      setOfferId(null);
      setFlowStakeUnits(null);
      setOpen(false);
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmMatch() {
    if (!offerId) return;
    setBusy(true);
    setMsg("");
    try {
      await ov2QuickMatchConfirm({ offer_id: offerId, participant_key: participantId });
      await refreshTick();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDeclineMatch() {
    if (!offerId) return;
    setBusy(true);
    setMsg("");
    try {
      await ov2QuickMatchDecline({ offer_id: offerId, participant_key: participantId });
      setPhase("idle");
      setOfferId(null);
      await refreshTick();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3">
      <div className="text-xs font-bold text-amber-100">Quick Match / Auto Match</div>
      {!open ? (
        <div className="flex flex-col gap-2">
          {!gameId ? (
            <p className="text-[10px] text-zinc-500">
              Select <span className="text-zinc-400">Ludo</span>, <span className="text-zinc-400">Rummy 51</span>, or{" "}
              <span className="text-zinc-400">Bingo</span> above — Quick Match cannot run on &quot;All&quot;.
            </p>
          ) : null}
          <div>
            <div className="mb-1 text-[10px] font-medium text-zinc-400">Entry preset</div>
            <div className="flex flex-wrap gap-1.5">
              {OV2_QUICK_MATCH_STAKE_OPTIONS.map(opt => {
                const on = selectedPresetUnits === opt.units;
                return (
                  <button
                    key={opt.units}
                    type="button"
                    disabled={busy}
                    onClick={() => setSelectedPresetUnits(opt.units)}
                    className={`min-w-[3rem] rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      on
                        ? "border-amber-400/70 bg-amber-800/50 text-amber-50 ring-1 ring-amber-400/40"
                        : "border-white/15 bg-black/35 text-zinc-200 hover:border-white/25"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            disabled={busy || !gameId}
            onClick={() => void startQuickMatch()}
            className="w-full rounded-lg border border-amber-500/45 bg-amber-900/45 py-2 text-xs font-bold text-amber-50 disabled:opacity-50 sm:w-auto sm:self-end sm:px-4"
          >
            {busy ? "…" : `Find match (${stakeLabelForDisplay})`}
          </button>
        </div>
      ) : phase === "waiting" ? (
        <div className="space-y-2">
          <p className="text-[11px] text-amber-100/90">
            Searching for players at <span className="font-semibold text-amber-50">{stakeLabelForDisplay}</span> entry…
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancelFlow()}
            className="w-full rounded-lg border border-white/20 bg-white/10 py-2 text-xs font-semibold text-zinc-100 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : phase === "confirm" ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-amber-50">
            Match found • <span className="text-amber-200/95">{stakeLabelForDisplay}</span> entry
          </p>
          <p className="text-[10px] text-zinc-400">
            Confirm to join the table
            {confirmSecondsLeft != null ? ` • ${confirmSecondsLeft}s` : ""}
          </p>
          <ul className="max-h-24 overflow-y-auto text-[11px] text-zinc-300">
            {peers.map((p, i) => (
              <li key={i}>
                {String(p?.display_name || "Player")}
                {p?.is_you ? " (you)" : ""}
                {p?.confirmed ? " ✓" : ""}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onConfirmMatch()}
              className="flex-1 rounded-lg border border-emerald-500/45 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-50 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDeclineMatch()}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ) : phase === "join_room" ? (
        <p className="text-[11px] text-amber-100/90">
          Joining <span className="font-semibold text-amber-50">{stakeLabelForDisplay}</span> match room…
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-400">
            Connecting… <span className="text-zinc-500">({stakeLabelForDisplay})</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancelFlow()}
            className="w-full rounded-lg border border-white/20 bg-white/10 py-2 text-xs font-semibold text-zinc-100 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
