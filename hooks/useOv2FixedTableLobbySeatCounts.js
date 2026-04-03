import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";

/** @typedef {{ seated: number, max: number } | null} Ov2SeatCountSnap */

function seatedFromSeats(seats) {
  if (!Array.isArray(seats)) return 0;
  return seats.filter(s => s && String(s.participantKey || "").trim()).length;
}

/** @param {unknown} engine */
export function ov2C21SeatCountFromEngine(engine) {
  if (!engine || typeof engine !== "object") return { seated: 0, max: 6 };
  const seats = /** @type {{ seats?: unknown }} */ (engine).seats;
  if (!Array.isArray(seats) || seats.length === 0) return { seated: 0, max: 6 };
  return { seated: seatedFromSeats(seats), max: seats.length };
}

/**
 * @param {unknown} engine
 * @param {string} [roomId]
 * @param {Readonly<Record<string, number>>} [roomMaxById] — fixes `{}` / pre-normalized engine on CC 5-max tables
 */
export function ov2CcSeatCountFromEngine(engine, roomId, roomMaxById) {
  const rid = roomId != null ? String(roomId) : "";
  const capFromRoom = rid && roomMaxById && Number.isFinite(roomMaxById[rid]) ? roomMaxById[rid] : null;
  if (!engine || typeof engine !== "object") {
    return capFromRoom != null ? { seated: 0, max: capFromRoom } : null;
  }
  const e = /** @type {{ seats?: unknown; maxSeats?: unknown }} */ (engine);
  const seats = e.seats;
  if (!Array.isArray(seats) || seats.length === 0) {
    const m =
      capFromRoom != null
        ? capFromRoom
        : Math.max(5, Math.min(9, Math.floor(Number(e.maxSeats) || 9)));
    return { seated: 0, max: m };
  }
  const max = Math.max(5, Math.min(9, Math.floor(Number(e.maxSeats) || seats.length)));
  return { seated: seatedFromSeats(seats), max };
}

/**
 * Live seated counts for fixed OV2 tables (lobby picker). Reads `ov2_*_live_state.engine` only.
 * @param {readonly string[]} roomIds
 * @param {'ov2_c21_live_state' | 'ov2_community_cards_live_state'} table
 * @param {(engine: unknown, roomId: string) => Ov2SeatCountSnap} parseEngine
 */
export function useOv2FixedTableLobbySeatCounts(roomIds, table, parseEngine) {
  const idsKey = useMemo(() => [...roomIds].join("\0"), [roomIds]);
  const parseRef = useRef(parseEngine);
  parseRef.current = parseEngine;

  const [byRoom, setByRoom] = useState(() => {
    /** @type {Record<string, Ov2SeatCountSnap>} */
    const init = {};
    for (const id of roomIds) init[id] = null;
    return init;
  });

  useEffect(() => {
    setByRoom(() => {
      /** @type {Record<string, Ov2SeatCountSnap>} */
      const init = {};
      for (const id of roomIds) init[id] = null;
      return init;
    });
  }, [idsKey, roomIds]);

  useEffect(() => {
    let cancelled = false;

    const applyRow = (room_id, engine) => {
      if (!room_id || !roomIds.includes(room_id)) return;
      const snap = parseRef.current(engine, room_id);
      if (!snap) return;
      setByRoom(prev => (prev[room_id]?.seated === snap.seated && prev[room_id]?.max === snap.max ? prev : { ...prev, [room_id]: snap }));
    };

    const load = async () => {
      const { data, error } = await supabase.from(table).select("room_id, engine").in("room_id", [...roomIds]);
      if (cancelled || error) return;
      /** @type {Record<string, Ov2SeatCountSnap>} */
      const next = {};
      for (const id of roomIds) next[id] = null;
      for (const row of data || []) {
        const rid = row?.room_id != null ? String(row.room_id) : "";
        if (!rid) continue;
        const snap = parseRef.current(row.engine, rid);
        if (snap) next[rid] = snap;
      }
      for (const id of roomIds) {
        if (next[id] == null) {
          const snap = parseRef.current(null, id);
          if (snap) next[id] = snap;
        }
      }
      if (!cancelled) setByRoom(next);
    };

    void load();

    const channel = supabase
      .channel(`ov2_lobby_seats:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, payload => {
        const row = payload.new && typeof payload.new === "object" ? payload.new : null;
        const rid = row?.room_id != null ? String(row.room_id) : "";
        if (rid && "engine" in row) applyRow(rid, row.engine);
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [idsKey, roomIds, table]);

  return byRoom;
}
