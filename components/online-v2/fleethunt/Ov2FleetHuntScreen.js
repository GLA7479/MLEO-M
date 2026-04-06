"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  FH_GRID_SIZE,
  fhOccupiedKeys,
  fhRemainingLengths,
  fhShotAt,
  fhShotKindLabel,
  fhTryPlaceShip,
} from "../../../lib/online-v2/fleethunt/ov2FleetHuntBoard";
import { useOv2FleetHuntSession } from "../../../hooks/useOv2FleetHuntSession";

const finishDismissStorageKey = sid => `ov2_fh_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** @param {unknown} m */
function memberRematchRequested(m) {
  const meta = m?.meta;
  if (!meta || typeof meta !== "object") return false;
  const fh = /** @type {Record<string, unknown>} */ (meta).fh;
  if (!fh || typeof fh !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (fh).rematch_requested;
  return r === true || r === "true" || r === 1;
}

/** @param {unknown[]} shots */
function shotLookup(shots, r, c) {
  if (!Array.isArray(shots)) return null;
  return (
    shots.find(s => s && typeof s === "object" && Math.floor(Number(s.r)) === r && Math.floor(Number(s.c)) === c) || null
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2FleetHuntScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2FleetHuntSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    submitPlacement,
    randomPlacement,
    lockPlacement,
    fireShot,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;

  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const [orientationH, setOrientationH] = useState(true);
  const [pickLen, setPickLen] = useState(/** @type {number|null} */ (null));
  const [draftShips, setDraftShips] = useState(/** @type {{ cells: { r: number, c: number }[] }[]} */ ([]));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  useEffect(() => {
    setFinishModalDismissedSessionId("");
    setDraftShips([]);
    setPickLen(null);
  }, [vm.sessionId]);

  useEffect(() => {
    if (vm.phase !== "placement") return;
    if (!snapshot?.myShips || snapshot.myShips.length !== 5) return;
    setDraftShips(snapshot.myShips.map(s => ({ cells: [...(s.cells || [])] })));
  }, [vm.phase, snapshot?.revision, snapshot?.myShips]);

  const onRematch = useCallback(async () => {
    if (!roomId || rematchBusy) return;
    setRematchBusy(true);
    setErr("");
    try {
      const r = await requestRematch();
      if (!r.ok) setErr(r.error || "Rematch request failed");
    } finally {
      setRematchBusy(false);
    }
  }, [roomId, rematchBusy, requestRematch, setErr]);

  const onStartNext = useCallback(async () => {
    if (!roomId || !isHost || startNextBusy) return;
    setStartNextBusy(true);
    setErr("");
    try {
      const r = await startNextMatch(roomMatchSeq);
      if (!r.ok) {
        setErr(r.error || "Could not start next match");
        return;
      }
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
        } catch {
          /* ignore */
        }
      }
      if (typeof onSessionRefresh === "function") {
        const prev = snapshot?.sessionId != null ? String(snapshot.sessionId) : "";
        await onSessionRefresh(prev, "", { expectClearedSession: true });
      }
      await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
    } finally {
      setStartNextBusy(false);
    }
  }, [
    roomId,
    isHost,
    startNextBusy,
    startNextMatch,
    roomMatchSeq,
    onSessionRefresh,
    snapshot?.sessionId,
    router,
    setErr,
  ]);

  const onExitToLobby = useCallback(async () => {
    if (!roomId || !pk || exitBusy) return;
    setExitBusy(true);
    setExitErr("");
    try {
      await leaveOv2RoomWithForfeitRetry({ room, room_id: roomId, participant_key: pk });
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
        } catch {
          /* ignore */
        }
      }
      await router.push("/online-v2/rooms");
    } catch (e) {
      setExitErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setExitBusy(false);
    }
  }, [roomId, pk, exitBusy, room, router]);

  const rematchCounts = useMemo(() => {
    let ready = 0;
    let seated = 0;
    for (const m of members) {
      if (m?.seat_index == null || m?.seat_index === "") continue;
      seated += 1;
      if (String(m?.wallet_state || "").trim() !== "committed") continue;
      if (memberRematchRequested(m)) ready += 1;
    }
    return { ready, seated };
  }, [members]);

  const finished = vm.phase === "finished";
  const finishSessionId = finished ? String(vm.sessionId || "").trim() : "";
  const finishModalDismissed =
    finishSessionId.length > 0 &&
    (finishModalDismissedSessionId === finishSessionId ||
      (typeof window !== "undefined" &&
        (() => {
          try {
            return window.sessionStorage.getItem(finishDismissStorageKey(finishSessionId)) === "1";
          } catch {
            return false;
          }
        })()));
  const showResultModal = finished && finishSessionId.length > 0 && !finishModalDismissed;

  const mySeat = vm.mySeat;
  const oppSeat = mySeat === 0 ? 1 : mySeat === 1 ? 0 : null;
  const myOutgoing = mySeat === 0 ? vm.shots0 : mySeat === 1 ? vm.shots1 : [];
  const incomingOnMe = mySeat === 0 ? vm.shots1 : mySeat === 1 ? vm.shots0 : [];

  const myLocked = mySeat === 0 ? vm.lock0 : mySeat === 1 ? vm.lock1 : false;
  const oppLocked = mySeat === 0 ? vm.lock1 : mySeat === 1 ? vm.lock0 : false;

  const remaining = useMemo(() => fhRemainingLengths(draftShips.map(s => s.cells)), [draftShips]);
  const activePickLen = pickLen != null && remaining.includes(pickLen) ? pickLen : remaining[0] ?? null;

  const onPlacementCell = useCallback(
    (r, c) => {
      if (vm.phase !== "placement" || myLocked || busy || activePickLen == null) return;
      setDraftShips(prev => {
        const occ = fhOccupiedKeys(prev.map(s => s.cells));
        const cells = fhTryPlaceShip(occ, activePickLen, r, c, orientationH);
        if (!cells) return prev;
        return [...prev, { cells }];
      });
      setPickLen(null);
    },
    [vm.phase, myLocked, busy, activePickLen, orientationH]
  );

  const onTargetCell = useCallback(
    (r, c) => {
      if (vm.phase !== "battle" || busy || mySeat == null || oppSeat == null) return;
      if (vm.pendingDouble) return;
      if (vm.turnSeat !== mySeat) return;
      if (fhShotAt(myOutgoing, r, c)) return;
      void fireShot(r, c);
    },
    [vm.phase, vm.pendingDouble, vm.turnSeat, mySeat, oppSeat, myOutgoing, busy, fireShot]
  );

  const dismissFinishModal = useCallback(() => {
    if (!finishSessionId) return;
    setFinishModalDismissedSessionId(finishSessionId);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
      } catch {
        /* ignore */
      }
    }
  }, [finishSessionId]);

  const winnerLabel =
    vm.winnerSeat != null && mySeat != null ? (vm.winnerSeat === mySeat ? "You won" : "You lost") : "Match over";

  const pd = vm.pendingDouble && typeof vm.pendingDouble === "object" ? /** @type {Record<string, unknown>} */ (vm.pendingDouble) : null;
  const responderSeat = pd != null && pd.responder_seat != null ? Number(pd.responder_seat) : null;
  const proposedMult = pd != null && pd.proposed_mult != null ? Number(pd.proposed_mult) : null;

  const canOfferDouble =
    vm.phase === "battle" &&
    !pd &&
    vm.turnSeat === mySeat &&
    vm.doublesAccepted < 4 &&
    vm.stakeMultiplier < 16;

  const renderGrid = (mode, { onCell, shipsCells, outgoing, incoming, dim }) => {
    const shipSet = new Set();
    if (Array.isArray(shipsCells)) {
      for (const cells of shipsCells) {
        for (const cell of cells) {
          shipSet.add(`${cell.r},${cell.c}`);
        }
      }
    }
    return (
      <div
        className="grid aspect-square w-full max-w-[min(100%,22rem)] gap-0.5 sm:max-w-[min(100%,28rem)]"
        style={{ gridTemplateColumns: `repeat(${FH_GRID_SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: FH_GRID_SIZE * FH_GRID_SIZE }, (_, i) => {
          const r = Math.floor(i / FH_GRID_SIZE);
          const c = i % FH_GRID_SIZE;
          const key = `${r},${c}`;
          const hasShip = shipSet.has(key);
          const out = shotLookup(outgoing, r, c);
          const inc = shotLookup(incoming, r, c);
          const isHit = hasShip && inc;
          const clickable = Boolean(onCell) && !dim;
          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => onCell && onCell(r, c)}
              className={[
                "relative aspect-square min-h-0 min-w-0 rounded-[3px] border text-[8px] font-bold transition",
                hasShip ? "border-slate-500/50 bg-slate-700/85" : "border-slate-600/40 bg-slate-900/70",
                out?.k === "miss" ? "bg-sky-950/80" : "",
                out?.k === "hit" || out?.k === "sunk" ? "bg-rose-950/85" : "",
                inc && !hasShip ? "border-amber-500/40" : "",
                isHit ? "ring-1 ring-amber-400/50" : "",
                clickable ? "cursor-pointer active:scale-95" : "cursor-default opacity-90",
              ].join(" ")}
            >
              {out ? <span className="sr-only">{fhShotKindLabel(out.k)}</span> : null}
              {mode === "defense" && inc && !hasShip ? (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] text-sky-200/90">·</span>
              ) : null}
              {mode === "defense" && inc && hasShip ? (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] text-rose-100/95">
                  {fhShotKindLabel(inc.k).charAt(0)}
                </span>
              ) : null}
              {mode === "offense" && out ? (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-sky-100/95">
                  {out.k === "miss" ? "○" : out.k === "sunk" ? "✕" : "●"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  const saveDisabled =
    busy || vm.phase !== "placement" || myLocked || remaining.length > 0 || draftShips.length !== 5;
  const lockDisabled = busy || vm.phase !== "placement" || myLocked;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1.5 pb-3 pt-1 sm:gap-3 sm:px-2">
      {err ? <div className="rounded-lg border border-red-500/30 bg-red-950/35 px-2 py-1.5 text-[11px] text-red-100">{err}</div> : null}
      {vaultClaimBusy ? (
        <div className="rounded-lg border border-sky-500/25 bg-sky-950/25 px-2 py-1 text-[10px] text-sky-100/90">Updating vault…</div>
      ) : null}

      {vm.phase === "placement" && mySeat != null ? (
        <div className="space-y-2 rounded-xl border border-white/[0.06] bg-zinc-950/50 p-2 sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
            <span>
              Placement — {myLocked ? "Locked" : "Arrange your fleet"}
              {vm.placementTimeLeftSec != null && !myLocked ? (
                <span className="ml-2 text-amber-200/90">⏱ {vm.placementTimeLeftSec}s</span>
              ) : null}
            </span>
            <span className="text-zinc-500">
              Opponent: {oppLocked ? "locked" : "arranging…"} (strikes {vm.placementMissStreakBySeat[oppSeat ?? 0] ?? 0}/3)
            </span>
          </div>
          {!myLocked ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <span className="w-full text-[10px] text-zinc-500">Ship to place:</span>
                {remaining.length === 0 ? (
                  <span className="text-[11px] text-emerald-200/90">All ships placed — save & lock</span>
                ) : (
                  remaining.map((len, idx) => (
                    <button
                      key={`${len}-${idx}`}
                      type="button"
                      onClick={() => setPickLen(len)}
                      className={[
                        "rounded-md border px-2 py-1 text-[10px] font-semibold",
                        activePickLen === len
                          ? "border-emerald-400/60 bg-emerald-950/50 text-emerald-100"
                          : "border-zinc-600/50 bg-zinc-900/60 text-zinc-300",
                      ].join(" ")}
                    >
                      {len}
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN_SECONDARY + (orientationH ? " ring-1 ring-sky-500/40" : "")}
                  onClick={() => setOrientationH(true)}
                >
                  Horizontal
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY + (!orientationH ? " ring-1 ring-sky-500/40" : "")}
                  onClick={() => setOrientationH(false)}
                >
                  Vertical
                </button>
              </div>
            </>
          ) : null}
          <div className="mx-auto w-full max-w-[min(100%,22rem)] sm:max-w-[min(100%,28rem)]">
            {renderGrid("defense", {
              onCell: !myLocked ? onPlacementCell : null,
              shipsCells: draftShips.map(s => s.cells),
              outgoing: [],
              incoming: [],
              dim: myLocked,
            })}
          </div>
          {!myLocked ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy || draftShips.length === 0}
                onClick={() => setDraftShips(prev => prev.slice(0, -1))}
              >
                Undo ship
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy || draftShips.length === 0}
                onClick={() => setDraftShips([])}
              >
                Clear
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void randomPlacement()}>
                Random
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={saveDisabled}
                onClick={() => void submitPlacement(draftShips)}
              >
                Save layout
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={lockDisabled} onClick={() => void lockPlacement()}>
                Lock in
              </button>
            </div>
          ) : (
            <p className="text-center text-[11px] text-zinc-500">Waiting for opponent to lock…</p>
          )}
        </div>
      ) : null}

      {vm.phase === "battle" && mySeat != null ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
            <span>
              Battle — {vm.turnSeat === mySeat ? "Your turn" : "Opponent turn"}
              {vm.turnTimeLeftSec != null ? <span className="ml-2 text-amber-200/90">⏱ {vm.turnTimeLeftSec}s</span> : null}
            </span>
            <span className="text-zinc-400">
              ×{vm.stakeMultiplier} · doubles {vm.doublesAccepted}/4
            </span>
          </div>
          {pd ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/25 p-2 text-[11px] text-amber-100/95">
              {responderSeat === mySeat ? (
                <>
                  <p className="font-semibold">Double offered → ×{proposedMult ?? "?"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void respondDouble(true)}>
                      Accept
                    </button>
                    <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void respondDouble(false)}>
                      Decline (forfeit)
                    </button>
                  </div>
                </>
              ) : (
                <p>Waiting for opponent to accept or decline the double…</p>
              )}
            </div>
          ) : canOfferDouble ? (
            <button type="button" className={BTN_SECONDARY + " w-full sm:w-auto"} disabled={busy} onClick={() => void offerDouble()}>
              Offer double
            </button>
          ) : null}

          <section className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Your shots</h3>
            <div className="mx-auto w-full">
              {renderGrid("offense", {
                onCell: onTargetCell,
                shipsCells: [],
                outgoing: myOutgoing,
                incoming: [],
                dim: vm.turnSeat !== mySeat || Boolean(pd),
              })}
            </div>
          </section>

          <section className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Your fleet</h3>
            <div className="mx-auto w-full">
              {renderGrid("defense", {
                onCell: null,
                shipsCells: vm.myShips.map(s => s.cells || []),
                outgoing: [],
                incoming: incomingOnMe,
                dim: false,
              })}
            </div>
          </section>
        </div>
      ) : null}

      {!snapshot && room?.active_session_id ? (
        <div className="py-6 text-center text-[12px] text-zinc-500">Loading match…</div>
      ) : null}

      {showResultModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-xl">
            <div className="text-lg font-bold text-white">{winnerLabel}</div>
            {vm.result && typeof vm.result === "object" ? (
              <p className="mt-2 text-[12px] text-zinc-400">
                Multiplier ×{String(vm.result.stakeMultiplier ?? vm.stakeMultiplier ?? 1)}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
                {rematchBusy ? "Requesting…" : "Request rematch"}
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
                Cancel rematch
              </button>
              {isHost ? (
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={startNextBusy || rematchCounts.ready < 2}
                  onClick={() => void onStartNext()}
                >
                  {startNextBusy ? "Starting…" : `Start next match (${rematchCounts.ready}/2 rematch)`}
                </button>
              ) : (
                <p className="text-center text-[11px] text-zinc-500">Host starts the next match when both players rematch.</p>
              )}
              <button type="button" className={BTN_SECONDARY} onClick={() => dismissFinishModal()}>
                Dismiss
              </button>
              <button
                type="button"
                className="mt-1 text-[11px] text-zinc-500 underline"
                disabled={exitBusy}
                onClick={() => void onExitToLobby()}
              >
                {exitBusy ? "Leaving…" : "Exit to lobby"}
              </button>
              {exitErr ? <p className="text-[11px] text-red-300">{exitErr}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {finished && !showResultModal ? (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-3 text-[11px] text-zinc-400">
          <p className="font-semibold text-zinc-200">{winnerLabel}</p>
          <p className="mt-1">Result dismissed — you can rematch from the lobby or use buttons below if still available.</p>
        </div>
      ) : null}
    </div>
  );
}
