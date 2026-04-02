/**
 * Browser → Next API for Community Cards persistent tables.
 */

export async function postOv2CcOperate({ roomId, participantKey, op, payload }) {
  const res = await fetch("/api/ov2-community-cards/operate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId,
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
