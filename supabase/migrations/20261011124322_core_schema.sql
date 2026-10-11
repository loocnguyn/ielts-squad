-- IELTS Squad core schema: profiles, groups, test bank, daily sets, attempts, grades.
-- Every privileged write goes through a SECURITY DEFINER function, so the app
-- only ever needs the publishable key.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.skill as enum ('reading', 'listening', 'writing', 'speaking');
create type public.grade_source as enum ('auto', 'claude-pro', 'peer');
create type public.member_role as enum ('owner', 'member');

-- IELTS bands run 0-9 in half steps.
create domain public.band as numeric(2, 1)
  check (value between 0 and 9 and value * 2 = trunc(value * 2));

-- IELTS rounding: .25 rounds up to .5, .75 rounds up to the next whole band.
create function public.round_band(x numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select floor(x * 2 + 0.5) / 2 $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar_url text,
  current_band public.band,
  target_band public.band not null default 8.0,
  exam_date date,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  cutoff_time time not null default '23:59',
  full_test_sunday boolean not null default false,
  created_at timestamptz not null default now()
);
create index groups_owner_id_idx on public.groups (owner_id);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  skill public.skill not null,
  part text not null,
  question_types text[] not null default '{}',
  title text not null default '',
  content jsonb not null,
  duration_sec integer not null check (duration_sec between 60 and 10800),
  audio_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index tests_skill_part_idx on public.tests (skill, part);
create index tests_created_by_idx on public.tests (created_by);

-- Answer keys and listening transcripts live apart from tests so no SELECT on
-- tests can ever leak them. RLS is on with no policies: only definer functions
-- read this table.
create table public.test_secrets (
  test_id uuid primary key references public.tests (id) on delete cascade,
  answer_key jsonb,
  transcript jsonb
);

create table public.daily_sets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  date date not null,
  reading_test_id uuid references public.tests (id) on delete set null,
  listening_test_id uuid references public.tests (id) on delete set null,
  writing_test_id uuid references public.tests (id) on delete set null,
  speaking_test_id uuid references public.tests (id) on delete set null,
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (group_id, date)
);
create index daily_sets_reading_test_id_idx on public.daily_sets (reading_test_id);
create index daily_sets_listening_test_id_idx on public.daily_sets (listening_test_id);
create index daily_sets_writing_test_id_idx on public.daily_sets (writing_test_id);
create index daily_sets_speaking_test_id_idx on public.daily_sets (speaking_test_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  daily_set_id uuid not null references public.daily_sets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill public.skill not null,
  answers jsonb,
  essay_text text,
  transcript text,
  audio_path text,
  speaking_seconds integer,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (daily_set_id, user_id, skill)
);
create index attempts_user_id_idx on public.attempts (user_id);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  band public.band not null,
  raw_score integer,
  raw_total integer,
  criteria jsonb,
  feedback jsonb,
  source public.grade_source not null,
  graded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (attempt_id, source)
);
create index grades_graded_by_idx on public.grades (graded_by);

create table public.peer_reviews (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  band public.band,
  comment text check (char_length(comment) <= 2000),
  vote boolean not null default false,
  created_at timestamptz not null default now(),
  unique (attempt_id, reviewer_id)
);
create index peer_reviews_reviewer_id_idx on public.peer_reviews (reviewer_id);

create table public.streaks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  current integer not null default 0 check (current >= 0),
  best integer not null default 0 check (best >= 0),
  last_full_day date,
  primary key (user_id, group_id)
);
create index streaks_group_id_idx on public.streaks (group_id);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, code)
);

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so policies can look at membership without
-- recursing into the RLS of the tables they protect.
-- ---------------------------------------------------------------------------

create function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = (select auth.uid())
  );
$$;

create function private.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_id = (select auth.uid())
  );
$$;

create function private.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = (select auth.uid()) and them.user_id = p_user_id
  );
$$;

