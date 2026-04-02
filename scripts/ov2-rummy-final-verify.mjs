/**
 * OV2 Rummy 51 — focused E2E (Playwright). Requires running dev server, e.g.:
 *   npx next dev -p 3060
 *   OV2_QA_BASE=http://127.0.0.1:3060 node scripts/ov2-rummy-final-verify.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "crypto";
import {
  classifyMeld,
  deserializeCard,
  isLegalInitialOpen,
} from "../lib/online-v2/rummy51/ov2Rummy51Engine.js";

const BASE = process.env.OV2_QA_BASE || "http://127.0.0.1:3040";
const STAKE = 5000;

const OUT = {
  rummyStake: "",
  rummyNormal: "",
  rummyForfeit: "",
  regression: "",
  filesChanged: [],
  blocker: "",
};

/** @param {import("@playwright/test").Page} page */
function attachRummySnapshotSniffer(page, bucket) {
  page.on("response", async res => {
    try {
      const u = res.url();
      if (!u.includes("/rest/v1/rpc/") || !u.includes("ov2_rummy51")) return;
      if (!res.ok()) return;
      const ct = res.headers()["content-type"] || "";
      if (!ct.includes("json")) return;
      const j = await res.json();
      const payload = j && typeof j === "object" && "data" in j ? j.data : j;
      const snap =
        payload && typeof payload === "object"
          ? payload.snapshot ||
            (payload.session && typeof payload.session === "object" ? payload.session.snapshot : null)
          : null;
      if (snap && typeof snap === "object") bucket.last = snap;
    } catch {
      /* ignore parse */
    }
  });
}

function trackRpc(page, name, into) {
  page.on("request", req => {
    try {
      const u = req.url();
      if (!u.includes("/rest/v1/rpc/")) return;
      if (!u.includes(name)) return;
      into.push({ url: u, post: req.postData() || "" });
    } catch {
      /* ignore */
    }
  });
}

/** Parse `OnlineV2VaultStrip` text (compact `1.5K` / `99M` or full `99,000,000`). */
function parseVaultUiText(t) {
  if (!t) return null;
  const s = String(t).trim();
  const compact = s.match(/([\d.]+)\s*([KMB])\b/i);
  if (compact) {
    const n = parseFloat(compact[1]);
    if (!Number.isFinite(n)) return null;
    const u = compact[2].toUpperCase();
    const mul = u === "K" ? 1e3 : u === "M" ? 1e6 : u === "B" ? 1e9 : 1;
    return Math.floor(n * mul);
  }
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

async function readVault(page) {
  const fromLs = await page.evaluate(() => {
    try {
      const KEY = "mleo_rush_core_v4";
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      const val = Number(o?.vault ?? 0);
      return Number.isFinite(val) ? Math.floor(val) : null;
    } catch {
      return null;
    }
  });

  let bestUi = null;
  try {
    const n = await page.locator('[title="Product vault via OV2 bridge"]').count();
    for (let i = 0; i < n; i++) {
      const t = await page.locator('[title="Product vault via OV2 bridge"]').nth(i).textContent({ timeout: 5000 });
      const v = parseVaultUiText(t);
      if (v != null && (bestUi == null || v > bestUi)) bestUi = v;
    }
  } catch {
    /* ignore */
  }

  const candidates = [fromLs, bestUi].filter(v => v != null && Number.isFinite(v) && v >= 0);
  if (!candidates.length) return 0;
  return Math.max(...candidates);
}

async function readParticipantKey(page) {
  return page.evaluate(() => localStorage.getItem("ov2_participant_id_v1") || "");
}

/**
 * Mirrors arcade vault deltas so flushDelta does not zero local balance (unmocked claim → balance 0).
 * Each browser context gets an isolated running balance starting at 99M.
 */
/** Dev-only: mock webpack-hmr so broken Next hot-reloader does not reload the page mid-test. */
async function silenceNextWebpackHmr(ctx) {
  try {
    await ctx.routeWebSocket(/webpack-hmr/i, () => {});
  } catch {
    /* ignore */
  }
}

function installStatefulArcadeVaultMock(ctx) {
  let balance = 99_000_000;
  ctx.route("**/api/arcade/vault/balance", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ balance }),
    })
  );
  ctx.route("**/api/arcade/vault/claim", async route => {
    try {
      const raw = route.request().postData();
      const body = raw ? JSON.parse(raw) : {};
      const amt = Math.floor(Number(body?.amount || 0));
      if (amt > 0) balance -= amt;
    } catch {
      /* ignore */
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ balance }),
    });
  });
  ctx.route("**/api/arcade/vault/credit", async route => {
    try {
      const raw = route.request().postData();
      const body = raw ? JSON.parse(raw) : {};
      const amt = Math.floor(Number(body?.amount || 0));
      if (amt > 0) balance += amt;
    } catch {
      /* ignore */
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ balance }),
    });
  });
}

