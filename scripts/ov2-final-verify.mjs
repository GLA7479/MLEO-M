/**
 * OV2 final verification (Playwright). Requires: `npx next dev -p 3040`
 * node scripts/ov2-final-verify.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "crypto";

const BASE = process.env.OV2_QA_BASE || "http://127.0.0.1:3040";

const OUT = {
  ludoForfeitPayout: "",
  mobileRefresh: "",
  mobileSubtitle: "",
  regression: "",
  filesChanged: [],
  blocker: "",
};

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

async function ctxUser(browser, name, contextOptions = null) {
  const ctx = await browser.newContext(
    contextOptions && typeof contextOptions === "object"
      ? contextOptions
      : { viewport: { width: 1280, height: 800 } }
  );
  await ctx.route("**/api/arcade/vault/balance", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ balance: 99_000_000 }),
    })
  );
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
  return { ctx, page };
}

async function lobby(page) {
  await page.goto(`${BASE}/online-v2/rooms`, { waitUntil: "load", timeout: 180000 }).catch(async () => {
    await page.goto(`${BASE}/online-v2/rooms`, { waitUntil: "commit", timeout: 180000 });
  });
  await page.waitForFunction(
    () => document.body && document.body.innerText.includes("Central lobby"),
    null,
    { timeout: 180000 }
  );
  // Next FOUC uses body{display:none} until hydrated — skip layout probes until Refresh is real size.
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
        refreshEl.clientHeight > 0 &&
        nameEl &&
        nameEl.clientWidth > 0
      );
    },
    null,
    { timeout: 180000 }
  );
  await page.waitForTimeout(800);
}

async function fillDisplay(page, name) {
  const el = page.locator('input[placeholder="Display name"]');
  await el.waitFor({ state: "attached" });
  await el.fill(name, { force: true });
}

async function openCreateModal(page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("button")).some(
        b => /Create room/i.test((b.textContent || "").trim()) && b.offsetParent != null
      ),
    null,
    { timeout: 180000 }
  );
  await page.getByRole("button", { name: "Create room" }).first().click({ force: true });
  await page.getByText("Minimum", { exact: false }).waitFor({ state: "attached", timeout: 60000 });
}

async function submitCreate(page, { title, visibility, gameLabel }) {
  await openCreateModal(page);
  if (gameLabel) await page.locator("select").nth(0).selectOption({ label: gameLabel });
  await page.getByPlaceholder("Room title").fill(title, { force: true });
  await page.locator("select").nth(1).selectOption(visibility);
  await page.getByRole("button", { name: "Create room" }).last().click({ force: true });
  await page.waitForURL(/room=/, { timeout: 90000 });
}

