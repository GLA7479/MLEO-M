"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  normalizeOv2ChessSquares,
  ov2ChessMoveNeedsPromotion,
  ov2ChessPieceOwnedBySeat,
  ov2ChessViewToServerIdx,
} from "../../../lib/online-v2/chess/ov2ChessBoardView";
import { useOv2ChessSession } from "../../../hooks/useOv2ChessSession";

const PIECE_SYM = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

function pieceGlyph(ch) {
  const c = String(ch || ".").trim().slice(0, 1);
  return PIECE_SYM[c] || (c === "." ? "" : c);
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
      const r = await applyMove(from, to, letter);
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1 pb-2 sm:gap-3 sm:px-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
        <div className="tabular-nums">
          {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
            <span className={vm.turnSeat === vm.mySeat ? "text-amber-200" : "text-zinc-500"}>
              Turn clock ~{vm.turnTimeLeftSec}s
            </span>
          ) : (
            <span>—</span>
          )}
        </div>
        {vaultClaimBusy ? <span className="text-sky-300">Settlement…</span> : null}
      </div>

      {err ? <p className="shrink-0 text-[11px] text-red-300">{err}</p> : null}

      {promoOpen ? (
        <div className="shrink-0 rounded-md border border-amber-500/40 bg-amber-950/30 p-2 text-[11px] text-amber-100">
          <p className="font-semibold">Promotion</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(["Q", "R", "B", "N"]).map(l => (
              <button
                key={l}
                type="button"
                disabled={busy}
                onClick={() => void onPickPromo(l)}
                className="rounded border border-amber-400/50 px-2 py-1 font-bold disabled:opacity-45"
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <div
          className="grid aspect-square w-full max-w-[min(100%,420px)] gap-0 rounded-md border border-[#2a2a22] p-1 shadow-inner sm:max-w-[min(100%,520px)]"
          style={{
            background: "linear-gradient(145deg,#1a1a14,#0c0c0a)",
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
            const g = pieceGlyph(p);
            return (
              <button
                key={viewPos}
                type="button"
                disabled={vm.readOnly || busy}
                onClick={() => void onCellClick(viewPos)}
                className={`relative flex min-h-0 min-w-0 items-center justify-center outline-none transition-[box-shadow] disabled:opacity-50 ${
                  light ? "bg-[#c9b88a]" : "bg-[#4a5c3a]"
                } ${sel ? "z-[1] ring-2 ring-sky-500 ring-inset" : ""}`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {g ? (
                  <span
                    className={`text-[clamp(14px,11vw,28px)] leading-none ${
                      p === p.toUpperCase() && p !== "." ? "text-zinc-900 drop-shadow-sm" : "text-zinc-100 drop-shadow"
                    }`}
                  >
                    {g}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {finished ? (
        <div className="shrink-0 space-y-2 rounded-lg border border-white/10 bg-zinc-900/50 p-2 text-[11px] text-zinc-200">
          <p className="font-semibold text-zinc-100">Match finished</p>
          {rk === "stalemate" ? (
            <p className="text-zinc-300">Draw by stalemate.</p>
          ) : vm.winnerSeat != null && vm.mySeat != null ? (
            <p className="text-zinc-300">{vm.winnerSeat === vm.mySeat ? "You won." : "You lost."}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={rematchBusy}
              onClick={() => void onRematch()}
              className="rounded-md border border-emerald-500/40 bg-emerald-950/40 px-2 py-1.5 font-semibold text-emerald-100 disabled:opacity-45"
            >
              {rematchBusy ? "…" : "Rematch"}
            </button>
            <button
              type="button"
              onClick={() => void cancelRematch()}
              className="rounded-md border border-zinc-600 bg-zinc-800/50 px-2 py-1.5 text-zinc-200"
            >
              Cancel rematch
            </button>
            {isHost ? (
              <button
                type="button"
                disabled={startNextBusy}
                onClick={() => void onStartNext()}
                className="rounded-md border border-sky-500/40 bg-sky-950/40 px-2 py-1.5 font-semibold text-sky-100 disabled:opacity-45"
              >
                {startNextBusy ? "…" : "Start next (host)"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="shrink-0">
        <button
          type="button"
          disabled={exitBusy || !pk}
          onClick={() => void onExitToLobby()}
          className="w-full rounded-md border border-red-500/35 bg-red-950/25 py-2 text-[11px] font-semibold text-red-100 disabled:opacity-45"
        >
          {exitBusy ? "Leaving…" : "Leave table"}
        </button>
        {exitErr ? <p className="mt-1 text-[10px] text-red-300">{exitErr}</p> : null}
      </div>
    </div>
  );
}
