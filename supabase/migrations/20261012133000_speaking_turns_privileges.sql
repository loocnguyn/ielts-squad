-- New tables pick up Supabase's default grants. Like every other table here,
-- speaking_turns is read-only for members and written only by definer functions.
revoke all on public.speaking_turns from anon, authenticated;
grant select on public.speaking_turns to authenticated;
grant all on public.speaking_turns to service_role;
