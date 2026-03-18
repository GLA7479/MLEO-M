function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

export function BaseHintV3({ base }) {
  const res = base?.resources ?? {};
  const lvl = (k) => getBuildingLevel(base, k);

  const energy = Number(res.ENERGY ?? 0);
  const data = Number(res.DATA ?? 0);

  const hint = (() => {
    if (lvl("tradeHub") <= 0 && lvl("quarry") >= 1) return { tone: "emerald", text: "Build Trade Hub for steady GOLD flow." };
    if (lvl("salvage") <= 0 && lvl("quarry") >= 2) return { tone: "amber", text: "Build Salvage to start generating SCRAP." };
    if (lvl("powerCell") <= 0 && lvl("tradeHub") >= 1) return { tone: "cyan", text: "Power Cell reduces ENERGY pressure (cap + regen)." };
    if (lvl("refinery") <= 0 && lvl("salvage") >= 1 && lvl("tradeHub") >= 1)
      return { tone: "violet", text: "First Refinery opens the banked MLEO path." };
    if (lvl("expeditionBay") > 0 && energy >= 36 && data >= 4) return { tone: "emerald", text: "Expedition ready: you have 36 ENERGY + 4 DATA." };
    return null;
  })();

  if (!hint) return null;

  const tone =
    hint.tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-100"
      : hint.tone === "cyan"
      ? "border-cyan-500/30 bg-cyan-950/20 text-cyan-100"
      : hint.tone === "violet"
      ? "border-violet-500/30 bg-violet-950/20 text-violet-100"
      : "border-amber-500/30 bg-amber-950/20 text-amber-100";

  return (
    <div className="w-full px-3 -mt-1">
      <div className={`mx-auto max-w-md rounded-xl border ${tone} px-3 py-2 text-[11px] leading-snug`}>
        <span className="uppercase tracking-widest text-[9px] opacity-75 mr-2">NEXT</span>
        {hint.text}
      </div>
    </div>
  );
}

