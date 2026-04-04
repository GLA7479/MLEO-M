"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import { OV2_HUD_CHROME_BTN } from "../OnlineV2GameHudOverlays";
import Ov2CwScreen from "./Ov2CwScreen";
import { useOv2CwSession } from "../../../hooks/useOv2CwSession";
import {
  OV2_CW_PRODUCT_GAME_ID,
  OV2_CW_STAKE_TIERS,
  OV2_CW_ROOM_IDS_BY_STAKE,
} from "../../../lib/online-v2/color_wheel/ov2CwTableIds";
import Ov2WavePrivateRoomModal from "../Ov2WavePrivateRoomModal";
import { isOv2RoomIdQueryParam } from "../../../lib/online-v2/onlineV2GameRegistry";
import {
  OV2_SHARED_DISPLAY_NAME_KEY,
  readOv2SharedDisplayName,
  writeOv2SharedDisplayName,
} from "../../../lib/online-v2/ov2SharedDisplayName";
import { supabaseMP } from "../../../lib/supabaseClients";
import { useOv2FixedTableLobbySeatCounts, ov2CwSeatCountFromEngine } from "../../../hooks/useOv2FixedTableLobbySeatCounts";
import Ov2TablePickCardSeatBadge from "../Ov2TablePickCardSeatBadge";
import { ov2WavePrivateJoinCodeFromRoomRow } from "../../../lib/online-v2/wavePrivateRoomCode";

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

