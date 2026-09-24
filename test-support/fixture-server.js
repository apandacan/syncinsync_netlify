const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const roleKeys = ["interviewer", "hpi", "plan", "mse", "psychotherapy", "meds"];

function fixtureState() {
  return {
    students: ["a", "b"].map((id, order) => ({ id, order, name: `Test Student ${id.toUpperCase()}`, roleTitle: "Medical Student" })),
    patients: ["p1", "p2", "p3"].map((id, i) => ({
      id,
      label: `Patient ${i + 1}`,
      assignments: Object.fromEntries(roleKeys.map((key) => [key, i === 2 ? "" : i === 1 ? "b" : "a"])),
      ended: false,
    })),
  };
}

async function startFixtureServer(initial = fixtureState()) {
  if (process.env.SYNCINSYNC_TEST_TRANSPORT === 'cloud') {
    return require('./cloud-fixture.cjs').startCloudFixture(initial);
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "syncinsync-test-"));
  const dataFile = path.join(directory, "shared_state.json");
  fs.copyFileSync(path.join(__dirname, "..", "server.js"), path.join(directory, "server.js"));
  fs.cpSync(path.join(__dirname, "..", "lib"), path.join(directory, "lib"), { recursive: true });
  fs.cpSync(path.join(__dirname, "..", "public"), path.join(directory, "public"), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(initial));
  let child;
  let baseUrl;

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const closed = once(child, "close");
    child.kill();
    await closed;
  }

  async function start() {
    child = spawn(process.execPath, [path.join(directory, "server.js")], {
      env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    baseUrl = await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10000);
      child.once("error", (err) => { clearTimeout(timeout); reject(err); });
      child.once("exit", () => { clearTimeout(timeout); reject(new Error(`Server exited: ${output}`)); });
      child.stderr.on("data", (data) => { output += data; });
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/http:\/\/localhost:\d+/);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
    });
  }

  const close = async () => {
    await stop();
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("syncinsync-test-")) {
      throw new Error("Refusing to remove a directory outside the temporary test workspace");
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  };
  try { await start(); } catch (err) { await close(); throw err; }
  return {
    get url() { return baseUrl; },
    dataFile,
    close,
    restart: async () => { await stop(); await start(); },
    state: async () => (await fetch(`${baseUrl}/state`)).json(),
    update: async (action, fields = {}) => {
      const response = await fetch(`${baseUrl}/update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...fields }),
      });
      return { status: response.status, ...await response.json() };
    },
  };
}

module.exports = { startFixtureServer, fixtureState, roleKeys };
