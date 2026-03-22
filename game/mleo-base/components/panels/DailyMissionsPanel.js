function quickTagToneClass(tone = "neutral") {
  switch (tone) {
    case "good":
      return "bg-emerald-500/10 text-emerald-200 border border-emerald-400/20";
    case "warn":
      return "bg-amber-500/10 text-amber-200 border border-amber-400/20";
    case "risk":
      return "bg-rose-500/10 text-rose-200 border border-rose-400/20";
    case "info":
      return "bg-cyan-500/10 text-cyan-200 border border-cyan-400/20";
    default:
      return "bg-white/10 text-white/75 border border-white/10";
  }
}

function QuickTags({ tags, quiet }) {
  if (!Array.isArray(tags) || tags.length === 0) return null;

  return (
    <div className={`mt-2 flex flex-wrap gap-1.5 ${quiet ? "opacity-80" : ""}`}>
      {tags.map((tag) => (
        <span
          key={`${tag?.label}-${tag?.tone || "neutral"}`}
          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${quickTagToneClass(
            tag?.tone
          )}`}
        >
          {tag?.label}
        </span>
      ))}
    </div>
  );
}

export function DailyMissionsPanel({ panelTone, missions, onClaimMission, onOpenMissionInfo }) {
  return (
    <div className="space-y-2">
      {(Array.isArray(missions) ? missions : []).map((mission) => {
        const rowAccent =
          !mission.highlighted && panelTone?.missionRowAccent ? ` ${panelTone.missionRowAccent}` : "";
        return (
        <div
          key={mission.key}
          data-base-target={mission.key}
          className={`relative rounded-xl border p-2 ${
            mission.ready
              ? "border-amber-400/45 bg-amber-500/[0.12] shadow-[0_0_16px_rgba(251,191,36,0.08)]"
              : "border-white/[0.08] bg-white/[0.03]"
          } ${
            mission.highlighted
              ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
              : ""
          }${rowAccent}`}
        >
          <div className="absolute right-2.5 top-2.5 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMissionInfo?.(mission.key);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] font-bold text-cyan-200/80 outline-none transition hover:border-cyan-400/35 hover:bg-cyan-500/15 hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/35"
              aria-label={`Open info for ${mission.name}`}
              title={`Info about ${mission.name}`}
            >
              i
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="pr-8">
              <div className="text-xs font-semibold">{mission.name}</div>
              <div className="mt-0.5 text-[11px] text-white/58">
                Progress: {mission.progressText} / {mission.targetText}
              </div>
              <div className="mt-0.5 text-[11px] text-white/52">
                Reward: {mission.rewardText}
              </div>

              <QuickTags tags={mission.quickTags} quiet={!mission.ready} />

              {mission.helpText ? (
                <div className="mt-1.5 text-[11px] leading-snug text-white/45">{mission.helpText}</div>
              ) : null}
            </div>

            <button
              onClick={() => onClaimMission?.(mission.key)}
              disabled={!mission.done || mission.claimed}
              className={`flex min-h-11 shrink-0 items-center justify-center rounded-xl px-3 py-2 text-[11px] outline-none transition disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99] motion-reduce:active:scale-100 ${
                mission.ready
                  ? "font-extrabold bg-cyan-500 text-white shadow-[0_0_14px_rgba(34,211,238,0.25)] hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  : "font-semibold bg-white/[0.07] text-white/65 hover:bg-white/12 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              }`}
            >
              {mission.claimed ? "Claimed" : mission.done ? "Claim" : "In Progress"}
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

