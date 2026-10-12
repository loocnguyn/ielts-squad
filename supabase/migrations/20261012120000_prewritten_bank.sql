-- The pre-written bank: tests that ship with the app (src/content/bank) and
-- belong to nobody, so no member can read one before it is dealt. A group
-- owner loads them from the Bank page; listening audio is rendered ahead of
-- time and uploaded from the same page.

alter table public.tests add column bank_key text unique;

create function private.owns_a_group()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.groups g where g.owner_id = (select auth.uid()));
$$;

-- p_tests is an array of validated tests, each with its bank "key". Tests whose
-- key is already present are skipped, so loading twice is harmless.
create function public.import_bank(p_tests jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test jsonb;
  v_id uuid;
  v_count integer := 0;
begin
  if not private.owns_a_group() then
    raise exception 'not_owner';
  end if;
  if jsonb_typeof(p_tests) is distinct from 'array' or jsonb_array_length(p_tests) > 40 then
    raise exception 'invalid_content';
  end if;

  for v_test in select * from jsonb_array_elements(p_tests) loop
    if coalesce(v_test ->> 'key', '') = ''
       or jsonb_typeof(v_test -> 'content') is distinct from 'object'
       or length((v_test -> 'content')::text) > 300000 then
      raise exception 'invalid_content';
    end if;
    if (v_test ->> 'skill') in ('reading', 'listening')
       and jsonb_typeof(v_test -> 'answer_key') is distinct from 'object' then
      raise exception 'invalid_answer_key';
    end if;
    if exists (select 1 from public.tests t where t.bank_key = v_test ->> 'key') then
      continue;
    end if;

    insert into public.tests (skill, part, title, question_types, content, duration_sec, bank_key)
    values (
      (v_test ->> 'skill')::public.skill,
      v_test ->> 'part',
      left(coalesce(v_test ->> 'title', ''), 200),
      coalesce(array(select jsonb_array_elements_text(v_test -> 'question_types')), '{}'),
      v_test -> 'content',
      (v_test ->> 'duration_sec')::integer,
      v_test ->> 'key')
    returning id into v_id;

    insert into public.test_secrets (test_id, answer_key, transcript)
    values (
      v_id,
      nullif(v_test -> 'answer_key', 'null'::jsonb),
      nullif(v_test -> 'transcript', 'null'::jsonb));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- How much of the bank is loaded, and which listening tests still wait for audio.
create function public.bank_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.owns_a_group() then jsonb_build_object(
    'keys', coalesce((select jsonb_agg(t.bank_key) from public.tests t where t.bank_key is not null), '[]'::jsonb),
    'missing_audio', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'key', t.bank_key) order by t.bank_key)
      from public.tests t
      where t.bank_key is not null and t.skill = 'listening' and t.audio_path is null), '[]'::jsonb)
  ) end;
$$;

create function private.bank_audio_missing(p_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.owns_a_group() and exists (
    select 1 from public.tests t
    where t.id = p_test_id and t.bank_key is not null and t.skill = 'listening' and t.audio_path is null
  );
$$;

-- Bank tests have no author, so a group owner may add their audio, once.
create or replace function public.set_test_audio(p_test_id uuid, p_audio_path text, p_duration_sec integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_audio_path not like p_test_id::text || '/%' then
    raise exception 'invalid_path';
  end if;
  update public.tests
  set audio_path = p_audio_path, duration_sec = p_duration_sec
  where id = p_test_id and skill = 'listening'
    and (created_by = auth.uid() or private.bank_audio_missing(p_test_id));
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create policy "test-audio: group owners add missing bank audio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'test-audio'
    and private.bank_audio_missing(private.try_uuid((storage.foldername(name))[1]))
  );

grant execute on function private.owns_a_group(), private.bank_audio_missing(uuid) to authenticated, service_role;

revoke execute on function public.import_bank(jsonb), public.bank_status() from public, anon;
grant execute on function public.import_bank(jsonb), public.bank_status() to authenticated, service_role;