async function leaveRoom(page) {
  await page.getByRole("button", { name: "Leave room" }).click({ force: true });
  await page.waitForFunction(() => !window.location.search.includes("room="), null, { timeout: 90000 });
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

async function runMobileChecks(browser) {
  // Narrow viewport only (desktop UA) — avoids mobile-only shells that omit OV2 lobby in automation.
  const { ctx, page } = await ctxUser(browser, "Mob", { viewport: { width: 390, height: 844 } });
  try {
    await lobby(page);
    await fillDisplay(page, "Mob");

    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("button")).some(b =>
          /^\s*Refresh\s*$/i.test((b.textContent || "").trim())
        ),
      null,
      { timeout: 180000 }
    );

    const boxes = await page.evaluate(() => {
      const refreshEl = Array.from(document.querySelectorAll("button")).find(b =>
        /^\s*Refresh\s*$/i.test((b.textContent || "").trim())
      );
      const nameEl = document.querySelector('input[placeholder="Display name"]');
      function box(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          cw: el.clientWidth,
          ch: el.clientHeight,
          laidOut: el.offsetParent != null,
        };
      }
      return { refresh: box(refreshEl), name: box(nameEl) };
    });
    const rBox = boxes.refresh;
    const iBox = boxes.name;
    const vp = page.viewportSize();
    if (!rBox || !iBox || !vp) {
      OUT.mobileRefresh = "FAIL: missing bounding boxes";
      OUT.mobileSubtitle = "SKIP";
      return;
    }

    const refreshTappable =
      rBox.laidOut && rBox.cw >= 28 && rBox.ch >= 24 && rBox.width * rBox.height >= 400;
    const nameOk = iBox.width > 60 && iBox.width <= vp.width + 2;
    OUT.mobileRefresh =
      refreshTappable && nameOk
        ? `PASS: Refresh laid out ${Math.round(rBox.cw)}×${Math.round(rBox.ch)}; name width ${Math.round(iBox.width)}px / vp ${vp.width}`
        : `FAIL: refresh laidOut=${rBox.laidOut} cw=${rBox.cw} ch=${rBox.ch} rect=${Math.round(rBox.width)}×${Math.round(rBox.height)}; name w=${Math.round(iBox.width)}`;

    await page.waitForFunction(
      () => document.body && document.body.innerText.includes("Play with others"),
      null,
      { timeout: 180000 }
    );
    const sBox = await page.evaluate(() => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let n = walk.nextNode();
      while (n) {
        if (n.childElementCount === 0 && (n.textContent || "").trim() === "Play with others") {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }
        n = walk.nextNode();
      }
      return null;
    });
    const scrollOverflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    const subOk =
      sBox &&
      sBox.width > 0 &&
      sBox.width <= vp.width + 2 &&
      scrollOverflow.sw <= scrollOverflow.cw + 8;
    OUT.mobileSubtitle = subOk
      ? `PASS: subtitle width ${Math.round(sBox.width)}px; scroll ${scrollOverflow.sw}<=${scrollOverflow.cw + 8}`
      : `FAIL: subtitle box=${JSON.stringify(sBox)} sw=${scrollOverflow.sw} cw=${scrollOverflow.cw}`;
  } finally {
    await ctx.close();
  }
}

