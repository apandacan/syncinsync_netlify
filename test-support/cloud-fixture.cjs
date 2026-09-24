const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { WebSocketServer, WebSocket } = require('ws');
const { createDatabase } = require('./database.cjs');

// Local PostgREST/Realtime protocol fixture. Uses the actual Supabase SDK,
// Netlify handler, board logic, and PostgreSQL transaction; no remote accounts.
async function startCloudFixture(initial) {
  const database = await createDatabase(initial);
  const { createHandler } = await import('../netlify/functions/board.mjs');
  const sockets = new WebSocketServer({ noServer: true });
  let url;
  let eventCount = 0;
  const requests = [];
  const settings = () => ({ url, publishableKey: 'sb_publishable_local_test', secretKey: 'sb_secret_local_test', boardId: 'main' });
  const handler = createHandler({ settings });
  const reply = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const publish = (row) => {
    for (const socket of sockets.clients) if (socket.readyState === WebSocket.OPEN && socket.boardTopic) {
      eventCount += 1;
      socket.send(JSON.stringify([socket.joinRef, null, socket.boardTopic, 'postgres_changes', {
        ids: [1], data: { schema: 'public', table: 'syncinsync_boards', type: 'UPDATE', commit_timestamp: new Date().toISOString(),
          columns: [{ name: 'id', type: 'text' }, { name: 'state', type: 'jsonb' }, { name: 'revision', type: 'int8' }],
          record: { id: 'main', state: row.state, revision: Number(row.revision) }, old_record: {}, errors: null },
      }]));
    }
  };
  sockets.on('connection', (socket) => {
    socket.on('message', (buffer) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(buffer.toString());
      if (event === 'phx_join') {
        socket.boardTopic = topic; socket.joinRef = joinRef;
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {
          postgres_changes: payload.config.postgres_changes.map(filter => ({ ...filter, id: 1 })),
        } }]));
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, url).pathname;
      requests.push({ method: req.method, pathname });
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (pathname.startsWith('/rest/v1/')) {
        if (req.headers.apikey !== settings().secretKey) return reply(res, 403, { message: 'Test API key required' });
        if (pathname === '/rest/v1/syncinsync_boards' && req.method === 'GET') return reply(res, 200, await database.store.read());
        if (pathname === '/rest/v1/rpc/syncinsync_commit' && req.method === 'POST') {
          const args = JSON.parse(body);
          const result = await database.store.commit({ expectedRevision: args.p_expected_revision, state: args.p_state, requestId: args.p_request_id, response: args.p_response });
          if (result.committed) publish(await database.store.read());
          return reply(res, 200, result);
        }
        return reply(res, 404, {});
      }
      if (['/state', '/update', '/runtime-config', '/events'].includes(pathname)) {
        const response = await handler(new Request(url + req.url, { method: req.method, headers: req.headers, ...(body.length ? { body } : {}) }));
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const publicDir = path.resolve(__dirname, '../public');
      const file = path.resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(publicDir + path.sep)) return reply(res, 403, {});
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf' })[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (error) { reply(res, 500, { error: error.message }); }
  });
  server.on('upgrade', (req, socket, head) => sockets.handleUpgrade(req, socket, head, ws => sockets.emit('connection', ws, req)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, requests, get eventCount() { return eventCount; },
    state: async () => (await fetch(url + '/state')).json(),
    update: async (action, fields = {}) => {
      const response = await fetch(url + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...fields }) });
      return { status: response.status, ...await response.json() };
    },
    publish,
    disconnectClients: () => { for (const socket of sockets.clients) socket.terminate(); },
    close: async () => {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await database.close();
    },
  };
}
module.exports = { startCloudFixture };
