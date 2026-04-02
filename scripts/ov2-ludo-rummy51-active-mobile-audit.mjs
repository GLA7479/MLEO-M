/**
 * OV2 Ludo + Rummy 51 — active live match mobile layout audit (Playwright).
 * Mocks PostgREST room/members + game snapshot RPCs; no real Supabase.
 *
 * Requires: `npx next dev -p 3040` (or set OV2_QA_BASE).
 *
 *   node scripts/ov2-ludo-rummy51-active-mobile-audit.mjs
 */
import { chromium, webkit } from "playwright";

const BASE = process.env.OV2_QA_BASE || "http://127.0.0.1:3040";
const CHROME_TRIM = 72;

/** Fixed UUIDs (valid length for ?room=) */
const HOST_PK = "33333333-3333-4333-8333-333333333333";
const P2_PK = "44444444-4444-4444-8444-444444444444";
const SID_LUDO_PLAY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SID_LUDO_FIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SID_RUMMY_PLAY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SID_RUMMY_FIN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ROOM_LUDO_PLAY = "11111111-1111-4111-8111-111111111111";
const ROOM_LUDO_FIN = "22222222-2222-4222-8222-222222222222";
const ROOM_RUMMY_PLAY = "55555555-5555-4555-8555-555555555555";
const ROOM_RUMMY_FIN = "66666666-6666-4666-8666-666666666666";

const VIEWPORTS = [
  { w: 320, h: 568, name: "320×568" },
  { w: 360, h: 640, name: "360×640" },
  { w: 375, h: 667, name: "375×667" },
  { w: 390, h: 844, name: "390×844" },
  { w: 430, h: 932, name: "430×932" },
];

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function baseRoomRow(id, product_game_id, active_session_id) {
  const now = new Date().toISOString();
  return {
    id,
    created_at: now,
    updated_at: now,
    product_game_id,
    title: product_game_id === "ov2_ludo" ? "Audit Ludo" : "Audit Rummy 51",
    lifecycle_phase: "active",
    stake_per_seat: 100,
    host_participant_key: HOST_PK,
    is_private: false,
    max_seats: 4,
    match_seq: 1,
    pot_locked: false,
    active_session_id,
    closed_reason: null,
    settlement_status: null,
    settlement_revision: null,
    finalized_at: null,
    finalized_match_seq: null,
    meta: {},
    shared_schema_version: 0,
    status: "OPEN",
  };
}

function baseMembers(roomId) {
  const now = new Date().toISOString();
  return [
    {
      id: "mem-host",
      room_id: roomId,
      participant_key: HOST_PK,
      display_name: "Host You",
      seat_index: 0,
      wallet_state: "committed",
      amount_locked: 100,
      is_ready: true,
      created_at: now,
      updated_at: now,
      meta: {},
    },
    {
      id: "mem-p2",
      room_id: roomId,
      participant_key: P2_PK,
      display_name: "Player Two",
      seat_index: 1,
      wallet_state: "committed",
      amount_locked: 100,
      is_ready: true,
      created_at: now,
      updated_at: now,
      meta: {},
    },
  ];
}

function ludoBoardPlaying() {
  return {
    seatCount: 2,
    activeSeats: [0, 1],
    turnSeat: 0,
    dice: 4,
    lastDice: null,
    pieces: {
      "0": [2, 5, -1, -1],
      "1": [-1, -1, -1, -1],
    },
    finished: { "0": 0, "1": 0 },
    winner: null,
  };
}

function ludoBoardFinished() {
  return {
    seatCount: 2,
    activeSeats: [0, 1],
    turnSeat: null,
    dice: null,
    lastDice: 4,
    pieces: {
      "0": [52, 53, 54, 55],
      "1": [-1, -1, -1, -1],
    },
    finished: { "0": 4, "1": 0 },
    winner: 0,
  };
}

function ludoSnapshotPlaying(roomId) {
  const board = ludoBoardPlaying();
  return {
    revision: 42,
    sessionId: SID_LUDO_PLAY,
    roomId,
    phase: "playing",
    activeSeats: [0, 1],
    mySeat: 0,
    board,
    turnSeat: 0,
    dice: 4,
    lastDice: null,
    winnerSeat: null,
    canClientRoll: false,
    canClientMovePiece: true,
    boardViewReadOnly: false,
    legalMovablePieceIndices: [0, 1],
    turnDeadline: Date.now() + 120_000,
    doubleState: null,
    doubleCycleUsedSeats: [],
    result: null,
    missedTurns: { "0": 0, "1": 0 },
  };
}

