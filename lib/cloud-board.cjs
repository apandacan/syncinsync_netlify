const { createBoard, normalizeState } = require('./board.cjs');
const { randomUUID } = require('node:crypto');

function publicState(row) {
  return { ...normalizeState(row.state), revision: Number(row.revision) };
}

// Each attempt derives a mutation from the latest durable revision. A database
// transaction compares that revision and commits the state and receipt together.
async function updateBoard(store, input) {
  const requestId = input.requestId || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return { status: 400, body: { error: 'Invalid request ID' } };
  }
  const deadline = Date.now() + 35000;
  for (let attempt = 0; attempt < 12 && Date.now() < deadline; attempt += 1) {
    const row = await store.read();
    const board = createBoard(row.state);
    const result = board.applyUpdate(input);
    if (result.status !== 200) return result;
    if (input.action === 'setSelectedPatient') {
      return { status: 200, body: { ...result.body, state: publicState(row) } };
    }
    const body = { ...result.body, state: { ...board.getState(), revision: Number(row.revision) + 1 } };
    const committed = await store.commit({ expectedRevision: row.revision, state: board.getState(), requestId, response: body });
    if (committed.committed) return { status: 200, body: committed.response };
  }
  return { status: 409, body: { error: 'The board is busy. Please try the change again.' } };
}

module.exports = { publicState, updateBoard };
