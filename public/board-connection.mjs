export async function connectBoard({ onState, onStatus, onError }) {
  let stopped = false;
  let source;
  let client;
  let channel;
  let retry;
  let retryMs = 1000;
  const read = async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load the shared board.');
    return data;
  };
  const refresh = async () => {
    try { const data = await read('/state'); if (!stopped) onState(data); }
    catch (error) { if (!stopped) onError(error.message); }
  };
  const resume = () => { if (document.visibilityState !== 'hidden') refresh(); };
  const start = async () => {
    try {
      const config = await read('/runtime-config');
      if (stopped) return;
      if (config.transport === 'sse') {
        source = new EventSource('/events');
        source.onopen = () => { onStatus(true); refresh(); };
        source.onmessage = (event) => {
          try { onState(JSON.parse(event.data)); } catch { onError('Could not read a board update.'); }
        };
        source.onerror = () => onStatus(false);
      } else if (config.transport === 'supabase') {
        const { createClient } = await import('/vendor/supabase.js');
        if (stopped) return;
        client = createClient(config.url, config.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        channel = client.channel(`board:${config.boardId}`)
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'syncinsync_boards', filter: `id=eq.${config.boardId}`,
          }, ({ new: row }) => {
            if (!stopped && row?.state) onState({ ...row.state, revision: Number(row.revision) });
          })
          .subscribe((status) => {
            if (stopped) return;
            onStatus(status === 'SUBSCRIBED');
            // Resnapshot after subscribing/rejoining closes any missed-event gap.
            if (status === 'SUBSCRIBED') refresh();
            else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
              onError('Live connection interrupted. Trying to reconnect.');
            }
          });
      } else throw new Error('Unsupported board connection.');
      window.addEventListener('online', resume);
      document.addEventListener('visibilitychange', resume);
      await refresh();
    } catch (error) {
      if (stopped) return;
      onStatus(false);
      onError(error.message);
      // Retry failed setup only. Board updates never use timed polling.
      retry = setTimeout(start, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    }
  };
  await start();
  return () => {
    stopped = true;
    clearTimeout(retry);
    source?.close();
    if (channel) client.removeChannel(channel);
    window.removeEventListener('online', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}
