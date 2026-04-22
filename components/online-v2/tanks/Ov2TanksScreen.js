"use client";

import { useCallback, useMemo, useState } from "react";
import { useOv2TanksSession } from "../../../hooks/useOv2TanksSession";
import { ONLINE_V2_GAME_IDS } from "../../../lib/online-v2/onlineV2GameRegistry";
import { applyOv2SettlementClaimLinesToVaultAndConfirm } from "../../../lib/online-v2/ov2SettlementVaultDelivery";
import { readOnlineV2Vault } from "../../../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../../../lib/online-v2/ov2Economy";
import {
  requestOv2TanksClaimSettlement,
  requestOv2TanksFire,
} from "../../../lib/online-v2/tanks/ov2TanksSessionAdapter";
import {
  OV2_TANKS_MATCH_MAX_TOTAL_TURNS,
  OV2_TANKS_STARTING_HP,
  OV2_TANKS_TURN_SECONDS,
} from "../../../lib/online-v2/tanks/ov2TanksRulesConstants";
import Ov2TanksBattleCanvas from "./Ov2TanksBattleCanvas";

const WEAPONS = ["iron", "he", "burrower", "finisher"];

const WEAPON_META = {
  iron: { abbr: "IR", label: "Iron", hint: "∞" },
  he: { abbr: "HE", label: "HE", hint: "Blast" },
  burrower: { abbr: "BU", label: "Burrow", hint: "Crater" },
  finisher: { abbr: "FI", label: "Finisher", hint: "Heavy" },
};

/**
 * @param {{ roomId: string, participantId: string, room: object|null }} props
 */