-- A submitted attempt is visible to group mates once they have submitted the
-- same skill of the same daily set, or once the day has closed.
create function private.can_view_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attempts a
    join public.daily_sets ds on ds.id = a.daily_set_id
    where a.id = p_attempt_id
      and a.submitted_at is not null
      and private.is_group_member(ds.group_id)
      and (
        ds.closes_at <= now()
        or exists (
          select 1 from public.attempts mine
          where mine.daily_set_id = a.daily_set_id
            and mine.skill = a.skill
            and mine.user_id = (select auth.uid())
            and mine.submitted_at is not null
        )
      )
  );
$$;

create function private.can_review_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_attempt(p_attempt_id)
    and not exists (
      select 1 from public.attempts a
      where a.id = p_attempt_id and a.user_id = (select auth.uid())
    );
$$;

-- A test is readable once it has been dealt to one of the caller's groups.
create function private.can_view_test(p_test_id uuid)
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
  );
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.tests enable row level security;
alter table public.test_secrets enable row level security;
alter table public.daily_sets enable row level security;
alter table public.attempts enable row level security;
alter table public.grades enable row level security;
alter table public.peer_reviews enable row level security;
alter table public.streaks enable row level security;
alter table public.badges enable row level security;

create policy "profiles: read self and group mates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_group_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "groups: members read" on public.groups
  for select to authenticated
  using (private.is_group_member(id));

create policy "groups: owner updates" on public.groups
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "groups: owner deletes" on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "group_members: members read" on public.group_members
  for select to authenticated
  using (private.is_group_member(group_id));

-- A member may leave; the owner may remove anyone but themselves.
create policy "group_members: leave or be removed by owner" on public.group_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (user_id <> (select auth.uid()) and private.is_group_owner(group_id))
  );

create policy "tests: creator or dealt to my group" on public.tests
  for select to authenticated
  using (created_by = (select auth.uid()) or private.can_view_test(id));

create policy "daily_sets: members read" on public.daily_sets
  for select to authenticated
  using (private.is_group_member(group_id));

create policy "attempts: own, or group mates after I submit" on public.attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or private.can_view_attempt(id));

-- The subquery runs under the attempts policy, so a grade is visible exactly
-- when its attempt is.
create policy "grades: follow attempt visibility" on public.grades
  for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id));

create policy "peer_reviews: follow attempt visibility" on public.peer_reviews
  for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id));

create policy "peer_reviews: review visible attempts of others" on public.peer_reviews
  for insert to authenticated
  with check (reviewer_id = (select auth.uid()) and private.can_review_attempt(attempt_id));

create policy "peer_reviews: edit own review" on public.peer_reviews
  for update to authenticated
  using (reviewer_id = (select auth.uid()))
  with check (reviewer_id = (select auth.uid()) and private.can_review_attempt(attempt_id));

create policy "peer_reviews: delete own review" on public.peer_reviews
  for delete to authenticated
  using (reviewer_id = (select auth.uid()));

create policy "streaks: members read" on public.streaks
  for select to authenticated
  using (private.is_group_member(group_id));

create policy "badges: read self and group mates" on public.badges
  for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_group_with(user_id));

-- ---------------------------------------------------------------------------
-- Grants: nothing for anon; authenticated reads through RLS and writes only
-- the few columns it owns.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.profiles, public.groups, public.group_members, public.tests,
  public.daily_sets, public.attempts, public.grades, public.peer_reviews,
  public.streaks, public.badges
to authenticated;

grant update (display_name, avatar_url, current_band, target_band, exam_date, onboarded_at)
  on public.profiles to authenticated;
grant update (name, cutoff_time, full_test_sunday) on public.groups to authenticated;
grant delete on public.groups, public.group_members, public.peer_reviews to authenticated;
grant insert (attempt_id, band, comment, vote) on public.peer_reviews to authenticated;
grant update (band, comment, vote) on public.peer_reviews to authenticated;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Profile bootstrap
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      split_part(new.email, '@', 1),
      ''
    ), 40),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Group functions
