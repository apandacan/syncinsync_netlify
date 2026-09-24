-- Run after schema.sql in the same NEW Supabase project.
-- Enable committed board changes on Supabase's WebSocket transport.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'syncinsync_boards') then
    alter publication supabase_realtime add table public.syncinsync_boards;
  end if;
end $$;
