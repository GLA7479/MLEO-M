function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

function getPrimaryHint(base) {
  const res = base?.resources ?? {};
  const lvl = (k) => getBuildingLevel(base, k);

  const stability = Number(base?.stability ?? 100);
  const energy = Number(res.ENERGY ?? 0);
  const data = Number(res.DATA ?? 0);
  const banked = Number(base?.bankedMleo ?? 0);
  const claimable = Array.isArray(base?.claimableMissions) ? base.claimableMissions.length : 0;

  if (stability < 70) {
    return {
      tone: "amber",
      label: "Alert",
      text: "Stability is falling. Use Maintenance before expanding too aggressively.",
    };
  }

  if (banked >= 120) {
    return {
      tone: "emerald",
      label: "Ready",
      text: "You have enough banked MLEO for a shipment. Use Ship to Vault.",
    };
  }

  if (lvl("expeditionBay") > 0 && energy >= 36 && data >= 4) {
    return {
      tone: "cyan",
      label: "Ready",
      text: "Expedition is ready. Launch now before resources pile up.",
    };
  }

  if (claimable > 0) {
    return {
      tone: "violet",
      label: "Mission",
      text: `You have ${claimable} claimable mission${claimable > 1 ? "s" : ""}.`,
    };
  }

  if (lvl("tradeHub") <= 0 && lvl("quarry") >= 1) {
    return {
      tone: "emerald",
      label: "Next",
      text: "Build Trade Hub for steady GOLD flow.",
    };
  }

  if (lvl("salvage") <= 0 && lvl("quarry") >= 2) {
    return {
      tone: "amber",
      label: "Next",
      text: "Build Salvage to start generating SCRAP.",
    };
  }

  if (lvl("powerCell") <= 0 && lvl("tradeHub") >= 1) {
    return {
      tone: "cyan",
      label: "Next",
      text: "Build Power Cell to reduce ENERGY pressure.",
    };
  }

  if (lvl("refinery") <= 0 && lvl("salvage") >= 1 && lvl("tradeHub") >= 1) {
    return {
      tone: "violet",
      label: "Next",
      text: "Your first Refinery opens the banked MLEO path.",
    };
  }

  return {
    tone: "slate",
    label: "Status",
    text: "Grow production, keep stability high, then push into export and expeditions.",
  };
}

function toneClasses(tone) {
  if (tone === "emerald") return "border-emerald-500/30 bg-emerald-950/25 text-emerald-100";
  if (tone === "cyan") return "border-cyan-500/30 bg-cyan-950/25 text-cyan-100";
  if (tone === "violet") return "border-violet-500/30 bg-violet-950/25 text-violet-100";
  if (tone === "amber") return "border-amber-500/30 bg-amber-950/25 text-amber-100";
  return "border-slate-700/70 bg-slate-900/70 text-slate-100";
}

export function BaseHintV3({ base }) {
  const res = base?.resources ?? {};
  const stability = Number(base?.stability ?? 100);
  const energy = Number(res.ENERGY ?? 0);
  const data = Number(res.DATA ?? 0);
  const banked = Number(base?.bankedMleo ?? 0);

  const hint = getPrimaryHint(base);
  const tone = toneClasses(hint.tone);

  return (
    <>
      <div className="md:hidden w-full">
        <div className={`rounded-[22px] border px-3 py-2.5 ${tone}`}>
          <div className="text-[10px] uppercase tracking-[0.25em] opacity-70">{hint.label}</div>
          <div className="mt-1 text-[12px] leading-snug">{hint.text}</div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <div className={`rounded-[28px] border px-4 py-4 ${tone}`}>
          <div className="text-[11px] uppercase tracking-[0.28em] opacity-70">{hint.label}</div>
          <div className="mt-2 text-base font-semibold text-slate-100">Recommended action</div>
          <div className="mt-2 text-sm leading-6">{hint.text}</div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: "Energy", value: Math.floor(energy), warn: energy < 12 },
              { label: "Data", value: Math.floor(data), warn: data < 4 },
              { label: "Banked", value: Math.floor(banked), warn: false },
              { label: "Stability", value: `${Math.round(stability)}%`, warn: stability < 75 },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-2xl border px-3 py-2 ${
                  item.warn
                    ? "border-amber-500/30 bg-amber-950/25 text-amber-100"
                    : "border-slate-800 bg-slate-950/60 text-slate-100"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-70">{item.label}</div>
                <div className="mt-1 text-sm font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
