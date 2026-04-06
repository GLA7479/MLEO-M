"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  normalizeOv2ChessSquares,
  ov2ChessKingCheckHighlights,
  ov2ChessMoveNeedsPromotion,
  ov2ChessPieceOwnedBySeat,
  ov2ChessViewToServerIdx,
} from "../../../lib/online-v2/chess/ov2ChessBoardView";
import { useOv2ChessSession } from "../../../hooks/useOv2ChessSession";

/** Shared premium button language (Chess + Checkers product family). */
const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/28 bg-gradient-to-b from-emerald-950/70 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_4px_14px_rgba(0,0,0,0.32)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/28 bg-gradient-to-b from-zinc-800/55 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_12px_rgba(0,0,0,0.28)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/28 bg-gradient-to-b from-sky-950/65 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_14px_rgba(0,0,0,0.3)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "w-full rounded-lg border border-white/[0.12] bg-gradient-to-b from-[#2a2228] via-[#1c161a] to-[#121014] py-2 px-3 text-[11px] font-semibold text-rose-100/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_18px_rgba(0,0,0,0.42),0_0_0_1px_rgba(0,0,0,0.35)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** Local cburnett SVG set under `public/assets/chess/cburnett/`. */
const CBURNETT_BASE = "/assets/chess/cburnett";

const PIECE_SVG = {
  P: "wP",
  R: "wR",
  N: "wN",
  B: "wB",
  Q: "wQ",
  K: "wK",
  p: "bP",
  r: "bR",
  n: "bN",
  b: "bB",
  q: "bQ",
  k: "bK",
};

