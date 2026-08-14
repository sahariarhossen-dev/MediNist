create or replace function public.truncate_master_import()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.master_medicines_import;
end;
$$;

revoke all on function public.truncate_master_import() from public, anon, authenticated;
grant execute on function public.truncate_master_import() to service_role;