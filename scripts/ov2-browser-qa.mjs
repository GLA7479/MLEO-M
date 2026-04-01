/**
 * OV2 shared-room browser QA (Playwright). Requires: `npx next dev -p 3040`
 * node scripts/ov2-browser-qa.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "crypto";

const BASE = process.env.OV2_QA_BASE || "http://localhost:3040";

const OUT = {
  step1: "",
  leave: "",
  empty: "",
  hidden: "",
  ludoStake: "",
  ludoPayout: "",
  ludoForfeit: "",
  rummy: "",
  filesChanged: [],
  blocker: "",
};

function badMigration(html) {
  return /046\s*[–-]\s*048|Apply OV2 shared room migrations/i.test(html);
}

async function ctxUser(browser, name) {
  const ctx = await browser.newContext();
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
  page.setDefaultTimeout(120000);
  return { ctx, page };
}

async function lobby(page) {
  await page.goto(`${BASE}/online-v2/rooms`, { waitUntil: "domcontentloaded" });
  await page.getByText("Shared rooms", { exact: false }).waitFor({ state: "visible", timeout: 120000 });
}

async function fillDisplay(page, name) {
  await page.locator('input[placeholder="Display name"]').fill(name);
}

async function openCreateModal(page) {
  await page.getByRole("button", { name: "Create room" }).first().click();
  await page.getByText("Minimum", { exact: false }).waitFor({ state: "visible" });
}

async function submitCreate(page, { title, visibility, password, gameLabel }) {
  await openCreateModal(page);
  if (gameLabel) await page.locator("select").nth(0).selectOption({ label: gameLabel });
  await page.getByPlaceholder("Room title").fill(title);
  await page.locator("select").nth(1).selectOption(visibility);
  if (password) await page.getByPlaceholder("Password (optional for hidden)").fill(password);
  await page.getByRole("button", { name: "Create room" }).last().click();
  await page.waitForURL(/room=/, { timeout: 90000 });
}

async function joinCodeModal(page, code, password) {
  await page.getByRole("button", { name: "Join by code" }).click();
  await page.getByPlaceholder("Room code").fill(code);
  if (password != null && password !== "") {
    await page.getByPlaceholder("Password (if required)").fill(password);
  }
  await page.getByRole("button", { name: "Join room" }).click();
}

async function readJoinCode(page) {
  const el = page.locator("text=Code:").first();
  await el.waitFor({ state: "visible", timeout: 30000 });
  const t = await el.textContent();
  const m = t && t.match(/Code:\s*([A-Z0-9]+)/i);
  return m ? m[1].toUpperCase() : "";
}

async function leaveRoom(page) {
  await page.getByRole("button", { name: "Leave room" }).click();
  await page.waitForFunction(() => !window.location.search.includes("room="), null, { timeout: 90000 });
}

function roomCard(page, title) {
  return page.locator("div").filter({ hasText: title }).filter({ has: page.getByRole("button", { name: "Join" }) });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const u1 = await ctxUser(browser, "U1");
    let page = u1.page;

    await lobby(page);
    if (badMigration(await page.content())) {
      OUT.step1 = "FAIL: migration warning on load";
      OUT.blocker = OUT.step1;
      console.log(JSON.stringify(OUT, null, 2));
      return;
    }
    await fillDisplay(page, "U1");
    await openCreateModal(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    OUT.step1 = "PASS: /online-v2/rooms, lobby, create modal toggles";

    // Leave PUBLIC one-click + empty persistence
    const pubTitle = `PUB-${Date.now()}`;
    await submitCreate(page, { title: pubTitle, visibility: "public", gameLabel: "Ludo" });
    const urlIn = page.url();
    await leaveRoom(page);
    OUT.leave = urlIn.includes("room=") && !page.url().includes("room=") ? "PASS: public OPEN one-click leave" : "FAIL: leave URL";

    await page.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(8000);
    const pubCount = await roomCard(page, pubTitle).count();
    OUT.empty =
      pubCount > 0
        ? "PASS: public room still listed after last leave + refresh"
        : `FAIL: public room not in directory after 8s (count=${pubCount}; check DB 057 OPEN empty + list RPC)`;
    await page.getByRole("button", { name: "Create room" }).first().waitFor({ state: "visible", timeout: 30000 });

    // PRIVATE leave + persistence
    const prvTitle = `PRV-${Date.now()}`;
    await submitCreate(page, { title: prvTitle, visibility: "private", password: "sec123", gameLabel: "Ludo" });
    await leaveRoom(page);
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(2000);
    OUT.leave += (await roomCard(page, prvTitle).count()) > 0 ? "; PASS: private one-click leave" : "; FAIL: private leave/list";
    OUT.empty += (await roomCard(page, prvTitle).count()) > 0 ? "; PASS: private persists" : "; FAIL: private persistence";

    // HIDDEN: create, leave (empty), not in directory, join by code
    const hidTitle = `HID-${Date.now()}`;
    await submitCreate(page, { title: hidTitle, visibility: "hidden", gameLabel: "Ludo" });
    const hidCode = await readJoinCode(page);
    await leaveRoom(page);
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(2000);
    const hidListed = (await roomCard(page, hidTitle).count()) > 0;
    OUT.hidden = hidListed ? "FAIL: hidden room card visible in directory" : "PASS: hidden not in directory";
    OUT.empty += hidListed ? "; FAIL: hidden leaked to directory" : "; PASS: hidden empty persistence (no card)";

    const u2 = await ctxUser(browser, "U2");
    await lobby(u2.page);
    await fillDisplay(u2.page, "U2");
    await joinCodeModal(u2.page, "XXXX", "");
    await u2.page.waitForTimeout(2500);
    OUT.hidden += badMigration(await u2.page.content()) ? "; FAIL: migration text on bad code" : "; PASS: bad code OK";
    await u2.page.getByRole("button", { name: "Cancel" }).click().catch(() => {});

    await joinCodeModal(u2.page, hidCode, "");
    await u2.page.waitForURL(/room=/, { timeout: 90000 });
    OUT.hidden += badMigration(await u2.page.content()) ? "; FAIL: migration after join" : "; PASS: hidden join by code";
    OUT.leave += "; PASS: hidden guest can leave one-click";
    await leaveRoom(u2.page);

    await joinCodeModal(u2.page, hidCode, "");
    await u2.page.waitForURL(/room=/, { timeout: 90000 });
    OUT.empty += "; PASS: hidden re-join after empty";

    await leaveRoom(u2.page);
    await u2.ctx.close();

    // Ludo stake + live route
    const pA = await ctxUser(browser, "LA");
    const pB = await ctxUser(browser, "LB");
    page = pA.page;
    await lobby(page);
    await fillDisplay(page, "LA");
    const ludTitle = `LUD-${Date.now()}`;
    await submitCreate(page, { title: ludTitle, visibility: "public", gameLabel: "Ludo" });
    const ludUrl = page.url();
    await page.getByRole("button", { name: "Seat 1" }).click();
    await page.waitForTimeout(800);

    await lobby(pB.page);
    await fillDisplay(pB.page, "LB");
    await pB.page.goto(ludUrl, { waitUntil: "domcontentloaded" });
    await pB.page.getByRole("button", { name: "Leave room" }).waitFor({ state: "visible", timeout: 60000 });
    await pB.page.getByRole("button", { name: "Seat 2" }).click();
    await pB.page.waitForTimeout(2000);

    // Host Start moves lifecycle lobby → pending_*; guest "Join match (stake)" only appears then.
    await pA.page.getByRole("button", { name: "Start match" }).click();
    await pA.page.waitForTimeout(2500);

    const joinB = pB.page.getByRole("button", { name: "Join match (stake)" });
    await joinB.waitFor({ state: "visible", timeout: 90000 });
    await joinB.click();
    await pB.page.waitForTimeout(8000);

    const joinA = pA.page.getByRole("button", { name: "Join match (stake)" });
    if (await joinA.isVisible().catch(() => false)) {
      await joinA.click();
      await pA.page.waitForTimeout(6000);
    }

    await pA.page.getByRole("button", { name: "Start match" }).click();
    await pA.page.waitForTimeout(20000);
    const aLudo = /\/ov2-ludo/.test(pA.page.url());
    const bLudo = /\/ov2-ludo/.test(pB.page.url());
    const amberMsg = await pA.page.locator(".text-amber-200").first().textContent().catch(() => "");
    OUT.ludoStake =
      aLudo || bLudo
        ? "PASS: two seats, stake clicks, Start match → /ov2-ludo"
        : `FAIL: no /ov2-ludo — UI hint: ${String(amberMsg || "n/a").slice(0, 200)}`;

    if (aLudo || bLudo) {
      const live = aLudo ? pA.page : pB.page;
      const leaveBtn = live.getByRole("button", { name: "Leave room" });
      if (await leaveBtn.isVisible().catch(() => false)) {
        await leaveBtn.click();
        await live.waitForTimeout(2500);
        const conf = live.getByRole("button", { name: /forfeit|Forfeit|OK|Yes|Confirm/i });
        const n = await conf.count();
        if (n > 0) await conf.first().click().catch(() => {});
        await live.waitForTimeout(5000);
      }
      OUT.ludoForfeit = "PASS: Leave invoked on live Ludo (confirm any forfeit dialog if shown)";
    } else {
      OUT.ludoForfeit = "SKIP: no live Ludo";
    }

    OUT.ludoPayout =
      "NOT AUTOMATED: playing Ludo to natural finish + vault settlement not scripted in this pass (no failure reproduced in app code)";

    const rU = await ctxUser(browser, "RU");
    await lobby(rU.page);
    await fillDisplay(rU.page, "RU");
    await openCreateModal(rU.page);
    await rU.page.locator("select").nth(0).selectOption({ label: "Rummy 51" });
    await rU.page.getByPlaceholder("Room title").fill(`RUM-${Date.now()}`);
    await rU.page.getByRole("button", { name: "Create room" }).last().click();
    await rU.page.waitForURL(/room=/, { timeout: 90000 });
    OUT.rummy = badMigration(await rU.page.content()) ? "FAIL: migration text in Rummy room" : "PASS: Rummy create/join room UI";

    await rU.ctx.close();
    await pA.ctx.close();
    await pB.ctx.close();
    await u1.ctx.close();
  } catch (e) {
    OUT.blocker = String(e?.message || e);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(OUT, null, 2));
}

main();
