begin;
set local lock_timeout = '5s';

alter table public.student_preferences
  add column housing_type text not null default 'flexible'
  check (housing_type in ('flexible', 'shared', 'private_room', 'dormitory', 'studio'));

create table sublet_private.roommate_requests (
  id bigint generated always as identity primary key,
  sender_id uuid not null references sublet_private.student_accounts(user_id) on delete cascade,
  recipient_id uuid not null references sublet_private.student_accounts(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create unique index roommate_request_pair on sublet_private.roommate_requests
  (least(sender_id, recipient_id), greatest(sender_id, recipient_id));
create index roommate_request_sender on sublet_private.roommate_requests (sender_id, created_at desc);
create index roommate_request_recipient on sublet_private.roommate_requests (recipient_id, created_at desc);

create table sublet_private.roommate_blocks (
  blocker_id uuid not null references sublet_private.student_accounts(user_id) on delete cascade,
  blocked_id uuid not null references sublet_private.student_accounts(user_id) on delete cascade,
  display_label text not null default 'Student',
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index roommate_blocks_reverse on sublet_private.roommate_blocks (blocked_id, blocker_id);

alter table sublet_private.roommate_requests enable row level security;
alter table sublet_private.roommate_blocks enable row level security;
revoke all on sublet_private.roommate_requests, sublet_private.roommate_blocks from public, anon, authenticated;
grant all on sublet_private.roommate_requests, sublet_private.roommate_blocks to service_role;
grant usage, select on sequence sublet_private.roommate_requests_id_seq to service_role;

create function sublet_private.require_student()
returns uuid language plpgsql stable set search_path = ''
as $function$
begin
  if not sublet_private.has_student_access() then
    raise exception using errcode = '42501', message = 'An active, verified university account is required.';
  end if;
  return auth.uid();
end;
$function$;

create function sublet_private.roommate_profile_ready(
  profile public.student_profiles,
  preferences public.student_preferences
)
returns boolean language sql immutable set search_path = ''
as $function$
  select coalesce(
    char_length(btrim(profile.display_name)) between 1 and 60
    and profile.year_of_study between 1 and 4
    and char_length(btrim(profile.bio)) between 10 and 500
    and preferences.budget_min is not null
    and preferences.budget_max > 0
    and preferences.budget_min <= preferences.budget_max
    and preferences.move_in_date is not null
    and preferences.stay_months is not null
    and preferences.sleep_schedule is not null
    and preferences.cleanliness is not null
    and preferences.home_environment is not null
    and preferences.smoking is not null
    and preferences.guests is not null
    and preferences.pets is not null,
    false
  );
$function$;

create view sublet_private.roommate_directory as
select p.user_id, p.display_name, p.major, p.year_of_study, p.bio,
       d.university, p.updated_at, r as preferences
from public.student_profiles p
join public.student_preferences r on r.user_id = p.user_id
join sublet_private.student_accounts a on a.user_id = p.user_id
join auth.users u on u.id = p.user_id
join sublet_private.university_domains d on d.domain = lower(split_part(u.email, '@', 2))
where p.matching_enabled
  and sublet_private.roommate_profile_ready(p, r)
  and a.status = 'active'
  and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous, false)
  and (u.banned_until is null or u.banned_until <= now())
  and array_length(string_to_array(u.email, '@'), 1) = 2;
revoke all on sublet_private.roommate_directory from public, anon, authenticated;

create function sublet_private.roommate_pair_visible(first_id uuid, second_id uuid)
returns boolean language sql stable set search_path = ''
as $function$
  select first_id <> second_id
    and exists (select 1 from sublet_private.roommate_directory where user_id = first_id)
    and exists (select 1 from sublet_private.roommate_directory where user_id = second_id)
    and not exists (
      select 1 from sublet_private.roommate_blocks b
      where (b.blocker_id = first_id and b.blocked_id = second_id)
         or (b.blocker_id = second_id and b.blocked_id = first_id)
    );
$function$;

create function sublet_private.roommate_score(
  first_preferences public.student_preferences,
  second_preferences public.student_preferences
)
returns jsonb language plpgsql immutable set search_path = ''
as $function$
declare
  first_values jsonb := to_jsonb(first_preferences);
  second_values jsonb := to_jsonb(second_preferences);
  factor record;
  left_value text;
  right_value text;
  similarity numeric;
  day_gap integer;
  overlap_amount numeric;
  narrower_range numeric;
  points numeric := 0;
  compared_weight integer := 0;
  explanation text;
  factors jsonb := '[]'::jsonb;
begin
  for factor in select * from (values
    ('budget', 'Monthly budget', 25),
    ('move_in_date', 'Move-in date', 15),
    ('stay_months', 'Length of stay', 10),
    ('sleep_schedule', 'Sleep schedule', 10),
    ('cleanliness', 'Cleanliness', 10),
    ('home_environment', 'Home environment', 10),
    ('smoking', 'Smoking', 10),
    ('guests', 'Guests', 5),
    ('pets', 'Pets', 5)
  ) as weights(field_name, label, weight)
  loop
    similarity := null;
    left_value := first_values->>factor.field_name;
    right_value := second_values->>factor.field_name;
    explanation := 'Not compared because an answer is missing or undisclosed.';

    if factor.field_name = 'budget' then
      if first_preferences.budget_min is not null and first_preferences.budget_max is not null
         and second_preferences.budget_min is not null and second_preferences.budget_max is not null then
        overlap_amount := least(first_preferences.budget_max, second_preferences.budget_max)
          - greatest(first_preferences.budget_min, second_preferences.budget_min);
        narrower_range := least(first_preferences.budget_max - first_preferences.budget_min,
          second_preferences.budget_max - second_preferences.budget_min);
        similarity := case when overlap_amount < 0 then 0
                           when narrower_range = 0 then 1
                           else overlap_amount / narrower_range end;
        explanation := case when overlap_amount < 0 then 'Your budget ranges do not overlap.'
          else 'Compares the shared portion of the narrower budget range.' end;
      end if;
    elsif left_value is not null and right_value is not null
      and left_value <> 'prefer_not_to_say' and right_value <> 'prefer_not_to_say' then
      case factor.field_name
        when 'move_in_date' then
          day_gap := abs(first_preferences.move_in_date - second_preferences.move_in_date);
          similarity := case when day_gap <= 7 then 1 when day_gap >= 30 then 0 else (30 - day_gap)::numeric / 23 end;
          explanation := format('Your move-in dates are %s days apart.', day_gap);
        when 'stay_months' then
          similarity := least(first_preferences.stay_months, second_preferences.stay_months)::numeric
            / greatest(first_preferences.stay_months, second_preferences.stay_months);
          explanation := 'Compares your planned lengths of stay.';
        when 'sleep_schedule' then
          similarity := case when left_value = right_value or 'flexible' in (left_value, right_value) then 1 else 0 end;
          explanation := case when similarity = 1 then 'Your schedules agree or one of you is flexible.' else 'One of you prefers early nights and the other prefers late nights.' end;
        when 'cleanliness' then
          similarity := case when left_value = right_value then 1 when 'moderate' in (left_value, right_value) then 0.5 else 0 end;
          explanation := 'Compares your usual cleanliness preferences.';
        when 'home_environment' then
          similarity := case when left_value = right_value then 1 when 'balanced' in (left_value, right_value) then 0.5 else 0 end;
          explanation := 'Compares quiet, balanced and social home preferences.';
        when 'smoking' then
          similarity := case when left_value = right_value then 1 else 0 end;
          explanation := case when similarity = 1 then 'Your smoking preferences agree.' else 'Your smoking preferences differ. Discuss this before sharing a home.' end;
        when 'guests' then
          similarity := case when left_value = right_value then 1 when 'sometimes' in (left_value, right_value) then 0.5 else 0 end;
          explanation := 'Compares how often you usually have guests.';
        when 'pets' then
          similarity := case when 'no_pets' in (left_value, right_value) and 'has_pet' in (left_value, right_value) then 0 else 1 end;
          explanation := case when similarity = 1 then 'Your pet preferences can work together.' else 'One of you has a pet and the other prefers no pets.' end;
      end case;
    end if;

    if similarity is not null then
      similarity := greatest(0, least(1, similarity));
      points := points + similarity * factor.weight;
      compared_weight := compared_weight + factor.weight;
    end if;
    factors := factors || jsonb_build_array(jsonb_build_object(
      'key', factor.field_name, 'label', factor.label, 'weight', factor.weight,
      'score', case when similarity is null then null else round(similarity * 100)::integer end,
      'explanation', explanation
    ));
  end loop;
  return jsonb_build_object(
    'score', case when compared_weight = 0 then null else round(points * 100 / compared_weight)::integer end,
    'coverage', compared_weight,
    'factors', factors
  );
end;
$function$;

create function public.save_roommate_profile(
  p_profile jsonb,
  p_preferences jsonb,
  p_publish boolean,
  p_expected_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  current_id uuid := sublet_private.require_student();
  profile public.student_profiles;
  preferences public.student_preferences;
begin
  if jsonb_typeof(p_profile) is distinct from 'object'
     or jsonb_typeof(p_preferences) is distinct from 'object' or p_publish is null then
    raise exception using errcode = '22023', message = 'Check your profile details.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_profile) k where k not in ('display_name', 'major', 'year_of_study', 'bio'))
    or exists (select 1 from jsonb_object_keys(p_preferences) k where k not in (
      'budget_min', 'budget_max', 'move_in_date', 'stay_months', 'preferred_area', 'housing_type',
      'sleep_schedule', 'cleanliness', 'home_environment', 'smoking', 'guests', 'pets'
    )) then
    raise exception using errcode = '22023', message = 'Check your profile details.';
  end if;

  select * into strict profile from public.student_profiles where user_id = current_id for update;
  if p_expected_updated_at is null or profile.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Your profile changed in another tab. Reload it before saving.';
  end if;
  select * into strict preferences from public.student_preferences where user_id = current_id for update;
  profile := jsonb_populate_record(profile, p_profile);
  preferences := jsonb_populate_record(preferences, p_preferences);
  profile.display_name := btrim(profile.display_name);
  profile.major := btrim(profile.major);
  profile.bio := btrim(profile.bio);
  preferences.preferred_area := btrim(preferences.preferred_area);
  if profile.year_of_study is not null and profile.year_of_study not between 1 and 4 then
    raise exception using errcode = '22023', message = 'Choose a year from 1 to 4.';
  end if;
  if p_publish and not sublet_private.roommate_profile_ready(profile, preferences) then
    raise exception using errcode = '22023', message = 'Complete your introduction, year, budget, dates and lifestyle before publishing.';
  end if;

  update public.student_profiles set
    display_name = profile.display_name, major = profile.major,
    year_of_study = profile.year_of_study, bio = profile.bio, matching_enabled = p_publish
  where user_id = current_id returning * into profile;
  update public.student_preferences set
    budget_min = preferences.budget_min, budget_max = preferences.budget_max,
    move_in_date = preferences.move_in_date, stay_months = preferences.stay_months,
    preferred_area = preferences.preferred_area, housing_type = preferences.housing_type,
    sleep_schedule = preferences.sleep_schedule, cleanliness = preferences.cleanliness,
    home_environment = preferences.home_environment, smoking = preferences.smoking,
    guests = preferences.guests, pets = preferences.pets
  where user_id = current_id;
  return jsonb_build_object('updated_at', profile.updated_at, 'matching_enabled', profile.matching_enabled);
end;
$function$;

revoke update (matching_enabled) on public.student_profiles from authenticated;

create function public.set_roommate_visibility(p_visible boolean)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  current_id uuid := sublet_private.require_student();
  profile public.student_profiles;
  preferences public.student_preferences;
begin
  if p_visible is null then raise exception using errcode = '22023', message = 'Choose a visibility setting.'; end if;
  select * into strict profile from public.student_profiles where user_id = current_id for update;
  select * into strict preferences from public.student_preferences where user_id = current_id;
  if p_visible and not sublet_private.roommate_profile_ready(profile, preferences) then
    raise exception using errcode = '22023', message = 'Complete your profile before publishing.';
  end if;
  update public.student_profiles set matching_enabled = p_visible where user_id = current_id;
end;
$function$;

create function public.find_roommates(
  p_university text default null,
  p_area text default null,
  p_housing_type text default null,
  p_min_score integer default 0,
  p_overlap_only boolean default true,
  p_limit integer default 21,
  p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  current_id uuid := sublet_private.require_student();
  result jsonb;
begin
  if not exists (select 1 from sublet_private.roommate_directory where user_id = current_id) then
    raise exception using errcode = '42501', message = 'Publish your roommate profile to browse matches.';
  end if;
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000
     or p_min_score is null or p_min_score not between 0 and 100 or p_overlap_only is null
     or (p_housing_type is not null and p_housing_type not in ('flexible', 'shared', 'private_room', 'dormitory', 'studio')) then
    raise exception using errcode = '22023', message = 'Check your search filters.';
  end if;

  select coalesce(jsonb_agg(found.card order by found.score desc, found.coverage desc, found.user_id), '[]'::jsonb) into result
  from (
    select candidate.user_id, (comparison.result->>'score')::integer as score,
      (comparison.result->>'coverage')::integer as coverage,
      jsonb_build_object(
        'user_id', candidate.user_id, 'display_name', candidate.display_name,
        'university', candidate.university, 'major', candidate.major,
        'year_of_study', candidate.year_of_study, 'bio', candidate.bio,
        'budget_min', (candidate.preferences).budget_min, 'budget_max', (candidate.preferences).budget_max,
        'move_in_date', (candidate.preferences).move_in_date, 'stay_months', (candidate.preferences).stay_months,
        'preferred_area', (candidate.preferences).preferred_area, 'housing_type', (candidate.preferences).housing_type,
        'sleep_schedule', (candidate.preferences).sleep_schedule, 'cleanliness', (candidate.preferences).cleanliness,
        'home_environment', (candidate.preferences).home_environment, 'smoking', (candidate.preferences).smoking,
        'guests', (candidate.preferences).guests, 'pets', (candidate.preferences).pets,
        'comparison', comparison.result,
        'request_id', request.id::text, 'request_status', request.status,
        'request_direction', case when request.sender_id = current_id then 'outgoing' when request.recipient_id = current_id then 'incoming' else null end
      ) as card
    from sublet_private.roommate_directory viewer
    cross join sublet_private.roommate_directory candidate
    cross join lateral (select sublet_private.roommate_score(viewer.preferences, candidate.preferences) as result) comparison
    left join sublet_private.roommate_requests request
      on least(request.sender_id, request.recipient_id) = least(current_id, candidate.user_id)
     and greatest(request.sender_id, request.recipient_id) = greatest(current_id, candidate.user_id)
    where viewer.user_id = current_id and candidate.user_id <> current_id
      and (p_university is null or candidate.university = p_university)
      and (p_area is null or lower((candidate.preferences).preferred_area) = lower(p_area))
      and (p_housing_type is null or (candidate.preferences).housing_type in ('flexible', p_housing_type))
      and (not p_overlap_only or greatest((viewer.preferences).budget_min, (candidate.preferences).budget_min)
        <= least((viewer.preferences).budget_max, (candidate.preferences).budget_max))
      and (comparison.result->>'score')::integer >= p_min_score
      and not exists (select 1 from sublet_private.roommate_blocks b
        where (b.blocker_id = current_id and b.blocked_id = candidate.user_id)
           or (b.blocker_id = candidate.user_id and b.blocked_id = current_id))
    order by score desc, coverage desc, candidate.user_id
    limit p_limit offset p_offset
  ) found;
  return result;
end;
$function$;

create function public.send_roommate_request(p_recipient uuid)
returns text language plpgsql security definer set search_path = ''
as $function$
declare
  current_id uuid := sublet_private.require_student();
  existing_id bigint;
begin
  if p_recipient is null or p_recipient = current_id then
    raise exception using errcode = '22023', message = 'Choose another student.';
  end if;
  perform 1 from sublet_private.student_accounts where user_id = current_id for update;
  perform pg_advisory_xact_lock(hashtextextended(least(current_id, p_recipient)::text || greatest(current_id, p_recipient)::text, 0));
  if not sublet_private.roommate_pair_visible(current_id, p_recipient) then
    raise exception using errcode = '42501', message = 'This profile is not available for a request.';
  end if;
  select id into existing_id from sublet_private.roommate_requests
    where least(sender_id, recipient_id) = least(current_id, p_recipient)
      and greatest(sender_id, recipient_id) = greatest(current_id, p_recipient);
  if existing_id is not null then return existing_id::text; end if;
  if (select count(*) from sublet_private.roommate_requests where sender_id = current_id and created_at > now() - interval '1 day') >= 20 then
    raise exception using errcode = 'P0001', message = 'You have reached today’s request limit. Try again tomorrow.';
  end if;
  insert into sublet_private.roommate_requests (sender_id, recipient_id)
    values (current_id, p_recipient) returning id into existing_id;
  return existing_id::text;
end;
$function$;

create function public.respond_roommate_request(p_request_id bigint, p_action text)
returns text language plpgsql security definer set search_path = ''
as $function$
declare
  current_id uuid := sublet_private.require_student();
  request sublet_private.roommate_requests;
  next_status text;
begin
  select * into request from sublet_private.roommate_requests
    where id = p_request_id and current_id in (sender_id, recipient_id);
  if not found then raise exception using errcode = '42501', message = 'This request is not available.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(request.sender_id, request.recipient_id)::text || greatest(request.sender_id, request.recipient_id)::text, 0));
  select * into strict request from sublet_private.roommate_requests where id = p_request_id for update;

  if p_action = 'accept' and request.status = 'pending' and current_id = request.recipient_id then
    if not sublet_private.roommate_pair_visible(request.sender_id, request.recipient_id) then
      raise exception using errcode = '42501', message = 'Both profiles must be visible to accept this request.';
    end if;
    next_status := 'accepted';
  elsif p_action = 'decline' and request.status = 'pending' and current_id = request.recipient_id then
    next_status := 'declined';
  elsif p_action = 'cancel' and request.status = 'pending' and current_id = request.sender_id then
    next_status := 'cancelled';
  elsif p_action = 'disconnect' and request.status = 'accepted' then
    next_status := 'cancelled';
  else
    raise exception using errcode = '22023', message = 'This request has changed. Refresh your requests.';
  end if;
  update sublet_private.roommate_requests set status = next_status, updated_at = now() where id = p_request_id;
  return next_status;
end;
$function$;

create function public.my_roommate_requests()
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  current_id uuid := sublet_private.require_student();
  result jsonb;
begin
  select coalesce(jsonb_agg(row.card order by row.updated_at desc, row.id desc), '[]'::jsonb) into result
  from (
    select request.id, request.updated_at,
      jsonb_build_object(
        'id', request.id::text, 'status', request.status,
        'direction', case when request.sender_id = current_id then 'outgoing' else 'incoming' end,
        'other_user_id', other.user_id, 'display_name', coalesce(directory.display_name, 'Unavailable profile'),
        'university', directory.university, 'created_at', request.created_at,
        'available', sublet_private.roommate_pair_visible(current_id, other.user_id),
        'contact_email', case when request.status = 'accepted'
          and sublet_private.roommate_pair_visible(current_id, other.user_id) then auth_user.email else null end
      ) as card
    from sublet_private.roommate_requests request
    cross join lateral (select case when request.sender_id = current_id then request.recipient_id else request.sender_id end as user_id) other
    left join sublet_private.roommate_directory directory on directory.user_id = other.user_id
    left join auth.users auth_user on auth_user.id = other.user_id
    where current_id in (request.sender_id, request.recipient_id)
      and not exists (select 1 from sublet_private.roommate_blocks b
        where (b.blocker_id = current_id and b.blocked_id = other.user_id)
           or (b.blocker_id = other.user_id and b.blocked_id = current_id))
    order by request.updated_at desc, request.id desc limit 100
  ) row;
  return result;
end;
$function$;

create function public.set_roommate_block(p_other uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  current_id uuid := sublet_private.require_student();
  label text := 'Student';
begin
  if p_other is null or p_other = current_id or p_blocked is null then
    raise exception using errcode = '22023', message = 'Choose another student.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least(current_id, p_other)::text || greatest(current_id, p_other)::text, 0));
  if p_blocked then
    if not exists (select 1 from sublet_private.student_accounts where user_id = p_other) then
      raise exception using errcode = '22023', message = 'This profile is not available.';
    end if;
    if sublet_private.roommate_pair_visible(current_id, p_other) then
      select display_name into label from sublet_private.roommate_directory where user_id = p_other;
    end if;
    insert into sublet_private.roommate_blocks (blocker_id, blocked_id, display_label)
      values (current_id, p_other, coalesce(label, 'Student')) on conflict do nothing;
    update sublet_private.roommate_requests set status = 'cancelled', updated_at = now()
      where least(sender_id, recipient_id) = least(current_id, p_other)
        and greatest(sender_id, recipient_id) = greatest(current_id, p_other)
        and status in ('pending', 'accepted');
  else
    delete from sublet_private.roommate_blocks where blocker_id = current_id and blocked_id = p_other;
  end if;
end;
$function$;

create function public.my_roommate_blocks()
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare current_id uuid := sublet_private.require_student();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id', blocked_id,
    'display_name', display_label) order by created_at desc), '[]'::jsonb)
    from sublet_private.roommate_blocks where blocker_id = current_id);
end;
$function$;

revoke all on function sublet_private.require_student() from public, anon, authenticated;
revoke all on function sublet_private.roommate_profile_ready(public.student_profiles, public.student_preferences) from public, anon, authenticated;
revoke all on function sublet_private.roommate_pair_visible(uuid, uuid) from public, anon, authenticated;
revoke all on function sublet_private.roommate_score(public.student_preferences, public.student_preferences) from public, anon, authenticated;

revoke all on function public.save_roommate_profile(jsonb, jsonb, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.set_roommate_visibility(boolean) from public, anon, authenticated;
revoke all on function public.find_roommates(text, text, text, integer, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.send_roommate_request(uuid) from public, anon, authenticated;
revoke all on function public.respond_roommate_request(bigint, text) from public, anon, authenticated;
revoke all on function public.my_roommate_requests() from public, anon, authenticated;
revoke all on function public.set_roommate_block(uuid, boolean) from public, anon, authenticated;
revoke all on function public.my_roommate_blocks() from public, anon, authenticated;

grant execute on function public.save_roommate_profile(jsonb, jsonb, boolean, timestamptz) to authenticated;
grant execute on function public.set_roommate_visibility(boolean) to authenticated;
grant execute on function public.find_roommates(text, text, text, integer, boolean, integer, integer) to authenticated;
grant execute on function public.send_roommate_request(uuid) to authenticated;
grant execute on function public.respond_roommate_request(bigint, text) to authenticated;
grant execute on function public.my_roommate_requests() to authenticated;
grant execute on function public.set_roommate_block(uuid, boolean) to authenticated;
grant execute on function public.my_roommate_blocks() to authenticated;

notify pgrst, 'reload schema';
commit;
