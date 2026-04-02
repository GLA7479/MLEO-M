import { useMemo } from "react";
import { getOv2BingoSeatStyle } from "../../../lib/online-v2/bingo/ov2BingoSeatColors";
import { OV2_BINGO_PRODUCT_GAME_ID } from "../../../lib/online-v2/bingo/ov2BingoSessionAdapter";

export default function Ov2SharedSeatGrid({
  room,
  members,
  participantId,
  busy,
  onClaimSeat,
  onReleaseSeat,
}) {
  const maxPlayers = Math.max(1, Number(room?.max_players || 1));
  const myMember = useMemo(
    () => members.find(m => m.participant_key === participantId) || null,
    [members, participantId]
  );
  const mySeat = myMember?.seat_index ?? null;
  const seatsDisabled = busy || room?.status !== "OPEN";
  const bingoSeats = String(room?.product_game_id || "").trim() === OV2_BINGO_PRODUCT_GAME_ID;

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 text-xs font-semibold text-zinc-300">Seats</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: maxPlayers }, (_, i) => i).map(seatIndex => {
          const holder = members.find(m => m.seat_index === seatIndex) || null;
          const mine = holder?.participant_key === participantId;
          const disabled = seatsDisabled || (holder && !mine);
          const seatStyle = bingoSeats ? getOv2BingoSeatStyle(seatIndex) : null;
          const bingoMine = bingoSeats && seatStyle && mine;
          const bingoOther = bingoSeats && seatStyle && holder && !mine;
          const bingoOpen = bingoSeats && seatStyle && !holder;
          return (
            <button
              key={`seat-${seatIndex}`}
              type="button"
              disabled={disabled}
              onClick={() => void onClaimSeat(seatIndex)}
              className={[
                "rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:opacity-45",
                bingoMine
                  ? [seatStyle.border, seatStyle.bg, seatStyle.text, "ring-1 ring-sky-400/85"].join(" ")
                  : bingoOther
                    ? [seatStyle.border, seatStyle.bg, seatStyle.text].join(" ")
                    : bingoOpen
                      ? [seatStyle.border, "bg-black/25 text-zinc-200 hover:bg-white/10"].join(" ")
                      : mine
                        ? "border-emerald-400 bg-emerald-900/40 text-emerald-100"
                        : holder
                          ? "border-zinc-600 bg-zinc-800/60 text-zinc-300"
                          : "border-white/20 bg-white/5 text-white hover:bg-white/10",
              ].join(" ")}
            >
              <div>Seat {seatIndex + 1}</div>
              <div className="mt-1 text-[10px] text-zinc-400">{mine ? "You" : holder ? "Occupied" : "Open"}</div>
            </button>
          );
        })}
      </div>
      {mySeat != null ? (
        <button
          type="button"
          disabled={seatsDisabled}
          onClick={() => void onReleaseSeat()}
          className="mt-3 w-full rounded-lg border border-red-500/30 bg-red-950/30 py-2 text-xs font-semibold text-red-200 disabled:opacity-45"
        >
          Release my seat
        </button>
      ) : null}
    </div>
  );
}

