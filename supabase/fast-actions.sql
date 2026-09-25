-- Upgrade an existing SyncInSync database AFTER schema.sql. Safe to rerun.
-- Preserves the board, students, assignments, and Realtime configuration.
begin;
create or replace function public.syncinsync_apply_action(
  p_board_id text, p_request_id uuid, p_input jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  board_state jsonb;
  board_revision bigint;
  response_body jsonb;
  patient jsonb;
  patient_index integer;
  completions jsonb := '{}'::jsonb;
  assignments jsonb := '{}'::jsonb;
  previous jsonb;
  role_key text;
  action_name text := p_input->>'action';
  core_keys text[] := array['hpi','plan','mse','psychotherapy','meds'];
  role_keys text[] := array['interviewer','hpi','plan','mse','psychotherapy','meds'];
  all_complete boolean := true;
  valid_undo boolean;
begin
  -- One transaction reads the latest board under a lock, applies only this
  -- action, and stores its receipt. Legacy revision-checked saves share this lock.
  select state, revision into board_state, board_revision
    from public.syncinsync_boards where id = p_board_id for update;
  if not found then raise exception 'Board is not initialized'; end if;
  select response into response_body from syncinsync_private.receipts
    where board_id = p_board_id and request_id = p_request_id;
  if found then return jsonb_build_object('status',200,'body',response_body); end if;

  if action_name is null or action_name not in
    ('updatePatientRole','setPatientRoleCompleted','togglePatientEnded') then
    return jsonb_build_object('status',400,'body',jsonb_build_object('error','Unknown action'));
  end if;
  select value, (ordinality - 1)::integer into patient, patient_index
    from jsonb_array_elements(board_state->'patients') with ordinality
    where value->'id' = p_input->'patientId' limit 1;
  if not found then
    return jsonb_build_object('status',404,'body',jsonb_build_object('error','Patient not found'));
  end if;
  if action_name = 'updatePatientRole' and
    (p_input->>'roleKey' is null or not (p_input->>'roleKey' = any(role_keys))) then
    return jsonb_build_object('status',400,'body',jsonb_build_object('error','Invalid role key'));
  end if;
  if action_name = 'setPatientRoleCompleted' and
    (p_input->>'roleKey' is null or not (p_input->>'roleKey' = any(core_keys))
      or jsonb_typeof(p_input->'completed') is distinct from 'boolean') then
    return jsonb_build_object('status',400,'body',jsonb_build_object('error','Invalid role completion'));
  end if;

  -- Match the existing board engine's defaults for boards created before
  -- completion tracking was added. Interviewer never controls row completion.
  foreach role_key in array role_keys loop
    completions := completions || jsonb_build_object(role_key,
      coalesce(patient->'completedRoles'->role_key = 'true'::jsonb, false));
    assignments := assignments || jsonb_build_object(role_key,
      coalesce(patient->'assignments'->>role_key, ''));
  end loop;
  foreach role_key in array core_keys loop
    all_complete := all_complete and completions->role_key = 'true'::jsonb;
  end loop;
  previous := patient->'completionBeforeEnd';
  valid_undo := all_complete and jsonb_typeof(previous) = 'object';
  foreach role_key in array core_keys loop
    valid_undo := valid_undo and coalesce(jsonb_typeof(previous->role_key) = 'boolean', false);
  end loop;
  if previous @> '{"hpi":true,"plan":true,"mse":true,"psychotherapy":true,"meds":true}'::jsonb then
    valid_undo := false;
  end if;
  if valid_undo is not true then previous := 'null'::jsonb; end if;

  if action_name = 'updatePatientRole' then
    assignments := jsonb_set(assignments, array[p_input->>'roleKey'],
      to_jsonb(coalesce(p_input->>'studentId','')));
  elsif action_name = 'setPatientRoleCompleted' then
    if completions->(p_input->>'roleKey') <> p_input->'completed' then previous := 'null'::jsonb; end if;
    completions := jsonb_set(completions, array[p_input->>'roleKey'], p_input->'completed');
  elsif all_complete then
    foreach role_key in array core_keys loop
      completions := jsonb_set(completions, array[role_key],
        to_jsonb(coalesce(previous->role_key = 'true'::jsonb, false)));
    end loop;
    previous := 'null'::jsonb;
  else
    previous := completions - 'interviewer';
    foreach role_key in array core_keys loop
      completions := jsonb_set(completions, array[role_key], 'true'::jsonb);
    end loop;
  end if;
  all_complete := true;
  foreach role_key in array core_keys loop
    all_complete := all_complete and completions->role_key = 'true'::jsonb;
  end loop;
  patient := patient || jsonb_build_object('assignments',assignments,
    'completedRoles',completions,'completionBeforeEnd',previous,'ended',all_complete);
  board_state := jsonb_set(board_state, array['patients',patient_index::text],patient);
  board_state := jsonb_set(board_state, array['updatedAt'],
    to_jsonb(floor(extract(epoch from clock_timestamp()) * 1000)::bigint));
  response_body := jsonb_build_object('ok',true,'currentUserStudentId',null,
    'state',board_state || jsonb_build_object('revision',board_revision + 1));
  update public.syncinsync_boards set state = board_state, revision = board_revision + 1
    where id = p_board_id;
  insert into syncinsync_private.receipts(board_id,request_id,response)
    values(p_board_id,p_request_id,response_body);
  delete from syncinsync_private.receipts where board_id = p_board_id
    and created_at < now() - interval '1 day';
  return jsonb_build_object('status',200,'body',response_body);
end;
$$;
revoke all on function public.syncinsync_apply_action(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.syncinsync_apply_action(text,uuid,jsonb) to service_role;
commit;
