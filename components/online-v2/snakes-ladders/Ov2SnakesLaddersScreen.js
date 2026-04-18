"use client";

import { useCallback, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { OV2_LUDO_PLAY_MODE } from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { OV2_SNAKES_LADDERS_PRODUCT_GAME_ID } from "../../../lib/online-v2/snakes-ladders/ov2SnakesLaddersSessionAdapter";
import { useOv2SnakesLaddersSession } from "../../../hooks/useOv2SnakesLaddersSession";
import { useOv2MatchSnapshotWait } from "../../../hooks/useOv2MatchSnapshotWait";
import Ov2SeatStrip from "../shared/Ov2SeatStrip";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import Ov2SharedStakeDoubleModal from "../Ov2SharedStakeDoubleModal";

const finishDismissStorageKey = sid => `ov2_snakes_ladders_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void | Promise<void>, leaveToLobbyBusy?: boolean } | null }} props
 */
export default function Ov2SnakesLaddersScreen({ contextInput = null }) {
  const session = useOv2SnakesLaddersSession(contextInput ?? undefined);
  const {
    vm,
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
    rollDice,
    completeMove,
    canRoll,
    canCompleteMove,
    offerDouble,
    respondDouble,
    doubleRpcBusy,
    doubleRpcErr,
  } = session;

  const roomMembers = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const roomId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.id != null
      ? String(contextInput.room.id)
      : "";
  const roomProductId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.product_game_id != null
      ? String(contextInput.room.product_game_id)
      : null;
  const roomHasActiveOv2Session =
    Boolean(
      contextInput?.room &&
        typeof contextInput.room === "object" &&
        contextInput.room.active_session_id != null &&
        String(contextInput.room.active_session_id).trim() !== ""
    );

  const {
    board,
    diceRolling,
    playMode,
    interactionTier,
    liveMySeat: mySeat,
    doubleState,
    turnSeat,
    authoritativeTurnKey,
    turnTimeLeftSec,
    isTurnTimerActive,
    isMyTurnLive,
    currentMultiplier,
    doubleProposedBySeat,
    doubleAwaitingSeat,
    doublePendingSeats,
    isDoublePending,
    doubleTimeLeftSec,
    isDoubleTimerActive,
    strikeDisplayMap,
    eliminatedSeats,
    statusLine,
    matchPhase,
    result,
    liveDiceDisplayValue,
    doubleCycleUsedSeats,
    isDoubleOfferCapped,
    isAtDoubleMultiplierCap,
    sessionId: slSessionId,
    phaseLine,
    boardViewReadOnly,
  } = vm;

  const { matchSnapshotTimedOut } = useOv2MatchSnapshotWait(
    Boolean(roomHasActiveOv2Session && roomProductId === OV2_SNAKES_LADDERS_PRODUCT_GAME_ID),
    Boolean(slSessionId)
  );

  const isReadOnlyRoom = playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;
  const isLiveMatch = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE;

  const membersBySeat = useMemo(() => {
    const out = new Map();
    for (const m of roomMembers) {
      if (!m || typeof m !== "object") continue;
      const rawSeat = "seat_index" in m ? m.seat_index : null;
      if (rawSeat === null || rawSeat === undefined || rawSeat === "") continue;
      const seat = Number(rawSeat);
      if (!Number.isInteger(seat) || seat < 0 || seat > 3) continue;
      if (!out.has(seat)) out.set(seat, m);
    }
    return out;
  }, [roomMembers]);

  const seatLabels = useMemo(() => {
    if (roomProductId === OV2_SNAKES_LADDERS_PRODUCT_GAME_ID && membersBySeat.size > 0) {
      return [0, 1, 2, 3].map(seat => {
        const member = membersBySeat.get(seat);
        if (!member) return `Seat ${seat + 1}`;
        const name =
          member && typeof member === "object" && "display_name" in member
            ? String(member.display_name || "").trim()
            : "";
        return name ? `Seat ${seat + 1} · ${name}` : `Seat ${seat + 1}`;
      });
    }
    return ["Seat 1", "Seat 2", "Seat 3", "Seat 4"];
  }, [roomProductId, membersBySeat]);

  const selfHighlightIndex = isLiveMatch && mySeat != null ? mySeat : null;

  const doubleCycleUsed = Array.isArray(doubleCycleUsedSeats) ? doubleCycleUsedSeats : [];
  const isDoubleCycleLockedForMe = mySeat != null && doubleCycleUsed.includes(Number(mySeat));
  const canOfferDouble =
    isLiveMatch &&
    isMyTurnLive &&
    authoritativeTurnKey != null &&
    mySeat != null &&
    turnSeat === mySeat &&
    board.dice != null &&
    !boardViewReadOnly &&
    doubleAwaitingSeat == null &&
    (doubleState?.proposed_by == null || doubleState?.awaiting == null) &&
    !isDoubleCycleLockedForMe &&
    !isDoubleOfferCapped &&
    !isAtDoubleMultiplierCap &&
    !doubleRpcBusy;
  const isAwaitingMyDouble = isLiveMatch && mySeat != null && doubleAwaitingSeat === mySeat;
  const slDoubleProposedMult = useMemo(
    () => Math.min(Math.max(1, Number(currentMultiplier || 1)) * 2, 16),
    [currentMultiplier]
  );
  const turnTimerTone =
    !isTurnTimerActive || turnTimeLeftSec == null
      ? "border-sky-400/35 bg-sky-950/30 text-sky-100"
      : turnTimeLeftSec <= 5
        ? "border-red-400/55 bg-red-950/40 text-red-100"
        : turnTimeLeftSec <= 10
          ? "border-amber-400/50 bg-amber-950/38 text-amber-100"
          : "border-sky-400/45 bg-sky-950/35 text-sky-100";
  const doubleTimerTone =
    !isDoublePending
      ? "border-violet-400/35 bg-violet-950/30 text-violet-100"
      : isDoubleTimerActive && doubleTimeLeftSec != null && doubleTimeLeftSec <= 8
        ? "border-red-400/55 bg-red-950/40 text-red-100"
        : "border-fuchsia-400/45 bg-fuchsia-950/38 text-fuchsia-100";
  const turnToken = isMyTurnLive ? "Turn You" : turnSeat != null ? `Turn S${Number(turnSeat) + 1}` : "Turn —";
  const turnTimeToken = authoritativeTurnKey != null && isTurnTimerActive && turnTimeLeftSec != null ? `${turnTimeLeftSec}s` : "—";
  const doubleToken = `Dx${Number(currentMultiplier || 1)}`;
  const doubleTimeToken = isDoublePending && isDoubleTimerActive && doubleTimeLeftSec != null ? `${doubleTimeLeftSec}s` : "—";

  const winnerSeat = board?.winner != null ? board.winner : null;
  const isFinished =
    isLiveMatch &&
    (String(matchPhase || "").toLowerCase() === "finished" || winnerSeat != null || result?.winner != null);
  const winnerFromResult = result?.winner != null ? Number(result.winner) : winnerSeat != null ? Number(winnerSeat) : null;
  const didIWin = isFinished && mySeat != null && winnerFromResult != null && Number(mySeat) === Number(winnerFromResult);
  const lossPerSeat =
    result?.lossPerSeat != null && Number.isFinite(Number(result.lossPerSeat)) ? Math.floor(Number(result.lossPerSeat)) : null;
  const prizeTotal =
    result?.prize != null && Number.isFinite(Number(result.prize)) ? Math.floor(Number(result.prize)) : null;
  const winnerNet =
    prizeTotal != null && lossPerSeat != null ? Math.max(0, Math.floor(prizeTotal - lossPerSeat)) : null;

  const finishSessionId = isFinished ? String(slSessionId || "").trim() : "";
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
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
  const showResultModal = isFinished && !finishModalDismissed;

  const dismissFinishModal = useCallback(() => {
    if (!finishSessionId) return;
    setFinishModalDismissedSessionId(finishSessionId);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
      }
    } catch {
      /* ignore */
    }
  }, [finishSessionId]);

  const finishOutcome = useMemo(() => {
    if (!isFinished) return "unknown";
    if (winnerFromResult == null) return "unknown";
    if (mySeat == null) return "unknown";
    if (Number(mySeat) === Number(winnerFromResult)) return "win";
    return "loss";
  }, [isFinished, winnerFromResult, mySeat]);

  const finishTitle = useMemo(() => {
    if (!isFinished) return "";
    if (finishOutcome === "unknown") return "Match finished";
    if (finishOutcome === "win") return "Victory";
    return "Defeat";
  }, [isFinished, finishOutcome]);

  const finishReasonLine = useMemo(() => {
    if (!isFinished) return "";
    if (winnerFromResult != null) return `Winner: Seat ${winnerFromResult + 1}`;
    return "Match complete";
  }, [isFinished, winnerFromResult]);

  const finishAmountLine = useMemo(() => {
    if (!isFinished) return { text: "—", className: "text-zinc-500" };
    if (didIWin && winnerNet != null && prizeTotal != null) {
      return {
        text: `+${winnerNet.toLocaleString()} MLEO (pot ${prizeTotal.toLocaleString()})`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (didIWin && prizeTotal != null) {
      return {
        text: `Pot ${prizeTotal.toLocaleString()}`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (!didIWin && mySeat != null && winnerFromResult != null && lossPerSeat != null) {
      return {
        text: `−${lossPerSeat.toLocaleString()} MLEO`,
        className: "font-semibold tabular-nums text-rose-300/95",
      };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [isFinished, didIWin, winnerNet, prizeTotal, mySeat, winnerFromResult, lossPerSeat]);

  const selfKey = String(contextInput?.self?.participant_key || "").trim();
  const onLeaveToLobby =
    contextInput && typeof contextInput === "object" && typeof contextInput.onLeaveToLobby === "function"
      ? contextInput.onLeaveToLobby
      : null;
  const leaveToLobbyBusy = Boolean(
    contextInput && typeof contextInput === "object" && contextInput.leaveToLobbyBusy === true
  );

  const diceFace =
    isLiveMatch && liveDiceDisplayValue != null && typeof liveDiceDisplayValue === "number"
      ? liveDiceDisplayValue
      : board?.dice ?? board?.lastDice;

  const positionsText = useMemo(() => {
    const p = board?.positions;
    if (!p || typeof p !== "object") return "{}";
    try {
      return JSON.stringify(p);
    } catch {
      return String(p);
    }
  }, [board?.positions]);

  const strikeSeats = [0, 1, 2, 3]
    .map(seat => ({ seat, v: Number(strikeDisplayMap?.[seat] || 0) }))
    .filter(x => x.v > 0);
  const strikeToken = eliminatedSeats?.length
    ? `Out ${eliminatedSeats.map(s => `S${Number(s) + 1}`).join(",")}`
    : strikeSeats.length
      ? `St ${strikeSeats.map(x => `S${x.seat + 1}:${x.v}`).join(",")}`
      : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden px-0.5 sm:px-1">
      <Ov2SharedStakeDoubleModal
        open={isAwaitingMyDouble}
        proposedMult={slDoubleProposedMult}
        stakeMultiplier={currentMultiplier}
        busy={doubleRpcBusy}
        onAccept={() => void respondDouble("accept")}
        onDecline={() => void respondDouble("decline")}
      />

      {roomHasActiveOv2Session && roomProductId === OV2_SNAKES_LADDERS_PRODUCT_GAME_ID && !slSessionId ? (
        !matchSnapshotTimedOut ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center text-sm text-zinc-400">
            Loading match…
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2 text-center">
            <p className="text-sm text-zinc-400">Could not load match.</p>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-zinc-900/70 px-3 py-2 text-[11px] font-medium text-zinc-200"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Retry
            </button>
          </div>
        )
      ) : (
        <>
          {isReadOnlyRoom ? (
            <p className="shrink-0 px-1 text-[10px] leading-snug text-zinc-400">{phaseLine}</p>
          ) : null}

          <Ov2SeatStrip
            count={4}
            labels={seatLabels}
            activeIndex={board?.turnSeat}
            selfIndex={selfHighlightIndex}
            awaitedIndex={isDoublePending ? doubleAwaitingSeat : null}
            eliminatedIndices={eliminatedSeats}
          />

          {isLiveMatch ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-0.5 py-1 text-[10px]">
              <button
                type="button"
                disabled={!canOfferDouble}
                onClick={() => void offerDouble()}
                className="rounded-md border border-amber-400/35 bg-amber-950/35 px-2 py-1 font-semibold text-amber-100 disabled:opacity-40"
              >
                Offer double
              </button>
              {authoritativeTurnKey != null ? (
                <span className={`rounded-md border px-2 py-1 font-semibold ${turnTimerTone}`}>
                  {turnToken} {turnTimeToken}
                </span>
              ) : null}
              <span className={`rounded-md border px-2 py-1 font-semibold ${doubleTimerTone}`}>
                {doubleToken} {doubleTimeToken}
              </span>
              {doublePendingSeats.length ? (
                <span className="rounded border border-fuchsia-400/30 px-1 text-fuchsia-100">
                  Pending: {doublePendingSeats.map(s => `S${Number(s) + 1}`).join(", ")}
                </span>
              ) : null}
              {doubleProposedBySeat != null ? (
                <span className="text-zinc-500">Proposed by S{Number(doubleProposedBySeat) + 1}</span>
              ) : null}
              {strikeToken ? <span className="text-zinc-400">{strikeToken}</span> : null}
              {statusLine ? <span className="text-amber-200/90">{statusLine}</span> : null}
            </div>
          ) : null}

          {isLiveMatch && doubleRpcErr ? <p className="shrink-0 px-0.5 text-[10px] text-red-300/95">{doubleRpcErr}</p> : null}
          {isLiveMatch && vaultClaimError && !vaultClaimBusy ? (
            <p className="shrink-0 px-0.5 text-[10px] text-red-300/95">
              {vaultClaimError}{" "}
              <button type="button" className="underline" onClick={() => void retryVaultClaim()}>
                Retry
              </button>
            </p>
          ) : null}
          {isLiveMatch && !isFinished && onLeaveToLobby ? (
            <div className="flex shrink-0 justify-end px-0.5 pt-0.5">
              <button
                type="button"
                disabled={leaveToLobbyBusy}
                onClick={() => void onLeaveToLobby()}
                className="text-[10px] font-semibold text-red-200/95 underline decoration-red-400/50 disabled:opacity-45"
              >
                {leaveToLobbyBusy ? "Leaving…" : "Leave table"}
              </button>
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-white/10 bg-zinc-950/40 p-2">
            <p className="text-[10px] font-semibold text-zinc-400">Board (server)</p>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-200 break-all">{positionsText}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-center">
                <p className="text-[9px] uppercase text-zinc-500">Dice</p>
                <p className="text-2xl font-bold tabular-nums text-white">
                  {diceFace != null && !Number.isNaN(Number(diceFace)) ? diceFace : "—"}
                </p>
                {diceRolling ? <p className="text-[9px] text-amber-200">Rolling…</p> : null}
              </div>
              <div className="flex flex-col justify-center gap-1.5">
                <button
                  type="button"
                  disabled={!canRoll || interactionTier !== "live_authoritative"}
                  onClick={() => void rollDice()}
                  className={BTN_PRIMARY}
                >
                  Roll
                </button>
                <button
                  type="button"
                  disabled={!canCompleteMove || interactionTier !== "live_authoritative"}
                  onClick={() => void completeMove()}
                  className={BTN_PRIMARY}
                >
                  Move (apply roll)
                </button>
              </div>
            </div>
            {boardViewReadOnly && isLiveMatch ? (
              <p className="mt-2 text-[10px] text-zinc-500">View only (spectator or match not interactive).</p>
            ) : null}
          </div>

          {showResultModal ? (
            <Ov2SharedFinishModalFrame titleId="ov2-snakes-finish-title">
              <div
                className={[
                  "border-b px-4 pb-3 pt-4",
                  finishOutcome === "win"
                    ? "border-emerald-500/20 bg-gradient-to-br from-emerald-950/45 to-zinc-950/80"
                    : finishOutcome === "loss"
                      ? "border-rose-500/20 bg-gradient-to-br from-rose-950/40 to-zinc-950/80"
                      : "border-white/[0.07] bg-zinc-950/60",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={[
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl",
                      finishOutcome === "win" && "border-emerald-500/45 bg-emerald-950/60 text-emerald-200",
                      finishOutcome === "loss" && "border-rose-500/45 bg-rose-950/55 text-rose-200",
                      finishOutcome === "unknown" && "border-white/10 bg-zinc-900/80 text-zinc-200",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-hidden
                  >
                    {finishOutcome === "win" ? "🏆" : finishOutcome === "loss" ? "✕" : "⎔"}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Round result</p>
                    <h2
                      id="ov2-snakes-finish-title"
                      className={[
                        "mt-0.5 text-2xl font-extrabold leading-tight",
                        finishOutcome === "win" && "text-emerald-400",
                        finishOutcome === "loss" && "text-rose-400",
                        finishOutcome === "unknown" && "text-zinc-100",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {finishTitle}
                    </h2>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{currentMultiplier}</p>
                    <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                      <p className={`mt-2 text-center text-xl font-bold tabular-nums ${finishAmountLine.className}`}>
                        {finishAmountLine.text}
                      </p>
                    </div>
                    <p className="mt-3 text-center text-[11px] text-zinc-400">{finishReasonLine}</p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3">
                <button type="button" className={BTN_PRIMARY + " w-full"} onClick={() => dismissFinishModal()}>
                  {vaultClaimBusy ? "Updating balance…" : "Continue"}
                </button>
                <p className="mt-2 text-center text-[10px] text-zinc-500">
                  Return to the room lobby for the next round when the host resets the table.
                </p>
                <p className="mt-1 text-center text-[10px] text-zinc-600">
                  Tip:{" "}
                  <a href="/online-v2/rooms" className="text-sky-300 underline">
                    Open rooms
                  </a>
                  {roomId ? (
                    <>
                      {" · "}
                      <a
                        href={`/online-v2/rooms?room=${encodeURIComponent(roomId)}`}
                        className="text-sky-300 underline"
                        onClick={e => {
                          try {
                            window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
                          } catch {
                            /* ignore */
                          }
                          if (e.metaKey || e.ctrlKey) return;
                          e.preventDefault();
                          if (typeof window !== "undefined") window.location.assign(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
                        }}
                      >
                        This room
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </Ov2SharedFinishModalFrame>
          ) : null}
        </>
      )}
    </div>
  );
}
