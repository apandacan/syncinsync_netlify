import cloud from '../../lib/cloud-board.cjs';
import { createStore, getSettings } from '../../lib/supabase-store.mjs';

const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Dependency injection keeps tests entirely local; production always uses the
// selected Supabase project and never reads a file snapshot.
export function createHandler({ settings = getSettings, store = createStore } = {}) {
  return async (request) => {
    const pathname = new URL(request.url).pathname;
    if (!['/state', '/update', '/runtime-config', '/events'].includes(pathname)) return json(404, { error: 'Not found' });
    if (pathname === '/events') return json(410, { error: 'This board uses Realtime. Reload the page to connect.' });
    if (request.method !== (pathname === '/update' ? 'POST' : 'GET')) return json(405, { error: 'Method not allowed' });
    let input;
    if (pathname === '/update') {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json(415, { error: 'JSON required' });
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return json(403, { error: 'Origin not allowed' });
      const text = await request.text();
      if (Buffer.byteLength(text) > 1000000) return json(413, { error: 'Update too large' });
      try { input = JSON.parse(text); } catch { return json(400, { error: 'Invalid JSON body' }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json(400, { error: 'Invalid update' });
    }
    let config;
    try { config = settings(); } catch { return json(503, { error: 'The shared board backend has not been configured.' }); }
    if (pathname === '/runtime-config') {
      return json(200, { transport: 'supabase', url: config.url, publishableKey: config.publishableKey, boardId: config.boardId });
    }
    try {
      const database = store(config);
      if (pathname === '/state') return json(200, cloud.publicState(await database.read()));
      const result = await cloud.updateBoard(database, input);
      return json(result.status, result.body);
    } catch {
      // Avoid leaking keys, database internals, or board contents into logs/errors.
      return json(503, { error: 'Could not reach the shared board. Reconnect before retrying your change.' });
    }
  };
}

export default createHandler();
export const config = { path: ['/state', '/update', '/runtime-config', '/events'] };
