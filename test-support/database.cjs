const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');

async function createDatabase(initial) {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8'));
  if (initial) await db.query('update public.syncinsync_boards set state = $1 where id = $2', [initial, 'main']);
  const store = {
    read: async () => (await db.query('select state, revision from public.syncinsync_boards where id = $1', ['main'])).rows[0],
    commit: async ({ expectedRevision, state, requestId, response }) =>
      (await db.query('select public.syncinsync_commit($1,$2,$3,$4,$5) as result', ['main', expectedRevision, state, requestId, response])).rows[0].result,
  };
  return { db, store, close: () => db.close() };
}
module.exports = { createDatabase };
