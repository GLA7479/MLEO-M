import { checkIpRateLimit } from "../../../lib/server/ipRateLimit";
import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).end(JSON.stringify(body));
}

function publicIdSuffixFromDeviceId(deviceId) {
  const s = String(deviceId ?? "").trim();
  if (!s) return "------";
  const upper = s.toUpperCase();
  return upper.length <= 6 ? upper : upper.slice(-6);
}

function entriesFromRpcRows(rows) {
  return rows.map((row) => ({
    rank: Number(row.leaderboard_rank ?? 0),
    balance: Number(row.vault_balance ?? 0),
    publicIdSuffix: String(row.public_id_suffix ?? "").slice(0, 12),
  }));
}

function entriesFromVaultRows(rows) {
  return rows.map((row, index) => ({
    rank: index + 1,
    balance: Number(row.balance ?? 0),
    publicIdSuffix: publicIdSuffixFromDeviceId(row.device_id).slice(0, 12),
  }));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { success: false, message: "Method not allowed" });
  }

  try {
    const ipRate = await checkIpRateLimit(req, 120, 60_000);
    if (!ipRate.allowed) {
      return sendJson(res, 429, { success: false, message: "Too many leaderboard requests" });
    }

    const supabase = getSupabaseAdmin();

    const { data: rpcData, error: rpcError } = await supabase.rpc("get_vault_leaderboard_top100", {});

    if (!rpcError) {
      const rows =
        rpcData == null ? [] : Array.isArray(rpcData) ? rpcData : [];
      return sendJson(res, 200, { success: true, entries: entriesFromRpcRows(rows) });
    }

    const { data: tableData, error: tableError } = await supabase
      .from("vault_balances")
      .select("device_id, balance")
      .gt("balance", 0)
      .order("balance", { ascending: false })
      .order("device_id", { ascending: true })
      .limit(100);

    if (tableError) {
      const message =
        [rpcError?.message, tableError?.message].filter(Boolean).join(" · ") ||
        "Failed to load leaderboard";
      return sendJson(res, 400, { success: false, message });
    }

    const rows = tableData == null ? [] : Array.isArray(tableData) ? tableData : [];
    return sendJson(res, 200, { success: true, entries: entriesFromVaultRows(rows) });
  } catch (err) {
    console.error("vault/leaderboard failed", err);
    return sendJson(res, 500, {
      success: false,
      message: "Leaderboard API failed",
    });
  }
}
