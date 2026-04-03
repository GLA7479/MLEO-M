"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import { OV2_HUD_CHROME_BTN } from "../OnlineV2GameHudOverlays";
import Ov2C21Screen from "./Ov2C21Screen";
import { useOv2C21Session } from "../../../hooks/useOv2C21Session";
import { OV2_C21_STAKE_TIERS, OV2_C21_ROOM_ID_BY_STAKE } from "../../../lib/online-v2/c21/ov2C21TableIds";
import {
  OV2_C21_BETTING_MS,
  OV2_C21_BETWEEN_MS,
  OV2_C21_BETTING_PRE_LOCK_FREEZE_MS,
  OV2_C21_INSURANCE_MS,
  OV2_C21_TURN_MS,
} from "../../../lib/online-v2/c21/ov2C21ClientConstants";
import { isOv2RoomIdQueryParam } from "../../../lib/online-v2/onlineV2GameRegistry";
import {
  OV2_SHARED_DISPLAY_NAME_KEY,
  readOv2SharedDisplayName,
  writeOv2SharedDisplayName,
} from "../../../lib/online-v2/ov2SharedDisplayName";
import { supabaseMP } from "../../../lib/supabaseClients";
import { useOv2FixedTableLobbySeatCounts, ov2C21SeatCountFromEngine } from "../../../hooks/useOv2FixedTableLobbySeatCounts";
import Ov2TablePickCardSeatBadge from "../Ov2TablePickCardSeatBadge";

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

function secs(ms) {
  return Math.round(Number(ms) / 1000);
}

