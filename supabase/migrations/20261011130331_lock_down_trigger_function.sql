-- The profile bootstrap only ever runs as a trigger; nobody calls it over the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
