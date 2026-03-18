const ROLE_LABELS = {
  engineer: "Engineer",
  logistician: "Logistician",
  researcher: "Researcher",
  scout: "Scout",
  operations: "Operations",
};

export function CrewPanel({ state }) {
  const crewCount = Number(state?.crew || 0);
  const roleKey = state?.crewRole || "engineer";
  const roleLabel = ROLE_LABELS[roleKey] || roleKey;

  return (
    <div className="mt-2 rounded border border-slate-800 bg-slate-900/80 p-2 text-[11px] text-slate-200">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">Crew</span>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
          {crewCount} members
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Active role</span>
        <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-200">
          {roleLabel}
        </span>
      </div>
    </div>
  );
}

