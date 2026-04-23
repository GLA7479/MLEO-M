"use client";

import { useId, useMemo } from "react";
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
 *   players: { ring: string; slot: number; orbsHeld: number; lockToken: boolean; stunActive: boolean; inPlay?: boolean }[];
 *   looseOrbs: { ring: string; slot: number }[];
 *   fixedOrbKeys: string[];
 *   turnSeat: number;
 *   ringLock: null | { ring: string; ownerSeat: number };
 *   phase?: string;
 *   activeSeats?: number[];
 * }} props.state
 * @param {number | null} [props.mySeat]
 */
export default function Ov2OrbitTrapBoardView({ state, mySeat = null }) {
  const gid = useId().replace(/:/g, "");
  const traps = useMemo(() => new Set(OV2_ORBIT_TRAP_TRAPS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);
  const boosts = useMemo(() => new Set(OV2_ORBIT_TRAP_BOOSTS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);
  const locks = useMemo(() => new Set(OV2_ORBIT_TRAP_LOCK_SLOTS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);

  const R_OUT = 82;
  const R_MID = 56;
  const R_INN = 31;
  const R_CORE = 13;

  /** @type {{ ring: string; r: number }[]} */
  const ringRadii = [
    { ring: "outer", r: R_OUT },
    { ring: "mid", r: R_MID },
    { ring: "inner", r: R_INN },
  ];

  const gradId = `otBoardBg-${gid}`;

  return (
    <div className="flex h-full w-full min-h-0 flex-1 flex-col items-stretch justify-center gap-1.5 px-0.5 py-0.5">
      <svg
        viewBox="-100 -100 200 200"
        className="mx-auto h-full w-full max-h-[min(82vh,680px)] min-h-[220px] max-w-[min(96vw,680px)] shrink touch-none select-none"
        aria-label="Orbit Trap board"
      >
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#18181b" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="0" r="98" fill={`url(#${gradId})`} stroke="#52525b" strokeWidth="0.75" />

        {ringRadii.map(({ ring, r }) => (
          <circle
            key={ring}
            cx="0"
            cy="0"
            r={r}
            fill="none"
            stroke={state.ringLock?.ring === ring ? "#fb923c" : "#64748b"}
            strokeWidth={state.ringLock?.ring === ring ? 1.35 : 0.6}
            strokeDasharray={state.ringLock?.ring === ring ? "4 3" : "0"}
            opacity={0.96}
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
            let mark = "";
            if (isTrap) {
              fill = "rgba(244,63,94,0.22)";
              mark = "!";
            } else if (isBoost) {
              fill = "rgba(52,211,153,0.2)";
              mark = "+";
            } else if (isLock) {
              fill = "rgba(129,140,248,0.2)";
              mark = "\u25C6";
            }
            return (
              <g key={`${ring}-${slot}`}>
                <circle cx={x} cy={y} r={5.6} fill={fill} stroke="#3f3f46" strokeWidth="0.4" />
                {mark ? (
                  <text
                    x={x}
                    y={y + 2.2}
                    textAnchor="middle"
                    fontSize="3.4"
                    fill="#a1a1aa"
                    fontWeight="700"
                    opacity={0.92}
                  >
                    {mark}
                  </text>
                ) : null}
              </g>
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
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeOpacity={0.72}
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
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeOpacity={0.72}
            />
          );
        })}

        {state.fixedOrbKeys.map(fk => {
          const [ring, sl] = fk.split(":");
          const slot = Number(sl);
          const r = ring === "outer" ? R_OUT : ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(slot, r);
          return (
            <g key={`fx-${fk}`}>
              <circle cx={x} cy={y} r={3.6} fill="#22d3ee" stroke="#0891b2" strokeWidth="0.45" opacity={0.95} />
              <text x={x} y={y + 1.8} textAnchor="middle" fontSize="3.8" fill="#0c4a6e" fontWeight="800">
                F
              </text>
            </g>
          );
        })}

        {state.looseOrbs.map((o, i) => {
          const r = o.ring === "outer" ? R_OUT : o.ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(o.slot, r);
          return (
            <g key={`loose-${i}-${o.ring}-${o.slot}`}>
              <circle cx={x} cy={y} r={3.1} fill="#fde047" stroke="#ca8a04" strokeWidth={0.4} />
              <text x={x} y={y + 1.6} textAnchor="middle" fontSize="3.4" fill="#713f12" fontWeight="800">
                o
              </text>
            </g>
          );
        })}

        <circle cx="0" cy="0" r={R_CORE} fill="#27272a" stroke="#c4b5fd" strokeWidth={0.85} opacity={0.97} />
        <text x="0" y="2.2" textAnchor="middle" fontSize="7.5" fill="#d4d4d8" fontWeight="700">
          Core
        </text>

        {state.players.map((pl, seat) => {
          if (pl.inPlay === false) return null;
          const isTurn = state.turnSeat === seat;
          const isYou = mySeat != null && mySeat === seat;
          if (pl.ring === "core") {
            return (
              <g key={`p-${seat}`}>
                {isTurn ? <circle cx="0" cy="0" r={7.2} fill="none" stroke="#fbbf24" strokeWidth={1.2} opacity={0.95} /> : null}
                {isYou ? <circle cx="0" cy="0" r={8.4} fill="none" stroke="#38bdf8" strokeWidth={0.55} strokeDasharray="2 2" opacity={0.9} /> : null}
                <circle cx="0" cy="0" r={5.2} fill={SEAT_COLORS[seat]} stroke="#fafafa" strokeWidth={0.55} />
                <text x="0" y="2.2" textAnchor="middle" fontSize="5.8" fill="#0a0a0a" fontWeight="800">
                  {seat + 1}
                </text>
              </g>
            );
          }
          const r = pl.ring === "outer" ? R_OUT : pl.ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(pl.slot, r);
          const heavy = pl.orbsHeld >= 2;
          return (
            <g key={`p-${seat}`} transform={`translate(${x},${y})`}>
              {isTurn ? <circle cx="0" cy="0" r={8.4} fill="none" stroke="#fbbf24" strokeWidth={1.15} opacity={0.92} /> : null}
              {isYou ? <circle cx="0" cy="0" r={9.6} fill="none" stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="2.5 2" opacity={0.88} /> : null}
              {heavy ? (
                <circle cx="0" cy="0" r={6.6} fill="none" stroke={SEAT_COLORS[seat]} strokeWidth={1.15} opacity={0.88} />
              ) : null}
              <circle cx="0" cy="0" r={5} fill={SEAT_COLORS[seat]} stroke="#fafafa" strokeWidth={0.55} />
              <text x="0" y="2.2" textAnchor="middle" fontSize="5.8" fill="#0a0a0a" fontWeight="800">
                {seat + 1}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/[0.06] px-1 pb-0.5 pt-1.5 text-[9px] leading-tight text-zinc-400">
        <span>
          <span className="font-semibold text-rose-200/90">!</span> trap
        </span>
        <span>
          <span className="font-semibold text-emerald-200/90">+</span> boost
        </span>
        <span>
          <span className="font-semibold text-violet-200/90">{"\u25C6"}</span> lock pickup
        </span>
        <span>
          <span className="font-semibold text-cyan-200/90">F</span> fixed orb
        </span>
        <span>
          <span className="font-semibold text-amber-200/90">o</span> loose orb
        </span>
        <span className="text-zinc-500">Lines = ring gates</span>
      </div>
    </div>
  );
}
