/**
 * Browser → Next API for Community Cards persistent tables.
 */

import { isOv2RoomIdQueryParam } from "../onlineV2GameRegistry";

export async function postOv2CcOperate({ roomId, participantKey, op, payload, clientOpId, clientRevision }) {
  const rid = String(roomId ?? "").trim();
  if (!rid || !isOv2RoomIdQueryParam(rid)) {
    const err = new Error("ROOM_REQUIRED");
    err.code = "ROOM_REQUIRED";
    err.status = 400;
    throw err;
  }

  const body = {
    roomId: rid,
    participantKey: String(participantKey || "").trim(),
    op: String(op || "").trim(),
    payload: payload && typeof payload === "object" ? payload : {},
  };
  const cid = String(clientOpId || "").trim();
  if (cid) body.clientOpId = cid;
  if (clientRevision != null && Number.isFinite(Number(clientRevision))) {
    body.clientRevision = Math.max(0, Math.floor(Number(clientRevision)));
  }
  const res = await fetch("/api/ov2-community-cards/operate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
