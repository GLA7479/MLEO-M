import { createContext, useContext } from "react";
import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";
import { WorldSectorPanel } from "./WorldSectorPanel";
const BaseOverviewPanelToneContext = createContext(null);

function toneClasses(tone = "info") {
  if (tone === "critical") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }
  if (tone === "warning") {
    return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  }
  if (tone === "success") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}

function CardShell({ className = "", weight = "default", children, ...rest }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const shell = pt?.cardShell ? ` ${pt.cardShell}` : "";
  const weightCls =
    weight === "attention"
      ? "rounded-xl border border-white/12 bg-white/[0.065] p-3 ring-1 ring-cyan-400/12 sm:rounded-2xl sm:p-3.5"
      : weight === "muted"
      ? "rounded-xl border border-white/[0.04] bg-white/[0.012] p-2.5 sm:p-3"
      : "rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 sm:rounded-2xl sm:p-3.5";
  return (
    <div {...rest} className={`${weightCls}${shell} ${className}`}>
      {children}
    </div>
  );
}

function MiniStat({ label, value, note, desktopComfort = false }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const ms = pt?.miniStat ? ` ${pt.miniStat}` : "";
  const comfort =
    desktopComfort
      ? "min-w-0 lg:px-3 lg:py-2.5 lg:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
      : "";
  const labelCls = desktopComfort
    ? "text-[10px] font-medium uppercase tracking-[0.12em] text-white/38 whitespace-normal [word-break:break-word] leading-snug lg:tracking-[0.13em]"
    : "text-[10px] font-medium uppercase tracking-[0.14em] text-white/38";
  const valueCls = desktopComfort
    ? "mt-1 text-sm font-bold tabular-nums text-white/95 break-words lg:text-base lg:leading-tight"
    : "mt-0.5 text-sm font-bold text-white/95";
  const noteCls = desktopComfort
    ? "mt-1 text-[11px] leading-snug text-white/46 line-clamp-2 lg:line-clamp-3 lg:text-[12px]"
    : "mt-0.5 text-[11px] leading-snug text-white/46 line-clamp-2";

  return (
    <div className={`min-w-0 rounded-lg border border-white/[0.06] bg-black/[0.14] px-2.5 py-2${ms} ${comfort}`}>
      <div className={labelCls}>{label}</div>
      <div className={valueCls}>{value}</div>
      {note ? <div className={noteCls}>{note}</div> : null}
    </div>
  );
}

