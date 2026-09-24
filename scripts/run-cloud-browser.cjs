const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const filename of ['role-completion-browser.js', 'admin-mode-browser.js', 'cloud-sync-browser.js']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../test-support', filename)], {
    env: { ...process.env, SYNCINSYNC_TEST_TRANSPORT: 'cloud' }, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
