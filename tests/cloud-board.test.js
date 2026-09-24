const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createDatabase } = require('../test-support/database.cjs');
const { fixtureState } = require('../test-support/fixture-server');
const { updateBoard } = require('../lib/cloud-board.cjs');

test('SQL commits preserve concurrent changes, reject stale writes, and deduplicate X', async (t) => {
  const database = await createDatabase(fixtureState());
  t.after(() => database.close());
  const { store } = database;
  const results = await Promise.all(['hpi', 'plan', 'mse', 'psychotherapy', 'meds'].map(roleKey =>
    updateBoard(store, { action: 'setPatientRoleCompleted', patientId: 'p1', roleKey, completed: true })));
  assert.ok(results.every(result => result.status === 200));
  let row = await store.read();
  assert.equal(Number(row.revision), 5);
  assert.equal(row.state.patients[0].ended, true);
  assert.deepEqual(await store.commit({ expectedRevision: 0, state: {}, requestId: randomUUID(), response: {} }), { committed: false });
  const requestId = randomUUID();
  const result = await updateBoard(store, { action: 'togglePatientEnded', patientId: 'p2', requestId });
  const duplicate = await updateBoard(store, { action: 'togglePatientEnded', patientId: 'p2', requestId });
  assert.deepEqual(duplicate, result);
  row = await store.read();
  assert.equal(Number(row.revision), 6);
  assert.equal(row.state.patients[1].ended, true);
  await updateBoard(store, { action: 'togglePatientEnded', patientId: 'p2' });
  assert.equal((await store.read()).state.patients[1].ended, false);
  const before = await store.read();
  assert.equal((await updateBoard(store, { action: 'setPatientRoleCompleted', patientId: 'p1', roleKey: 'interviewer', completed: true })).status, 400);
  assert.deepEqual(await store.read(), before);
});

test('SQL grants permit anonymous reads but deny direct writes and commit RPC', async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const securedTables = await database.db.query(`select relname, relrowsecurity from pg_class
    where oid in ('public.syncinsync_boards'::regclass, 'syncinsync_private.receipts'::regclass)`);
  assert.equal(securedTables.rows.length, 2);
  assert.ok(securedTables.rows.every(table => table.relrowsecurity));
  const initial = await database.store.read();
  await database.db.exec('set role service_role');
  const saved = await database.store.commit({ expectedRevision: 0, state: initial.state, requestId: randomUUID(), response: { ok: true } });
  assert.equal(saved.committed, true);
  await database.db.exec('reset role');
  await database.db.exec('set role anon');
  assert.equal((await database.store.read()).state.patients.length, 0);
  await assert.rejects(database.db.exec("update public.syncinsync_boards set revision = 10"), /permission denied/);
  await assert.rejects(database.store.commit({ expectedRevision: 0, state: {}, requestId: randomUUID(), response: {} }), /permission denied/);
  await assert.rejects(database.db.exec('select * from syncinsync_private.receipts'), /permission denied/);
  // RLS still hides receipts if ordinary read privileges are accidentally added.
  await database.db.exec('reset role; grant usage on schema syncinsync_private to anon; grant select on syncinsync_private.receipts to anon; set role anon;');
  assert.deepEqual((await database.db.query('select * from syncinsync_private.receipts')).rows, []);
});

test('Netlify HTTP handler keeps secrets private and validates update requests', async () => {
  const { createHandler } = await import('../netlify/functions/board.mjs');
  const { getSettings } = await import('../lib/supabase-store.mjs');
  const configuration = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test', secretKey: 'server-only-test', boardId: 'main' };
  const handler = createHandler({ settings: () => configuration, store: () => { throw new Error('private database details'); } });
  const request = (path, options) => new Request(`https://board.example${path}`, options);
  const runtime = await handler(request('/runtime-config'));
  const config = await runtime.json();
  assert.equal(config.secretKey, undefined);
  assert.equal(config.transport, 'supabase');
  assert.equal(runtime.headers.get('cache-control'), 'no-store');
  assert.equal((await handler(request('/state'))).status, 503);
  assert.equal((await handler(request('/update', { method: 'GET' }))).status, 405);
  for (const body of ['null', '[]', '{']) {
    assert.equal((await handler(request('/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }))).status, 400);
  }
  assert.equal((await handler(request('/update', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await handler(request('/update', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{}' }))).status, 403);
  assert.throws(() => getSettings({ SUPABASE_URL: configuration.url, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_accidental', SUPABASE_SECRET_KEY: 'server' }));
  const missing = createHandler({ settings: () => { throw new Error('missing'); } });
  assert.equal((await missing(request('/runtime-config'))).status, 503);
  let commits = 0;
  const timed = createHandler({ settings: () => configuration, store: () => ({
    read: async () => ({ state: fixtureState(), revision: 0 }),
    commit: async ({ response }) => (++commits === 1 ? { committed: false } : { committed: true, response }),
  }) });
  const saved = await timed(request('/update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updatePatientRole', patientId: 'p1', roleKey: 'hpi', studentId: 'b' }),
  }));
  assert.equal(saved.status, 200);
  const timing = saved.headers.get('server-timing');
  assert.match(timing, /db_read;dur=[\d.]+/);
  assert.match(timing, /db_commit;dur=[\d.]+/);
  assert.match(timing, /db_reads;desc="2"/);
  assert.ok(!timing.includes(configuration.secretKey));
});
