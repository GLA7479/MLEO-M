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
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-3 text-sm text-zinc-300">
        <p>Waiting for an active Tanks session on this room…</p>
        <button
          type="button"
          className="w-fit rounded border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
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

  let finishLine = "";
  if (finished) {
    if (winnerSeat == null) {
      finishLine = "Match draw.";
    } else if (snapshot?.mySeat === winnerSeat) {
      finishLine = "You won.";
    } else {
      finishLine = "You lost.";
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 py-3 text-sm text-zinc-200">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span>Turn timer: {playing ? `${secLeft}s / ${OV2_TANKS_TURN_SECONDS}s` : "—"}</span>
        <span className="text-zinc-600">|</span>
        <span>
          Strikes: P0 {strikes[0]}/3 · P1 {strikes[1]}/3
        </span>
        <span className="text-zinc-600">|</span>
        <span>
          Turns {completedTurns}/{OV2_TANKS_MATCH_MAX_TOTAL_TURNS}
        </span>
        <button
          type="button"
          className="ml-auto rounded border border-white/20 bg-white/10 px-2 py-0.5 font-semibold text-white"
          onClick={() => void reload()}
        >
          Sync
        </button>
      </div>

      <div className="flex flex-wrap items-baseline gap-3 text-[13px]">
        <span className={playing && myTurn ? "font-semibold text-emerald-200" : ""}>
          {playing ? (myTurn ? "Your turn — FIRE when ready" : "Opponent is aiming…") : finished ? finishLine : phase || "…"}
        </span>
        <span className="text-zinc-500">
          HP: P0 {hp[0]} · P1 {hp[1]}
          {snapshot?.mySeat != null ? ` (you are P${snapshot.mySeat})` : ""}
        </span>
      </div>

      {loadError ? <p className="text-xs text-amber-200">{loadError}</p> : null}
      {fireErr ? <p className="text-xs text-red-300">{fireErr}</p> : null}

      <Ov2TanksBattleCanvas snapshot={snapshot} className="w-full max-w-3xl" />

      {playing ? (
        <div className="flex max-w-3xl flex-col gap-3 rounded border border-white/10 bg-black/25 p-3">
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-[11px] uppercase tracking-wide text-zinc-500">Weapon</span>
            {WEAPONS.map(w => {
              const ch = chargesMine ? Number(chargesMine[w]) : 0;
              const label = w === "iron" ? "Iron (∞)" : `${w} (${Number.isFinite(ch) ? ch : 0})`;
              const disabled = !myTurn || fireBusy || (w !== "iron" && ch <= 0);
              return (
                <button
                  key={w}
                  type="button"
                  disabled={disabled}
                  onClick={() => setWeapon(w)}
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    weapon === w ? "bg-sky-600 text-white" : "bg-white/10 text-zinc-200"
                  } disabled:opacity-40`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Angle (deg)
            <input
              type="range"
              min={10}
              max={170}
              value={angleDeg}
              disabled={!myTurn || fireBusy}
              onChange={e => setAngleDeg(Number(e.target.value))}
              className="w-full disabled:opacity-40"
            />
            <span className="text-zinc-200">{angleDeg}°</span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Power
            <input
              type="range"
              min={10}
              max={100}
              value={power}
              disabled={!myTurn || fireBusy}
              onChange={e => setPower(Number(e.target.value))}
              className="w-full disabled:opacity-40"
            />
            <span className="text-zinc-200">{power}</span>
          </label>
          <button
            type="button"
            disabled={!myTurn || fireBusy}
            onClick={() => void onFire()}
            className="w-fit rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {fireBusy ? "Firing…" : "FIRE"}
          </button>
        </div>
      ) : null}

      {finished ? (
        <div className="max-w-3xl space-y-2 rounded border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">
          <p className="text-[11px] text-zinc-500">Match finished — final terrain and HP are shown above.</p>
          <button
            type="button"
            className="rounded border border-white/20 bg-white/10 px-2 py-1 font-semibold text-white"
            onClick={() => void onClaimManual()}
          >
            Claim settlement (vault)
          </button>
          {claimMsg ? <p className="text-emerald-200/90">{claimMsg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
