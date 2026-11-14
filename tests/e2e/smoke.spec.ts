import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __setpoint: any;
  }
}

const G = "window.__setpoint.game.getState()";

async function boot(page: Page, opts: { skipTutorial?: boolean } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.__setpoint);
  if (opts.skipTutorial) await page.evaluate(() => window.__setpoint.save.getState().setTutorialDone());
  return errors;
}

async function enterMission(page: Page, id = "first-contact") {
  await page.evaluate(`${G}.openMission("${id}")`);
  await page.getByTestId("btn-begin").click();
  await page.getByTestId("skip-intro").click();
  await expect(page.getByTestId("btn-golive")).toBeVisible();
}

const phase = (page: Page) => page.evaluate(`${G}.game?.phase`);

test("menu renders a 3D scene and leads into the first mission", async ({ page }) => {
  const errors = await boot(page);
  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByTestId("btn-play").click();
  await expect(page.getByTestId("briefing")).toContainText("FIRST CONTACT");
  await page.getByTestId("btn-begin").click();
  await page.getByTestId("skip-intro").click();
  await expect(page.getByTestId("gauge-output")).toContainText("84");
  await expect(page.getByTestId("coach")).toBeVisible();
  expect(errors).toEqual([]);
});

test("tutorial: sensors, go live, investigate, isolate, remediate, reconnect through the UI", async ({ page }) => {
  await boot(page);
  await page.getByTestId("btn-play").click();
  await page.getByTestId("btn-begin").click();
  await page.getByTestId("skip-intro").click();

  await page.getByTestId("coach-next").click(); // camera step
  await page.keyboard.press("Tab"); // cyber view
  await expect(page.getByTestId("view-cyber")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("asset-sw").click();
  await expect(page.getByTestId("inspector")).toContainText("Station Switch");
  await page.getByTestId("act-sensor").click();
  await page.getByTestId("asset-fw").click();
  await page.getByTestId("act-sensor").click();
  await expect(page.getByTestId("gauge-credits")).toContainText("80");
  await page.getByTestId("btn-golive").click();
  expect(await phase(page)).toBe("running");
  await page.evaluate(`${G}.setSpeed(6)`);

  // The router sensor flags the scanner; the tutorial holds the sim for us.
  await expect(page.getByTestId("coach")).toContainText("INVESTIGATE", { timeout: 90_000 });
  await page.getByTestId("alert").first().click();
  await page.getByTestId("act-investigate").click();
  await expect(page.getByTestId("inspector")).toContainText("Intrusion confirmed", { timeout: 60_000 });
  await expect(page.getByTestId("inspector")).toContainText("OPPORTUNISTIC SCANNER");
  await page.getByTestId("act-isolate").click();
  await expect(page.getByTestId("inspector")).toContainText("Isolated");
  await page.getByTestId("act-remediate").click();
  await expect(page.getByTestId("coach")).toContainText("RECONNECT", { timeout: 60_000 });
  await page.getByTestId("act-reconnect").click();
  const isolated = await page.evaluate(`Object.values(${G}.game.nodes).filter((n) => n.isolated).length`);
  expect(isolated).toBe(0);
});

test("3D picking: clicking an asset in the scene selects it", async ({ page }) => {
  await boot(page, { skipTutorial: true });
  await enterMission(page);
  await page.waitForFunction(() => !!window.__setpoint.project([0, 0, 0]));
  await page.waitForTimeout(800);
  const pos = await page.evaluate(() => {
    const m = window.__setpoint.game.getState().mission;
    const e = m.equipment.find((x: { id: string }) => x.id === "t1");
    return window.__setpoint.project([e.pos[0], e.pos[1] + 2.2, e.pos[2]]);
  });
  await page.mouse.move(pos[0], pos[1]);
  await page.mouse.click(pos[0], pos[1]);
  await expect(page.getByTestId("inspector")).toContainText("Transformer T1");
});

test("doing nothing loses the site; the report offers a retry", async ({ page }) => {
  await boot(page, { skipTutorial: true });
  await enterMission(page);
  await page.getByTestId("btn-golive").click();
  await page.evaluate(`${G}.setSpeed(8)`);
  await expect(page.getByTestId("result-title")).toHaveText("SITE LOST", { timeout: 150_000 });
  await page.getByTestId("btn-retry").click();
  await expect(page.getByTestId("btn-golive")).toBeVisible();
  expect(await phase(page)).toBe("prep");
});

test("a defended mission is won, scored, saved and unlocks progress", async ({ page }) => {
  await boot(page, { skipTutorial: true });
  await enterMission(page);
  await page.evaluate(`${G}.setSpeed(8)`);
  // Drive the scripted reference defender through the same command interface the UI uses.
  await page.evaluate(() => {
    const id = setInterval(() => {
      const s = window.__setpoint.game.getState();
      if (!s.game || s.game.phase === "won" || s.game.phase === "lost") return clearInterval(id);
      window.__setpoint.bot();
    }, 50);
  });
  await expect(page.getByTestId("result-title")).toHaveText("GRID SECURED", { timeout: 170_000 });
  const stars = Number(await page.getByTestId("result-stars").getAttribute("data-stars"));
  expect(stars).toBeGreaterThanOrEqual(1);
  await page.getByTestId("btn-to-map").click();
  await expect(page.getByTestId("mission-map")).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.__setpoint);
  const saved = await page.evaluate(() => window.__setpoint.save.getState().records["first-contact"]?.stars);
  expect(saved).toBe(stars);
});

test("pause menu, speed and settings controls work and persist", async ({ page }) => {
  await boot(page, { skipTutorial: true });
  await enterMission(page);
  await page.getByTestId("btn-golive").click();
  await page.getByTestId("speed-2").click();
  expect(await page.evaluate(`${G}.speed`)).toBe(2);
  await page.keyboard.press("Space");
  expect(await page.evaluate(`${G}.paused`)).toBe(true);
  const t0 = await page.evaluate(`${G}.game.time`);
  await page.waitForTimeout(700);
  expect(await page.evaluate(`${G}.game.time`)).toBe(t0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("quality-low").click();
  await page.getByTestId("reduced-motion").check();
  await page.getByTestId("settings-close").click();
  await page.getByTestId("btn-quit").click();
  await expect(page.getByTestId("mission-map")).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.__setpoint);
  const s = await page.evaluate(() => window.__setpoint.save.getState().settings);
  expect(s.quality).toBe("low");
  expect(s.reducedMotion).toBe(true);
});

test("every campaign mission and endless mode load, render and simulate without errors", async ({ page }) => {
  const errors = await boot(page, { skipTutorial: true });
  const ids: string[] = await page.evaluate(() => window.__setpoint.campaign.map((m: { id: string }) => m.id));
  expect(ids).toHaveLength(5);
  for (const id of [...ids, "endless"]) {
    await enterMission(page, id);
    await page.getByTestId("view-cyber").click();
    await page.getByTestId("btn-golive").click();
    // Step the simulation directly so this does not depend on the frame rate of the test machine.
    await page.evaluate(`(() => { const s = ${G}; s.setSpeed(3); for (let i = 0; i < 160; i++) s.advance(0.25); })()`);
    await page.waitForTimeout(1200);
    const t = await page.evaluate(`${G}.game.time`);
    expect(t as number).toBeGreaterThan(100);
    await expect(page.locator("canvas")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("btn-quit").click();
    await expect(page.getByTestId("mission-map")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
