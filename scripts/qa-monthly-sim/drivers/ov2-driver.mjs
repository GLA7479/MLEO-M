import fs from "fs";
import path from "path";
import { timingFields } from "../lib/logHelpers.mjs";
import { chromium } from "playwright";
import { browserStatePath } from "../checkpoint.mjs";

export async function runOv2Action(ctx, item) {
  const { persona, logger, stats, baseUrl, mock, coverage } = ctx;
  const action = item?.action || "ov2_lobby";
  const gameId = item?.params?.ov2GameId;
  const gameTitle = item?.params?.ov2GameTitle;
  const url = (baseUrl || process.env.QA_SIM_BASE || process.env.OV2_QA_BASE || "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  if (action !== "ov2_lobby" && action !== "ov2_room_create" && action !== "ov2_room_smoke") {
    return { ok: false, data: { message: "unknown ov2 action" } };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const storage = browserStatePath(persona.id);
    const contextOpts = fs.existsSync(storage) ? { storageState: storage } : {};
    const browserCtx = await browser.newContext(contextOpts);
    if (mock) {
      await browserCtx.route("**/api/arcade/vault/balance", route =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ balance: 99_000_000 }),
        })
      );
    }
    await browserCtx.addInitScript(([d, pid]) => {
      localStorage.setItem("ov2_display_name_v1", d);
      localStorage.setItem("ov2_participant_id_v1", pid);
    }, [persona.displayName, `qa-${persona.id}-participant`]);

    const page = await browserCtx.newPage();
    page.setDefaultTimeout(120000);
    const started = Date.now();
    await page.goto(`${url}/online-v2/rooms`, { waitUntil: "domcontentloaded" });
    await page.getByText("Shared rooms", { exact: false }).waitFor({ state: "visible", timeout: 60000 });
    const hasMigration = /Apply OV2 shared room migrations/i.test(await page.content());

    let outcome = "ok";
    let errorMessage = null;
    let coverageStatus = "covered";

    if (hasMigration) {
      outcome = "error";
      errorMessage = "OV2 migration warning visible";
      coverageStatus = "error";
      stats.errors += 1;
    } else if (action === "ov2_lobby") {
      coverageStatus = "covered";
      if (gameId) coverage?.recordOv2(gameId, "covered", "lobby_visit");
    } else if (action === "ov2_room_create" || action === "ov2_room_smoke") {
      if (!gameTitle) {
        coverageStatus = "coverage_gap";
        errorMessage = "missing ov2 game title in schedule";
      } else {
        await page.locator('input[placeholder="Display name"]').fill(persona.displayName);
        await page.getByRole("button", { name: "Create room" }).first().click();
        await page.getByText("Minimum", { exact: false }).waitFor({ state: "visible" });
        const title = `QA-${persona.id}-${gameId || "game"}-${Date.now()}`;
        try {
          await page.locator("select").nth(0).selectOption({ label: gameTitle });
        } catch (e) {
          coverageStatus = "coverage_gap";
          errorMessage = `lobby game label not found: ${gameTitle} — ${e.message}`;
        }
        if (coverageStatus !== "coverage_gap") {
          await page.getByPlaceholder("Room title").fill(title);
          await page.locator("select").nth(1).selectOption("public");
          await page.getByRole("button", { name: "Create room" }).last().click();
          try {
            await page.waitForURL(/room=/, { timeout: 90000 });
            await page.getByRole("button", { name: "Leave room" }).click();
            await page.waitForFunction(() => !window.location.search.includes("room="), null, {
              timeout: 90000,
            });
            coverageStatus = "covered";
          } catch (e) {
            outcome = "error";
            coverageStatus = gameTitle === "Ludo" ? "error" : "coverage_gap";
            errorMessage = String(e?.message || e);
            stats.errors += 1;
          }
        }
        if (gameId) coverage?.recordOv2(gameId, coverageStatus, errorMessage || "room_create_leave");
      }
    }

    stats.ov2Sessions += 1;
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "ov2",
      action,
      gameKey: gameId,
      outcome: coverageStatus,
      errorMessage,
      responseMs: Date.now() - started,
      rawResponse: { url: page.url(), migrationWarning: hasMigration, gameTitle, gameId },
    });

    fs.mkdirSync(path.dirname(storage), { recursive: true });
    await browserCtx.storageState({ path: storage });
    await browserCtx.close();
    return { ok: outcome === "ok" && coverageStatus === "covered" };
  } finally {
    await browser.close();
  }
}