async function ctxUser(browser, name, contextOptions = null) {
  const ctx = await browser.newContext(
    contextOptions && typeof contextOptions === "object"
      ? contextOptions
      : { viewport: { width: 1280, height: 900 } }
  );
  installStatefulArcadeVaultMock(ctx);
  await silenceNextWebpackHmr(ctx);
  const pid = randomUUID();
  await ctx.addInitScript(
    ([d, p]) => {
      localStorage.setItem("ov2_display_name_v1", d);
      localStorage.setItem("ov2_participant_id_v1", p);
      try {
        const KEY = "mleo_rush_core_v4";
        const raw = localStorage.getItem(KEY);
        const o = raw ? JSON.parse(raw) : {};
        const base = typeof o === "object" && o && !Array.isArray(o) ? o : {};
        base.vault = Math.max(Number(base.vault) || 0, 10_000_000);
        localStorage.setItem(KEY, JSON.stringify(base));
      } catch {
        /* ignore */
      }
    },
    [name, pid]
  );
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  return { ctx, page, pid };
}

async function lobby(page) {
  await page.goto(`${BASE}/online-v2/rooms`, { waitUntil: "commit", timeout: 180000 }).catch(async () => {
    await page.goto(`${BASE}/online-v2/rooms`, { waitUntil: "load", timeout: 180000 });
  });
  await page.evaluate(() => {
    document.querySelectorAll("style[data-next-hide-fouc]").forEach(el => el.remove());
  });
  await page.waitForFunction(
    () => document.body && document.body.innerText.includes("Central lobby"),
    null,
    { timeout: 180000 }
  );
  await page.waitForFunction(
    () => {
      const refreshEl = Array.from(document.querySelectorAll("button")).find(b =>
        /^\s*Refresh\s*$/i.test((b.textContent || "").trim())
      );
      const nameEl = document.querySelector('input[placeholder="Display name"]');
      return (
        refreshEl &&
        refreshEl.offsetParent != null &&
        refreshEl.clientWidth > 0 &&
        nameEl &&
        nameEl.clientWidth > 0
      );
    },
    null,
    { timeout: 180000 }
  );
  await page.waitForTimeout(600);
}

async function fillDisplay(page, name) {
  const el = page.locator('input[placeholder="Display name"]');
  await el.waitFor({ state: "attached" });
  await el.fill(name, { force: true });
}

async function openCreateModal(page) {
  await page.evaluate(() => {
    document.querySelectorAll("style[data-next-hide-fouc]").forEach(el => el.remove());
  });
  const lobbyCreate = page.locator("main.online-v2-rooms-main").getByRole("button", { name: "Create room" }).first();
  await lobbyCreate.waitFor({ state: "visible", timeout: 180000 });
  await lobbyCreate.click({ force: true });
  await page.getByPlaceholder("Room title").waitFor({ state: "visible", timeout: 60000 });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ title: string, visibility: string, gameLabel: string, stake?: number }} opts
 */
