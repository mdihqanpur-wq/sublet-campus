begin;
set local lock_timeout = '5s';

create function public.student_signup_check(event jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  address text := lower(coalesce(event->'user'->>'email', ''));
  local_part text := split_part(address, '@', 1);
begin
  if char_length(address) > 254
     or array_length(string_to_array(address, '@'), 1) <> 2
     or char_length(local_part) not between 1 and 64
     or local_part !~ $email$^[a-z0-9!#$%&'*+/=?^_`{|}~.\-]+$$email$
     or local_part like '.%' or local_part like '%.' or local_part like '%..%'
     or coalesce(event->'user'->>'is_anonymous', 'false') <> 'false'
     or not exists (
       select 1 from sublet_private.university_domains d
       where d.domain = split_part(address, '@', 2)
     ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Use an email from a supported university.'
    ));
  end if;
  return '{}'::jsonb;
end;
$function$;
revoke all on function public.student_signup_check(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.student_signup_check(jsonb) to supabase_auth_admin;

notify pgrst, 'reload schema';
commit;
