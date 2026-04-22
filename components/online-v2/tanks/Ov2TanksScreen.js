"use client";

import { useCallback, useMemo, useState } from "react";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
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

const finishDismissStorageKey = sid => `ov2_tanks_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

const WEAPONS = ["iron", "he", "burrower", "finisher"];

const WEAPON_META = {
  iron: { abbr: "IR", label: "Iron", hint: "∞" },
  he: { abbr: "HE", label: "HE", hint: "Blast" },
  burrower: { abbr: "BU", label: "Burrow", hint: "Crater" },
  finisher: { abbr: "FI", label: "Finisher", hint: "Heavy" },
};

/**
 * @param {{
 *   roomId: string,
 *   participantId: string,
 *   room: object|null,
 *   onLeaveTable?: () => void | Promise<void>,
 *   leaveBusy?: boolean,
 *   leaveErr?: string,
 * }} props
 */
export default function Ov2TanksScreen({
  roomId,
  participantId,
  room,
  onLeaveTable,
  leaveBusy = false,
  leaveErr: leaveTableErr = "",
}) {
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
  const [claimBusy, setClaimBusy] = useState(false);
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");

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
    setClaimBusy(true);
    try {
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
    } finally {
      setClaimBusy(false);
    }
  }, [roomId, participantId]);

  const dismissFinishModal = useCallback(() => {
    const snap = snapshot;
    const sid = snap && typeof snap === "object" ? String(snap.sessionId || "").trim() : "";
    const ph = snap && typeof snap === "object" ? String(snap.phase || "") : "";
    if (!sid || ph !== "finished") return;
    setFinishModalDismissedSessionId(sid);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(finishDismissStorageKey(sid), "1");
      }
    } catch {
      /* ignore */
    }
  }, [snapshot]);

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

  const didIWin = Boolean(finished && mySeat != null && winnerSeat != null && mySeat === winnerSeat);
  const isDraw = false;

  const finishSessionId = finished ? String(snapshot?.sessionId || "").trim() : "";
  const finishModalDismissed =
    finishSessionId.length > 0 &&
    (finishModalDismissedSessionId === finishSessionId ||
      (typeof window !== "undefined" &&
        (() => {
          try {
            return window.sessionStorage.getItem(finishDismissStorageKey(finishSessionId)) === "1";
          } catch {
            return false;
          }
        })()));
  const showResultModal = finished && finishSessionId.length > 0 && !finishModalDismissed;

  const stakePerSeat =
    room && typeof room === "object" && Number.isFinite(Number(room.stake_per_seat))
      ? Math.floor(Number(room.stake_per_seat))
      : null;
  const potLocked =
    room && typeof room === "object" && Number.isFinite(Number(room.pot_locked))
      ? Math.floor(Number(room.pot_locked))
      : null;

  const isHost =
    Boolean(room && typeof room === "object") &&
    String(room.host_participant_key || "").trim() === String(participantId || "").trim();

  const stakeMultiplier = 1;

  const finishOutcome = !finished
    ? "unknown"
    : isDraw
      ? "draw"
      : winnerSeat == null || mySeat == null
        ? "unknown"
        : didIWin
          ? "win"
          : "loss";

  const finishTitle = !finished
    ? ""
    : isDraw
      ? "Draw"
      : winnerSeat == null || mySeat == null
        ? "Match finished"
        : didIWin
          ? "Victory"
          : "Defeat";

  const finishReasonLine = !finished
    ? ""
    : winnerSeat == null
      ? "Match complete"
      : didIWin
        ? "Opponent tank destroyed"
        : "Your tank was destroyed";

  let finishAmountLine = { text: "", className: "text-zinc-500" };
  if (finished) {
    if (claimBusy) finishAmountLine = { text: "…", className: "text-zinc-400" };
    else if (stakePerSeat == null || potLocked == null || winnerSeat == null || mySeat == null) {
      finishAmountLine = { text: "—", className: "text-zinc-500" };
    } else if (didIWin) {
      finishAmountLine = { text: `+${potLocked} MLEO`, className: "font-semibold tabular-nums text-amber-200/95" };
    } else {
      finishAmountLine = { text: `−${stakePerSeat} MLEO`, className: "font-semibold tabular-nums text-rose-300/95" };
    }
  }

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
              className={`rounded-xl border p-1.5 shadow-lg transition-colors sm:rounded-2xl sm:p-2.5 md:p-3 md:min-h-0 ${
                controlsLocked
                  ? "border-white/[0.08] bg-slate-950/50 opacity-[0.92]"
                  : "border-emerald-500/35 bg-slate-900/80 ring-1 ring-emerald-500/20 md:ring-2"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-1.5 md:mb-2">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500 md:text-[10px] md:tracking-[0.18em]">
                  Weapons
                </p>
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
              <div className="grid grid-cols-4 gap-0.5 sm:gap-1 md:gap-1.5">
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
                      className={`flex min-h-[30px] flex-col items-center justify-center rounded-lg border px-0.5 py-0.5 transition active:scale-[0.98] sm:min-h-[34px] sm:rounded-xl sm:py-1 md:min-h-0 md:py-2 ${
                        selected
                          ? "border-amber-400/60 bg-amber-500/20 text-amber-50 shadow-[0_0_10px_rgba(251,191,36,0.18)]"
                          : "border-white/10 bg-black/30 text-zinc-400 hover:border-white/25 hover:bg-white/[0.06]"
                      } disabled:cursor-not-allowed disabled:opacity-30`}
                    >
                      <span className="font-mono text-[11px] font-black leading-none sm:text-xs md:text-[11px]">
                        {meta.abbr}
                      </span>
                      <span className="mt-0.5 hidden text-[7px] font-semibold uppercase leading-none text-zinc-500 sm:block sm:text-[8px]">
                        {meta.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 md:mt-4 md:grid-cols-1 md:gap-y-3">
                <div>
                  <div className="mb-0 flex items-center justify-between md:mb-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 md:text-[10px]">
                      Angle
                    </label>
                    <span className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] font-bold text-zinc-100 md:px-1.5 md:text-xs">
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
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-amber-400 disabled:cursor-not-allowed disabled:opacity-35 md:h-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-amber-200/50 [&::-webkit-slider-thumb]:bg-amber-300 [&::-webkit-slider-thumb]:shadow md:[&::-webkit-slider-thumb]:h-4 md:[&::-webkit-slider-thumb]:w-4"
                  />
                </div>
                <div>
                  <div className="mb-0 flex items-center justify-between md:mb-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 md:text-[10px]">
                      Power
                    </label>
                    <span className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] font-bold text-zinc-100 md:px-1.5 md:text-xs">
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
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-orange-400 disabled:cursor-not-allowed disabled:opacity-35 md:h-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-orange-200/50 [&::-webkit-slider-thumb]:bg-orange-300 [&::-webkit-slider-thumb]:shadow md:[&::-webkit-slider-thumb]:h-4 md:[&::-webkit-slider-thumb]:w-4"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={controlsLocked}
                onClick={() => void onFire()}
                className="mt-1.5 w-full rounded-lg bg-gradient-to-b from-rose-500 via-rose-600 to-rose-900 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-[0_3px_0_rgb(127,29,29),0_8px_16px_rgba(0,0,0,0.3)] transition enabled:active:translate-y-0.5 enabled:active:shadow-[0_1px_0_rgb(127,29,29)] disabled:cursor-not-allowed disabled:from-zinc-700 disabled:via-zinc-800 disabled:to-zinc-900 disabled:text-zinc-500 disabled:shadow-none sm:mt-2 sm:rounded-xl sm:py-2.5 sm:text-sm md:mt-4 md:py-3.5 md:text-base md:tracking-widest"
              >
                {fireBusy ? "Firing…" : controlsLocked ? "Wait" : "Fire"}
              </button>
            </div>
          </aside>
        ) : null}
        <section
          className={`relative flex min-h-0 w-full flex-1 flex-col rounded-2xl ${
            playing
              ? "order-1 max-h-[min(40dvh,48svh)] shrink-0 md:order-2 md:max-h-none md:min-h-[min(48vh,460px)]"
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

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-tanks-finish-title">
          <div
            className={[
              "border-b px-4 pb-3 pt-4",
              finishOutcome === "win"
                ? "border-emerald-500/20 bg-gradient-to-br from-emerald-950/45 to-zinc-950/80"
                : finishOutcome === "loss"
                  ? "border-rose-500/20 bg-gradient-to-br from-rose-950/40 to-zinc-950/80"
                  : "border-white/[0.07] bg-zinc-950/60",
            ].join(" ")}
          >
            <div className="flex items-start gap-3">
              <span
                className={[
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl shadow-inner",
                  finishOutcome === "win" && "border-emerald-500/45 bg-emerald-950/60 text-emerald-200",
                  finishOutcome === "loss" && "border-rose-500/45 bg-rose-950/55 text-rose-200",
                  (finishOutcome === "draw" || finishOutcome === "unknown") &&
                    "border-white/10 bg-zinc-900/80 text-zinc-200",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              >
                {finishOutcome === "win" ? "🏆" : finishOutcome === "loss" ? "✕" : "⎔"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Round result</p>
                <h2
                  id="ov2-tanks-finish-title"
                  className={[
                    "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                    finishOutcome === "win" && "text-emerald-400",
                    finishOutcome === "loss" && "text-rose-400",
                    finishOutcome === "draw" && "text-sky-300",
                    finishOutcome === "unknown" && "text-zinc-100",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {finishTitle}
                </h2>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{stakeMultiplier}</p>
                <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                  <p
                    className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}
                  >
                    {finishAmountLine.text}
                  </p>
                </div>
                <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{finishReasonLine}</p>
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                  {claimBusy ? "Sending results to your balance…" : "Round complete — rematch, then host starts next."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-4">
            <button type="button" className={BTN_PRIMARY} disabled>
              Request rematch
            </button>
            <button type="button" className={BTN_SECONDARY} disabled>
              Cancel rematch
            </button>
            {isHost ? (
              <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">
                  Host only
                </p>
                <button type="button" className={`${BTN_PRIMARY} w-full rounded-none`} disabled>
                  Start next (host)
                </button>
              </div>
            ) : (
              <p className="rounded-lg border border-white/[0.06] bg-zinc-950/35 px-2 py-1.5 text-center text-[11px] text-zinc-500">
                Host starts the next match when both players rematch.
              </p>
            )}
            <button type="button" className={BTN_SECONDARY} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              className={`${BTN_DANGER} w-full`}
              disabled={leaveBusy || typeof onLeaveTable !== "function"}
              onClick={() => void onLeaveTable?.()}
            >
              {leaveBusy ? "Leaving…" : "Leave table"}
            </button>
            {leaveTableErr ? <p className="text-center text-[11px] text-red-300">{leaveTableErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}
    </div>
  );
}
