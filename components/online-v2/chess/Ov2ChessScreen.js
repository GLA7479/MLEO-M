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
  ov2ChessServerToViewIdx,
  ov2ChessViewToServerIdx,
} from "../../../lib/online-v2/chess/ov2ChessBoardView";
import { requestOv2ChessLegalTos } from "../../../lib/online-v2/chess/ov2ChessSessionAdapter";
import { useOv2ChessSession } from "../../../hooks/useOv2ChessSession";
import Ov2BoardDuelPlayerHeader from "../shared/Ov2BoardDuelPlayerHeader";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import Ov2SharedStakeDoubleModal from "../Ov2SharedStakeDoubleModal";

const finishDismissStorageKey = sid => `ov2_chess_finish_dismiss_${sid}`;

/** Shared premium button language (Chess + Checkers product family). */
const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
/** Same tokens as `Ov2FourLineScreen` finish modal footer */
const BTN_FINISH_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

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
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    applyMove,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;
  const [selServerIdx, setSelServerIdx] = useState(/** @type {number|null} */ (null));
  const [promoOpen, setPromoOpen] = useState(/** @type {{ from: number, to: number }|null} */ (null));
  const [legalTosServer, setLegalTosServer] = useState(/** @type {number[]} */ ([]));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  const seatDisplayName = useMemo(() => {
    /** @type {{ 0: string, 1: string }} */
    const out = { 0: "", 1: "" };
    for (const m of members) {
      const si = m?.seat_index;
      if (si !== 0 && si !== 1) continue;
      out[si] = String(m?.display_name ?? "").trim();
    }
    return out;
  }, [members]);
  const seat0Label = seatDisplayName[0] ? seatDisplayName[0] : "Guest";
  const seat1Label = seatDisplayName[1] ? seatDisplayName[1] : "Guest";

  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const turn = vm.turnSeat != null ? Number(vm.turnSeat) : null;
  const mySeat = vm.mySeat;

  const indicatorSeat = useMemo(() => {
    if (String(vm.phase || "").toLowerCase() !== "playing") return null;
    if (vm.mustRespondDouble && vm.pendingDouble?.responder_seat != null) {
      const rs = Number(vm.pendingDouble.responder_seat);
      if (rs === 0 || rs === 1) return rs;
    }
    const t = vm.turnSeat;
    return t === 0 || t === 1 ? t : null;
  }, [vm.phase, vm.mustRespondDouble, vm.pendingDouble, vm.turnSeat]);

  const canOfferDoubleNow =
    vm.phase === "playing" &&
    vm.mySeat === vm.turnSeat &&
    vm.mustRespondDouble !== true &&
    vm.canOfferDouble === true;

  const stakeBtnDisabled = busy || vaultClaimBusy || !canOfferDoubleNow;

  useEffect(() => {
    setSelServerIdx(null);
    setPromoOpen(null);
    setLegalTosServer([]);
  }, [vm.sessionId, vm.revision]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  useEffect(() => {
    setLegalTosServer([]);
    if (!roomId || !pk || promoOpen != null) return;
    if (selServerIdx == null) return;
    if (vm.readOnly || vm.phase !== "playing" || turn !== mySeat || busy || vaultClaimBusy || vm.mustRespondDouble)
      return;
    let cancelled = false;
    void (async () => {
      const r = await requestOv2ChessLegalTos(roomId, pk, selServerIdx, { revision: vm.revision });
      if (!cancelled && r.ok) setLegalTosServer(Array.isArray(r.tos) ? r.tos : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    roomId,
    pk,
    promoOpen,
    selServerIdx,
    vm.readOnly,
    vm.phase,
    vm.revision,
    vm.mustRespondDouble,
    turn,
    mySeat,
    busy,
    vaultClaimBusy,
  ]);

  const squares = useMemo(() => normalizeOv2ChessSquares(vm.squares), [vm.squares]);

  const checkHighlight = useMemo(() => {
    if (String(vm.phase) !== "playing" || turn == null) {
      return { inCheck: false, kingServerIdx: -1, attackerServerIdxs: [] };
    }
    return ov2ChessKingCheckHighlights(squares, turn);
  }, [squares, turn, vm.phase]);

  const attackerServerSet = useMemo(() => new Set(checkHighlight.attackerServerIdxs), [checkHighlight.attackerServerIdxs]);

  const legalTosViewSet = useMemo(() => {
    const s = new Set();
    if (mySeat == null) return s;
    for (const t of legalTosServer) {
      if (Number.isInteger(t) && t >= 0 && t <= 63) s.add(ov2ChessServerToViewIdx(t, mySeat));
    }
    return s;
  }, [legalTosServer, mySeat]);

  const promoLetters = mySeat === 0 ? (["Q", "R", "B", "N"]) : mySeat === 1 ? (["q", "r", "b", "n"]) : (["Q", "R", "B", "N"]);

  const onCellClick = useCallback(
    async viewIdx => {
      if (vm.readOnly || !vm.canClientMove || busy || vaultClaimBusy || vm.mustRespondDouble) return;
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
  const rkNorm = rk.replace(/^["']+|["']+$/g, "").toLowerCase();

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

  const didIWin = vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;
  const isDraw = finished && vm.winnerSeat == null;

  const stakePerSeat =
    room?.stake_per_seat != null && Number.isFinite(Number(room.stake_per_seat)) ? Number(room.stake_per_seat) : null;
  const finishMultiplier = vm.stakeMultiplier ?? 1;

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.winnerSeat) + 1}`;
  }, [members, vm.winnerSeat]);

  const finishOutcome = useMemo(() => {
    if (!finished) return "unknown";
    if (isDraw) return "draw";
    if (didIWin) return "win";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "loss";
    return "unknown";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishTitle = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Draw";
    if (didIWin) return "Victory";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "Defeat";
    return "Match finished";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishReasonLine = useMemo(() => {
    if (!finished) return "";
    if (rkNorm === "checkmate") return didIWin ? "Checkmate — you won the position" : "Checkmate";
    if (rkNorm === "stalemate") return "Draw by stalemate";
    if (isDraw) return "No winner — stakes refunded";
    return winnerDisplayName ? `Winner: ${winnerDisplayName}` : "Round complete";
  }, [finished, rkNorm, didIWin, isDraw, winnerDisplayName]);

  const finishAmountLine = useMemo(() => {
    if (!finished) return { text: "—", className: "text-zinc-500" };
    if (vaultClaimBusy) return { text: "…", className: "text-zinc-400" };
    if (stakePerSeat == null) return { text: "—", className: "text-zinc-500" };
    const mult = Math.max(1, Math.min(16, Math.floor(Number(finishMultiplier)) || 1));
    const seat = Math.floor(stakePerSeat * mult);
    const pot = Math.floor(stakePerSeat * 2 * mult);
    if (isDraw) {
      return { text: `+${seat} MLEO (refunded)`, className: "font-semibold tabular-nums text-emerald-300/95" };
    }
    if (didIWin) {
      return { text: `+${pot} MLEO`, className: "font-semibold tabular-nums text-amber-200/95" };
    }
    if (vm.mySeat != null && vm.winnerSeat != null) {
      return { text: `−${seat} MLEO`, className: "font-semibold tabular-nums text-rose-300/95" };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [finished, vaultClaimBusy, stakePerSeat, isDraw, didIWin, vm.mySeat, vm.winnerSeat, finishMultiplier]);

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

  const finishDismissedStripActions = (
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
    <div className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden bg-zinc-950 px-1 pb-1 sm:min-h-0 sm:gap-1 sm:px-2 sm:pb-1.5">
      <div className="flex shrink-0 flex-col gap-0.5 sm:gap-0.5">
        <div className="rounded-lg border border-white/[0.1] bg-zinc-900/70 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:py-1 sm:px-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
            <div
              className={`flex min-h-[1.625rem] items-center rounded-md border px-2 py-0.5 tabular-nums ${
                vm.phase === "playing" &&
                (vm.turnSeat === vm.mySeat ||
                  (vm.mustRespondDouble && Number(vm.pendingDouble?.responder_seat) === vm.mySeat))
                  ? "border-amber-400/35 bg-amber-950/45 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/55 text-zinc-400"
              }`}
            >
              {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                <span>
                  <span className="font-medium uppercase text-zinc-500">Timer</span>{" "}
                  <span className="font-semibold text-zinc-100">~{vm.turnTimeLeftSec}s</span>
                </span>
              ) : vm.phase === "finished" ? (
                <span className="font-medium text-zinc-500">Round over</span>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-white/12 bg-zinc-950/40 px-2 py-0.5 font-medium tabular-nums text-zinc-200">
                Table ×{vm.stakeMultiplier ?? 1}
              </span>
              {vm.phase === "playing" && checkHighlight.inCheck ? (
                <span
                  className="rounded-md border border-rose-500/28 bg-rose-950/38 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  title="The side to move is in check"
                >
                  Check
                </span>
              ) : null}
              {vaultClaimBusy ? (
                <span className="rounded-md border border-sky-500/22 bg-sky-950/40 px-2 py-0.5 text-[10px] text-sky-100/90">
                  Settlement…
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0 overflow-x-hidden overscroll-contain sm:mt-2.5 sm:min-h-0 sm:overflow-y-hidden">
        <Ov2BoardDuelPlayerHeader
          game="chess"
          seat0Label={seat0Label}
          seat1Label={seat1Label}
          mySeat={vm.mySeat}
          indicatorSeat={indicatorSeat}
          phase={String(vm.phase || "")}
          missedStreakBySeat={vm.missedStreakBySeat}
          chessShowCheckOnTurn={checkHighlight.inCheck && vm.phase === "playing"}
          mustRespondDouble={vm.mustRespondDouble === true}
        />

        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-950">
        <div
          className="relative z-[1] -mt-1.5 mb-[-4px] w-full max-w-[min(100%,448px)] rounded-[10px] p-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_0_0_1px_rgba(0,0,0,0.5),0_8px_28px_rgba(0,0,0,0.42),0_0_48px_rgba(18,26,42,0.28),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-2px_5px_rgba(0,0,0,0.28)] sm:max-w-[min(100%,548px)]"
          style={{
            background: "linear-gradient(152deg, #8c5f45 0%, #5a3524 38%, #3a2218 65%, #5c3a28 100%)",
          }}
        >
          <div
            className="relative overflow-hidden rounded-[8px] p-0.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.065),inset_0_-3px_8px_rgba(0,0,0,0.38),inset_0_0_0_1px_rgba(0,0,0,0.24)]"
            style={{
              background: "linear-gradient(172deg, #2f241f 0%, #1c1614 48%, #221a16 100%)",
            }}
          >
            <div
              className="relative grid aspect-square w-full gap-0 rounded-[6px] shadow-[inset_0_0_28px_rgba(0,0,0,0.3),inset_0_0_52px_rgba(0,0,0,0.075)]"
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
                const leg = legalTosViewSet.has(viewPos);
                const pieceSrc = pieceImageSrc(p);
                const kingThreat = checkHighlight.inCheck && checkHighlight.kingServerIdx === serverIdx;
                const attackingKing = attackerServerSet.has(serverIdx);
                const showLegalDot = leg && !sel && vm.phase === "playing" && turn === mySeat;
                const ringClass = sel
                  ? "z-[2] shadow-[inset_0_0_0_2px_rgba(125,211,252,0.34)]"
                  : attackingKing
                    ? "z-[1] shadow-[inset_0_0_0_1px_rgba(217,119,6,0.36)]"
                    : "";
                const baseSq = light
                  ? "bg-[#e0b078] shadow-[inset_0_1px_0_rgba(255,250,240,0.35),inset_0_-1px_0_rgba(0,0,0,0.082)]"
                  : "bg-[#503628] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-2px_0_rgba(0,0,0,0.22)]";
                return (
                  <button
                    key={viewPos}
                    type="button"
                    disabled={vm.readOnly || busy || vm.mustRespondDouble}
                    onClick={() => void onCellClick(viewPos)}
                    className={`relative flex min-h-0 min-w-0 items-center justify-center outline-none transition-[box-shadow,opacity] disabled:opacity-50 ${baseSq} ${
                      kingThreat
                        ? "z-[1] before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-rose-950/22 before:content-['']"
                        : ""
                    } ${ringClass}`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    aria-label={kingThreat ? "King in check" : undefined}
                  >
                    {showLegalDot ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-200/22 ring-1 ring-emerald-400/14"
                        aria-hidden
                      />
                    ) : null}
                    {pieceSrc ? (
                      <div className="relative z-[1] aspect-square w-[85%] max-w-full shrink-0">
                        <img
                          src={pieceSrc}
                          alt=""
                          draggable={false}
                          className={`h-full w-full select-none object-contain ${
                            p === p.toUpperCase() && p !== "."
                              ? "[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.08))_drop-shadow(0_2px_2.5px_rgba(0,0,0,0.045))_brightness(1)_contrast(1.02)_saturate(1.02)]"
                              : "[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.12))_drop-shadow(0_2px_3px_rgba(0,0,0,0.055))_brightness(1.025)_contrast(1.02)]"
                          }`}
                        />
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {promoOpen ? (
                <div
                  className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 border-t border-white/[0.07] bg-zinc-950/96 px-2 py-2.5 shadow-[0_-6px_18px_rgba(0,0,0,0.34)] sm:py-3"
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
                        className="flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-600/24 bg-zinc-800/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_2px_5px_rgba(0,0,0,0.22)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45 sm:h-14 sm:w-14"
                        aria-label={`Promote to ${({ q: "queen", Q: "queen", r: "rook", R: "rook", b: "bishop", B: "bishop", n: "knight", N: "knight" }[l] || "piece")}`}
                      >
                        <div className="relative aspect-square w-[85%] max-w-full shrink-0">
                          <img
                            src={pieceImageSrc(l) || ""}
                            alt=""
                            draggable={false}
                            className={`h-full w-full select-none object-contain ${
                              String(l) === String(l).toUpperCase()
                                ? "[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.08))_drop-shadow(0_2px_2.5px_rgba(0,0,0,0.045))_brightness(1)_contrast(1.02)_saturate(1.02)]"
                                : "[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.12))_drop-shadow(0_2px_3px_rgba(0,0,0,0.055))_brightness(1.025)_contrast(1.02)]"
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

        <div className="mt-5 shrink-0 pt-4 md:mt-4 md:pt-3 md:pb-2">
          <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-row items-stretch gap-2 md:max-w-3xl md:justify-center md:gap-3">
            <button
              type="button"
              disabled={stakeBtnDisabled}
              className={`${BTN_ACCENT} flex min-h-[2.75rem] min-w-0 flex-[1.65] items-center justify-center px-2 py-2.5 text-center !text-xs font-semibold leading-tight sm:!text-sm md:flex-1 md:max-w-md md:px-4 md:py-2.5`}
              onClick={() => void offerDouble()}
            >
              Increase table stake
            </button>
            <button
              type="button"
              disabled={exitBusy || !pk}
              className={`${BTN_DANGER} flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center px-2 py-2.5 text-center !text-xs font-semibold leading-tight sm:!text-sm md:max-w-[12.5rem] md:flex-none md:shrink-0 md:px-4 md:py-2.5`}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
          </div>
          {exitErr ? <p className="mt-2 text-center text-[11px] text-red-300">{exitErr}</p> : null}
          {err ? (
            <div className="mt-2 rounded-md border border-red-500/20 bg-red-950/20 px-2 py-1.5 text-[11px] text-red-200/95">
              <span>{err}</span>{" "}
              <button type="button" className="text-red-300 underline" onClick={() => setErr("")}>
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Ov2SharedStakeDoubleModal
        open={vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble}
        proposedMult={vm.pendingDouble?.proposed_mult}
        stakeMultiplier={vm.stakeMultiplier}
        busy={busy}
        onAccept={() => void respondDouble(true)}
        onDecline={() => void respondDouble(false)}
      />

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-chess-finish-title">
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
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl shadow-inner",
                  finishOutcome === "win" && "border-emerald-500/45 bg-emerald-950/60 text-emerald-200",
                  finishOutcome === "loss" && "border-rose-500/45 bg-rose-950/55 text-rose-200",
                  (finishOutcome === "draw" || finishOutcome === "unknown") && "border-white/10 bg-zinc-900/80 text-zinc-200",
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
                  id="ov2-chess-finish-title"
                  className={[
                    "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                    finishOutcome === "win" && "text-emerald-400",
                    finishOutcome === "loss" && "text-rose-400",
                    finishOutcome === "draw" && "text-sky-300",
                    finishOutcome === "unknown" && "text-zinc-100",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {finishTitle}
                </h2>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{finishMultiplier}</p>
                <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                  <p className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}>
                    {finishAmountLine.text}
                  </p>
                </div>
                <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{finishReasonLine}</p>
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                  {vaultClaimBusy ? "Sending results to your balance…" : "Round complete — rematch, then host starts next."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-4">
            <button type="button" className={BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
              {rematchBusy ? "Requesting…" : "Request rematch"}
            </button>
            <button type="button" className={BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
              Cancel rematch
            </button>
            {isHost ? (
              <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
                <button
                  type="button"
                  className={BTN_PRIMARY + " w-full rounded-none"}
                  disabled={startNextBusy}
                  onClick={() => void onStartNext()}
                >
                  {startNextBusy ? "Starting…" : "Start next (host)"}
                </button>
              </div>
            ) : (
              <p className="rounded-lg border border-white/[0.06] bg-zinc-950/35 px-2 py-1.5 text-center text-[11px] text-zinc-500">
                Host starts the next match when both players rematch.
              </p>
            )}
            <button type="button" className={BTN_SECONDARY} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              className={BTN_FINISH_DANGER + " w-full"}
              disabled={exitBusy || !pk}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}

      {finished && !showResultModal ? (
        <div className="shrink-0 space-y-2 rounded-xl border border-white/[0.11] bg-gradient-to-b from-zinc-900/78 to-zinc-950 p-3 text-[11px] text-zinc-200/88 shadow-[0_12px_32px_rgba(0,0,0,0.42),0_0_0_1px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-8px_18px_rgba(0,0,0,0.24)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Result</p>
          <p className="mt-1 text-sm font-semibold text-zinc-50">Match finished</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.1] pt-3">{finishDismissedStripActions}</div>
        </div>
      ) : null}
    </div>
  );
}
