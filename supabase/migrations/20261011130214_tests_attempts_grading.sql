-- Test bank import, daily dealing, the attempt lifecycle, grading, streaks,
-- badges, storage and realtime. All privileged writes are definer functions.

create extension if not exists pg_cron;

create or replace function public.round_band(x numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select (floor(x * 2 + 0.5) / 2)::numeric(3, 1) $$;

create function private.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

-- Case, punctuation, hyphens and extra spaces never cost a mark. Spelling
-- variants (colour/color) are expanded into the answer key at import time.
create function private.normalize_answer(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p, '')), '[-–—]', ' ', 'g'),
      '[.,;:!?"“”‘’'']', '', 'g'),
    '\s+', ' ', 'g'));
$$;

-- p_key is {"1": ["accepted", "also accepted"], ...}; p_answers is {"1": "given"}.
create function private.score_answers(p_key jsonb, p_answers jsonb)
returns table (raw integer, total integer)
language sql
immutable
set search_path = ''
as $$
  select
    count(*) filter (where exists (
      select 1 from jsonb_array_elements_text(k.value) accepted
      where private.normalize_answer(accepted) <> ''
        and private.normalize_answer(accepted) = private.normalize_answer(p_answers ->> k.key)
    ))::integer,
    count(*)::integer
  from jsonb_each(p_key) k;
$$;