async function submitCreate(page, { title, visibility, gameLabel, stake = STAKE }) {
  await openCreateModal(page);
  if (gameLabel) await page.locator("select").nth(0).selectOption({ label: gameLabel });
  await page.getByPlaceholder("Room title").fill(title, { force: true });
  const stakeInput = page.locator('input[placeholder="Room entry per seat"]');
  if ((await stakeInput.count()) > 0) {
    await stakeInput.fill(String(stake), { force: true });
  }
  await page.locator("select").nth(1).selectOption(visibility);
  await page.getByRole("button", { name: "Create room" }).last().click({ force: true });
  await page.waitForURL(/room=/, { timeout: 90000 });
}

async function leaveRoom(page) {
  await page.getByRole("button", { name: "Leave room" }).click({ force: true });
  await page.waitForFunction(() => !window.location.search.includes("room="), null, { timeout: 90000 });
}

/** @param {unknown[]} arr @param {number} k @returns {Generator<unknown[]>} */
function* combinations(arr, k) {
  if (k === 0) {
    yield [];
    return;
  }
  if (arr.length < k) return;
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    for (const tail of combinations(arr.slice(i + 1), k - 1)) {
      yield [head, ...tail];
    }
  }
}

/** Cap partition search cost (14-card full partition can explode). */
const PARTITION_BUDGET = 250_000;
let partitionSteps = 0;

/**
 * Partition all cards in `remaining` into valid melds (each size ≥3) such that isLegalInitialOpen(melds).
 * @param {import("../lib/online-v2/rummy51/ov2Rummy51Engine.js").Rummy51Card[]} remaining
 * @param {import("../lib/online-v2/rummy51/ov2Rummy51Engine.js").Rummy51Card[][]} acc
 * @returns {import("../lib/online-v2/rummy51/ov2Rummy51Engine.js").Rummy51Card[][] | null}
 */
function partitionIntoOpeningMelds(remaining, acc) {
  if (partitionSteps++ > PARTITION_BUDGET) return null;
  if (remaining.length === 0) {
    return isLegalInitialOpen(acc) ? acc : null;
  }
  for (let k = 3; k <= remaining.length; k++) {
    for (const pick of combinations(remaining, k)) {
      if (classifyMeld(pick) === "invalid") continue;
      const idPick = new Set(pick.map(c => c.id));
      const rest = remaining.filter(c => !idPick.has(c.id));
      const out = partitionIntoOpeningMelds(rest, [...acc, pick]);
      if (out) return out;
    }
  }
  return null;
}

/**
 * Find initial open + discard that empties hand (15 cards after stock draw).
 * @param {unknown[]} handRaw
 * @returns {{ melds: import("../lib/online-v2/rummy51/ov2Rummy51Engine.js").Rummy51Card[][], discardId: string } | null}
 */
function findOpeningWinningTurn(handRaw) {
  /** @type {import("../lib/online-v2/rummy51/ov2Rummy51Engine.js").Rummy51Card[]} */
  const cards = [];
  for (const r of handRaw) {
    try {
      cards.push(deserializeCard(r));
    } catch {
      return null;
    }
  }
  if (cards.length !== 15) return null;

  for (let di = 0; di < cards.length; di++) {
    const discard = cards[di];
    const rest = cards.filter((_, j) => j !== di);
    partitionSteps = 0;
    const melds = partitionIntoOpeningMelds(rest, []);
    if (melds) return { melds, discardId: discard.id };
  }
  return null;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string[]} handOrderIds visible card order (left-to-right)
 * @param {string[]} idsToToggle
 */
async function clickCardIdsInHand(page, handOrderIds, idsToToggle) {
  const row = page.locator('[aria-label="Your cards"]');
  await row.waitFor({ state: "visible", timeout: 60000 });
  for (const id of idsToToggle) {
    const idx = handOrderIds.indexOf(id);
    if (idx < 0) throw new Error(`card id not in hand order: ${id}`);
    await row.locator("button").nth(idx).click({ force: true });
    await page.waitForTimeout(120);
  }
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} selfKey
 * @param {{ last: object|null }} bucket
 */
