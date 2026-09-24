-- Run on a NEW, dedicated free Supabase project. Starts with an empty board.
begin;
create table if not exists public.syncinsync_boards (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 0 check (revision >= 0)
);
alter table public.syncinsync_boards enable row level security;
revoke all on public.syncinsync_boards from anon, authenticated;
grant select on public.syncinsync_boards to anon, authenticated;
grant all on public.syncinsync_boards to service_role;
drop policy if exists board_read on public.syncinsync_boards;
create policy board_read on public.syncinsync_boards for select to anon, authenticated using (true);

-- The existing app has an open shared board. Only the function can commit
-- database writes. dz1234 remains local UI mode, not authorization.
create schema if not exists syncinsync_private;
revoke all on schema syncinsync_private from public, anon, authenticated;
create table if not exists syncinsync_private.receipts (
  board_id text not null references public.syncinsync_boards(id),
  request_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (board_id, request_id)
);
alter table syncinsync_private.receipts enable row level security;
revoke all on syncinsync_private.receipts from public, anon, authenticated;
-- No browser policies: receipts are accessible only inside the server's
-- security-definer commit function, which runs as the owning database role.

create or replace function public.syncinsync_commit(
  p_board_id text, p_expected_revision bigint, p_state jsonb,
  p_request_id uuid, p_response jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_revision bigint;
  prior_response jsonb;
begin
  select revision into current_revision from public.syncinsync_boards
    where id = p_board_id for update;
  if not found then raise exception 'Board is not initialized'; end if;
  select response into prior_response from syncinsync_private.receipts
    where board_id = p_board_id and request_id = p_request_id;
  if found then return jsonb_build_object('committed', true, 'response', prior_response); end if;
  if current_revision <> p_expected_revision then return jsonb_build_object('committed', false); end if;
  update public.syncinsync_boards set state = p_state, revision = current_revision + 1 where id = p_board_id;
  insert into syncinsync_private.receipts (board_id, request_id, response)
    values (p_board_id, p_request_id, p_response);
  delete from syncinsync_private.receipts where board_id = p_board_id and created_at < now() - interval '1 day';
  return jsonb_build_object('committed', true, 'response', p_response);
end;
$$;
revoke all on function public.syncinsync_commit(text,bigint,jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.syncinsync_commit(text,bigint,jsonb,uuid,jsonb) to service_role;

insert into public.syncinsync_boards (id, state) values ('main',
  '{"students":[],"patients":[],"timeDividerIndices":{"10am":0,"12pm":0,"3pm":0},"lunchDividerIndex":0,"updatedAt":0}'::jsonb
) on conflict (id) do nothing;
commit;
