function SectionAvailabilityBadge({ count }) {
  if (!count) return null;

  return (
    <span className="inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-cyan-400 px-2 text-[11px] font-black text-slate-950">
      {count}
    </span>
  );
}

export function OpsPanelCards({
  opsCardClass,
  missionsCardClass,
  opsAvailableCount,
  missionsAvailableCount,
  opsHintText,
  missionsHintText,
  openInnerPanel,
  toggleInnerPanel,
  operationsConsoleContent,
  dailyMissionsContent,
}) {
  return (
    <>
      <div className={`rounded-3xl border p-3.5 transition ${opsCardClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold text-white">Operations Console</div>
              <SectionAvailabilityBadge count={opsAvailableCount} />
            </div>
            {openInnerPanel !== "ops-console" ? (
              <div className="mt-1 text-sm text-white/60">{opsHintText}</div>
            ) : null}
          </div>

          <button
            onClick={() => toggleInnerPanel("ops-console")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "ops-console" ? "CLOSE" : "OPEN"}
          </button>
        </div>

        {openInnerPanel === "ops-console" ? (
          <div className="mt-3">{operationsConsoleContent}</div>
        ) : null}
      </div>

      <div className={`rounded-3xl border p-3.5 transition ${missionsCardClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold text-white">Daily Missions</div>
              <SectionAvailabilityBadge count={missionsAvailableCount} />
            </div>

            {openInnerPanel !== "ops-missions" ? (
              <div className="mt-1 text-sm text-white/60">{missionsHintText}</div>
            ) : null}
          </div>

          <button
            onClick={() => toggleInnerPanel("ops-missions")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "ops-missions" ? "CLOSE" : "OPEN"}
          </button>
        </div>

        {openInnerPanel === "ops-missions" ? (
          <div className="mt-3">{dailyMissionsContent}</div>
        ) : null}
      </div>
    </>
  );
}

