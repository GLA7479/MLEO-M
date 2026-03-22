import { useEffect, useState } from "react";
import { WORLDS } from "../../worlds/catalog";
import { isBaseDevToolsEnabled } from "../../../../lib/baseDevToolsShared";
import { devSetBaseSectorWorld } from "../../../../lib/baseVaultClient";

export function DevSectorSwitchPanel({ snapshot, onServerStateApplied, showToast }) {
  const [selected, setSelected] = useState(String(snapshot?.currentWorldOrder ?? 1));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected(String(snapshot?.currentWorldOrder ?? 1));
  }, [snapshot?.currentWorldOrder]);

  if (!isBaseDevToolsEnabled()) return null;

  const current = snapshot?.currentWorldOrder ?? 1;

  async function apply() {
    const n = Math.floor(Number(selected));
    if (!Number.isFinite(n) || n < 1 || n > 6) {
      showToast?.("Invalid sector (1–6)");
      return;
    }
    setBusy(true);
    try {
      const res = await devSetBaseSectorWorld(n);
      if (!res?.success) {
        const parts = [res?.code, res?.message, res?.details, res?.rpcMessage].filter(Boolean);
        showToast?.(parts.length ? parts.join(" — ") : "Dev sector update failed");
        return;
      }
      if (res.state && typeof onServerStateApplied === "function") {
        onServerStateApplied(res.state);
      }
      showToast?.(`DEV: sector_world → ${n} (server)`);
    } catch (e) {
      console.error("devSetBaseSectorWorld", e);
      showToast?.("Dev sector request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 ring-1 ring-rose-400/20">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-200/90">
        DEV Sector Switch
      </div>
      <div className="mt-1 text-[10px] text-rose-100/55">
        Temporary · dev / NEXT_PUBLIC_BASE_DEV_TOOLS only · updates server <code className="text-rose-200/80">sector_world</code>
      </div>
      <div className="mt-2 text-[11px] text-white/60">
        Active (server): <span className="font-bold text-white/85">World {current}</span>
        {snapshot?.currentWorldName ? ` · ${snapshot.currentWorldName}` : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
        >
          {WORLDS.map((w) => (
            <option key={w.id} value={String(w.order)}>
              World {w.order} / {w.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={apply}
          className="shrink-0 rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-50 hover:bg-rose-500/30 disabled:opacity-40"
        >
          {busy ? "…" : "Apply"}
        </button>
      </div>
    </div>
  );
}
