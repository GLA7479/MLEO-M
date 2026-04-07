"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  FH_GRID_SIZE,
  FH_SHIP_LENGTHS,
  fhOccupiedKeys,
  fhRemainingLengths,
  fhShotAt,
  fhShotKindLabel,
  fhTryPlaceShip,
} from "../../../lib/online-v2/fleethunt/ov2FleetHuntBoard";
import { useOv2FleetHuntSession } from "../../../hooks/useOv2FleetHuntSession";

const finishDismissStorageKey = sid => `ov2_fh_finish_dismiss_${sid}`;

/** Delay after turn change before auto-follow switches boards (lets hit/miss/sunk read). */
const OV2_FH_AUTO_FOLLOW_DELAY_MS = 1100;

const LOADING_TIMEOUT_MS = 8000;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** Consistent Fleet Hunt chrome icons (unicode; no extra deps). */
const I = {
  fleet: "⚓",
  radar: "◎",
  target: "🎯",
  hit: "●",
  sunk: "⊗",
  miss: "○",
  timer: "⏱",
  lock: "🔒",
  double: "✦",
  trophy: "🏆",
  cross: "✕",
  shipsRow: "⛴",
};

/** @param {unknown} m */
function memberRematchRequested(m) {
  const meta = m?.meta;
  if (!meta || typeof meta !== "object") return false;
  const fh = /** @type {Record<string, unknown>} */ (meta).fh;
  if (!fh || typeof fh !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (fh).rematch_requested;
  return r === true || r === "true" || r === 1;
}

/** @param {unknown[]} shots */
function shotLookup(shots, r, c) {
  if (!Array.isArray(shots)) return null;
  return (
    shots.find(s => s && typeof s === "object" && Math.floor(Number(s.r)) === r && Math.floor(Number(s.c)) === c) || null
  );
}

/**
 * Classify each ship cell for hull styling (straight ships only; presentation).
 * @param {unknown} shipsCells
 * @returns {Map<string, { kind: "single" } | { kind: "h" | "v", part: string }>}
 */
function buildShipSegmentMap(shipsCells) {
  const map = new Map();
  if (!Array.isArray(shipsCells)) return map;
  for (const ship of shipsCells) {
    if (!ship || typeof ship !== "object" || !Array.isArray(ship.cells) || ship.cells.length === 0) continue;
    const cells = ship.cells.map(cell => {
      if (!cell || typeof cell !== "object") return null;
      return { r: Math.floor(Number(cell.r)), c: Math.floor(Number(cell.c)) };
    }).filter(x => x != null);
    const L = cells.length;
    if (L === 0) continue;
    if (L === 1) {
      map.set(`${cells[0].r},${cells[0].c}`, { kind: "single" });
      continue;
    }
    const allSameRow = cells.every(x => x.r === cells[0].r);
    if (allSameRow) {
      cells.sort((a, b) => a.c - b.c);
      cells.forEach((cell, i) => {
        const part = i === 0 ? "left" : i === L - 1 ? "right" : "mid";
        map.set(`${cell.r},${cell.c}`, { kind: "h", part });
      });
    } else {
      cells.sort((a, b) => a.r - b.r);
      cells.forEach((cell, i) => {
        const part = i === 0 ? "top" : i === L - 1 ? "bottom" : "mid";
        map.set(`${cell.r},${cell.c}`, { kind: "v", part });
      });
    }
  }
  return map;
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2FleetHuntScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2FleetHuntSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    submitPlacement,
    randomPlacement,
    lockPlacement,
    fireShot,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;

  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const [orientationH, setOrientationH] = useState(true);
  const [pickLen, setPickLen] = useState(/** @type {number|null} */ (null));
  const [draftShips, setDraftShips] = useState(/** @type {{ cells: { r: number, c: number }[] }[]} */ ([]));
  const [mobileBattleTab, setMobileBattleTab] = useState(/** @type {"offense" | "defense"} */ ("offense"));
  const [desktopBattleMode, setDesktopBattleMode] = useState(/** @type {"split" | "offense" | "defense"} */ ("split"));
  /** When ON, switch visible board on turn change only (local UX; default OFF). */
  const [autoFollowTurn, setAutoFollowTurn] = useState(false);
  const [loadingError, setLoadingError] = useState(false);
  const prevBattleTurnSeatRef = useRef(/** @type {number|null} */ (null));
  const autoFollowTimeoutRef = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null));
  const desktopBattleModeRef = useRef(desktopBattleMode);
  desktopBattleModeRef.current = desktopBattleMode;

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  useEffect(() => {
    if (vm.sessionId) return;

    setLoadingError(false);

    const t = setTimeout(() => {
      setLoadingError(true);
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(t);
  }, [vm?.sessionId]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
    setDraftShips([]);
    setPickLen(null);
  }, [vm.sessionId]);

  useEffect(() => {
    if (vm.phase === "battle") {
      setMobileBattleTab("offense");
      setDesktopBattleMode("split");
      prevBattleTurnSeatRef.current = null;
    }
  }, [vm.phase, vm.sessionId]);

  useEffect(() => {
    if (vm.phase !== "placement") return;
    if (!snapshot?.myShips || snapshot.myShips.length !== 5) return;
    setDraftShips(snapshot.myShips.map(s => ({ cells: [...(s.cells || [])] })));
  }, [vm.phase, snapshot?.revision, snapshot?.myShips]);

  const onRematch = useCallback(async () => {
    if (!roomId || rematchBusy) return;
    setRematchBusy(true);
    setErr("");
    try {
      const r = await requestRematch();
      if (!r.ok) setErr(r.error || "Rematch request failed");
    } finally {
      setRematchBusy(false);
    }
  }, [roomId, rematchBusy, requestRematch, setErr]);

  const onStartNext = useCallback(async () => {
    if (!roomId || !isHost || startNextBusy) return;
    setStartNextBusy(true);
    setErr("");
    try {
      const r = await startNextMatch(roomMatchSeq);
      if (!r.ok) {
        setErr(r.error || "Could not start next match");
        return;
      }
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
        } catch {
          /* ignore */
        }
      }
      if (typeof onSessionRefresh === "function") {
        const prev = snapshot?.sessionId != null ? String(snapshot.sessionId) : "";
        await onSessionRefresh(prev, "", { expectClearedSession: true });
      }
      await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
    } finally {
      setStartNextBusy(false);
    }
  }, [
    roomId,
    isHost,
    startNextBusy,
    startNextMatch,
    roomMatchSeq,
    onSessionRefresh,
    snapshot?.sessionId,
    router,
    setErr,
  ]);

  const onExitToLobby = useCallback(async () => {
    if (!roomId || !pk || exitBusy) return;
    setExitBusy(true);
    setExitErr("");
    try {
      await leaveOv2RoomWithForfeitRetry({ room, room_id: roomId, participant_key: pk });
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
        } catch {
          /* ignore */
        }
      }
      await router.push("/online-v2/rooms");
    } catch (e) {
      setExitErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setExitBusy(false);
    }
  }, [roomId, pk, exitBusy, room, router]);

  const rematchCounts = useMemo(() => {
    let ready = 0;
    let seated = 0;
    for (const m of members) {
      if (m?.seat_index == null || m?.seat_index === "") continue;
      seated += 1;
      if (String(m?.wallet_state || "").trim() !== "committed") continue;
      if (memberRematchRequested(m)) ready += 1;
    }
    return { ready, seated };
  }, [members]);

  const finished = vm.phase === "finished";
  const finishSessionId = finished ? String(vm.sessionId || "").trim() : "";
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

  const mySeat = vm.mySeat;
  const oppSeat = mySeat === 0 ? 1 : mySeat === 1 ? 0 : null;

  useEffect(() => {
    const clearAutoFollowTimer = () => {
      if (autoFollowTimeoutRef.current != null) {
        clearTimeout(autoFollowTimeoutRef.current);
        autoFollowTimeoutRef.current = null;
      }
    };

    if (vm.phase !== "battle") {
      clearAutoFollowTimer();
      prevBattleTurnSeatRef.current = null;
      return;
    }
    if (mySeat !== 0 && mySeat !== 1) {
      clearAutoFollowTimer();
      return;
    }
    const ts = vm.turnSeat;
    if (ts !== 0 && ts !== 1) {
      clearAutoFollowTimer();
      prevBattleTurnSeatRef.current = null;
      return;
    }

    const prev = prevBattleTurnSeatRef.current;
    const changed = prev !== null && prev !== ts;
    prevBattleTurnSeatRef.current = ts;

    if (!autoFollowTurn || !changed) {
      if (!autoFollowTurn) clearAutoFollowTimer();
      return;
    }

    clearAutoFollowTimer();
    autoFollowTimeoutRef.current = setTimeout(() => {
      autoFollowTimeoutRef.current = null;
      if (ts === mySeat) {
        setMobileBattleTab("offense");
        if (desktopBattleModeRef.current !== "split") {
          setDesktopBattleMode("offense");
        }
      } else {
        setMobileBattleTab("defense");
        if (desktopBattleModeRef.current !== "split") {
          setDesktopBattleMode("defense");
        }
      }
    }, OV2_FH_AUTO_FOLLOW_DELAY_MS);

    return () => clearAutoFollowTimer();
  }, [vm.phase, vm.turnSeat, mySeat, autoFollowTurn]);
  const myOutgoing = mySeat === 0 ? vm.shots0 : mySeat === 1 ? vm.shots1 : [];
  const incomingOnMe = mySeat === 0 ? vm.shots1 : mySeat === 1 ? vm.shots0 : [];

  const myLocked = mySeat === 0 ? vm.lock0 : mySeat === 1 ? vm.lock1 : false;
  const oppLocked = mySeat === 0 ? vm.lock1 : mySeat === 1 ? vm.lock0 : false;

  const remaining = useMemo(() => fhRemainingLengths(draftShips.map(s => s.cells)), [draftShips]);
  const activePickLen = pickLen != null && remaining.includes(pickLen) ? pickLen : remaining[0] ?? null;

  const onPlacementCell = useCallback(
    (r, c) => {
      if (vm.phase !== "placement" || myLocked || busy || activePickLen == null) return;
      setDraftShips(prev => {
        const occ = fhOccupiedKeys(prev.map(s => s.cells));
        const cells = fhTryPlaceShip(occ, activePickLen, r, c, orientationH);
        if (!cells) return prev;
        return [...prev, { cells }];
      });
      setPickLen(null);
    },
    [vm.phase, myLocked, busy, activePickLen, orientationH]
  );

  const onTargetCell = useCallback(
    (r, c) => {
      if (vm.phase !== "battle" || busy || mySeat == null || oppSeat == null) return;
      if (vm.pendingDouble) return;
      if (vm.turnSeat !== mySeat) return;
      if (fhShotAt(myOutgoing, r, c)) return;
      void fireShot(r, c);
    },
    [vm.phase, vm.pendingDouble, vm.turnSeat, mySeat, oppSeat, myOutgoing, busy, fireShot]
  );

  const dismissFinishModal = useCallback(() => {
    if (!finishSessionId) return;
    setFinishModalDismissedSessionId(finishSessionId);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
      } catch {
        /* ignore */
      }
    }
  }, [finishSessionId]);

  const finishResultObj =
    vm.result && typeof vm.result === "object" ? /** @type {Record<string, unknown>} */ (vm.result) : null;
  const finishIsDraw = Boolean(finishResultObj?.draw);
  const finishOutcome =
    finishIsDraw
      ? "draw"
      : vm.winnerSeat != null && mySeat != null
        ? vm.winnerSeat === mySeat
          ? "win"
          : "loss"
        : "unknown";
  const finishHeadline =
    finishOutcome === "win" ? "Victory" : finishOutcome === "loss" ? "Defeat" : finishIsDraw ? "Draw" : "Match over";

  /** Net vault-style settlement from `parity_state.__result__` (see Fleet Hunt migrations). */
  const finishSettlement = useMemo(() => {
    const r = finishResultObj;
    const lossPer = r != null && r.lossPerSeat != null ? Number(r.lossPerSeat) : NaN;
    const refundPer = r != null && r.refundPerSeat != null ? Number(r.refundPerSeat) : NaN;
    if (finishIsDraw) {
      return {
        kind: "draw",
        youText: "+0",
        oppText: "+0",
        refundPerSeat: Number.isFinite(refundPer) && refundPer >= 0 ? Math.round(refundPer) : null,
      };
    }
    if ((finishOutcome === "win" || finishOutcome === "loss") && Number.isFinite(lossPer) && lossPer >= 0) {
      const n = Math.round(lossPer);
      const youWin = finishOutcome === "win";
      return {
        kind: "decisive",
        youText: youWin ? `+${n}` : `-${n}`,
        oppText: youWin ? `-${n}` : `+${n}`,
      };
    }
    return null;
  }, [finishResultObj, finishIsDraw, finishOutcome]);

  const pd = vm.pendingDouble && typeof vm.pendingDouble === "object" ? /** @type {Record<string, unknown>} */ (vm.pendingDouble) : null;
  const responderSeat = pd != null && pd.responder_seat != null ? Number(pd.responder_seat) : null;
  const proposedMult = pd != null && pd.proposed_mult != null ? Number(pd.proposed_mult) : null;

  const canOfferDouble =
    vm.phase === "battle" &&
    !pd &&
    vm.turnSeat === mySeat &&
    vm.doublesAccepted < 4 &&
    vm.stakeMultiplier < 16;

  const sunkEnemyCount = useMemo(
    () => myOutgoing.filter(s => s && String(s.k || "").toLowerCase() === "sunk").length,
    [myOutgoing]
  );

  /** Smaller board cap on desktop when only one board is shown (offense or defense tab). */
  const boardDesktopCompact = desktopBattleMode !== "split";

  /**
   * @param {"offense"|"defense"} mode
   * @param {{ onCell?: ((r: number, c: number) => void) | null, shipsCells?: unknown, outgoing?: unknown[], incoming?: unknown[], dim?: boolean, gridClassName?: string, lockedOverlay?: boolean, showAxisLabels?: boolean, sizeCompact?: boolean, tacticalFrame?: null | "offense" | "defense" }} opts
   */
  const renderGrid = (
    mode,
    {
      onCell,
      shipsCells,
      outgoing,
      incoming,
      dim,
      gridClassName = "",
      lockedOverlay = false,
      showAxisLabels = true,
      sizeCompact = false,
      /** @type {null | "offense" | "defense"} */
      tacticalFrame = null,
    }
  ) => {
    const shipSet = new Set();
    if (Array.isArray(shipsCells)) {
      for (const cells of shipsCells) {
        for (const cell of cells) {
          shipSet.add(`${cell.r},${cell.c}`);
        }
      }
    }
    const shipSegMap = mode === "defense" && Array.isArray(shipsCells) ? buildShipSegmentMap(shipsCells) : null;

    const cells = Array.from({ length: FH_GRID_SIZE * FH_GRID_SIZE }, (_, i) => {
      const r = Math.floor(i / FH_GRID_SIZE);
      const c = i % FH_GRID_SIZE;
      const key = `${r},${c}`;
      const hasShip = shipSet.has(key);
      const out = shotLookup(outgoing, r, c);
      const inc = shotLookup(incoming, r, c);
      const isHit = Boolean(hasShip && inc);
      const clickable = Boolean(onCell) && !dim;
      const incK = inc && typeof inc === "object" && inc.k != null ? String(inc.k).toLowerCase() : "";
      const outK = out && typeof out === "object" && out.k != null ? String(out.k).toLowerCase() : "";
      const seg = shipSegMap?.get(key);

      /** Hull styling: defense board ship cells (connected vessel read). */
      let hullClass = "";
      if (mode === "defense" && hasShip && !outK && !inc) {
        hullClass = [
          "border border-slate-500/50 bg-gradient-to-b from-slate-500/85 to-slate-900/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-3px_6px_rgba(0,0,0,0.45)]",
          "before:pointer-events-none before:absolute before:inset-x-[2px] before:top-[3px] before:h-[1.5px] before:bg-white/22 before:content-['']",
          seg?.kind === "single" && "rounded-[4px]",
          seg?.kind === "h" && seg.part === "left" && "rounded-l-[5px] rounded-r-none",
          seg?.kind === "h" && seg.part === "right" && "rounded-r-[5px] rounded-l-none",
          seg?.kind === "h" && seg.part === "mid" && "rounded-none",
          seg?.kind === "v" && seg.part === "top" && "rounded-t-[5px] rounded-b-none",
          seg?.kind === "v" && seg.part === "bottom" && "rounded-b-[5px] rounded-t-none",
          seg?.kind === "v" && seg.part === "mid" && "rounded-none",
        ]
          .filter(Boolean)
          .join(" ");
      } else if (mode === "defense" && hasShip && (inc || outK)) {
        hullClass =
          "rounded-[3px] border border-slate-500/35 bg-gradient-to-b from-slate-600/50 to-slate-800/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
      }

      const baseCell = [
        "relative aspect-square min-h-0 min-w-0 text-[8px] font-bold transition-[box-shadow,opacity,background-color] duration-150 outline-none outline-offset-0",
        hullClass ||
          (mode === "defense" && !hasShip ? "rounded-[3px] border border-slate-700/50 bg-slate-950/80" : "") ||
          (mode === "offense" && !out ? "rounded-[3px] border border-slate-700/45 bg-slate-950/78" : ""),
        outK === "miss" ? "border-sky-800/40 bg-sky-950/88 !shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]" : "",
        outK === "hit" || outK === "sunk" ? "border-rose-800/45 bg-rose-950/90 !shadow-[inset_0_0_0_1px_rgba(251,113,133,0.15)]" : "",
        inc && !hasShip ? "border-sky-600/30 bg-sky-950/75 !shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]" : "",
        isHit ? "!shadow-[inset_0_0_0_2px_rgba(251,191,36,0.35)]" : "",
        clickable
          ? "cursor-pointer hover:z-[1] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.28)] focus-visible:z-[1] focus-visible:shadow-[inset_0_0_0_2px_rgba(34,211,238,0.45)] active:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)] active:brightness-[0.97]"
          : "cursor-default",
        dim || !clickable ? "opacity-[0.88]" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <button
          key={key}
          type="button"
          disabled={!clickable}
          onClick={() => onCell && onCell(r, c)}
          className={baseCell}
        >
          {out ? <span className="sr-only">{fhShotKindLabel(out.k)}</span> : null}
          {mode === "defense" && inc && !hasShip ? (
            <span
              className="absolute inset-0 flex items-center justify-center text-[13px] leading-none text-sky-200/95 sm:text-[15px]"
              aria-hidden
            >
              {I.miss}
            </span>
          ) : null}
          {mode === "defense" && inc && hasShip ? (
            <span
              className="absolute inset-0 flex items-center justify-center text-[14px] leading-none text-rose-50/95 sm:text-[16px]"
              aria-hidden
            >
              {incK === "sunk" ? I.sunk : I.hit}
            </span>
          ) : null}
          {mode === "offense" && out ? (
            <span
              className="absolute inset-0 flex items-center justify-center text-[14px] leading-none text-sky-50/95 sm:text-[16px]"
              aria-hidden
            >
              {outK === "miss" ? I.miss : outK === "sunk" ? I.sunk : I.hit}
            </span>
          ) : null}
        </button>
      );
    });

    const coreGrid = (
      <div
        className={[
          "grid aspect-square w-full min-w-0 gap-0.5",
          tacticalFrame === "offense"
            ? "rounded-sm shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22),inset_0_0_12px_rgba(34,211,238,0.06)]"
            : tacticalFrame === "defense"
              ? "rounded-sm shadow-[inset_0_0_0_1px_rgba(52,211,153,0.2),inset_0_0_12px_rgba(16,185,129,0.05)]"
              : "",
          sizeCompact
            ? "max-w-[min(100%,min(17rem,50dvh))] sm:max-w-[min(100%,min(24rem,58dvh))] max-sm:mx-auto max-sm:w-[min(96vw,min(44dvh,320px))] max-sm:max-w-none"
            : "max-w-[min(100%,22rem)] sm:max-w-[min(100%,26rem)] max-sm:mx-auto max-sm:w-[min(96vw,min(48dvh,340px))] max-sm:max-w-none",
          gridClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ gridTemplateColumns: `repeat(${FH_GRID_SIZE}, minmax(0, 1fr))` }}
      >
        {cells}
      </div>
    );

    const lockLayer = lockedOverlay ? (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-zinc-950/55 backdrop-blur-[1px]">
        <span className="rounded-full border border-white/10 bg-zinc-950/80 px-2 py-1 text-[11px] text-zinc-200 shadow-lg">
          {I.lock} Locked
        </span>
      </div>
    ) : null;

    if (!showAxisLabels) {
      return (
        <div className="relative w-full">
          {coreGrid}
          {lockLayer}
        </div>
      );
    }

    return (
      <div
        className={[
          "relative w-full max-sm:mx-auto",
          sizeCompact
            ? "max-sm:max-w-[min(100%,min(19rem,54dvh))] sm:max-w-[min(100%,calc(min(24rem,58dvh)+1.5rem))]"
            : "max-sm:max-w-[min(100%,min(26rem,50dvh))] sm:max-w-[min(100%,calc(26rem+1.5rem))]",
        ].join(" ")}
      >
        <div className="flex w-full flex-row items-stretch gap-0.5">
          <div
            className="hidden w-[1.125rem] shrink-0 grid-rows-10 gap-0.5 self-stretch py-[2px] sm:grid sm:w-5"
            aria-hidden
          >
            {Array.from({ length: FH_GRID_SIZE }, (_, r) => (
              <div
                key={`axis-r-${r}`}
                className="flex items-center justify-end pr-0.5 text-[7px] font-medium tabular-nums leading-none text-zinc-500 sm:text-[8px]"
              >
                {r + 1}
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-0.5 hidden justify-between gap-0.5 px-0.5 sm:flex" aria-hidden>
              {Array.from({ length: FH_GRID_SIZE }, (_, c) => (
                <div
                  key={`axis-c-${c}`}
                  className="min-w-0 flex-1 text-center text-[7px] font-medium tabular-nums text-zinc-500 sm:text-[8px]"
                >
                  {c + 1}
                </div>
              ))}
            </div>
            {coreGrid}
          </div>
        </div>
        {lockLayer}
      </div>
    );
  };

  const saveDisabled =
    busy || vm.phase !== "placement" || myLocked || remaining.length > 0 || draftShips.length !== 5;
  const lockDisabled = busy || vm.phase !== "placement" || myLocked;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden px-1.5 pt-1 max-sm:min-h-0 max-sm:flex-1 max-sm:pb-0 sm:gap-2 sm:overflow-y-auto sm:pb-3 sm:pt-1 md:gap-3 md:px-2">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden sm:min-h-0 sm:gap-2 sm:overflow-y-auto md:gap-3">
      {err ? <div className="rounded-lg border border-red-500/30 bg-red-950/35 px-2 py-1.5 text-[11px] text-red-100">{err}</div> : null}
      {vaultClaimBusy ? (
        <div className="rounded-lg border border-sky-500/25 bg-sky-950/25 px-2 py-1 text-[10px] text-sky-100/90">Updating vault…</div>
      ) : null}

      {vm.phase === "placement" && mySeat != null ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-1.5 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-950/50 p-1.5 max-sm:py-1.5 sm:space-y-2 sm:p-3">
          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] text-zinc-300 sm:text-[11px]">
            <span className="font-medium">
              {I.fleet} Placement — {myLocked ? `${I.lock} Locked` : "Arrange your fleet"}
              {vm.placementTimeLeftSec != null && !myLocked ? (
                <span className="ml-1.5 text-amber-200/90 sm:ml-2">
                  {I.timer} {vm.placementTimeLeftSec}s
                </span>
              ) : null}
            </span>
            <span className="text-zinc-500">
              Opp {oppLocked ? `${I.lock} locked` : "open"} · miss {vm.placementMissStreakBySeat[oppSeat ?? 0] ?? 0}/3
            </span>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-1 rounded-lg border border-white/[0.05] bg-zinc-950/40 px-1.5 py-1 text-[9px] text-zinc-400 sm:text-[10px]">
            <span className="inline-flex items-center gap-0.5 rounded-md border border-zinc-600/35 bg-zinc-900/50 px-1.5 py-0.5 text-zinc-300">
              {I.shipsRow} Ships left: {remaining.length}/5
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-md border border-zinc-600/35 bg-zinc-900/50 px-1.5 py-0.5">
              {I.miss} Your miss strikes: {vm.placementMissStreakBySeat[mySeat ?? 0] ?? 0}/3
            </span>
          </div>
          {!myLocked ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <span className="w-full text-[10px] text-zinc-500">Ship length (tap to arm):</span>
                {remaining.length === 0 ? (
                  <span className="text-[11px] text-emerald-200/90">All ships placed — save & lock</span>
                ) : (
                  remaining.map((len, idx) => (
                    <button
                      key={`${len}-${idx}`}
                      type="button"
                      onClick={() => setPickLen(len)}
                      className={[
                        "min-h-[32px] min-w-[2.25rem] rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tabular-nums transition-colors",
                        activePickLen === len
                          ? "border-emerald-500/55 bg-emerald-950/55 text-emerald-50 shadow-[inset_0_0_0_2px_rgba(52,211,153,0.35)]"
                          : "border-zinc-600/45 bg-zinc-900/65 text-zinc-300 hover:border-zinc-500/55",
                      ].join(" ")}
                    >
                      {len}
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-full text-[10px] text-zinc-500 sm:w-auto">{I.target} Orientation:</span>
                <button
                  type="button"
                  className={BTN_SECONDARY + (orientationH ? " shadow-[inset_0_0_0_2px_rgba(56,189,248,0.35)]" : "")}
                  onClick={() => setOrientationH(true)}
                >
                  ↔ Horizontal
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY + (!orientationH ? " shadow-[inset_0_0_0_2px_rgba(56,189,248,0.35)]" : "")}
                  onClick={() => setOrientationH(false)}
                >
                  ↕ Vertical
                </button>
              </div>
            </>
          ) : null}
          <div className="mx-auto flex min-h-0 min-w-0 flex-1 items-center justify-center py-0.5 sm:py-0">
            {renderGrid("defense", {
              onCell: !myLocked ? onPlacementCell : null,
              shipsCells: draftShips.map(s => s.cells),
              outgoing: [],
              incoming: [],
              dim: myLocked,
              lockedOverlay: myLocked,
            })}
          </div>
          {!myLocked ? (
            <div className="flex flex-shrink-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy || draftShips.length === 0}
                onClick={() => setDraftShips(prev => prev.slice(0, -1))}
              >
                Undo ship
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy || draftShips.length === 0}
                onClick={() => setDraftShips([])}
              >
                Clear
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void randomPlacement()}>
                Random
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={saveDisabled}
                onClick={() => void submitPlacement(draftShips)}
              >
                Save layout
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={lockDisabled} onClick={() => void lockPlacement()}>
                Lock in
              </button>
            </div>
          ) : (
            <p className="text-center text-[11px] text-zinc-500">
              {I.lock} Waiting for opponent to lock…
            </p>
          )}
        </div>
      ) : null}

      {vm.phase === "battle" && mySeat != null ? (
        <div
          className={[
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            boardDesktopCompact ? "gap-1 sm:gap-1.5" : "gap-1.5 sm:gap-3",
          ].join(" ")}
        >
          <div className="flex min-h-[2.25rem] flex-shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-white/[0.05] bg-zinc-950/40 px-1.5 py-1.5 text-[9px] text-zinc-400 sm:min-h-[2.5rem] sm:text-[10px]">
            <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-zinc-500">
              {I.target} Battle
            </span>
            <span className="inline-flex min-h-[22px] items-center gap-0.5 rounded-md border border-zinc-600/35 bg-zinc-900/50 px-1.5 py-0.5 text-zinc-300">
              Stake ×{vm.stakeMultiplier}
            </span>
            <span className="inline-flex min-h-[22px] items-center gap-0.5 rounded-md border border-zinc-600/35 bg-zinc-900/50 px-1.5 py-0.5">
              {I.double} Doubles {vm.doublesAccepted}/4
            </span>
            {pd ? (
              <span className="inline-flex min-h-[22px] min-w-[7.25rem] max-w-[10rem] items-center justify-center gap-0.5 rounded-md border border-amber-500/35 bg-amber-950/30 px-1.5 py-0.5 text-center text-amber-100/95">
                {I.lock} Double pending
              </span>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                className={[
                  "flex min-h-[32px] min-w-[3.75rem] shrink-0 items-center justify-center rounded-md border px-1 py-0 text-[10px] font-semibold leading-none transition-opacity sm:min-h-[34px] sm:min-w-[4rem] sm:px-1.5 sm:py-0.5 sm:text-[11px]",
                  canOfferDouble && !busy
                    ? "cursor-pointer border-emerald-500/35 bg-gradient-to-b from-emerald-800/55 to-emerald-950 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] hover:from-emerald-700/50 hover:to-emerald-950"
                    : "cursor-not-allowed border-emerald-800/20 bg-emerald-950/40 text-emerald-600/55 opacity-80",
                ].join(" ")}
                disabled={!canOfferDouble || busy}
                onClick={() => void offerDouble()}
              >
                Double
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={autoFollowTurn}
                aria-label={autoFollowTurn ? "Auto follow on" : "Auto follow off"}
                title="When on, switch boards after turn changes (split view unchanged)."
                onClick={() => setAutoFollowTurn(v => !v)}
                className={[
                  "flex min-h-[32px] min-w-[2.75rem] shrink-0 flex-col items-center justify-center gap-0 rounded-md border px-0.5 py-0 transition sm:min-h-[34px] sm:min-w-[3rem] sm:px-1 sm:py-0.5",
                  autoFollowTurn
                    ? "border-sky-500/45 bg-sky-950/40 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.25)]"
                    : "border-zinc-600/40 bg-zinc-900/50 text-zinc-400 hover:border-zinc-500/45 hover:text-zinc-300",
                ].join(" ")}
              >
                <span className="inline-flex w-[2.125rem] shrink-0 justify-center text-[9px] font-semibold uppercase leading-none tracking-wide sm:w-[2.25rem] sm:text-[10px]">
                  AUTO
                </span>
                <span className="mt-px inline-flex w-[2.125rem] shrink-0 justify-center text-[8px] font-bold uppercase leading-none sm:w-[2.25rem] sm:text-[9px]">
                  {autoFollowTurn ? "ON" : "OFF"}
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap gap-1 text-[9px] text-zinc-500 sm:text-[10px]">
            <span className="text-zinc-600">Legend:</span>
            <span>
              {I.miss} miss
            </span>
            <span>·</span>
            <span>
              {I.hit} hit
            </span>
            <span>·</span>
            <span>
              {I.sunk} sunk
            </span>
            <span>·</span>
            <span>
              {I.fleet} your ships
            </span>
          </div>

          <div
            className={[
              "mb-0.5 hidden w-full gap-0.5 rounded-xl border border-white/[0.07] bg-zinc-950/35 p-0.5 sm:flex",
              boardDesktopCompact ? "min-h-[2rem]" : "min-h-[2.25rem]",
            ].join(" ")}
          >
            {["split", "offense", "defense"].map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setDesktopBattleMode(key)}
                className={[
                  "flex-1 rounded-lg border px-1.5 font-semibold transition-colors",
                  boardDesktopCompact ? "min-h-[32px] py-1 text-[9px]" : "min-h-[36px] py-1.5 text-[10px]",
                  desktopBattleMode === key
                    ? "border-sky-500/50 bg-sky-950/45 text-sky-50 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                    : "border-zinc-600/35 bg-zinc-900/35 text-zinc-500 hover:border-zinc-500/45 hover:bg-zinc-900/50 hover:text-zinc-300",
                ].join(" ")}
              >
                {key === "split" ? "Split" : key === "offense" ? `${I.radar} Your shots` : `${I.fleet} Your fleet`}
              </button>
            ))}
          </div>

          {pd ? (
            <div className="flex-shrink-0 rounded-xl border border-amber-500/35 bg-amber-950/30 p-1.5 text-[10px] text-amber-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-2 sm:text-[11px]">
              {responderSeat === mySeat ? (
                <>
                  <p className="font-semibold">
                    {I.double} Double offered → ×{proposedMult ?? "?"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void respondDouble(true)}>
                      Accept
                    </button>
                    <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void respondDouble(false)}>
                      Decline (forfeit)
                    </button>
                  </div>
                </>
              ) : (
                <p>
                  {I.timer} Waiting for opponent to accept or decline the double…
                </p>
              )}
            </div>
          ) : null}

          <div className="mb-1 flex gap-1 sm:hidden">
            <button
              type="button"
              onClick={() => setMobileBattleTab("offense")}
              className={[
                "min-h-[36px] flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors",
                mobileBattleTab === "offense"
                  ? "border-sky-500/50 bg-sky-950/40 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                  : "border-zinc-600/40 bg-zinc-900/50 text-zinc-400",
              ].join(" ")}
            >
              {I.radar} Your shots
            </button>
            <button
              type="button"
              onClick={() => setMobileBattleTab("defense")}
              className={[
                "min-h-[36px] flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors",
                mobileBattleTab === "defense"
                  ? "border-sky-500/50 bg-sky-950/40 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                  : "border-zinc-600/40 bg-zinc-900/50 text-zinc-400",
              ].join(" ")}
            >
              {I.fleet} Your fleet
            </button>
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className={[
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                boardDesktopCompact ? "gap-1 sm:gap-2" : "gap-1.5 sm:gap-3",
                desktopBattleMode === "split" ? "xl:flex-row xl:items-stretch xl:gap-4" : "",
              ].join(" ")}
            >
            <section
              className={[
                "min-h-0 flex flex-col overflow-hidden",
                boardDesktopCompact ? "space-y-0 sm:space-y-0.5" : "space-y-0.5 sm:space-y-1",
                mobileBattleTab === "offense" ? "max-sm:flex max-sm:flex-1" : "max-sm:hidden",
                desktopBattleMode === "defense" ? "sm:hidden" : "sm:flex sm:flex-none xl:flex-1 xl:min-w-0",
                "rounded-xl border border-sky-500/15 bg-sky-950/10 p-1 sm:p-1.5",
              ].join(" ")}
            >
              <h3
                className={[
                  "flex-shrink-0 font-semibold uppercase tracking-wide text-sky-300/90",
                  boardDesktopCompact ? "text-[8px] sm:text-[9px]" : "text-[9px] sm:text-[10px]",
                ].join(" ")}
              >
                {I.radar} Command — radar (your shots)
              </h3>
              <div className="mx-auto flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-visible sm:flex-none">
                {renderGrid("offense", {
                  onCell: onTargetCell,
                  shipsCells: [],
                  outgoing: myOutgoing,
                  incoming: [],
                  dim: vm.turnSeat !== mySeat || Boolean(pd),
                  sizeCompact: boardDesktopCompact,
                  tacticalFrame: boardDesktopCompact && desktopBattleMode === "offense" ? "offense" : null,
                })}
              </div>
            </section>

            <section
              className={[
                "min-h-0 flex flex-col overflow-hidden",
                boardDesktopCompact ? "space-y-0 sm:space-y-0.5" : "space-y-0.5 sm:space-y-1",
                mobileBattleTab === "defense" ? "max-sm:flex max-sm:flex-1" : "max-sm:hidden",
                desktopBattleMode === "offense" ? "sm:hidden" : "sm:flex sm:flex-none xl:flex-1 xl:min-w-0",
                "rounded-xl border border-emerald-500/12 bg-emerald-950/8 p-1 sm:p-1.5",
              ].join(" ")}
            >
              <h3
                className={[
                  "flex-shrink-0 font-semibold uppercase tracking-wide text-emerald-300/85",
                  boardDesktopCompact ? "text-[8px] sm:text-[9px]" : "text-[9px] sm:text-[10px]",
                ].join(" ")}
              >
                {I.fleet} Fleet status — your ships
              </h3>
              <div className="mx-auto flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-visible sm:flex-none">
                {renderGrid("defense", {
                  onCell: null,
                  shipsCells: vm.myShips.map(s => s.cells || []),
                  outgoing: [],
                  incoming: incomingOnMe,
                  dim: false,
                  sizeCompact: boardDesktopCompact,
                  tacticalFrame: boardDesktopCompact && desktopBattleMode === "defense" ? "defense" : null,
                })}
              </div>
            </section>
            </div>
            <div
              className="pointer-events-none absolute right-1.5 top-1.5 z-20 flex min-h-[2.75rem] min-w-[6.25rem] flex-col items-end justify-start rounded-md border border-white/[0.12] bg-zinc-950/92 px-2 py-1.5 text-[9px] shadow-[0_2px_12px_rgba(0,0,0,0.45)] backdrop-blur-[2px] sm:right-2 sm:top-2 sm:text-[10px]"
              aria-live="polite"
            >
              <span
                className={
                  vm.turnSeat === mySeat ? "font-semibold leading-tight text-emerald-200/95" : "font-medium leading-tight text-zinc-400"
                }
              >
                {vm.turnSeat === mySeat ? "Your turn" : "Opponent turn"}
              </span>
              <span className="min-h-[1rem] text-right tabular-nums text-amber-200/90">
                {vm.turnTimeLeftSec != null ? `${vm.turnTimeLeftSec}s` : <span className="invisible">00s</span>}
              </span>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col gap-1 rounded-lg border border-white/[0.06] bg-zinc-950/35 px-1.5 py-1 text-[9px] text-zinc-500 sm:text-[10px]">
            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="font-semibold text-zinc-500">Enemy sunk</span>
                <div className="flex flex-wrap gap-1">
                  {FH_SHIP_LENGTHS.map((len, i) => (
                    <span
                      key={`sunk-${len}-${i}`}
                      className={[
                        "inline-flex min-w-[1.5rem] items-center justify-center rounded border px-1 py-0.5 tabular-nums",
                        i < sunkEnemyCount
                          ? "border-rose-500/35 bg-rose-950/35 text-rose-100/90 line-through opacity-80"
                          : "border-zinc-600/40 bg-zinc-900/50 text-zinc-400",
                      ].join(" ")}
                      title="Classes you have sunk (order may vary)"
                    >
                      {len}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="ml-auto shrink-0 rounded-md border border-rose-500/40 bg-gradient-to-b from-rose-900/65 to-red-950 px-2 py-1 text-[9px] font-semibold text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:from-rose-800/55 hover:to-red-950 disabled:cursor-not-allowed disabled:border-rose-900/30 disabled:from-rose-950/40 disabled:to-red-950/50 disabled:text-rose-400/55 disabled:opacity-55 sm:text-[10px]"
                disabled={exitBusy}
                onClick={() => void onExitToLobby()}
              >
                {exitBusy ? "Leaving…" : "Leave table"}
              </button>
            </div>
            {exitErr ? <p className="text-[10px] leading-snug text-red-300/90">{exitErr}</p> : null}
          </div>
        </div>
      ) : null}

      {!snapshot && room?.active_session_id ? (
        loadingError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="text-red-400 text-sm font-semibold">Failed to load match</div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <div>Loading match…</div>
        )
      ) : null}

      {showResultModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-b from-zinc-900/98 to-zinc-950 shadow-2xl shadow-black/50">
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
                    (finishOutcome === "draw" || finishOutcome === "unknown") && "border-white/10 bg-zinc-900/80 text-zinc-200",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {finishOutcome === "win" ? I.trophy : finishOutcome === "loss" ? I.cross : "⎔"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Match result</p>
                  <div
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
                    {finishHeadline}
                  </div>
                  {finishSettlement ? (
                    <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium text-zinc-400">You</span>
                        <span
                          className={[
                            "text-lg font-bold tabular-nums",
                            finishSettlement.kind === "decisive" && finishOutcome === "win" && "text-emerald-400",
                            finishSettlement.kind === "decisive" && finishOutcome === "loss" && "text-rose-400",
                            finishSettlement.kind === "draw" && "text-zinc-200",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {finishSettlement.youText}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium text-zinc-400">Opponent</span>
                        <span
                          className={[
                            "text-lg font-bold tabular-nums",
                            finishSettlement.kind === "decisive" && finishOutcome === "loss" && "text-emerald-400",
                            finishSettlement.kind === "decisive" && finishOutcome === "win" && "text-rose-400",
                            finishSettlement.kind === "draw" && "text-zinc-200",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {finishSettlement.oppText}
                        </span>
                      </div>
                      {finishSettlement.kind === "draw" && finishSettlement.refundPerSeat != null ? (
                        <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                          Even — stakes returned ({finishSettlement.refundPerSeat} each)
                        </p>
                      ) : finishSettlement.kind === "draw" ? (
                        <p className="mt-2 text-[10px] leading-snug text-zinc-500">Even — no net gain or loss</p>
                      ) : null}
                    </div>
                  ) : finishOutcome === "win" || finishOutcome === "loss" ? (
                    <p className="mt-2 text-[11px] text-zinc-500">Net settlement not included in this snapshot.</p>
                  ) : null}
                  <div className="mt-2 rounded-lg border border-white/[0.06] bg-zinc-950/40 px-2.5 py-1.5">
                    <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">Stake multiplier</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">
                      ×{String(finishResultObj?.stakeMultiplier ?? vm.stakeMultiplier ?? 1)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 px-4 py-4">
              <p className="text-center text-[10px] text-zinc-500">
                Rematch: {rematchCounts.ready}/{rematchCounts.seated || 2} ready in room
              </p>
              <button type="button" className={BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
                {rematchBusy ? "Requesting…" : "Request rematch"}
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
                Cancel rematch
              </button>
              {isHost ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
                  <button
                    type="button"
                    className={BTN_PRIMARY + " w-full"}
                    disabled={startNextBusy || rematchCounts.ready < 2}
                    onClick={() => void onStartNext()}
                  >
                    {startNextBusy ? "Starting…" : `Start next match (${rematchCounts.ready}/2 rematch)`}
                  </button>
                </div>
              ) : (
                <p className="rounded-lg border border-white/[0.06] bg-zinc-950/35 px-2 py-1.5 text-center text-[11px] text-zinc-500">
                  Host starts the next match when both players rematch.
                </p>
              )}
              <button type="button" className={BTN_SECONDARY} onClick={() => dismissFinishModal()}>
                Dismiss
              </button>
              <button
                type="button"
                className="mt-0.5 text-[11px] text-zinc-500 underline decoration-zinc-600 underline-offset-2 transition hover:text-zinc-400"
                disabled={exitBusy}
                onClick={() => void onExitToLobby()}
              >
                {exitBusy ? "Leaving…" : "Exit to lobby"}
              </button>
              {exitErr ? <p className="text-[11px] text-red-300">{exitErr}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {finished && !showResultModal ? (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-3 text-[11px] text-zinc-400">
          <p
            className={[
              "font-semibold",
              finishOutcome === "win" && "text-emerald-400",
              finishOutcome === "loss" && "text-rose-400",
              finishOutcome === "draw" && "text-sky-300",
              finishOutcome === "unknown" && "text-zinc-200",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {finishHeadline}
          </p>
          <p className="mt-1">Result dismissed — you can rematch from the lobby or use buttons below if still available.</p>
        </div>
      ) : null}
      </div>
    </div>
  );
}
