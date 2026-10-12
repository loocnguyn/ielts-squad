-- The speaking room: a full mock Speaking test (Part 1 + 2 + 3) taken with a
-- partner over video. One member examines, the other answers; each candidate
-- gets a test nobody in the group has seen. The finished turn is stored as the
-- candidate's Speaking attempt for the day, so grading and peer review work as
-- for every other skill.

-- A room attempt carries its own test: daily_sets has one test per skill for
-- the whole group, and here every member gets a different one.
alter table public.attempts add column test_id uuid references public.tests (id);

create table public.speaking_turns (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  date date not null,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  examiner_id uuid references public.profiles (id) on delete set null,
  test_id uuid not null references public.tests (id),
  attempt_id uuid references public.attempts (id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, date, candidate_id),
  -- A test is used once per group, so no member ever meets it twice.
  unique (group_id, test_id)
);
create index speaking_turns_candidate_idx on public.speaking_turns (candidate_id);

alter table public.speaking_turns enable row level security;

create policy "speaking_turns: members read" on public.speaking_turns
  for select to authenticated
  using (private.is_group_member(group_id));

grant select on public.speaking_turns to authenticated;

-- The examiner reads a test through claim_speaking_turn; everyone else in the
-- group may read it once the turn is over, and the candidate never before.
create or replace function private.can_view_test(p_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.daily_sets ds
    where p_test_id in (ds.reading_test_id, ds.listening_test_id, ds.writing_test_id, ds.speaking_test_id)
      and ds.date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
      and private.is_group_member(ds.group_id)
  ) or exists (
    select 1 from public.speaking_turns st
    where st.test_id = p_test_id
      and st.finished_at is not null
      and private.is_group_member(st.group_id)
  );
$$;

-- Full mock tests belong to the speaking room and are never dealt to a set.
create or replace function private.pick_test(p_group_id uuid, p_skill public.skill, p_part text)
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
    and t.part <> 'full'
    and (p_skill <> 'listening' or t.audio_path is not null)
    and not exists (
      select 1 from public.daily_sets ds
      where ds.group_id = p_group_id
        and t.id in (ds.reading_test_id, ds.listening_test_id, ds.writing_test_id, ds.speaking_test_id)
    )
  order by random()
  limit 1;
$$;

-- A day counts once every dealt skill is submitted. A speaking room attempt
-- has no dealt test behind it, so it neither counts towards nor blocks a streak.
create or replace function private.update_streak(p_user_id uuid, p_daily_set_id uuid)
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
  where a.daily_set_id = p_daily_set_id and a.user_id = p_user_id and a.submitted_at is not null
    and private.set_test_id(v_set, a.skill) is not null;

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

