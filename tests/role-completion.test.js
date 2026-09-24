const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { startFixtureServer, fixtureState, roleKeys } = require("../test-support/fixture-server");
const completionKeys = roleKeys.filter((key) => key !== "interviewer");

async function setup(t, initial) {
  const app = await startFixtureServer(initial);
  t.after(() => app.close());
  return app;
}

function complete(app, roleKey = "hpi", completed = true, patientId = "p1", studentId = "a") {
  return app.update("setPatientRoleCompleted", { patientId, roleKey, studentId, completed });
}

test("legacy boards start unchecked; completion persists across restarts without changing assignments", async (t) => {
  const app = await setup(t);
  const original = await app.state();
  assert.ok(original.patients.every((p) => roleKeys.every((key) => p.completedRoles[key] === false)));
  assert.equal((await complete(app)).status, 200);
  const saved = JSON.parse(fs.readFileSync(app.dataFile, "utf8"));
  assert.equal(saved.patients[0].completedRoles.hpi, true);
  await app.restart();
  const reloaded = await app.state();
  assert.equal(reloaded.patients[0].completedRoles.hpi, true);
  assert.deepEqual(reloaded.patients[0].assignments, original.patients[0].assignments);
  assert.equal(reloaded.patients[0].ended, false);
  assert.equal((await complete(app, "hpi", false)).state.patients[0].completedRoles.hpi, false);
});

test("completion broadcasts to two subscribed clients and repeated requests are idempotent", async (t) => {
  const app = await setup(t);
  async function subscribe() {
    const controller = new AbortController();
    const response = await fetch(`${app.url}/events`, { signal: controller.signal });
    const reader = response.body.getReader();
    t.after(async () => { controller.abort(); await reader.cancel().catch(() => {}); });
    let buffer = "";
    return async () => {
      while (!buffer.includes("\n\n")) {
        const { value, done } = await reader.read();
        assert.equal(done, false);
        buffer += new TextDecoder().decode(value);
      }
      const end = buffer.indexOf("\n\n");
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      return JSON.parse(event.slice("data: ".length));
    };
  }
  const clientA = await subscribe();
  const clientB = await subscribe();
  await clientA();
  await clientB();
  await complete(app);
  assert.equal((await clientA()).patients[0].completedRoles.hpi, true);
  assert.equal((await clientB()).patients[0].completedRoles.hpi, true);
  await complete(app);
  assert.equal((await app.state()).patients[0].completedRoles.hpi, true);
  await complete(app, "hpi", false);
  assert.equal((await app.state()).patients[0].completedRoles.hpi, false);
});

test("X checks all five roles and a second X restores the previous checks", async (t) => {
  const app = await setup(t);
  for (const key of ["hpi", "plan", "mse"]) await complete(app, key, true, "p2", "b");
  const before = (await app.state()).patients[1];
  const closed = await app.update("togglePatientEnded", { patientId: "p2" });
  assert.equal(closed.state.patients[1].ended, true);
  assert.ok(completionKeys.every((key) => closed.state.patients[1].completedRoles[key]));
  const reopened = await app.update("togglePatientEnded", { patientId: "p2" });
  assert.equal(reopened.state.patients[1].ended, false);
  assert.deepEqual(reopened.state.patients[1].completedRoles, before.completedRoles);
  assert.deepEqual(reopened.state.patients[1].assignments, before.assignments);
  assert.equal(reopened.state.patients[1].completionBeforeEnd, null);
});

test("reassignment and unassignment preserve checks independently of the assignee", async (t) => {
  const app = await setup(t);
  await complete(app);
  await complete(app, "plan");
  await app.update("updatePatientRole", { patientId: "p1", roleKey: "hpi", studentId: "a" });
  assert.equal((await app.state()).patients[0].completedRoles.hpi, true);
  await app.update("updatePatientRole", { patientId: "p1", roleKey: "hpi", studentId: "b" });
  const patient = (await app.state()).patients[0];
  assert.equal(patient.completedRoles.hpi, true);
  assert.equal(patient.completedRoles.plan, true);
  assert.equal((await complete(app)).status, 200);
  await app.update("updatePatientRole", { patientId: "p1", roleKey: "plan", studentId: "" });
  assert.equal((await app.state()).patients[0].completedRoles.plan, true);
  await app.restart();
  assert.equal((await app.state()).patients[0].completedRoles.plan, true);
});

test("invalid completion requests do not mutate the board", async (t) => {
  const app = await setup(t);
  const before = await app.state();
  assert.equal((await complete(app, "hpi", true, "missing")).status, 404);
  assert.equal((await complete(app, "invalid")).status, 400);
  assert.equal((await complete(app, "interviewer")).status, 400);
  assert.equal((await complete(app, "hpi", "true")).status, 400);
  assert.deepEqual(await app.state(), before);
});

test("unassigned roles can be checked and unchecked without a student ID", async (t) => {
  const app = await setup(t);
  for (const completed of [true, false]) {
    const result = await app.update("setPatientRoleCompleted", { patientId: "p3", roleKey: "hpi", completed });
    assert.equal(result.status, 200);
    assert.equal(result.state.patients[2].completedRoles.hpi, completed);
    assert.equal(result.state.patients[2].assignments.hpi, "");
  }
});

test("patient count changes and deleting a student preserve existing checks", async (t) => {
  const app = await setup(t);
  await complete(app);
  await complete(app, "hpi", true, "p2", "b");
  const resized = await app.update("setPatientCount", { count: 4 });
  assert.equal(resized.state.patients[0].completedRoles.hpi, true);
  assert.ok(roleKeys.every((key) => resized.state.patients[3].completedRoles[key] === false));
  const deleted = await app.update("deleteStudent", { studentId: "a" });
  assert.equal(deleted.state.patients[0].completedRoles.hpi, true);
  assert.equal(deleted.state.patients[0].assignments.hpi, "");
  assert.equal(deleted.state.patients[1].completedRoles.hpi, true);
});