-- ---------------------------------------------------------------------------

-- 32 symbols without the look-alikes I, O, 0, 1, so each random byte maps
-- to a symbol with no modulo bias.
create function private.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    code := '';
    for i in 0..5 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
  end loop;
  return code;
end;
$$;

create function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if (select count(*) from public.group_members gm where gm.user_id = v_uid) >= 10 then
    raise exception 'too_many_groups';
  end if;

  insert into public.groups (name, invite_code, owner_id)
  values (btrim(p_name), private.generate_invite_code(), v_uid)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_uid, 'owner');

  return v_group_id;
end;
$$;

create function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Lock the group row so two people cannot both take the tenth seat.
  select g.id into v_group_id
  from public.groups g
  where g.invite_code = upper(btrim(p_code))
  for update;

  if v_group_id is null then
    raise exception 'invalid_code';
  end if;
  if exists (
    select 1 from public.group_members gm
    where gm.group_id = v_group_id and gm.user_id = v_uid
  ) then
    return v_group_id;
  end if;
  if (select count(*) from public.group_members gm where gm.group_id = v_group_id) >= 10 then
    raise exception 'group_full';
  end if;
  if (select count(*) from public.group_members gm where gm.user_id = v_uid) >= 10 then
    raise exception 'too_many_groups';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_uid, 'member');

  return v_group_id;
end;
$$;

-- Lets the invite page show which group a code belongs to before joining.
create function public.group_preview(p_code text)
returns table (id uuid, name text, member_count integer, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    (select count(*)::integer from public.group_members gm where gm.group_id = g.id),
    exists (
      select 1 from public.group_members gm
      where gm.group_id = g.id and gm.user_id = (select auth.uid())
    )
  from public.groups g
  where g.invite_code = upper(btrim(p_code)) and (select auth.uid()) is not null;
$$;

create function public.regenerate_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.is_group_owner(p_group_id) then
    raise exception 'not_owner';
  end if;
  v_code := private.generate_invite_code();
  update public.groups set invite_code = v_code where id = p_group_id;
  return v_code;
end;
$$;

-- Who has started or finished which skill today. Exposes timestamps only, so
-- the board can show progress without revealing anyone's answers.
create function public.daily_set_progress(p_daily_set_id uuid)
returns table (user_id uuid, skill public.skill, started_at timestamptz, submitted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.skill, a.started_at, a.submitted_at
  from public.attempts a
  join public.daily_sets ds on ds.id = a.daily_set_id
  where a.daily_set_id = p_daily_set_id and private.is_group_member(ds.group_id);
$$;

-- ---------------------------------------------------------------------------
-- Band views. security_invoker keeps them under the caller's RLS.
-- ---------------------------------------------------------------------------

-- One band per attempt: the auto grade wins, then Claude Pro, then peers.
create view public.daily_skill_bands
with (security_invoker = true) as
select distinct on (a.id)
  a.id as attempt_id,
  a.daily_set_id,
  ds.group_id,
  ds.date,
  a.user_id,
  a.skill,
  g.band,
  g.source
from public.attempts a
join public.daily_sets ds on ds.id = a.daily_set_id
join public.grades g on g.attempt_id = a.id
order by a.id, case g.source when 'auto' then 0 when 'claude-pro' then 1 else 2 end;

create view public.daily_bands
with (security_invoker = true) as
select
  daily_set_id,
  group_id,
  date,
  user_id,
  count(*)::integer as skills_graded,
  public.round_band(avg(band)) as band
from public.daily_skill_bands
group by daily_set_id, group_id, date, user_id;

grant select on public.daily_skill_bands, public.daily_bands to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges: signed-in users only.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.round_band(numeric),
  public.create_group(text),
  public.join_group(text),
  public.group_preview(text),
  public.regenerate_invite_code(uuid),
  public.daily_set_progress(uuid)
to authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public, anon;
