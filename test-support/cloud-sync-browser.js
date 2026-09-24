const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { startCloudFixture } = require('./cloud-fixture.cjs');
const { fixtureState } = require('./fixture-server');

async function run() {
  const app = await startCloudFixture(fixtureState());
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const errors = [];
    const posted = [];
    async function client(studentId, selectedPatientId) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(({ studentId, selectedPatientId }) => {
        localStorage.setItem('insync-current-user-id-v1', studentId);
        localStorage.setItem('insync-hide-update-popup-role-completion-2026-09-08', 'true');
        sessionStorage.setItem('insync-selected-patient-v1', selectedPatientId);
      }, { studentId, selectedPatientId });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.method() === 'POST') posted.push(request.postData()); });
      await page.goto(app.url);
      await page.waitForSelector('#statusPill.connected');
      await page.waitForSelector('.mini-btn-complete');
      return page;
    }
    const a = await client('a', 'p1');
    const b = await client('b', 'p3');
    const completion = '.mini-btn-complete[data-patient-id="p1"][data-role-key="hpi"]';
    await a.locator('#oldHpi').fill('LOCAL HPI SYNTHETIC ONLY');
    const stale = await app.state();
    await a.locator(completion).click();
    await b.waitForSelector(completion + '[aria-pressed="true"]');
    assert.ok(app.eventCount > 0);
    assert.equal(await b.locator('#selectedPatientSelect').inputValue(), 'p3');
    assert.equal(await b.locator('#oldHpi').inputValue(), '');
    app.publish({ state: stale, revision: stale.revision });
    // A subsequent browser task lets the deliberately late socket event arrive.
    await a.waitForTimeout(100);
    assert.equal(await a.locator(completion).getAttribute('aria-pressed'), 'true');

    // Exercise the actual divider drag handlers, then verify its durable value.
    await a.locator('.time-divider-afternoon .time-divider-badge').dragTo(
      a.locator('tr.patient-clickable-row').first(), { targetPosition: { x: 20, y: 2 } });
    await b.waitForFunction(() => document.querySelector('#patientsTableBody').firstElementChild?.classList.contains('time-divider-afternoon') ||
      document.querySelector('.time-divider-afternoon')?.nextElementSibling?.classList.contains('patient-clickable-row'));
    assert.equal((await app.state()).timeDividerIndices['3pm'], 0);

    app.disconnectClients();
    await app.update('setPatientRoleCompleted', { patientId: 'p1', roleKey: 'plan', completed: true });
    await b.waitForSelector('.mini-btn-complete[data-patient-id="p1"][data-role-key="plan"][aria-pressed="true"]');
    await a.waitForSelector('#statusPill.connected');
    assert.equal(await a.locator('#oldHpi').inputValue(), 'LOCAL HPI SYNTHETIC ONLY');

    const countReads = () => app.requests.filter(request => request.pathname === '/state').length;
    await a.waitForTimeout(200);
    const reads = countReads();
    await a.waitForTimeout(1500);
    assert.equal(countReads(), reads, 'idle connected clients must not poll /state');
    assert.ok(posted.every(body => !body?.includes('LOCAL HPI SYNTHETIC ONLY')));
    assert.equal(app.requests.some(request => request.pathname === '/events'), false);
    for (const guide of ['student-guide', 'mse-guide', '4ps-guide', 'placing-meds']) {
      const response = await fetch(`${app.url}/${guide}.pdf`);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', checks: 'real SDK with local WebSocket fixture, push sync, stale event protection, divider drag, reconnect recovery, no polling, local HPI and selection, four PDFs' }));
  } finally {
    if (browser) await browser.close();
    await app.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