export default function Ov2TanksScreen({ roomId, participantId, room }) {
  const sessionId = room && typeof room === "object" && room.active_session_id ? String(room.active_session_id) : "";
  const hasSession = Boolean(sessionId);
  const { snapshot, loadError, reload } = useOv2TanksSession({
    roomId,
    participantKey: participantId,
    enabled: hasSession,
  });

  const [angleDeg, setAngleDeg] = useState(55);
  const [power, setPower] = useState(62);
  const [weapon, setWeapon] = useState("iron");
  const [fireBusy, setFireBusy] = useState(false);
  const [fireErr, setFireErr] = useState("");
  const [claimMsg, setClaimMsg] = useState("");

  const productOk = useMemo(
    () => room && typeof room === "object" && String(room.product_game_id || "").trim() === ONLINE_V2_GAME_IDS.TANKS,
    [room]
  );

  const hp = useMemo(() => {
    const h = snapshot?.parity?.hp;
    if (!Array.isArray(h)) return [OV2_TANKS_STARTING_HP, OV2_TANKS_STARTING_HP];
    const a = Number(h[0]);
    const b = Number(h[1]);
    return [Number.isFinite(a) ? a : OV2_TANKS_STARTING_HP, Number.isFinite(b) ? b : OV2_TANKS_STARTING_HP];
  }, [snapshot]);

  const strikes = useMemo(() => {
    const s = snapshot?.parity?.timeoutStrikes;
    if (!Array.isArray(s)) return [0, 0];
    return [Number(s[0]) || 0, Number(s[1]) || 0];
  }, [snapshot]);

  const chargesMine = useMemo(() => {
    const my = snapshot?.mySeat;
    const cs = snapshot?.parity?.chargesSeat;
    if (my == null || !Array.isArray(cs)) return null;
    const row = cs[my];
    if (!row || typeof row !== "object") return null;
    return /** @type {Record<string, unknown>} */ (row);
  }, [snapshot]);

  const completedTurns = useMemo(() => {
    const n = Number(snapshot?.parity?.completedTurns);
    return Number.isFinite(n) ? n : 0;
  }, [snapshot]);

  const onFire = useCallback(async () => {
    const rid = String(roomId || "").trim();
    const pk = String(participantId || "").trim();
    if (!rid || !pk) return;
    setFireErr("");
    setFireBusy(true);
    try {
      const out = await requestOv2TanksFire(rid, pk, { weapon, angleDeg, power });
      if (!out.ok) {
        setFireErr(out.error || out.code || "Fire failed");
        return;
      }
      await reload();
    } catch (e) {
      setFireErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFireBusy(false);
    }
  }, [roomId, participantId, weapon, angleDeg, power, reload]);

  const onClaimManual = useCallback(async () => {
    const rid = String(roomId || "").trim();
    const pk = String(participantId || "").trim();
    if (!rid || !pk) return;
    setClaimMsg("");
    const out = await requestOv2TanksClaimSettlement(rid, pk);
    if (!out.ok) {
      setClaimMsg(out.error || "Claim failed");
      return;
    }
    if (Array.isArray(out.lines) && out.lines.length > 0) {
      try {
        await applyOv2SettlementClaimLinesToVaultAndConfirm(out.lines, ONLINE_V2_GAME_KINDS.TANKS, rid, pk);
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
      } catch (e) {
        setClaimMsg(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setClaimMsg(out.idempotent ? "Already claimed." : `Vault updated (credits ${out.totalAmount || 0}).`);
  }, [roomId, participantId]);

  if (!productOk) {
    return <p className="px-2 text-sm text-red-200">This screen requires a Tanks room.</p>;
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center text-sm text-zinc-400">
        <p className="max-w-sm text-balance">Waiting for an active Tanks session…</p>
        <button
          type="button"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20"
          onClick={() => void reload()}
        >
          Refresh
        </button>
      </div>
    );
  }

  const phase = String(snapshot?.phase || "");
  const playing = phase === "playing";
  const finished = phase === "finished";
  const myTurn = Boolean(snapshot?.isMyTurn);
  const secLeft = Math.ceil((snapshot?.turnMsRemaining || 0) / 1000);
  const winnerSeat = snapshot?.winnerSeat;
  const mySeat = snapshot?.mySeat;

  const timerPct = playing ? Math.min(100, Math.max(0, (secLeft / OV2_TANKS_TURN_SECONDS) * 100)) : 0;
  const controlsLocked = !playing || !myTurn || fireBusy;

  let finishLine = "";
  if (finished) {
    if (winnerSeat == null) {
      finishLine = "Match over.";
    } else if (mySeat === winnerSeat) {
      finishLine = "Victory";
    } else {
      finishLine = "Defeat";
    }
  }

  function hpLabel(seatIdx) {
    if (mySeat == null) return `P${seatIdx}`;
    return mySeat === seatIdx ? "You" : "Opponent";
  }

  function HpBar({ label, value, accent }) {
    const pct = Math.min(100, Math.max(0, (value / OV2_TANKS_STARTING_HP) * 100));
    return (
      <div className="min-w-[120px] flex-1 sm:min-w-[140px]">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
          <span className={`font-mono text-xs font-bold tabular-nums ${accent}`}>{value}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-inset ring-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              value <= 25 ? "bg-gradient-to-r from-rose-600 to-amber-500" : "bg-gradient-to-r from-emerald-600 to-cyan-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-[#070a0f] text-zinc-100">
      <header className="shrink-0 border-b border-white/[0.07] bg-slate-950/90 px-3 py-2.5 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
            <div className="flex flex-wrap items-center gap-2">
              {playing ? (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
                    myTurn
                      ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/40"
                      : "bg-slate-600/40 text-zinc-300 ring-white/10"
                  }`}
                >
                  {myTurn ? "Your turn" : "Opponent turn"}
                </span>
              ) : finished ? (
                <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-100 ring-1 ring-amber-400/30">
                  {finishLine}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">{phase || "…"}</span>
              )}
              <span className="text-[10px] text-zinc-500">
                Turn {completedTurns}/{OV2_TANKS_MATCH_MAX_TOTAL_TURNS}
              </span>
            </div>
            {playing ? (
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                  <span>Shot clock</span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {secLeft}s <span className="text-zinc-600">/</span> {OV2_TANKS_TURN_SECONDS}s
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-inset ring-white/10">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ease-linear ${
                      secLeft <= 8 ? "bg-gradient-to-r from-rose-500 to-amber-400" : "bg-gradient-to-r from-sky-500 to-cyan-400"
                    }`}
                    style={{ width: `${timerPct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-1 flex-wrap items-end gap-3 sm:justify-end">
            <HpBar label={hpLabel(0)} value={hp[0]} accent="text-sky-200" />
            <HpBar label={hpLabel(1)} value={hp[1]} accent="text-orange-200" />
            <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
              <div className="text-[10px] text-zinc-500">
                <span className="font-semibold text-zinc-400">Strikes</span>{" "}
                <span className="font-mono text-zinc-300">
                  {strikes[0]}·{strikes[1]}
                </span>
                <span className="text-zinc-600"> /3</span>
              </div>
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 transition hover:bg-white/10"
                onClick={() => void reload()}
              >
                Sync
              </button>
            </div>
          </div>
        </div>
      </header>

      {loadError ? (
        <p className="shrink-0 px-3 py-1 text-center text-xs text-amber-200/95">{loadError}</p>
      ) : null}
      {fireErr ? (
        <p className="shrink-0 px-3 py-1 text-center text-xs text-rose-300">{fireErr}</p>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 px-2 pb-3 pt-2 md:flex-row md:items-stretch md:gap-4 md:px-3">
        <section className="order-1 flex min-h-[min(48vh,380px)] flex-1 flex-col md:order-2 md:min-h-[min(56vh,520px)]">
          <Ov2TanksBattleCanvas
            snapshot={snapshot}
            aimAngleDeg={angleDeg}
            mySeat={mySeat != null ? mySeat : null}
            className="flex min-h-0 flex-1 rounded-2xl border border-amber-900/30 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_48px_rgba(0,0,0,0.5)]"
          />
        </section>

        {playing ? (
          <aside className="order-2 flex shrink-0 flex-col gap-3 md:order-1 md:w-[min(100%,300px)] md:max-w-[300px]">
            <div
              className={`rounded-2xl border p-3 shadow-lg transition-colors md:min-h-0 ${
                controlsLocked
                  ? "border-white/[0.06] bg-slate-900/40"
                  : "border-emerald-500/25 bg-slate-900/70 ring-1 ring-emerald-500/15"
              }`}
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Loadout</p>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {WEAPONS.map(w => {
                  const ch = chargesMine ? Number(chargesMine[w]) : 0;
                  const meta = WEAPON_META[w] || { abbr: w, label: w, hint: "" };
                  const disabled = controlsLocked || (w !== "iron" && ch <= 0);
                  const selected = weapon === w;
                  return (
                    <button
                      key={w}
                      type="button"
                      disabled={disabled}
                      onClick={() => setWeapon(w)}
                      title={`${meta.label}${w === "iron" ? "" : ` (${ch})`}`}
                      className={`flex flex-col items-center rounded-xl border px-1 py-2 transition sm:py-2.5 ${
                        selected
                          ? "border-amber-400/50 bg-amber-500/15 text-amber-50 shadow-[0_0_12px_rgba(251,191,36,0.12)]"
                          : "border-white/10 bg-black/25 text-zinc-400 hover:border-white/20 hover:bg-white/5"
                      } disabled:cursor-not-allowed disabled:opacity-35`}
                    >
                      <span className="font-mono text-[11px] font-bold tracking-tight">{meta.abbr}</span>
                      <span className="mt-0.5 hidden text-[8px] uppercase text-zinc-500 sm:block">{meta.hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Angle</label>
                    <span className="font-mono text-xs text-zinc-200">{angleDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={170}
                    value={angleDeg}
                    disabled={controlsLocked}
                    onChange={e => setAngleDeg(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-amber-400 disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-300 [&::-webkit-slider-thumb]:shadow"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Power</label>
                    <span className="font-mono text-xs text-zinc-200">{power}</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={power}
                    disabled={controlsLocked}
                    onChange={e => setPower(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-orange-400 disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-300 [&::-webkit-slider-thumb]:shadow"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={controlsLocked}
                onClick={() => void onFire()}
                className="mt-5 w-full rounded-xl bg-gradient-to-b from-rose-600 to-rose-800 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-[0_4px_0_rgb(127,29,29),0_12px_24px_rgba(0,0,0,0.35)] transition enabled:active:translate-y-0.5 enabled:active:shadow-[0_2px_0_rgb(127,29,29)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {fireBusy ? "Firing…" : "Fire"}
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      {finished ? (
        <div className="mx-auto mt-1 w-full max-w-4xl shrink-0 px-2 pb-4 md:px-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center text-sm text-zinc-300">
            <p className="text-xs text-zinc-500">Match finished — battlefield shows final state.</p>
            <button
              type="button"
              className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20"
              onClick={() => void onClaimManual()}
            >
              Claim settlement
            </button>
            {claimMsg ? <p className="mt-2 text-xs text-emerald-300/90">{claimMsg}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