/** Full rules / UX copy — same structure as Ludo & Rummy 51 info panels. */
function C21InfoPanelBody() {
  const betS = secs(OV2_C21_BETTING_MS);
  const betweenS = secs(OV2_C21_BETWEEN_MS);
  const insS = secs(OV2_C21_INSURANCE_MS);
  const turnS = secs(OV2_C21_TURN_MS);
  return (
    <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
      <section>
        <p className="font-semibold text-zinc-100">Goal</p>
        <p className="mt-0.5">
          Beat the dealer&apos;s hand without going over <span className="text-zinc-200">21</span>. This is a shared live table:
          up to <span className="text-zinc-200">six</span> seats, one dealer shoe, rounds run on a server clock.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Tables &amp; stakes</p>
        <p className="mt-0.5">
          Five <span className="text-zinc-200">always-on</span> tables at fixed stake levels (100 · 1K · 10K · 100K · 1M). Each table
          has its own <span className="text-zinc-200">minimum play</span> equal to that stake. Your product vault must cover the
          table minimum to <span className="text-zinc-200">take a seat</span>.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Optional controls</p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          <li>
            <span className="text-zinc-200">Auto Next</span> — automatically joins the next round with the same selected bet
            until you turn it off, funds fail, or inactivity stops it.
          </li>
          <li>
            <span className="text-zinc-200">Auto Watch</span> — automatically opens the small player hand panel for the
            currently active other player; it hides on your own turn and you can turn it off anytime.
          </li>
        </ul>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">How to play</p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          <li>
            <span className="text-zinc-200">Spectate</span> without sitting, or tap an open seat to join (if your vault meets the
            minimum).
          </li>
          <li>
            Set your <span className="text-zinc-200">display name</span> on the lobby or at the table; others see it on your seat.
          </li>
          <li>
            <span className="text-zinc-200">Tables</span> returns to the stake picker <strong>without</strong> vacating your seat.{" "}
            <span className="text-zinc-200">Leave</span> vacates your seat and returns to the lobby.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">Betting</span> (~{betS}s): choose an amount between the table minimum
            and the server cap, then <span className="text-zinc-200">Play</span>. The server debits your vault when the commit
            succeeds; until then you are not in the upcoming deal.
          </li>
          <li>
            After the deal, if the dealer shows an ace you may get a short{" "}
            <span className="text-zinc-200">side cover</span> window (~{insS}s): accept costs half your main play (server debit);
            decline is free.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">Your turn</span> (~{turnS}s each):{" "}
            <span className="text-zinc-200">Hit</span>, <span className="text-zinc-200">Stand</span>,{" "}
            <span className="text-zinc-200">Double</span> (one extra card, double stake),{" "}
            <span className="text-zinc-200">Split</span> matching ranks once (extra stake), or{" "}
            <span className="text-zinc-200">Surrender</span> where rules allow (refund half). Illegal moves are rejected by the server.
          </li>
          <li>
            The dealer reveals hidden cards and draws by fixed rules; then the round settles. A short{" "}
            <span className="text-zinc-200">between-rounds</span> pause (~{betweenS}s) follows before the next betting window.
          </li>
        </ul>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">House row &amp; timer</p>
        <p className="mt-0.5">
          <span className="text-zinc-200">House</span> shows the dealer&apos;s cards. The large number on the same header line is
          seconds left: betting window, side-cover window, current player&apos;s turn, or pause between rounds — whichever applies.
          Your <span className="text-zinc-200">Total</span> sits in the center of that line; your main play amount appears on the
          right only after a successful commit (or during the round for your active stake).
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Outcomes</p>
        <p className="mt-0.5">
          Closest to <span className="text-zinc-200">21</span> without busting wins against the dealer; over <span className="text-zinc-200">21</span>{" "}
          is a bust. A two-card <span className="text-zinc-200">natural 21</span> pays better than a regular win when the dealer does
          not also have natural 21. Ties can push (stake returned per server rules). Each split hand is settled separately.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Stake, vault &amp; payout</p>
        <p className="mt-0.5">
          All debits and refunds run through the <span className="text-zinc-200">server</span> (commit, double, split, side cover,
          payouts, surrender refund). Settlement credits every winner&apos;s vault from the server; your on-screen vault should
          refresh after successful actions without reloading the page (product vault adapter enabled).
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">AFK &amp; seat loss</p>
        <p className="mt-0.5">
          <span className="text-zinc-200">Two</span> consecutive rounds where you do not put up at least the table minimum (after
          betting closes) clears your seat. Browsing other tables with <span className="text-zinc-200">Tables</span> does{" "}
          <strong>not</strong> count as missing a round.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Leave &amp; reconnect</p>
        <p className="mt-0.5">
          Mid-round leave follows server rules (hands may be forfeited; settlement may still run for others). Refreshing the page
          or coming back with the same browser keeps your <span className="text-zinc-200">participant id</span> and usually your
          seat until you leave or miss two rounds.
        </p>
      </section>
      <section>
        <p className="font-semibold text-zinc-100">Important</p>
        <p className="mt-0.5">
          Card dealing, timers, legal moves, and money are <span className="text-zinc-200">authoritative on the server</span>. The UI
          only reflects engine state from the API and live updates.
        </p>
      </section>
    </div>
  );
}