function ludoSnapshotFinished(roomId) {
  const board = ludoBoardFinished();
  return {
    revision: 99,
    sessionId: SID_LUDO_FIN,
    roomId,
    phase: "finished",
    activeSeats: [0, 1],
    mySeat: 0,
    board,
    turnSeat: null,
    dice: null,
    lastDice: 4,
    winnerSeat: 0,
    canClientRoll: false,
    canClientMovePiece: false,
    boardViewReadOnly: true,
    legalMovablePieceIndices: null,
    turnDeadline: null,
    doubleState: null,
    doubleCycleUsedSeats: [],
    result: { winnerSeat: 0, stakePerSeat: 100, seatCount: 2 },
    missedTurns: { "0": 0, "1": 0 },
  };
}

function card(id, rank, suit, deckIndex = 0) {
  return { id, rank, suit, isJoker: false, deckIndex };
}

function rummySnapshotPlaying(roomId) {
  const handHost = [
    card("h1", 1, "S"),
    card("h2", 2, "S"),
    card("h3", 3, "S"),
    card("h4", 4, "H"),
    card("h5", 5, "H"),
    card("h6", 11, "D"),
    card("h7", 12, "D"),
  ];
  return {
    sessionId: SID_RUMMY_PLAY,
    roomId,
    matchSeq: 1,
    phase: "playing",
    revision: 12,
    turnIndex: 0,
    turnParticipantKey: HOST_PK,
    dealerSeatIndex: 1,
    activeSeats: [0, 1],
    seed: "audit-rummy",
    stockCount: 35,
    discardCount: 3,
    discardTop: card("disc_top", 9, "C"),
    hands: {
      [HOST_PK]: handHost,
      [P2_PK]: [card("p2a", 7, "D"), card("p2b", 8, "D")],
    },
    tableMelds: [
      {
        meldId: "meld-audit-1",
        kind: "run",
        cards: [card("t1", 5, "C"), card("t2", 6, "C"), card("t3", 7, "C")],
      },
    ],
    playerState: {
      [HOST_PK]: {
        displayName: "Host You",
        seatIndex: 0,
        scoreTotal: 0,
        hasEverOpened: false,
        hasOpenedThisHand: false,
        isEliminated: false,
      },
      [P2_PK]: {
        displayName: "Player Two",
        seatIndex: 1,
        scoreTotal: 0,
        hasEverOpened: true,
        hasOpenedThisHand: true,
        isEliminated: false,
      },
    },
    takenDiscardCardId: null,
    pendingDrawSource: null,
    roundNumber: 1,
    winnerParticipantKey: null,
    winnerName: null,
    matchMeta: { stakePerSeat: 100, seatCount: 2 },
  };
}

function rummySnapshotFinished(roomId) {
  const snap = rummySnapshotPlaying(roomId);
  return {
    ...snap,
    sessionId: SID_RUMMY_FIN,
    phase: "finished",
    revision: 500,
    turnParticipantKey: "",
    pendingDrawSource: null,
    winnerParticipantKey: HOST_PK,
    winnerName: "Host You",
    stockCount: 0,
    discardCount: 0,
    discardTop: null,
  };
}

function roomConfigForId(roomId) {
  const map = {
    [ROOM_LUDO_PLAY]: { row: baseRoomRow(ROOM_LUDO_PLAY, "ov2_ludo", SID_LUDO_PLAY), ludo: "playing" },
    [ROOM_LUDO_FIN]: { row: baseRoomRow(ROOM_LUDO_FIN, "ov2_ludo", SID_LUDO_FIN), ludo: "finished" },
    [ROOM_RUMMY_PLAY]: { row: baseRoomRow(ROOM_RUMMY_PLAY, "ov2_rummy51", SID_RUMMY_PLAY), rummy: "playing" },
    [ROOM_RUMMY_FIN]: { row: baseRoomRow(ROOM_RUMMY_FIN, "ov2_rummy51", SID_RUMMY_FIN), rummy: "finished" },
  };
  return map[roomId] || null;
}

