export function BaseHomeFlowScenePanel({
  layout,
  hq,
  links,
  nodes,
  selected,
  onSelect,
}) {
  const isDesktop = layout === "desktop";

  return (
    <div
      className={
        isDesktop
          ? "relative mx-auto w-full max-w-[1180px] aspect-[16/7] overflow-visible"
          : "relative mx-auto w-full max-w-md aspect-[3/5] overflow-hidden"
      }
    >
      {/* Background is rendered by the parent so the whole screen feels uniform */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {links.map((node) => {
          const lineTone =
            node.state === "critical"
              ? { stroke: "rgba(244,63,94,0.22)", width: "0.58", dash: "2.2 1.3" }
              : node.state === "warning"
              ? { stroke: "rgba(251,191,36,0.18)", width: "0.5", dash: "1.6 1.4" }
              : { stroke: "rgba(34,211,238,0.16)", width: "0.45", dash: "1.2 1.8" };

          return (
            <line
              key={`line-${node.key}`}
              x1={hq.pos.x}
              y1={hq.pos.y}
              x2={node.pos.x}
              y2={node.pos.y}
              stroke={lineTone.stroke}
              strokeWidth={lineTone.width}
              strokeDasharray={lineTone.dash}
            />
          );
        })}

        {links.map((node) => {
          const dotFill =
            node.state === "critical"
              ? "rgba(244,63,94,0.65)"
              : node.state === "warning"
              ? "rgba(251,191,36,0.55)"
              : "rgba(34,211,238,0.55)";

          const r =
            node.state === "critical" ? "1.0" : node.state === "warning" ? "0.85" : "0.7";

          return (
            <circle
              key={`dot-${node.key}`}
              cx={(hq.pos.x + node.pos.x) / 2}
              cy={(hq.pos.y + node.pos.y) / 2}
              r={r}
              fill={selected === node.key ? "rgba(255,255,255,0.95)" : dotFill}
            />
          );
        })}
      </svg>

      {nodes.map((node) => {
        const isHq = node.key === "hq";
        const isSelected = selected === node.key;

        return (
          <button
            key={node.key}
            type="button"
            onClick={() => onSelect(node.key)}
            title={node.name}
            className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 font-bold transition duration-150 active:scale-95 ${
              isHq
                ? isDesktop
                  ? "min-w-[98px] rounded-[20px] px-5 py-3 text-[15px]"
                  : "min-w-[86px] rounded-2xl px-4 py-3 text-sm"
                : isDesktop
                ? "min-w-[74px] rounded-[16px] px-3 py-2 text-[11px]"
                : "min-w-[64px] rounded-xl px-2.5 py-2 text-[11px]"
            } ${node.glowClass || ""} ${
              isSelected ? "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950 scale-[1.04]" : "hover:scale-[1.03]"
            }`}
            style={{
              left: `${node.pos.x}%`,
              top: `${node.pos.y}%`,
            }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className={isHq ? "text-emerald-300" : ""}>{node.identity.icon}</span>
              <span className="uppercase tracking-[0.08em]">{node.identity.short}</span>
            </div>

            <div className={`mt-1 ${isHq ? "text-[11px]" : "text-[10px]"} opacity-85`}>Lv {node.level}</div>
          </button>
        );
      })}

      {/* Buildings online badge removed */}
    </div>
  );
}

