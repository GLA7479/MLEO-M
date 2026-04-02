"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import { OV2_HUD_CHROME_BTN } from "../OnlineV2GameHudOverlays";
import Ov2C21Screen from "./Ov2C21Screen";
import { useOv2C21Session } from "../../../hooks/useOv2C21Session";
import { OV2_C21_STAKE_TIERS, OV2_C21_ROOM_ID_BY_STAKE } from "../../../lib/online-v2/c21/ov2C21TableIds";
import { isOv2RoomIdQueryParam } from "../../../lib/online-v2/onlineV2GameRegistry";
import { supabaseMP } from "../../../lib/supabaseClients";

const NAME_LS = "ov2_c21_display_name_v1";

function parseRoomQuery(router) {
  if (!router.isReady) return null;
  const q = router.query.room;
  const raw = Array.isArray(q) ? q[0] : q;
  const s = raw != null ? String(raw).trim() : "";
  return s && isOv2RoomIdQueryParam(s) ? s : null;
}

function formatTierLabel(tier) {
  if (tier >= 1_000_000) return `${tier / 1_000_000}M`;
  if (tier >= 1000) return `${tier / 1000}K`;
  return String(tier);
}

const C21_INFO_PANEL = (
  <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
    <p>
      <span className="font-semibold text-zinc-200">House</span> (top-right number): seconds left in the current step
      (play window, side cover, someone&apos;s turn, or reveal pause).
    </p>
    <p>
      Visitor: you can watch without a seat. Take an open seat to join; use <span className="text-zinc-200">Tables</span>{" "}
      to browse other levels without giving up your seat. <span className="text-zinc-200">Leave</span> vacates your seat
      and returns here.
    </p>
    <p className="text-zinc-500">
      Two consecutive rounds without meeting this table&apos;s minimum play clears your seat (using Tables does not).
    </p>
  </div>
);

export default function Ov2C21LiveShell() {
  const router = useRouter();
  const roomId = useMemo(() => parseRoomQuery(router), [router.isReady, router.query.room]);
  const [tableStake, setTableStake] = useState(10_000);
  const [nameDraft, setNameDraft] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveInFlightRef = useRef(false);

  useEffect(() => {
    try {
      const n = window.localStorage.getItem(NAME_LS);
      if (n) setNameDraft(n);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!roomId) return;
    void (async () => {
      const { data } = await supabaseMP
        .from("ov2_rooms")
        .select("stake_per_seat")
        .eq("id", roomId)
        .maybeSingle();
      if (data?.stake_per_seat != null) {
        setTableStake(Math.max(100, Math.floor(Number(data.stake_per_seat) || 100)));
      }
    })();
  }, [roomId]);

  const displayName = String(nameDraft || "").trim() || "Guest";
  const session = useOv2C21Session(roomId, tableStake);
  const runC21Op = session.operate;
  const c21OpBusy = session.operateBusy;

  const onLeaveTable = useCallback(async () => {
    if (leaveInFlightRef.current || !roomId) return;
    leaveInFlightRef.current = true;
    setLeaveBusy(true);
    try {
      const tryLeave = async () => {
        let r = await runC21Op("leave_seat", {});
        if (r?.skipped) {
          await new Promise(res => setTimeout(res, 220));
          r = await runC21Op("leave_seat", {});
        }
        return r;
      };
      let r = await tryLeave();
      let okLeave = r?.ok === true || r?.error?.code === "not_seated";
      if (!okLeave && r?.error?.code === "REVISION_CONFLICT") {
        await new Promise(res => setTimeout(res, 240));
        r = await tryLeave();
        okLeave = r?.ok === true || r?.error?.code === "not_seated";
      }
      if (okLeave) {
        await router.replace("/ov2-21-challenge");
      }
    } finally {
      leaveInFlightRef.current = false;
      setLeaveBusy(false);
    }
  }, [roomId, router, runC21Op]);

  const persistName = () => {
    try {
      window.localStorage.setItem(NAME_LS, displayName);
    } catch {
      /* ignore */
    }
  };

  if (!roomId) {
    return (
      <OnlineV2GamePageShell
        title="21 Challenge"
        subtitle="Five permanent live tables"
        useAppViewportHeight
        infoPanel={C21_INFO_PANEL}
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-2">
          <div className="shrink-0">
            <label className="text-[11px] text-zinc-400" htmlFor="ov2-c21-name">
              Display name
            </label>
            <input
              id="ov2-c21-name"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
              placeholder="How others see you"
              autoComplete="nickname"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <p className="mb-2 text-center text-[11px] text-zinc-400">
              Five always-on tables. Open one to spectate or sit; leaving via Tables keeps your seat until you Leave table
              or miss two rounds without a play.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OV2_C21_STAKE_TIERS.map(tier => {
                const id = OV2_C21_ROOM_ID_BY_STAKE[tier];
                return (
                  <button
                    key={tier}
                    type="button"
                    className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-2 py-3 text-sm font-bold text-emerald-100 touch-manipulation active:scale-[0.99]"
                    onClick={() => {
                      persistName();
                      router.push(`/ov2-21-challenge?room=${id}`);
                    }}
                  >
                    <span>{formatTierLabel(tier)}</span>
                    <span className="text-[9px] font-normal text-emerald-200/70">Table level {formatTierLabel(tier)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </OnlineV2GamePageShell>
    );
  }

  return (
      <OnlineV2GamePageShell
        title="21 Challenge"
        subtitle={`Live · table play ${formatTierLabel(tableStake)}`}
        useAppViewportHeight
        infoPanel={C21_INFO_PANEL}
      >
      <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={persistName}
            className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/35 px-2 py-1.5 text-[11px] text-white"
            placeholder="Display name"
          />
          <button
            type="button"
            title="Pick another table without leaving your seat"
            onClick={() => router.push("/ov2-21-challenge")}
            className={OV2_HUD_CHROME_BTN}
          >
            Tables
          </button>
          <button
            type="button"
            title="Vacate seat and return to table list"
            disabled={leaveBusy}
            onClick={() => void onLeaveTable()}
            className={`${OV2_HUD_CHROME_BTN} border-rose-500/35 bg-rose-950/30 text-rose-100 hover:border-rose-400/40 hover:bg-rose-950/45 disabled:opacity-45`}
          >
            {leaveBusy ? "…" : "Leave"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Ov2C21Screen
            roomId={roomId}
            engine={session.engine}
            tableStakeUnits={tableStake}
            participantKey={session.participantKey}
            displayName={displayName}
            onOperate={session.operate}
            operateBusy={session.operateBusy}
            loadError={session.loadError}
          />
        </div>
      </div>
    </OnlineV2GamePageShell>
  );
}