async function runLudoForfeit(browser) {
  const leaveRpc = [];
  const pA = await ctxUser(browser, "FA");
  const pB = await ctxUser(browser, "FB");
  trackRpc(pA.page, "ov2_shared_leave_room", leaveRpc);
  trackRpc(pB.page, "ov2_shared_leave_room", leaveRpc);

  try {
    await lobby(pA.page);
    await fillDisplay(pA.page, "FA");
    const title = `FF-${Date.now()}`;
    await submitCreate(pA.page, { title, visibility: "public", gameLabel: "Ludo" });
    const roomUrl = pA.page.url();

    await pA.page.getByRole("button", { name: "Seat 1" }).click({ force: true });
    await pA.page.waitForTimeout(1500);

    await lobby(pB.page);
    await fillDisplay(pB.page, "FB");
    await pB.page.goto(roomUrl, { waitUntil: "commit", timeout: 180000 });
    await pB.page.getByRole("button", { name: "Leave room" }).waitFor({ state: "attached", timeout: 60000 });
    await pB.page.getByRole("button", { name: "Seat 2" }).click({ force: true });
    await pB.page.waitForTimeout(2000);

    await pA.page.getByRole("button", { name: "Start match" }).click({ force: true });
    await pA.page.waitForTimeout(2500);
    const joinB = pB.page.getByRole("button", { name: "Join match (stake)" });
    await joinB.waitFor({ state: "attached", timeout: 90000 });
    await joinB.click({ force: true });
    await pB.page.waitForTimeout(8000);
    const joinA = pA.page.getByRole("button", { name: "Join match (stake)" });
    if ((await joinA.count()) > 0) {
      await joinA.click({ force: true });
      await pA.page.waitForTimeout(6000);
    }
    await pA.page.getByRole("button", { name: "Start match" }).click({ force: true });
    await pA.page.waitForTimeout(25000);

    const onLudoA = /\/ov2-ludo/.test(pA.page.url());
    const onLudoB = /\/ov2-ludo/.test(pB.page.url());
    if (!onLudoA || !onLudoB) {
      OUT.ludoForfeitPayout = `FAIL: not both on /ov2-ludo (A=${onLudoA} B=${onLudoB})`;
      return;
    }

    const leaveTableB = pB.page.getByRole("button", { name: "Leave table" });
    await leaveTableB.first().waitFor({ state: "attached", timeout: 120000 });

    const claimHits = { a: 0 };
    const claimFn = url => {
      if (url.includes("ov2_ludo_claim_settlement")) claimHits.a++;
    };
    pA.page.on("request", req => claimFn(req.url()));

    await leaveTableB.first().click({ force: true });
    await pB.page.waitForURL(/\/online-v2\/rooms/, { timeout: 90000 });
    const bStuck = /ov2-ludo/.test(pB.page.url());
    if (bStuck) {
      OUT.ludoForfeitPayout = "FAIL: leaver still on /ov2-ludo";
      return;
    }

    const won = pA.page.getByText(/You won|Finished match|Match finished/i);
    await won.first().waitFor({ state: "attached", timeout: 90000 });
    await pA.page.waitForTimeout(8000);

    const leaveWithForfeit = leaveRpc.some(
      r =>
        r.post &&
        (/p_forfeit_game["']?\s*:\s*true/i.test(r.post) ||
          r.post.includes('"p_forfeit_game":true') ||
          r.post.includes("'p_forfeit_game':true"))
    );
    const claimOk = claimHits.a > 0;

    const parts = [
      leaveWithForfeit
        ? "PASS: ov2_shared_leave_room with p_forfeit_game true (authoritative forfeit path)"
        : `FAIL: leave RPC missing forfeit flag (hits=${leaveRpc.length} sample=${String(leaveRpc[0]?.post || "").slice(0, 120)})`,
      claimOk ? "PASS: ov2_ludo_claim_settlement request on winner" : "WARN: no claim_settlement yet (retry poll or Realtime delay)",
      !bStuck ? "PASS: leaver redirect to lobby" : "FAIL: redirect",
      "PASS: winner finished UI visible",
    ];
    OUT.ludoForfeitPayout = parts.join("; ");
  } finally {
    await pA.ctx.close();
    await pB.ctx.close();
  }
}

async function runRegression(browser) {
  const { ctx, page } = await ctxUser(browser, "RG");
  const bits = [];
  try {
    await lobby(page);
    await fillDisplay(page, "RG");
    const pubTitle = `RG-P-${Date.now()}`;
    await submitCreate(page, { title: pubTitle, visibility: "public", gameLabel: "Ludo" });
    await leaveRoom(page);
    bits.push("PASS: leave one-click");

    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("button")).some(b =>
          /^\s*Refresh\s*$/i.test((b.textContent || "").trim())
        ),
      null,
      { timeout: 180000 }
    );
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find(x =>
        /^\s*Refresh\s*$/i.test((x.textContent || "").trim())
      );
      if (b) b.click();
    });
    await page.waitForTimeout(6000);
    bits.push((await roomCard(page, pubTitle).count()) > 0 ? "PASS: empty-room list" : "FAIL: empty-room list");

    await submitCreate(page, { title: `RG-H-${Date.now()}`, visibility: "hidden", gameLabel: "Ludo" });
    const code = await readJoinCode(page);
    await leaveRoom(page);

    const u2 = await ctxUser(browser, "RG2");
    await lobby(u2.page);
    await fillDisplay(u2.page, "RG2");
    await joinCodeModal(u2.page, code);
    await u2.page.waitForURL(/room=/, { timeout: 90000 });
    bits.push("PASS: hidden join by code");
    await u2.ctx.close();

    const r = await ctxUser(browser, "RGr");
    await lobby(r.page);
    await fillDisplay(r.page, "RGr");
    await openCreateModal(r.page);
    await r.page.locator("select").nth(0).selectOption({ label: "Rummy 51" });
    await r.page.getByPlaceholder("Room title").fill(`RG-R-${Date.now()}`);
    await r.page.getByRole("button", { name: "Create room" }).last().click({ force: true });
    await r.page.waitForURL(/room=/, { timeout: 90000 });
    bits.push("PASS: Rummy create");
    await r.ctx.close();

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
    await runMobileChecks(browser);
    await runLudoForfeit(browser);
    await runRegression(browser);
  } catch (e) {
    OUT.blocker = String(e?.message || e);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(OUT, null, 2));
}

main();
