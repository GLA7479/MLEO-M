import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

const GROUP_ORDER = ["infrastructure", "specialization", "execution", "stability"];

const GROUP_LABELS = {
  infrastructure: "Infrastructure",
  specialization: "Specialization",
  execution: "Execution",
  stability: "Stability",
};

function fmtCap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.floor(v));
}

export function WorldSectorPanel({ snapshot, onDeploy, deployBusy, openInnerPanel, toggleInnerPanel }) {
  if (!snapshot) return null;

  const {
    currentWorldName,
    currentDailyCap,
    nextWorldName,
    nextDailyCap,
    nextWorldOrder,
    canDeployToNextWorld,
    readiness,
    panelFlavor,
  } = snapshot;

  const atMax = !nextWorldOrder;
  const shellExtra = panelFlavor?.panelShellClassName || "";
  const openKey = "overview-world-sector";
  const isOpen = openInnerPanel === openKey;
  const statusLabel = atMax
    ? "Final sector"
    : canDeployToNextWorld
      ? "Ready to deploy"
      : "Locked";
  const worldHint = !isOpen
    ? `${currentWorldName} · Daily cap ${fmtCap(currentDailyCap)} · ${statusLabel}${
        panelFlavor?.badgeLabel ? ` · ${panelFlavor.badgeLabel}` : ""
      }`
    : null;

  return (
    <div
      className={`rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.07] to-transparent p-4 ${shellExtra}`.trim()}
    >
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-black uppercase tracking-[0.16em] text-white">Sector / world</div>
          {isOpen && panelFlavor?.badgeLabel ? (
            <span className="inline-flex max-w-full rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100/95">
              {panelFlavor.badgeLabel}
            </span>
          ) : null}
        </div>
        {worldHint ? <div className="mt-1 text-xs text-white/55">{worldHint}</div> : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mt-1 text-lg font-black text-white">{currentWorldName}</div>
          {panelFlavor?.tagline ? (
            <div className="mt-1 text-[11px] leading-snug text-amber-100/75">{panelFlavor.tagline}</div>
          ) : null}
          <div className="mt-0.5 text-xs text-white/55">
            Daily MLEO cap: <span className="font-semibold text-white/80">{fmtCap(currentDailyCap)}</span>
          </div>
        </div>
        <div className="text-right">
          {atMax ? (
            <span className="inline-flex rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100">
              Final sector
            </span>
          ) : canDeployToNextWorld ? (
            <span className="inline-flex rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-100">
              Ready to deploy
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
              Locked
            </span>
          )}
        </div>
      </div>

      {panelFlavor ? (
        <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
          {panelFlavor.focusShort ? (
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-200/70">
              World focus · {panelFlavor.focusShort}
            </div>
          ) : null}
          {panelFlavor.flowMetricLine ? (
            <div className="text-[11px] leading-snug text-white/70">{panelFlavor.flowMetricLine}</div>
          ) : null}
          {panelFlavor.playstyleHint ? (
            <div className="text-[11px] leading-snug text-white/60">
              <span className="font-semibold text-white/50">Playstyle · </span>
              {panelFlavor.playstyleHint}
            </div>
          ) : null}
          {panelFlavor.sectorPressureNote ? (
            <div className="text-[11px] leading-snug text-amber-100/55">
              <span className="font-semibold text-amber-200/50">Sector pressure · </span>
              {panelFlavor.sectorPressureNote}
            </div>
          ) : null}
          {panelFlavor.descriptor ? (
            <div className="border-t border-white/10 pt-2 text-[11px] leading-snug text-white/55">
              {panelFlavor.descriptor}
            </div>
          ) : null}
          {panelFlavor.progressionNote ? (
            <div className="text-[11px] leading-snug text-cyan-100/60">{panelFlavor.progressionNote}</div>
          ) : null}
        </div>
      ) : null}

      {!atMax ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
            Next sector
          </div>
          <div className="mt-0.5 text-sm font-bold text-white">{nextWorldName}</div>
          <div className="text-xs text-white/55">
            Cap after deploy: <span className="text-white/75">{fmtCap(nextDailyCap)}</span>
          </div>
        </div>
      ) : null}

      {!atMax && readiness ? (
        <div className="mt-3 space-y-2.5">
          {GROUP_ORDER.map((key) => {
            const block = readiness[key];
            if (!block) return null;
            const checks = Array.isArray(block.checks) ? block.checks : [];
            if (!checks.length && key !== "execution") return null;
            return (
              <div key={key} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                    {GROUP_LABELS[key] || key}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-[0.12em] ${
                      block.pass ? "text-emerald-300/90" : "text-rose-300/85"
                    }`}
                  >
                    {block.pass ? "OK" : "Open"}
                  </span>
                </div>
                {checks.length ? (
                  <ul className="mt-2 space-y-1 text-[11px] leading-snug text-white/65">
                    {checks.map((c) => (
                      <li key={c.id} className="flex gap-2">
                        <span className={c.ok ? "text-emerald-400/90" : "text-rose-300/80"}>
                          {c.ok ? "✓" : "○"}
                        </span>
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!atMax ? (
        <button
          type="button"
          disabled={!canDeployToNextWorld || deployBusy}
          onClick={() => {
            if (typeof onDeploy === "function") onDeploy();
          }}
          className="mt-4 w-full rounded-xl bg-cyan-500/20 px-3 py-2.5 text-sm font-bold text-cyan-50 ring-1 ring-cyan-400/35 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deployBusy ? "Deploying…" : "Deploy to next sector"}
        </button>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
