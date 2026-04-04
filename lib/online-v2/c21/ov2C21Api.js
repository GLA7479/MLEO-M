/**
 * Browser → Next API for 21 Challenge persistent tables.
 */

import { isOv2RoomIdQueryParam } from "../onlineV2GameRegistry";

export async function postOv2C21Operate({ roomId, participantKey, op, payload }) {
  const rid = String(roomId ?? "").trim();
  if (!rid || !isOv2RoomIdQueryParam(rid)) {
    const err = new Error("ROOM_REQUIRED");
    err.code = "ROOM_REQUIRED";
    err.status = 400;
    throw err;
  }

  const res = await fetch("/api/ov2-c21/operate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId: rid,
      participantKey: String(participantKey || "").trim(),
      op: String(op || "").trim(),
      payload: payload && typeof payload === "object" ? payload : {},
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.code || json?.message || `HTTP_${res.status}`);
    err.code = json?.code;
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}