-- The caller offers to examine a group mate today. Returns the turn and the
-- test the examiner will read from, dealing a fresh test the first time.
create function public.claim_speaking_turn(p_group_id uuid, p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_turn public.speaking_turns;
  v_test_id uuid;
begin
  if not private.is_group_member(p_group_id) then
    raise exception 'not_found';
  end if;
  if p_candidate_id = v_uid then
    raise exception 'own_turn';
  end if;
  if not exists (
    select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_candidate_id
  ) then
    raise exception 'not_found';
  end if;

  -- The row lock serializes claims within a group.
  perform 1 from public.groups g where g.id = p_group_id for update;

  select * into v_turn from public.speaking_turns st
  where st.group_id = p_group_id and st.date = v_today and st.candidate_id = p_candidate_id;

  if not found then
    select t.id into v_test_id
    from public.tests t
    where t.skill = 'speaking' and t.part = 'full'
      and not exists (
        select 1 from public.speaking_turns st where st.group_id = p_group_id and st.test_id = t.id
      )
    order by random()
    limit 1;
    if v_test_id is null then
      raise exception 'no_test';
    end if;
    insert into public.speaking_turns (group_id, date, candidate_id, examiner_id, test_id)
    values (p_group_id, v_today, p_candidate_id, v_uid, v_test_id)
    returning * into v_turn;
  elsif v_turn.finished_at is not null then
    raise exception 'already_done';
  else
    update public.speaking_turns st set examiner_id = v_uid where st.id = v_turn.id returning * into v_turn;
  end if;

  return jsonb_build_object(
    'turn', to_jsonb(v_turn),
    'test', (
      select jsonb_build_object('id', t.id, 'title', t.title, 'content', t.content)
      from public.tests t where t.id = v_turn.test_id
    )
  );
end;
$$;

-- The examiner starts the clock: the candidate's Speaking attempt for today
-- is opened (or reopened after a cancelled try).
create function public.begin_speaking_turn(p_turn_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn public.speaking_turns;
  v_set_id uuid;
  v_attempt_id uuid;
begin
  select * into v_turn from public.speaking_turns st
  where st.id = p_turn_id and st.examiner_id = auth.uid()
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_turn.finished_at is not null then
    raise exception 'already_done';
  end if;
  if v_turn.date <> (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'day_closed';
  end if;

  v_set_id := private.deal_daily_set(v_turn.group_id);

  insert into public.attempts as a (daily_set_id, user_id, skill, test_id)
  values (v_set_id, v_turn.candidate_id, 'speaking', v_turn.test_id)
  on conflict (daily_set_id, user_id, skill) do update
    set test_id = excluded.test_id, started_at = now()
    where a.submitted_at is null
  returning a.id into v_attempt_id;
  if v_attempt_id is null then
    raise exception 'already_done';
  end if;

  update public.speaking_turns st
  set started_at = now(), attempt_id = v_attempt_id
  where st.id = p_turn_id;
  return v_attempt_id;
end;
$$;

-- The candidate hands in the recording and its transcript when the turn ends.
create function public.finish_speaking_turn(
  p_turn_id uuid,
  p_transcript text,
  p_audio_path text,
  p_speaking_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_turn public.speaking_turns;
  v_set_id uuid;
begin
  select * into v_turn from public.speaking_turns st
  where st.id = p_turn_id and st.candidate_id = v_uid
  for update;
  if not found or v_turn.attempt_id is null then
    raise exception 'not_found';
  end if;
  if v_turn.finished_at is not null then
    raise exception 'already_done';
  end if;
  if p_audio_path is not null and p_audio_path not like v_uid::text || '/%' then
    raise exception 'invalid_path';
  end if;

  update public.attempts a set
    transcript = left(coalesce(p_transcript, ''), 60000),
    audio_path = p_audio_path,
    speaking_seconds = p_speaking_seconds,
    submitted_at = now()
  where a.id = v_turn.attempt_id and a.user_id = v_uid and a.submitted_at is null
  returning a.daily_set_id into v_set_id;
  if v_set_id is null then
    raise exception 'already_done';
  end if;

  update public.speaking_turns st set finished_at = now() where st.id = p_turn_id;
  perform private.update_streak(v_uid, v_set_id);
  return v_turn.attempt_id;
end;
$$;

-- Either side can abandon a turn that was started; the same test is asked again.
create function public.cancel_speaking_turn(p_turn_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn public.speaking_turns;
begin
  select * into v_turn from public.speaking_turns st
  where st.id = p_turn_id and auth.uid() in (st.candidate_id, st.examiner_id) and st.finished_at is null
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  delete from public.attempts a where a.id = v_turn.attempt_id and a.submitted_at is null;
  update public.speaking_turns st set started_at = null, attempt_id = null where st.id = p_turn_id;
end;
$$;

revoke execute on function
  public.claim_speaking_turn(uuid, uuid),
  public.begin_speaking_turn(uuid),
  public.finish_speaking_turn(uuid, text, text, integer),
  public.cancel_speaking_turn(uuid)
from public, anon;
grant execute on function
  public.claim_speaking_turn(uuid, uuid),
  public.begin_speaking_turn(uuid),
  public.finish_speaking_turn(uuid, text, text, integer),
  public.cancel_speaking_turn(uuid)
to authenticated, service_role;

-- Speaking is now taken in the speaking room, so the daily set deals the three
-- skills that are done alone. Writing alternates Task 1 (odd days) and Task 2
-- (even days). Sets dealt earlier keep whatever speaking test they had.
create or replace function private.deal_daily_set(p_group_id uuid)
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
begin
  -- The row lock serializes concurrent deals for the same group.
  select g.cutoff_time into v_cutoff from public.groups g where g.id = p_group_id for update;
  if not found then
    return null;
  end if;

  v_writing_part := case when extract(day from v_today)::integer % 2 = 1 then 'task1' else 'task2' end;

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
        private.pick_test(p_group_id, 'writing', null))
    where ds.id = v_set.id;
  end if;

  return v_set.id;
end;
$$;
