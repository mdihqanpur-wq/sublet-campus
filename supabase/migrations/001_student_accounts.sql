begin;
set local lock_timeout = '5s';

create schema sublet_private;
revoke all on schema sublet_private from public, anon, authenticated;
grant usage on schema sublet_private to authenticated, service_role;

create table sublet_private.university_domains (
  domain text primary key,
  university text not null
);

insert into sublet_private.university_domains (domain, university) values
  ('almau.edu.kz', 'AlmaU'),
  ('kimep.kz', 'KIMEP'),
  ('kaznu.kz', 'KazNU'),
  ('kaznu.edu.kz', 'KazNU'),
  ('satbayev.university', 'Satbayev'),
  ('narxoz.kz', 'Narxoz'),
  ('iitu.edu.kz', 'IITU');

create table sublet_private.student_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student'
    check (role in ('student', 'moderator', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now()
);

revoke all on all tables in schema sublet_private from public, anon, authenticated;
grant all on all tables in schema sublet_private to service_role;
alter table sublet_private.university_domains enable row level security;
alter table sublet_private.student_accounts enable row level security;

create table public.student_profiles (
  user_id uuid primary key
    references sublet_private.student_accounts(user_id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  display_name text not null default '' check (char_length(display_name) <= 60),
  major text not null default '' check (char_length(major) <= 100),
  year_of_study smallint check (year_of_study between 1 and 10),
  bio text not null default '' check (char_length(bio) <= 500),
  matching_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_contacts (
  user_id uuid primary key
    references sublet_private.student_accounts(user_id) on delete cascade,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  alternate_email text check (
    alternate_email is null or (
      char_length(alternate_email) <= 254
      and alternate_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  updated_at timestamptz not null default now()
);

create table public.student_preferences (
  user_id uuid primary key
    references sublet_private.student_accounts(user_id) on delete cascade,
  budget_min integer check (budget_min between 0 and 100000000),
  budget_max integer check (budget_max between 0 and 100000000),
  move_in_date date,
  stay_months smallint check (stay_months between 1 and 60),
  preferred_area text not null default '' check (char_length(preferred_area) <= 100),
  sleep_schedule text check (sleep_schedule in ('early', 'late', 'flexible')),
  cleanliness text check (cleanliness in ('very_tidy', 'moderate', 'relaxed')),
  home_environment text check (home_environment in ('quiet', 'balanced', 'social')),
  smoking text check (smoking in ('non_smoker', 'smoker', 'prefer_not_to_say')),
  guests text check (guests in ('rarely', 'sometimes', 'often')),
  pets text check (pets in ('no_pets', 'pets_welcome', 'has_pet', 'prefer_not_to_say')),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);

create function sublet_private.has_student_access()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from sublet_private.student_accounts a
    join auth.users u on u.id = a.user_id
    join sublet_private.university_domains d
      on d.domain = lower(split_part(u.email, '@', 2))
    where a.user_id = auth.uid()
      and a.status = 'active'
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
      and array_length(string_to_array(u.email, '@'), 1) = 2
  );
$$;
revoke all on function sublet_private.has_student_access() from public, anon, authenticated;
grant execute on function sublet_private.has_student_access() to authenticated;

create function sublet_private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function sublet_private.touch_updated_at() from public, anon, authenticated;

create trigger student_profiles_updated_at before update on public.student_profiles
for each row execute function sublet_private.touch_updated_at();
create trigger student_contacts_updated_at before update on public.student_contacts
for each row execute function sublet_private.touch_updated_at();
create trigger student_preferences_updated_at before update on public.student_preferences
for each row execute function sublet_private.touch_updated_at();

alter table public.student_profiles enable row level security;
alter table public.student_contacts enable row level security;
alter table public.student_preferences enable row level security;

revoke all on public.student_profiles, public.student_contacts, public.student_preferences
from public, anon, authenticated;
grant select on public.student_profiles, public.student_contacts, public.student_preferences
to authenticated;
grant update (first_name, last_name, display_name, major, year_of_study, bio, matching_enabled)
on public.student_profiles to authenticated;
grant update (phone, alternate_email) on public.student_contacts to authenticated;
grant update (
  budget_min, budget_max, move_in_date, stay_months, preferred_area,
  sleep_schedule, cleanliness, home_environment, smoking, guests, pets
) on public.student_preferences to authenticated;
grant all on public.student_profiles, public.student_contacts, public.student_preferences
to service_role;

create policy student_profiles_read_own on public.student_profiles
for select to authenticated using (
  user_id = (select auth.uid()) and (select sublet_private.has_student_access())
);
create policy student_profiles_update_own on public.student_profiles
for update to authenticated
using (user_id = (select auth.uid()) and (select sublet_private.has_student_access()))
with check (user_id = (select auth.uid()) and (select sublet_private.has_student_access()));

create policy student_contacts_read_own on public.student_contacts
for select to authenticated using (
  user_id = (select auth.uid()) and (select sublet_private.has_student_access())
);
create policy student_contacts_update_own on public.student_contacts
for update to authenticated
using (user_id = (select auth.uid()) and (select sublet_private.has_student_access()))
with check (user_id = (select auth.uid()) and (select sublet_private.has_student_access()));

create policy student_preferences_read_own on public.student_preferences
for select to authenticated using (
  user_id = (select auth.uid()) and (select sublet_private.has_student_access())
);
create policy student_preferences_update_own on public.student_preferences
for update to authenticated
using (user_id = (select auth.uid()) and (select sublet_private.has_student_access()))
with check (user_id = (select auth.uid()) and (select sublet_private.has_student_access()));

create function public.initialize_student_account()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  current_id uuid := auth.uid();
begin
  if current_id is null then
    raise exception using errcode = '42501', message = 'Sign in to continue.';
  end if;

  if not exists (
    select 1 from auth.users u
    join sublet_private.university_domains d
      on d.domain = lower(split_part(u.email, '@', 2))
    where u.id = current_id
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
      and array_length(string_to_array(u.email, '@'), 1) = 2
  ) then
    raise exception using errcode = '42501',
      message = 'Verify a supported university email to continue.';
  end if;

  insert into sublet_private.student_accounts (user_id)
  values (current_id) on conflict (user_id) do nothing;

  if not sublet_private.has_student_access() then
    raise exception using errcode = '42501', message = 'This account is not active.';
  end if;

  insert into public.student_profiles (user_id)
  values (current_id) on conflict (user_id) do nothing;
  insert into public.student_contacts (user_id)
  values (current_id) on conflict (user_id) do nothing;
  insert into public.student_preferences (user_id)
  values (current_id) on conflict (user_id) do nothing;
  return current_id;
end;
$$;
revoke all on function public.initialize_student_account() from public, anon, authenticated;
grant execute on function public.initialize_student_account() to authenticated;

create function public.my_student_account()
returns table (
  user_id uuid,
  university text,
  role text,
  status text,
  has_access boolean
)
language sql stable security definer set search_path = ''
as $$
  select a.user_id, d.university, a.role, a.status,
    sublet_private.has_student_access()
  from sublet_private.student_accounts a
  join auth.users u on u.id = a.user_id
  left join sublet_private.university_domains d
    on d.domain = lower(split_part(u.email, '@', 2))
  where a.user_id = auth.uid();
$$;
revoke all on function public.my_student_account() from public, anon, authenticated;
grant execute on function public.my_student_account() to authenticated;

commit;
