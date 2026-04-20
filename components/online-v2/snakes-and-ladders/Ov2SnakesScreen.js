"use client";

import Link from "next/link";
import { useMemo } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { useOv2SnakesSession } from "../../../hooks/useOv2SnakesSession";

const SEAT_DOT_CLASS = ["bg-sky-400", "bg-amber-400", "bg-emerald-400", "bg-fuchsia-400"];

/** @param {number} row 0 = top row on screen */
/** @param {number} col 0 = left */
function cellNumberAt(row, col) {
  const rowFromBottom = 9 - row;
  const leftToRight = rowFromBottom % 2 === 0;
  const c = leftToRight ? col : 9 - col;
  return rowFromBottom * 10 + c + 1;
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null }} props
 */
export default function Ov2SnakesScreen({ contextInput = null }) {
  const session = useOv2SnakesSession(contextInput ?? undefined);
  const { snap, err, rollBusy, roll, vaultClaimBusy, vaultClaimError, retryVaultClaim } = session;

  const room = contextInput?.room;
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const onLeaveToLobby = typeof contextInput?.onLeaveToLobby === "function" ? contextInput.onLeaveToLobby : null;
  const leaveToLobbyBusy = Boolean(contextInput?.leaveToLobbyBusy);

  const memberBySeat = useMemo(() => {
    /** @type {Map<number, { participant_key?: string, display_name?: string }>} */
    const m = new Map();
    for (const row of members) {
      const si = row?.seat_index;
      if (si == null || si === "") continue;
      const n = Number(si);
      if (!Number.isInteger(n) || n < 0 || n > 3) continue;
      m.set(n, {
        participant_key: row?.participant_key != null ? String(row.participant_key) : "",
        display_name: row?.display_name != null ? String(row.display_name) : "",
      });
    }
    return m;
  }, [members]);

  const positions = snap?.board && typeof snap.board === "object" && snap.board.positions && typeof snap.board.positions === "object" ? snap.board.positions : {};
  const phase = snap ? String(snap.phase || "").toLowerCase() : "";
  const finished = phase === "finished";
  const winnerSeat = snap?.winnerSeat != null ? snap.winnerSeat : null;
  const winnerPk =
    winnerSeat != null && memberBySeat.has(winnerSeat) ? String(memberBySeat.get(winnerSeat)?.participant_key || "") : "";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1 pb-2 pt-1 sm:gap-3 sm:px-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-zinc-200 sm:text-xs">Snakes &amp; Ladders</p>
          <p className="truncate text-[10px] text-zinc-500">
            {snap?.sessionId ? `Session ${snap.sessionId.slice(0, 8)}…` : "Waiting for session…"}
            {snap?.revision != null ? ` · rev ${snap.revision}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {onLeaveToLobby ? (
            <button
              type="button"
              disabled={leaveToLobbyBusy}
              onClick={() => void onLeaveToLobby()}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold text-zinc-200 disabled:opacity-45 sm:text-[11px]"
            >
              {leaveToLobbyBusy ? "Leaving…" : "Leave table"}
            </button>
          ) : null}
          <Link
            href="/online-v2/rooms"
            className="rounded-md border border-sky-500/25 bg-sky-950/30 px-2 py-1 text-[10px] font-semibold text-sky-200/90 sm:text-[11px]"
            onClick={() => {
              try {
                window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
              } catch {
                /* ignore */
              }
            }}
          >
            Lobby
          </Link>
        </div>
      </div>

      {err ? <p className="text-[11px] text-red-300">{err}</p> : null}

      {finished ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-[11px] text-emerald-100">
          <p className="font-semibold text-emerald-50">Match finished</p>
          <p className="mt-1 text-emerald-200/90">
            {winnerSeat != null
              ? `Winner: seat ${winnerSeat}${
                  winnerPk
                    ? winnerPk === pk
                      ? " (you)"
                      : ""
                    : ""
                }`
              : "Result recorded."}
          </p>
          {vaultClaimBusy ? <p className="mt-1 text-[10px] text-emerald-200/80">Updating vault…</p> : null}
          {vaultClaimError ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[10px] text-amber-200/95">{vaultClaimError}</p>
              <button
                type="button"
                className="rounded border border-amber-400/40 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-amber-50"
                onClick={() => retryVaultClaim()}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-10 gap-0.5 sm:gap-1">
        {Array.from({ length: 10 }, (_, row) => (
          <div key={`row-${row}`} className="contents">
            {Array.from({ length: 10 }, (_, col) => {
              const n = cellNumberAt(row, col);
              const occupants = [];
              for (let s = 0; s <= 3; s += 1) {
                const posRaw = positions[String(s)] ?? positions[s];
                const pos = posRaw != null ? Number(posRaw) : NaN;
                if (Number.isFinite(pos) && Math.floor(pos) === n) occupants.push(s);
              }
              const isStart = n === 1;
              const isEnd = n === 100;
              return (
                <div
                  key={`c-${row}-${col}`}
                  className={[
                    "relative flex aspect-square min-h-0 flex-col items-center justify-center rounded border text-[8px] font-medium leading-none sm:text-[9px]",
                    isEnd
                      ? "border-emerald-500/40 bg-emerald-950/35 text-emerald-100"
                      : isStart
                        ? "border-sky-500/35 bg-sky-950/25 text-sky-100"
                        : "border-white/[0.06] bg-black/30 text-zinc-400",
                  ].join(" ")}
                >
                  <span className="opacity-80">{n}</span>
                  <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {occupants.map(s => (
                      <span
                        key={`o-${n}-${s}`}
                        className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${SEAT_DOT_CLASS[s] ?? "bg-zinc-500"}`}
                        title={`Seat ${s}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
        <p>
          <span className="text-zinc-500">Turn seat:</span>{" "}
          <span className="font-mono text-zinc-100">{snap?.turnSeat != null ? snap.turnSeat : "—"}</span>
          {snap?.mySeat != null ? (
            <>
              {" "}
              <span className="text-zinc-500">· You:</span>{" "}
              <span className="font-mono text-zinc-100">{snap.mySeat}</span>
            </>
          ) : null}
        </p>
        <p className="mt-1">
          <span className="text-zinc-500">Last roll:</span>{" "}
          <span className="font-mono text-zinc-100">{snap?.lastRoll != null ? snap.lastRoll : "—"}</span>
        </p>
        <ul className="mt-2 space-y-0.5 border-t border-white/[0.05] pt-2 text-[10px] text-zinc-400">
          {[0, 1, 2, 3].map(si => {
            const m = memberBySeat.get(si);
            const posRaw = positions[String(si)] ?? positions[si];
            const pos = posRaw != null ? Number(posRaw) : null;
            if (!m && !Number.isFinite(pos)) return null;
            return (
              <li key={`seat-${si}`} className="flex justify-between gap-2">
                <span>
                  Seat {si}
                  {m?.display_name ? ` — ${m.display_name}` : ""}
                  {m?.participant_key === pk ? " (you)" : ""}
                </span>
                <span className="shrink-0 font-mono text-zinc-200">{Number.isFinite(pos) ? pos : "—"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {!finished && snap?.canRoll ? (
        <button
          type="button"
          disabled={rollBusy}
          onClick={() => void roll()}
          className="mx-auto w-full max-w-xs rounded-xl border border-emerald-500/35 bg-emerald-900/40 py-2.5 text-sm font-bold text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] disabled:opacity-45"
        >
          {rollBusy ? "Rolling…" : "Roll die"}
        </button>
      ) : !finished && snap ? (
        <p className="text-center text-[11px] text-zinc-500">Waiting for the other player&apos;s roll…</p>
      ) : !snap ? (
        <p className="text-center text-[11px] text-zinc-500">Loading game state…</p>
      ) : null}

      {room?.pot_locked != null ? (
        <p className="text-center text-[10px] text-zinc-500">Pot (locked): {Math.floor(Number(room.pot_locked) || 0).toLocaleString()} — settled via server.</p>
      ) : null}
    </div>
  );
}
