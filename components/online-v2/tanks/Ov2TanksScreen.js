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

  const activeTurnSeat = useMemo(() => {
    const pk = String(snapshot?.parity?.activeParticipantKey || "").trim();
    const p0 = String(snapshot?.parity?.participants?.[0] || "").trim();
    const p1 = String(snapshot?.parity?.participants?.[1] || "").trim();
    if (pk && p0 && pk === p0) return 0;
    if (pk && p1 && pk === p1) return 1;
    return null;
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

  /**
   * @param {{ seat: 0 | 1, playing: boolean }} props
   */
  function TurnSeatPanel({ seat, playing: playingPanel }) {
    const isLive = playingPanel && activeTurnSeat === seat;
    const isMe = mySeat === seat;
    const curHp = hp[seat];
    const st = strikes[seat];
    const hpPct = Math.min(100, Math.max(0, (curHp / OV2_TANKS_STARTING_HP) * 100));
    return (
      <div
        className={`flex min-w-0 flex-col gap-1.5 rounded-lg px-2 py-2 ring-2 transition-shadow sm:px-2.5 sm:py-2.5 ${
          isLive
            ? "bg-emerald-950/85 ring-emerald-400/70 shadow-[0_0_16px_rgba(52,211,153,0.14)]"
            : "bg-slate-900/90 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        }`}
      >
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500 sm:text-[10px]">
            Turn · {hpLabel(seat)} · seat {seat}
          </p>
          <p
            className={`truncate text-xs font-black uppercase tracking-wide sm:text-sm ${
              isLive ? (isMe ? "text-emerald-100" : "text-amber-100") : "text-zinc-500"
            }`}
          >
            {isLive ? (isMe ? "You — fire" : "Opponent shooting") : "Waiting"}
          </p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-[9px] text-zinc-500 sm:text-[10px]">
            <span className="font-semibold uppercase tracking-wider">Tank HP</span>
            <span className={`font-mono font-black tabular-nums ${isMe ? "text-sky-200" : "text-orange-200"}`}>
              {curHp}/{OV2_TANKS_STARTING_HP}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/55 ring-1 ring-inset ring-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                curHp <= 25 ? "bg-gradient-to-r from-rose-600 to-amber-500" : "bg-gradient-to-r from-emerald-600 to-cyan-500"
              }`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[9px] text-zinc-500 sm:text-[10px]">
          <span>
            <span className="font-semibold uppercase tracking-wider text-zinc-600">Strikes</span>{" "}
            <span className="font-mono font-bold text-zinc-300">{st}</span>
            <span className="text-zinc-600">/3</span>
          </span>
          <span>
            <span className="font-semibold uppercase tracking-wider text-zinc-600">Round</span>{" "}
            <span className="font-mono font-bold text-zinc-300">
              {completedTurns}/{OV2_TANKS_MATCH_MAX_TOTAL_TURNS}
            </span>
          </span>
        </div>
        <div className="flex items-end justify-between gap-1 border-t border-white/[0.06] pt-1">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-600">Turn timer</p>
          <p className="shrink-0 font-mono text-lg font-black tabular-nums leading-none text-white sm:text-xl">
            {playingPanel ? secLeft : "—"}
            {playingPanel ? (
              <span className="text-[10px] font-bold text-zinc-500">/{OV2_TANKS_TURN_SECONDS}s</span>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  function HpBar({ label, value, accent }) {
    const pct = Math.min(100, Math.max(0, (value / OV2_TANKS_STARTING_HP) * 100));
    return (
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 sm:text-[10px]">
            {label}
          </span>
          <span className={`font-mono text-[11px] font-black tabular-nums sm:text-xs ${accent}`}>{value}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/55 ring-1 ring-inset ring-white/10 sm:h-2.5">
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
      <header className="shrink-0 border-b border-white/[0.08] bg-slate-950/95 px-2 py-2 shadow-md backdrop-blur-md sm:px-3 sm:py-2.5">
        <div className="mx-auto max-w-4xl rounded-xl border border-white/[0.08] bg-gradient-to-b from-slate-900/90 to-slate-950/95 px-2.5 py-2 ring-1 ring-black/40 sm:px-3 sm:py-2.5">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-stretch md:gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2 md:max-w-[52%]">
              {playing ? (
                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <TurnSeatPanel seat={0} playing={playing} />
                    <TurnSeatPanel seat={1} playing={playing} />
                  </div>
                </div>
              ) : finished ? (
                <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-950/30 px-3 py-2">
                  <span className="text-sm font-black uppercase tracking-wide text-amber-100">{finishLine}</span>
                  <span className="text-[10px] text-zinc-500">Match ended</span>
                </div>
              ) : (
                <span className="text-xs text-zinc-500">{phase || "…"}</span>
              )}
            </div>

            <div
              className={`grid shrink-0 gap-2 sm:gap-3 md:flex md:min-w-0 md:flex-1 md:items-end md:justify-end ${
                playing ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {playing ? null : (
                <>
                  <HpBar label={hpLabel(0)} value={hp[0]} accent="text-sky-200" />
                  <HpBar label={hpLabel(1)} value={hp[1]} accent="text-orange-200" />
                </>
              )}
              <div
                className={`flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-1.5 md:flex-col md:items-stretch md:justify-center md:border-0 md:bg-transparent md:px-0 md:py-0 ${
                  playing ? "col-span-1" : "col-span-2 md:col-span-1"
                }`}
              >
                {playing ? null : (
                  <div className="text-[10px] text-zinc-400">
                    <span className="font-bold text-zinc-300">Strikes</span>{" "}
                    <span className="font-mono font-semibold text-zinc-200">
                      {strikes[0]} · {strikes[1]}
                    </span>
                    <span className="text-zinc-600"> /3</span>
                  </div>
                )}
                <button
                  type="button"
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold text-zinc-200 transition hover:bg-white/10 md:self-end"
                  onClick={() => void reload()}
                >
                  Sync
                </button>
              </div>
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

      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-2 px-2 pb-2 pt-1.5 md:flex-row md:items-stretch md:gap-4 md:px-3 md:pb-3 md:pt-2">
        {playing ? (
          <aside className="order-2 flex w-full max-w-full shrink-0 flex-col md:order-1 md:w-[min(100%,300px)] md:max-w-[300px]">
            <div
              className={`rounded-2xl border p-2.5 shadow-lg transition-colors sm:p-3 md:min-h-0 ${
                controlsLocked
                  ? "border-white/[0.08] bg-slate-950/50 opacity-[0.92]"
                  : "border-emerald-500/35 bg-slate-900/80 ring-2 ring-emerald-500/20"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Weapons</p>
                {controlsLocked ? (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">
                    Locked
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200">
                    Ready
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
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
                      className={`flex min-h-[36px] flex-col items-center justify-center rounded-xl border px-0.5 py-1 transition active:scale-[0.98] sm:min-h-0 sm:py-2 ${
                        selected
                          ? "border-amber-400/60 bg-amber-500/20 text-amber-50 shadow-[0_0_14px_rgba(251,191,36,0.2)]"
                          : "border-white/10 bg-black/30 text-zinc-400 hover:border-white/25 hover:bg-white/[0.06]"
                      } disabled:cursor-not-allowed disabled:opacity-30`}
                    >
                      <span className="font-mono text-xs font-black tracking-tight sm:text-[11px]">{meta.abbr}</span>
                      <span className="mt-0.5 text-[8px] font-semibold uppercase leading-none text-zinc-500">
                        {meta.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Angle</label>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs font-bold text-zinc-100">
                      {angleDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={170}
                    value={angleDeg}
                    disabled={controlsLocked}
                    onChange={e => setAngleDeg(Number(e.target.value))}
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-amber-400 disabled:cursor-not-allowed disabled:opacity-35 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-amber-200/50 [&::-webkit-slider-thumb]:bg-amber-300 [&::-webkit-slider-thumb]:shadow"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Power</label>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs font-bold text-zinc-100">
                      {power}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={power}
                    disabled={controlsLocked}
                    onChange={e => setPower(Number(e.target.value))}
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-orange-400 disabled:cursor-not-allowed disabled:opacity-35 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-orange-200/50 [&::-webkit-slider-thumb]:bg-orange-300 [&::-webkit-slider-thumb]:shadow"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={controlsLocked}
                onClick={() => void onFire()}
                className="mt-2 w-full rounded-xl bg-gradient-to-b from-rose-500 via-rose-600 to-rose-900 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_4px_0_rgb(127,29,29),0_10px_22px_rgba(0,0,0,0.35)] transition enabled:active:translate-y-0.5 enabled:active:shadow-[0_2px_0_rgb(127,29,29)] disabled:cursor-not-allowed disabled:from-zinc-700 disabled:via-zinc-800 disabled:to-zinc-900 disabled:text-zinc-500 disabled:shadow-none sm:mt-4 sm:py-3.5 sm:text-base sm:tracking-widest"
              >
                {fireBusy ? "Firing…" : controlsLocked ? "Wait" : "Fire"}
              </button>
            </div>
          </aside>
        ) : null}
        <section
          className={`relative flex min-h-0 w-full flex-1 flex-col rounded-2xl ${
            playing
              ? "order-1 max-h-[min(34dvh,42svh)] shrink-0 md:order-2 md:max-h-none md:min-h-[min(48vh,460px)]"
              : "min-h-[min(36dvh,300px)] md:min-h-[min(48vh,420px)]"
          }`}
        >
          <Ov2TanksBattleCanvas
            snapshot={snapshot}
            aimAngleDeg={angleDeg}
            mySeat={mySeat != null ? mySeat : null}
            isMyTurn={myTurn}
            activeTurnSeat={activeTurnSeat}
            className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-2xl border border-amber-900/30 bg-[#0b0f18] bg-gradient-to-b from-slate-900 to-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_48px_rgba(0,0,0,0.5)]"
          />
        </section>
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
