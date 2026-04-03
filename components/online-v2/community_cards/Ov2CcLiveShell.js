"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import { OV2_HUD_CHROME_BTN } from "../OnlineV2GameHudOverlays";
import Ov2CcScreen from "./Ov2CcScreen";
import { useOv2CcSession } from "../../../hooks/useOv2CcSession";
import { OV2_CC_ROOMS_BY_STAKE, OV2_CC_STAKE_TIERS, resolveOv2CcTableConfigFromRoomRow } from "../../../lib/online-v2/community_cards/ov2CcTableIds";
import { isOv2RoomIdQueryParam } from "../../../lib/online-v2/onlineV2GameRegistry";
import { supabaseMP } from "../../../lib/supabaseClients";

const NAME_LS = "ov2_cc_display_name_v1";

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

function CcInfoPanelBody() {
  return (
    <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
      <section>
        <p className="font-semibold text-zinc-100">Community Cards</p>
        <p className="mt-0.5">
          Fixed live tables with no-limit play. Spectators are always welcome. Take a seat with an entry between the table
          minimum and maximum; your stack stays on the table until you leave.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Entry &amp; stack</p>
        <p className="mt-0.5">
          Minimum entry equals the table price. Maximum entry is 10× that price. Top-up is only allowed between hands.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Joining a hand</p>
        <p className="mt-0.5">
          New seats wait for the big blind position before joining a hand (no instant post in this version).
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Timers</p>
        <p className="mt-0.5">
          About 15 seconds per action on the clock; the server allows a few extra seconds for in-flight taps. Check if free;
          otherwise the server folds for you.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Authority</p>
        <p className="mt-0.5">
          Entry, stack, pot, and payouts are enforced on the server. The UI reflects live table state from the database and
          API responses.
        </p>
      </section>
    </div>
  );
}

export default function Ov2CcLiveShell() {
  const router = useRouter();
  const roomId = useMemo(() => parseRoomQuery(router), [router.isReady, router.query.room]);
  const [tableConfig, setTableConfig] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveInFlightRef = useRef(false);

  const session = useOv2CcSession(roomId);

  const infoPanel = useMemo(() => <CcInfoPanelBody />, []);

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
        .select("id, product_game_id, stake_per_seat, meta")
        .eq("id", roomId)
        .maybeSingle();
      const c = resolveOv2CcTableConfigFromRoomRow(data);
      if (c) setTableConfig(c);
    })();
  }, [roomId]);

  const displayName = String(nameDraft || "").trim() || "Guest";
  const runOp = session.operate;

  const onLeaveTable = useCallback(async () => {
    if (leaveInFlightRef.current || !roomId) return;
    leaveInFlightRef.current = true;
    setLeaveBusy(true);
    try {
      const tryLeave = async () => {
        let r = await runOp("leave_seat", {});
        if (r?.skipped) {
          await new Promise(res => setTimeout(res, 220));
          r = await runOp("leave_seat", {});
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
        await router.replace("/ov2-community-cards");
      }
    } finally {
      leaveInFlightRef.current = false;
      setLeaveBusy(false);
    }
  }, [roomId, router, runOp]);

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
        title="Community Cards"
        subtitle="Ten permanent live tables"
        useAppViewportHeight
        infoPanel={infoPanel}
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-2">
          <div className="shrink-0">
            <label className="text-[11px] text-zinc-400" htmlFor="ov2-cc-name">
              Display name
            </label>
            <input
              id="ov2-cc-name"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
              placeholder="How others see you"
              autoComplete="nickname"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <p className="mb-2 text-center text-[11px] text-zinc-400">
              Pick a table level and size (5-max or 9-max). Tables keeps your seat on refresh until you leave or sit-out rules
              remove you.
            </p>
            <div className="flex flex-col gap-3">
              {OV2_CC_STAKE_TIERS.map(tier => {
                const ids = OV2_CC_ROOMS_BY_STAKE[tier];
                return (
                  <div key={tier} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                    <p className="mb-2 text-center text-xs font-bold text-zinc-200">{formatTierLabel(tier)} level</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-violet-500/35 bg-violet-950/25 py-3 text-sm font-bold text-violet-100 touch-manipulation"
                        onClick={() => {
                          persistName();
                          router.push(`/ov2-community-cards?room=${ids.max5}`);
                        }}
                      >
                        5-max
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-violet-500/35 bg-violet-950/25 py-3 text-sm font-bold text-violet-100 touch-manipulation"
                        onClick={() => {
                          persistName();
                          router.push(`/ov2-community-cards?room=${ids.max9}`);
                        }}
                      >
                        9-max
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </OnlineV2GamePageShell>
    );
  }

  if (!tableConfig) {
    return (
      <OnlineV2GamePageShell title="Community Cards" subtitle="Loading…" useAppViewportHeight infoPanel={infoPanel}>
        <div className="flex h-full items-center justify-center text-sm text-zinc-400">Loading table…</div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <OnlineV2GamePageShell
      title="Community Cards"
      subtitle={`Live · ${formatTierLabel(tableConfig.tablePrice)} · ${tableConfig.maxSeats}-max`}
      useAppViewportHeight
      infoPanel={infoPanel}
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
            onClick={() => router.push("/ov2-community-cards")}
            className={OV2_HUD_CHROME_BTN}
          >
            Tables
          </button>
          <button
            type="button"
            title="Leave table and return chips to vault when allowed"
            disabled={leaveBusy}
            onClick={() => void onLeaveTable()}
            className={`${OV2_HUD_CHROME_BTN} border-rose-500/35 bg-rose-950/30 text-rose-100 hover:border-rose-400/40 hover:bg-rose-950/45 disabled:opacity-45`}
          >
            {leaveBusy ? "…" : "Leave"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Ov2CcScreen
            roomId={roomId}
            engine={session.engine}
            viewerHoleCards={session.viewerHoleCards}
            tableConfig={tableConfig}
            participantKey={session.participantKey}
            displayName={displayName}
            onOperate={session.operate}
            operateBusy={session.operateBusy}
            operateSubmitStatus={session.operateSubmitStatus}
            loadError={session.loadError}
          />
        </div>
      </div>
    </OnlineV2GamePageShell>
  );
}
