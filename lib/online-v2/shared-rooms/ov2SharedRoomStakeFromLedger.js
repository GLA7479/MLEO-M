/**
 * Shared-room RPC snapshots omit `wallet_state`; use `fetchOv2RoomMembers` rows as the source of truth.
 * @param {Array<{ seat_index?: unknown, wallet_state?: unknown, display_name?: unknown, participant_key?: unknown }>} ledgerRows
 * @returns {{ seatIndex: number, displayName: string, participantKey: string, walletState: string }[]}
 */
export function seatedPlayersNotStakeCommitted(ledgerRows) {
  const out = [];
  for (const row of ledgerRows || []) {
    if (row?.seat_index === null || row?.seat_index === undefined || row?.seat_index === "") continue;
    const n = Number(row.seat_index);
    if (!Number.isInteger(n) || n < 0) continue;
    const ws = String(row.wallet_state ?? "").trim();
    if (ws === "committed") continue;
    const pk = String(row.participant_key ?? "").trim();
    const dn = String(row.display_name ?? "").trim();
    out.push({
      seatIndex: n,
      displayName: dn,
      participantKey: pk,
      walletState: ws || "(empty)",
    });
  }
  return out;
}

/**
 * @param {{ seatIndex: number, displayName: string, participantKey: string, walletState: string }[]} blockers
 */
export function formatSeatedStakeBlockers(blockers) {
  if (!blockers.length) return "";
  return blockers
    .map(b => {
      const label = b.displayName || (b.participantKey ? `${b.participantKey.slice(0, 8)}…` : "?");
      return `Seat ${b.seatIndex + 1} (${label}): wallet_state="${b.walletState}"`;
    })
    .join("; ");
}