function SectionHeader({ title, hint, right, quiet = false }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const bar = pt?.sectionBar;
  return (
    <div className={`flex items-start justify-between gap-2 ${quiet ? "mb-1.5" : "mb-2"}`}>
      <div className="min-w-0">
        <div
          className={
            quiet
              ? "text-[11px] font-semibold uppercase tracking-[0.11em] text-white/44"
              : "text-sm font-black uppercase tracking-[0.16em] text-white"
          }
        >
          {title}
        </div>
        {bar ? <div className={bar} aria-hidden /> : null}
        {hint ? (
          <div
            className={`leading-snug ${quiet ? "mt-0.5 text-[10px] text-white/32 line-clamp-2" : "mt-1 text-xs text-white/55"}`}
          >
            {hint}
          </div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function AvailabilityBadge({ count, subdued = false }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const badge = pt?.availabilityBadge ? ` ${pt.availabilityBadge}` : "";
  if (!count) return null;
  const cls = subdued
    ? `ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.035] px-1.5 py-px text-[10px] font-semibold text-white/48${badge}`
    : `ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full border border-cyan-300/22 bg-cyan-400/[0.06] px-1.5 py-px text-[10px] font-bold text-cyan-200/80${badge}`;
  return <span className={cls}>{count}</span>;
}

function formatValue(value, digits = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
  }
  return n.toFixed(digits).replace(/\.?0+$/, "").replace(/\.$/, "");
}

function isBaseStatusUrgent(status) {
  if (!status) return false;
  const t = status.tone;
  return t === "critical" || t === "warning";
}

/** Phase 2C — shared CTA chrome per hierarchy (shape aligned, fill tiered). */
const ovEyebrowPrimary =
  "text-[10px] font-medium uppercase tracking-[0.14em] text-white/38 sm:tracking-[0.15em]";
const ovTitlePrimary = "font-black leading-tight text-white";
const ovCtaPrimaryCyan =
  "mt-2 flex w-full min-h-[44px] items-center justify-center rounded-lg border border-cyan-400/32 bg-cyan-500/14 px-2.5 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/42 hover:bg-cyan-500/20 active:brightness-110 sm:mt-2.5 sm:min-h-0 sm:w-auto sm:justify-center sm:rounded-xl sm:py-1.5 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]";
const ovCtaPrimaryCyanLead =
  "mt-2 flex w-full min-h-[44px] items-center justify-center rounded-lg border border-cyan-400/42 bg-cyan-500/22 px-3 py-2.5 text-sm font-bold text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.08)] transition hover:border-cyan-400/50 hover:bg-cyan-500/28 active:brightness-110 sm:mt-2.5 sm:min-h-0 sm:w-auto sm:rounded-xl sm:px-3 sm:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]";
const ovCtaPrimaryAmber =
  "mt-2 flex w-full min-h-[44px] items-center justify-center rounded-lg border border-amber-400/32 bg-amber-500/14 px-2.5 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-400/40 hover:bg-amber-500/20 active:brightness-110 sm:mt-2.5 sm:min-h-0 sm:w-auto sm:rounded-xl sm:py-1.5 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]";
const ovCtaSecondaryNeutral =
  "mt-2 flex w-full min-h-[44px] items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.055] px-2.5 py-2 text-xs font-medium text-white/88 transition hover:border-white/[0.16] hover:bg-white/[0.09] active:brightness-110 sm:mt-2 sm:min-h-0 sm:w-auto sm:rounded-xl sm:py-1.5 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]";
const ovCtaTertiaryQuiet =
  "flex min-h-[44px] w-full items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-xs font-medium text-white/74 transition hover:border-white/[0.12] hover:bg-white/[0.055] active:brightness-110 sm:min-h-0 sm:rounded-xl sm:py-1.5 sm:text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/18 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]";

const ovSecondaryHeading =
  "text-[11px] font-semibold uppercase tracking-[0.11em] text-white/64 sm:text-xs sm:tracking-[0.13em]";
const ovTertiaryHeading =
  "text-[11px] font-medium uppercase tracking-[0.11em] text-white/40 sm:text-xs sm:tracking-[0.12em]";

function ActionButton({ action, onNavigate, emphasis = "default" }) {
  if (!action?.target || typeof onNavigate !== "function") return null;

  const cls =
    emphasis === "high"
      ? ovCtaPrimaryCyanLead
      : "mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/18 active:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25";

  return (
    <button onClick={() => onNavigate(action.target)} className={cls}>
      {emphasis === "high" ? action.cta || "Continue" : action.cta || "Open"}
    </button>
  );
}

function BaseStatusBlock({ status, variant = "prominent" }) {
  if (!status) return null;
  const chips = Array.isArray(status?.chips) ? status.chips.slice(0, 2) : [];
  const chipClass = (tone) =>
    tone === "critical"
      ? "border-rose-300/35 bg-rose-500/12 text-rose-100"
      : tone === "warning"
      ? "border-amber-300/35 bg-amber-400/12 text-amber-100"
      : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100";

  const support = variant === "support";
  const shellWeight = support ? "muted" : "attention";
  return (
    <CardShell weight={shellWeight} className={toneClasses(status.tone)}>
      <div className={support ? "text-[10px] font-medium uppercase tracking-[0.16em] text-white/40" : ovEyebrowPrimary}>
        Base Status
      </div>
      {chips.length ? (
        <div className={`flex flex-wrap gap-1 ${support ? "mt-1" : "mt-1.5"}`}>
          {chips.map((chip) => (
            <span
              key={chip.key}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${chipClass(
                chip.tone
              )}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={`${ovTitlePrimary} ${support ? "mt-1 text-sm text-white/86" : "mt-1.5 text-xl sm:text-2xl"}`}
      >
        {status.label}
      </div>
      <div
        className={`${support ? "mt-0.5 text-[11px] leading-snug text-white/50 line-clamp-2" : "mt-1.5 text-sm leading-snug text-white/78 line-clamp-3"}`}
      >
        {status.text}
      </div>
    </CardShell>
  );
}

function BottleneckBlock({ bottleneck, onNavigate }) {
  if (!bottleneck) return null;
  const actionable = Boolean(bottleneck.target);
  return (
    <CardShell
      weight={actionable ? "attention" : "default"}
      className={
        actionable
          ? "transition duration-200 hover:border-white/[0.14] hover:ring-1 hover:ring-cyan-400/14"
          : "border-dashed border-white/[0.08] bg-white/[0.02]"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={ovEyebrowPrimary}>Main Bottleneck</div>
          <div className={`mt-1 text-base ${ovTitlePrimary} sm:text-lg`}>{bottleneck.label}</div>
          <div className="mt-1 text-xs leading-snug text-white/68 line-clamp-2 sm:line-clamp-3 sm:text-sm">
            {bottleneck.text}
          </div>
        </div>
        <div
          className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] sm:rounded-xl sm:px-2.5 sm:py-1 sm:text-[11px] sm:tracking-[0.14em] ${toneClasses(
            bottleneck.tone
          )}`}
        >
          {bottleneck.tone || "info"}
        </div>
      </div>

      {bottleneck.target ? (
        <button onClick={() => onNavigate?.(bottleneck.target)} className={ovCtaPrimaryCyan}>
          Inspect
        </button>
      ) : null}
    </CardShell>
  );
}

function NextActionBlock({ action, onNavigate }) {
  if (!action) return null;
  return (
    <CardShell
      weight="attention"
      className="border-cyan-400/26 bg-cyan-500/[0.06] transition duration-200 hover:border-cyan-400/34 hover:bg-cyan-500/[0.07] hover:shadow-[0_0_28px_rgba(34,211,238,0.07)]"
    >
      <div className={`${ovEyebrowPrimary} text-cyan-100/75`}>Best Next Action</div>
      <div className={`mt-1 text-base ${ovTitlePrimary} sm:text-lg`}>{action.title}</div>
      <div className="mt-1 text-xs leading-snug text-white/76 line-clamp-2 sm:line-clamp-3 sm:text-sm">
        {action.text}
      </div>
      <ActionButton action={action} onNavigate={onNavigate} emphasis="high" />
    </CardShell>
  );
}

function RatesBlock({ rates, openInnerPanel, toggleInnerPanel }) {
  if (!rates) return null;
  const openKey = "overview-rates";
  const isOpen = openInnerPanel === openKey;
  const ratesHint = !isOpen
    ? `${formatValue(rates.bankedPerHour)}/hr · +${formatValue(rates.projectedPerDay)}/d · ${
        rates.refineryState || "—"
      }`
    : null;

  return (
    <CardShell>
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        compact
        overviewTapRow
      >
        <div className={ovSecondaryHeading}>Live Rates</div>
        {ratesHint ? (
          <div className="mt-0.5 text-[10px] leading-snug text-white/40 line-clamp-1 sm:line-clamp-2 sm:text-[11px]">
            {ratesHint}
          </div>
        ) : null}
        {!isOpen ? (
          <div className="mt-0.5 hidden text-[9px] leading-tight text-white/26 sm:block">
            ORE/DATA rates · refinery · cap timing
          </div>
        ) : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:mt-2.5 sm:grid-cols-2 sm:gap-3">
            <MiniStat desktopComfort label="Banked / hr" value={`${formatValue(rates.bankedPerHour)}`} />
            <MiniStat desktopComfort label="Projected / day" value={`${formatValue(rates.projectedPerDay)}`} />
            <MiniStat desktopComfort label="ORE / hr" value={`${formatValue(rates.orePerHour)}`} />
            <MiniStat desktopComfort label="DATA / hr" value={`${formatValue(rates.dataPerHour)}`} />
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-white/44">
            <span className="rounded-lg border border-white/[0.07] bg-black/[0.14] px-2 py-1">
              Refinery: {rates.refineryState || "Unknown"}
            </span>
            {(() => {
              const eta =
                rates.etaToMleoCapHours != null ? rates.etaToMleoCapHours : rates.etaToShipCapHours;
              return eta != null ? (
                <span className="rounded-lg border border-white/[0.07] bg-black/[0.14] px-2 py-1">
                  Cap ETA {formatValue(eta, 1)}h
                </span>
              ) : null;
            })()}
          </div>
        </>
      ) : null}
    </CardShell>
  );
}

function StabilityBlock({ stability, openInnerPanel, toggleInnerPanel }) {
  if (!stability) return null;

  const openKey = "overview-stability";
  const isOpen = openInnerPanel === openKey;
  const stabilityHint = !isOpen
    ? `${formatValue(stability.value)}% · ${stability.impactLabel || "—"} / ${stability.pressureLabel || "—"}`
    : null;

  return (
    <CardShell>
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        compact
        overviewTapRow
      >
        <div className={ovSecondaryHeading}>Stability Insight</div>
        {stabilityHint ? (
          <div className="mt-0.5 text-[10px] leading-snug text-white/40 line-clamp-1 sm:line-clamp-2 sm:text-[11px]">
            {stabilityHint}
          </div>
        ) : null}
        {!isOpen ? (
          <div className="mt-0.5 hidden text-[9px] leading-tight text-white/26 sm:block">
            Impact · pressure · repair context
          </div>
        ) : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:mt-2.5 sm:grid-cols-2 sm:gap-3">
          <MiniStat desktopComfort label="Stability" value={`${formatValue(stability.value)}%`} />
          <MiniStat desktopComfort label="Impact" value={stability.impactLabel} note={stability.impactText} />
          <MiniStat desktopComfort label="Pressure" value={stability.pressureLabel} note={stability.pressureText} />
          <MiniStat desktopComfort label="Repair" value={stability.repairSupportLabel} note={stability.repairSupportText} />
        </div>
      ) : null}
    </CardShell>
  );
}

function DailyProgressBlock({ progress, openInnerPanel, toggleInnerPanel }) {
  if (!progress) return null;

  const openKey = "overview-daily-progress";
  const isOpen = openInnerPanel === openKey;
  const mleoCur =
    (progress.mleoDailyProgress?.current ?? progress.shipProgress?.current) || 0;
  const mleoMax = (progress.mleoDailyProgress?.max ?? progress.shipProgress?.max) || 0;
  const dailyHint = !isOpen
    ? `${formatValue(mleoCur)}/${formatValue(mleoMax)} MLEO · ${formatValue(progress.expeditionsDone || 0, 0)}ex · ${formatValue(
        progress.missionsReady || 0,
        0
      )} mis`
    : null;

  return (
    <CardShell>
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        compact
        overviewTapRow
      >
        <div className={ovSecondaryHeading}>Daily Progress</div>
        {dailyHint ? (
          <div className="mt-0.5 text-[10px] leading-snug text-white/40 line-clamp-1 sm:line-clamp-2 sm:text-[11px]">
            {dailyHint}
          </div>
        ) : null}
        {!isOpen ? (
          <div className="mt-0.5 hidden text-[9px] leading-tight text-white/26 sm:block">
            MLEO cap · expeditions · missions detail
          </div>
        ) : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:mt-2.5 sm:grid-cols-2 sm:gap-3">
          <MiniStat
            desktopComfort
            label="Daily MLEO"
            value={`${formatValue(mleoCur)}/${formatValue(mleoMax)}`}
          />
          <MiniStat desktopComfort label="Expeditions" value={formatValue(progress.expeditionsDone || 0, 0)} />
          <MiniStat desktopComfort label="Maintenance" value={formatValue(progress.maintenanceDone || 0, 0)} />
          <MiniStat
            desktopComfort
            label="Missions"
            value={`${formatValue(progress.missionsReady || 0, 0)} ready`}
            note={`${formatValue(progress.missionsCompleted || 0, 0)} completed`}
          />
        </div>
      ) : null}
    </CardShell>
  );
}

function MissionFocusBlock({ missionGuidance, onNavigate }) {
  if (!missionGuidance?.title) return null;
  const actionable = Boolean(missionGuidance.target);
  return (
    <CardShell
      weight={actionable ? "attention" : "default"}
      className={
        actionable
          ? "border-cyan-400/20 bg-cyan-500/[0.045] transition duration-200 hover:border-cyan-400/28 hover:bg-cyan-500/[0.055]"
          : "border border-cyan-400/12 bg-cyan-500/[0.025]"
      }
    >
      <div className={`${ovEyebrowPrimary} text-cyan-100/72`}>Mission Focus</div>
      <div className={`mt-1 text-sm ${ovTitlePrimary} leading-snug`}>{missionGuidance.title}</div>
      <div className="mt-0.5 text-xs leading-snug text-white/70 line-clamp-2 sm:text-sm">
        {missionGuidance.hint}
      </div>
      {missionGuidance.target ? (
        <button onClick={() => onNavigate?.(missionGuidance.target)} className={ovCtaPrimaryCyan}>
          {missionGuidance.cta || "Open missions"}
        </button>
      ) : null}
    </CardShell>
  );
}

function RecoveryHintBlock({ hint, onNavigate }) {
  if (!hint?.text) return null;
  const actionable = Boolean(hint?.target);
  return (
    <CardShell
      weight={actionable ? "attention" : "default"}
      className={
        actionable
          ? "border-amber-400/28 bg-amber-500/[0.055] transition duration-200 hover:border-amber-400/36 hover:bg-amber-500/[0.065]"
          : "border-amber-400/15 bg-amber-500/[0.03]"
      }
    >
      <div className={`${ovEyebrowPrimary} text-amber-100/78`}>{hint.title || "Recovery hint"}</div>
      <div className="mt-1 text-xs leading-snug text-white/76 line-clamp-2 sm:line-clamp-3 sm:text-sm">
        {hint.text}
      </div>
      {hint?.target ? (
        <button onClick={() => onNavigate?.(hint.target)} className={ovCtaPrimaryAmber}>
          Open recovery actions
        </button>
      ) : null}
    </CardShell>
  );
}

function TodaysLoopBlock({ steps, onNavigate }) {
  const list = Array.isArray(steps) ? steps.slice(0, 4) : [];
  if (!list.length) return null;

  const statusClass = (status) =>
    status === "Ready"
      ? "text-cyan-200"
      : status === "Done"
      ? "text-emerald-200/90"
      : "text-white/55";

  const firstActionable = list.find((s) => s?.target);

  return (
    <CardShell className="border-white/[0.06]">
      <div className={`${ovSecondaryHeading} text-white/58`}>Today&apos;s Loop</div>
      <p className="mt-0.5 text-[9px] leading-tight text-white/26 sm:text-[10px] sm:text-white/30">
        Order at a glance · use the shortcut when shown
      </p>
      <div className="mt-1.5 space-y-1">
        {list.map((step, idx) => (
          <div
            key={`${step.title}-${idx}`}
            className="flex items-center justify-between gap-2 text-xs sm:text-sm"
          >
            <div className="min-w-0 truncate text-white/78">
              <span className="mr-1.5 text-white/40">{idx + 1}.</span>
              <span>{step.title}</span>
            </div>
            <span className={`shrink-0 text-[10px] font-semibold sm:text-[11px] ${statusClass(step.status)}`}>
              {step.status || "Soon"}
            </span>
          </div>
        ))}
      </div>
      {firstActionable ? (
        <button onClick={() => onNavigate?.(firstActionable.target)} className={ovCtaSecondaryNeutral}>
          First step
        </button>
      ) : null}
    </CardShell>
  );
}

function BuildOpportunitiesCard({
  buildOpportunitiesCount,
  availableStructuresCount,
  availableModulesCount,
  availableResearchCount,
  availableBlueprintCount,
  onOpenBuildPanel,
}) {
  const hintLine = [
    availableStructuresCount > 0 ? `${availableStructuresCount} struct` : null,
    availableModulesCount > 0 ? `${availableModulesCount} mod` : null,
    availableResearchCount > 0 ? `${availableResearchCount} research` : null,
    availableBlueprintCount > 0 ? "blueprint" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CardShell weight="muted" className="h-full">
      <SectionHeader
        quiet
        title="Build Opportunities"
        hint={hintLine || "Nothing queued"}
        right={
          <AvailabilityBadge subdued count={buildOpportunitiesCount > 0 ? buildOpportunitiesCount : 0} />
        }
      />
      {buildOpportunitiesCount > 0 ? (
        <button onClick={onOpenBuildPanel} className={ovCtaTertiaryQuiet}>
          Open Build
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/[0.08] px-2.5 py-2 text-center text-[10px] leading-snug text-white/38 sm:text-[11px]">
          Caught up for now. Earn resources to unlock new build paths.
        </div>
      )}
    </CardShell>
  );
}

function IdentityCard({
  showCrew,
  crewRoleInfo,
  roleBonusText,
  commanderPathInfo,
  commanderPathText,
  openInnerPanel,
  toggleInnerPanel,
}) {
  if (!showCrew) return null;
  const openKey = "overview-identity";
  const isOpen = openInnerPanel === openKey;

  return (
    <CardShell weight="muted" className="h-full">
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        compact
        subtlePill
        overviewTapRow
      >
        <div className={ovTertiaryHeading}>Command Identity</div>
        {!isOpen ? (
          <div className="mt-0.5 text-[10px] leading-snug text-white/36 line-clamp-1 sm:line-clamp-2 sm:text-[11px]">
            Role · path snapshot
          </div>
        ) : null}
        {!isOpen ? (
          <div className="mt-0.5 hidden text-[9px] leading-tight text-white/24 sm:block">
            Bonuses · commander details inside
          </div>
        ) : null}
      </ExpandablePanelSectionHeader>
      {isOpen ? (
        <div className="mt-2 space-y-2 text-sm sm:mt-2.5 sm:space-y-2.5">
          <div className="rounded-lg border border-white/[0.08] bg-black/18 p-2.5 sm:rounded-xl sm:p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Crew Role</div>
            <div className="mt-1 font-bold text-white">{crewRoleInfo?.name}</div>
            <div className="mt-1 text-white/70">{roleBonusText}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/18 p-2.5 sm:rounded-xl sm:p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Commander Path</div>
            <div className="mt-1 font-bold text-white">{commanderPathInfo?.name}</div>
            <div className="mt-1 text-white/70">{commanderPathText}</div>
          </div>
        </div>
      ) : null}
    </CardShell>
  );
}

function SpecializationSummaryCard({ summary, onNavigate, openInnerPanel, toggleInnerPanel }) {
  if (!summary?.buildings?.length) return null;
  const t = summary.totals || {};
  const rec = summary.topRecommendation || {};

  const openKey = "overview-specialization";
  const isOpen = openInnerPanel === openKey;
  const specHint = !isOpen
    ? `T${t.supportBuildingsTier2Plus ?? 0}/3 · ${t.totalUnlockedPrograms ?? 0} prog · ${
        t.totalClaimableMilestones ?? 0
      } claim`
    : null;

  const statMini = (label, value, accentClass = "text-white") => (
    <div className="rounded-lg border border-white/[0.08] bg-black/22 px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40 sm:tracking-[0.14em]">
        {label}
      </div>
      <div className={`mt-0.5 text-[11px] font-black leading-tight sm:text-xs md:text-sm ${accentClass}`}>
        {value}
      </div>
    </div>
  );

  return (
    <CardShell
      weight="muted"
      className="border-white/[0.045] bg-gradient-to-br from-cyan-500/[0.016] via-violet-500/[0.01] to-transparent"
    >
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        compact
        subtlePill
        overviewTapRow
      >
        <div className={ovTertiaryHeading}>Specialization</div>
        {specHint ? (
          <div className="mt-0.5 text-[10px] leading-snug text-white/36 line-clamp-1 sm:line-clamp-2 sm:text-[11px]">
            {specHint}
          </div>
        ) : null}
        {!isOpen ? (
          <div className="mt-0.5 hidden text-[9px] leading-tight text-white/24 sm:block">
            Buildings · programs · milestones
          </div>
        ) : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-2.5 sm:grid-cols-4 sm:gap-2">
            {statMini(
              "Tiers",
              `${t.supportBuildingsTier2Plus ?? 0}/3`,
              "text-cyan-200"
            )}
            {statMini(
              "Programs",
              `${t.totalUnlockedPrograms ?? 0} unlocked · ${t.totalActivePrograms ?? 0} active`,
              "text-violet-200"
            )}
            {statMini(
              "Milestones",
              `${t.totalClaimedMilestones ?? 0}/${t.totalMilestoneSlots || 6} · ${
                t.totalClaimableMilestones ?? 0
              } ready`,
              "text-amber-100"
            )}
            {statMini(
              "Adv. contracts",
              `${t.totalVisibleAdvancedContracts ?? 0} shown · ${t.totalReadyAdvancedContracts ?? 0} ready`,
              "text-cyan-100"
            )}
          </div>

          {rec.text ? (
            <button
              type="button"
              onClick={() => rec.navigateTarget && onNavigate?.(rec.navigateTarget)}
              disabled={!rec.navigateTarget}
              className={`mt-2 w-full rounded-lg border px-2.5 py-2 text-left text-xs font-medium leading-snug transition sm:mt-2.5 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm ${
                rec.navigateTarget
                  ? "border-cyan-400/18 bg-cyan-500/[0.055] text-cyan-100/88 hover:border-cyan-400/24 hover:bg-cyan-500/[0.09] active:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]"
                  : "cursor-default border-white/[0.06] bg-white/[0.025] text-white/58"
              }`}
            >
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200/70 sm:text-[10px] sm:tracking-[0.16em]">
                Next focus
              </span>
              <div className="mt-0.5 text-white sm:mt-1">{rec.text}</div>
              {rec.navigateTarget ? (
                <div className="mt-0.5 text-[10px] text-cyan-200/75 sm:mt-1 sm:text-[11px]">Open in Structures</div>
              ) : null}
            </button>
          ) : null}

          <div className="mt-2 space-y-1.5 sm:mt-2.5 sm:space-y-2">
            {summary.buildings.map((row) => (
              <button
                key={row.buildingKey}
                type="button"
                onClick={() => onNavigate?.({ tab: "build", target: row.buildingKey })}
                className="w-full rounded-lg border border-white/[0.08] bg-black/18 px-2.5 py-1.5 text-left transition hover:border-cyan-400/22 hover:bg-black/26 active:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f] sm:rounded-xl sm:px-3 sm:py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-[13px] font-bold text-white">{row.buildingName}</div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100">
                      T{row.tier}
                    </span>
                    {row.activeProgramKey ? (
                      <span className="inline-flex max-w-[120px] truncate rounded-full border border-violet-400/30 bg-violet-500/12 px-2 py-0.5 text-[9px] font-bold text-violet-100">
                        Active
                      </span>
                    ) : null}
                    {row.claimableMilestones > 0 ? (
                      <span className="inline-flex rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-100">
                        Milestone
                      </span>
                    ) : null}
                    {row.advancedContractsReady > 0 ? (
                      <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100">
                        Contract
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-white/60">
                  {row.activeProgramLabel || "No active program"}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/45">
                  <span>
                    Milestones: {row.claimedMilestones}/{row.totalMilestones || 0}
                  </span>
                  <span>Ready items: {row.readyItemsCount}</span>
                  <span className="text-white/35">
                    Next: {row.nextMilestoneLabel}
                  </span>
                </div>
                {row.nextActionText ? (
                  <div className="mt-0.5 text-[10px] text-amber-100/55">{row.nextActionText}</div>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </CardShell>
  );
}

function ContractsCard({
  liveContractsAvailableCount,
  liveContracts,
  openInnerPanel,
  toggleInnerPanel,
  onClaimContract,
}) {
  const openKey = "overview-contracts";
  const isOpen = openInnerPanel === openKey;

  const contractsHint = !isOpen
    ? liveContractsAvailableCount > 0
      ? `${liveContractsAvailableCount} reward${liveContractsAvailableCount > 1 ? "s" : ""} ready to claim`
      : "No rewards ready — progress contracts to unlock claims"
    : null;

  return (
    <CardShell weight="muted" data-base-target="contracts" className="h-full">
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        compact
        subtlePill
        overviewTapRow
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <div className={ovTertiaryHeading}>Live Contracts</div>
          <AvailabilityBadge subdued count={liveContractsAvailableCount} />
        </div>
        {contractsHint ? (
          <div className="mt-0.5 text-[10px] leading-snug text-white/36 line-clamp-2 sm:text-[11px] sm:text-white/40">
            {contractsHint}
          </div>
        ) : null}
        {!isOpen ? (
          <div className="mt-0.5 hidden text-[9px] leading-tight text-white/24 sm:block">
            Full list · claim when complete
          </div>
        ) : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <div className="mt-2 space-y-2 sm:mt-2.5 sm:space-y-2.5">
          {(!liveContracts || liveContracts.length === 0) ? (
            <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/[0.08] px-2.5 py-3 text-center text-[10px] leading-snug text-white/40">
              No live contracts in this view.
            </div>
          ) : null}
          {[...(liveContracts || [])]
            .sort((a, b) => {
              const aReady = a.done && !a.claimed ? 1 : 0;
              const bReady = b.done && !b.claimed ? 1 : 0;
              return bReady - aReady;
            })
            .map((contract) => (
              <div key={contract.key} className="rounded-lg border border-white/[0.08] bg-black/18 p-2.5 sm:rounded-xl sm:p-3">
                <div className="text-sm font-bold text-white">{contract.title}</div>
                {contract.contractClass === "elite" ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-amber-100">
                      Elite
                    </span>
                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-bold text-white/55">
                      Rotates daily
                    </span>
                    {contract.eliteTierPill ? (
                      <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-bold text-cyan-100">
                        {contract.eliteTierPill}
                      </span>
                    ) : null}
                    {contract.eliteProgramPill ? (
                      <span className="inline-flex max-w-full rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold text-white/65">
                        {contract.eliteProgramPill}
                      </span>
                    ) : null}
                  </div>
                ) : contract.contractClass === "advanced" ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-violet-100">
                      Advanced
                    </span>
                    {contract.advancedTierPill ? (
                      <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-bold text-cyan-100">
                        {contract.advancedTierPill}
                      </span>
                    ) : null}
                    {contract.advancedProgramPill ? (
                      <span className="inline-flex max-w-full rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold text-white/65">
                        {contract.advancedProgramPill}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {contract.contractClass === "elite" && contract.desc ? (
                  <div className="mt-1 text-[11px] leading-snug text-white/50">{contract.desc}</div>
                ) : null}
                <div className="mt-1 text-xs text-white/60 sm:text-sm">{contract.rewardText}</div>
                <button
                  onClick={() => onClaimContract(contract.key)}
                  disabled={!contract.done || contract.claimed}
                  className={`mt-2 w-full sm:mt-2.5 ${ovCtaTertiaryQuiet} disabled:pointer-events-none disabled:opacity-40`}
                >
                  {contract.claimed ? "Claimed" : contract.done ? "Claim" : "In Progress"}
                </button>
              </div>
            ))}
        </div>
      ) : null}
    </CardShell>
  );
}

export function OverviewPanelCards({
  panelTone,
  overview,
  missionGuidance,
  nextStep,
  onNavigate,
  openInnerPanel,
  toggleInnerPanel,
  buildOpportunitiesCount,
  availableStructuresCount,
  availableModulesCount,
  availableResearchCount,
  availableBlueprintCount,
  onOpenBuildPanel,
  showCrew,
  crewRoleInfo,
  roleBonusText,
  commanderPathInfo,
  commanderPathText,
  liveContractsAvailableCount,
  liveContracts,
  onClaimContract,
  specializationSummary,
  sectorWorldSnapshot,
  onDeployNextSector,
  sectorDeployBusy,
  systemsHint,
  doctrineContextHint = null,
}) {
  const actionFallback =
    nextStep && (nextStep?.title || nextStep?.text)
      ? {
          title: nextStep?.title || "Best Next Action",
          text: nextStep?.text || "",
          cta: "Open",
        }
      : null;

  const safeOverview = overview || {};

  const flavor = sectorWorldSnapshot?.panelFlavor;
  const worldOverviewHint = flavor?.overviewHint;
  const overviewStripTitle = flavor?.overviewStripTitle;
  const overviewStripShellClassName =
    flavor?.overviewStripShellClassName ||
    "rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-snug text-amber-50/90";
  const overviewStripTitleClassName =
    flavor?.overviewStripTitleClassName ||
    "font-black uppercase tracking-[0.14em] text-amber-200/85";

  const stackTone = panelTone?.overviewStack ? ` ${panelTone.overviewStack}` : "";
  const systemsTone = panelTone?.systemsHint ? ` ${panelTone.systemsHint}` : "";

  const showDoctrineStrip = Boolean(
    doctrineContextHint && !worldOverviewHint && !systemsHint
  );
  const hasTopContextRail = Boolean(worldOverviewHint || systemsHint || showDoctrineStrip);

  const baseStatusPayload = {
    ...(safeOverview.baseStatus || {}),
    chips: safeOverview.bottleneckChips || [],
  };
  const baseStatusUrgent = isBaseStatusUrgent(baseStatusPayload);

  return (
    <BaseOverviewPanelToneContext.Provider value={panelTone || null}>
      <div className={`space-y-3 sm:space-y-4${stackTone}`}>
        {hasTopContextRail ? (
          <div className="space-y-1 sm:space-y-1.5">
            {worldOverviewHint ? (
              <div className={`${overviewStripShellClassName} !py-1.5`.trim()}>
                {overviewStripTitle ? (
                  <span className={overviewStripTitleClassName}>
                    {overviewStripTitle}
                    {" · "}
                  </span>
                ) : null}
                {worldOverviewHint}
              </div>
            ) : null}
            {systemsHint ? (
              <div
                className={`rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10px] leading-snug text-white/55 line-clamp-3 sm:line-clamp-none${systemsTone}`}
              >
                {systemsHint}
              </div>
            ) : null}
            {showDoctrineStrip ? (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.028] px-2.5 py-1.5 text-[10px] font-normal leading-snug text-white/48 line-clamp-2">
                {doctrineContextHint}
              </div>
            ) : null}
          </div>
        ) : null}

        {hasTopContextRail ? <div className="border-t border-white/[0.05]" aria-hidden /> : null}

        {/* A) Primary — attention now */}
        <section
          className="space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.012] p-1.5 sm:space-y-3 sm:rounded-2xl sm:p-2"
          aria-label="Needs attention"
        >
          <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2 lg:items-stretch">
            <BottleneckBlock bottleneck={safeOverview.bottleneck} onNavigate={onNavigate} />
            <NextActionBlock action={safeOverview.nextAction || actionFallback} onNavigate={onNavigate} />
          </div>
          <RecoveryHintBlock hint={safeOverview.recoveryHint} onNavigate={onNavigate} />
          <MissionFocusBlock missionGuidance={missionGuidance} onNavigate={onNavigate} />
          {baseStatusUrgent ? (
            <div data-base-target="systems">
              <BaseStatusBlock status={baseStatusPayload} variant="prominent" />
            </div>
          ) : null}
        </section>

        {/* B) Secondary — operating picture */}
        <section
          className="space-y-2.5 border-t border-white/[0.07] pt-3 sm:space-y-3 sm:pt-4"
          aria-label="Status and rhythm"
        >
          {!baseStatusUrgent ? (
            <div data-base-target="systems">
              <BaseStatusBlock status={baseStatusPayload} variant="support" />
            </div>
          ) : null}
          <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-2">
            <RatesBlock
              rates={safeOverview.rates}
              openInnerPanel={openInnerPanel}
              toggleInnerPanel={toggleInnerPanel}
            />
            <StabilityBlock
              stability={safeOverview.stability}
              openInnerPanel={openInnerPanel}
              toggleInnerPanel={toggleInnerPanel}
            />
            <DailyProgressBlock
              progress={safeOverview.dailyProgress}
              openInnerPanel={openInnerPanel}
              toggleInnerPanel={toggleInnerPanel}
            />
            <TodaysLoopBlock steps={safeOverview.todaysLoop} onNavigate={onNavigate} />
          </div>
        </section>

        {/* World sector — contextual bridge before planning */}
        {sectorWorldSnapshot ? (
          <div className="border-t border-white/[0.06] pt-2.5 sm:pt-3">
            <WorldSectorPanel
              snapshot={sectorWorldSnapshot}
              onDeploy={onDeployNextSector}
              deployBusy={!!sectorDeployBusy}
              openInnerPanel={openInnerPanel}
              toggleInnerPanel={toggleInnerPanel}
              compactHeader
            />
          </div>
        ) : null}

        {/* C) Tertiary — planning & identity */}
        <section
          className="space-y-2.5 border-t border-white/[0.06] pt-3 sm:space-y-3 sm:rounded-xl sm:bg-white/[0.006] sm:p-1.5 sm:pt-3"
          aria-label="Build and long-term"
        >
          <div className="grid gap-2.5 sm:gap-3 xl:grid-cols-3">
            <BuildOpportunitiesCard
              buildOpportunitiesCount={buildOpportunitiesCount}
              availableStructuresCount={availableStructuresCount}
              availableModulesCount={availableModulesCount}
              availableResearchCount={availableResearchCount}
              availableBlueprintCount={availableBlueprintCount}
              onOpenBuildPanel={onOpenBuildPanel}
            />

            <IdentityCard
              showCrew={showCrew}
              crewRoleInfo={crewRoleInfo}
              roleBonusText={roleBonusText}
              commanderPathInfo={commanderPathInfo}
              commanderPathText={commanderPathText}
              openInnerPanel={openInnerPanel}
              toggleInnerPanel={toggleInnerPanel}
            />

            <ContractsCard
              liveContractsAvailableCount={liveContractsAvailableCount}
              liveContracts={liveContracts}
              openInnerPanel={openInnerPanel}
              toggleInnerPanel={toggleInnerPanel}
              onClaimContract={onClaimContract}
            />
          </div>

          <SpecializationSummaryCard
            summary={specializationSummary}
            onNavigate={onNavigate}
            openInnerPanel={openInnerPanel}
            toggleInnerPanel={toggleInnerPanel}
          />
        </section>
      </div>
    </BaseOverviewPanelToneContext.Provider>
  );
}