export default function Ov2C21LiveShell() {
  const router = useRouter();
  const roomId = useMemo(() => parseRoomQuery(router), [router.isReady, router.query.room]);
  const [tableStake, setTableStake] = useState(10_000);
  const [nameDraft, setNameDraft] = useState(() =>
    typeof window === "undefined" ? "" : readOv2SharedDisplayName(),
  );
  const [autoWatchEnabled, setAutoWatchEnabled] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveInFlightRef = useRef(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const session = useOv2C21Session(roomId, tableStake);

  const c21LobbyRoomIds = useMemo(() => Object.values(OV2_C21_ROOM_ID_BY_STAKE), []);
  const c21LobbySeatCounts = useOv2FixedTableLobbySeatCounts(
    c21LobbyRoomIds,
    "ov2_c21_live_state",
    (engine, _rid) => ov2C21SeatCountFromEngine(engine),
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const bettingPreRoundFreezeActive = useMemo(() => {
    const eng = session.engine;
    if (!eng || eng.phase !== "betting") return false;
    const raw = eng.phaseEndsAt;
    const end =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : Number.isFinite(Date.parse(String(raw || "")))
          ? Date.parse(String(raw))
          : 0;
    if (end <= 0) return false;
    return nowTick >= end - OV2_C21_BETTING_PRE_LOCK_FREEZE_MS;
  }, [session.engine, nowTick]);

  const infoPanel = useMemo(
    () => (
      <>
        <C21InfoPanelBody />
        <p className="mt-2 text-[11px] text-zinc-500">
          {roomId ? (
            <button
              type="button"
              className="text-sky-300 underline"
              onClick={() => void session.reloadFromDb()}
            >
              Refresh state
            </button>
          ) : null}
        </p>
      </>
    ),
    [roomId, session.reloadFromDb],
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
    writeOv2SharedDisplayName(nameDraft);
  };

  if (!roomId) {
    return (
      <OnlineV2GamePageShell
        title="21 Challenge"
        subtitle="Five permanent live tables"
        useAppViewportHeight
        infoPanel={infoPanel}
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OV2_C21_STAKE_TIERS.map(tier => {
                const id = OV2_C21_ROOM_ID_BY_STAKE[tier];
                return (
                  <button
                    key={tier}
                    type="button"
                    className="relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-2 py-3 text-sm font-bold text-emerald-100 touch-manipulation active:scale-[0.99]"
                    onClick={() => {
                      persistName();
                      router.push(`/ov2-21-challenge?room=${id}`);
                    }}
                  >
                    <span>{formatTierLabel(tier)}</span>
                    <span className="text-[9px] font-normal text-emerald-200/70">Table level {formatTierLabel(tier)}</span>
                    <Ov2TablePickCardSeatBadge activity={c21LobbySeatCounts[id]} />
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
        infoPanel={infoPanel}
      >
      <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden">
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden sm:gap-2">
          <input
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={persistName}
            className="min-w-0 flex-1 basis-0 rounded-lg border border-white/12 bg-black/35 px-2 py-1.5 text-[11px] text-white"
            placeholder="Display name"
          />
          <button
            type="button"
            role="switch"
            aria-checked={autoWatchEnabled}
            title="Open the small hand panel for whoever is acting (not you); hides on your turn."
            onClick={() => setAutoWatchEnabled(v => !v)}
            style={{ WebkitTapHighlightColor: "rgba(52, 211, 153, 0.35)" }}
            className={`relative z-10 inline-flex h-9 min-w-[6.2rem] shrink-0 touch-manipulation select-none items-center justify-center gap-0.5 rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap transition-all duration-150 ease-out sm:h-9 sm:min-w-[6.85rem] sm:px-2.5 sm:text-[11px] lg:h-8 lg:min-h-[32px] lg:px-2.5 lg:text-[11px] ${
              autoWatchEnabled
                ? "border-emerald-400/60 bg-emerald-800/55 text-emerald-50 shadow-[inset_0_0_22px_rgba(52,211,153,0.35),inset_0_0_0_1px_rgba(167,243,208,0.45)] hover:border-emerald-300/70 hover:bg-emerald-700/50 hover:shadow-[inset_0_0_28px_rgba(52,211,153,0.42)] active:scale-[0.97] active:border-emerald-100/50 active:bg-emerald-500/50 active:text-white active:shadow-[inset_0_0_40px_rgba(190,242,100,0.45),inset_0_0_0_2px_rgba(236,253,245,0.65)]"
                : "border-white/22 bg-white/[0.1] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_0_14px_rgba(255,255,255,0.05)] hover:border-white/32 hover:bg-white/[0.15] active:scale-[0.97] active:border-white/45 active:bg-white/[0.32] active:text-white active:shadow-[inset_0_0_28px_rgba(255,255,255,0.2),inset_0_0_0_1px_rgba(255,255,255,0.35)]"
            }`}
          >
            {autoWatchEnabled ? (
              <span className="text-emerald-300" aria-hidden>
                ✓
              </span>
            ) : null}
            <span>Auto watch</span>
          </button>
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
            title={
              bettingPreRoundFreezeActive
                ? "Round about to start — Leave is paused briefly"
                : "Vacate seat and return to table list"
            }
            disabled={leaveBusy || bettingPreRoundFreezeActive}
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
            autoWatchEnabled={autoWatchEnabled}
          />
        </div>
      </div>
    </OnlineV2GamePageShell>
  );
}
