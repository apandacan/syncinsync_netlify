import { createStore, getSettings } from '../../lib/supabase-store.mjs';

export function createHandler({ settings = getSettings, store = createStore, log = console } = {}) {
  return async () => {
    try {
      await store(settings()).ping();
      log.info('Supabase scheduled database check succeeded.');
      return new Response(null, { status: 204 });
    } catch {
      // No keys, board contents, or raw database errors in scheduled logs.
      log.error('Supabase scheduled database check failed. Check project status and Netlify environment variables.');
      throw new Error('Supabase scheduled database check failed.');
    }
  };
}

export default createHandler();
// UTC: four tiny real database reads per day; no edits and no deploy builds.
// Helps generate activity; does not guarantee exemption from Free-plan pausing.
export const config = { schedule: '0 */6 * * *' };
