const { createBoard, normalizeState } = require('./board.cjs');
const { randomUUID } = require('node:crypto');

function publicState(row) {
  return { ...normalizeState(row.state), revision: Number(row.revision) };
}

const FAST_ACTIONS = new Set(['updatePatientRole', 'setPatientRoleCompleted', 'togglePatientEnded']);

// Frequent clicks are applied inside one database transaction. Bulk operations
// retain the revision-checked JS engine, sharing the same lock and receipts.
async function updateBoard(store, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 400, body: { error: 'Invalid update' } };
  }
  const requestId = input.requestId || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return { status: 400, body: { error: 'Invalid request ID' } };
  }
  if (FAST_ACTIONS.has(input.action) && store.apply) {
    const action = { ...input };
    if (action.action === 'updatePatientRole') action.studentId = String(action.studentId || '');
    const result = await store.apply({ input: action, requestId });
    if (result) {
      if (result.status === 200) {
        result.body.state = publicState({ state: result.body.state, revision: result.body.state.revision });
      }
      return result;
    }
    // Only an absent SQL function allows fallback during a rolling upgrade.
    // Network/SQL errors must propagate: a timed-out toggle may already be saved.
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