async function tryPlayOpeningWinTurn(page, selfKey, bucket) {
  let snap = bucket.last;
  if (!snap || String(snap.phase) !== "playing") return false;
  if (String(snap.turnParticipantKey || "").trim() !== String(selfKey).trim()) return false;

  const pend = snap.pendingDrawSource != null ? String(snap.pendingDrawSource).trim() : "";
  if (!pend) {
    await page.getByRole("button", { name: "Draw stock" }).click({ force: true });
    await page.waitForTimeout(1500);
    snap = bucket.last;
  }

  const pend2 = snap?.pendingDrawSource != null ? String(snap.pendingDrawSource).trim() : "";
  if (!pend2) return false;

  if (!snap?.hands || typeof snap.hands !== "object") return false;
  const handRaw = snap.hands[selfKey];
  if (!Array.isArray(handRaw) || handRaw.length < 15) return false;

  const plan = findOpeningWinningTurn(handRaw);
  if (!plan) return false;

  const orderIds = handRaw.map(c => String(c?.id || ""));
  for (const meld of plan.melds) {
    const ids = meld.map(c => c.id);
    await clickCardIdsInHand(page, orderIds, ids);
    await page.getByRole("button", { name: "Meld" }).click({ force: true });
    await page.waitForTimeout(400);
  }
  await page.getByRole("button", { name: "Discard" }).click({ force: true });
  await page.waitForTimeout(200);
  const buttons = page.locator('[aria-label="Your cards"] button');
  const n = await buttons.count();
  if (n === 1) {
    await buttons.first().click({ force: true });
  } else {
    const fresh = bucket.last?.hands?.[selfKey];
    const ord = Array.isArray(fresh) ? fresh.map(c => String(c?.id || "")) : orderIds;
    await clickCardIdsInHand(page, ord, [plan.discardId]);
  }
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Submit" }).click({ force: true });
  await page.waitForTimeout(2500);
  return true;
}

async function tryPlayDiscardOnlyTurn(page, selfKey, bucket) {
  let snap = bucket.last;
  if (!snap || String(snap.phase) !== "playing") return;
  if (String(snap.turnParticipantKey || "").trim() !== String(selfKey).trim()) return;

  const pend = snap.pendingDrawSource != null ? String(snap.pendingDrawSource).trim() : "";
  if (!pend) {
    await page.getByRole("button", { name: "Draw stock" }).click({ force: true });
    await page.waitForTimeout(1200);
    snap = bucket.last;
  }
  const pend2 = snap?.pendingDrawSource != null ? String(snap.pendingDrawSource).trim() : "";
  if (!pend2) return;

  const handRaw = snap?.hands?.[selfKey];
  if (!Array.isArray(handRaw) || handRaw.length < 1) return;
  const orderIds = handRaw.map(c => String(c?.id || ""));
  const discardId = orderIds[orderIds.length - 1];
  await page.getByRole("button", { name: "Discard" }).click({ force: true });
  await page.waitForTimeout(200);
  await clickCardIdsInHand(page, orderIds, [discardId]);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Submit" }).click({ force: true });
  await page.waitForTimeout(1500);
}

