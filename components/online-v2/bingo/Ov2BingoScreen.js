"use client";

import { useCallback, useMemo, useState } from "react";
import { BINGO_PRIZE_KEYS } from "../../../lib/online-v2/bingo/ov2BingoEngine";
import { OV2_BINGO_PLAY_MODE } from "../../../lib/online-v2/bingo/ov2BingoSessionAdapter";
import { useOv2BingoSession } from "../../../hooks/useOv2BingoSession";
import Ov2BingoCard from "./Ov2BingoCard";
import Ov2GameStatusStrip from "../shared/Ov2GameStatusStrip";

/** @param {number|null|undefined} ms */
function fmtCountdown(ms) {
  if (ms == null) return "—";
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 120) return `${Math.ceil(s / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${s}s`;
}

/** @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null }} props */
export default function Ov2BingoScreen({ contextInput = null }) {
  const session = useOv2BingoSession(contextInput ?? undefined);
  const { vm, actions, selfKey, callNextPreviewNumber, resetPreviewRound, onToggleMark, previewDisabledReasonCallNext } =
    session;
  const [claimToast, setClaimToast] = useState(/** @type {{ kind: "ok"|"err", text: string }|null} */ (null));

  const isRoomShell = vm.playMode === OV2_BINGO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;
  const isLiveMatch = vm.playMode === OV2_BINGO_PLAY_MODE.LIVE_MATCH_ACTIVE;
  const stripTone = isLiveMatch ? "emerald" : isRoomShell ? "amber" : "neutral";
  const stripTitle = isLiveMatch ? "Bingo · live" : isRoomShell ? "Bingo · room" : "Bingo · local preview";

  const prizeLabels = useMemo(
    () => ({
      row1: "Row 1",
      row2: "Row 2",
      row3: "Row 3",
      row4: "Row 4",
      row5: "Row 5",
      full: "Full",
    }),
    []
  );

  const seatSlots = useMemo(() => {
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const member = vm.membersVm.find(m => m.seatIndex === i) || null;
      slots.push({ seatIndex: i, member });
    }
    return slots;
  }, [vm.membersVm]);

  const onClaim = useCallback(
    async prizeKey => {
      setClaimToast(null);
      const r = await actions.claimPrize(prizeKey);
      if (r.ok) setClaimToast({ kind: "ok", text: `Claim recorded: ${prizeLabels[prizeKey] || prizeKey}` });
      else setClaimToast({ kind: "err", text: String(r.error || "Claim failed") });
    },
    [actions, prizeLabels]
  );

  const cardFooterHint = useMemo(() => {
    if (!vm.isLive) return null;
    if (!vm.cardIsAuthoritative) return "Take a seat in the lobby to see your card for this round.";
    return null;
  }, [vm.isLive, vm.cardIsAuthoritative]);

  const phaseHeader = useMemo(() => {
    const life = vm.roomLifecyclePhase || "";
    const sp = vm.sessionPhase || "";
    if (isLiveMatch && sp === "playing") return "Playing";
    if (isLiveMatch && sp === "finished") return "Finished";
    if (life === "lobby") return "Waiting for players";
    if (life === "pending_start" || life === "pending_stakes") return "Waiting for stake commits";
    if (life === "active" && !vm.roomActiveSessionId) return "Waiting for host to open Bingo";
    if (life === "active" && vm.roomActiveSessionId) return "Match";
    return sp || life || "—";
  }, [isLiveMatch, vm.roomLifecyclePhase, vm.sessionPhase, vm.roomActiveSessionId]);

  const playingLive = Boolean(vm.isLive && isLiveMatch && vm.sessionPhase === "playing");
  const liveExceptionUi = Boolean(vm.isLive && !playingLive);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden px-0.5 sm:gap-1 sm:px-1">
      <Ov2GameStatusStrip title={stripTitle} subtitle={vm.phaseLine} tone={stripTone} compact={Boolean(vm.isLive)} />

      <div
        className="shrink-0 overflow-x-auto rounded-lg border border-white/10 bg-black/35 py-0.5 [scrollbar-width:thin] sm:py-1"
        aria-label="Seats"
      >
        <div className="flex min-w-max gap-1 px-1">
          {seatSlots.map(({ seatIndex, member }) => {
            const you = Boolean(selfKey && member?.participantKey === selfKey);
            const isCaller = vm.callerSeatIndex != null && vm.callerSeatIndex === seatIndex;
            const isWinner =
              Boolean(vm.winner?.participantKey && member?.participantKey && vm.winner.participantKey === member.participantKey);
            const label = member?.displayName?.trim() || (member ? "Player" : "Empty");
            return (
              <div
                key={seatIndex}
                className={[
                  "flex min-h-[2.5rem] w-[5.25rem] shrink-0 flex-col justify-center rounded-md border px-1.5 py-1 text-[9px] leading-tight sm:min-h-[2.8125rem] sm:w-[6rem] sm:py-1.5 sm:text-[10px]",
                  member ? "border-white/20 bg-white/10" : "border-white/10 bg-black/20 text-zinc-500",
                  you ? "ring-1 ring-sky-400/80" : "",
                  isCaller ? "border-amber-400/50 bg-amber-950/35" : "",
                  isWinner ? "border-emerald-400/50 bg-emerald-950/30" : "",
                ].join(" ")}
                title={member ? `${label}${member.isReady ? " · Ready" : ""}` : `Seat ${seatIndex + 1} · Open`}
              >
                <div className="truncate font-semibold text-zinc-100">{label}</div>
                <div className="mt-1 text-[8px]">
                  {member ? (
                    <span className={member.isReady ? "text-emerald-300" : "text-zinc-500"}>
                      {member.isReady ? "Ready" : "Idle"}
                    </span>
                  ) : (
                    <span className="text-zinc-600">Open</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {playingLive ? (
        <div
          className="flex shrink-0 flex-nowrap items-stretch gap-2 overflow-x-auto rounded-lg border border-white/10 bg-black/30 px-2 py-2 [scrollbar-width:thin] sm:gap-3 sm:px-4 sm:py-3"
          aria-label="Live match stats"
        >
          <span className="flex h-[2.25rem] max-h-[2.25rem] min-w-[5.5rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-black/40 px-3 py-0 text-xs leading-tight text-zinc-400 sm:h-[2.5rem] sm:max-h-[2.5rem] sm:min-w-0 sm:px-4 sm:text-sm">
            <span className="font-semibold text-zinc-500">Last</span>
            <span className="font-mono font-semibold text-amber-100">{vm.lastCalled ?? "—"}</span>
          </span>
          <span className="flex h-[2.25rem] max-h-[2.25rem] min-w-[5.5rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-black/40 px-3 py-0 text-xs leading-tight text-zinc-400 sm:h-[2.5rem] sm:max-h-[2.5rem] sm:min-w-0 sm:px-4 sm:text-sm">
            <span className="font-semibold text-zinc-500">Next</span>
            <span className="font-mono font-semibold text-zinc-100">{fmtCountdown(vm.msUntilNextCall)}</span>
          </span>
          <span className="flex h-[2.25rem] max-h-[2.25rem] min-w-[5.5rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-black/40 px-3 py-0 text-xs leading-tight text-zinc-400 sm:h-[2.5rem] sm:max-h-[2.5rem] sm:min-w-0 sm:px-4 sm:text-sm">
            <span className="font-semibold text-zinc-500">Deck</span>
            <span className="font-mono font-semibold text-zinc-200">
              {vm.deckRemaining}/{vm.deckTotal}
            </span>
          </span>
        </div>
      ) : null}

      {vm.isLive && liveExceptionUi ? (
        <div className="shrink-0 rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 sm:flex sm:items-start sm:gap-4 sm:py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">Status</div>
            <div className="mt-0.5 text-[11px] font-semibold leading-snug text-zinc-100 sm:text-xs">{phaseHeader}</div>
            {vm.phaseLine ? <p className="mt-0.5 text-[9px] leading-snug text-zinc-400 sm:text-[10px]">{vm.phaseLine}</p> : null}
          </div>
          {!playingLive && isLiveMatch && vm.sessionPhase !== "playing" ? (
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <div>
                <div className="text-[9px] font-semibold text-zinc-500">Last called</div>
                <div className="font-mono text-sm text-amber-100">{vm.lastCalled ?? "—"}</div>
              </div>
              <div>
                <div className="text-[9px] font-semibold text-zinc-500">Next</div>
                <div className="font-mono text-sm text-zinc-100">{fmtCountdown(vm.msUntilNextCall)}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!vm.isLive ? (
        <div className="grid shrink-0 gap-1 rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 sm:grid-cols-3 sm:px-2 sm:py-1.5">
          <div className="text-[9px] text-zinc-300 sm:text-[10px]">
            <div className="font-semibold text-zinc-500">Phase</div>
            <div className="mt-0.5 text-zinc-100">{phaseHeader}</div>
          </div>
          <div className="text-[9px] text-zinc-300 sm:text-[10px]">
            <div className="font-semibold text-zinc-500">Last</div>
            <div className="mt-0.5 font-mono text-xs text-amber-100 sm:text-sm">{vm.lastCalled ?? "—"}</div>
          </div>
          <div className="text-[9px] text-zinc-300 sm:text-[10px]">
            <div className="font-semibold text-zinc-500">Next</div>
            <div className="mt-0.5 font-mono text-xs text-zinc-100 sm:text-sm">—</div>
          </div>
        </div>
      ) : null}

      {!vm.isLive ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 rounded-lg border border-white/10 bg-black/30 px-1.5 py-1">
          <div className="mr-auto text-[10px] text-zinc-500">
            Deck {vm.deckRemaining}/{vm.deckTotal}
            {vm.previewLine?.isFull
              ? " · board full (preview)"
              : vm.previewLine?.hasAnyRow
                ? " · row complete (preview)"
                : ""}
          </div>
          <button
            type="button"
            onClick={() => resetPreviewRound()}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white sm:py-1"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => callNextPreviewNumber()}
            disabled={vm.deckRemaining <= 0 || Boolean(previewDisabledReasonCallNext)}
            title={previewDisabledReasonCallNext || undefined}
            className="rounded-md border border-amber-500/40 bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-100 disabled:opacity-40 sm:py-1"
          >
            Call next
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden sm:gap-1 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-5 lg:grid-rows-1 lg:auto-rows-[minmax(0,1fr)] lg:gap-1.5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/25 p-1 lg:col-span-3 lg:min-h-0 lg:h-full">
          <div className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">Your card</div>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-hidden py-0.5 sm:overflow-y-auto sm:py-1">
            <Ov2BingoCard
              card={vm.card}
              called={vm.called}
              marks={vm.marks}
              wonPrizeKeys={vm.wonPrizeKeys}
              onToggleMark={onToggleMark}
              disabled={vm.isLive && !vm.cardIsAuthoritative}
            />
          </div>
          {cardFooterHint ? (
            <p className="shrink-0 text-center text-[9px] text-amber-200/90 sm:text-[10px]">{cardFooterHint}</p>
          ) : null}
        </div>

        <div className="flex min-h-0 min-w-0 shrink-0 flex-col gap-0.5 sm:gap-1 lg:col-span-2 lg:flex lg:min-h-0 lg:h-full lg:flex-col lg:overflow-hidden">
          <div className="flex h-[7.875rem] max-h-[7.875rem] shrink-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/25 px-1.5 py-1 sm:h-[11.5rem] sm:max-h-[11.5rem] sm:px-2 sm:py-1.5 lg:h-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            <div className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">
              Called numbers
            </div>
            <div className="mt-0.5 min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:thin]">
              {vm.called.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(1.5625rem,1fr))] gap-[3px] sm:grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] sm:gap-2">
                  {vm.called.map((n, i) => (
                    <span
                      key={`${n}-${i}`}
                      className={`rounded border px-1 py-0.5 text-center text-[10px] font-semibold leading-tight sm:flex sm:min-h-0 sm:items-center sm:justify-center sm:px-1.5 sm:py-1 sm:text-sm sm:leading-normal ${
                        i === vm.called.length - 1
                          ? "border-amber-400 bg-amber-700/85 text-white"
                          : "border-white/10 bg-white/10 text-zinc-200"
                      }`}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[9px] text-zinc-500 sm:text-[10px]">
                  {vm.isLive ? "Waiting for the caller to draw." : "Use “Call next” in preview to draw numbers."}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 rounded-lg border border-white/10 bg-black/25 px-1.5 py-1 sm:px-2 sm:py-1.5 lg:shrink-0">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">Claim a prize</div>
            <div className="mt-0.5 grid grid-cols-3 gap-0.5 sm:grid-cols-6 sm:gap-1">
              {BINGO_PRIZE_KEYS.map(pk => {
                const reason = vm.prizeDisabledByKey[pk] ?? "Unavailable";
                const blocked = Boolean(reason);
                return (
                  <button
                    key={pk}
                    type="button"
                    disabled={blocked || !isLiveMatch || vm.sessionPhase !== "playing"}
                    title={blocked ? reason : `Claim ${prizeLabels[pk]}`}
                    onClick={() => void onClaim(pk)}
                    className={`rounded-md border px-1 py-1 text-[9px] font-semibold sm:py-1.5 sm:text-[10px] ${
                      !blocked && isLiveMatch && vm.sessionPhase === "playing"
                        ? "border-emerald-500/40 bg-emerald-950/35 text-emerald-100 hover:bg-emerald-900/40"
                        : "cursor-not-allowed border-white/10 bg-white/5 text-zinc-500 opacity-80"
                    }`}
                  >
                    {prizeLabels[pk]}
                  </button>
                );
              })}
            </div>
            {claimToast ? (
              <div
                className={`mt-2 rounded border px-2 py-1 text-[10px] ${
                  claimToast.kind === "ok"
                    ? "border-emerald-500/35 bg-emerald-950/30 text-emerald-100"
                    : "border-red-500/35 bg-red-950/30 text-red-200"
                }`}
                role="status"
              >
                {claimToast.text}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {(vm.sessionPhase === "finished" || (vm.announcement && isLiveMatch)) && (
        <div className="shrink-0 space-y-1 rounded-lg border border-white/15 bg-black/35 px-2 py-2 text-[10px]">
          {vm.announcement ? <p className="text-center text-zinc-200">{vm.announcement}</p> : null}
          {isLiveMatch && vm.sessionPhase === "finished" ? (
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-center">
              <button
                type="button"
                disabled={!vm.canRequestRematch || Boolean(vm.disabledReasons.rematch)}
                title={vm.disabledReasons.rematch || undefined}
                onClick={() => void actions.requestRematch()}
                className="rounded-md border border-amber-500/40 bg-amber-950/35 px-2 py-1.5 font-semibold text-amber-100 disabled:opacity-40"
              >
                Request rematch
              </button>
              <button
                type="button"
                disabled={!vm.canCancelRematch || Boolean(vm.disabledReasons.cancelRematch)}
                title={vm.disabledReasons.cancelRematch || undefined}
                onClick={() => void actions.cancelRematch()}
                className="rounded-md border border-white/20 bg-white/10 px-2 py-1.5 font-semibold text-zinc-200 disabled:opacity-40"
              >
                Cancel rematch
              </button>
              <button
                type="button"
                disabled={!vm.canStartNextMatch || Boolean(vm.disabledReasons.startNextMatch)}
                title={vm.disabledReasons.startNextMatch || undefined}
                onClick={() => void actions.startNextMatch()}
                className="rounded-md border border-emerald-500/40 bg-emerald-950/35 px-2 py-1.5 font-semibold text-emerald-100 disabled:opacity-40"
              >
                Start next match (host)
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
