import { useMemo } from "react";
import {
  DEFAULT_WORLD_MAP_THEME,
  resolveWorldMapTheme,
} from "../../worlds/worldMapTheme";

function pickLinkTone(theme, state) {
  if (state === "critical") return theme.links.critical;
  if (state === "warning") return theme.links.warning;
  return theme.links.normal;
}

function pickDotTone(theme, state) {
  if (state === "critical") return theme.dots.critical;
  if (state === "warning") return theme.dots.warning;
  return theme.dots.normal;
}

function mergeLineTone(base, boost) {
  if (!boost) return base;
  return { ...base, ...boost };
}

function selectedRingForNode(theme, isHq, isSelected) {
  if (!isSelected) return "hover:scale-[1.03]";
  if (isHq && theme.selectedRingHqClassName) return theme.selectedRingHqClassName;
  return theme.selectedRingClassName;
}

export function BaseHomeFlowScenePanel({
  layout,
  hq,
  links,
  nodes,
  selected,
  onSelect,
  theme: themeInput,
}) {
  const isDesktop = layout === "desktop";

  const theme = useMemo(() => {
    const base = themeInput || DEFAULT_WORLD_MAP_THEME;
    return resolveWorldMapTheme(base, layout);
  }, [themeInput, layout]);

  /** Desktop: grow with the map panel flex region (no fixed 16/7 inset card). */
  const aspectOuter = isDesktop
    ? "relative h-full min-h-0 w-full flex-1 overflow-visible"
    : "relative mx-auto w-full max-w-md aspect-[3/5] overflow-hidden";

  const shellClass = [theme.mapShellClassName].filter(Boolean).join(" ").trim();
  const shellLayout = isDesktop ? "flex min-h-0 h-full w-full flex-1 flex-col" : "";
  const shellCombined = [shellClass, shellLayout].filter(Boolean).join(" ").trim();
  const innerClass = [aspectOuter, theme.mapInnerClassName].filter(Boolean).join(" ").trim();

  /** Selected route paints last so it reads above crossings (no double-stroke). */
  const linksPaintOrder = useMemo(() => {
    return [...links].sort((a, b) => {
      if (a.key === selected) return 1;
      if (b.key === selected) return -1;
      return 0;
    });
  }, [links, selected]);

  const mobileRootClass =
    layout === "mobile" && theme.mapMobileRootClassName
      ? theme.mapMobileRootClassName.trim()
      : "";

  const mapCore = (
    <div className={shellCombined || undefined} style={theme.mapShellStyle}>
      <div className={innerClass} style={theme.mapInnerStyle}>
        {theme.overlays?.length
          ? theme.overlays.map((layer) => (
              <div
                key={layer.key}
                className={layer.className}
                style={layer.style}
                aria-hidden
              />
            ))
          : null}

        {theme.mapBadgeText ? (
          <div
            className={`pointer-events-none absolute z-[2] ${
              isDesktop
                ? "left-2 top-2 sm:left-2.5 sm:top-2.5"
                : "right-2.5 top-3 text-right"
            } ${theme.mapBadgeClassName}`}
          >
            {theme.mapBadgeText}
          </div>
        ) : null}

        <svg
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {linksPaintOrder.map((node) => {
            const baseTone = pickLinkTone(theme, node.state);
            const lineTone =
              selected === node.key && theme.linkSelected
                ? mergeLineTone(baseTone, theme.linkSelected)
                : baseTone;
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
                strokeLinecap={theme.linkStrokeLinecap || "butt"}
              />
            );
          })}
          {linksPaintOrder.map((node) => {
            const dotTone = pickDotTone(theme, node.state);
            const isLinkSelected = selected === node.key;
            const fill = isLinkSelected ? theme.dots.selectedFill : dotTone.fill;
            const boosted =
              isLinkSelected && theme.dots.selectedActive
                ? { ...dotTone, ...theme.dots.selectedActive }
                : dotTone;
            const filterStyle = boosted.filter ? { filter: boosted.filter } : undefined;
            return (
              <circle
                key={`dot-${node.key}`}
                cx={(hq.pos.x + node.pos.x) / 2}
                cy={(hq.pos.y + node.pos.y) / 2}
                r={boosted.r}
                fill={fill}
                style={filterStyle}
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const isHq = node.key === "hq";
          const isSelected = selected === node.key;
          const stateExtra =
            node.state === "critical"
              ? theme.node.criticalClassName
              : node.state === "warning"
              ? theme.node.warningClassName
              : "";

          const nodeSurface = isHq ? theme.node.hqClassName : theme.node.regularClassName;

          const iconClass = isHq ? theme.hqIconClassName : theme.regularIconClassName;

          return (
            <button
              key={node.key}
              type="button"
              onClick={() => onSelect(node.key)}
              title={node.name}
              className={`absolute z-[3] -translate-x-1/2 -translate-y-1/2 border-2 font-bold transition duration-150 active:scale-95 ${
                isHq
                  ? isDesktop
                    ? "min-w-[98px] rounded-[20px] px-5 py-3 text-[15px]"
                    : "min-w-[86px] rounded-2xl px-4 py-3 text-sm"
                  : isDesktop
                  ? "min-w-[74px] rounded-[16px] px-3 py-2 text-[11px]"
                  : "min-w-[64px] rounded-xl px-2.5 py-2 text-[11px]"
              } ${node.glowClass || ""} ${nodeSurface || ""} ${stateExtra || ""} ${selectedRingForNode(
                theme,
                isHq,
                isSelected
              )}`}
              style={{
                left: `${node.pos.x}%`,
                top: `${node.pos.y}%`,
              }}
            >
              <div className="flex items-center justify-center gap-1.5">
                <span className={iconClass || undefined}>{node.identity.icon}</span>
                <span className="uppercase tracking-[0.08em]">{node.identity.short}</span>
              </div>

              <div
                className={`mt-1 ${isHq ? "text-[11px]" : "text-[10px]"} opacity-85 ${theme.labelClassName || ""}`}
              >
                Lv {node.level}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (mobileRootClass) {
    return <div className={mobileRootClass}>{mapCore}</div>;
  }
  return mapCore;
}
