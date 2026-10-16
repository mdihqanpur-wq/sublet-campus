begin;
set local lock_timeout = '5s';

alter table public.listing enable row level security;
revoke all on public.listing from public, anon;
grant select on public.listing to authenticated;
drop policy listing_select_approved on public.listing;
create policy listing_select_approved on public.listing
for select to authenticated using (status = 'approved');
create policy listing_student_guard on public.listing as restrictive
for select to authenticated using (
  status = 'approved' and (select sublet_private.has_student_access())
);

notify pgrst, 'reload schema';
commit;
