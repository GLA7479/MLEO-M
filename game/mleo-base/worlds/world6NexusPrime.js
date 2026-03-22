/**
 * World 6 — Nexus Prime
 * Sector identity + integrated command gameplay readout.
 */

import {
  buildWorld6CommandAlert,
  getWorld6CommandSnapshot,
} from "./world6Gameplay";

export const world6NexusPrime = {
  id: "world6",
  order: 6,
  name: "Nexus Prime",
  dailyMleoCap: 4900,
};

export const WORLD6_SECTOR_IDENTITY = {
  badgeLabel: "Nexus prime",
  tagline: "Integrated command · systemic balance · endgame coordination",
  descriptor:
    "This sector rewards full-spectrum discipline: logistics, research, energy, repair, and recovery all need to stay aligned under the highest cap.",
  focusShort: "Integrated systems · command balance · endgame layer",
  playstyleHint:
    "Do not optimize one loop in isolation. Nexus Prime rewards coordinated timing across the whole command grid.",
  sectorPressureNote:
    "The final cap band exposes weak links quickly — maintain balanced reserves and system spread before forcing a push.",
};

function fmtInt(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? String(v) : "0";
}

function world6ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;

  if (!nextName) return "Final sector command — balance is the endgame.";

  if (canDeploy) {
    return `All sector gates cleared. ${nextName ? `Next: ${nextName}. ` : ""}Command posture is ready for whatever comes after Nexus Prime.`;
  }

  return `Final integration layer still needs polish: keep support spread tight, reserves balanced, and the command stack coordinated.`;
}

export function getWorld6NexusSnapshot(state, derived = {}) {
  const command = getWorld6CommandSnapshot(state, derived);
  const energyNow = Math.floor(Number(state?.resources?.ENERGY ?? 0));

  return {
    energyNow,
    command,
    alert: buildWorld6CommandAlert(command),
    summaryLine: command
      ? `${command.compactLine} · ${command.commandLine}`
      : `Energy ${fmtInt(energyNow)} in command reserve`,
  };
}

export function buildWorld6PanelFlavor(state, derived, ctx = {}) {
  const id = WORLD6_SECTOR_IDENTITY;
  const nexus = getWorld6NexusSnapshot(state, derived);
  const command = nexus.command;

  const overviewHint =
    command?.commandKey === "harmonized"
      ? "Harmonized grid: strong moment for a coordinated, multi-system push."
      : command?.commandKey === "fractured"
        ? "Fractured grid: restore balance before forcing endgame pressure."
        : "Balanced grid: maintain alignment and only push when the whole stack is ready.";

  return {
    worldOrder: 6,
    panelShellClassName:
      "border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-violet-500/[0.05]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: command?.actionHint || id.playstyleHint,
    sectorPressureNote: command?.reason || id.sectorPressureNote,
    progressionNote: world6ProgressionNote(ctx),
    flowMetricLine: nexus.summaryLine,
    overviewStripTitle: command ? `${id.badgeLabel} · ${command.commandLabel}` : "Nexus prime",
    overviewHint,
    overviewStripShellClassName:
      command?.commandKey === "harmonized"
        ? "rounded-xl border border-cyan-400/25 bg-cyan-500/[0.10] px-3 py-2 text-[11px] leading-snug text-cyan-50/90"
        : command?.commandKey === "fractured"
          ? "rounded-xl border border-rose-400/25 bg-rose-500/[0.10] px-3 py-2 text-[11px] leading-snug text-rose-50/90"
          : "rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] px-3 py-2 text-[11px] leading-snug text-cyan-50/90",
    overviewStripTitleClassName:
      command?.commandKey === "fractured"
        ? "font-black uppercase tracking-[0.14em] text-rose-200/90"
        : "font-black uppercase tracking-[0.14em] text-cyan-200/90",
    extraLines: command
      ? [
          command.systemsLine,
          command.reservesLine,
          `Priority: ${command.priority}`,
          `Recommendation: ${command.recommendation}`,
        ]
      : [],
  };
}
