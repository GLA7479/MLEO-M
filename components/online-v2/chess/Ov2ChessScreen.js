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
  "w-full rounded-lg border border-[#4a3035]/80 bg-gradient-to-b from-[#2e2226] to-[#10090b] py-2 px-3 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.38)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

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
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-1 pb-1.5 sm:gap-2 sm:px-2 sm:pb-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-2 sm:py-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] sm:text-[12px]">
            <div
              className={`flex min-h-[1.625rem] items-center rounded-md border px-2.5 py-1 tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_2px_rgba(0,0,0,0.35)] ${
                vm.phase === "playing" && vm.turnSeat === vm.mySeat
                  ? "border-amber-400/38 bg-amber-950/50 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/65 text-zinc-400"
              }`}
            >
              {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                <span className="tracking-wide">
                  <span className="text-[10px] font-medium uppercase text-zinc-500 sm:text-[10px]">Turn</span>{" "}
                  <span className="text-[12px] font-semibold text-zinc-100 sm:text-[13px]">~{vm.turnTimeLeftSec}s</span>
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

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_72%_58%_at_50%_50%,transparent_40%,rgba(0,0,0,0.2)_100%)]">
        <div
          className="relative z-[1] -mt-1.5 mb-[-4px] w-full max-w-[min(100%,448px)] rounded-[10px] p-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_8px_22px_rgba(0,0,0,0.35)] sm:max-w-[min(100%,548px)]"
          style={{ background: "#1F1A16" }}
        >
          <div
            className="relative overflow-hidden rounded-[8px] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{ background: "#141210" }}
          >
            <div
              className="relative grid aspect-square w-full gap-0 rounded-[6px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
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
                  ? "bg-[#E6DCC8] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                  : "bg-[#4A3A2C] shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)]";
                return (
                  <button
                    key={viewPos}
                    type="button"
                    disabled={vm.readOnly || busy}
                    onClick={() => void onCellClick(viewPos)}
                    className={`relative flex min-h-0 min-w-0 items-center justify-center outline-none transition-[box-shadow,background-color,opacity] disabled:opacity-50 ${baseSq} ${
                      kingThreat
                        ? "z-[1] before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-rose-950/30 before:content-['']"
                        : ""
                    } ${ringClass}`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    aria-label={kingThreat ? "King in check" : undefined}
                  >
                    {pieceSrc ? (
                      <div className="relative z-[1] aspect-square w-[clamp(14px,11vw,28px)] shrink-0 sm:w-[clamp(15px,10.5vw,30px)]">
                        <img
                          src={pieceSrc}
                          alt=""
                          draggable={false}
                          className="h-full w-full select-none object-contain [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.22))]"
                        />
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {promoOpen ? (
                <div
                  className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 border-t border-white/[0.08] bg-[#0a0a09]/96 px-2 py-2.5 shadow-[0_-10px_28px_rgba(0,0,0,0.6)] backdrop-blur-sm sm:py-3"
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
                        className="flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-600/28 bg-gradient-to-b from-zinc-800/75 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_6px_rgba(0,0,0,0.3)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45 sm:h-14 sm:w-14"
                        aria-label={`Promote to ${({ q: "queen", Q: "queen", r: "rook", R: "rook", b: "bishop", B: "bishop", n: "knight", N: "knight" }[l] || "piece")}`}
                      >
                        <div className="h-8 w-8 shrink-0 sm:h-9 sm:w-9">
                          <img
                            src={pieceImageSrc(l) || ""}
                            alt=""
                            draggable={false}
                            className="h-full w-full select-none object-contain [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.28))]"
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
        <div className="shrink-0 space-y-2 rounded-xl border border-white/[0.14] bg-gradient-to-b from-zinc-900/82 to-zinc-950 p-3 text-[11px] text-zinc-200/92 shadow-[0_16px_44px_rgba(0,0,0,0.5),0_0_0_1px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-10px_24px_rgba(0,0,0,0.3)]">
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

      <div className="shrink-0">
        <button type="button" disabled={exitBusy || !pk} onClick={() => void onExitToLobby()} className={BTN_DANGER}>
          {exitBusy ? "Leaving…" : "Leave table"}
        </button>
        {exitErr ? <p className="mt-1 min-h-[1rem] text-[10px] text-red-300/95">{exitErr}</p> : null}
      </div>
    </div>
  );
}
