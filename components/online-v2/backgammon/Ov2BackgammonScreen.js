"use client";

import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { useOv2BackgammonSession } from "../../../hooks/useOv2BackgammonSession";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2BackgammonScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2BackgammonSession(contextInput ?? undefined);
  const { vm, busy, err, setErr, roll, move, requestRematch, cancelRematch, startNextMatch, isHost, roomMatchSeq } = session;
  const [selDie, setSelDie] = useState(/** @type {number|null} */ (null));
  const [selFrom, setSelFrom] = useState(/** @type {number|'bar'|null} */ (null));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");

  const room = contextInput?.room && typeof contextInput.room === "object" ? contextInput.room : null;
  const roomId = room?.id != null ? String(room.id) : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const selfKey = contextInput?.self?.participant_key?.trim() || "";

  const myBar = vm.mySeat === 0 ? vm.bar[0] : vm.mySeat === 1 ? vm.bar[1] : 0;

  const uniqueDice = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const d of vm.diceAvail) {
      if (!Number.isFinite(d) || seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out.sort((a, b) => b - a);
  }, [vm.diceAvail]);

  const resetSelection = useCallback(() => {
    setSelDie(null);
    setSelFrom(null);
  }, []);

  const onPointClick = useCallback(
    async idx => {
      if (vm.readOnly || busy) return;
      if (String(vm.phase) !== "playing") return;
      if (!vm.canClientMove && !vm.canClientRoll) return;
      if (vm.canClientRoll) return;

      if (selDie == null) {
        setErr("Pick a die value first.");
        return;
      }

      if (selFrom == null) {
        if (myBar > 0) {
          setErr("You must move from the bar first.");
          return;
        }
        const v = vm.pts[idx] || 0;
        const mine = vm.mySeat === 0 ? v > 0 : v < 0;
        if (!mine) {
          setErr("Choose one of your points.");
          return;
        }
        setSelFrom(idx);
        return;
      }

      if (selFrom === "bar") {
        const to = idx;
        await move(-1, to, selDie);
        resetSelection();
        return;
      }

      const from = selFrom;
      const to = idx;
      await move(from, to, selDie);
      resetSelection();
    },
    [vm, busy, selDie, selFrom, myBar, move, resetSelection, setErr]
  );

  const onBearOffClick = useCallback(async () => {
    if (vm.readOnly || busy || selDie == null || selFrom == null || selFrom === "bar") return;
    await move(selFrom, -1, selDie);
    resetSelection();
  }, [vm.readOnly, busy, selDie, selFrom, move, resetSelection]);

  const eligibleRematch = useMemo(
    () => members.filter(m => m?.seat_index != null && m?.seat_index !== "" && m?.wallet_state === "committed").length,
    [members]
  );
  const readyRematch = useMemo(
    () =>
      members.filter(m => {
        if (m?.seat_index == null || m?.seat_index === "" || m?.wallet_state !== "committed") return false;
        const bg = m?.meta?.bg;
        return bg?.rematch_requested === true || bg?.rematch_requested === "true";
      }).length,
    [members]
  );
  const myRow = useMemo(() => members.find(m => m?.participant_key === selfKey), [members, selfKey]);
  const myRematchRequested = Boolean(myRow?.meta?.bg?.rematch_requested);
  const isFinished = String(vm.phase).toLowerCase() === "finished";
  const didIWin = vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;
  const canHostStartNext = isHost && isFinished && eligibleRematch >= 2 && readyRematch >= eligibleRematch;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-1 text-white">
      <div className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] text-zinc-300">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span>
            You: seat {vm.mySeat != null ? vm.mySeat + 1 : "—"} · borne off {vm.mySeat === 0 ? vm.off[0] : vm.mySeat === 1 ? vm.off[1] : "—"}
            /15
          </span>
          <span className="text-zinc-500">Turn: seat {vm.turnSeat != null ? vm.turnSeat + 1 : "—"}</span>
        </div>
        {Array.isArray(vm.dice) ? (
          <div className="mt-0.5 text-zinc-400">Dice rolled: {JSON.stringify(vm.dice)}</div>
        ) : null}
      </div>

      {err ? (
        <div className="shrink-0 rounded border border-amber-500/35 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-100">
          {err}
          <button type="button" className="ml-2 underline" onClick={() => setErr("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {vm.canClientRoll ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void roll()}
            className="rounded-md border border-violet-500/45 bg-violet-950/40 px-3 py-1.5 text-xs font-bold text-violet-100 disabled:opacity-45"
          >
            {busy ? "Rolling…" : "Roll dice"}
          </button>
        ) : null}
        {vm.canClientMove && uniqueDice.length ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-zinc-500">Use die:</span>
            {uniqueDice.map(d => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelDie(d);
                  setSelFrom(null);
                }}
                className={`min-h-[36px] min-w-[36px] rounded border px-2 text-xs font-bold ${
                  selDie === d ? "border-emerald-400 bg-emerald-900/50" : "border-white/20 bg-white/10"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        ) : null}
        {vm.canClientMove && myBar > 0 && selDie != null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelFrom("bar")}
            className={`rounded border px-2 py-1 text-[10px] font-semibold ${
              selFrom === "bar" ? "border-sky-400 bg-sky-900/40" : "border-white/20 bg-white/10"
            }`}
          >
            From bar ({myBar})
          </button>
        ) : null}
        {selDie != null && selFrom != null && selFrom !== "bar" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onBearOffClick()}
            className="rounded border border-amber-500/40 bg-amber-950/30 px-2 py-1 text-[10px] font-semibold text-amber-100"
          >
            Bear off (from sel.)
          </button>
        ) : null}
        {selDie != null ? (
          <button type="button" className="text-[10px] text-zinc-500 underline" onClick={resetSelection}>
            Clear selection
          </button>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-lg border border-white/10 bg-zinc-950/50 p-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="mb-1 text-center text-[9px] text-zinc-500">
          Points 0–23 · seat 1 home 0–5 · seat 2 home 18–23 (+ = seat 1, − = seat 2)
        </div>
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
          {vm.pts.map((v, i) => {
            const label = v > 0 ? `+${v}` : v < 0 ? `${v}` : "·";
            const mine = vm.mySeat === 0 ? v > 0 : vm.mySeat === 1 ? v < 0 : false;
            const sel = selFrom === i;
            return (
              <button
                key={i}
                type="button"
                disabled={busy || vm.readOnly || String(vm.phase) !== "playing"}
                onClick={() => void onPointClick(i)}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded border px-0.5 py-1 text-[9px] font-medium ${
                  mine ? "border-emerald-500/40 bg-emerald-950/25" : "border-white/10 bg-black/20"
                } ${sel ? "ring-1 ring-sky-400" : ""}`}
              >
                <span className="text-zinc-500">{i}</span>
                <span className={v > 0 ? "text-sky-200" : v < 0 ? "text-rose-200" : "text-zinc-600"}>{label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
          <span>
            Bar: S1 {vm.bar[0]} · S2 {vm.bar[1]}
          </span>
          <span>
            Off: S1 {vm.off[0]} · S2 {vm.off[1]}
          </span>
        </div>
      </div>

      {isFinished ? (
        <div className="shrink-0 rounded-xl border border-white/15 bg-black/40 p-3">
          <p className={`text-center text-sm font-semibold ${didIWin ? "text-emerald-200" : vm.mySeat != null ? "text-rose-200" : "text-white"}`}>
            {didIWin ? "You won" : vm.mySeat != null ? "You lost" : "Match finished"}
          </p>
          {vm.winnerSeat != null ? (
            <p className="mt-1 text-center text-[11px] text-zinc-400">Winner: seat {vm.winnerSeat + 1}</p>
          ) : null}
          <div className="mt-2 flex flex-col gap-2">
            {eligibleRematch >= 2 ? (
              <p className="text-center text-[10px] text-zinc-500">
                Rematch: {readyRematch}/{eligibleRematch} ready
              </p>
            ) : null}
            {vm.mySeat != null ? (
              <button
                type="button"
                disabled={rematchBusy}
                onClick={async () => {
                  setRematchBusy(true);
                  try {
                    const r = myRematchRequested ? await cancelRematch() : await requestRematch();
                    if (!r?.ok && r?.error) setErr(r.error);
                  } finally {
                    setRematchBusy(false);
                  }
                }}
                className="w-full rounded-md border border-sky-500/40 bg-sky-950/35 py-2 text-xs font-semibold text-sky-100 disabled:opacity-45"
              >
                {rematchBusy ? "…" : myRematchRequested ? "Cancel rematch" : "Rematch"}
              </button>
            ) : null}
            {isHost ? (
              <button
                type="button"
                disabled={!canHostStartNext || startNextBusy}
                onClick={async () => {
                  const prev = room?.active_session_id != null ? String(room.active_session_id) : "";
                  setStartNextBusy(true);
                  try {
                    const r = await startNextMatch(roomMatchSeq);
                    if (r?.ok && onSessionRefresh) {
                      await onSessionRefresh(prev, undefined, { expectClearedSession: true });
                    } else if (!r?.ok && r?.error) {
                      setErr(r.error);
                    }
                  } finally {
                    setStartNextBusy(false);
                  }
                }}
                className="w-full rounded-md border border-emerald-500/40 bg-emerald-900/30 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-45"
              >
                {startNextBusy ? "Starting…" : "Start next match (host)"}
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exitBusy}
                onClick={() => void router.replace({ pathname: "/online-v2/rooms", query: { room: roomId } }, undefined, { shallow: true })}
                className="rounded-md border border-white/25 bg-white/10 py-2 text-xs font-semibold"
              >
                Room lobby
              </button>
              <button
                type="button"
                disabled={exitBusy || !selfKey}
                onClick={async () => {
                  setExitErr("");
                  setExitBusy(true);
                  try {
                    await leaveOv2RoomWithForfeitRetry({ room, room_id: roomId, participant_key: selfKey });
                    try {
                      window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
                    } catch {
                      /* ignore */
                    }
                    await router.replace("/online-v2/rooms");
                  } catch (e) {
                    setExitErr(e?.message || "Could not leave.");
                  } finally {
                    setExitBusy(false);
                  }
                }}
                className="rounded-md border border-red-500/45 bg-red-950/35 py-2 text-xs font-semibold text-red-100"
              >
                {exitBusy ? "…" : "Leave room"}
              </button>
            </div>
            {exitErr ? <p className="text-center text-[10px] text-red-300">{exitErr}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
