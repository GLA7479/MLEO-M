/**
 * Ludo board geometry / labels (extracted from `games-online/LudoMP.js` for OV2 only).
 * Pairs with `ov2LudoEngine.js` — pure layout; board snapshots and authority live in `ov2LudoSessionAdapter` + hook.
 */

import { LUDO_HOME_LEN, LUDO_START_OFFSETS, LUDO_TRACK_LEN, toGlobalIndex } from "./ov2LudoEngine";

export const OV2_LUDO_TRACK_RADIUS = 36;
export const OV2_LUDO_TRACK_ANGLE_OFFSET = (5 * Math.PI) / 4;

export const OV2_LUDO_SEAT_HEX_COLORS = ["#ef4444", "#38bdf8", "#22c55e", "#fbbf24"];

export const OV2_LUDO_YARD_POSITIONS = [
  [
    { x: 6, y: 6 },
    { x: 14, y: 6 },
    { x: 6, y: 14 },
    { x: 14, y: 14 },
  ],
  [
    { x: 86, y: 6 },
    { x: 94, y: 6 },
    { x: 86, y: 14 },
    { x: 94, y: 14 },
  ],
  [
    { x: 86, y: 86 },
    { x: 94, y: 86 },
    { x: 86, y: 94 },
    { x: 94, y: 94 },
  ],
  [
    { x: 6, y: 94 },
    { x: 14, y: 94 },
    { x: 6, y: 86 },
    { x: 14, y: 86 },
  ],
];

export function ov2LudoLightenColor(hex, factor = 0.25) {
  const normalized = hex?.replace("#", "") ?? "ffffff";
  if (normalized.length !== 6) return hex || "#ffffff";
  const num = parseInt(normalized, 16);
  const r = Math.min(255, Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * factor));
  const g = Math.min(255, Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * factor));
  const b = Math.min(255, Math.round((num & 0xff) + (255 - (num & 0xff)) * factor));
  return `rgb(${r}, ${g}, ${b})`;
}

export function ov2LudoProjectGlobalTrackCell(globalIndex) {
  const safeIdx = ((globalIndex % LUDO_TRACK_LEN) + LUDO_TRACK_LEN) % LUDO_TRACK_LEN;
  const angle = (safeIdx / LUDO_TRACK_LEN) * 2 * Math.PI + OV2_LUDO_TRACK_ANGLE_OFFSET;
  const x = 50 + OV2_LUDO_TRACK_RADIUS * Math.cos(angle);
  const y = 50 + OV2_LUDO_TRACK_RADIUS * Math.sin(angle);
  return { x, y };
}

export function ov2LudoDescribePieceProgress(seat, pos) {
  const totalPath = LUDO_TRACK_LEN + LUDO_HOME_LEN;
  if (pos < 0) {
    return { label: "Yard", detail: "Roll 6 to launch", progress: 0, state: "yard" };
  }
  if (pos >= totalPath) {
    return { label: "Finished", detail: "Safe at home", progress: 1, state: "finished" };
  }
  const normalizedProgress = Math.min(1, Math.max(0, pos / totalPath));
  if (pos >= LUDO_TRACK_LEN) {
    const homeIndex = pos - LUDO_TRACK_LEN;
    return {
      label: `Home ${homeIndex + 1}/${LUDO_HOME_LEN}`,
      detail: `${Math.max(0, LUDO_HOME_LEN - homeIndex - 1)} left`,
      progress: normalizedProgress,
      state: "home",
    };
  }
  const globalIndex = toGlobalIndex(seat, pos);
  return {
    label: `Track ${globalIndex != null ? globalIndex + 1 : pos + 1}`,
    detail: `${totalPath - pos} steps to finish`,
    progress: normalizedProgress,
    globalIndex,
    state: "track",
  };
}

export function ov2LudoProjectPieceOnBoard(seat, pos, pieceIndex = 0) {
  if (pos < 0) {
    const yardOptions = OV2_LUDO_YARD_POSITIONS[seat];
    if (yardOptions && yardOptions.length) {
      const yardPoint = yardOptions[pieceIndex % yardOptions.length];
      if (yardPoint) {
        return { kind: "yard", x: yardPoint.x, y: yardPoint.y };
      }
    }
    return { kind: "yard", x: 50, y: 50 };
  }

  if (pos >= LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    return { kind: "home", x: 50, y: 50 };
  }

  if (pos >= LUDO_TRACK_LEN) {
    const entryIdx = LUDO_START_OFFSETS[seat] ?? 0;
    const entryPoint = ov2LudoProjectGlobalTrackCell(entryIdx);
    const homeIndex = pos - LUDO_TRACK_LEN;
    const t = (homeIndex + 1) / (LUDO_HOME_LEN + 1);
    const x = entryPoint.x + (50 - entryPoint.x) * t;
    const y = entryPoint.y + (50 - entryPoint.y) * t;
    return { kind: "home-stretch", x, y };
  }

  const offset = LUDO_START_OFFSETS[seat] ?? 0;
  const gIdx = (offset + pos) % LUDO_TRACK_LEN;
  const point = ov2LudoProjectGlobalTrackCell(gIdx);

  return { kind: "track", ...point, globalIndex: gIdx };
}
