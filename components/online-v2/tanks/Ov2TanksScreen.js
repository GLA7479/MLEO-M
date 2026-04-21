"use client";

import { useMemo } from "react";
import { useOv2TanksSession } from "../../../hooks/useOv2TanksSession";
import { ONLINE_V2_GAME_IDS } from "../../../lib/online-v2/onlineV2GameRegistry";

/**
 * Minimal live readout for Tanks V1 (gameplay canvas comes later).
 * @param {{ roomId: string, participantId: string, room: object|null }} props
 */
export default function Ov2TanksScreen({ roomId, participantId, room }) {
  const sessionId = room && typeof room === "object" && room.active_session_id ? String(room.active_session_id) : "";
  const hasSession = Boolean(sessionId);
  const { snapshot, loadError, reload } = useOv2TanksSession({
    roomId,
    participantKey: participantId,
    enabled: hasSession,
  });

  const productOk = useMemo(
    () => room && typeof room === "object" && String(room.product_game_id || "").trim() === ONLINE_V2_GAME_IDS.TANKS,
    [room]
  );

  if (!productOk) {
    return <p className="px-2 text-sm text-red-200">This screen requires a Tanks room.</p>;
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-3 text-sm text-zinc-300">
        <p>Waiting for an active Tanks session on this room…</p>
        <button
          type="button"
          className="w-fit rounded border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
          onClick={() => void reload()}
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 py-3 text-sm text-zinc-200">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span>Room: {roomId.slice(0, 8)}…</span>
        <button
          type="button"
          className="rounded border border-white/20 bg-white/10 px-2 py-0.5 font-semibold text-white"
          onClick={() => void reload()}
        >
          Refresh snapshot
        </button>
      </div>
      {loadError ? <p className="text-xs text-amber-200">{loadError}</p> : null}
      {!snapshot ? (
        <p className="text-xs text-zinc-500">Loading snapshot…</p>
      ) : (
        <pre className="max-h-[50vh] overflow-auto rounded border border-white/10 bg-black/40 p-2 text-[11px] leading-snug text-emerald-100/90">
          {JSON.stringify(
            {
              revision: snapshot.revision,
              phase: snapshot.phase,
              mySeat: snapshot.mySeat,
              winnerSeat: snapshot.winnerSeat,
              parity: snapshot.parity,
              publicKeys: snapshot.public ? Object.keys(snapshot.public) : [],
            },
            null,
            2
          )}
        </pre>
      )}
    </div>
  );
}
