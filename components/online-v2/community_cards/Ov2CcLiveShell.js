"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import { OV2_HUD_CHROME_BTN } from "../OnlineV2GameHudOverlays";
import Ov2CcScreen from "./Ov2CcScreen";
import { useOv2CcSession } from "../../../hooks/useOv2CcSession";
import {
  OV2_CC_ALL_ROOM_IDS,
  OV2_CC_PUBLIC_CATEGORIES,
  OV2_CC_ROOM_MAX_SEATS_BY_ID,
  resolveOv2CcTableConfigFromRoomRow,
} from "../../../lib/online-v2/community_cards/ov2CcTableIds";
import Ov2WavePrivateRoomModal, { formatOv2CcCategoryLabel } from "../Ov2WavePrivateRoomModal";
import { useOv2FixedTableLobbySeatCounts, ov2CcSeatCountFromEngine } from "../../../hooks/useOv2FixedTableLobbySeatCounts";
import Ov2TablePickCardSeatBadge from "../Ov2TablePickCardSeatBadge";
import { ov2WavePrivateJoinCodeFromRoomRow } from "../../../lib/online-v2/wavePrivateRoomCode";
import { isOv2RoomIdQueryParam } from "../../../lib/online-v2/onlineV2GameRegistry";
import {
  OV2_SHARED_DISPLAY_NAME_KEY,
  readOv2SharedDisplayName,
  writeOv2SharedDisplayName,
} from "../../../lib/online-v2/ov2SharedDisplayName";
import { supabaseMP } from "../../../lib/supabaseClients";

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

/**
 * Live table chrome + `useOv2CcSession` — only mounted after `roomId` is validated for this product,
 * so the lobby never runs CC tick / realtime subscriptions.
 */
