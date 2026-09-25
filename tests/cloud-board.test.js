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
  await assert.rejects(database.store.apply({ input: { action: 'togglePatientEnded', patientId: 'p1' }, requestId: randomUUID() }), /permission denied/);
  await assert.rejects(database.db.exec('select * from syncinsync_private.receipts'), /permission denied/);
  // RLS still hides receipts if ordinary read privileges are accidentally added.
  await database.db.exec('reset role; grant usage on schema syncinsync_private to anon; grant select on syncinsync_private.receipts to anon; set role anon;');
  assert.deepEqual((await database.db.query('select * from syncinsync_private.receipts')).rows, []);
});

test('atomic actions match the JS engine, including undo, validation, and old board defaults', async (t) => {
  const { createBoard, normalizeState } = require('../lib/board.cjs');
  const database = await createDatabase(fixtureState());
  t.after(() => database.close());
  const board = createBoard(fixtureState());
  const withoutTime = state => { const value = normalizeState(state); delete value.updatedAt; return value; };
  const sequence = [
    { action: 'updatePatientRole', patientId: 'p1', roleKey: 'interviewer', studentId: 'b' },
    { action: 'setPatientRoleCompleted', patientId: 'p1', roleKey: 'hpi', completed: true },
    { action: 'togglePatientEnded', patientId: 'p1' },
    // Assignment must preserve the saved partial-completion undo state.
    { action: 'updatePatientRole', patientId: 'p1', roleKey: 'plan', studentId: '' },
    { action: 'togglePatientEnded', patientId: 'p1' },
    { action: 'togglePatientEnded', patientId: 'p1' },
    { action: 'setPatientRoleCompleted', patientId: 'p1', roleKey: 'mse', completed: false },
    { action: 'togglePatientEnded', patientId: 'p1' },
    { action: 'togglePatientEnded', patientId: 'p1' },
    ...['hpi','plan','mse','psychotherapy','meds'].map(roleKey =>
      ({ action: 'setPatientRoleCompleted', patientId: 'p2', roleKey, completed: true })),
    { action: 'togglePatientEnded', patientId: 'p2' },
    { action: 'updatePatientRole', patientId: 'p2', roleKey: 'meds', studentId: 0 },
    { action: 'updatePatientRole', patientId: 'p2', roleKey: 'meds', studentId: { name: 'invalid' } },
    { action: 'setPatientRoleCompleted', patientId: 'p2', roleKey: 'interviewer', completed: true },
    { action: 'setPatientRoleCompleted', patientId: 'p2', roleKey: 'hpi', completed: 'true' },
    { action: 'setPatientRoleCompleted', patientId: 'p2', roleKey: 'hpi' },
    { action: 'updatePatientRole', patientId: 'p2', roleKey: 'unknown' },
    { action: 'updatePatientRole', patientId: 'p2' },
    { action: 'togglePatientEnded', patientId: 'missing' },
  ];
  for (const input of sequence) {
    const expected = board.applyUpdate(input);
    const result = await updateBoard(database.store, input);
    assert.equal(result.status, expected.status, JSON.stringify(input));
    if (result.status !== 200) assert.deepEqual(result.body, expected.body);
    assert.deepEqual(withoutTime((await database.store.read()).state), withoutTime(board.getState()), JSON.stringify(input));
  }
});

test('atomic RPC preserves mixed edits, deduplicates across legacy saves, and migration is repeatable', async (t) => {
  const database = await createDatabase(fixtureState());
  t.after(() => database.close());
  const legacy = { read: database.store.read, commit: database.store.commit };
  const results = await Promise.all([
    updateBoard(database.store, { action: 'updatePatientRole', patientId: 'p1', roleKey: 'hpi', studentId: 'b' }),
    updateBoard(legacy, { action: 'updateStudentName', studentId: 'a', name: 'Renamed student' }),
    updateBoard(database.store, { action: 'updatePatientRole', patientId: 'p2', roleKey: 'plan', studentId: 'a' }),
  ]);
  assert.ok(results.every(result => result.status === 200));
  let row = await database.store.read();
  assert.equal(row.state.students[0].name, 'Renamed student');
  assert.equal(row.state.patients[0].assignments.hpi, 'b');
  assert.equal(row.state.patients[1].assignments.plan, 'a');
  assert.equal(Number(row.revision), 3);
  for (const stores of [[legacy, database.store], [database.store, legacy]]) {
    const input = { action: 'togglePatientEnded', patientId: 'p1', requestId: randomUUID() };
    const first = await updateBoard(stores[0], input);
    assert.deepEqual(await updateBoard(stores[1], input), first);
  }
  row = await database.store.read();
  const fs = require('node:fs');
  const path = require('node:path');
  await database.db.exec(fs.readFileSync(path.join(__dirname, '../supabase/fast-actions.sql'), 'utf8'));
  assert.deepEqual(await database.store.read(), row);
  await database.db.exec('set role service_role');
  assert.equal((await database.store.apply({ input: { action: 'togglePatientEnded', patientId: 'p2' }, requestId: randomUUID() })).status, 200);
});