function parseEqFilter(url, col) {
  try {
    const u = new URL(url);
    const m = u.search.match(new RegExp(`${col}=eq\\.([^&]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

async function setupRoutes(context) {
  await context.route(/\/rest\/v1\//, async route => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (method === "GET" && url.includes("/ov2_rooms")) {
      const id = parseEqFilter(url, "id");
      const cfg = id ? roomConfigForId(id) : null;
      if (cfg) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(cfg.row),
        });
      }
    }

    if (method === "GET" && url.includes("/ov2_room_members")) {
      const rid = parseEqFilter(url, "room_id");
      const cfg = rid ? roomConfigForId(rid) : null;
      if (cfg) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(baseMembers(rid)),
        });
      }
    }

    if (method === "POST" && url.includes("/rpc/ov2_ludo_get_snapshot")) {
      let body = {};
      try {
        body = JSON.parse(req.postData() || "{}");
      } catch {
        /* ignore */
      }
      const roomId = String(body.p_room_id || "");
      const cfg = roomConfigForId(roomId);
      if (cfg?.ludo === "playing") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, snapshot: ludoSnapshotPlaying(roomId) }),
        });
      }
      if (cfg?.ludo === "finished") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, snapshot: ludoSnapshotFinished(roomId) }),
        });
      }
    }

    if (method === "POST" && url.includes("/rpc/ov2_rummy51_get_snapshot")) {
      let body = {};
      try {
        body = JSON.parse(req.postData() || "{}");
      } catch {
        /* ignore */
      }
      const roomId = String(body.p_room_id || "");
      const cfg = roomConfigForId(roomId);
      if (cfg?.rummy === "playing") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            room: cfg.row,
            members: baseMembers(roomId),
            session: { id: cfg.row.active_session_id },
            snapshot: rummySnapshotPlaying(roomId),
          }),
        });
      }
      if (cfg?.rummy === "finished") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            room: cfg.row,
            members: baseMembers(roomId),
            session: { id: cfg.row.active_session_id },
            snapshot: rummySnapshotFinished(roomId),
          }),
        });
      }
    }

    if (
      method === "POST" &&
      (url.includes("/rpc/ov2_ludo_claim_settlement") || url.includes("/rpc/ov2_rummy51_claim_settlement"))
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, lines: [] }),
      });
    }

    return route.continue();
  });

  await context.route("**/api/arcade/vault/balance", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ balance: 99_000_000 }),
    })
  );
}

/** @param {import('playwright').Page} page */
async function waitLiveLudo(page, phase) {
  const room = phase === "finished" ? ROOM_LUDO_FIN : ROOM_LUDO_PLAY;
  await page.goto(`${BASE}/ov2-ludo?room=${room}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    () => {
      const main = document.querySelector("main.online-v2-game-main");
      if (!main) return false;
      const t = (main.innerText || "").toLowerCase();
      if (t.includes("read-only — no live ludo session")) return false;
      if (t.includes("loading room")) return false;
      return true;
    },
    null,
    { timeout: 120000 }
  );
  try {
    await page.locator('main.online-v2-game-main img[src*="ludo/board"]').waitFor({ state: "visible", timeout: 120000 });
  } catch {
    await page.getByRole("button", { name: /Leave table|Back to room/i }).first().waitFor({ state: "attached", timeout: 60000 });
  }
  await page.waitForTimeout(800);
}

/** @param {import('playwright').Page} page */
async function waitLiveRummy(page, phase) {
  const room = phase === "finished" ? ROOM_RUMMY_FIN : ROOM_RUMMY_PLAY;
  await page.goto(`${BASE}/ov2-rummy51?room=${room}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    () => {
      const main = document.querySelector("main.online-v2-game-main");
      if (!main) return false;
      const t = main.innerText || "";
      if (t.includes("Loading table")) return false;
      if (t.includes("No Rummy 51 session yet")) return false;
      if (t.includes("Join a Rummy 51 room")) return false;
      return true;
    },
    null,
    { timeout: 120000 }
  );
  if (phase === "playing") {
    await page.getByRole("button", { name: "Draw stock" }).waitFor({ state: "visible", timeout: 120000 });
  } else {
    await page.getByText("Match finished", { exact: false }).waitFor({ state: "visible", timeout: 120000 });
  }
  await page.waitForTimeout(800);
}

/** @param {import('playwright').Page} page @param {{ game: string, phase: string }} ctx */
async function measure(page, ctx) {
  return page.evaluate(
    ({ game, phase }) => {
      const docEl = document.documentElement;
      const outerScroll = docEl.scrollHeight - docEl.clientHeight;
      const main = document.querySelector("main.online-v2-game-main");
      const mainRect = main?.getBoundingClientRect();
      const innerH = window.innerHeight;
      const innerW = window.innerWidth;

      const shellBody = main?.querySelector(".mx-auto.flex.h-full");
      const shellFlex = shellBody?.querySelector(".relative.min-h-0.flex-1");
      const shellRect = shellFlex?.getBoundingClientRect();

      function clipReport(el) {
        if (!el) return { ok: false, reason: "missing" };
        const r = el.getBoundingClientRect();
        const pad = 2;
        if (r.height < 6 || r.width < 6) return { ok: false, reason: "zero-size", r: r.toJSON?.() || null };
        const bottomCut = r.bottom > innerH + pad;
        const topCut = r.top < -pad;
        const rightCut = r.right > innerW + pad;
        const leftCut = r.left < -pad;
        if (topCut || bottomCut || leftCut || rightCut) {
          return {
            ok: false,
            reason: "clipped",
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            innerH,
            innerW,
          };
        }
        return { ok: true, top: r.top, bottom: r.bottom, height: r.height };
      }

      const mainBtns = main ? Array.from(main.querySelectorAll("button")) : [];
      const leaveBtn = mainBtns.find(b => /^\s*Leave table\s*$/i.test((b.textContent || "").trim()));
      const backToLobbyRummy = mainBtns.find(b => /^\s*Back to lobby\s*$/i.test((b.textContent || "").trim()));
      const backToRoomLudo = mainBtns.find(b => /^\s*Back to room\s*$/i.test((b.textContent || "").trim()));

      const diceEl = main?.querySelector('[aria-label="Dice"],[aria-label="Roll dice"]');
      const boardImg = main?.querySelector('img[src*="ludo/board"]');
      const boardShell = main?.querySelector(".aspect-square.shrink-0.overflow-hidden.rounded-2xl");
      const boardEl = boardImg || boardShell;

      const drawStock = mainBtns.find(b => /Draw stock/i.test(b.textContent || ""));
      const takeDiscard = mainBtns.find(b => /Take discard/i.test(b.textContent || ""));

      const mainFills = mainRect && mainRect.height >= innerH * 0.88;
      const gameAreaMin = shellRect && shellRect.height >= innerH * 0.22;

      const issues = [];
      if (outerScroll > 12) issues.push(`outer_scroll_${Math.round(outerScroll)}px`);
      if (!mainFills) issues.push("main_short");
      if (!gameAreaMin) issues.push("game_flex_small");

      if (game === "ludo" && phase === "playing") {
        const leaveRep = clipReport(leaveBtn);
        if (!leaveRep.ok) issues.push(`leave_${leaveRep.reason}`);
        const boardRep = clipReport(boardEl);
        if (!boardRep.ok) issues.push(`board_${boardRep.reason}`);
        const diceRep = clipReport(diceEl);
        if (!diceRep.ok) issues.push(`dice_${diceRep.reason}`);
      } else if (game === "ludo" && phase === "finished") {
        const finishP = Array.from(main?.querySelectorAll("p") || []).find(p =>
          /You won|You lost|Finished match/i.test(p.textContent || "")
        );
        const surfRep = clipReport(finishP || backToRoomLudo);
        if (!surfRep.ok) issues.push(`finish_surface_${surfRep.reason}`);
        const leaveRep = clipReport(backToRoomLudo);
        if (!leaveRep.ok) issues.push(`back_to_room_${leaveRep.reason}`);
        const boardRep = clipReport(boardEl);
        if (!boardRep.ok) issues.push(`board_${boardRep.reason}`);
      } else if (game === "rummy" && phase === "playing") {
        const leaveRep = clipReport(leaveBtn);
        if (!leaveRep.ok) issues.push(`leave_${leaveRep.reason}`);
        const drawRep = clipReport(drawStock);
        if (!drawRep.ok) issues.push(`draw_stock_${drawRep.reason}`);
        const discRep = clipReport(takeDiscard);
        if (!discRep.ok) issues.push(`take_discard_${discRep.reason}`);
      } else if (game === "rummy" && phase === "finished") {
        const leaveRep = clipReport(leaveBtn);
        if (!leaveRep.ok) issues.push(`leave_${leaveRep.reason}`);
        const matchFin = Array.from(main?.querySelectorAll("p") || []).find(p =>
          /Match finished/i.test(p.textContent || "")
        );
        const finRep = clipReport(matchFin);
        if (!finRep.ok) issues.push(`match_finished_${finRep.reason}`);
        const backRep = clipReport(backToLobbyRummy);
        if (!backRep.ok) issues.push(`back_to_lobby_${backRep.reason}`);
      }

      return {
        outerScrollPx: outerScroll,
        pass: issues.length === 0,
        issues,
        mainH: mainRect?.height ?? 0,
        innerH,
        gameFlexH: shellRect?.height ?? 0,
      };
    },
    ctx
  );
}

async function runOne(browserName, browser, viewport, trimPx, game, phase) {
  const contextOpts = {
    viewport: { width: viewport.w, height: Math.max(420, viewport.h - trimPx) },
    deviceScaleFactor: browserName === "webkit" ? 2 : 1,
    isMobile: browserName === "webkit",
    hasTouch: browserName === "webkit",
    userAgent: browserName === "webkit" ? IPHONE_UA : undefined,
  };
  const context = await browser.newContext(contextOpts);
  await setupRoutes(context);
  await context.addInitScript(`
    localStorage.setItem("ov2_participant_id_v1", ${JSON.stringify(HOST_PK)});
    localStorage.setItem("ov2_display_name_v1", "Host You");
  `);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  try {
    if (game === "ludo") await waitLiveLudo(page, phase);
    else await waitLiveRummy(page, phase);
    const m = await measure(page, { game, phase });
    return m;
  } finally {
    await context.close();
  }
}

function aggregate(results, game, browserLabel) {
  const rows = VIEWPORTS.map(vp => {
    const full = results.find(
      r => r.game === game && r.vp === vp.name && r.browser === browserLabel && r.trim === 0
    );
    const trim = results.find(
      r => r.game === game && r.vp === vp.name && r.browser === browserLabel && r.trim === CHROME_TRIM
    );
    const pass = Boolean(full?.pass && trim?.pass);
    return { vp: vp.name, pass, full: full?.pass, trim: trim?.pass, issues: [...(full?.issues || []), ...(trim?.issues || [])] };
  });
  const webkitAll = results.filter(r => r.game === game && r.browser === "WebKit+iPhone UA");
  const webkitPass = webkitAll.length && webkitAll.every(r => r.pass);
  return { rows, webkitPass };
}

async function main() {
  const results = [];
  const browsers = [
    { name: "Chromium", launcher: chromium },
    { name: "WebKit+iPhone UA", launcher: webkit },
  ];

  for (const { name, launcher } of browsers) {
    const browser = await launcher.launch();
    try {
      for (const game of ["ludo", "rummy"]) {
        for (const phase of ["playing", "finished"]) {
          for (const vp of VIEWPORTS) {
            for (const trim of [0, CHROME_TRIM]) {
              process.stdout.write(`${name} ${game} ${phase} ${vp.name} trim=${trim}… `);
              try {
                const m = await runOne(name, browser, vp, trim, game, phase);
                const pass = m.pass;
                results.push({
                  browser: name,
                  game,
                  phase,
                  vp: vp.name,
                  trim,
                  pass,
                  issues: m.issues,
                });
                console.log(pass ? "PASS" : `FAIL ${m.issues.join("; ")}`);
              } catch (e) {
                results.push({
                  browser: name,
                  game,
                  phase,
                  vp: vp.name,
                  trim,
                  pass: false,
                  issues: [String(e?.message || e)],
                });
                console.log(`FAIL ${e?.message || e}`);
              }
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  }

  function tableFor(game, browserName) {
    const { rows } = aggregate(results, game, browserName);
    return rows.map(r => ({ Viewport: r.vp, PASS: r.pass ? "PASS" : "FAIL", Notes: r.pass ? "" : r.issues.join(", ") }));
  }

  console.log("\n========== SUMMARY ==========\n");
  const ludC = aggregate(results, "ludo", "Chromium");
  const ludW = aggregate(results, "ludo", "WebKit+iPhone UA");
  const rumC = aggregate(results, "rummy", "Chromium");
  const rumW = aggregate(results, "rummy", "WebKit+iPhone UA");

  console.log("Ludo Chromium by viewport (playing+finished, full + trimmed height both must pass):");
  console.table(tableFor("ludo", "Chromium"));
  console.log("Ludo WebKit+iPhone UA:");
  console.table(tableFor("ludo", "WebKit+iPhone UA"));
  console.log("Rummy 51 Chromium:");
  console.table(tableFor("rummy", "Chromium"));
  console.log("Rummy 51 WebKit+iPhone UA:");
  console.table(tableFor("rummy", "WebKit+iPhone UA"));

  const ludoReady = ludC.rows.every(r => r.pass) && ludW.rows.every(r => r.pass);
  const rummyReady = rumC.rows.every(r => r.pass) && rumW.rows.every(r => r.pass);

  console.log("\nWebKit behavior (all cells):", ludW.webkitPass && rumW.webkitPass ? "PASS" : "FAIL");
  console.log("\nFinal: Ludo mobile-ready?", ludoReady ? "YES" : "NO");
  console.log("Final: Rummy 51 mobile-ready?", rummyReady ? "YES" : "NO");

  if (!ludoReady || !rummyReady) {
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