function Ov2CcTableLive({ roomId, router, tableConfig, nameDraft, setNameDraft, persistName, privateWaveJoinCode }) {
  const session = useOv2CcSession(roomId);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveInFlightRef = useRef(false);
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

  const infoPanel = useMemo(() => <CcInfoPanelBody />, []);

  return (
    <OnlineV2GamePageShell
      title="Community Cards"
      subtitle={`Live · ${formatTierLabel(tableConfig.tablePrice)} · ${tableConfig.maxSeats}-max`}
      useAppViewportHeight
      chromePreset="cc_flat"
      infoPanel={infoPanel}
      wavePrivateJoinCode={privateWaveJoinCode}
    >
      <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden lg:gap-0.5">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-1 pt-0.5 lg:pb-0.5">
          <input
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={persistName}
            className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/55 px-2 py-1.5 text-[10px] text-white placeholder:text-zinc-600 sm:text-[11px]"
            placeholder="Display name"
          />
          <button
            type="button"
            title="Pick another table without leaving your seat"
            onClick={() => router.push("/ov2-community-cards")}
            className={`${OV2_HUD_CHROME_BTN} text-[10px] sm:text-xs`}
          >
            Tables
          </button>
          <button
            type="button"
            title="Leave table and return chips to vault when allowed"
            disabled={leaveBusy}
            onClick={() => void onLeaveTable()}
            className={`${OV2_HUD_CHROME_BTN} border-rose-500/30 bg-rose-950/25 text-rose-100/95 hover:border-rose-400/35 hover:bg-rose-950/40 disabled:opacity-45 text-[10px] sm:text-xs`}
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

export default function Ov2CcLiveShell() {
  const router = useRouter();
  const roomId = useMemo(() => parseRoomQuery(router), [router.isReady, router.query.room]);
  const [lobbyStep, setLobbyStep] = useState("category");
  const [catIndex, setCatIndex] = useState(null);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [tableConfig, setTableConfig] = useState(null);
  const [privateWaveJoinCode, setPrivateWaveJoinCode] = useState(null);
  const [nameDraft, setNameDraft] = useState(() =>
    typeof window === "undefined" ? "" : readOv2SharedDisplayName(),
  );

  const ccLobbySeatCounts = useOv2FixedTableLobbySeatCounts(
    OV2_CC_ALL_ROOM_IDS,
    "ov2_community_cards_live_state",
    (engine, rid) => ov2CcSeatCountFromEngine(engine, rid, OV2_CC_ROOM_MAX_SEATS_BY_ID),
  );

  const infoPanel = useMemo(() => <CcInfoPanelBody />, []);

  useEffect(() => {
    writeOv2SharedDisplayName(nameDraft);
  }, [nameDraft]);

  useEffect(() => {
    const onStorage = e => {
      if (e.key !== OV2_SHARED_DISPLAY_NAME_KEY || e.storageArea !== window.localStorage) return;
      setNameDraft(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.room;
    const raw = q == null ? "" : String(Array.isArray(q) ? q[0] : q).trim();
    if (raw && !isOv2RoomIdQueryParam(raw)) {
      void router.replace("/ov2-community-cards");
    }
  }, [router.isReady, router.query.room]);

  useEffect(() => {
    if (!roomId) {
      setTableConfig(null);
      setPrivateWaveJoinCode(null);
      return;
    }
    if (!router.isReady) return;
    setTableConfig(null);
    setPrivateWaveJoinCode(null);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabaseMP
        .from("ov2_rooms")
        .select("id, product_game_id, stake_per_seat, meta, join_code, is_private")
        .eq("id", roomId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        await router.replace("/ov2-community-cards");
        return;
      }
      const c = resolveOv2CcTableConfigFromRoomRow(data);
      if (!c) {
        await router.replace("/ov2-community-cards");
        return;
      }
      setPrivateWaveJoinCode(ov2WavePrivateJoinCodeFromRoomRow(data));
      setTableConfig(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, router.isReady]);

  const persistName = () => {
    writeOv2SharedDisplayName(nameDraft);
  };

  const selectedCat = catIndex != null ? OV2_CC_PUBLIC_CATEGORIES[catIndex] : null;

  if (!roomId) {
    return (
      <OnlineV2GamePageShell
        title="Community Cards"
        subtitle="Public tables · private rooms"
        useAppViewportHeight
        chromePreset="cc_flat"
        infoPanel={infoPanel}
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-2">
          <Ov2WavePrivateRoomModal
            open={privateOpen}
            onClose={() => setPrivateOpen(false)}
            game="cc"
            routeBase="/ov2-community-cards"
          />
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
            {lobbyStep === "tables" && selectedCat ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className="text-[11px] font-semibold text-sky-300 touch-manipulation"
                  onClick={() => {
                    setLobbyStep("category");
                    setCatIndex(null);
                  }}
                >
                  ← Back to categories
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedCat.roomIds.map((id, idx) => {
                    const is5 = selectedCat.maxSeats === 5;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-3 text-sm font-bold touch-manipulation active:scale-[0.99] ${
                          is5
                            ? "border-emerald-500/35 bg-emerald-950/25 text-emerald-100"
                            : "border-violet-500/35 bg-violet-950/25 text-violet-100"
                        }`}
                        onClick={() => {
                          persistName();
                          router.push(`/ov2-community-cards?room=${id}`);
                        }}
                      >
                        <span>Table {idx + 1}</span>
                        <span
                          className={`text-[9px] font-normal ${is5 ? "text-emerald-200/70" : "text-violet-200/70"}`}
                        >
                          {formatOv2CcCategoryLabel(selectedCat)}
                        </span>
                        <Ov2TablePickCardSeatBadge activity={ccLobbySeatCounts[id]} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {OV2_CC_PUBLIC_CATEGORIES.map((cat, idx) => {
                  const is5 = cat.maxSeats === 5;
                  return (
                    <button
                      key={`${cat.stake}-${cat.maxSeats}`}
                      type="button"
                      className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-3 text-sm font-bold touch-manipulation active:scale-[0.99] ${
                        is5
                          ? "border-emerald-500/35 bg-emerald-950/25 text-emerald-100"
                          : "border-violet-500/35 bg-violet-950/25 text-violet-100"
                      }`}
                      onClick={() => {
                        persistName();
                        setCatIndex(idx);
                        setLobbyStep("tables");
                      }}
                    >
                      <span>{formatOv2CcCategoryLabel(cat)}</span>
                      <span
                        className={`text-[9px] font-normal ${is5 ? "text-emerald-200/70" : "text-violet-200/70"}`}
                      >
                        10 tables
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm font-semibold text-zinc-100 touch-manipulation active:scale-[0.99]"
            onClick={() => setPrivateOpen(true)}
          >
            Private room
          </button>
        </div>
      </OnlineV2GamePageShell>
    );
  }

  if (!tableConfig) {
    return (
      <OnlineV2GamePageShell
        title="Community Cards"
        subtitle="Loading…"
        useAppViewportHeight
        chromePreset="cc_flat"
        infoPanel={infoPanel}
      >
        <div className="flex h-full items-center justify-center text-sm text-zinc-400">Loading table…</div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <Ov2CcTableLive
      roomId={roomId}
      router={router}
      tableConfig={tableConfig}
      nameDraft={nameDraft}
      setNameDraft={setNameDraft}
      persistName={persistName}
      privateWaveJoinCode={privateWaveJoinCode}
    />
  );
}
