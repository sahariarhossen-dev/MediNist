create or replace function public.get_pharmacy_member_directory()
returns table(id uuid, full_name text, avatar_url text, role text, phone text, last_seen timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url, p.role, p.phone, p.last_seen
  from public.profiles p
  where p.pharmacy_id = public.get_user_pharmacy_id();
$$;

grant execute on function public.get_pharmacy_member_directory() to authenticated;