function fmtInfoAmount(n) {
  const x = Math.floor(Number(n) || 0);
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(2)}K`;
  return String(x);
}

function CwInfoPanelBody({ roomId, tableStakeUnits }) {
  const minP = Math.max(1, Math.floor(Number(tableStakeUnits) || 1));
  const maxP = Math.min(minP * 200, 10_000_000);

  return (
    <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
      <section>
        <p className="font-semibold text-zinc-100">Color Wheel</p>
        <p className="mt-0.5">
          Up to six seats share one live table. The first player to sit starts the place window; later rounds continue automatically after each result.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Phases</p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          <li>
            <span className="text-zinc-200">Waiting</span> — empty table; sit down to open the place window.
          </li>
          <li>
            <span className="text-zinc-200">Place plays</span> — timed window; amounts are debited from your vault when a play is accepted.
          </li>
          <li>
            <span className="text-zinc-200">Spinning</span> — shared wheel animation, server picks the result.
          </li>
          <li>
            <span className="text-zinc-200">Result</span> — wins credit your vault; then the next place window opens if seats stay filled.
          </li>
        </ul>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Play panel</p>
        {roomId ? (
          <p className="mt-0.5">
            This table: min play <span className="font-mono tabular-nums text-zinc-200">{fmtInfoAmount(minP)}</span>, max{" "}
            <span className="font-mono tabular-nums text-zinc-200">{fmtInfoAmount(maxP)}</span> per accepted play. Use −min, +min, and +4× to step the
            amount field.
          </p>
        ) : (
          <p className="mt-0.5">
            Min play is the table stake; max is 200× that stake (capped at 10,000,000). Open a table to see exact limits for that room.
          </p>
        )}
        <p className="mt-0.5">
          The chip row picks red/black, even/odd, low/high, group, column, or Number. G1–G3 / C1–C3 apply when Group or Column is selected (dimmed when not).
          The 0–36 grid is only for Number.
        </p>
        <p className="mt-0.5">
          European wheel 0–36, single green. Winning plays credit{" "}
          <span className="font-mono text-zinc-200">floor(stake × (1 + m))</span>: <span className="text-zinc-200">m = 35</span> on Number,{" "}
          <span className="text-zinc-200">m = 2</span> red/black/even/odd/low/high, <span className="text-zinc-200">m = 3</span> group/column.
        </p>
      </section>
    </div>
  );
}

/**
 * Live table chrome + `useOv2CwSession` — only mounted when `roomId` is a valid query room id,
 * so lobby/tier-picker never runs tick/interval `operate` traffic.
 */
function Ov2CwTableLive({ roomId, router, nameDraft, setNameDraft, persistName, tableStake, privateWaveJoinCode }) {
  const session = useOv2CwSession(roomId, tableStake);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveInFlightRef = useRef(false);
  const displayName = String(nameDraft || "").trim() || "Guest";
  const runCwOp = session.operate;

  const onLeaveTable = useCallback(async () => {
    if (leaveInFlightRef.current || !roomId) return;
    leaveInFlightRef.current = true;
    setLeaveBusy(true);
    try {
      const tryLeave = async () => {
        let r = await runCwOp("leave_seat", {});
        if (r?.skipped) {
          await new Promise(res => setTimeout(res, 220));
          r = await runCwOp("leave_seat", {});
        }
        return r;
      };
      let r = await tryLeave();
      let okLeave = r?.ok === true || r?.code === "not_seated";
      if (!okLeave && r?.code === "REVISION_CONFLICT") {
        await new Promise(res => setTimeout(res, 240));
        r = await tryLeave();
        okLeave = r?.ok === true || r?.code === "not_seated";
      }
      if (okLeave) {
        await router.replace("/ov2-color-wheel");
      }
    } finally {
      leaveInFlightRef.current = false;
      setLeaveBusy(false);
    }
  }, [roomId, router, runCwOp]);

  const infoPanel = useMemo(
    () => (
      <>
        <CwInfoPanelBody roomId={roomId} tableStakeUnits={tableStake} />
        <p className="mt-2 text-[11px] text-zinc-500">
          <button
            type="button"
            className="text-sky-300 underline"
            onClick={() => void session.reloadFromDb()}
          >
            Refresh state
          </button>
        </p>
      </>
    ),
    [roomId, tableStake, session.reloadFromDb],
  );

  return (
    <OnlineV2GamePageShell
      title="Color Wheel"
      subtitle={`Live · table ${formatTierLabel(tableStake)}`}
      useAppViewportHeight
      chromePreset="c21_flat"
      infoPanel={infoPanel}
      wavePrivateJoinCode={privateWaveJoinCode}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-1.5 overflow-hidden max-lg:gap-1 sm:gap-2">
        <div className="flex w-full min-w-0 shrink-0 flex-nowrap items-center gap-2 overflow-hidden px-2 py-1.5 max-lg:gap-1.5 max-lg:px-1.5 max-lg:py-1 sm:gap-2.5 sm:px-2.5 sm:py-2">
          <input
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={persistName}
            className="min-w-0 flex-1 basis-0 rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            placeholder="Display name"
          />
          <button
            type="button"
            title="Pick another table without leaving your seat"
            onClick={() => router.push("/ov2-color-wheel")}
            className={OV2_HUD_CHROME_BTN}
          >
            Tables
          </button>
          <button
            type="button"
            title="Vacate seat and return to table list"
            disabled={leaveBusy}
            onClick={() => void onLeaveTable()}
            className={`${OV2_HUD_CHROME_BTN} shrink-0 border-rose-500/35 bg-rose-950/35 text-rose-100 hover:border-rose-400/45 hover:bg-rose-950/50 disabled:opacity-45`}
          >
            {leaveBusy ? "…" : "Leave"}
          </button>
        </div>
        <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
          <Ov2CwScreen
            roomId={roomId}
            engine={session.engine}
            tableStakeUnits={tableStake}
            participantKey={session.participantKey}
            displayName={displayName}
            onOperate={session.operate}
            operateBusy={session.operateBusy}
            loadError={session.loadError}
            clockSkewMs={session.clockSkewMs}
          />
        </div>
      </div>
    </OnlineV2GamePageShell>
  );
}

export default function Ov2CwLiveShell() {
  const router = useRouter();
  const roomId = useMemo(() => parseRoomQuery(router), [router.isReady, router.query.room]);
  const [lobbyStep, setLobbyStep] = useState("category");
  const [tierPick, setTierPick] = useState(null);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [tableStake, setTableStake] = useState(10_000);
  const [cwRoomValidated, setCwRoomValidated] = useState(false);
  const [privateWaveJoinCode, setPrivateWaveJoinCode] = useState(null);
  const [nameDraft, setNameDraft] = useState(() =>
    typeof window === "undefined" ? "" : readOv2SharedDisplayName(),
  );

  const cwLobbyRoomIds = useMemo(
    () => OV2_CW_STAKE_TIERS.flatMap(t => [...OV2_CW_ROOM_IDS_BY_STAKE[t]]),
    [],
  );
  const cwLobbySeatCounts = useOv2FixedTableLobbySeatCounts(
    cwLobbyRoomIds,
    "ov2_color_wheel_live_state",
    (engine, _rid) => ov2CwSeatCountFromEngine(engine),
  );

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
      void router.replace("/ov2-color-wheel");
    }
  }, [router.isReady, router.query.room]);

  useEffect(() => {
    if (!roomId) {
      setCwRoomValidated(false);
      setPrivateWaveJoinCode(null);
      return;
    }
    if (!router.isReady) return;
    setCwRoomValidated(false);
    setPrivateWaveJoinCode(null);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabaseMP
        .from("ov2_rooms")
        .select("stake_per_seat, product_game_id, join_code, is_private, meta")
        .eq("id", roomId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        await router.replace("/ov2-color-wheel");
        return;
      }
      if (!data || String(data.product_game_id) !== OV2_CW_PRODUCT_GAME_ID) {
        await router.replace("/ov2-color-wheel");
        return;
      }
      if (data?.stake_per_seat != null) {
        setTableStake(Math.max(1, Math.floor(Number(data.stake_per_seat) || 1)));
      }
      setPrivateWaveJoinCode(ov2WavePrivateJoinCodeFromRoomRow(data));
      setCwRoomValidated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, router.isReady]);

  const persistName = () => {
    writeOv2SharedDisplayName(nameDraft);
  };

  const lobbyInfoPanel = useMemo(
    () => <CwInfoPanelBody roomId={null} tableStakeUnits={tableStake} />,
    [tableStake],
  );

  if (!roomId) {
    return (
      <OnlineV2GamePageShell
        title="Color Wheel"
        subtitle="Public tables · private rooms"
        useAppViewportHeight
        chromePreset="c21_flat"
        infoPanel={lobbyInfoPanel}
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-2">
          <Ov2WavePrivateRoomModal
            open={privateOpen}
            onClose={() => setPrivateOpen(false)}
            game="cw"
            routeBase="/ov2-color-wheel"
          />
          <div className="shrink-0">
            <label className="text-[11px] text-zinc-400" htmlFor="ov2-cw-name">
              Display name
            </label>
            <input
              id="ov2-cw-name"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
              placeholder="How others see you"
              autoComplete="nickname"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {lobbyStep === "tables" && tierPick != null ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className="text-[11px] font-semibold text-sky-300 touch-manipulation"
                  onClick={() => {
                    setLobbyStep("category");
                    setTierPick(null);
                  }}
                >
                  ← Back to levels
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {OV2_CW_ROOM_IDS_BY_STAKE[tierPick].map((id, idx) => (
                    <button
                      key={id}
                      type="button"
                      className="relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-500/35 bg-amber-950/25 px-2 py-3 text-sm font-bold text-amber-100 touch-manipulation active:scale-[0.99]"
                      onClick={() => {
                        persistName();
                        router.push(`/ov2-color-wheel?room=${id}`);
                      }}
                    >
                      <span>Table {idx + 1}</span>
                      <span className="text-[9px] font-normal text-amber-200/70">{formatTierLabel(tierPick)}</span>
                      <Ov2TablePickCardSeatBadge activity={cwLobbySeatCounts[id]} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {OV2_CW_STAKE_TIERS.map(tier => (
                  <button
                    key={tier}
                    type="button"
                    className="relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-500/35 bg-amber-950/25 px-2 py-3 text-sm font-bold text-amber-100 touch-manipulation active:scale-[0.99]"
                    onClick={() => {
                      persistName();
                      setTierPick(tier);
                      setLobbyStep("tables");
                    }}
                  >
                    <span>{formatTierLabel(tier)}</span>
                    <span className="text-[9px] font-normal text-amber-200/70">10 tables</span>
                  </button>
                ))}
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

  if (!cwRoomValidated) {
    return (
      <OnlineV2GamePageShell
        title="Color Wheel"
        subtitle="Loading…"
        useAppViewportHeight
        chromePreset="c21_flat"
        infoPanel={lobbyInfoPanel}
      >
        <div className="flex h-full items-center justify-center text-sm text-zinc-400">Loading table…</div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <Ov2CwTableLive
      roomId={roomId}
      router={router}
      nameDraft={nameDraft}
      setNameDraft={setNameDraft}
      persistName={persistName}
      tableStake={tableStake}
      privateWaveJoinCode={privateWaveJoinCode}
    />
  );
}
