create table public.medex_cache (
  name_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.medex_cache enable row level security;
-- No policies: only the service role (edge function) accesses this table.
create index medex_cache_fetched_at_idx on public.medex_cache (fetched_at desc);