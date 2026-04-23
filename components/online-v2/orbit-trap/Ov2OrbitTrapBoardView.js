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
 * @param {string} k
 * @returns {{ ring: string; slot: number } | null}
 */
function parseCellKey(k) {
  const i = k.indexOf(":");
  if (i < 0) return null;
  const ring = k.slice(0, i);
  const slot = Number(k.slice(i + 1));
  if (!Number.isFinite(slot)) return null;
  return { ring, slot };
}

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
 * @param {number[]} [props.rosterSeatIndices] seats in this match (for legend)
 * @param {Set<string> | null} [props.highlightLegalMoveKeys] cell keys (e.g. outer:3) — client legal hints only
 * @param {Set<string> | null} [props.highlightRotateRings]
 * @param {Set<string> | null} [props.highlightLockRings]
 * @param {'move'|'rotate'|'lock'|null} [props.actionMode]
 * @param {boolean} [props.boardInteractive] when true, board accepts taps for the active action mode
 * @param {(ring: string, slot: number) => void} [props.onMovePick]
 * @param {(ring: string, dir: 1|-1) => void} [props.onRotatePick]
 * @param {(ring: string) => void} [props.onLockPick]
 */
export default function Ov2OrbitTrapBoardView({
  state,
  mySeat = null,
  rosterSeatIndices = null,
  highlightLegalMoveKeys = null,
  highlightRotateRings = null,
  highlightLockRings = null,
  actionMode = null,
  boardInteractive = false,
  onMovePick,
  onRotatePick,
  onLockPick,
}) {
  const gid = useId().replace(/:/g, "");
  const traps = useMemo(() => new Set(OV2_ORBIT_TRAP_TRAPS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);
  const boosts = useMemo(() => new Set(OV2_ORBIT_TRAP_BOOSTS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);
  const locks = useMemo(() => new Set(OV2_ORBIT_TRAP_LOCK_SLOTS.map(([r, s]) => ov2OrbitTrapCellKey(r, s))), []);

  const R_OUT = 84;
  const R_MID = 57;
  const R_INN = 32;
  const R_CORE = 13;

  /** @type {{ ring: string; r: number }[]} */
  const ringRadii = [
    { ring: "outer", r: R_OUT },
    { ring: "mid", r: R_MID },
    { ring: "inner", r: R_INN },
  ];

  const gradId = `otBoardBg-${gid}`;
  const glowId = `otLegalGlow-${gid}`;
  const gateGlowId = `otGateGlow-${gid}`;

  const ringRadius = ring => (ring === "outer" ? R_OUT : ring === "mid" ? R_MID : R_INN);

  const moveMode = boardInteractive && actionMode === "move" && highlightLegalMoveKeys && highlightLegalMoveKeys.size > 0;
  const rotateMode = boardInteractive && actionMode === "rotate" && highlightRotateRings && highlightRotateRings.size > 0;
  const lockMode = boardInteractive && actionMode === "lock" && highlightLockRings && highlightLockRings.size > 0;

  /** Per-ring CW/CCW anchor slots (spread so controls sit outside the ring, away from common starts). */
  const rotateUiSlots = { outer: [3, 7], mid: [1, 5], inner: [2, 6] };
  const rotateBump = { outer: 17, mid: 14, inner: 11 };

  const boardTitle =
    "Orbit Trap board — trap ▲, boost ▢, lock ⧈, fixed F, loose gold. Tap highlighted cells when a move mode is on.";

  return (
    <div className="flex h-full w-full min-h-0 flex-1 flex-col items-stretch justify-center lg:max-h-full">
      <svg
        viewBox="-102 -102 204 204"
        className="mx-auto h-full w-full min-h-[176px] max-h-[min(92vh,840px)] max-w-[min(96vw,840px)] shrink-0 touch-manipulation select-none lg:aspect-square lg:h-auto lg:max-h-[min(54svh,520px)] lg:max-w-[min(54svh,520px)] lg:min-h-0"
        style={{ touchAction: "manipulation" }}
        aria-label={boardTitle}
      >
        <title>{boardTitle}</title>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="72%">
            <stop offset="0%" stopColor="#1e1e24" />
            <stop offset="55%" stopColor="#12121a" />
            <stop offset="100%" stopColor="#07070c" />
          </radialGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={gateGlowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.8" result="g" />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="0" cy="0" r="100" fill={`url(#${gradId})`} stroke="#3f3f46" strokeWidth="1" />

        {ringRadii.map(({ ring, r }) => {
          const locked = state.ringLock?.ring === ring;
          const rotHi = highlightRotateRings?.has(ring);
          const ringActive = rotateMode && rotHi;
          return (
            <circle
              key={ring}
              cx="0"
              cy="0"
              r={r}
              fill="none"
              stroke={locked ? "#fb923c" : ringActive ? "#5eead4" : rotHi ? "#34d399" : "#575b6b"}
              strokeWidth={locked ? 2.1 : ringActive ? 2.4 : rotHi ? 1.8 : 0.85}
              strokeDasharray={locked ? "5 4" : ringActive ? "4 3" : rotHi ? "3 2" : "2 3"}
              opacity={0.98}
              {...(rotHi || ringActive ? { filter: `url(#${glowId})` } : {})}
            />
          );
        })}

        {ringRadii.map(({ ring, r }) =>
          Array.from({ length: OV2_ORBIT_TRAP_RING_SLOTS }, (_, slot) => {
            const { x, y } = ringXY(slot, r);
            const ck = ov2OrbitTrapCellKey(ring, slot);
            const isTrap = traps.has(ck);
            const isBoost = boosts.has(ck);
            const isLock = locks.has(ck);
            let fill = "rgba(39,39,42,0.35)";
            let stroke = "#52525b";
            if (isTrap) {
              fill = "rgba(190,18,60,0.38)";
              stroke = "#fda4af";
            } else if (isBoost) {
              fill = "rgba(5,150,105,0.36)";
              stroke = "#6ee7b7";
            } else if (isLock) {
              fill = "rgba(91,33,182,0.34)";
              stroke = "#c4b5fd";
            }
            const lockRingHi = lockMode && highlightLockRings?.has(ring) && isLock;
            const cellR = lockRingHi ? 7.2 : 5.8;
            const lockClickable = lockRingHi && onLockPick;
            return (
              <g key={`${ring}-${slot}`}>
                {isTrap ? (
                  <polygon
                    points={`${x},${y - 6.2} ${x + 5.4},${y + 3.1} ${x - 5.4},${y + 3.1}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={0.55}
                    opacity={0.95}
                  />
                ) : isBoost ? (
                  <rect
                    x={x - 5.2}
                    y={y - 5.2}
                    width="10.4"
                    height="10.4"
                    rx="2.2"
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={0.55}
                    opacity={0.95}
                  />
                ) : isLock ? (
                  <path
                    d={`M ${x - 4.5} ${y - 2} L ${x + 4.5} ${y - 2} L ${x + 4.5} ${y + 4} L ${x} ${y + 6.8} L ${x - 4.5} ${y + 4} Z`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={0.55}
                    opacity={0.95}
                  />
                ) : (
                  <circle cx={x} cy={y} r={cellR * 0.82} fill={fill} stroke={stroke} strokeWidth={0.45} />
                )}
                {lockRingHi ? (
                  <circle cx={x} cy={y} r={cellR + 2.4} fill="none" stroke="#c4b5fd" strokeWidth={0.9} strokeDasharray="2 2" opacity={0.98} />
                ) : null}
                {lockClickable ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={12}
                    fill="transparent"
                    className="cursor-pointer"
                    style={{ pointerEvents: "all" }}
                    onClick={e => {
                      e.stopPropagation();
                      onLockPick(ring);
                    }}
                  />
                ) : null}
                {isTrap ? (
                  <text x={x} y={y + 2.4} textAnchor="middle" fontSize="4.2" fill="#fecdd3" fontWeight="900" opacity={0.95}>
                    !
                  </text>
                ) : null}
                {isBoost ? (
                  <text x={x} y={y + 2.5} textAnchor="middle" fontSize="4.6" fill="#d1fae5" fontWeight="900" opacity={0.95}>
                    +
                  </text>
                ) : null}
                {isLock && !isTrap && !isBoost ? (
                  <text x={x} y={y + 2.2} textAnchor="middle" fontSize="3.8" fill="#ede9fe" fontWeight="800" opacity={0.95}>
                    ⧈
                  </text>
                ) : null}
              </g>
            );
          })
        )}

        {OV2_ORBIT_TRAP_GATES_OUTER_MID.map(([s], i) => {
          const a = ringXY(s, R_OUT);
          const b = ringXY(s, R_MID);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={`om-${i}`} filter={`url(#${gateGlowId})`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#e2e8f0"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeOpacity={0.92}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#64748b"
                strokeWidth={0.85}
                strokeLinecap="round"
                strokeOpacity={0.55}
              />
              <polygon
                points={`${mx},${my - 2.8} ${mx + 2.4},${my + 1.6} ${mx - 2.4},${my + 1.6}`}
                fill="#f8fafc"
                fillOpacity={0.9}
                stroke="#94a3b8"
                strokeWidth={0.35}
              />
            </g>
          );
        })}
        {OV2_ORBIT_TRAP_GATES_MID_INNER.map(([s], i) => {
          const a = ringXY(s, R_MID);
          const b = ringXY(s, R_INN);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={`mi-${i}`} filter={`url(#${gateGlowId})`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#e2e8f0"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeOpacity={0.92}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#64748b"
                strokeWidth={0.85}
                strokeLinecap="round"
                strokeOpacity={0.55}
              />
              <polygon
                points={`${mx},${my - 2.8} ${mx + 2.4},${my + 1.6} ${mx - 2.4},${my + 1.6}`}
                fill="#f8fafc"
                fillOpacity={0.9}
                stroke="#94a3b8"
                strokeWidth={0.35}
              />
            </g>
          );
        })}

        {state.fixedOrbKeys.map(fk => {
          const [ring, sl] = fk.split(":");
          const slot = Number(sl);
          const r = ring === "outer" ? R_OUT : ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(slot, r);
          return (
            <g key={`fx-${fk}`}>
              <circle cx={x} cy={y} r={5.2} fill="none" stroke="#22d3ee" strokeWidth={1.1} opacity={0.95} />
              <circle cx={x} cy={y} r={3.9} fill="#0891b2" stroke="#67e8f9" strokeWidth={0.55} opacity={0.98} />
              <text x={x} y={y + 2} textAnchor="middle" fontSize="4.4" fill="#ecfeff" fontWeight="900">
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
              <circle cx={x} cy={y} r={4.6} fill="none" stroke="#fde047" strokeWidth={0.85} strokeDasharray="1.6 1.4" opacity={0.9} />
              <circle cx={x} cy={y} r={3.5} fill="#facc15" stroke="#a16207" strokeWidth={0.45} />
            </g>
          );
        })}

        <circle cx="0" cy="0" r={R_CORE} fill="#1c1917" stroke="#ddd6fe" strokeWidth={1.05} opacity={0.98} />
        <text x="0" y="2.6" textAnchor="middle" fontSize="7.8" fill="#e7e5e4" fontWeight="800">
          Core
        </text>

        {highlightLegalMoveKeys && highlightLegalMoveKeys.size > 0
          ? [...highlightLegalMoveKeys].map(k => {
              const parsed = parseCellKey(k);
              if (!parsed) return null;
              if (parsed.ring === "core") {
                const canTap = moveMode && onMovePick;
                return (
                  <g key={`hl-${k}`}>
                    <circle cx="0" cy="0" r={R_CORE + 9} fill="rgba(16,185,129,0.12)" stroke="#34d399" strokeWidth={1.35} opacity={0.95} filter={`url(#${glowId})`} />
                    <circle cx="0" cy="0" r={R_CORE + 14} fill="none" stroke="#6ee7b7" strokeWidth={0.75} strokeDasharray="3 2" opacity={0.88} />
                    {canTap ? (
                      <circle
                        cx="0"
                        cy="0"
                        r={22}
                        fill="transparent"
                        className="cursor-pointer"
                        style={{ pointerEvents: "all" }}
                        onClick={e => {
                          e.stopPropagation();
                          onMovePick("core", 0);
                        }}
                      />
                    ) : null}
                  </g>
                );
              }
              const rr = ringRadius(parsed.ring);
              if (!rr) return null;
              const { x, y } = ringXY(parsed.slot, rr);
              const canTap = moveMode && onMovePick;
              return (
                <g key={`hl-${k}`}>
                  <circle cx={x} cy={y} r={11.5} fill="rgba(16,185,129,0.2)" stroke="#34d399" strokeWidth={1.5} opacity={0.95} filter={`url(#${glowId})`} />
                  <circle cx={x} cy={y} r={14} fill="none" stroke="#a7f3d0" strokeWidth={0.65} strokeDasharray="2.5 2" opacity={0.9} />
                  {canTap ? (
                    <circle
                      cx={x}
                      cy={y}
                      r={16}
                      fill="transparent"
                      className="cursor-pointer"
                      style={{ pointerEvents: "all" }}
                      onClick={e => {
                        e.stopPropagation();
                        onMovePick(parsed.ring, parsed.slot);
                      }}
                    />
                  ) : null}
                </g>
              );
            })
          : null}

        {rotateMode && highlightRotateRings
          ? [...highlightRotateRings].map(ring => {
              const rr = ringRadius(ring);
              if (!rr || !onRotatePick) return null;
              const [cwSlot, ccwSlot] = rotateUiSlots[ring] || [2, 6];
              const bump = rotateBump[ring] ?? 12;
              const cw = ringXY(cwSlot, rr + bump);
              const ccw = ringXY(ccwSlot, rr + bump);
              return (
                <g key={`rot-ui-${ring}`}>
                  <g
                    className="cursor-pointer"
                    style={{ pointerEvents: "all" }}
                    onClick={e => {
                      e.stopPropagation();
                      onRotatePick(ring, 1);
                    }}
                  >
                    <circle cx={cw.x} cy={cw.y} r={9} fill="rgba(14,165,233,0.35)" stroke="#38bdf8" strokeWidth={1.1} />
                    <text x={cw.x} y={cw.y + 3.2} textAnchor="middle" fontSize="8" fill="#e0f2fe" fontWeight="900">
                      ⟳
                    </text>
                    <text x={cw.x} y={cw.y - 5.5} textAnchor="middle" fontSize="3.2" fill="#bae6fd" fontWeight="700">
                      CW
                    </text>
                  </g>
                  <g
                    className="cursor-pointer"
                    style={{ pointerEvents: "all" }}
                    onClick={e => {
                      e.stopPropagation();
                      onRotatePick(ring, -1);
                    }}
                  >
                    <circle cx={ccw.x} cy={ccw.y} r={9} fill="rgba(14,165,233,0.28)" stroke="#7dd3fc" strokeWidth={1.05} />
                    <text x={ccw.x} y={ccw.y + 3} textAnchor="middle" fontSize="7.5" fill="#e0f2fe" fontWeight="900">
                      ⟲
                    </text>
                    <text x={ccw.x} y={ccw.y - 5.5} textAnchor="middle" fontSize="3.2" fill="#bae6fd" fontWeight="700">
                      CCW
                    </text>
                  </g>
                </g>
              );
            })
          : null}

        {state.players.map((pl, seat) => {
          if (pl.inPlay === false) return null;
          const isTurn = state.turnSeat === seat;
          const isYou = mySeat != null && mySeat === seat;
          const inactive = rosterSeatIndices && rosterSeatIndices.length && !rosterSeatIndices.includes(seat);
          const dim = inactive ? 0.48 : 1;
          if (pl.ring === "core") {
            return (
              <g key={`p-${seat}`} opacity={dim}>
                {isTurn ? <circle cx="0" cy="0" r={9.2} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.98} /> : null}
                {isYou ? <circle cx="0" cy="0" r={10.8} fill="none" stroke="#38bdf8" strokeWidth={0.85} strokeDasharray="3 2.5" opacity={0.95} /> : null}
                <circle cx="0" cy="0" r={5.6} fill={SEAT_COLORS[seat]} stroke="#fafafa" strokeWidth={0.65} />
                <text x="0" y="2.4" textAnchor="middle" fontSize="6.2" fill="#0a0a0a" fontWeight="900">
                  {seat + 1}
                </text>
                {isYou ? (
                  <text x="0" y={-11} textAnchor="middle" fontSize="3.4" fill="#7dd3fc" fontWeight="800">
                    YOU
                  </text>
                ) : null}
              </g>
            );
          }
          const r = pl.ring === "outer" ? R_OUT : pl.ring === "mid" ? R_MID : R_INN;
          const { x, y } = ringXY(pl.slot, r);
          const heavy = pl.orbsHeld >= 2;
          return (
            <g key={`p-${seat}`} transform={`translate(${x},${y})`} opacity={dim}>
              {isTurn ? <circle cx="0" cy="0" r={10.2} fill="none" stroke="#fbbf24" strokeWidth={1.95} opacity={0.96} /> : null}
              {isYou ? <circle cx="0" cy="0" r={11.4} fill="none" stroke="#38bdf8" strokeWidth={0.75} strokeDasharray="3 2.5" opacity={0.92} /> : null}
              {heavy ? <circle cx="0" cy="0" r={7.4} fill="none" stroke="#fcd34d" strokeWidth={1.35} opacity={0.9} /> : null}
              <circle cx="0" cy="0" r={5.4} fill={SEAT_COLORS[seat]} stroke="#fafafa" strokeWidth={0.65} />
              <text x="0" y="2.4" textAnchor="middle" fontSize="6.2" fill="#0a0a0a" fontWeight="900">
                {seat + 1}
              </text>
              {isYou ? (
                <text x="0" y={-10} textAnchor="middle" fontSize="3.2" fill="#7dd3fc" fontWeight="800">
                  YOU
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