async function bothReachRummyTable(pA, pB, titlePrefix) {
  const stakeCommits = [];
  trackRpc(pA.page, "ov2_stake_commit", stakeCommits);
  trackRpc(pB.page, "ov2_stake_commit", stakeCommits);

  await lobby(pA.page);
  await fillDisplay(pA.page, `${titlePrefix}A`);
  const title = `${titlePrefix}-${Date.now()}`;
  await submitCreate(pA.page, { title, visibility: "public", gameLabel: "Rummy 51" });
  const roomUrl = pA.page.url();

  await pA.page.getByRole("button", { name: "Seat 1" }).click({ force: true });
  await pA.page.waitForTimeout(1200);

  await lobby(pB.page);
  await fillDisplay(pB.page, `${titlePrefix}B`);
  await pB.page.goto(roomUrl, { waitUntil: "commit", timeout: 180000 });
  await pB.page.getByRole("button", { name: "Leave room" }).waitFor({ state: "attached", timeout: 60000 });
  await pB.page.getByRole("button", { name: "Seat 2" }).click({ force: true });
  await pB.page.waitForTimeout(1500);

  const v0a = await readVault(pA.page);
  const v0b = await readVault(pB.page);

  await pA.page.getByRole("button", { name: "Start match" }).click({ force: true });
  await pA.page.waitForTimeout(2500);
  const joinB = pB.page.getByRole("button", { name: "Join match (stake)" });
  await joinB.waitFor({ state: "attached", timeout: 90000 });
  await joinB.click({ force: true });
  await pB.page.waitForTimeout(7000);
  const joinA = pA.page.getByRole("button", { name: "Join match (stake)" });
  if ((await joinA.count()) > 0) {
    await joinA.click({ force: true });
    await pA.page.waitForTimeout(6000);
  }

  await pA.page.waitForTimeout(1500);
  await pB.page.waitForTimeout(500);
  const vMidA = await readVault(pA.page);
  const vMidB = await readVault(pB.page);

  await pA.page.getByRole("button", { name: "Start match" }).click({ force: true });
  await pA.page.waitForTimeout(22000);

  const onA = /\/ov2-rummy51/.test(pA.page.url());
  const onB = /\/ov2-rummy51/.test(pB.page.url());
  return {
    title,
    roomUrl,
    v0a,
    v0b,
    vMidA,
    vMidB,
    stakeCommits: stakeCommits.length,
    onA,
    onB,
    pidA: pA.pid,
    pidB: pB.pid,
  };
}

async function runRummyStake(browser) {
  const pA = await ctxUser(browser, "RSA");
  const pB = await ctxUser(browser, "RSB");
  try {
    const probe = await fetch(`${BASE}/online-v2/rooms`, { redirect: "manual" });
    if (!probe.ok) {
      OUT.rummyStake = `FAIL: base ${BASE} returned HTTP ${probe.status}`;
      return;
    }

    const stakeHits = { n: 0 };
    pA.page.on("request", req => {
      if (req.url().includes("ov2_stake_commit")) stakeHits.n++;
    });
    pB.page.on("request", req => {
      if (req.url().includes("ov2_stake_commit")) stakeHits.n++;
    });

    await lobby(pA.page);
    await fillDisplay(pA.page, "RSA-E");
    const title = `RS-E-${Date.now()}`;
    await submitCreate(pA.page, { title, visibility: "public", gameLabel: "Rummy 51" });
    await pA.page.getByRole("button", { name: "Seat 1" }).click({ force: true });
    await pA.page.waitForTimeout(1000);

    await lobby(pB.page);
    await fillDisplay(pB.page, "RSB-E");
    await pB.page.goto(pA.page.url(), { waitUntil: "commit", timeout: 180000 });
    await pB.page.getByRole("button", { name: "Seat 2" }).click({ force: true });
    await pB.page.waitForTimeout(1200);

    await pA.page.getByRole("button", { name: "Start match" }).click({ force: true });
    await pA.page.waitForTimeout(2000);
    await pA.page.getByRole("button", { name: "Start match" }).click({ force: true });
    await pA.page.waitForTimeout(2500);
    const earlyNav = /\/ov2-rummy51/.test(pA.page.url());
    const earlyMsg = await pA.page.evaluate(() => document.body?.innerText || "").catch(() => "");

    const joinB = pB.page.getByRole("button", { name: "Join match (stake)" });
    await joinB.waitFor({ state: "attached", timeout: 90000 });
    await joinB.click({ force: true });
    await pB.page.waitForTimeout(7000);
    const joinA = pA.page.getByRole("button", { name: "Join match (stake)" });
    if ((await joinA.count()) > 0) await joinA.click({ force: true });
    await pA.page.waitForTimeout(6000);

    await pA.page.getByRole("button", { name: "Start match" }).click({ force: true });
    await pA.page.waitForTimeout(22000);

    const onTable = /\/ov2-rummy51/.test(pA.page.url()) && /\/ov2-rummy51/.test(pB.page.url());
    const parts = [
      !earlyNav || earlyMsg.includes("Waiting") || earlyMsg.includes("stake")
        ? "PASS: host cannot jump to table before stakes valid"
        : `FAIL: early navigate to rummy (unexpected) url=${pA.page.url()}`,
      stakeHits.n >= 2 ? `PASS: ov2_stake_commit observed (${stakeHits.n})` : `FAIL: stake commits (${stakeHits.n})`,
      onTable ? "PASS: both on /ov2-rummy51" : "FAIL: not both on live rummy",
    ];
    OUT.rummyStake = parts.join("; ");
  } finally {
    await pA.ctx.close();
    await pB.ctx.close();
  }
}

