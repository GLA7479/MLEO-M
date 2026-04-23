"use client";

import { useMemo } from "react";
import {
  OV2_ORBIT_TRAP_BOOSTS,
  OV2_ORBIT_TRAP_GATES_MID_INNER,
  OV2_ORBIT_TRAP_GATES_OUTER_MID,
  OV2_ORBIT_TRAP_LOCK_SLOTS,
  OV2_ORBIT_TRAP_RING_SLOTS,
  OV2_ORBIT_TRAP_TRAPS,
  ov2OrbitTrapCellKey,
} from "../../../lib/online-v2/orbit-trap/ov2OrbitTrapBoardSpec.js";

const SEAT_COLORS = ["#38bdf8", "#fbbf24", "#34d399", "#e879f9"];

/**
 * Slot 0 (O1) at top; indices increase clockwise.
 * @param {number} slot
 * @param {number} radius
 */
function ringXY(slot, radius) {
  const a = -Math.PI / 2 + (slot / OV2_ORBIT_TRAP_RING_SLOTS) * Math.PI * 2;
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
}

/**
 * @param {object} props
 * @param {{
 *   players: { ring: string; slot: number; orbsHeld: number; lockToken: boolean; stunActive: boolean }[];
 *   looseOrbs: { ring: string; slot: number }[];
 *   fixedOrbKeys: string[];
 *   turnSeat: number;
 *   ringLock: null | { ring: string; ownerSeat: number };
 * }} props.state
 */
export default function Ov2OrbitTrapBoardView({ state }) {
  const traps = useMemo(() => new Set(OV2_ORBIT_TRAP_TRAPS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);
  const boosts = useMemo(() => new Set(OV2_ORBIT_TRAP_BOOSTS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);
  const locks = useMemo(() => new Set(OV2_ORBIT_TRAP_LOCK_SLOTS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);

  const R_OUT = 78;
  const R_MID = 54;
  const R_INN = 30;
  const R_CORE = 12;

  /** @type {{ ring: string; r: number }[]} */
  const ringRadii = [
    { ring: "outer", r: R_OUT },
    { ring: "mid", r: R_MID },
    { ring: "inner", r: R_INN },
  ];

  return (
    <div className="flex h-full w-full min-h-0 items-center justify-center p-1">
      <svg
        viewBox="-100 -100 200 200"
        className="h-full max-h-[min(72vh,520px)] w-full max-w-[min(100vw,520px)] touch-none select-none"
        aria-label="Orbit Trap board"
      >
        <defs>
          <radialGradient id="otBoardBg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#18181b" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="0" r="98" fill="url(#otBoardBg)" stroke="#3f3f46" strokeWidth="0.6" />

        {ringRadii.map(({ ring, r }) => (
          <circle
            key={ring}
            cx="0"
            cy="0"
            r={r}
            fill="none"
            stroke={state.ringLock?.ring === ring ? "#f97316" : "#52525b"}
            strokeWidth={state.ringLock?.ring === ring ? 1.2 : 0.55}
            strokeDasharray={state.ringLock?.ring === ring ? "4 3" : "0"}
            opacity={0.95}
          />
        ))}

        {ringRadii.map(({ ring, r }) =>
          Array.from({ length: OV2_ORBIT_TRAP_RING_SLOTS }, (_, slot) => {
            const { x, y } = ringXY(slot, r);
            const ck = ov2OrbitTrapCellKey(ring, slot);
            const isTrap = traps.has(ck);
            const isBoost = boosts.has(ck);
            const isLock = locks.has(ck);
            let fill = "transparent";
            if (isTrap) fill = "rgba(244,63,94,0.18)";
            else if (isBoost) fill = "rgba(52,211,153,0.16)";
            else if (isLock) fill = "rgba(129,140,248,0.14)";
            return (
              <circle key={`${ring}-${slot}`} cx={x} cy={y} r={5.2} fill={fill} stroke="#3f3f46" strokeWidth="0.35" />
            );
          })
        )}

        {OV2_ORBIT_TRAP_GATES_OUTER_MID.map(([s], i) => {
          const a = ringXY(s, R_OUT);
          const b = ringXY(s, R_MID);
          return (
            <line
              key={`om-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#94a3b8"
              strokeWidth={0.9}
              strokeOpacity={0.55}
            />
          );
        })}
        {OV2_ORBIT_TRAP_GATES_MID_INNER.map(([s], i) => {
          const a = ringXY(s, R_MID);
          const b = ringXY(s, R_INN);
          return (
            <line
              key={`mi-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#94a3b8"
              strokeWidth={0.9}
              strokeOpacity={0.55}
            />
          );
        })}

        {state.fixedOrbKeys.map(fk => {
          const [ring, sl] = fk.split(":");
          const slot = Number(sl);
          const r = ring === "outer" ? R_OUT : ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(slot, r);
          return (
            <circle key={`fx-${fk}`} cx={x} cy={y} r={3.4} fill="#22d3ee" stroke="#0891b2" strokeWidth={0.4} opacity={0.92} />
          );
        })}

        {state.looseOrbs.map((o, i) => {
          const r = o.ring === "outer" ? R_OUT : o.ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(o.slot, r);
          return (
            <circle
              key={`loose-${i}-${o.ring}-${o.slot}`}
              cx={x}
              cy={y}
              r={2.8}
              fill="#fde047"
              stroke="#ca8a04"
              strokeWidth={0.35}
            />
          );
        })}

        <circle cx="0" cy="0" r={R_CORE} fill="#27272a" stroke="#a78bfa" strokeWidth={0.7} opacity={0.95} />
        <text x="0" y="2" textAnchor="middle" fontSize="7" fill="#a1a1aa" fontWeight="600">
          Core
        </text>

        {state.players.map((pl, seat) => {
          if (pl.ring === "core") {
            return (
              <circle
                key={`p-${seat}`}
                cx="0"
                cy="0"
                r={5}
                fill={SEAT_COLORS[seat]}
                stroke="#fafafa"
                strokeWidth={0.45}
              />
            );
          }
          const r = pl.ring === "outer" ? R_OUT : pl.ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(pl.slot, r);
          const heavy = pl.orbsHeld >= 2;
          return (
            <g key={`p-${seat}`} transform={`translate(${x},${y})`}>
              {heavy ? (
                <circle cx="0" cy="0" r={6.2} fill="none" stroke={SEAT_COLORS[seat]} strokeWidth={1.1} opacity={0.85} />
              ) : null}
              <circle cx="0" cy="0" r={4.6} fill={SEAT_COLORS[seat]} stroke="#fafafa" strokeWidth={0.5} />
              <text x="0" y="2" textAnchor="middle" fontSize="5.5" fill="#0a0a0a" fontWeight="800">
                {seat + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
