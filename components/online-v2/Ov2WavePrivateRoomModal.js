"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { extractOv2RoomUuidFromText } from "../../lib/online-v2/ov2ExtractRoomUuid";
import { getOv2ParticipantId } from "../../lib/online-v2/ov2ParticipantId";
import { OV2_C21_PRODUCT_GAME_ID, OV2_C21_STAKE_TIERS } from "../../lib/online-v2/c21/ov2C21TableIds";
import { OV2_CW_PRODUCT_GAME_ID, OV2_CW_STAKE_TIERS } from "../../lib/online-v2/color_wheel/ov2CwTableIds";
import { OV2_CC_PRODUCT_GAME_ID, OV2_CC_STAKE_TIERS } from "../../lib/online-v2/community_cards/ov2CcTableIds";

function formatStakeLabel(n) {
  const t = Math.floor(Number(n));
  if (t >= 1_000_000) return `${t / 1_000_000}M`;
  if (t >= 1000) return `${t / 1000}K`;
  return String(t);
}

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   game: "c21" | "cw" | "cc";
 *   routeBase: string;
 * }} props
 */
export default function Ov2WavePrivateRoomModal({ open, onClose, game, routeBase }) {
  const router = useRouter();
  const [tab, setTab] = useState("create");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const productGameId = useMemo(() => {
    if (game === "cw") return OV2_CW_PRODUCT_GAME_ID;
    if (game === "cc") return OV2_CC_PRODUCT_GAME_ID;
    return OV2_C21_PRODUCT_GAME_ID;
  }, [game]);

  const stakeList = useMemo(() => {
    if (game === "cw") return [...OV2_CW_STAKE_TIERS];
    if (game === "cc") return [...OV2_CC_STAKE_TIERS];
    return [...OV2_C21_STAKE_TIERS];
  }, [game]);

  const [createStake, setCreateStake] = useState(() => stakeList[0]);
  const [ccMax, setCcMax] = useState(9);

  useEffect(() => {
    setCreateStake(stakeList[0]);
  }, [stakeList]);
  const [createPw, setCreatePw] = useState("");

  const [joinRaw, setJoinRaw] = useState("");
  const [joinPw, setJoinPw] = useState("");

  const onCreate = useCallback(async () => {
    setErr("");
    if (createPw.length < 4) {
      setErr("Password must be at least 4 characters.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        productGameId,
        stakeUnits: createStake,
        password: createPw,
        participantKey: getOv2ParticipantId(),
      };
      if (game === "cc") body.maxSeatsCc = ccMax;
      const res = await fetch("/api/ov2-wave/private-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(String(json?.message || json?.code || "Could not create room."));
        return;
      }
      onClose();
      await router.push(`${routeBase}?room=${encodeURIComponent(json.roomId)}`);
    } finally {
      setBusy(false);
    }
  }, [createPw, createStake, ccMax, game, onClose, productGameId, routeBase, router]);

  const onJoin = useCallback(async () => {
    setErr("");
    const id = extractOv2RoomUuidFromText(joinRaw);
    if (!id) {
      setErr("Paste a valid room link or UUID.");
      return;
    }
    if (!joinPw) {
      setErr("Password is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ov2-wave/private-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: id,
          password: joinPw,
          productGameId,
          participantKey: getOv2ParticipantId(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(String(json?.message || json?.code || "Could not join."));
        return;
      }
      onClose();
      await router.push(`${routeBase}?room=${encodeURIComponent(json.roomId)}`);
    } finally {
      setBusy(false);
    }
  }, [joinPw, joinRaw, onClose, productGameId, routeBase, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-2 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Private room"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[min(92vh,640px)] w-full max-w-md overflow-hidden rounded-t-2xl border border-white/15 bg-zinc-950 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="text-sm font-semibold text-zinc-100">Private room</span>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs text-zinc-400 touch-manipulation"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="flex gap-1 border-b border-white/10 px-2 py-1.5">
          {["create", "join"].map(k => (
            <button
              key={k}
              type="button"
              className={`flex-1 rounded-lg py-2 text-xs font-semibold touch-manipulation ${
                tab === k ? "bg-white/10 text-white" : "text-zinc-500"
              }`}
              onClick={() => {
                setTab(k);
                setErr("");
              }}
            >
              {k === "create" ? "Create" : "Join"}
            </button>
          ))}
        </div>
        <div className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-y-contain px-3 py-3">
          {tab === "create" ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-500">Table minimum</label>
                <select
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
                  value={createStake}
                  onChange={e => setCreateStake(Math.floor(Number(e.target.value)))}
                >
                  {stakeList.map(s => (
                    <option key={s} value={s}>
                      {formatStakeLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              {game === "cc" ? (
                <div>
                  <label className="text-[11px] text-zinc-500">Table size</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
                    value={ccMax}
                    onChange={e => setCcMax(Math.floor(Number(e.target.value)))}
                  >
                    <option value={5}>5-max</option>
                    <option value={9}>9-max</option>
                  </select>
                </div>
              ) : null}
              <div>
                <label className="text-[11px] text-zinc-500">Password (required)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
                  value={createPw}
                  onChange={e => setCreatePw(e.target.value)}
                  placeholder="Min 4 characters"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-500">Room link or ID</label>
                <input
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
                  value={joinRaw}
                  onChange={e => setJoinRaw(e.target.value)}
                  placeholder="Paste link or UUID"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
                  value={joinPw}
                  onChange={e => setJoinPw(e.target.value)}
                />
              </div>
            </div>
          )}
          {err ? <p className="text-[12px] text-rose-400">{err}</p> : null}
        </div>
        <div className="border-t border-white/10 px-3 py-3">
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-xl border border-emerald-600/45 bg-emerald-950/50 py-3 text-sm font-bold text-emerald-50 touch-manipulation disabled:opacity-45"
            onClick={() => void (tab === "create" ? onCreate() : onJoin())}
          >
            {busy ? "…" : tab === "create" ? "Create & enter" : "Join room"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function formatOv2CcCategoryLabel(cat) {
  const lab = formatStakeLabel(cat.stake);
  return `${lab} · ${cat.maxSeats}-max`;
}