test('real SDK and HTTP handler use one RPC with no board read for a signup', async (t) => {
  const { startCloudFixture } = require('../test-support/cloud-fixture.cjs');
  const fixture = await startCloudFixture(fixtureState());
  t.after(() => fixture.close());
  const response = await fetch(fixture.url + '/update', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updatePatientRole', patientId: 'p1', roleKey: 'hpi', studentId: 'b' }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state.patients[0].assignments.hpi, 'b');
  assert.match(response.headers.get('server-timing'), /db_reads;desc="0"/);
  assert.match(response.headers.get('server-timing'), /db_atomic;dur=[\d.]+/);
  assert.deepEqual(fixture.requests.filter(request => request.pathname.startsWith('/rest/')),
    [{ method: 'POST', pathname: '/rest/v1/rpc/syncinsync_apply_action' }]);
});

test('missing RPC allows legacy rollout; other database errors never replay a toggle', async (t) => {
  const { createStore } = await import('../lib/supabase-store.mjs');
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const settings = { url: 'https://example.supabase.co', secretKey: 'sb_secret_test', boardId: 'main' };
  global.fetch = async () => Response.json({ code: 'PGRST202', message: 'missing function' }, { status: 404 });
  assert.equal(await createStore(settings).apply({ input: {}, requestId: randomUUID() }), null);
  global.fetch = async () => Response.json({ code: '57014', message: 'query timed out' }, { status: 500 });
  await assert.rejects(createStore(settings).apply({ input: {}, requestId: randomUUID() }), /Could not save/);
  let reads = 0;
  const store = { apply: async () => null,
    read: async () => { reads++; return { state: fixtureState(), revision: 0 }; },
    commit: async ({ response }) => ({ committed: true, response }) };
  assert.equal((await updateBoard(store, { action: 'togglePatientEnded', patientId: 'p1' })).status, 200);
  assert.equal(reads, 1);
  store.apply = async () => { throw new Error('timeout'); };
  await assert.rejects(updateBoard(store, { action: 'togglePatientEnded', patientId: 'p1' }), /timeout/);
  assert.equal(reads, 1);
});

test('scheduled check reads only revision, never writes, and reports failures without secrets', async (t) => {
  const { createHandler, config } = await import('../netlify/functions/supabase-keepalive.mjs');
  const { createStore } = await import('../lib/supabase-store.mjs');
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const requests = [];
  global.fetch = async (url, options) => { requests.push({ url: String(url), method: options.method }); return Response.json({ revision: 7 }); };
  const logs = [];
  const handler = createHandler({ settings: () => ({ url: 'https://example.supabase.co', secretKey: 'sb_secret_test', boardId: 'main' }), store: createStore,
    log: { info: value => logs.push(value), error: value => logs.push(value) } });
  assert.equal((await handler()).status, 204);
  assert.equal(config.schedule, '0 */6 * * *');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
  assert.equal(new URL(requests[0].url).searchParams.get('select'), 'revision');
  assert.equal(new URL(requests[0].url).searchParams.get('id'), 'eq.main');
  global.fetch = async () => Response.json({ message: 'sb_secret_test private details' }, { status: 503 });
  await assert.rejects(handler(), /scheduled database check failed/);
  assert.ok(logs.some(log => log.includes('failed')));
  assert.ok(logs.every(log => !log.includes('sb_secret_test')));
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