function pieceImageSrc(ch) {
  const c = String(ch || ".").trim().slice(0, 1);
  const id = PIECE_SVG[c];
  if (!id) return null;
  return `${CBURNETT_BASE}/${id}.svg`;
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2ChessScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2ChessSession(contextInput ?? undefined);
  const { snapshot, vm, busy, vaultClaimBusy, err, setErr, applyMove, requestRematch, cancelRematch, startNextMatch, isHost, roomMatchSeq } =
    session;
  const [selServerIdx, setSelServerIdx] = useState(/** @type {number|null} */ (null));
  const [promoOpen, setPromoOpen] = useState(/** @type {{ from: number, to: number }|null} */ (null));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";

  useEffect(() => {
    setSelServerIdx(null);
    setPromoOpen(null);
  }, [vm.sessionId, vm.revision]);

  const squares = useMemo(() => normalizeOv2ChessSquares(vm.squares), [vm.squares]);
  const turn = vm.turnSeat != null ? Number(vm.turnSeat) : null;
  const mySeat = vm.mySeat;

  const checkHighlight = useMemo(() => {
    if (String(vm.phase) !== "playing" || turn == null) {
      return { inCheck: false, kingServerIdx: -1, attackerServerIdxs: [] };
    }
    return ov2ChessKingCheckHighlights(squares, turn);
  }, [squares, turn, vm.phase]);

  const attackerServerSet = useMemo(() => new Set(checkHighlight.attackerServerIdxs), [checkHighlight.attackerServerIdxs]);

  const promoLetters = mySeat === 0 ? (["Q", "R", "B", "N"]) : mySeat === 1 ? (["q", "r", "b", "n"]) : (["Q", "R", "B", "N"]);

  const onCellClick = useCallback(
    async viewIdx => {
      if (vm.readOnly || !vm.canClientMove || busy || vaultClaimBusy) return;
      if (turn == null || mySeat == null) return;
      const serverIdx = ov2ChessViewToServerIdx(viewIdx, mySeat);
      const ch = squares[serverIdx] || ".";

      if (selServerIdx == null) {
        if (turn !== mySeat) return;
        if (!ov2ChessPieceOwnedBySeat(ch, mySeat)) {
          setErr("Select your piece.");
          return;
        }
        setSelServerIdx(serverIdx);
        setErr("");
        return;
      }

      if (serverIdx === selServerIdx) {
        setSelServerIdx(null);
        setErr("");
        return;
      }

      if (turn === mySeat && ov2ChessPieceOwnedBySeat(ch, mySeat)) {
        setSelServerIdx(serverIdx);
        setErr("");
        return;
      }

      if (ov2ChessMoveNeedsPromotion(squares, selServerIdx, serverIdx)) {
        setPromoOpen({ from: selServerIdx, to: serverIdx });
        setErr("");
        return;
      }

      const r = await applyMove(selServerIdx, serverIdx, "Q");
      setSelServerIdx(null);
      if (!r.ok) {
        /* err set */
      }
    },
    [vm, busy, vaultClaimBusy, turn, mySeat, squares, selServerIdx, applyMove, setErr]
  );

  const onPickPromo = useCallback(
    async letter => {
      if (!promoOpen) return;
      const { from, to } = promoOpen;
      setPromoOpen(null);
      const r = await applyMove(from, to, String(letter || "Q").toUpperCase().slice(0, 1));
      setSelServerIdx(null);
      if (!r.ok) {
        /* */
      }
    },
    [promoOpen, applyMove]
  );

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

  const finished = vm.phase === "finished";
  const rk =
    snapshot?.board && typeof snapshot.board === "object" && snapshot.board.resultKind != null
      ? String(snapshot.board.resultKind)
      : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden bg-zinc-950 px-1 pb-1.5 sm:gap-2 sm:px-2 sm:pb-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="rounded-lg border border-white/[0.1] bg-zinc-900/55 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_18px_rgba(0,0,0,0.22)] sm:px-2 sm:py-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] sm:text-[12px]">
            <div
              className={`flex min-h-[1.625rem] items-center rounded-md border px-2.5 py-1 tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_2px_rgba(0,0,0,0.3)] ${
                vm.phase === "playing" && vm.turnSeat === vm.mySeat
                  ? "border-amber-400/42 bg-amber-950/48 text-amber-50/95"
                  : "border-white/[0.14] bg-zinc-900/50 text-zinc-300/90"
              }`}
            >
              {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                <span className="tracking-wide">
                  <span className="text-[10px] font-medium uppercase text-zinc-500 sm:text-[10px]">Turn</span>{" "}
                  <span className="text-[12px] font-semibold text-zinc-50 sm:text-[13px]">~{vm.turnTimeLeftSec}s</span>
                </span>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </div>
            {vaultClaimBusy ? (
              <span className="rounded-md border border-sky-500/18 bg-sky-950/35 px-2 py-0.5 text-[10px] font-medium text-sky-100/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                Settlement…
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex min-h-[2.5rem] flex-col justify-center text-[11px] leading-snug">
          {err ? (
            <div className="rounded-md border border-red-500/20 bg-red-950/20 px-2 py-1.5 text-red-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <p className="pr-1">
                {err}{" "}
                <button
                  type="button"
                  className="ml-1 inline align-baseline text-[10px] font-medium text-red-300/90 underline decoration-red-400/40 underline-offset-2 transition hover:text-red-200"
                  onClick={() => setErr("")}
                >
                  Dismiss
                </button>
              </p>
            </div>
          ) : (
            <div className="min-h-[2.5rem]" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <div
          className="relative z-[1] -mt-1.5 mb-[-4px] w-full max-w-[min(100%,448px)] rounded-[10px] p-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_0_0_1px_rgba(0,0,0,0.55),0_10px_36px_rgba(0,0,0,0.5),0_0_64px_rgba(18,26,42,0.35),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-2px_5px_rgba(0,0,0,0.32)] sm:max-w-[min(100%,548px)]"
          style={{
            background: "linear-gradient(152deg, #8c5f45 0%, #5a3524 38%, #3a2218 65%, #5c3a28 100%)",
          }}
        >
          <div
            className="relative overflow-hidden rounded-[8px] p-0.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.07),inset_0_-3px_8px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(0,0,0,0.28)]"
            style={{
              background: "linear-gradient(172deg, #2a201c 0%, #181210 48%, #1f1612 100%)",
            }}
          >
            <div
              className="relative grid aspect-square w-full gap-0 rounded-[6px] shadow-[inset_0_0_28px_rgba(0,0,0,0.36),inset_0_0_52px_rgba(0,0,0,0.1)]"
              style={{
                gridTemplateColumns: "repeat(8, 1fr)",
                gridTemplateRows: "repeat(8, 1fr)",
              }}
            >
              {Array.from({ length: 64 }, (_, viewPos) => {
                const r = Math.floor(viewPos / 8);
                const c = viewPos % 8;
                const light = (r + c) % 2 === 0;
                const serverIdx = mySeat != null ? ov2ChessViewToServerIdx(viewPos, mySeat) : viewPos;
                const p = squares[serverIdx] ?? ".";
                const sel = selServerIdx === serverIdx;
                const pieceSrc = pieceImageSrc(p);
                const kingThreat = checkHighlight.inCheck && checkHighlight.kingServerIdx === serverIdx;
                const attackingKing = attackerServerSet.has(serverIdx);
                const ringClass = sel
                  ? "z-[2] shadow-[inset_0_0_0_2px_rgba(125,211,252,0.42)]"
                  : attackingKing
                    ? "z-[1] shadow-[inset_0_0_0_1px_rgba(217,119,6,0.45)]"
                    : "";
                const baseSq = light
                  ? "bg-[#e0b078] shadow-[inset_0_1px_0_rgba(255,250,240,0.32),inset_0_-1px_0_rgba(0,0,0,0.09)]"
                  : "bg-[#4a3020] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-2px_0_rgba(0,0,0,0.28)]";
                return (
                  <button
                    key={viewPos}
                    type="button"
                    disabled={vm.readOnly || busy}
                    onClick={() => void onCellClick(viewPos)}
                    className={`relative flex min-h-0 min-w-0 items-center justify-center outline-none transition-[box-shadow,opacity] disabled:opacity-50 ${baseSq} ${
                      kingThreat
                        ? "z-[1] before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-rose-950/30 before:content-['']"
                        : ""
                    } ${ringClass}`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    aria-label={kingThreat ? "King in check" : undefined}
                  >
                    {pieceSrc ? (
                      <div className="relative z-[1] aspect-square w-[85%] max-w-full shrink-0">
                        <img
                          src={pieceSrc}
                          alt=""
                          draggable={false}
                          className={`h-full w-full select-none object-contain ${
                            p === p.toUpperCase() && p !== "."
                              ? "[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.09))_drop-shadow(0_2px_2.5px_rgba(0,0,0,0.05))_brightness(0.99)_contrast(1.03)_saturate(1.02)]"
                              : "[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.14))_drop-shadow(0_2px_3px_rgba(0,0,0,0.065))_brightness(1.03)_contrast(1.03)]"
                          }`}
                        />
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {promoOpen ? (
                <div
                  className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 border-t border-white/[0.08] bg-zinc-950 px-2 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] sm:py-3"
                  role="dialog"
                  aria-label="Choose promotion piece"
                >
                  <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:text-[11px]">
                    Promote pawn
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                    {promoLetters.map(l => (
                      <button
                        key={l}
                        type="button"
                        disabled={busy}
                        onClick={() => void onPickPromo(l)}
                        className="flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-600/28 bg-zinc-800/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_6px_rgba(0,0,0,0.28)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45 sm:h-14 sm:w-14"
                        aria-label={`Promote to ${({ q: "queen", Q: "queen", r: "rook", R: "rook", b: "bishop", B: "bishop", n: "knight", N: "knight" }[l] || "piece")}`}
                      >
                        <div className="relative aspect-square w-[85%] max-w-full shrink-0">
                          <img
                            src={pieceImageSrc(l) || ""}
                            alt=""
                            draggable={false}
                            className={`h-full w-full select-none object-contain ${
                              String(l) === String(l).toUpperCase()
                                ? "[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.09))_drop-shadow(0_2px_2.5px_rgba(0,0,0,0.05))_brightness(0.99)_contrast(1.03)_saturate(1.02)]"
                                : "[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.14))_drop-shadow(0_2px_3px_rgba(0,0,0,0.065))_brightness(1.03)_contrast(1.03)]"
                            }`}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {finished ? (
        <div className="shrink-0 space-y-2 rounded-xl border border-white/[0.12] bg-zinc-900/88 p-3 text-[11px] text-zinc-200/92 shadow-[0_12px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Result</p>
          <p className="mt-1 text-sm font-semibold text-zinc-50">Match finished</p>
          {rk === "stalemate" ? (
            <p className="mt-1 text-zinc-400/90">Draw by stalemate.</p>
          ) : vm.winnerSeat != null && vm.mySeat != null ? (
            <p className="mt-1 text-zinc-400/90">{vm.winnerSeat === vm.mySeat ? "You won." : "You lost."}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.1] pt-3">
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
        </div>
      ) : null}

      <div className="shrink-0 rounded-lg border border-white/[0.08] bg-zinc-900/45 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <button type="button" disabled={exitBusy || !pk} onClick={() => void onExitToLobby()} className={BTN_DANGER}>
          {exitBusy ? "Leaving…" : "Leave table"}
        </button>
        {exitErr ? <p className="mt-1 min-h-[1rem] text-[10px] text-red-300/95">{exitErr}</p> : null}
      </div>
    </div>
  );
}