async function runRummyNormal(browser) {
  const maxRoomAttempts = Number(process.env.OV2_RUMMY_NORMAL_ATTEMPTS || "8") || 8;
  let lastFail = "";

  for (let attempt = 0; attempt < maxRoomAttempts; attempt++) {
    const pA = await ctxUser(browser, `RNA${attempt}`);
    const pB = await ctxUser(browser, `RNB${attempt}`);
    const bA = { last: null };
    const bB = { last: null };
    attachRummySnapshotSniffer(pA.page, bA);
    attachRummySnapshotSniffer(pB.page, bB);

    const claimHits = { a: 0, b: 0 };
    pA.page.on("request", req => {
      if (req.url().includes("ov2_rummy51_claim_settlement")) claimHits.a++;
    });
    pB.page.on("request", req => {
      if (req.url().includes("ov2_rummy51_claim_settlement")) claimHits.b++;
    });

    try {
      const r = await bothReachRummyTable(pA, pB, `RN${attempt}`);
      if (!r.onA || !r.onB) {
        lastFail = `FAIL: table open (A=${r.onA} B=${r.onB})`;
        continue;
      }

      const debitOk =
        r.vMidA <= r.v0a - STAKE + 1 &&
        r.vMidA >= r.v0a - STAKE - 1 &&
        r.vMidB <= r.v0b - STAKE + 1 &&
        r.vMidB >= r.v0b - STAKE - 1;
      if (!debitOk || r.stakeCommits < 2) {
        lastFail = `FAIL: vault after commit A ${r.v0a}→${r.vMidA} B ${r.v0b}→${r.vMidB} stakes=${r.stakeCommits}`;
        continue;
      }

      let finished = false;
      let openingPlayed = false;
      for (let i = 0; i < 100 && !finished; i++) {
        const snap = bA.last || bB.last;
        if (snap && String(snap.phase).toLowerCase() === "finished") {
          finished = true;
          break;
        }
        const turn = snap?.turnParticipantKey ? String(snap.turnParticipantKey).trim() : "";
        const active = turn === r.pidA ? pA.page : turn === r.pidB ? pB.page : null;
        const bucket = turn === r.pidA ? bA : bB;
        if (!active || !turn) {
          await pA.page.waitForTimeout(400);
          await pB.page.waitForTimeout(400);
          continue;
        }
        const played = await tryPlayOpeningWinTurn(active, turn, bucket);
        if (played) openingPlayed = true;
        else await tryPlayDiscardOnlyTurn(active, turn, bucket);

        const s2 = bA.last || bB.last;
        if (s2 && String(s2.phase).toLowerCase() === "finished") finished = true;
      }

      if (!finished) {
        lastFail = `FAIL: phase not finished (attempt ${attempt + 1}/${maxRoomAttempts}, openingPlayed=${openingPlayed})`;
        continue;
      }

      await pA.page.waitForTimeout(4000);
      await pB.page.waitForTimeout(4000);

      const vEndA = await readVault(pA.page);
      const vEndB = await readVault(pB.page);
      const pot = STAKE * 2;
      const dA = vEndA - r.vMidA;
      const dB = vEndB - r.vMidB;
      const hi = Math.max(dA, dB);
      const lo = Math.min(dA, dB);
      const winnerGainOk = hi >= pot - 2 && hi <= pot + 50_000;
      const loserFlatOk = lo <= 2 && lo >= -2;
      const claimOk = claimHits.a + claimHits.b > 0;

      if (!winnerGainOk || !loserFlatOk) {
        lastFail = `FAIL: econ dA=${dA} dB=${dB} pot=${pot}`;
        continue;
      }

      const parts = [
        `PASS: room attempt ${attempt + 1}/${maxRoomAttempts}`,
        "PASS: stakes debited before table",
        openingPlayed ? "PASS: one-turn opening win (partition solver)" : "PASS: match finished",
        winnerGainOk ? `PASS: winner vault +~full pot (${pot}; Δmax=${hi})` : `FAIL: winner delta dA=${dA} dB=${dB}`,
        loserFlatOk ? "PASS: loser vault flat after finish" : `FAIL: loser gained (dA=${dA} dB=${dB})`,
        claimOk ? "PASS: ov2_rummy51_claim_settlement requested" : "WARN: claim RPC not seen (timing)",
      ];
      OUT.rummyNormal = parts.join("; ");
      return;
    } catch (e) {
      lastFail = String(e?.message || e);
    } finally {
      try {
        await pA.ctx.close();
      } catch {
        /* ignore */
      }
      try {
        await pB.ctx.close();
      } catch {
        /* ignore */
      }
    }
  }

  OUT.rummyNormal = `${lastFail}; FAIL: exhausted ${maxRoomAttempts} room seeds (deal rarely yields one-turn legal open)`;
}

