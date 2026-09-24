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
    async function client(studentId, selectedPatientId) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(({ studentId, selectedPatientId }) => {
        localStorage.setItem("insync-current-user-id-v1", studentId);
        localStorage.setItem("insync-hide-update-popup-ten-am-divider-2026-08-12", "true");
        sessionStorage.setItem("insync-selected-patient-v1", selectedPatientId);
      }, { studentId, selectedPatientId });
      const page = await context.newPage();
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(app.url);
      await page.waitForSelector(".mini-btn-complete");
      // Dismissing the previous announcement must not hide this new release.
      await page.waitForSelector("#updatePopup.show");
      assert.equal(await page.locator(".update-popup-date").innerText(), "Updated 9/8/2026");
      assert.deepEqual(await page.locator(".update-popup-line").allTextContents(), [
        "Added check buttons next to signup buttons to track which parts are finished and what still needs to be done.",
        "Completed rows are automatically crossed out.",
      ]);
      assert.equal(await page.locator(".update-popup-contact a").getAttribute("href"), "mailto:daneel.zheng@gmail.com");
      await page.locator("#hideUpdatePopupCheckbox").check();
      await page.locator("#closeUpdatePopupBtn").click();
      return page;
    }
    const a = await client("a", "p1");
    const b = await client("b", "p3");
    const selector = (patient = "p1", role = "hpi") => `.mini-btn-complete[data-patient-id="${patient}"][data-role-key="${role}"]`;
    const waitPressed = (page, pressed, patient = "p1", role = "hpi") =>
      page.waitForSelector(`${selector(patient, role)}[aria-pressed="${pressed}"][aria-busy="false"]`);
    assert.equal(await a.locator(".mini-btn-complete").count(), 15);
    assert.equal(await a.locator('.mini-btn-complete[data-role-key="interviewer"]').count(), 0);
    assert.equal(await a.locator(selector("p3")).isDisabled(), false);
    await a.locator(selector("p3")).click();
    await waitPressed(b, true, "p3");
    const studentLine = await a.locator("#studentLine").innerText();
    await a.locator(selector()).click();
    await waitPressed(a, true);
    await waitPressed(b, true);
    assert.equal(await b.locator("#selectedPatientSelect").inputValue(), "p3");
    assert.equal(await a.locator("#studentLine").innerText(), studentLine);
    await b.locator(selector()).click();
    await waitPressed(a, false);
    await waitPressed(b, false);

    await a.locator(selector()).focus();
    await a.keyboard.press("Space");
    await waitPressed(a, true);
    assert.equal(await a.locator(selector()).evaluate((el) => el === document.activeElement), true);
    await a.reload();
    await waitPressed(a, true);
    assert.equal(await a.locator("#updatePopup").isVisible(), false);

    const firstRow = a.locator('tr.patient-clickable-row:has(select[data-patient-id="p1"])');
    async function holdX(fail = false) {
      let release;
      let requests = 0;
      const gate = new Promise((resolve) => { release = resolve; });
      await a.route("**/update", async (route) => {
        if (route.request().postDataJSON()?.action === "togglePatientEnded") {
          requests++;
          await gate;
          if (fail) { await route.abort("failed"); return; }
        }
        await route.continue();
      });
      return { release, requests: () => requests };
    }
    // Failed X removes only the local preview, retaining another student's edit.
    let pendingX = await holdX(true);
    await firstRow.locator('.mini-btn-danger').click();
    assert.equal(await firstRow.evaluate((el) => el.classList.contains('ended-row')), true);
    assert.equal(await a.locator(selector('p1', 'meds')).getAttribute('aria-pressed'), 'true');
    assert.equal(await a.locator(selector('p1', 'meds')).getAttribute('aria-busy'), 'true');
    assert.equal(await b.locator(selector('p1', 'meds')).getAttribute('aria-pressed'), 'false');
    await b.locator('select[data-patient-id="p1"][data-role-key="plan"]').selectOption('b');
    await a.waitForFunction(() => document.querySelector('select[data-patient-id="p1"][data-role-key="plan"]').value === 'b');
    assert.equal(await firstRow.evaluate((el) => el.classList.contains('ended-row')), true);
    pendingX.release();
    await waitPressed(a, false, 'p1', 'meds');
    await a.waitForFunction(() => document.querySelector('#errorBox').textContent.length > 0);
    assert.equal(await firstRow.evaluate((el) => el.classList.contains('ended-row')), false);
    assert.equal(await a.locator('select[data-patient-id="p1"][data-role-key="plan"]').inputValue(), 'b');
    await a.unroute('**/update');
    // Both complete and restore render before the server receives the held save.
    pendingX = await holdX();
    await firstRow.locator('.mini-btn-danger').evaluate((el) => { el.click(); el.click(); });
    assert.equal(await firstRow.evaluate((el) => el.classList.contains('ended-row')), true);
    assert.equal(await b.locator(selector('p1', 'meds')).getAttribute('aria-pressed'), 'false');
    pendingX.release();
    await waitPressed(a, true, 'p1', 'meds');
    await waitPressed(b, true, 'p1', 'meds');
    assert.equal(pendingX.requests(), 1);
    await a.unroute('**/update');
    pendingX = await holdX();
    await firstRow.locator('.mini-btn-danger').click();
    assert.equal(await firstRow.evaluate((el) => el.classList.contains('ended-row')), false);
    assert.equal(await a.locator(selector()).getAttribute('aria-pressed'), 'true');
    assert.equal(await a.locator(selector('p1', 'meds')).getAttribute('aria-pressed'), 'false');
    assert.equal(await b.locator(selector('p1', 'meds')).getAttribute('aria-pressed'), 'true');
    pendingX.release();
    await waitPressed(a, false, 'p1', 'meds');
    await waitPressed(b, false, 'p1', 'meds');
    await a.unroute('**/update');

    const secondRow = a.locator("tr.patient-clickable-row").filter({ has: a.locator(selector("p2")) });
    await secondRow.locator('button[title="Mark all five complete"]').click();
    await waitPressed(b, true, "p2", "plan");
    await a.mouse.move(0, 0);
    await a.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)).backgroundColor === "rgb(244, 214, 220)", selector("p2", "plan"));
    const finished = await a.locator(selector("p2", "plan")).evaluate((el) => ({
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
      ended: el.closest("tr").classList.contains("ended-row"),
    }));
    assert.deepEqual(finished, { color: "rgb(143, 75, 92)", background: "rgb(244, 214, 220)", ended: true });
    assert.equal(await a.locator(selector()).evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(21, 128, 61)");
    await a.locator(selector("p2", "plan")).hover();
    await a.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)).backgroundColor === "rgb(237, 197, 207)", selector("p2", "plan"));
    await a.mouse.move(0, 0);

    await b.locator('select[data-patient-id="p1"][data-role-key="hpi"]').selectOption("b");
    await a.waitForFunction(() => document.querySelector('select[data-patient-id="p1"][data-role-key="hpi"]').value === "b");
    await waitPressed(a, true);
    await waitPressed(b, true);
    await b.locator('select[data-patient-id="p1"][data-role-key="hpi"]').selectOption("");
    await a.waitForFunction(() => document.querySelector('select[data-patient-id="p1"][data-role-key="hpi"]').value === "");
    await waitPressed(a, true);
    await a.locator(selector()).click();
    await waitPressed(a, false);
    await waitPressed(b, false);

    let releaseFailure;
    const failedSaveGate = new Promise((resolve) => { releaseFailure = resolve; });
    await a.route("**/update", async (route) => {
      if (route.request().postDataJSON()?.action === "setPatientRoleCompleted") {
        await failedSaveGate;
        await route.abort("failed");
      } else await route.continue();
    });
    await a.locator(selector()).click();
    await a.waitForSelector(`${selector()}[aria-pressed="true"][aria-busy="true"]`);
    assert.equal(await b.locator(selector()).getAttribute("aria-pressed"), "false");
    // A remote update must survive both the pending preview and its rollback.
    await b.locator(selector("p1", "plan")).click();
    await waitPressed(a, true, "p1", "plan");
    assert.equal(await a.locator(selector()).getAttribute("aria-pressed"), "true");
    releaseFailure();
    await a.waitForFunction(() => document.querySelector("#errorBox").textContent.length > 0);
    await waitPressed(a, false);
    await waitPressed(a, true, "p1", "plan");
    assert.equal(await a.locator(selector()).getAttribute("aria-disabled"), "false");
    await a.unroute("**/update");

    let completionRequests = 0;
    let releaseSuccess;
    const successfulSaveGate = new Promise((resolve) => { releaseSuccess = resolve; });
    await a.route("**/update", async (route) => {
      if (route.request().postDataJSON()?.action === "setPatientRoleCompleted") {
        completionRequests += 1;
        await successfulSaveGate;
      }
      await route.continue();
    });
    await a.locator(selector()).evaluate((button) => { button.click(); button.click(); });
    await a.waitForSelector(`${selector()}[aria-pressed="true"][aria-busy="true"]`);
    assert.equal(await b.locator(selector()).getAttribute("aria-pressed"), "false");
    await b.locator(selector("p1", "plan")).click();
    await waitPressed(a, false, "p1", "plan");
    assert.equal(await a.locator(selector()).getAttribute("aria-pressed"), "true");
    releaseSuccess();
    await waitPressed(a, true);
    await waitPressed(b, true);
    assert.equal(completionRequests, 1);
    await a.unroute("**/update");

    await a.mouse.move(0, 0);
    await a.locator("#patientTableWrap").scrollIntoViewIfNeeded();
    const desktop = path.join(os.tmpdir(), "syncinsync-role-completion-desktop.png");
    await a.screenshot({ path: desktop });

    await a.setViewportSize({ width: 390, height: 844 });
    await a.locator("#patientTableWrap").scrollIntoViewIfNeeded();
    const dimensions = await a.locator(".role-cell-actions").evaluateAll((groups) => groups.map((group) => {
      const rect = group.getBoundingClientRect();
      return [...group.children].every((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= rect.left && bounds.right <= rect.right && bounds.height <= rect.height;
      });
    }));
    assert.ok(dimensions.every(Boolean), "role controls fit their cells on mobile");
    assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "board scroll stays inside its container");
    const mobile = path.join(os.tmpdir(), "syncinsync-role-completion-mobile.png");
    await a.screenshot({ path: mobile });
    await a.locator("#patientTableScroll").evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await a.locator(selector("p2", "meds")).click();
    await waitPressed(b, false, "p2", "meds");
    await b.waitForSelector('.patient-clickable-row:not(.ended-row) select[data-patient-id="p2"]');
    await a.setViewportSize({ width: 1440, height: 1000 });
    for (const role of ["plan", "mse", "psychotherapy"]) {
      await a.locator(selector("p3", role)).click();
      await waitPressed(b, true, "p3", role);
    }
    await a.locator("#selectedPatientSelect").selectOption("p3");
    let releaseLastCheck;
    const lastCheckGate = new Promise((resolve) => { releaseLastCheck = resolve; });
    await a.route("**/update", async (route) => {
      if (route.request().postDataJSON()?.action === "setPatientRoleCompleted") {
        await lastCheckGate;
        await route.abort("failed");
      } else await route.continue();
    });
    await a.locator(selector("p3", "meds")).click();
    await a.waitForSelector('.ended-row select[data-patient-id="p3"]');
    assert.equal(await b.locator(selector("p3", "meds")).getAttribute("aria-pressed"), "false");
    assert.equal(await a.locator("#selectedPatientSelect").inputValue(), "p3");
    assert.equal(await a.locator('.ended-row:has(select[data-patient-id="p3"]) .mini-btn-danger').isDisabled(), true);
    releaseLastCheck();
    await waitPressed(a, false, "p3", "meds");
    await a.waitForSelector('.patient-clickable-row:not(.ended-row) select[data-patient-id="p3"]');
    assert.equal(await a.locator("#selectedPatientSelect").inputValue(), "p3");
    await a.unroute("**/update");
    await a.locator(selector("p3", "meds")).click();
    await waitPressed(a, true, "p3", "meds");
    await a.waitForSelector('.ended-row select[data-patient-id="p3"]');
    await b.waitForSelector('.ended-row select[data-patient-id="p3"]');
    await a.locator(selector("p3", "meds")).click();
    await b.waitForSelector('.patient-clickable-row:not(.ended-row) select[data-patient-id="p3"]');
    await a.locator(selector("p3", "meds")).click();
    await b.waitForSelector('.ended-row select[data-patient-id="p3"]');
    const thirdRow = b.locator("tr.patient-clickable-row").filter({ has: b.locator(selector("p3")) });
    await thirdRow.locator('button[title="Clear all checks"]').click();
    await a.waitForSelector('.patient-clickable-row:not(.ended-row) select[data-patient-id="p3"]');
    for (const role of ["hpi", "plan", "mse", "psychotherapy", "meds"]) await waitPressed(a, false, "p3", role);
    for (const role of ["hpi", "plan", "mse"]) {
      await a.locator(selector("p3", role)).click();
      await waitPressed(b, true, "p3", role);
    }
    await thirdRow.locator('button[title="Mark all five complete"]').click();
    await a.waitForSelector('.ended-row select[data-patient-id="p3"]');
    await a.reload();
    await a.waitForSelector('.ended-row select[data-patient-id="p3"]');
    await thirdRow.locator('button[title="Restore previous checks"]').click();
    await b.waitForSelector('.patient-clickable-row:not(.ended-row) select[data-patient-id="p3"]');
    for (const role of ["hpi", "plan", "mse"]) await waitPressed(a, true, "p3", role);
    for (const role of ["psychotherapy", "meds"]) await waitPressed(a, false, "p3", role);
    await thirdRow.locator('button[title="Mark all five complete"]').click();
    await a.waitForSelector('.ended-row select[data-patient-id="p3"]');
    await a.locator(selector("p3", "meds")).click();
    await waitPressed(b, false, "p3", "meds");
    await b.waitForSelector('.patient-clickable-row:not(.ended-row) select[data-patient-id="p3"]');
    await thirdRow.locator('button[title="Mark all five complete"]').click();
    await a.waitForSelector('.ended-row select[data-patient-id="p3"]');
    await thirdRow.locator('button[title="Restore previous checks"]').click();
    await a.waitForSelector('.patient-clickable-row:not(.ended-row) select[data-patient-id="p3"]');
    for (const role of ["hpi", "plan", "mse", "psychotherapy"]) await waitPressed(a, true, "p3", role);
    await waitPressed(a, false, "p3", "meds");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", checks: "two clients, optimistic checks before save, concurrent update preserved on rollback, fifth-check rollback and selection, toggle, keyboard focus, reload, ended rows, reassign, failed request, duplicate click, mobile", desktop, mobile }));
  } finally {
    if (browser) await browser.close();
    await app.close();
  }
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