-- Daily sets have 13-20 questions, so the raw score is scaled to /40 before
-- the published conversion table is applied. An estimate, not an official band.
create function private.band_from_raw(p_skill public.skill, p_raw integer, p_total integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with s as (
    select case when p_total > 0 then round(p_raw * 40.0 / p_total)::integer else 0 end as v
  )
  select (case
    when p_skill = 'listening' then case
      when v >= 39 then 9 when v >= 37 then 8.5 when v >= 35 then 8 when v >= 32 then 7.5
      when v >= 30 then 7 when v >= 26 then 6.5 when v >= 23 then 6 when v >= 18 then 5.5
      when v >= 16 then 5 when v >= 13 then 4.5 when v >= 10 then 4 when v >= 8 then 3.5
      when v >= 6 then 3 when v >= 4 then 2.5 when v >= 2 then 2 when v >= 1 then 1 else 0 end
    else case
      when v >= 39 then 9 when v >= 37 then 8.5 when v >= 35 then 8 when v >= 33 then 7.5
      when v >= 30 then 7 when v >= 27 then 6.5 when v >= 23 then 6 when v >= 19 then 5.5
      when v >= 15 then 5 when v >= 13 then 4.5 when v >= 10 then 4 when v >= 8 then 3.5
      when v >= 6 then 3 when v >= 4 then 2.5 when v >= 2 then 2 when v >= 1 then 1 else 0 end
  end)::numeric(2, 1)
  from s;
$$;

-- ---------------------------------------------------------------------------
-- Test bank
-- ---------------------------------------------------------------------------

create function public.import_test(
  p_skill public.skill,
  p_part text,
  p_title text,
  p_question_types text[],
  p_content jsonb,
  p_duration_sec integer,
  p_answer_key jsonb default null,
  p_transcript jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_test_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if jsonb_typeof(p_content) is distinct from 'object' or length(p_content::text) > 300000 then
    raise exception 'invalid_content';
  end if;
  if p_skill in ('reading', 'listening') then
    if jsonb_typeof(p_answer_key) is distinct from 'object'
       or p_answer_key = '{}'::jsonb
       or exists (select 1 from jsonb_each(p_answer_key) k where jsonb_typeof(k.value) <> 'array') then
      raise exception 'invalid_answer_key';
    end if;
  end if;
  if p_skill = 'listening' and jsonb_typeof(p_transcript) is distinct from 'object' then
    raise exception 'invalid_transcript';
  end if;
  if (select count(*) from public.tests t
      where t.created_by = v_uid and t.created_at > now() - interval '1 day') >= 100 then
    raise exception 'import_limit';
  end if;

  insert into public.tests (skill, part, title, question_types, content, duration_sec, created_by)
  values (p_skill, p_part, left(coalesce(p_title, ''), 200), coalesce(p_question_types, '{}'),
          p_content, p_duration_sec, v_uid)
  returning id into v_test_id;

  insert into public.test_secrets (test_id, answer_key, transcript)
  values (v_test_id, p_answer_key, p_transcript);

  return v_test_id;
end;
$$;

-- Listening tests become dealable once their audio is uploaded.
create function public.set_test_audio(p_test_id uuid, p_audio_path text, p_duration_sec integer)
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
  where id = p_test_id and created_by = auth.uid() and skill = 'listening';
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create function public.delete_test(p_test_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.daily_sets ds
    where p_test_id in (ds.reading_test_id, ds.listening_test_id, ds.writing_test_id, ds.speaking_test_id)
  ) then
    raise exception 'test_in_use';
  end if;
  delete from public.tests where id = p_test_id and created_by = auth.uid();
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- The author pasted these themselves; they need the transcript back to
-- generate listening audio in a later session.
create function public.get_test_secrets(p_test_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('answer_key', s.answer_key, 'transcript', s.transcript)
  from public.test_secrets s
  join public.tests t on t.id = s.test_id
  where t.id = p_test_id and t.created_by = (select auth.uid());
$$;

create function public.bank_summary()
returns table (skill public.skill, part text, total bigint, ready bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.skill, t.part, count(*),
         count(*) filter (where t.skill <> 'listening' or t.audio_path is not null)
  from public.tests t
  where (select auth.uid()) is not null
  group by t.skill, t.part;
$$;

-- ---------------------------------------------------------------------------
-- Daily sets
-- ---------------------------------------------------------------------------

create function private.pick_test(p_group_id uuid, p_skill public.skill, p_part text)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select t.id
  from public.tests t
  where t.skill = p_skill
    and (p_part is null or t.part = p_part)
    and (p_skill <> 'listening' or t.audio_path is not null)
    and not exists (
      select 1 from public.daily_sets ds
      where ds.group_id = p_group_id
        and t.id in (ds.reading_test_id, ds.listening_test_id, ds.writing_test_id, ds.speaking_test_id)
    )
  order by random()
  limit 1;
$$;

-- Creates today's set for a group, or fills slots that were empty because the
-- bank had run dry. Writing alternates Task 1 (odd days) and Task 2 (even
-- days); Speaking rotates Part 1, 2, 3.
create function private.deal_daily_set(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_cutoff time;
  v_set public.daily_sets;
  v_writing_part text;
  v_speaking_part text;
begin
  -- The row lock serializes concurrent deals for the same group.
  select g.cutoff_time into v_cutoff from public.groups g where g.id = p_group_id for update;
  if not found then
    return null;
  end if;

  v_writing_part := case when extract(day from v_today)::integer % 2 = 1 then 'task1' else 'task2' end;
  v_speaking_part := 'part' || ((v_today - date '2026-01-01') % 3 + 1);

  select * into v_set from public.daily_sets ds where ds.group_id = p_group_id and ds.date = v_today;
  if not found then
    insert into public.daily_sets (group_id, date, closes_at)
    values (
      p_group_id,
      v_today,
      ((v_today + v_cutoff) at time zone 'Asia/Ho_Chi_Minh') + interval '59 seconds'
    )
    returning * into v_set;
  end if;

  if v_set.closes_at > now() then
    update public.daily_sets ds set
      reading_test_id = coalesce(ds.reading_test_id, private.pick_test(p_group_id, 'reading', null)),
      listening_test_id = coalesce(ds.listening_test_id, private.pick_test(p_group_id, 'listening', null)),
      writing_test_id = coalesce(
        ds.writing_test_id,
        private.pick_test(p_group_id, 'writing', v_writing_part),
        private.pick_test(p_group_id, 'writing', null)),
      speaking_test_id = coalesce(
        ds.speaking_test_id,
        private.pick_test(p_group_id, 'speaking', v_speaking_part),
        private.pick_test(p_group_id, 'speaking', null))
    where ds.id = v_set.id;
  end if;

  return v_set.id;
end;
$$;

create function private.deal_all_groups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_count integer := 0;
begin
  for v_group_id in select g.id from public.groups g loop
    perform private.deal_daily_set(v_group_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Called when a member opens the board, so a group never waits for the cron.
create function public.ensure_daily_set(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_group_member(p_group_id) then
    raise exception 'not_found';
  end if;
  return private.deal_daily_set(p_group_id);
end;
$$;

-- 00:00 in Vietnam is 17:00 UTC.
select cron.schedule('deal-daily-sets', '0 17 * * *', 'select private.deal_all_groups()');

-- ---------------------------------------------------------------------------
-- Streaks and badges
-- ---------------------------------------------------------------------------

create function private.award_badge(p_user_id uuid, p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.badges (user_id, code) values (p_user_id, p_code)
  on conflict (user_id, code) do nothing;
$$;

-- A day counts once every skill that was dealt has been submitted.
create function private.update_streak(p_user_id uuid, p_daily_set_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.daily_sets;
  v_needed integer;
  v_done integer;
  v_current integer;
begin
  select * into v_set from public.daily_sets ds where ds.id = p_daily_set_id;
  v_needed := (v_set.reading_test_id is not null)::integer
            + (v_set.listening_test_id is not null)::integer
            + (v_set.writing_test_id is not null)::integer
            + (v_set.speaking_test_id is not null)::integer;
  select count(*) into v_done
  from public.attempts a
  where a.daily_set_id = p_daily_set_id and a.user_id = p_user_id and a.submitted_at is not null;

  if v_needed = 0 or v_done < v_needed then
    return;
  end if;

  insert into public.streaks as s (user_id, group_id, current, best, last_full_day)
  values (p_user_id, v_set.group_id, 1, 1, v_set.date)
  on conflict (user_id, group_id) do update set
    current = case
      when s.last_full_day = excluded.last_full_day then s.current
      when s.last_full_day = excluded.last_full_day - 1 then s.current + 1
      else 1
    end,
    last_full_day = excluded.last_full_day
  returning s.current into v_current;

  update public.streaks s set best = greatest(s.best, s.current)
  where s.user_id = p_user_id and s.group_id = v_set.group_id;

  perform private.award_badge(p_user_id, 'first_full_day');
  if v_current >= 3 then perform private.award_badge(p_user_id, 'streak_3'); end if;
  if v_current >= 7 then perform private.award_badge(p_user_id, 'streak_7'); end if;
  if v_current >= 30 then perform private.award_badge(p_user_id, 'streak_30'); end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attempt lifecycle. The clock lives here: started_at is set by the server and
-- the deadline is derived from it, so closing the tab or changing the device
-- clock gains nothing.
-- ---------------------------------------------------------------------------

create function private.set_test_id(p_set public.daily_sets, p_skill public.skill)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case p_skill
    when 'reading' then p_set.reading_test_id
    when 'listening' then p_set.listening_test_id
    when 'writing' then p_set.writing_test_id
    when 'speaking' then p_set.speaking_test_id
  end;
$$;

create function public.start_attempt(p_daily_set_id uuid, p_skill public.skill)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_set public.daily_sets;
  v_test_id uuid;
  v_duration integer;
  v_attempt public.attempts;
begin
  select * into v_set from public.daily_sets ds where ds.id = p_daily_set_id;
  if not found or not private.is_group_member(v_set.group_id) then
    raise exception 'not_found';
  end if;
  v_test_id := private.set_test_id(v_set, p_skill);
  if v_test_id is null then
    raise exception 'no_test';
  end if;
  select t.duration_sec into v_duration from public.tests t where t.id = v_test_id;

  select * into v_attempt from public.attempts a
  where a.daily_set_id = p_daily_set_id and a.user_id = v_uid and a.skill = p_skill;
  if not found then
    if now() >= v_set.closes_at then
      raise exception 'day_closed';
    end if;
    insert into public.attempts as a (daily_set_id, user_id, skill)
    values (p_daily_set_id, v_uid, p_skill)
    on conflict (daily_set_id, user_id, skill) do update set skill = excluded.skill
    returning a.* into v_attempt;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'test_id', v_test_id,
    'started_at', v_attempt.started_at,
    'deadline', least(v_attempt.started_at + make_interval(secs => v_duration), v_set.closes_at),
    'submitted_at', v_attempt.submitted_at,
    'server_now', now()
  );
end;
$$;

-- Autosave while the clock is running.
create function public.save_attempt_draft(p_attempt_id uuid, p_answers jsonb, p_essay text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts;
  v_deadline timestamptz;
begin
  select a.* into v_attempt from public.attempts a
  where a.id = p_attempt_id and a.user_id = auth.uid() and a.submitted_at is null;
  if not found then
    return false;
  end if;

  select least(v_attempt.started_at + make_interval(secs => t.duration_sec), ds.closes_at)
  into v_deadline
  from public.daily_sets ds
  join public.tests t on t.id = private.set_test_id(ds, v_attempt.skill)
  where ds.id = v_attempt.daily_set_id;

  if v_deadline is null or now() > v_deadline + interval '30 seconds' then
    return false;
  end if;

  update public.attempts a set
    answers = coalesce(p_answers, a.answers),
    essay_text = coalesce(p_essay, a.essay_text)
  where a.id = p_attempt_id;
  return true;
end;
$$;

-- Submitting after the deadline (plus a short grace for the network, longer
-- for speaking because transcription runs on the device) is not rejected
-- outright: the last autosaved draft is what counts, stamped at the deadline.
create function public.submit_attempt(
  p_attempt_id uuid,
  p_answers jsonb default null,
  p_essay text default null,
  p_transcript text default null,
  p_audio_path text default null,
  p_speaking_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts;
  v_set public.daily_sets;
  v_test public.tests;
  v_deadline timestamptz;
  v_late boolean;
  v_key jsonb;
  v_raw integer;
  v_total integer;
  v_band numeric;
begin
  select * into v_attempt from public.attempts a
  where a.id = p_attempt_id and a.user_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_attempt.submitted_at is not null then
    raise exception 'already_submitted';
  end if;
  if p_audio_path is not null and p_audio_path not like v_uid::text || '/%' then
    raise exception 'invalid_path';
  end if;

  select * into v_set from public.daily_sets ds where ds.id = v_attempt.daily_set_id;
  select * into v_test from public.tests t where t.id = private.set_test_id(v_set, v_attempt.skill);
  v_deadline := least(
    v_attempt.started_at + make_interval(secs => v_test.duration_sec), v_set.closes_at);
  v_late := now() > v_deadline + case when v_attempt.skill = 'speaking'
    then interval '5 minutes' else interval '30 seconds' end;

  update public.attempts a set
    answers = case when v_late then a.answers else coalesce(p_answers, a.answers) end,
    essay_text = case when v_late then a.essay_text else coalesce(p_essay, a.essay_text) end,
    transcript = case when v_late then a.transcript else coalesce(p_transcript, a.transcript) end,
    audio_path = case when v_late then a.audio_path else coalesce(p_audio_path, a.audio_path) end,
    speaking_seconds = case when v_late then a.speaking_seconds
      else coalesce(p_speaking_seconds, a.speaking_seconds) end,
    submitted_at = case when v_late then v_deadline else now() end
  where a.id = p_attempt_id
  returning a.* into v_attempt;

  if v_attempt.skill in ('reading', 'listening') then
    select s.answer_key into v_key from public.test_secrets s where s.test_id = v_test.id;
    select sc.raw, sc.total into v_raw, v_total
    from private.score_answers(coalesce(v_key, '{}'::jsonb), coalesce(v_attempt.answers, '{}'::jsonb)) sc;
    v_band := private.band_from_raw(v_attempt.skill, v_raw, v_total);

    insert into public.grades (attempt_id, band, raw_score, raw_total, source)
    values (p_attempt_id, v_band, v_raw, v_total, 'auto')
    on conflict (attempt_id, source) do nothing;

    if v_band >= 8 then
      perform private.award_badge(v_uid, 'band8_' || v_attempt.skill::text);
    end if;
  end if;

  perform private.update_streak(v_uid, v_set.id);

  return jsonb_build_object('late', v_late, 'raw', v_raw, 'total', v_total, 'band', v_band);
end;
$$;

-- The grade the learner pastes back from Claude Pro for their own Writing or
-- Speaking attempt. Trust-based by design: it is their own score.
create function public.save_claude_grade(
  p_attempt_id uuid,
  p_band numeric,
  p_criteria jsonb,
  p_feedback jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_skill public.skill;
begin
  select a.skill into v_skill from public.attempts a
  where a.id = p_attempt_id and a.user_id = v_uid and a.submitted_at is not null;
  if not found then
    raise exception 'not_found';
  end if;
  if v_skill not in ('writing', 'speaking') then
    raise exception 'not_gradable';
  end if;

  insert into public.grades as g (attempt_id, band, criteria, feedback, source, graded_by)
  values (p_attempt_id, p_band, p_criteria, p_feedback, 'claude-pro', v_uid)
  on conflict (attempt_id, source) do update set
    band = excluded.band,
    criteria = excluded.criteria,
    feedback = excluded.feedback,
    created_at = now();

  if p_band >= 8 then
    perform private.award_badge(v_uid, 'band8_' || v_skill::text);
  end if;
end;
$$;

-- Answer key and transcript, released only for an attempt the caller may see.
create function public.get_attempt_review(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('answer_key', s.answer_key, 'transcript', s.transcript)
  from public.attempts a
  join public.daily_sets ds on ds.id = a.daily_set_id
  join public.test_secrets s on s.test_id = private.set_test_id(ds, a.skill)
  where a.id = p_attempt_id
    and a.submitted_at is not null
    and (a.user_id = (select auth.uid()) or private.can_view_attempt(a.id));
$$;

-- Keep one 'peer' grade per attempt in step with its reviews.
create function private.sync_peer_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid := coalesce(new.attempt_id, old.attempt_id);
  v_band numeric;
begin
  select public.round_band(avg(pr.band)) into v_band
  from public.peer_reviews pr
  where pr.attempt_id = v_attempt_id and pr.band is not null;

  if v_band is null then
    delete from public.grades g where g.attempt_id = v_attempt_id and g.source = 'peer';
  else
    insert into public.grades as g (attempt_id, band, source)
    values (v_attempt_id, v_band, 'peer')
    on conflict (attempt_id, source) do update set band = excluded.band, created_at = now();
  end if;
  return null;
end;
$$;

create trigger peer_reviews_sync_grade
  after insert or update or delete on public.peer_reviews
  for each row execute function private.sync_peer_grade();

-- ---------------------------------------------------------------------------
-- Storage: generated listening audio and speaking recordings, both private.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('test-audio', 'test-audio', false, 20971520, array['audio/*']),
  ('recordings', 'recordings', false, 20971520, array['audio/*'])
on conflict (id) do nothing;

-- Paths are {test_id}/audio.mp3. The tests subquery runs under tests RLS, so
-- audio is readable exactly when its test is.
create policy "test-audio: read with the test" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'test-audio'
    and exists (
      select 1 from public.tests t
      where t.id = private.try_uuid((storage.foldername(name))[1])
    )
  );

create policy "test-audio: author uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'test-audio'
    and exists (
      select 1 from public.tests t
      where t.id = private.try_uuid((storage.foldername(name))[1])
        and t.created_by = (select auth.uid())
    )
  );

create policy "test-audio: author replaces" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'test-audio'
    and exists (
      select 1 from public.tests t
      where t.id = private.try_uuid((storage.foldername(name))[1])
        and t.created_by = (select auth.uid())
    )
  );

-- Paths are {user_id}/{attempt_id}.webm.
create policy "recordings: owner uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "recordings: owner or group mates after submitting" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.can_view_attempt(private.try_uuid(split_part(storage.filename(name), '.', 1)))
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: private broadcast channels named "group:{group_id}".
-- ---------------------------------------------------------------------------

create policy "group channel: members listen" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.is_group_member(private.try_uuid(split_part((select realtime.topic()), ':', 2)))
  );

create policy "group channel: members send" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and private.is_group_member(private.try_uuid(split_part((select realtime.topic()), ':', 2)))
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant execute on all functions in schema private to authenticated, service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.round_band(numeric),
  public.import_test(public.skill, text, text, text[], jsonb, integer, jsonb, jsonb),
  public.set_test_audio(uuid, text, integer),
  public.delete_test(uuid),
  public.get_test_secrets(uuid),
  public.bank_summary(),
  public.ensure_daily_set(uuid),
  public.start_attempt(uuid, public.skill),
  public.save_attempt_draft(uuid, jsonb, text),
  public.submit_attempt(uuid, jsonb, text, text, text, integer),
  public.save_claude_grade(uuid, numeric, jsonb, jsonb),
  public.get_attempt_review(uuid)
to authenticated, service_role;
