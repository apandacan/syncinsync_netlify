// Optional browser regression check: requires Playwright and installed Microsoft Edge.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { startFixtureServer } = require("./fixture-server");

async function run() {
  const app = await startFixtureServer();
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const errors = [];
    async function newClient() {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      await context.addInitScript(() => {
        localStorage.setItem("insync-hide-update-popup-role-completion-2026-09-08", "true");
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(app.url);
      await page.waitForSelector("#identityOverlay.show");
      return page;
    }
    const page = await newClient();
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/update") posts += 1;
    });
    await page.locator("#identityNameInput").fill("  dz1234  ");
    // A live board update must not erase a name while it is being entered.
    await app.update("updateStudentName", { studentId: "b", name: "Other Student" });
    await page.waitForFunction(() => document.querySelector('input[data-student-id="b"][data-student-field="name"]').value === "Other Student");
    assert.equal(await page.locator("#identityNameInput").inputValue(), "  dz1234  ");
    const before = await app.state();
    await page.locator("#identitySaveBtn").press("Enter");
    await page.waitForSelector("#identityOverlay", { state: "hidden" });
    assert.equal(await page.locator("#exitAdminModeBtn").isVisible(), true);
    assert.equal(posts, 0);
    assert.deepEqual(await app.state(), before);
    assert.ok(await page.locator(".mini-btn-self").evaluateAll((buttons) => buttons.every((button) => button.disabled)));
    assert.equal(await page.locator(".mini-btn-complete").first().isEnabled(), true);
    assert.equal(await page.locator('select[data-patient-id="p1"]').first().isEnabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("insync-current-user-id-v1")), null);

    await page.reload();
    await page.waitForSelector(".mini-btn-complete");
    assert.equal(await page.locator("#identityOverlay").isVisible(), false);
    assert.equal(await page.locator("#exitAdminModeBtn").isVisible(), true);
    await page.locator('.mini-btn-complete[data-patient-id="p1"][data-role-key="hpi"]').click();
    await page.waitForSelector('.mini-btn-complete[data-patient-id="p1"][data-role-key="hpi"][aria-pressed="true"][aria-busy="false"]');
    assert.equal((await app.state()).students.length, 2);
    const desktop = path.join(os.tmpdir(), "syncinsync-admin-desktop.png");
    await page.screenshot({ path: desktop });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#exitAdminModeBtn").scrollIntoViewIfNeeded();
    assert.ok(await page.locator("#exitAdminModeBtn").evaluate((button) => {
      const box = button.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && button.scrollWidth <= button.clientWidth;
    }));
    const mobile = path.join(os.tmpdir(), "syncinsync-admin-mobile.png");
    await page.screenshot({ path: mobile });

    const student = await newClient();
    await student.locator("#identityNameInput").fill("Test Student A");
    await student.locator("#identitySaveBtn").press("Enter");
    await student.waitForSelector("#identityOverlay", { state: "hidden" });
    assert.equal(await student.locator("#exitAdminModeBtn").isVisible(), false);
    assert.equal(await student.locator(".mini-btn-self").first().isEnabled(), true);
    await student.locator(".mini-btn-self").first().click();
    await student.waitForFunction(() => document.querySelector('select[data-patient-id="p1"][data-role-key="interviewer"]').value === "");
    assert.equal((await app.state()).students.length, 2);
    assert.equal(await page.locator("#identityOverlay").isVisible(), false);

    await app.update("resetBoard");
    await page.waitForFunction(() => document.querySelectorAll(".mini-btn-complete").length === 0);
    assert.equal(await page.locator("#identityOverlay").isVisible(), false);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#statusPill").textContent === "Connected");
    assert.equal(await page.locator("#identityOverlay").isVisible(), false);
    assert.equal((await app.state()).students.length, 0);
    await page.locator("#exitAdminModeBtn").click();
    await page.waitForSelector("#identityOverlay.show");
    assert.equal(await page.locator("#identityNameInput").inputValue(), "");
    assert.equal(await page.evaluate(() => localStorage.getItem("insync-local-admin-mode-v1")), null);
    await page.locator("#identityNameInput").fill("Daniel Zheng");
    await page.locator("#identitySaveBtn").press("Enter");
    await page.waitForSelector("#identityOverlay", { state: "hidden" });
    assert.equal(await page.locator("#exitAdminModeBtn").isVisible(), false);
    assert.equal((await app.state()).students[0].name, "Daniel Zheng");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", checks: "local admin entry, no roster mutation, refresh, live updates, normal signup, reset, exit, desktop/mobile", desktop, mobile }));
  } finally {
    if (browser) await browser.close();
    await app.close();
  }
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
