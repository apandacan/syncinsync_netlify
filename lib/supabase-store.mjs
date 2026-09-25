import { createClient } from '@supabase/supabase-js';

export function getSettings(env = process.env) {
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = env.SUPABASE_SECRET_KEY;
  const boardId = env.SYNCINSYNC_BOARD_ID || 'main';
  if (!url || !publishableKey || !secretKey || !/^[a-zA-Z0-9_-]{1,64}$/.test(boardId)) {
    throw new Error('Supabase configuration is incomplete.');
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Supabase URL must be an HTTPS origin.');
  }
  // Prevent an accidentally pasted service credential from reaching browsers.
  let publicRole;
  try { publicRole = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url')).role; } catch {}
  if (!publishableKey.startsWith('sb_publishable_') && publicRole !== 'anon') {
    throw new Error('Use a publishable or legacy anon key for SUPABASE_PUBLISHABLE_KEY.');
  }
  return { url: parsed.origin, publishableKey, secretKey, boardId };
}

export function createStore(settings) {
  const client = createClient(settings.url, settings.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8000) }) },
  });
  return {
    async ping() {
      const { data, error } = await client.from('syncinsync_boards')
        .select('revision').eq('id', settings.boardId).single();
      if (error || !data) throw new Error('Could not check shared board.');
    },
    async apply({ input, requestId }) {
      const { data, error } = await client.rpc('syncinsync_apply_action', {
        p_board_id: settings.boardId, p_request_id: requestId, p_input: input,
      });
      if (error?.code === 'PGRST202') return null;
      if (error || !data) throw new Error('Could not save shared board.');
      return data;
    },
    async read() {
      const { data, error } = await client.from('syncinsync_boards')
        .select('state,revision').eq('id', settings.boardId).single();
      if (error || !data) throw new Error('Could not load shared board.');
      return data;
    },
    async commit({ expectedRevision, state, requestId, response }) {
      const { data, error } = await client.rpc('syncinsync_commit', {
        p_board_id: settings.boardId, p_expected_revision: expectedRevision,
        p_state: state, p_request_id: requestId, p_response: response,
      });
      if (error || !data) throw new Error('Could not save shared board.');
      return data;
    },
  };
}