test("randomization and clearing assignments preserve checks", async (t) => {
  const initial = fixtureState();
  for (const patient of initial.patients) {
    patient.completedRoles = Object.fromEntries(roleKeys.map((key) => [key, Boolean(patient.assignments[key])]));
  }
  const app = await setup(t, initial);
  for (const action of ["randomizePatient", "randomizeSchedule"]) {
    const before = await app.state();
    const result = await app.update(action, { patientId: "p1" });
    assert.equal(result.status, 200);
    for (const [index, patient] of result.state.patients.entries()) {
      for (const key of roleKeys) {
        const previous = before.patients[index];
        assert.equal(patient.completedRoles[key], previous.completedRoles[key]);
      }
    }
  }
  const cleared = await app.update("clearScheduleAssignments");
  assert.ok(cleared.state.patients.every((p, index) => roleKeys.every((key) => p.completedRoles[key] === initial.patients[index].completedRoles[key] && p.assignments[key] === "")));
});

test("normalization preserves completion on unassigned roles and ignores non-boolean saved values", async (t) => {
  const initial = fixtureState();
  initial.patients[0].completedRoles = { hpi: "true", plan: true };
  initial.patients[2].completedRoles = { hpi: true };
  const app = await setup(t, initial);
  const state = await app.state();
  assert.equal(state.patients[0].completedRoles.hpi, false);
  assert.equal(state.patients[0].completedRoles.plan, true);
  assert.equal(state.patients[2].completedRoles.hpi, true);
});

test("the fifth completion closes an unassigned row; X clears individually completed checks", async (t) => {
  const app = await setup(t);
  for (const [index, key] of completionKeys.entries()) {
    const result = await complete(app, key, true, "p3", "");
    assert.equal(result.state.patients[2].ended, index === completionKeys.length - 1);
  }
  assert.equal((await app.state()).patients[2].completedRoles.interviewer, false);
  await app.update("togglePatientEnded", { patientId: "p3" });
  await app.update("updatePatientRole", { patientId: "p3", roleKey: "hpi", studentId: "a" });
  await app.update("setPatientCount", { count: 4 });
  await app.restart();
  const reopened = (await app.state()).patients[2];
  assert.equal(reopened.ended, false);
  assert.ok(completionKeys.every((key) => reopened.completedRoles[key] === false));
});

test("simultaneous completion updates close the row; unchecking automatically reopens it", async (t) => {
  const app = await setup(t);
  await Promise.all(completionKeys.map((key) => complete(app, key)));
  const patient = (await app.state()).patients[0];
  assert.ok(completionKeys.every((key) => patient.completedRoles[key]));
  assert.equal(patient.ended, true);
  await complete(app, "hpi", false);
  assert.equal((await app.state()).patients[0].ended, false);
  await complete(app, "hpi", true);
  assert.equal((await app.state()).patients[0].ended, true);
});

test("X undo survives restart, repeated completion requests, reassignment, and patient count changes", async (t) => {
  const app = await setup(t);
  for (const key of ["hpi", "plan", "mse"]) await complete(app, key);
  const before = (await app.state()).patients[0].completedRoles;
  await app.update("togglePatientEnded", { patientId: "p1" });
  await complete(app, "hpi");
  await app.update("updatePatientRole", { patientId: "p1", roleKey: "hpi", studentId: "b" });
  await app.update("setPatientCount", { count: 4 });
  await app.restart();
  assert.equal((await app.state()).patients[0].ended, true);
  await app.update("togglePatientEnded", { patientId: "p1" });
  assert.equal((await app.state()).patients[0].ended, false);
  assert.deepEqual((await app.state()).patients[0].completedRoles, before);
});

test("checkbox edits reopen X-completed rows and replace stale undo history", async (t) => {
  const app = await setup(t);
  await complete(app, "hpi");
  await app.update("togglePatientEnded", { patientId: "p1" });
  await complete(app, "meds", false);
  const edited = (await app.state()).patients[0];
  assert.equal(edited.ended, false);
  assert.equal(edited.completionBeforeEnd, null);
  await app.update("togglePatientEnded", { patientId: "p1" });
  await app.update("togglePatientEnded", { patientId: "p1" });
  assert.deepEqual((await app.state()).patients[0].completedRoles, edited.completedRoles);
});

test("legacy overrides are removed and row status is derived only from checks", async (t) => {
  const initial = fixtureState();
  initial.patients[0].ended = false;
  initial.patients[0].endedOverride = false;
  initial.patients[0].completedRoles = Object.fromEntries(completionKeys.map((key) => [key, true]));
  initial.patients[1].ended = true;
  initial.patients[1].endedOverride = true;
  const app = await setup(t, initial);
  const state = await app.state();
  assert.equal(state.patients[0].ended, true);
  assert.equal(state.patients[1].ended, false);
  assert.equal("endedOverride" in state.patients[0], false);
});

test("invalid or stale undo snapshots cannot restore an all-complete or malformed state", async (t) => {
  const initial = fixtureState();
  initial.patients[0].completedRoles = Object.fromEntries(completionKeys.map((key) => [key, true]));
  initial.patients[0].completionBeforeEnd = { ...initial.patients[0].completedRoles };
  initial.patients[1].completionBeforeEnd = { hpi: true };
  const app = await setup(t, initial);
  assert.ok((await app.state()).patients.every((patient) => patient.completionBeforeEnd === null));
  await app.update("togglePatientEnded", { patientId: "p1" });
  assert.equal((await app.state()).patients[0].ended, false);
});
