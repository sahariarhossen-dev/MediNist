
create or replace function public.search_master_medicines(
  _query text,
  _companies text[] default null,
  _limit int default 200
)
returns setof public.master_medicines
language sql
stable
security invoker
set search_path = public
as $$
  with norm as (
    select regexp_replace(lower(coalesce(_query, '')), '[^a-z0-9]', '', 'g') as q
  )
  select m.*
  from public.master_medicines m, norm
  where (_companies is null or m.company = any(_companies))
    and (
      norm.q = ''
      or regexp_replace(lower(m.brand_name), '[^a-z0-9]', '', 'g') like '%' || norm.q || '%'
      or regexp_replace(lower(coalesce(m.generic_name, '')), '[^a-z0-9]', '', 'g') like '%' || norm.q || '%'
      or regexp_replace(lower(coalesce(m.company, '')), '[^a-z0-9]', '', 'g') like '%' || norm.q || '%'
    )
  order by
    case
      when regexp_replace(lower(m.brand_name), '[^a-z0-9]', '', 'g')
           like (select q from norm) || '%'
      then 0 else 1
    end,
    m.brand_name
  limit _limit;
$$;

grant execute on function public.search_master_medicines(text, text[], int) to authenticated;