async function runRummyForfeit(browser) {
  const leaveRpc = [];
  const pA = await ctxUser(browser, "RFA");
  const pB = await ctxUser(browser, "RFB");
  const bA = { last: null };
  const bB = { last: null };
  attachRummySnapshotSniffer(pA.page, bA);
  attachRummySnapshotSniffer(pB.page, bB);

  trackRpc(pA.page, "ov2_shared_leave_room", leaveRpc);
  trackRpc(pB.page, "ov2_shared_leave_room", leaveRpc);

  const claimHits = { a: 0 };
  pA.page.on("request", req => {
    if (req.url().includes("ov2_rummy51_claim_settlement")) claimHits.a++;
  });

  try {
    const r = await bothReachRummyTable(pA, pB, "RF");
    if (!r.onA || !r.onB) {
      OUT.rummyForfeit = `FAIL: table (A=${r.onA} B=${r.onB})`;
      return;
    }

    for (let i = 0; i < 6; i++) {
      const snap = bA.last || bB.last;
      const turn = snap?.turnParticipantKey ? String(snap.turnParticipantKey).trim() : "";
      const active = turn === r.pidB ? pB.page : pA.page;
      const bucket = turn === r.pidB ? bB : bA;
      if (turn && snap && String(snap.phase) === "playing") {
        await tryPlayDiscardOnlyTurn(active, turn, bucket);
      } else await pA.page.waitForTimeout(500);
    }

    const leaveTableB = pB.page.getByRole("button", { name: "Leave table" });
    await leaveTableB.first().waitFor({ state: "attached", timeout: 120000 });
    await leaveTableB.first().click({ force: true });
    await pB.page.waitForURL(/\/online-v2\/rooms/, { timeout: 90000 });
    const bStuck = /ov2-rummy51/.test(pB.page.url());

    await pA.page.getByText(/Match finished|You won|Winner/i).first().waitFor({ state: "attached", timeout: 90000 }).catch(() => {});
    await pA.page.waitForTimeout(6000);

    const leaveWithForfeit = leaveRpc.some(
      x =>
        x.post &&
        (/p_forfeit_game["']?\s*:\s*true/i.test(x.post) ||
          x.post.includes('"p_forfeit_game":true') ||
          x.post.includes("'p_forfeit_game':true"))
    );
    const vWin = await readVault(pA.page);
    const pot = STAKE * 2;
    const gain = vWin - r.vMidA;
    const forfeitEconOk = gain >= pot - 2 && gain <= pot + 50_000;

    const parts = [
      leaveWithForfeit ? "PASS: p_forfeit_game on leave" : "FAIL: missing forfeit flag on leave RPC",
      !bStuck ? "PASS: leaver to lobby" : "FAIL: leaver stuck",
      claimHits.a > 0 ? "PASS: claim_settlement on winner path" : "WARN: claim RPC not observed",
      forfeitEconOk ? `PASS: winner vault +~full pot (Δ=${gain}, pot=${pot})` : `FAIL: winner delta ${gain} expected ~${pot} (vMid=${r.vMidA})`,
    ];
    OUT.rummyForfeit = parts.join("; ");
  } finally {
    await pA.ctx.close();
    await pB.ctx.close();
  }
}

function roomCard(page, title) {
  return page.locator("div").filter({ hasText: title }).filter({ has: page.getByRole("button", { name: "Join" }) });
}

async function joinCodeModal(page, code) {
  await page.getByRole("button", { name: "Join by code" }).click({ force: true });
  await page.getByPlaceholder("Room code").fill(code, { force: true });
  await page.getByRole("button", { name: "Join room" }).click({ force: true });
}

async function readJoinCode(page) {
  const el = page.locator("text=Code:").first();
  await el.waitFor({ state: "visible", timeout: 30000 });
  const t = await el.textContent();
  const m = t && t.match(/Code:\s*([A-Z0-9]+)/i);
  return m ? m[1].toUpperCase() : "";
}

async function runRegression(browser) {
  const { ctx, page } = await ctxUser(browser, "RR");
  const bits = [];
  try {
    await lobby(page);
    await fillDisplay(page, "RR");
    const pubTitle = `RR-P-${Date.now()}`;
    await submitCreate(page, { title: pubTitle, visibility: "public", gameLabel: "Rummy 51" });
    await leaveRoom(page);
    bits.push("PASS: leave one-click");

    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find(x =>
        /^\s*Refresh\s*$/i.test((x.textContent || "").trim())
      );
      if (b) b.click();
    });
    await page.waitForTimeout(5000);
    bits.push((await roomCard(page, pubTitle).count()) > 0 ? "PASS: empty-room list" : "FAIL: empty-room list");

    await submitCreate(page, { title: `RR-H-${Date.now()}`, visibility: "hidden", gameLabel: "Rummy 51" });
    const code = await readJoinCode(page);
    await leaveRoom(page);

    const u2 = await ctxUser(browser, "RR2");
    await lobby(u2.page);
    await fillDisplay(u2.page, "RR2");
    await joinCodeModal(u2.page, code);
    await u2.page.waitForURL(/room=/, { timeout: 90000 });
    bits.push("PASS: hidden join by code");
    await u2.ctx.close();

    await lobby(page);
    const mig = await page.evaluate(() =>
      /migration|migrations?\s+required|apply\s+pending/i.test(document.body.innerText || "")
    );
    bits.push(!mig ? "PASS: no migration-warning copy on lobby" : "FAIL: migration warning visible");

    OUT.regression = bits.join("; ");
  } catch (e) {
    OUT.regression = `FAIL: ${String(e?.message || e)}`;
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    await runRummyStake(browser);
    await runRummyNormal(browser);
    await runRummyForfeit(browser);
    await runRegression(browser);
  } catch (e) {
    OUT.blocker = String(e?.message || e);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(OUT, null, 2));
}

main();
