"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { mmFormatCard, mmSuggestFinishFromHand11 } from "../../../lib/online-v2/meldmatch/ov2MeldMatchCards";
import { useOv2MeldMatchSession } from "../../../hooks/useOv2MeldMatchSession";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import Ov2SharedStakeDoubleModal from "../Ov2SharedStakeDoubleModal";

const finishDismissStorageKey = sid => `ov2_mm_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** @param {unknown} raw */
function normalizeLayoffMelds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(m => {
      if (!Array.isArray(m)) return [];
      return m.map(x => Math.floor(Number(x))).filter(n => Number.isFinite(n) && n >= 0 && n <= 51);
    })
    .filter(m => m.length >= 3);
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2MeldMatchScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2MeldMatchSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    draw,
    discard,
    declareFinish,
    resolveLayoff,
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
  const [finishPanelOpen, setFinishPanelOpen] = useState(false);
  const [layoffAssignments, setLayoffAssignments] = useState(/** @type {{ meld_index: number, card_id: number }[]} */ ([]));
  const [layoffMeldPick, setLayoffMeldPick] = useState(0);

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  const layoffMeldsNorm = useMemo(() => normalizeLayoffMelds(vm.layoffMelds), [vm.layoffMelds]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
    setFinishPanelOpen(false);
  }, [vm.sessionId]);

  useEffect(() => {
    if (vm.phase !== "layoff") setLayoffAssignments([]);
  }, [vm.phase]);

  const finishSuggestion = useMemo(() => {
    if (vm.myHand.length !== 11) return null;
    return mmSuggestFinishFromHand11(vm.myHand);
  }, [vm.myHand]);

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

  const onCardDiscard = useCallback(
    async cardId => {
      if (vm.phase !== "playing" || vm.turnPhase !== "discard" || busy || vaultClaimBusy) return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      if (vm.mustRespondDouble) return;
      setErr("");
      await discard(cardId);
    },
    [vm, busy, vaultClaimBusy, discard, setErr]
  );

  const onSubmitFinish = useCallback(async () => {
    if (!finishSuggestion) return;
    setErr("");
    const { kind, melds, deadwood, discard: dCard } = finishSuggestion;
    const r = await declareFinish({
      kind,
      melds,
      deadwood,
      discardCard: dCard,
    });
    if (r.ok) setFinishPanelOpen(false);
  }, [finishSuggestion, declareFinish, setErr]);

  const onLayoffAddCard = useCallback(
    cardId => {
      if (vm.phase !== "layoff" || busy) return;
      if (layoffMeldsNorm.length === 0) return;
      const mi = Math.max(0, Math.min(layoffMeldsNorm.length - 1, layoffMeldPick));
      setLayoffAssignments(prev => [...prev, { meld_index: mi, card_id: cardId }]);
    },
    [vm.phase, busy, layoffMeldsNorm.length, layoffMeldPick]
  );

  const onLayoffSubmit = useCallback(async () => {
    setErr("");
    await resolveLayoff(layoffAssignments);
  }, [layoffAssignments, resolveLayoff, setErr]);

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
  const isDraw = Boolean(vm.result && vm.result.draw === true);
  const didIWin = !isDraw && vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.winnerSeat) + 1}`;
  }, [members, vm.winnerSeat]);

  const myColorLabel = vm.mySeat === 0 ? "Rose" : vm.mySeat === 1 ? "Amber" : "—";
  const oppColorLabel = vm.mySeat === 0 ? "Amber" : vm.mySeat === 1 ? "Rose" : "—";

  const canInteractHand =
    vm.phase === "playing" &&
    vm.mySeat === vm.turnSeat &&
    vm.turnPhase === "discard" &&
    !vm.mustRespondDouble &&
    !busy &&
    !vaultClaimBusy;

  const finishedActions = (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={rematchBusy} onClick={() => void onRematch()} className={BTN_PRIMARY}>
        {rematchBusy ? "…" : "Rematch"}
      </button>
      <button type="button" onClick={() => void cancelRematch()} className={BTN_SECONDARY}>
        Cancel rematch
      </button>
      {isHost ? (
        <button type="button" disabled={startNextBusy} onClick={() => void onStartNext()} className={BTN_ACCENT}>
          {startNextBusy ? "…" : "Start next (host)"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden bg-zinc-950 px-1 pb-1.5 sm:gap-2 sm:px-2 sm:pb-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
            <div
              className={`flex items-center rounded-md border px-2 py-1 tabular-nums ${
                (vm.phase === "playing" || vm.phase === "layoff") &&
                (vm.turnSeat === vm.mySeat ||
                  (vm.mustRespondDouble && Number(vm.pendingDouble?.responder_seat) === vm.mySeat))
                  ? "border-amber-400/38 bg-amber-950/50 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/65 text-zinc-400"
              }`}
            >
              {(vm.phase === "playing" || vm.phase === "layoff") && vm.turnTimeLeftSec != null ? (
                <span>
                  <span className="font-medium uppercase text-zinc-500">Timer</span>{" "}
                  <span className="font-semibold text-zinc-100">~{vm.turnTimeLeftSec}s</span>
                </span>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded border border-white/10 px-2 py-0.5 text-zinc-300">
                Stock {vm.stockCount} · Discard {vm.discardCount}
              </span>
              <span className="rounded border border-white/10 px-2 py-0.5 text-zinc-300">
                Table ×{vm.stakeMultiplier}
              </span>
              <span className="hidden rounded border border-white/10 px-2 py-0.5 sm:inline">You: {myColorLabel}</span>
            </div>
            {vaultClaimBusy ? (
              <span className="rounded-md border border-sky-500/18 bg-sky-950/35 px-2 py-0.5 text-[10px] text-sky-100/88">
                Settlement…
              </span>
            ) : null}
          </div>
        </div>
        {err ? (
          <div className="rounded-md border border-red-500/20 bg-red-950/20 px-2 py-1.5 text-[11px] text-red-200/95">
            <span>{err}</span>{" "}
            <button type="button" className="text-red-300 underline" onClick={() => setErr("")}>
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {vm.phase === "playing" && vm.discardTop != null && vm.turnPhase === "draw" ? (
          <p className="text-center text-[10px] text-zinc-500">
            Top discard: <span className="font-mono text-zinc-200">{mmFormatCard(vm.discardTop)}</span>
          </p>
        ) : null}

        {vm.phase === "playing" && vm.mySeat === vm.turnSeat && vm.turnPhase === "draw" && !vm.mustRespondDouble ? (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy || vm.stockCount <= 0}
              className={BTN_PRIMARY}
              onClick={() => void draw("stock")}
            >
              Draw stock
            </button>
            <button
              type="button"
              disabled={busy || vm.discardCount <= 0}
              className={BTN_SECONDARY}
              onClick={() => void draw("discard")}
            >
              Draw discard
            </button>
          </div>
        ) : null}

        {vm.phase === "playing" && vm.mySeat === vm.turnSeat && vm.turnPhase === "discard" && !vm.mustRespondDouble ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {vm.myHand.length === 11 && finishSuggestion ? (
              <button type="button" disabled={busy} className={BTN_ACCENT} onClick={() => setFinishPanelOpen(true)}>
                Finish hand
              </button>
            ) : null}
            {vm.canOfferDouble ? (
              <button type="button" disabled={busy} className={BTN_SECONDARY} onClick={() => void offerDouble()}>
                Increase table stake
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-2 sm:p-3">
          <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Your hand</p>
          <div className="flex flex-wrap justify-center gap-1 sm:gap-1.5">
            {vm.myHand.map((c, idx) => (
              <button
                key={`h-${idx}-${c}-${vm.revision}`}
                type="button"
                disabled={!canInteractHand && !(vm.phase === "layoff" && vm.turnSeat === vm.mySeat)}
                onClick={() => {
                  if (vm.phase === "layoff" && vm.turnSeat === vm.mySeat) {
                    void onLayoffAddCard(c);
                    return;
                  }
                  if (canInteractHand) void onCardDiscard(c);
                }}
                className={`min-w-[2.35rem] rounded-md border px-1.5 py-1 font-mono text-[10px] sm:min-w-[2.6rem] sm:text-[11px] ${
                  canInteractHand || (vm.phase === "layoff" && vm.turnSeat === vm.mySeat)
                    ? "border-sky-500/35 bg-sky-950/35 text-sky-100 active:scale-[0.97]"
                    : "cursor-default border-white/[0.06] bg-zinc-950/50 text-zinc-500"
                }`}
              >
                {mmFormatCard(c)}
              </button>
            ))}
          </div>
          {vm.opponentHandCount != null ? (
            <p className="mt-2 text-center text-[10px] text-zinc-500">Opponent hand: {vm.opponentHandCount} cards</p>
          ) : null}
        </div>

        {vm.phase === "layoff" && vm.turnSeat === vm.mySeat ? (
          <div className="rounded-lg border border-violet-500/25 bg-violet-950/20 p-2">
            <p className="text-[11px] text-violet-100/90">
              Lay off onto the closer&apos;s melds only. Pick a meld slot, then tap cards from your hand. When done, confirm
              scoring.
            </p>
            {layoffMeldsNorm.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {layoffMeldsNorm.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLayoffMeldPick(i)}
                    className={`rounded border px-2 py-1 font-mono text-[9px] ${
                      layoffMeldPick === i ? "border-violet-400/60 bg-violet-900/40" : "border-white/10 bg-zinc-900/60"
                    }`}
                  >
                    #{i + 1}: {m.map(mmFormatCard).join(" ")}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-500">Waiting for meld data…</p>
            )}
            {layoffAssignments.length ? (
              <p className="mt-2 text-[10px] text-zinc-400">
                Pending:{" "}
                {layoffAssignments.map((a, j) => (
                  <span key={j} className="mr-1 font-mono">
                    M{a.meld_index + 1}+{mmFormatCard(a.card_id)}
                  </span>
                ))}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => void onLayoffSubmit()}>
                Confirm scoring
              </button>
              <button
                type="button"
                disabled={busy}
                className={BTN_SECONDARY}
                onClick={() => void resolveLayoff([])}
              >
                Skip layoffs
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setLayoffAssignments([])}>
                Clear pending
              </button>
            </div>
          </div>
        ) : vm.phase === "layoff" ? (
          <p className="text-center text-[11px] text-zinc-400">Opponent is laying off…</p>
        ) : null}

        {(vm.phase === "finished" || vm.phase === "layoff") && vm.opponentHandRevealed.length > 0 ? (
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-2">
            <p className="text-[10px] font-semibold text-zinc-500">Revealed opponent hand</p>
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] text-zinc-300">
              {vm.opponentHandRevealed.map(c => (
                <span key={c}>{mmFormatCard(c)}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-1 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-500">
          <p>
            Missed turns: you {vm.mySeat != null ? vm.missedStreakBySeat[vm.mySeat] ?? 0 : "—"} · opponent{" "}
            {vm.mySeat === 0 ? vm.missedStreakBySeat[1] : vm.mySeat === 1 ? vm.missedStreakBySeat[0] : "—"}
          </p>
          <p className="sm:hidden">
            You {myColorLabel} · Opponent {oppColorLabel}
          </p>
          <button
            type="button"
            disabled={exitBusy || !pk}
            className="w-fit text-sky-300 underline disabled:opacity-45"
            onClick={() => void onExitToLobby()}
          >
            {exitBusy ? "Leaving…" : "Leave table"}
          </button>
          {exitErr ? <span className="text-red-300">{exitErr}</span> : null}
        </div>
      </div>

      {finishPanelOpen && finishSuggestion ? (
        <Ov2SharedFinishModalFrame variant="center" titleId="ov2-mm-finish-hand-title">
          <div className="p-4">
            <p id="ov2-mm-finish-hand-title" className="text-sm font-semibold text-zinc-100">
              Finish hand
            </p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Suggested {finishSuggestion.kind === "gin" ? "perfect finish" : "early finish"} — discard{" "}
              <span className="font-mono text-zinc-200">{mmFormatCard(finishSuggestion.discard)}</span>, deadwood pts{" "}
              {finishSuggestion.deadwoodPts}.
            </p>
            <p className="mt-2 text-[10px] text-zinc-500">Melds (server validates):</p>
            <ul className="mt-1 max-h-32 overflow-y-auto text-[10px] font-mono text-zinc-300">
              {finishSuggestion.melds.map((m, i) => (
                <li key={i}>{m.map(mmFormatCard).join(" ")}</li>
              ))}
            </ul>
            {finishSuggestion.deadwood.length ? (
              <p className="mt-2 text-[10px] text-zinc-500">
                Deadwood: {finishSuggestion.deadwood.map(mmFormatCard).join(" ")}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => void onSubmitFinish()}>
                Submit to server
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setFinishPanelOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}

      <Ov2SharedStakeDoubleModal
        open={vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble}
        proposedMult={vm.pendingDouble?.proposed_mult}
        stakeMultiplier={vm.stakeMultiplier}
        busy={busy}
        onAccept={() => void respondDouble(true)}
        onDecline={() => void respondDouble(false)}
      />

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-mm-finish-title">
          <div className="p-4">
            <p id="ov2-mm-finish-title" className="text-center text-sm font-semibold text-zinc-100">
              {isDraw ? "Draw — entries returned" : didIWin ? "You won" : `${winnerDisplayName} won`}
            </p>
            {!isDraw && vm.result && vm.result.knockFinish ? (
              <p className="mt-2 text-center text-[10px] text-zinc-400">
                Closer deadwood {String(vm.result.closerDeadwood ?? "—")} vs opponent after layoffs{" "}
                {String(vm.result.opponentDeadwoodAfterLayoff ?? "—")}
              </p>
            ) : null}
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              {vaultClaimBusy ? "Sending results to your balance…" : "Hand complete. Rematch, then host starts the next match."}
            </p>
            <div className="mt-4">{finishedActions}</div>
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-white/10 py-2 text-[11px] text-zinc-300"
              onClick={() => {
                setFinishModalDismissedSessionId(finishSessionId);
                try {
                  window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Dismiss
            </button>
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}
    </div>
  );
}
